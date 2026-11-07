"""Command line interface.

    ps4zstdforge.py --input CUSA12345 --output D:/FFPFSC/ [--level 9] [--threads -1]
    ps4zstdforge.py pack    --input ... --output ... [--format ffpfsc|zst] [--verify quick|full|none]
    ps4zstdforge.py verify  IMAGEN [--source CARPETA] [--full]
    ps4zstdforge.py extract IMAGEN --dest CARPETA [--only eboot.bin ...]
    ps4zstdforge.py info    IMAGEN|CARPETA
    ps4zstdforge.py doctor  (comprueba que MkPFS está instalado)
    ps4zstdforge.py gui
"""

from __future__ import annotations

import argparse
import os
import sys

from . import __version__

COMMANDS = ("pack", "verify", "extract", "info", "doctor", "gui")


def human(n: float) -> str:
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if abs(n) < 1024 or unit == "TiB":
            return f"{n:.2f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024
    return str(n)


def duration(s: float) -> str:
    s = int(s)
    return f"{s // 3600}h {s % 3600 // 60:02d}m {s % 60:02d}s"


class Bar:
    """tqdm progress bar if available, plain text otherwise."""

    def __init__(self, total: int, desc: str, unit: str = "B"):
        self.last = 0
        try:
            from tqdm import tqdm

            self.t = tqdm(total=total, desc=desc, unit=unit, unit_scale=unit == "B",
                          unit_divisor=1024, dynamic_ncols=True, smoothing=0.05)
        except ImportError:
            self.t = None
            self.total = max(total, 1)
            self.desc = desc
            self.pct = -1

    def update_to(self, done: int, postfix: str = ""):
        if self.t is not None:
            self.t.update(done - self.last)
            if postfix:
                self.t.set_postfix_str(postfix, refresh=False)
        else:
            pct = int(done * 100 / self.total)
            if pct != self.pct:
                self.pct = pct
                print(f"\r{self.desc}: {pct}% {postfix}", end="", flush=True)
        self.last = done

    def close(self):
        if self.t is not None:
            self.t.close()
        else:
            print()


def size_arg(s: str) -> int:
    """'2M', '512K', '4MiB', or a plain number of MiB."""
    s = s.strip().upper().replace("IB", "").replace("B", "")
    mult = 1024 * 1024
    if s.endswith("K"):
        mult, s = 1024, s[:-1]
    elif s.endswith("M"):
        s = s[:-1]
    elif s.endswith("G"):
        mult, s = 1024**3, s[:-1]
    return int(float(s) * mult)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="ps4zstdforge",
        description="PS4 ZSTD Forge: empaqueta un dump de PS4 (CUSAxxxxx) en una imagen "
        ".ffpfsc para ShadowMountPlus (por defecto) o en un archivo .tar.zst de respaldo.",
    )
    p.add_argument("--version", action="version", version=f"PS4 ZSTD Forge {__version__}")
    sub = p.add_subparsers(dest="cmd")

    pk = sub.add_parser("pack", aliases=["compress"], help="empaquetar/comprimir una carpeta de juego")
    pk.add_argument("-i", "--input", required=True, help="carpeta del juego (CUSAxxxxx)")
    pk.add_argument("-o", "--output", help="archivo o carpeta de destino (por defecto: "
                    "TITLEID_Titulo.ffpfsc en el directorio actual)")
    pk.add_argument("-f", "--format", choices=("ffpfsc", "zst"), default="ffpfsc",
                    help="ffpfsc = imagen para ShadowMountPlus (por defecto); "
                    "zst = archivo .tar.zst de respaldo (no se puede montar)")
    pk.add_argument("-l", "--level", type=int, default=None,
                    help="nivel de compresión: ffpfsc = zlib 0-9 (por defecto 9); "
                    "zst = 1-22 (por defecto 22)")
    pk.add_argument("-t", "--threads", type=int, default=-1,
                    help="hilos de compresión (-1 = todos los núcleos, por defecto)")
    pk.add_argument("--backend", choices=("zlib", "auto", "zlib-ng", "isal"), default="zlib",
                    help="[ffpfsc] implementación zlib de MkPFS (por defecto zlib, la de referencia)")
    pk.add_argument("--mkpfs", help="[ffpfsc] ruta o comando de MkPFS si no está en este Python")
    pk.add_argument("--temp-dir", help="[ffpfsc] carpeta temporal; mejor en la misma unidad "
                    "que el juego (enlaces duros, sin ocupar espacio)")
    pk.add_argument("--keep-stage", action="store_true",
                    help="[ffpfsc] no borrar la copia temporal (para depurar)")
    pk.add_argument("--frame-size", type=size_arg, default=2 * 1024 * 1024,
                    help="[zst] tamaño de cada trama independiente (por defecto 2M)")
    pk.add_argument("--verify", choices=("quick", "full", "none"), default="quick",
                    help="verificación tras empaquetar (por defecto quick)")
    pk.add_argument("--no-manifest", action="store_true",
                    help="no escribir el .manifest.json junto al archivo")
    pk.add_argument("--overwrite", action="store_true", help="sobrescribir la salida")

    vf = sub.add_parser("verify", help="verificar una imagen .ffpfsc o un .tar.zst")
    vf.add_argument("archive")
    vf.add_argument("-s", "--source", help="carpeta original para comparar")
    vf.add_argument("--full", action="store_true",
                    help="comparar además el SHA-256 de todos los archivos con --source")
    vf.add_argument("--mkpfs-check", action="store_true",
                    help="[ffpfsc] ejecutar también 'mkpfs verify' (segunda opinión)")
    vf.add_argument("--mkpfs", help="ruta o comando de MkPFS")
    vf.add_argument("--sample-percent", type=float, default=10.0,
                    help="porcentaje de tramas a muestrear en modo rápido (10)")
    vf.add_argument("-t", "--threads", type=int, default=-1)

    ex = sub.add_parser("extract", help="descomprimir a una carpeta")
    ex.add_argument("archive")
    ex.add_argument("-d", "--dest", required=True)
    ex.add_argument("--only", nargs="+", metavar="RUTA",
                    help="extraer solo estos archivos (acceso aleatorio)")
    ex.add_argument("-t", "--threads", type=int, default=-1)
    ex.add_argument("--mkpfs", help="ruta o comando de MkPFS")

    inf = sub.add_parser("info", help="mostrar info de un juego o de un archivo")
    inf.add_argument("path")
    inf.add_argument("--files", action="store_true", help="listar archivos")

    dc = sub.add_parser("doctor", help="comprobar que MkPFS está instalado")
    dc.add_argument("--mkpfs", help="ruta o comando de MkPFS")
    sub.add_parser("gui", help="abrir la interfaz gráfica")
    return p


