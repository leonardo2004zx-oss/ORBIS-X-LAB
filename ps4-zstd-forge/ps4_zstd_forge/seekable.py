"""Zstandard *seekable format* writer and reader.

The archive produced by PS4 ZSTD Forge is a plain zstd stream written in the
official "Zstandard Seekable Format" (zstd/contrib/seekable_format):

    [zstd frame 0][zstd frame 1] ... [zstd frame N-1][seek table]

* Every frame is an independent, standard zstd frame (with content size and
  content checksum), so ``zstd -d`` or any zstd library decompresses the
  whole file as a normal ``.zst``.
* The seek table is a zstd *skippable frame* (magic 0x184D2A5E) that normal
  decoders ignore.  It lists the compressed/decompressed size of each frame
  (+ the low 32 bits of the XXH64 of the decompressed data), so a reader can
  jump to any byte of the decompressed stream by decompressing only one
  frame.  That random access is what a mount/loader on the console needs.

Seek table layout (all little endian)::

    u32 Skippable_Magic_Number = 0x184D2A5E
    u32 Frame_Size             = size of everything that follows
    N x { u32 Compressed_Size, u32 Decompressed_Size [, u32 Checksum] }
    u32 Number_Of_Frames
    u8  Seek_Table_Descriptor  (bit 7 = checksums present)
    u32 Seekable_Magic_Number  = 0x8F92EAB1

Frames are compressed in parallel (one zstd context per worker thread);
python-zstandard releases the GIL while compressing, so this scales with the
number of CPU cores.
"""

from __future__ import annotations

import bisect
import collections
import concurrent.futures
import os
import struct
import threading
from dataclasses import dataclass
from typing import BinaryIO, Callable, List, Optional

import zstandard

try:  # xxhash is optional: without it the seek table has no checksums.
    import xxhash

    def _xxh64_low32(data) -> int:
        return xxhash.xxh64_intdigest(data) & 0xFFFFFFFF

    HAVE_XXHASH = True
except ImportError:  # pragma: no cover - depends on environment
    xxhash = None
    _xxh64_low32 = None
    HAVE_XXHASH = False

SKIPPABLE_MAGIC_SEEKTABLE = 0x184D2A5E
SEEKABLE_MAGIC = 0x8F92EAB1
ZSTD_FRAME_MAGIC = 0xFD2FB528
SEEK_TABLE_FOOTER_SIZE = 9
CHECKSUM_FLAG = 0x80
MAX_FRAME_SIZE = 0x40000000  # 1 GiB, far below the u32 limit of the table


def resolve_threads(threads: int) -> int:
    """``-1`` (or 0) means "all cores"."""
    if threads is None or threads <= 0:
        return max(1, os.cpu_count() or 1)
    return threads


@dataclass
class FrameEntry:
    compressed_size: int
    decompressed_size: int
    checksum: Optional[int] = None


# ---------------------------------------------------------------------------
# Writer
# ---------------------------------------------------------------------------


