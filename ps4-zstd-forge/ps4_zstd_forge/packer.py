"""Pack a PS4 game folder (CUSAxxxxx) into a seekable .tar.zst archive."""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import stat
import tarfile
import time
from dataclasses import dataclass, field
from typing import Callable, List, Optional

from . import __version__
from .archive import (
    FOOTER_NAME,
    FORMAT_NAME,
    FORMAT_VERSION,
    MANIFEST_NAME,
    META_DIR,
    pad512,
)
from .seekable import HAVE_XXHASH, SeekableWriter, resolve_threads
from .sfo import GameInfo, find_game_root, read_game_info

COPY_BUFSIZE = 1024 * 1024
ARCHIVE_EXT = ".tar.zst"


@dataclass
class ScanResult:
    root: str
    files: List[tuple] = field(default_factory=list)  # (rel, size, mtime)
    dirs: List[tuple] = field(default_factory=list)  # (rel, mtime)
    empty_dirs: List[str] = field(default_factory=list)
    skipped: List[str] = field(default_factory=list)
    total_bytes: int = 0


def scan_tree(root: str) -> ScanResult:
    """Walk the game folder in a deterministic (sorted) order."""
    res = ScanResult(root=root)

    def walk(abs_dir: str, rel_dir: str):
        try:
            entries = sorted(os.scandir(abs_dir), key=lambda e: e.name)
        except OSError as e:
            res.skipped.append(f"{rel_dir or '.'}: {e}")
            return
        has_children = False
        for e in entries:
            rel = f"{rel_dir}/{e.name}" if rel_dir else e.name
            if rel == META_DIR:
                res.skipped.append(f"{rel}: nombre reservado")
                continue
            if e.is_symlink():
                res.skipped.append(f"{rel}: enlace simbólico (ignorado)")
                continue
            st = e.stat()
            if stat.S_ISDIR(st.st_mode):
                has_children = True
                res.dirs.append((rel, int(st.st_mtime)))
                if not walk(e.path, rel):
                    res.empty_dirs.append(rel)
            elif stat.S_ISREG(st.st_mode):
                has_children = True
                res.files.append((rel, st.st_size, int(st.st_mtime)))
                res.total_bytes += st.st_size
            else:
                res.skipped.append(f"{rel}: tipo de archivo no soportado")
        return has_children

    walk(root, "")
    return res


def safe_name(s: str) -> str:
    s = re.sub(r"[^\w.\-]+", "", s.replace(" ", ""), flags=re.UNICODE)
    return s[:60] or "game"


def default_output_name(info: GameInfo) -> str:
    parts = [info.title_id or safe_name(os.path.basename(info.root))]
    if info.title:
        parts.append(safe_name(info.title))
    return "_".join(parts) + ARCHIVE_EXT


def resolve_output(output: Optional[str], info: GameInfo) -> str:
    if not output:
        return os.path.join(os.getcwd(), default_output_name(info))
    is_dir_hint = output.endswith(("/", "\\"))
    output = os.path.abspath(output)
    if is_dir_hint or os.path.isdir(output):
        return os.path.join(output, default_output_name(info))
    if not output.endswith(".zst"):
        output += ARCHIVE_EXT
    return output


class _HashingReader:
    """Wraps a source file: hashes and reports progress as tarfile reads."""

    def __init__(self, f, hasher, on_bytes):
        self._f = f
        self._h = hasher
        self._on = on_bytes

    def read(self, n=-1):
        data = self._f.read(n)
        self._h.update(data)
        self._on(len(data))
        return data


@dataclass
class PackStats:
    output: str
    manifest_path: Optional[str]
    files: int
    dirs: int
    empty_dirs: int
    source_bytes: int
    tar_bytes: int
    compressed_bytes: int
    frames: int
    seconds: float
    level: int
    threads: int
    frame_size: int

    @property
    def ratio(self) -> float:
        return self.compressed_bytes / self.source_bytes if self.source_bytes else 1.0


ProgressCb = Callable[[int, int, int], None]  # (done_src, total_src, compressed)


