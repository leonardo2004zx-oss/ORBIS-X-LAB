"""Native reader for the outer container of a ``.ffpfsc`` image (PFS + PFSC).

Written from the on-disk layout used by MkPFS (PSBrew, the engine behind
SadykovIV/PS4pkg_to_ffpfsc).  Only *unsigned, unencrypted* images are
supported, which is what MkPFS produces for ShadowMountPlus.

PFS image (little endian, block size usually 0x10000)::

    block 0  header
        0x00 i64 version        1 = PS4 profile, 2 = PS5 profile
        0x08 i64 magic          20130315
        0x1A u8  readonly
        0x1C u16 mode           0x1 signed, 0x2 64-bit inodes,
                                0x4 encrypted, 0x8 case-insensitive
        0x20 u32 block_size
        0x28 i64 nblock         leading blocks (1)
        0x30 i64 inode_count
        0x38 i64 ndblock        total data blocks
        0x40 i64 inode_block_count
    blocks 1..N   inode table, 0xA8-byte "D32" inodes:
        0x00 u16 mode (0x4000 dir, 0x8000 file)  0x02 u16 nlink  0x04 u32 flags (0x1 = PFSC)
        0x08 i64 size           stored size if compressed, else logical size
        0x10 i64 size_compressed logical size if compressed, else stored size
        0x60 u32 blocks         0x64 i32[12] direct blocks  0x94 i32[5] indirect
    block N+1   super-root directory: "flat_path_table", "collision_resolver", "uroot"
    uroot       user root: for .ffpfsc a single file, CUSAxxxxx.exfat

    dirent: u32 inode, i32 type (2 file, 3 dir, 4 ".", 5 ".."), i32 name_len,
            i32 entry_size (name_len + 17 rounded up to 8), ASCII name

PFSC (payload of a compressed inode, stored contiguously from db[0])::

    0x00 u32 magic 0x43534650 ("PFSC")   0x04 u32 0   0x08 u32 6
    0x0C u32 block_size (0x10000)         0x10 u64 block_size again
    0x18 u64 offsets_table (0x400)        0x20 u64 data_start (>= 0x10000)
    0x28 u64 logical_size (multiple of block_size)
    0x400 u64[blocks + 1] offsets of each stored block (relative to payload)
    block i = payload[off[i]:off[i+1]]; if shorter than 64 KiB it is a zlib
    stream (RFC 1950) that must inflate to exactly 64 KiB, else it is raw.
"""

from __future__ import annotations

import collections
import concurrent.futures
import os
import struct
import threading
import zlib
from dataclasses import dataclass
from typing import BinaryIO, Callable, Dict, List, Optional

PFS_MAGIC = 20130315
MODE_SIGNED = 0x1
MODE_64BIT_INODES = 0x2
MODE_ENCRYPTED = 0x4
MODE_CASE_INSENSITIVE = 0x8
INODE_DIR = 0x4000
INODE_FILE = 0x8000
INODE_FLAG_COMPRESSED = 0x1
INODE_SIZE = 0xA8
DIRENT_FILE, DIRENT_DIR, DIRENT_DOT, DIRENT_DOTDOT = 2, 3, 4, 5

PFSC_MAGIC = 0x43534650
PFSC_UNK8 = 6
PFSC_BLOCK = 0x10000
PFSC_OFFSETS_AT = 0x400
PFSC_MIN_DATA = 0x10000


class PfsError(ValueError):
    pass


@dataclass
class PfsHeader:
    version: int
    mode: int
    readonly: int
    block_size: int
    nblock: int
    inode_count: int
    ndblock: int
    inode_block_count: int

    @property
    def profile(self) -> str:
        return {1: "PS4", 2: "PS5"}.get(self.version, f"v{self.version}")

    def mode_flags(self) -> List[str]:
        names = []
        for bit, name in ((MODE_SIGNED, "firmado"), (MODE_64BIT_INODES, "inodos 64 bits"),
                          (MODE_ENCRYPTED, "cifrado"),
                          (MODE_CASE_INSENSITIVE, "sin distinguir mayúsculas")):
            if self.mode & bit:
                names.append(name)
        if not self.mode & MODE_64BIT_INODES:
            names.append("inodos 32 bits")
        return names