def print_report(rep) -> None:
    print(("✔ " if rep.ok else "✘ ") + rep.summary())
    for c in rep.checks:
        print(f"   {'✓' if c.ok else '✗'} {c.name}: {c.detail}")


def run_verify(archive, source, full, sample_percent=10.0, threads=-1):
    from .verify import verify

    print(f"Verificando ({'completa' if full else 'rápida'})…")
    bar = None

    def progress(done, total):
        nonlocal bar
        if bar is None:
            bar = Bar(total, "Verificando", unit="B" if full else "muestra")
        bar.update_to(done)

    rep = verify(archive, source=source, mode="full" if full else "quick",
                 sample_percent=sample_percent, threads=threads, progress=progress)
    if bar:
        bar.close()
    print_report(rep)
    return rep.ok


def cmd_pack(a) -> int:
    if a.format == "ffpfsc":
        return cmd_pack_ffpfsc(a)
    from .packer import pack

    level = 22 if a.level is None else a.level
    if not 1 <= level <= 22:
        raise ValueError("para .tar.zst el nivel va de 1 a 22")

    bar = None

    def progress(done, total, comp):
        nonlocal bar
        if bar is None:
            bar = Bar(total, "Comprimiendo")
        bar.update_to(done, f"zst {human(comp)}")

    try:
        st = pack(a.input, a.output, level=level, threads=a.threads,
                  frame_size=a.frame_size, write_sidecar=not a.no_manifest,
                  overwrite=a.overwrite, progress=progress)
    except KeyboardInterrupt:
        if bar:
            bar.close()
            bar = None
        print("\nCancelado. Se borró el archivo parcial.")
        return 130
    finally:
        if bar:
            bar.close()
            bar = None

    saved = st.source_bytes - st.compressed_bytes
    print()
    print("══════════ Resumen ══════════")
    print(f" Archivo   : {st.output}")
    if st.manifest_path:
        print(f" Manifiesto: {st.manifest_path}")
    print(f" Contenido : {st.files} archivos, {st.dirs} carpetas ({st.empty_dirs} vacías)")
    print(f" Original  : {human(st.source_bytes)}")
    print(f" Comprimido: {human(st.compressed_bytes)}  "
          f"({st.ratio * 100:.1f}% del original, ahorro {human(saved)})")
    print(f" Tramas    : {st.frames} × {st.frame_size // 1024} KiB · nivel {st.level} · {st.threads} hilos")
    speed = st.source_bytes / st.seconds if st.seconds else 0
    print(f" Tiempo    : {duration(st.seconds)} ({human(speed)}/s)")
    print()
    if a.verify != "none":
        ok = run_verify(st.output, a.input, a.verify == "full")
        return 0 if ok else 2
    return 0