def pack(
    input_dir: str,
    output: Optional[str] = None,
    level: int = 22,
    threads: int = -1,
    frame_size: int = 2 * 1024 * 1024,
    write_sidecar: bool = True,
    overwrite: bool = False,
    progress: Optional[ProgressCb] = None,
    log: Callable[[str], None] = print,
    cancel: Optional[Callable[[], bool]] = None,
) -> PackStats:
    root = find_game_root(input_dir)
    if not os.path.isdir(root):
        raise FileNotFoundError(f"input folder not found: {input_dir}")
    if root != os.path.abspath(input_dir):
        log(f"Raíz del juego detectada: {root}")
    info = read_game_info(root)
    for n in info.notes:
        log(f"Aviso: {n}")

    out_path = resolve_output(output, info)
    real_root = os.path.realpath(root)
    if os.path.realpath(out_path).startswith(real_root + os.sep):
        raise ValueError("the output file cannot be inside the input folder")
    if os.path.exists(out_path) and not overwrite:
        raise FileExistsError(f"{out_path} already exists (use --overwrite)")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    log("Escaneando archivos…")
    scan = scan_tree(root)
    for s in scan.skipped:
        log(f"Omitido: {s}")
    total = scan.total_bytes
    nthreads = resolve_threads(threads)
    log(
        f"{len(scan.files)} archivos, {len(scan.dirs)} carpetas "
        f"({len(scan.empty_dirs)} vacías), {total / 2**30:.2f} GiB · "
        f"zstd nivel {level} · {nthreads} hilos · tramas de "
        f"{frame_size // 1024} KiB"
    )

    done = 0
    compressed = 0

    def on_frame(_dlen, clen):
        nonlocal compressed
        compressed += clen

    def on_bytes(n):
        nonlocal done
        done += n
        if progress:
            progress(done, total, compressed)
        if cancel and cancel():
            raise KeyboardInterrupt("cancelado")

    tmp_path = out_path + ".partial"
    t0 = time.time()
    out = open(tmp_path, "wb")
    writer = SeekableWriter(
        out, level=level, threads=nthreads, frame_size=frame_size, on_frame=on_frame
    )
    ok = False
    try:
        tar = tarfile.open(
            fileobj=writer, mode="w", format=tarfile.PAX_FORMAT, encoding="utf-8"
        )
        tar.copybufsize = COPY_BUFSIZE

        def base_info(name, mtime, mode, kind):
            ti = tarfile.TarInfo(name)
            ti.mtime = mtime
            ti.mode = mode
            ti.type = kind
            ti.uid = ti.gid = 0
            ti.uname = ti.gname = ""
            return ti

        # Directories first (keeps empty dirs and makes extraction simple),
        # then files.  Both lists are sorted, so the archive is deterministic.
        for rel, mtime in scan.dirs:
            tar.addfile(base_info(rel, mtime, 0o755, tarfile.DIRTYPE))

        file_records = []
        for rel, size, mtime in scan.files:
            ti = base_info(rel, mtime, 0o644, tarfile.REGTYPE)
            ti.size = size
            header_off = tar.offset
            h = hashlib.sha256()
            with open(os.path.join(root, *rel.split("/")), "rb") as src:
                tar.addfile(ti, _HashingReader(src, h, on_bytes))
            data_off = tar.offset - pad512(size)
            file_records.append(
                {"p": rel, "s": size, "h": header_off, "o": data_off,
                 "sha256": h.hexdigest()}
            )

        manifest = {
            "format": FORMAT_NAME,
            "version": FORMAT_VERSION,
            "tool": f"PS4 ZSTD Forge {__version__}",
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "game": info.as_dict(),
            "source_name": os.path.basename(root),
            "layout": "paths relative to the game root (eboot.bin at archive root)",
            "compression": {
                "codec": "zstd",
                "level": level,
                "frame_size": frame_size,
                "seek_table": "zstd seekable format",
                "frame_checksums": "xxh64-low32" if HAVE_XXHASH else None,
            },
            "hash": "sha256",
            "totals": {
                "files": len(scan.files),
                "dirs": len(scan.dirs),
                "empty_dirs": len(scan.empty_dirs),
                "bytes": total,
            },
            "dirs": [d for d, _ in scan.dirs],
            "empty_dirs": scan.empty_dirs,
            "files": file_records,
        }
        manifest_bytes = json.dumps(manifest, ensure_ascii=False,
                                    separators=(",", ":")).encode("utf-8")

        # Manifest in its own frames, footer at the start of the last frame.
        writer.flush_frame()
        mi = base_info(MANIFEST_NAME, int(time.time()), 0o644, tarfile.REGTYPE)
        mi.size = len(manifest_bytes)
        tar.addfile(mi, io.BytesIO(manifest_bytes))
        manifest_off = tar.offset - pad512(len(manifest_bytes))

        writer.flush_frame()
        footer = {
            "format": FORMAT_NAME,
            "version": FORMAT_VERSION,
            "manifest_offset": manifest_off,
            "manifest_size": len(manifest_bytes),
            "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
            "files": len(scan.files),
            "bytes": total,
        }
        footer_bytes = json.dumps(footer, separators=(",", ":")).encode()
        fi = base_info(FOOTER_NAME, int(time.time()), 0o644, tarfile.REGTYPE)
        fi.size = len(footer_bytes)
        tar.addfile(fi, io.BytesIO(footer_bytes))
        tar.close()  # end-of-archive blocks (does not close `writer`)
        tar_bytes = writer.tell()
        writer.close()
        out.close()
        os.replace(tmp_path, out_path)
        ok = True
    finally:
        if not ok:
            writer.abort()
            out.close()
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    seconds = time.time() - t0
    compressed_total = os.path.getsize(out_path)
    if progress:
        progress(total, total, compressed_total)

    manifest_path = None
    if write_sidecar:
        manifest_path = out_path + ".manifest.json"
        side = dict(manifest)
        side["archive"] = {
            "file": os.path.basename(out_path),
            "compressed_bytes": compressed_total,
            "tar_bytes": tar_bytes,
            "frames": len(writer.entries),
        }
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(side, f, ensure_ascii=False, indent=1)

    return PackStats(
        output=out_path,
        manifest_path=manifest_path,
        files=len(scan.files),
        dirs=len(scan.dirs),
        empty_dirs=len(scan.empty_dirs),
        source_bytes=total,
        tar_bytes=tar_bytes,
        compressed_bytes=compressed_total,
        frames=len(writer.entries),
        seconds=seconds,
        level=level,
        threads=nthreads,
        frame_size=frame_size,
    )