@dataclass
class PfsInode:
    number: int
    mode: int
    flags: int
    size: int
    size_compressed: int
    blocks: int
    db: List[int]
    ib: List[int]

    @property
    def is_dir(self) -> bool:
        return bool(self.mode & INODE_DIR)

    @property
    def is_compressed(self) -> bool:
        return bool(self.flags & INODE_FLAG_COMPRESSED)

    @property
    def stored_size(self) -> int:
        return self.size if self.is_compressed else self.size_compressed

    @property
    def logical_size(self) -> int:
        return self.size_compressed if self.is_compressed else self.size


@dataclass
class Dirent:
    inode: int
    type: int
    name: str


def parse_dirents(blob: bytes) -> List[Dirent]:
    out, off = [], 0
    while off + 16 <= len(blob):
        ino, typ, nlen, esz = struct.unpack_from("<Iiii", blob, off)
        if ino == 0 and typ == 0 and nlen == 0 and esz == 0:
            break
        if esz < 17 or esz % 8 or nlen < 0 or nlen > esz - 16 or off + esz > len(blob):
            raise PfsError(f"entrada de directorio inválida en el desplazamiento {off}")
        out.append(Dirent(ino, typ, blob[off + 16: off + 16 + nlen].decode("ascii", "replace")))
        off += esz
    return out


class PfsImage:
    """Open an unsigned/unencrypted PFS image and read its files."""

    def __init__(self, path: str):
        self.path = path
        self.f: BinaryIO = open(path, "rb")
        self.file_size = os.fstat(self.f.fileno()).st_size
        self._lock = threading.Lock()
        try:
            self.header = self._read_header()
            self.inodes = self._read_inodes()
            self.superroot = self._read_superroot()
            self.uroot = self._find_entry(self.superroot, "uroot")
            self.root_entries = [d for d in self.list_dir(self.uroot)
                                 if d.type not in (DIRENT_DOT, DIRENT_DOTDOT)]
        except Exception:
            self.f.close()
            raise

    def close(self):
        self.f.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # -- low level -------------------------------------------------------------
    def pread(self, offset: int, size: int) -> bytes:
        with self._lock:
            self.f.seek(offset)
            data = self.f.read(size)
        if len(data) != size:
            raise PfsError(f"archivo truncado: se esperaban {size} bytes en {offset}")
        return data

    def _read_header(self) -> PfsHeader:
        if self.file_size < 0x400:
            raise PfsError("archivo demasiado pequeño para ser una imagen PFS")
        h = self.pread(0, 0x400)
        version, magic = struct.unpack_from("<qq", h, 0)
        if magic != PFS_MAGIC:
            raise PfsError(f"magic PFS incorrecto ({magic}); no es una imagen .ffpfsc")
        hdr = PfsHeader(
            version=version,
            readonly=h[0x1A],
            mode=struct.unpack_from("<H", h, 0x1C)[0],
            block_size=struct.unpack_from("<I", h, 0x20)[0],
            nblock=struct.unpack_from("<q", h, 0x28)[0],
            inode_count=struct.unpack_from("<q", h, 0x30)[0],
            ndblock=struct.unpack_from("<q", h, 0x38)[0],
            inode_block_count=struct.unpack_from("<q", h, 0x40)[0],
        )
        if hdr.mode & (MODE_SIGNED | MODE_ENCRYPTED):
            raise PfsError("imagen firmada o cifrada: no soportada (ShadowMountPlus usa imágenes sin firmar)")
        if hdr.block_size < 0x1000 or hdr.block_size & (hdr.block_size - 1):
            raise PfsError(f"tamaño de bloque PFS inválido: {hdr.block_size}")
        if hdr.inode_count <= 0 or hdr.inode_block_count <= 0:
            raise PfsError("tabla de inodos vacía")
        if hdr.ndblock * hdr.block_size > self.file_size:
            raise PfsError(f"la imagen declara {hdr.ndblock} bloques pero el archivo es más pequeño "
                           "(¿copia incompleta?)")
        return hdr

    def _read_inodes(self) -> List[PfsInode]:
        bs = self.header.block_size
        per_block = bs // INODE_SIZE
        out: List[PfsInode] = []
        for b in range(self.header.inode_block_count):
            blob = self.pread((1 + b) * bs, bs)
            for i in range(per_block):
                if len(out) >= self.header.inode_count:
                    return out
                o = i * INODE_SIZE
                mode, _nlink, flags = struct.unpack_from("<HHI", blob, o)
                size, size_c = struct.unpack_from("<qq", blob, o + 0x08)
                blocks = struct.unpack_from("<I", blob, o + 0x60)[0]
                db = list(struct.unpack_from("<12i", blob, o + 0x64))
                ib = list(struct.unpack_from("<5i", blob, o + 0x94))
                out.append(PfsInode(len(out), mode, flags, size, size_c, blocks, db, ib))
        return out

    def _read_superroot(self) -> List[Dirent]:
        bs = self.header.block_size
        return parse_dirents(self.pread((1 + self.header.inode_block_count) * bs, bs))

    @staticmethod
    def _find_entry(entries: List[Dirent], name: str) -> int:
        for d in entries:
            if d.name == name:
                return d.inode
        raise PfsError(f"falta la entrada '{name}' en el super-root")

    def inode(self, n: int) -> PfsInode:
        if not 0 <= n < len(self.inodes):
            raise PfsError(f"número de inodo fuera de rango: {n}")
        return self.inodes[n]

    def stored_offset(self, ino: PfsInode) -> int:
        start = ino.db[0] * self.header.block_size
        if ino.blocks and (ino.db[0] <= 0 or start + ino.stored_size > self.file_size):
            raise PfsError(f"los datos del inodo {ino.number} quedan fuera del archivo")
        return start

    def list_dir(self, n: int) -> List[Dirent]:
        ino = self.inode(n)
        if not ino.is_dir:
            raise PfsError(f"el inodo {n} no es un directorio")
        if ino.blocks <= 0:
            return []
        return parse_dirents(self.pread(self.stored_offset(ino), ino.stored_size))

    def open_file(self, n: int) -> "InodeReader":
        return InodeReader(self, self.inode(n))

    def find_root_file(self, name: str) -> Optional[Dirent]:
        lname = name.lower()
        for d in self.root_entries:
            if d.name == name or (self.header.mode & MODE_CASE_INSENSITIVE and d.name.lower() == lname):
                return d
        return None


