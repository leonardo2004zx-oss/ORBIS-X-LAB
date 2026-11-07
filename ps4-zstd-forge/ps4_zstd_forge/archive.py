"""Archive layout shared by the packer, verifier and extractor.

Decompressed stream = a standard POSIX (pax) tar:

    <dir and file members, paths relative to the game root, sorted>
    -- frame boundary --
    __forge__/manifest.json   (index: path -> size, tar offsets, sha256)
    -- frame boundary --
    __forge__/footer.json     (where the manifest is)   <- last zstd frame
    <tar end-of-archive blocks>

Because the footer is always the first thing in the *last* zstd frame, a
reader finds the manifest with: seek table -> decompress last frame -> read
footer -> read the manifest at ``manifest_offset``.  No full decompression
is needed to list files or read any single file.
"""

from __future__ import annotations

import io
import json
import tarfile
from typing import Dict, Optional

from .seekable import SeekableReader

FORMAT_NAME = "ps4-zstd-forge"
FORMAT_VERSION = 1
META_DIR = "__forge__"
MANIFEST_NAME = META_DIR + "/manifest.json"
FOOTER_NAME = META_DIR + "/footer.json"
BLOCK = 512


def pad512(n: int) -> int:
    return (n + BLOCK - 1) // BLOCK * BLOCK


class ArchiveError(ValueError):
    pass


def read_tar_member_at(reader: SeekableReader, header_offset: int,
                       max_header: int = 64 * 1024) -> tarfile.TarInfo:
    """Parse the tar header(s) that start at ``header_offset`` (handles pax
    extended headers) and return the TarInfo, without reading file data."""
    raw = reader.read_at(header_offset, max_header)
    tf = tarfile.TarFile(fileobj=io.BytesIO(raw), mode="r")
    ti = tf.firstmember
    if ti is None:
        raise ArchiveError(f"no tar header at offset {header_offset}")
    # offset_data is relative to our slice: make it absolute.
    ti.offset_data += header_offset
    ti.offset += header_offset
    return ti


def read_footer(reader: SeekableReader) -> Dict:
    if not reader.entries:
        raise ArchiveError("archive has no frames")
    last = len(reader.entries) - 1
    off = reader.d_offsets[last]
    ti = read_tar_member_at(reader, off)
    if ti.name != FOOTER_NAME:
        raise ArchiveError(
            f"last frame does not start with {FOOTER_NAME} (found {ti.name!r}); "
            "not a PS4 ZSTD Forge archive"
        )
    footer = json.loads(reader.read_at(ti.offset_data, ti.size))
    if footer.get("format") != FORMAT_NAME:
        raise ArchiveError("unknown archive format in footer")
    return footer


def read_manifest(reader: SeekableReader, footer: Optional[Dict] = None) -> Dict:
    footer = footer or read_footer(reader)
    data = reader.read_at(footer["manifest_offset"], footer["manifest_size"])
    if len(data) != footer["manifest_size"]:
        raise ArchiveError("manifest truncated")
    return json.loads(data)


def open_archive(path: str):
    """Return (reader, footer, manifest)."""
    reader = SeekableReader(path)
    try:
        footer = read_footer(reader)
        manifest = read_manifest(reader, footer)
    except Exception:
        reader.close()
        raise
    return reader, footer, manifest
