"""Pack a PS4 game folder (CUSAxxxxx) into a ShadowMountPlus ``.ffpfsc`` image.

Layout produced (the one SadykovIV/PS4pkg_to_ffpfsc builds and documents)::

    juego.ffpfsc               outer PFS, PS5 profile, 32-bit inodes,
    └── CUSAxxxxx.exfat        case-insensitive, PFSC (zlib) 64 KiB blocks
        ├── eboot.bin          inner exFAT: the game root, no CUSAxxxxx/ folder
        ├── sce_sys/param.sfo  (unchanged)
        ├── sce_sys/param.json (added for ShadowMountPlus)
        └── ...

Steps:
1. Validate the dump (eboot.bin, sce_sys/param.sfo, 9-char TITLE_ID).
2. Stage a mirror of the game with *hard links* (no extra disk space, the
   source folder is never modified) and add sce_sys/param.json.  If hard
   links are impossible (other drive, FAT32...), files are copied.
3. ``mkpfs pack folder`` streams the staged tree into an exFAT and compresses
   it into the PFSC container in one pass (zlib, parallel).
4. Verify: ``mkpfs verify`` (structure + checksums) and a deep unpack of
   eboot.bin / param.sfo / param.json compared with the source.  ``full``
   unpacks everything and compares every file (needs free space).
5. Write ``.manifest.json`` and ``.shadowmount.txt`` next to the image.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from typing import Callable, List, Optional

from . import __version__
from .mkpfs_runner import MkpfsError, find_mkpfs, mkpfs_version, run_mkpfs
from .packer import resolve_output, scan_tree
from .sfo import find_game_root, read_game_info, valid_title_id
from .shadowmount import build_param_json, pick_title, validate_param_json

EXT = ".ffpfsc"
STAGE_MARKER = ".ps4forge-stage"
REQUIRED = ("eboot.bin", "sce_sys/param.sfo", "sce_sys/param.json")
OPTIONAL = ("sce_sys/npbind.dat",)
BACKENDS = ("zlib", "auto", "zlib-ng", "isal")

Log = Callable[[str], None]
Progress = Callable[[int, str, str], None]  # (percent, phase, detail)


@dataclass
class FfpfscStats:
    output: str
    manifest_path: str
    shadowmount_path: str
    title_id: str
    title: str
    files: int
    source_bytes: int
    image_bytes: int
    seconds: float
    level: int
    threads: int
    backend: str
    staging: str  # "hardlink" | "copy" | "direct"
    verification: dict = field(default_factory=dict)

    @property
    def ratio(self) -> float:
        return self.image_bytes / self.source_bytes if self.source_bytes else 1.0


class StageError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# Staging
# ---------------------------------------------------------------------------


def _can_hardlink(src_file: str, stage_dir: str) -> bool:
    probe = os.path.join(stage_dir, ".ps4forge-linkprobe")
    try:
        os.link(src_file, probe)
        os.remove(probe)
        return True
    except OSError:
        return False


def _make_stage_dir(candidates: List[str], probe_file: Optional[str], log: Log):
    """Return (stage_dir, can_link).  Prefers a location where hard links
    work (same drive as the game)."""
    made = []
    for base in candidates:
        if not base:
            continue
        try:
            os.makedirs(base, exist_ok=True)
            d = os.path.join(base, f".ps4forge-stage-{uuid.uuid4().hex[:8]}")
            os.mkdir(d)
            open(os.path.join(d, STAGE_MARKER), "w").close()
        except OSError:
            continue
        if probe_file is None or _can_hardlink(probe_file, d):
            for other in made:
                remove_stage(other)
            return d, probe_file is not None
        made.append(d)
    if not made:
        raise StageError("no se pudo crear una carpeta temporal (usa --temp-dir)")
    for other in made[1:]:
        remove_stage(other)
    log("Aviso: no se pueden crear enlaces duros (¿otra unidad o FAT32/exFAT?); "
        "se COPIARÁN los archivos a la carpeta temporal.")
    return made[0], False


def remove_stage(stage_dir: str) -> None:
    """Delete a staging folder we created (only if it carries our marker).
    Removing hard links never touches the original files."""
    if stage_dir and os.path.isfile(os.path.join(stage_dir, STAGE_MARKER)):
        shutil.rmtree(stage_dir, ignore_errors=True)


def stage_game(root: str, scan, param_json: bytes, candidates: List[str], log: Log,
               on_bytes: Optional[Callable[[int], None]] = None):
    """Mirror ``root`` into a staging folder + write sce_sys/param.json.
    Returns (game_dir_inside_stage, stage_dir, mode)."""
    probe = os.path.join(root, *scan.files[0][0].split("/")) if scan.files else None
    stage_dir, can_link = _make_stage_dir(candidates, probe, log)
    game_dir = os.path.join(stage_dir, os.path.basename(root.rstrip("/\\")) or "game")
    mode = "hardlink" if can_link else "copy"
    try:
        if not can_link:
            need = scan.total_bytes + 64 * 2**20
            free = shutil.disk_usage(stage_dir).free
            if free < need:
                raise StageError(
                    f"espacio insuficiente para copiar el juego en {stage_dir}: "
                    f"hacen falta {need / 2**30:.1f} GiB y hay {free / 2**30:.1f} GiB. "
                    "Usa --temp-dir en la misma unidad que el juego.")
        os.mkdir(game_dir)
        for rel, _mtime in scan.dirs:
            os.makedirs(os.path.join(game_dir, *rel.split("/")), exist_ok=True)
        for rel, size, _mtime in scan.files:
            if rel.lower() == "sce_sys/param.json":
                continue  # replaced by the generated one below
            src = os.path.join(root, *rel.split("/"))
            dst = os.path.join(game_dir, *rel.split("/"))
            if can_link:
                os.link(src, dst)
            else:
                shutil.copy2(src, dst)
            if on_bytes:
                on_bytes(size)
        sce_sys = os.path.join(game_dir, "sce_sys")
        os.makedirs(sce_sys, exist_ok=True)
        with open(os.path.join(sce_sys, "param.json"), "wb") as f:
            f.write(param_json)
    except BaseException:
        remove_stage(stage_dir)
        raise
    return game_dir, stage_dir, mode


# ---------------------------------------------------------------------------
# Pack
# ---------------------------------------------------------------------------


def pack_command(mkpfs: List[str], src: str, dst: str, level: int, threads: int,
                 backend: str, temp_dir: str) -> List[str]:
    cmd = [
        *mkpfs, "pack", "folder",
        "--no-adjust-output-file-extension",
        "--version", "PS5",
        "--inode-bits", "32",
        "--case-insensitive",
        "--cpu-count", str(threads),
        "--compression-level", str(level),
        "--require-game-files",
        "--temp-folder", temp_dir,
    ]
    if backend != "auto":
        cmd += ["--compression-backend", backend]
    return [*cmd, src, dst]


def resolve_threads(threads: int) -> int:
    return max(1, os.cpu_count() or 1) if threads is None or threads <= 0 else threads


def pack_ffpfsc(
    input_dir: str,
    output: Optional[str] = None,
    level: int = 9,
    threads: int = -1,
    backend: str = "zlib",
    verify_mode: str = "quick",
    temp_dir: Optional[str] = None,
    mkpfs: Optional[str] = None,
    overwrite: bool = False,
    keep_stage: bool = False,
    progress: Optional[Progress] = None,
    log: Log = print,
    cancel: Optional[Callable[[], bool]] = None,
) -> FfpfscStats:
    if not 0 <= level <= 9:
        raise ValueError("para .ffpfsc el nivel zlib va de 0 a 9")
    if backend not in BACKENDS:
        raise ValueError(f"backend debe ser uno de {BACKENDS}")
    mk = find_mkpfs(mkpfs)
    log(f"Motor: {mkpfs_version(mk)} ({' '.join(mk)})")

    root = find_game_root(input_dir)
    if not os.path.isdir(root):
        raise FileNotFoundError(f"no existe la carpeta: {input_dir}")
    if root != os.path.abspath(input_dir):
        log(f"Raíz del juego detectada: {root}")
    info = read_game_info(root)
    if not info.has_eboot:
        raise ValueError("falta eboot.bin en la raíz del juego (¿es la carpeta correcta?)")
    if not info.sfo:
        raise ValueError("falta o es ilegible sce_sys/param.sfo")
    title_id = info.sfo.get("TITLE_ID")
    if not valid_title_id(title_id):
        raise ValueError(f"TITLE_ID inválido en param.sfo: {title_id!r} "
                         "(ShadowMountPlus necesita 9 caracteres, p. ej. CUSA12345)")
    if not title_id.startswith("CUSA"):
        log(f"Aviso: {title_id} no es un CUSA; ShadowMountPlus se probó con CUSA.")
    title = pick_title(info.sfo)
    if info.category and not str(info.category).startswith("Juego"):
        log(f"Aviso: categoría {info.category}: se esperaba un juego base (gd) "
            "o una carpeta ya fusionada con su parche.")

    out_path = resolve_output(output, info)
    if out_path.endswith(".tar.zst"):
        out_path = out_path[: -len(".tar.zst")]
    if not out_path.lower().endswith(EXT):
        out_path += EXT
    if os.path.realpath(out_path).startswith(os.path.realpath(root) + os.sep):
        raise ValueError("la salida no puede estar dentro de la carpeta del juego")
    if os.path.exists(out_path) and not overwrite:
        raise FileExistsError(f"{out_path} ya existe (usa --overwrite)")
    out_dir = os.path.dirname(out_path)
    os.makedirs(out_dir, exist_ok=True)

    log("Escaneando archivos…")
    scan = scan_tree(root)
    for s in scan.skipped:
        log(f"Omitido: {s}")
    existing = None
    pj = os.path.join(root, "sce_sys", "param.json")
    if os.path.isfile(pj):
        with open(pj, "rb") as f:
            existing = f.read()
    param_json = build_param_json(title_id, info.sfo, existing)
    validate_param_json(param_json, title_id)
    nthreads = resolve_threads(threads)
    log(f"{title_id} · {title} · {len(scan.files)} archivos, "
        f"{scan.total_bytes / 2**30:.2f} GiB · zlib nivel {level} · {nthreads} hilos · "
        f"backend {backend}")

    candidates = [temp_dir, os.path.dirname(root.rstrip('/\\')), out_dir, tempfile.gettempdir()]
    t0 = time.time()
    staged_bytes = 0

    def on_stage_bytes(n):
        nonlocal staged_bytes
        staged_bytes += n
        if progress and scan.total_bytes:
            progress(int(staged_bytes * 100 / scan.total_bytes), "preparar", "")
        if cancel and cancel():
            raise KeyboardInterrupt("cancelado")

    log("Preparando copia temporal con enlaces duros (el original no se modifica)…")
    game_dir, stage_dir, stage_mode = stage_game(root, scan, param_json, candidates, log,
                                                 on_stage_bytes)
    log(f"Copia temporal: {stage_dir} ({'enlaces duros' if stage_mode == 'hardlink' else 'copia'})")

    partial = out_path + ".partial"
    if os.path.exists(partial):
        os.remove(partial)
    mk_temp = temp_dir or out_dir
    ok = False
    try:
        log("Creando imagen .ffpfsc con MkPFS (exFAT interno + PFSC zlib)…")
        run_mkpfs(pack_command(mk, game_dir, partial, level, nthreads, backend, mk_temp),
                  on_progress=progress, on_line=lambda l: log(f"  mkpfs: {l}"), cancel=cancel)
        if not os.path.isfile(partial):
            raise MkpfsError("MkPFS terminó sin crear la imagen")
        verification = {"mode": "none"}
        if verify_mode != "none":
            log("Verificando: cabeceras PFS/PFSC, todos los bloques zlib, exFAT y archivos…")
            verification = verify_ffpfsc(partial, source=game_dir, mode=verify_mode,
                                         mkpfs=mkpfs, log=log, progress=progress,
                                         title_id=title_id, temp_dir=mk_temp,
                                         use_mkpfs=True, threads=nthreads)
            if not verification["ok"]:
                raise MkpfsError("la verificación de la imagen falló: "
                                 + "; ".join(c["detail"] for c in verification["checks"]
                                             if not c["ok"]))
        os.replace(partial, out_path)
        ok = True
    finally:
        if not ok and os.path.exists(partial):
            try:
                os.remove(partial)
            except OSError:
                pass
        if keep_stage:
            log(f"Copia temporal conservada en {stage_dir}")
        else:
            remove_stage(stage_dir)

    seconds = time.time() - t0
    image_bytes = os.path.getsize(out_path)
    stats = FfpfscStats(
        output=out_path, manifest_path=out_path + ".manifest.json",
        shadowmount_path=out_path + ".shadowmount.txt", title_id=title_id, title=title,
        files=len(scan.files), source_bytes=scan.total_bytes, image_bytes=image_bytes,
        seconds=seconds, level=level, threads=nthreads, backend=backend,
        staging=stage_mode, verification=verification,
    )
    _write_sidecars(stats, info, param_json, mk)
    return stats


def _write_sidecars(st: FfpfscStats, info, param_json: bytes, mk: List[str]) -> None:
    try:
        engine = mkpfs_version(mk)
    except Exception:  # noqa: BLE001
        engine = "mkpfs"
    manifest = {
        "schema": "ps4-zstd-forge/ffpfsc",
        "version": 1,
        "tool": f"PS4 ZSTD Forge {__version__}",
        "engine": engine,
        "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "artifact": os.path.basename(st.output),
        "size": st.image_bytes,
        "game": info.as_dict(),
        "layout": {
            "outer": "PFS (perfil PS5, inodos de 32 bits, sin distinguir mayúsculas), "
                     "bloques PFSC zlib de 64 KiB",
            "inner_image": f"{st.title_id}.exfat",
            "inner_root": "raíz del juego (eboot.bin, sce_sys/...), sin carpeta CUSAxxxxx/",
            "added_files": ["sce_sys/param.json"],
        },
        "compression": {"codec": "zlib", "level": st.level, "threads": st.threads,
                        "backend": st.backend},
        "source": {"files": st.files, "bytes": st.source_bytes, "staging": st.staging},
        "param_json": json.loads(param_json.decode("utf-8")),
        "verification": st.verification,
        "static_shadowmount_compatible": bool(st.verification.get("ok")),
        "runtime_verified": False,
    }
    with open(st.manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    name = os.path.basename(st.output)
    with open(st.shadowmount_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(
            f"{st.title_id} - {st.title}\n"
            f"Imagen: {name}\n\n"
            "Cómo usarla con ShadowMountPlus:\n"
            "1. Copia el .ffpfsc a un disco USB/externo de la consola (exFAT).\n"
            "2. Añade la carpeta que lo contiene con scanpath= en la configuración\n"
            "   de ShadowMountPlus, o escribe la ruta completa del archivo en:\n"
            "     /data/shadowmount/manual.lst\n"
            f"   por ejemplo: /mnt/usb0/{name}\n"
            "3. Si no aparece o no arranca, revisa /data/shadowmount/debug.log\n\n"
            "La verificación en PC es estática: no garantiza que el juego arranque.\n"
        )


# ---------------------------------------------------------------------------
# Verify / extract
# ---------------------------------------------------------------------------


def verify_ffpfsc(
    image: str,
    source: Optional[str] = None,
    mode: str = "quick",
    mkpfs: Optional[str] = None,
    log: Log = print,
    progress: Optional[Progress] = None,
    title_id: Optional[str] = None,
    temp_dir: Optional[str] = None,
    use_mkpfs: bool = False,
    threads: int = -1,
) -> dict:
    """Return {"ok": bool, "mode": ..., "checks": [{"name","ok","detail"}]}.

    The native reader (ffpfsc_native) always runs: PFS header, PFSC header,
    every zlib block, exFAT, required files, param.json and comparison with
    ``source``.  With ``use_mkpfs`` MkPFS's own ``verify`` also runs as an
    independent second opinion.  ``source`` may be the original game folder:
    param.json is validated, not compared, since the original has none."""
    from .ffpfsc_native import verify_native

    checks = []
    if use_mkpfs:
        mk = find_mkpfs(mkpfs)
        try:
            out = run_mkpfs([*mk, "verify", image, "--format", "pfs"], on_progress=progress)
            checks.append({"name": "mkpfs verify", "ok": True,
                           "detail": _mkpfs_verify_summary(out)})
        except MkpfsError as e:
            checks.append({"name": "mkpfs verify", "ok": False, "detail": str(e)})
    src_root = find_game_root(source) if source else None
    native = verify_native(image, source=src_root, mode=mode, threads=threads,
                           progress=progress, title_id=title_id)
    checks.extend(native["checks"])
    return {"ok": all(c["ok"] for c in checks), "mode": mode, "checks": checks}


def _mkpfs_verify_summary(out: str) -> str:
    """'Errors: 0 · Warnings: 0 · Data CRC32: 0x…' from MkPFS's report."""
    keep = []
    for line in out.splitlines():
        key, _, val = line.partition(":")
        if key.strip() in ("Errors", "Warnings", "Data CRC32") and val.strip():
            keep.append(f"{key.strip()}: {val.strip()}")
    return " · ".join(keep) or "OK"


def extract_ffpfsc(image: str, dest: str, only: Optional[List[str]] = None,
                   mkpfs: Optional[str] = None, progress: Optional[Progress] = None) -> int:
    """Extract natively (no MkPFS needed).  ``mkpfs`` is accepted for API
    compatibility and ignored."""
    from .ffpfsc_native import extract_native

    return extract_native(image, dest, only=only, progress=progress)


def is_ffpfsc(path: str) -> bool:
    if path.lower().endswith((EXT, ".ffpfs")):
        return True
    try:
        with open(path, "rb") as f:
            head = f.read(16)
    except OSError:
        return False
    return not head.startswith(b"\x28\xb5\x2f\xfd") and head[3:11] != b"EXFAT   " and len(head) == 16
