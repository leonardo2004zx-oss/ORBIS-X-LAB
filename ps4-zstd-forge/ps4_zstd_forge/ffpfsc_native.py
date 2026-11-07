"""Native (pure Python, no MkPFS) verification, listing and extraction of
``.ffpfsc`` images: PFS header -> uroot -> CUSAxxxxx.exfat (PFSC/zlib) ->
exFAT -> game files.  Nothing is decompressed to disk except what you
extract.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Callable, List, Optional

from .exfat_reader import ExfatEntry, ExfatError, ExfatReader
from .pfs_reader import DIRENT_FILE, InodeReader, PfsError, PfsImage
from .sfo import parse_sfo, valid_title_id
from .shadowmount import validate_param_json

REQUIRED = ("eboot.bin", "sce_sys/param.sfo", "sce_sys/param.json")
COMPARE_QUICK = ("eboot.bin", "sce_sys/param.sfo", "sce_sys/npbind.dat")
Progress = Callable[[int, str, str], None]


@dataclass
class OpenedImage:
    pfs: PfsImage
    inner_name: str
    inner: InodeReader
    exfat: ExfatReader

    def close(self):
        self.pfs.close()


def open_ffpfsc(path: str) -> OpenedImage:
    pfs = PfsImage(path)
    try:
        files = [d for d in pfs.root_entries if d.type == DIRENT_FILE]
        exfats = [d for d in files if d.name.lower().endswith(".exfat")]
        if len(pfs.root_entries) != 1 or len(exfats) != 1:
            names = ", ".join(d.name for d in pfs.root_entries) or "(vacío)"
            raise PfsError("un .ffpfsc para ShadowMountPlus debe contener exactamente una "
                           f"imagen .exfat en la raíz; contiene: {names}")
        inner = pfs.open_file(exfats[0].inode)
        return OpenedImage(pfs, exfats[0].name, inner, ExfatReader(inner))
    except Exception:
        pfs.close()
        raise


def _h(n: float) -> str:
    for unit in ("B", "KiB", "MiB", "GiB"):
        if n < 1024 or unit == "GiB":
            return f"{n:.2f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024
    return str(n)


def _sha256_stream(chunks) -> str:
    h = hashlib.sha256()
    for c in chunks:
        h.update(c)
    return h.hexdigest()


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def verify_native(path: str, source: Optional[str] = None, mode: str = "quick",
                  threads: int = -1, progress: Optional[Progress] = None,
                  title_id: Optional[str] = None) -> dict:
    """Checks (each one reported):
    cabecera PFS · contenedor (uroot con una sola .exfat) · cabecera PFSC ·
    bloques zlib (TODOS se descomprimen y se comprueba su tamaño) · exFAT ·
    archivos requeridos · TITLE_ID · param.json · comparación con el origen
    (quick: eboot/param.sfo/npbind; full: SHA-256 de todos los archivos)."""
    checks: List[dict] = []

    def add(name, ok, detail):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    def result():
        return {"ok": bool(checks) and all(c["ok"] for c in checks), "mode": mode,
                "engine": "nativo", "checks": checks}

    try:
        img = open_ffpfsc(path)
    except (PfsError, ExfatError, OSError) as e:
        add("contenedor FFPFSC", False, str(e))
        return result()
    try:
        h = img.pfs.header
        add("cabecera PFS", True,
            f"magic 20130315, perfil {h.profile}, bloque {h.block_size // 1024} KiB, "
            f"{h.inode_count} inodos, {', '.join(h.mode_flags())}")
        if h.version != 2:
            add("perfil PS5", False, f"la imagen usa el perfil {h.profile}; "
                "PS4pkg_to_ffpfsc/ShadowMountPlus usan el perfil PS5")
        expected_inner = f"{title_id}.exfat" if title_id else None
        inner_ok = expected_inner is None or img.inner_name.lower() == expected_inner.lower()
        add("imagen interna", inner_ok,
            f"{img.inner_name}: {_h(img.inner.size)} lógicos, "
            f"{_h(img.inner.ino.stored_size)} guardados"
            + ("" if inner_ok else f" (se esperaba {expected_inner})"))
        if img.inner.compressed:
            add("cabecera PFSC", True,
                f"magic PFSC, bloques de {img.inner.block_size // 1024} KiB, "
                f"{img.inner.block_count} bloques, datos desde 0x{img.inner.data_start:X}")
            try:
                def on_blocks(done, total):
                    if progress:
                        progress(done * 100 // max(total, 1), "zlib", f"{done}/{total} bloques")
                st = img.inner.verify_all_blocks(threads=threads, progress=on_blocks)
                add("bloques zlib", True,
                    f"{st['blocks']} bloques íntegros ({st['zlib_blocks']} zlib, "
                    f"{st['raw_blocks']} sin comprimir), todos inflan a 64 KiB")
            except PfsError as e:
                add("bloques zlib", False, str(e))
                return result()
        else:
            add("cabecera PFSC", False, "la imagen interna no está comprimida (no es PFSC)")

        ex = img.exfat
        add("exFAT interna", True,
            f"firma EXFAT, clúster {ex.cluster // 1024} KiB, {ex.cluster_count} clústeres")

        found = {p: ex.find(p) for p in (*REQUIRED, "sce_sys/npbind.dat")}
        missing = [p for p in REQUIRED if found[p] is None or found[p].is_dir]
        add("archivos requeridos", not missing,
            "eboot.bin, sce_sys/param.sfo y sce_sys/param.json en la raíz"
            if not missing else "faltan: " + ", ".join(missing))
        if missing:
            return result()

        sfo = parse_sfo(ex.read_file(found["sce_sys/param.sfo"]))
        tid = sfo.get("TITLE_ID")
        tid_ok = valid_title_id(tid) and (title_id is None or tid == title_id)
        add("TITLE_ID", tid_ok, f"param.sfo dentro de la imagen: {tid}")
        try:
            pj = validate_param_json(ex.read_file(found["sce_sys/param.json"]), tid)
            add("param.json ShadowMountPlus", True,
                f"titleId {pj.get('titleId')}, titleName {pj.get('titleName')!r}")
        except ValueError as e:
            add("param.json ShadowMountPlus", False, str(e))

        if source:
            if mode == "full":
                _compare_all(add, ex, source, progress)
            else:
                bad = []
                for rel in COMPARE_QUICK:
                    a = os.path.join(source, *rel.split("/"))
                    if not os.path.isfile(a):
                        continue
                    e = found.get(rel) or ex.find(rel)
                    if e is None or _sha256_stream(ex.read_stream(e)) != _sha256_file(a):
                        bad.append(rel)
                add("idénticos al origen", not bad,
                    "eboot.bin y param.sfo byte a byte" if not bad else "distintos: " + ", ".join(bad))
    except (PfsError, ExfatError) as e:
        add("lectura", False, str(e))
    finally:
        img.close()
    return result()


def _compare_all(add, ex: ExfatReader, source: str, progress: Optional[Progress]) -> None:
    from .packer import scan_tree

    src = {rel: size for rel, size, _ in scan_tree(source).files}
    src.pop("sce_sys/param.json", None)
    files = {e.path: e for e in ex.walk() if not e.is_dir}
    files.pop("sce_sys/param.json", None)
    src_l = {k.lower(): k for k in src}
    got_l = {k.lower(): k for k in files}
    missing = sorted(src_l[k] for k in set(src_l) - set(got_l))
    extra = sorted(got_l[k] for k in set(got_l) - set(src_l))
    differ = []
    total = sum(src.values()) or 1
    done = 0
    for k in sorted(set(src_l) & set(got_l)):
        rel, e = src_l[k], files[got_l[k]]
        if e.data_length != src[rel] or \
                _sha256_stream(ex.read_stream(e)) != _sha256_file(os.path.join(source, *rel.split("/"))):
            differ.append(rel)
        done += src[rel]
        if progress:
            progress(done * 100 // total, "comparar", rel[-40:])
    ok = not (missing or extra or differ)
    add("todos los archivos", ok,
        f"{len(src)} archivos idénticos (SHA-256) al origen" if ok else
        f"faltan {len(missing)}, sobran {len(extra)}, distintos {len(differ)}: "
        + ", ".join((missing + extra + differ)[:5]))


def list_native(path: str) -> List[ExfatEntry]:
    img = open_ffpfsc(path)
    try:
        return list(img.exfat.walk())
    finally:
        img.close()


def extract_native(path: str, dest: str, only: Optional[List[str]] = None,
                   progress: Optional[Progress] = None) -> int:
    img = open_ffpfsc(path)
    real_dest = os.path.realpath(dest)
    try:
        ex = img.exfat
        if only:
            entries = []
            for p in only:
                e = ex.find(p)
                if e is None:
                    raise KeyError(f"no está en la imagen: {p}")
                entries.append(e)
                if e.is_dir:
                    entries.extend(x for x in ex.walk() if x.path.lower().startswith(e.path.lower() + "/"))
        else:
            entries = list(ex.walk())
        total = sum(e.data_length for e in entries if not e.is_dir) or 1
        done = count = 0
        for e in entries:
            target = os.path.realpath(os.path.join(dest, *e.path.split("/")))
            if not (target == real_dest or target.startswith(real_dest + os.sep)):
                raise ValueError(f"ruta insegura en la imagen: {e.path!r}")
            if e.is_dir:
                os.makedirs(target, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "wb") as out:
                for chunk in ex.read_stream(e):
                    out.write(chunk)
            count += 1
            done += e.data_length
            if progress:
                progress(done * 100 // total, "extraer", e.path[-40:])
        return count
    finally:
        img.close()