class InodeReader:
    """Random-access reader of a file's *logical* bytes (raw or PFSC)."""

    def __init__(self, img: PfsImage, ino: PfsInode, cache_blocks: int = 64):
        self.img = img
        self.ino = ino
        self.size = ino.logical_size
        self.base = img.stored_offset(ino)
        self._cache: "collections.OrderedDict[int, bytes]" = collections.OrderedDict()
        self._cache_blocks = cache_blocks
        self._lock = threading.Lock()
        self.compressed = ino.is_compressed
        if self.compressed:
            self._parse_pfsc()

    def _parse_pfsc(self) -> None:
        stored = self.ino.stored_size
        if stored < 0x30:
            raise PfsError("carga PFSC demasiado pequeña")
        (magic, unk4, unk8, bsz, bsz2, offs_at, data_at, logical) = struct.unpack(
            "<IIIIqqQq", self.img.pread(self.base, 0x30))
        if magic != PFSC_MAGIC:
            raise PfsError(f"magic PFSC incorrecto 0x{magic:08X}")
        if unk4 != 0 or unk8 != PFSC_UNK8:
            raise PfsError(f"cabecera PFSC inesperada (unk4={unk4}, unk8={unk8})")
        if bsz != PFSC_BLOCK or bsz2 != bsz:
            raise PfsError(f"tamaño de bloque PFSC {bsz}/{bsz2}, se esperaba {PFSC_BLOCK}")
        if offs_at != PFSC_OFFSETS_AT or data_at < PFSC_MIN_DATA or data_at > stored:
            raise PfsError("desplazamientos de la cabecera PFSC inválidos")
        if logical < 0 or logical % bsz or logical < self.size:
            raise PfsError(f"tamaño lógico PFSC {logical} incoherente con el inodo ({self.size})")
        n = logical // bsz
        if offs_at + (n + 1) * 8 > data_at:
            raise PfsError("la tabla de desplazamientos PFSC se solapa con los datos")
        offs = struct.unpack(f"<{n + 1}Q", self.img.pread(self.base + offs_at, (n + 1) * 8))
        if offs[0] != data_at:
            raise PfsError("la tabla PFSC no empieza en data_start")
        if offs[-1] > stored:
            raise PfsError("la tabla PFSC apunta más allá de los datos guardados")
        for i in range(n):
            if offs[i + 1] < offs[i]:
                raise PfsError(f"tabla PFSC no monótona en el bloque {i}")
            if offs[i + 1] - offs[i] > bsz:
                raise PfsError(f"bloque PFSC {i} mayor que el tamaño lógico")
        self.block_size = bsz
        self.block_count = n
        self.offsets = offs
        self.pfsc_logical = logical
        self.data_start = data_at

    # -- PFSC blocks ----------------------------------------------------------
    def stored_block(self, i: int) -> bytes:
        return self.img.pread(self.base + self.offsets[i], self.offsets[i + 1] - self.offsets[i])

    def decode_block(self, i: int, stored: bytes) -> bytes:
        if len(stored) == self.block_size:
            return stored
        try:
            out = zlib.decompress(stored)
        except zlib.error as e:
            raise PfsError(f"bloque PFSC {i}: zlib corrupto ({e})") from e
        if len(out) != self.block_size:
            raise PfsError(f"bloque PFSC {i}: descomprime a {len(out)} bytes, no {self.block_size}")
        return out

    def block(self, i: int) -> bytes:
        with self._lock:
            hit = self._cache.get(i)
            if hit is not None:
                self._cache.move_to_end(i)
                return hit
        data = self.decode_block(i, self.stored_block(i))
        with self._lock:
            self._cache[i] = data
            while len(self._cache) > self._cache_blocks:
                self._cache.popitem(last=False)
        return data

    def read_at(self, offset: int, size: int) -> bytes:
        if offset < 0:
            raise ValueError("offset negativo")
        end = min(self.size, offset + max(0, size))
        if offset >= end:
            return b""
        if not self.compressed:
            return self.img.pread(self.base + offset, end - offset)
        out = bytearray()
        pos = offset
        while pos < end:
            i = pos // self.block_size
            blk = self.block(i)
            start = pos - i * self.block_size
            take = min(end - pos, self.block_size - start)
            out += blk[start: start + take]
            pos += take
        return bytes(out)

    def verify_all_blocks(self, threads: int = -1,
                          progress: Optional[Callable[[int, int], None]] = None,
                          batch: int = 256) -> Dict[str, int]:
        """Inflate every PFSC block (in parallel) and check each one.
        Returns counters; raises PfsError on the first bad block."""
        if not self.compressed:
            return {"blocks": 0, "zlib_blocks": 0, "raw_blocks": 0, "stored_bytes": self.ino.stored_size}
        threads = max(1, os.cpu_count() or 1) if threads is None or threads <= 0 else threads
        n = self.block_count
        zlib_blocks = 0

        def check(args):
            i, stored = args
            self.decode_block(i, stored)
            return len(stored) < self.block_size

        with concurrent.futures.ThreadPoolExecutor(max_workers=threads) as pool:
            for start in range(0, n, batch):
                stop = min(n, start + batch)
                # one sequential read per batch, then split into blocks
                lo, hi = self.offsets[start], self.offsets[stop]
                chunk = self.img.pread(self.base + lo, hi - lo)
                items = [(i, chunk[self.offsets[i] - lo: self.offsets[i + 1] - lo])
                         for i in range(start, stop)]
                zlib_blocks += sum(pool.map(check, items))
                if progress:
                    progress(stop, n)
        return {"blocks": n, "zlib_blocks": zlib_blocks, "raw_blocks": n - zlib_blocks,
                "stored_bytes": self.ino.stored_size}