class SeekableWriter:
    """File-like object: everything written to it is cut into frames of
    ``frame_size`` bytes, compressed in parallel and written in order to
    ``out``.  ``close()`` appends the seek table.

    ``flush_frame()`` ends the current frame early, so the next byte written
    starts a new frame (used to make the manifest/footer easy to locate).
    """

    def __init__(
        self,
        out: BinaryIO,
        level: int = 22,
        threads: int = -1,
        frame_size: int = 2 * 1024 * 1024,
        checksums: bool = True,
        on_frame: Optional[Callable[[int, int], None]] = None,
    ):
        if not 1 <= level <= 22:
            raise ValueError("level must be between 1 and 22")
        if not 64 * 1024 <= frame_size <= MAX_FRAME_SIZE:
            raise ValueError("frame_size must be between 64 KiB and 1 GiB")
        self._out = out
        self._level = level
        self._frame_size = frame_size
        self._checksums = checksums and HAVE_XXHASH
        self._threads = resolve_threads(threads)
        self._pool = concurrent.futures.ThreadPoolExecutor(
            max_workers=self._threads, thread_name_prefix="zstd"
        )
        # Bound the number of frames in flight so memory stays predictable.
        self._max_inflight = self._threads * 2
        self._pending: "collections.deque" = collections.deque()
        self._buf = bytearray()
        self._tls = threading.local()
        self._on_frame = on_frame
        self.entries: List[FrameEntry] = []
        self.frames_submitted = 0
        self.uncompressed_pos = 0  # bytes accepted by write()
        self.compressed_pos = 0  # bytes written to ``out``
        self._closed = False

    # -- file-like API used by tarfile -------------------------------------
    def write(self, data) -> int:
        if self._closed:
            raise ValueError("write to closed SeekableWriter")
        n = len(data)
        self._buf += data
        self.uncompressed_pos += n
        fs = self._frame_size
        while len(self._buf) >= fs:
            chunk = bytes(self._buf[:fs])
            del self._buf[:fs]
            self._submit(chunk)
        return n

    def tell(self) -> int:
        return self.uncompressed_pos

    def flush(self) -> None:  # tarfile may call flush(); frames stay intact
        pass

    # -- frame management --------------------------------------------------
    def _compressor(self) -> zstandard.ZstdCompressor:
        c = getattr(self._tls, "c", None)
        if c is None:
            c = zstandard.ZstdCompressor(
                level=self._level, write_checksum=True, write_content_size=True
            )
            self._tls.c = c
        return c

    def _compress(self, chunk: bytes):
        data = self._compressor().compress(chunk)
        ck = _xxh64_low32(chunk) if self._checksums else None
        return data, ck

    def _submit(self, chunk: bytes) -> None:
        fut = self._pool.submit(self._compress, chunk)
        self._pending.append((fut, len(chunk)))
        self.frames_submitted += 1
        while len(self._pending) > self._max_inflight:
            self._drain_one()

    def _drain_one(self) -> None:
        fut, dlen = self._pending.popleft()
        data, ck = fut.result()
        self._out.write(data)
        self.compressed_pos += len(data)
        self.entries.append(FrameEntry(len(data), dlen, ck))
        if self._on_frame:
            self._on_frame(dlen, len(data))

    def flush_frame(self) -> None:
        """Close the current frame (if it has data)."""
        if self._buf:
            chunk = bytes(self._buf)
            self._buf.clear()
            self._submit(chunk)

    def close(self) -> None:
        if self._closed:
            return
        try:
            self.flush_frame()
            while self._pending:
                self._drain_one()
            table = build_seek_table(self.entries, self._checksums)
            self._out.write(table)
            self.compressed_pos += len(table)
        finally:
            self._closed = True
            self._pool.shutdown(wait=True)

    def abort(self) -> None:
        self._closed = True
        for fut, _ in self._pending:
            fut.cancel()
        self._pool.shutdown(wait=True)


def build_seek_table(entries: List[FrameEntry], checksums: bool) -> bytes:
    parts = []
    for e in entries:
        parts.append(struct.pack("<II", e.compressed_size, e.decompressed_size))
        if checksums:
            parts.append(struct.pack("<I", e.checksum))
    parts.append(
        struct.pack(
            "<IBI",
            len(entries),
            CHECKSUM_FLAG if checksums else 0,
            SEEKABLE_MAGIC,
        )
    )
    body = b"".join(parts)
    return struct.pack("<II", SKIPPABLE_MAGIC_SEEKTABLE, len(body)) + body


# ---------------------------------------------------------------------------
# Reader
# ---------------------------------------------------------------------------


class SeekTableError(ValueError):
    pass