class PhaseBar:
    """Progress for MkPFS phases (percent based)."""

    def __init__(self):
        self.bar = None
        self.phase = None

    def __call__(self, pct, phase, detail):
        if phase != self.phase:
            self.close()
            self.phase = phase
            self.bar = Bar(100, PHASES.get(phase, phase), unit="%")
        self.bar.update_to(pct, detail)

    def close(self):
        if self.bar:
            self.bar.update_to(self.bar.last)
            self.bar.close()
            self.bar = None
            self.phase = None


PHASES = {"preparar": "Preparando", "compress": "Comprimiendo", "write": "Escribiendo",
          "scan": "Escaneando", "verify": "Verificando", "check": "Verificando",
          "extract": "Extrayendo", "exfat": "exFAT"}


def print_ffpfsc_report(v) -> None:
    ok = v.get("ok")
    n_ok = sum(c["ok"] for c in v.get("checks", []))
    label = "Verificación completa" if v.get("mode") == "full" else "Verificación rápida"
    print(("✔ " if ok else "✘ ") + f"{label} {'superada' if ok else 'FALLIDA'}: "
          f"{n_ok}/{len(v.get('checks', []))} comprobaciones")
    for c in v.get("checks", []):
        print(f"   {'✓' if c['ok'] else '✗'} {c['name']}: {c['detail']}")


def cmd_pack_ffpfsc(a) -> int:
    from .ffpfsc import pack_ffpfsc

    level = 9 if a.level is None else a.level
    bar = PhaseBar()

    def log(msg):
        bar.close()
        print(msg)

    try:
        st = pack_ffpfsc(a.input, a.output, level=level, threads=a.threads, backend=a.backend,
                         verify_mode=a.verify, temp_dir=a.temp_dir, mkpfs=a.mkpfs,
                         overwrite=a.overwrite, keep_stage=a.keep_stage, progress=bar, log=log)
    except KeyboardInterrupt:
        bar.close()
        print("\nCancelado. Se borraron la imagen parcial y la copia temporal.")
        return 130
    finally:
        bar.close()

    print()
    print("══════════ Resumen ══════════")
    print(f" Imagen    : {st.output}")
    print(f" Juego     : {st.title_id} · {st.title}")
    print(f" Contenido : {st.files} archivos (+ sce_sys/param.json para ShadowMountPlus)")
    print(f" Original  : {human(st.source_bytes)}")
    print(f" .ffpfsc   : {human(st.image_bytes)}  ({st.ratio * 100:.1f}% del original, "
          f"ahorro {human(st.source_bytes - st.image_bytes)})")
    print(f" Compresión: zlib nivel {st.level} · {st.threads} hilos · {st.backend}")
    speed = st.source_bytes / st.seconds if st.seconds else 0
    print(f" Tiempo    : {duration(st.seconds)} ({human(speed)}/s)")
    print(f" Manifiesto: {st.manifest_path}")
    print(f" Uso       : {st.shadowmount_path}")
    print()
    if st.verification.get("mode") != "none":
        print_ffpfsc_report(st.verification)
    return 0


def cmd_doctor(a) -> int:
    from .mkpfs_runner import MkpfsNotFound, find_mkpfs, mkpfs_version

    try:
        mk = find_mkpfs(a.mkpfs)
        print(f"MkPFS: {mkpfs_version(mk)}")
        print(f"Comando: {' '.join(mk)}")
        return 0
    except MkpfsNotFound as e:
        print(str(e), file=sys.stderr)
        return 1


def cmd_info(a) -> int:
    if os.path.isdir(a.path):
        from .packer import scan_tree
        from .sfo import find_game_root, read_game_info

        root = find_game_root(a.path)
        info = read_game_info(root)
        scan = scan_tree(root)
        print(f"Raíz      : {root}")
        for k, v in info.as_dict().items():
            if v:
                print(f"{k:<10}: {v}")
        print(f"Archivos  : {len(scan.files)} ({human(scan.total_bytes)})")
        for n in info.notes:
            print(f"Aviso     : {n}")
        return 0
    from .ffpfsc import is_ffpfsc

    if is_ffpfsc(a.path):
        return info_ffpfsc(a)
    from .extract import list_archive

    m = list_archive(a.path)
    size = os.path.getsize(a.path)
    t = m["totals"]
    print(f"Archivo   : {a.path}")
    for k, v in m.get("game", {}).items():
        if v:
            print(f"{k:<10}: {v}")
    print(f"Contenido : {t['files']} archivos, {t['dirs']} carpetas")
    print(f"Original  : {human(t['bytes'])}")
    print(f"Comprimido: {human(size)} ({size / max(t['bytes'], 1) * 100:.1f}%)")
    c = m.get("compression", {})
    print(f"zstd      : nivel {c.get('level')}, tramas de {c.get('frame_size', 0) // 1024} KiB")
    print(f"Creado    : {m.get('created')} con {m.get('tool')}")
    if a.files:
        for f in m["files"]:
            print(f"{f['s']:>14}  {f['p']}")
    return 0


