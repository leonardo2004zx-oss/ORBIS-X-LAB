"""Command line interface.

    ps4zstdforge.py --input CUSA12345 --output D:/ZSTD/ [--level 22] [--threads -1]
    ps4zstdforge.py pack    --input ... --output ... [--verify quick|full|none]
    ps4zstdforge.py verify  ARCHIVE [--source FOLDER] [--full]
    ps4zstdforge.py extract ARCHIVE --dest FOLDER [--only eboot.bin ...]
    ps4zstdforge.py info    ARCHIVE|FOLDER
    ps4zstdforge.py gui
"""

from __future__ import annotations

import argparse
import os
import sys

from . import __version__

COMMANDS = ("pack", "verify", "extract", "info", "gui")


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
        description="PS4 ZSTD Forge: empaqueta un dump de PS4 (CUSAxxxxx) en un "
        "archivo .tar.zst con tabla de búsqueda (zstd seekable).",
    )
    p.add_argument("--version", action="version", version=f"PS4 ZSTD Forge {__version__}")
    sub = p.add_subparsers(dest="cmd")

    pk = sub.add_parser("pack", help="empaquetar una carpeta de juego")
    pk.add_argument("-i", "--input", required=True, help="carpeta del juego (CUSAxxxxx)")
    pk.add_argument("-o", "--output", help="archivo .tar.zst o carpeta de destino "
                    "(por defecto: TITLEID_Titulo.tar.zst en el directorio actual)")
    pk.add_argument("-l", "--level", type=int, default=22, choices=range(1, 23),
                    metavar="1-22", help="nivel zstd (por defecto 22 = máximo)")
    pk.add_argument("-t", "--threads", type=int, default=-1,
                    help="hilos de compresión (-1 = todos los núcleos, por defecto)")
    pk.add_argument("--frame-size", type=size_arg, default=2 * 1024 * 1024,
                    help="tamaño de cada trama independiente (por defecto 2M; "
                    "más grande = algo más de compresión, menos acceso aleatorio)")
    pk.add_argument("--verify", choices=("quick", "full", "none"), default="quick",
                    help="verificación tras empaquetar (por defecto quick)")
    pk.add_argument("--no-manifest", action="store_true",
                    help="no escribir el .manifest.json junto al archivo")
    pk.add_argument("--overwrite", action="store_true", help="sobrescribir la salida")

    vf = sub.add_parser("verify", help="verificar un archivo")
    vf.add_argument("archive")
    vf.add_argument("-s", "--source", help="carpeta original para comparar")
    vf.add_argument("--full", action="store_true", help="descomprimir y comprobar todo")
    vf.add_argument("--sample-percent", type=float, default=10.0,
                    help="porcentaje de tramas a muestrear en modo rápido (10)")
    vf.add_argument("-t", "--threads", type=int, default=-1)

    ex = sub.add_parser("extract", help="descomprimir a una carpeta")
    ex.add_argument("archive")
    ex.add_argument("-d", "--dest", required=True)
    ex.add_argument("--only", nargs="+", metavar="RUTA",
                    help="extraer solo estos archivos (acceso aleatorio)")
    ex.add_argument("-t", "--threads", type=int, default=-1)

    inf = sub.add_parser("info", help="mostrar info de un juego o de un archivo")
    inf.add_argument("path")
    inf.add_argument("--files", action="store_true", help="listar archivos")

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
    from .packer import pack

    bar = None

    def progress(done, total, comp):
        nonlocal bar
        if bar is None:
            bar = Bar(total, "Comprimiendo")
        bar.update_to(done, f"zst {human(comp)}")

    try:
        st = pack(a.input, a.output, level=a.level, threads=a.threads,
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


def cmd_extract(a) -> int:
    from .extract import extract_all, extract_some

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
        if a.cmd == "pack":
            return cmd_pack(a)
        if a.cmd == "verify":
            return 0 if run_verify(a.archive, a.source, a.full, a.sample_percent, a.threads) else 2
        if a.cmd == "extract":
            return cmd_extract(a)
        if a.cmd == "info":
            return cmd_info(a)
        if a.cmd == "gui":
            from .gui import run_gui

            return run_gui()
    except (FileNotFoundError, FileExistsError, ValueError, KeyError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    build_parser().print_help()
    return 1
