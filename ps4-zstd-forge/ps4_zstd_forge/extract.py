"""Extract an archive back to a folder (whole or single files), list it."""

from __future__ import annotations

import os
import tarfile
from typing import Callable, Iterable, Optional

from .archive import META_DIR, open_archive
from .seekable import SequentialStream


def _safe_join(dest: str, rel: str) -> str:
    target = os.path.realpath(os.path.join(dest, *rel.split("/")))
    if not (target == os.path.realpath(dest) or target.startswith(os.path.realpath(dest) + os.sep)):
        raise ValueError(f"unsafe path in archive: {rel!r}")
    return target


def extract_all(archive_path: str, dest: str, threads: int = -1,
                progress: Optional[Callable[[int, int], None]] = None) -> int:
    """Stream-decompress everything (parallel) into ``dest``.  Returns the
    number of files written."""
    reader, _footer, manifest = open_archive(archive_path)
    os.makedirs(dest, exist_ok=True)
    total = reader.decompressed_size
    pos = 0

    def on_frame(n):
        nonlocal pos
        pos += n
        if progress:
            progress(pos, total)

    count = 0
    try:
        stream = SequentialStream(reader, threads=threads, on_frame=on_frame)
        with tarfile.open(fileobj=stream, mode="r|", encoding="utf-8") as tf:
            for ti in tf:
                if ti.name.split("/", 1)[0] == META_DIR:
                    continue
                target = _safe_join(dest, ti.name)
                if ti.isdir():
                    os.makedirs(target, exist_ok=True)
                elif ti.isreg():
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    src = tf.extractfile(ti)
                    with open(target, "wb") as out:
                        while True:
                            chunk = src.read(1024 * 1024)
                            if not chunk:
                                break
                            out.write(chunk)
                    os.utime(target, (ti.mtime, ti.mtime))
                    count += 1
    finally:
        reader.close()
    return count


def extract_some(archive_path: str, dest: str, paths: Iterable[str]) -> int:
    """Random access: extract only the given files (no full decompression)."""
    reader, _footer, manifest = open_archive(archive_path)
    index = {f["p"]: f for f in manifest["files"]}
    count = 0
    try:
        for p in paths:
            p = p.replace("\\", "/").lstrip("/")
            f = index.get(p)
            if f is None:
                raise KeyError(f"not in archive: {p}")
            target = _safe_join(dest, p)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "wb") as out:
                pos, end = f["o"], f["o"] + f["s"]
                while pos < end:
                    n = min(8 * 1024 * 1024, end - pos)
                    out.write(reader.read_at(pos, n))
                    pos += n
            count += 1
    finally:
        reader.close()
    return count


def list_archive(archive_path: str):
    reader, footer, manifest = open_archive(archive_path)
    reader.close()
    return manifest