def info_ffpfsc(a) -> int:
    import json

    from .ffpfsc_native import open_ffpfsc

    print(f"Imagen    : {a.path} ({human(os.path.getsize(a.path))})")
    side = a.path + ".manifest.json"
    if os.path.isfile(side):
        with open(side, encoding="utf-8") as f:
            m = json.load(f)
        for k, v in m.get("game", {}).items():
            if v:
                print(f"{k:<10}: {v}")
        c = m.get("compression", {})
        print(f"zlib      : nivel {c.get('level')} ({c.get('backend')})")
        print(f"Creado    : {m.get('created')} con {m.get('tool')} / {m.get('engine')}")
    img = open_ffpfsc(a.path)
    try:
        h = img.pfs.header
        print(f"PFS       : perfil {h.profile}, bloque {h.block_size // 1024} KiB, "
              f"{', '.join(h.mode_flags())}")
        inner = img.inner
        print(f"Interna   : {img.inner_name} · {human(inner.size)} lógicos → "
              f"{human(inner.ino.stored_size)} guardados"
              + (f" · PFSC {inner.block_count} bloques zlib de 64 KiB" if inner.compressed else ""))
        files = [e for e in img.exfat.walk() if not e.is_dir]
        print(f"Contenido : {len(files)} archivos, {human(sum(e.data_length for e in files))}")
        if a.files:
            for e in files:
                print(f"{e.data_length:>14}  {e.path}")
    finally:
        img.close()
    return 0


def cmd_extract(a) -> int:
    from .extract import extract_all, extract_some
    from .ffpfsc import extract_ffpfsc, is_ffpfsc

    if is_ffpfsc(a.archive):
        bar = PhaseBar()
        try:
            n = extract_ffpfsc(a.archive, a.dest, a.only, progress=bar)
        finally:
            bar.close()
        print(f"{n} archivos extraídos en {a.dest}")
        return 0
    if a.only:
        n = extract_some(a.archive, a.dest, a.only)
    else:
        bar = None

        def progress(done, total):
            nonlocal bar
            if bar is None:
                bar = Bar(total, "Extrayendo")
            bar.update_to(done)

        n = extract_all(a.archive, a.dest, threads=a.threads, progress=progress)
        if bar:
            bar.close()
    print(f"{n} archivos extraídos en {a.dest}")
    return 0


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    # `ps4zstdforge --input X --output Y` == `ps4zstdforge pack --input X ...`
    if argv and argv[0].startswith("-") and argv[0] not in ("-h", "--help", "--version"):
        argv.insert(0, "pack")
    if not argv:
        argv = ["gui"]
    a = build_parser().parse_args(argv)
    try:
        if a.cmd in ("pack", "compress"):
            return cmd_pack(a)
        if a.cmd == "verify":
            from .ffpfsc import is_ffpfsc, verify_ffpfsc

            if is_ffpfsc(a.archive):
                bar = PhaseBar()
                try:
                    v = verify_ffpfsc(a.archive, source=a.source,
                                      mode="full" if a.full else "quick",
                                      mkpfs=a.mkpfs, progress=bar,
                                      use_mkpfs=a.mkpfs_check, threads=a.threads)
                finally:
                    bar.close()
                print_ffpfsc_report(v)
                return 0 if v["ok"] else 2
            return 0 if run_verify(a.archive, a.source, a.full, a.sample_percent, a.threads) else 2
        if a.cmd == "doctor":
            return cmd_doctor(a)
        if a.cmd == "extract":
            return cmd_extract(a)
        if a.cmd == "info":
            return cmd_info(a)
        if a.cmd == "gui":
            from .gui import run_gui

            return run_gui()
    except (FileNotFoundError, FileExistsError, ValueError, KeyError, OSError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except RuntimeError as e:  # MkPFS missing/failed, staging problems
        print(f"Error: {e}", file=sys.stderr)
        out = getattr(e, "output", "")
        if out:
            print("--- últimas líneas de MkPFS ---", file=sys.stderr)
            print("\n".join(out.splitlines()[-20:]), file=sys.stderr)
        return 4 if "verificación" in str(e) else 1
    build_parser().print_help()
    return 1