class SeekableReader:
    """Random-access reader for a seekable zstd file.

    ``read_at(offset, size)`` returns bytes of the *decompressed* stream,
    decompressing only the frames that cover the range (small LRU cache).
    """

    def __init__(self, path: str, cache_frames: int = 8):
        self.path = path
        self._f = open(path, "rb")
        self.file_size = os.fstat(self._f.fileno()).st_size
        self.entries, self.has_checksums, self.seek_table_size = self._read_table()
        self.c_offsets: List[int] = []
        self.d_offsets: List[int] = []
        c = d = 0
        for e in self.entries:
            self.c_offsets.append(c)
            self.d_offsets.append(d)
            c += e.compressed_size
            d += e.decompressed_size
        self.compressed_frames_size = c
        self.decompressed_size = d
        self._dctx = zstandard.ZstdDecompressor()
        self._cache: "collections.OrderedDict[int, bytes]" = collections.OrderedDict()
        self._cache_frames = cache_frames
        self._lock = threading.Lock()

    def close(self) -> None:
        self._f.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # -- seek table ----------------------------------------------------------
    def _read_table(self):
        f = self._f
        if self.file_size < SEEK_TABLE_FOOTER_SIZE + 8:
            raise SeekTableError("file too small to contain a seek table")
        f.seek(self.file_size - SEEK_TABLE_FOOTER_SIZE)
        n, desc, magic = struct.unpack("<IBI", f.read(SEEK_TABLE_FOOTER_SIZE))
        if magic != SEEKABLE_MAGIC:
            raise SeekTableError(
                "seekable magic not found: this is not a seekable zstd archive"
            )
        if desc & 0x7C:
            raise SeekTableError("reserved bits set in seek table descriptor")
        has_ck = bool(desc & CHECKSUM_FLAG)
        esz = 12 if has_ck else 8
        body = n * esz + SEEK_TABLE_FOOTER_SIZE
        total = body + 8
        if total > self.file_size:
            raise SeekTableError("seek table larger than the file")
        f.seek(self.file_size - total)
        hdr_magic, frame_size = struct.unpack("<II", f.read(8))
        if hdr_magic != SKIPPABLE_MAGIC_SEEKTABLE or frame_size != body:
            raise SeekTableError("seek table skippable frame header is invalid")
        raw = f.read(n * esz)
        entries = []
        for i in range(n):
            if has_ck:
                cs, ds, ck = struct.unpack_from("<III", raw, i * esz)
            else:
                cs, ds = struct.unpack_from("<II", raw, i * esz)
                ck = None
            entries.append(FrameEntry(cs, ds, ck))
        return entries, has_ck, total

    # -- frame access ----------------------------------------------------------
    def read_compressed_frame(self, index: int) -> bytes:
        e = self.entries[index]
        with self._lock:
            self._f.seek(self.c_offsets[index])
            return self._f.read(e.compressed_size)

    def read_frame_header(self, index: int, size: int = 18) -> bytes:
        size = min(size, self.entries[index].compressed_size)
        with self._lock:
            self._f.seek(self.c_offsets[index])
            return self._f.read(size)

    def decompress_frame(self, index: int, verify: bool = True, dctx=None) -> bytes:
        """Decompress one frame; checks size and seek-table checksum.
        (zstd itself also checks the frame's own content checksum.)"""
        e = self.entries[index]
        raw = self.read_compressed_frame(index)
        d = (dctx or zstandard.ZstdDecompressor()).decompress(
            raw, max_output_size=e.decompressed_size
        )
        if verify:
            if len(d) != e.decompressed_size:
                raise SeekTableError(
                    f"frame {index}: decompressed {len(d)} bytes, "
                    f"seek table says {e.decompressed_size}"
                )
            if e.checksum is not None and HAVE_XXHASH:
                if _xxh64_low32(d) != e.checksum:
                    raise SeekTableError(f"frame {index}: XXH64 checksum mismatch")
        return d

    def frame(self, index: int) -> bytes:
        with self._lock:
            hit = self._cache.get(index)
            if hit is not None:
                self._cache.move_to_end(index)
                return hit
        data = self.decompress_frame(index)
        with self._lock:
            self._cache[index] = data
            while len(self._cache) > self._cache_frames:
                self._cache.popitem(last=False)
        return data

    def frame_for_offset(self, offset: int) -> int:
        if not 0 <= offset < self.decompressed_size:
            raise ValueError("offset outside the decompressed stream")
        return bisect.bisect_right(self.d_offsets, offset) - 1

    def read_at(self, offset: int, size: int) -> bytes:
        if size <= 0:
            return b""
        end = min(offset + size, self.decompressed_size)
        out = bytearray()
        pos = offset
        while pos < end:
            i = self.frame_for_offset(pos)
            data = self.frame(i)
            start = pos - self.d_offsets[i]
            take = min(end - pos, len(data) - start)
            out += data[start : start + take]
            pos += take
        return bytes(out)

    def iter_frames(self, threads: int = -1, start: int = 0):
        """Yield ``(index, data)`` for every frame in order, decompressing
        ahead in parallel."""
        threads = resolve_threads(threads)
        tls = threading.local()

        def work(i):
            d = getattr(tls, "d", None)
            if d is None:
                d = tls.d = zstandard.ZstdDecompressor()
            return self.decompress_frame(i, dctx=d)

        with concurrent.futures.ThreadPoolExecutor(max_workers=threads) as pool:
            pending = collections.deque()
            nxt = start
            n = len(self.entries)
            while nxt < n or pending:
                while nxt < n and len(pending) < threads * 2:
                    pending.append((nxt, pool.submit(work, nxt)))
                    nxt += 1
                i, fut = pending.popleft()
                yield i, fut.result()


class SequentialStream:
    """Read-only file object over the decompressed stream (for tarfile 'r|')."""

    def __init__(self, reader: SeekableReader, threads: int = -1,
                 on_frame: Optional[Callable[[int], None]] = None):
        self._it = reader.iter_frames(threads)
        self._buf = memoryview(b"")
        self._on_frame = on_frame
        self.pos = 0

    def read(self, n: int = -1) -> bytes:
        chunks = []
        want = n if n is not None and n >= 0 else None
        while want is None or want > 0:
            if not len(self._buf):
                try:
                    _, data = next(self._it)
                except StopIteration:
                    break
                if self._on_frame:
                    self._on_frame(len(data))
                self._buf = memoryview(data)
            take = len(self._buf) if want is None else min(want, len(self._buf))
            chunks.append(self._buf[:take].tobytes())
            self._buf = self._buf[take:]
            if want is not None:
                want -= take
        out = b"".join(chunks)
        self.pos += len(out)
        return out
