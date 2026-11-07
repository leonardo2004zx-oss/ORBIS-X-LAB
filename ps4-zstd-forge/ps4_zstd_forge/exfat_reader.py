"""Minimal read-only exFAT reader (enough to list and read the game files
inside the ``CUSAxxxxx.exfat`` that a ``.ffpfsc`` wraps).

Works over any object with ``read_at(offset, size)`` and ``size``, e.g. the
PFSC ``InodeReader``, so nothing is decompressed to disk.

exFAT essentials (Microsoft exFAT specification):
  boot sector: 0x03 "EXFAT   ", 0x50 FatOffset, 0x54 FatLength,
  0x58 ClusterHeapOffset, 0x5C ClusterCount, 0x60 FirstClusterOfRootDirectory
  (all in sectors / clusters), 0x6C BytesPerSectorShift,
  0x6D SectorsPerClusterShift, 0x1FE 0x55AA.
  cluster N (N >= 2) is at heap + (N - 2) * cluster_size; the FAT is an
  array of u32 "next cluster" (0xFFFFFFFF = end).
  directory entry set (32 bytes each): 0x85 File (attributes at +4, 0x10 =
  directory), 0xC0 Stream Extension (+1 flags: bit1 NoFatChain, +3 name
  length, +8 ValidDataLength, +0x14 FirstCluster, +0x18 DataLength),
  0xC1 File Name (15 UTF-16LE chars at +2).
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from typing import Dict, Iterator, List, Optional

END_OF_CHAIN = 0xFFFFFFF8  # >= this ends a FAT chain
BAD_CLUSTER = 0xFFFFFFF7
ATTR_DIRECTORY = 0x10


class ExfatError(ValueError):
    pass


@dataclass
class ExfatEntry:
    name: str
    path: str
    is_dir: bool
    first_cluster: int
    data_length: int
    valid_length: int
    contiguous: bool
    children: Optional[List["ExfatEntry"]] = field(default=None, repr=False)


class ExfatReader:
    def __init__(self, dev):
        self.dev = dev
        bs = dev.read_at(0, 512)
        if len(bs) < 512 or bs[3:11] != b"EXFAT   ":
            raise ExfatError("la imagen interna no es exFAT (falta la firma 'EXFAT   ')")
        if bs[510:512] != b"\x55\xaa":
            raise ExfatError("firma 0x55AA del sector de arranque exFAT ausente")
        self.sector = 1 << bs[0x6C]
        self.cluster = self.sector << bs[0x6D]
        if not 512 <= self.sector <= 4096 or self.cluster > 32 * 2**20:
            raise ExfatError("geometría exFAT inválida")
        fat_off, fat_len, heap_off, self.cluster_count, self.root_cluster = struct.unpack_from(
            "<IIIII", bs, 0x50)
        self.fat_offset = fat_off * self.sector
        self.fat_length = fat_len * self.sector
        self.heap = heap_off * self.sector
        if (self.cluster_count + 2) * 4 > self.fat_length or self.root_cluster < 2:
            raise ExfatError("tabla FAT o directorio raíz inválidos")
        self.volume_bytes = struct.unpack_from("<Q", bs, 0x48)[0] * self.sector
        self._fat_cache: Dict[int, bytes] = {}

    # -- clusters ---------------------------------------------------------------
    def _fat(self, n: int) -> int:
        page = (n * 4) // 65536
        blob = self._fat_cache.get(page)
        if blob is None:
            blob = self.dev.read_at(self.fat_offset + page * 65536, 65536)
            if len(self._fat_cache) > 256:
                self._fat_cache.clear()
            self._fat_cache[page] = blob
        return struct.unpack_from("<I", blob, (n * 4) % 65536)[0]

    def _cluster_offset(self, n: int) -> int:
        if not 2 <= n < self.cluster_count + 2:
            raise ExfatError(f"clúster fuera de rango: {n}")
        return self.heap + (n - 2) * self.cluster

    def _chain(self, first: int, length: int, contiguous: bool) -> Iterator[int]:
        count = (length + self.cluster - 1) // self.cluster
        if count == 0:
            return
        if contiguous:
            for i in range(count):
                yield first + i
            return
        n, seen = first, 0
        while seen < count:
            if n < 2 or n >= BAD_CLUSTER:
                raise ExfatError(f"cadena FAT rota en el clúster {n}")
            yield n
            seen += 1
            n = self._fat(n)
            if seen > self.cluster_count:
                raise ExfatError("bucle en la cadena FAT")

    def read_stream(self, entry: ExfatEntry, chunk: int = 4 * 2**20) -> Iterator[bytes]:
        """Yield the file contents (ValidDataLength bytes, then zeros up to
        DataLength), merging runs of consecutive clusters into big reads."""
        remaining = entry.valid_length
        run_start = run_len = None
        for c in self._chain(entry.first_cluster, entry.valid_length, entry.contiguous):
            if run_start is not None and c == run_start + run_len and run_len * self.cluster < chunk:
                run_len += 1
                continue
            if run_start is not None:
                take = min(remaining, run_len * self.cluster)
                yield self.dev.read_at(self._cluster_offset(run_start), take)
                remaining -= take
            run_start, run_len = c, 1
        if run_start is not None and remaining > 0:
            take = min(remaining, run_len * self.cluster)
            yield self.dev.read_at(self._cluster_offset(run_start), take)
            remaining -= take
        if remaining:
            raise ExfatError(f"{entry.path}: faltan {remaining} bytes en la cadena de clústeres")
        pad = entry.data_length - entry.valid_length
        while pad > 0:
            z = min(pad, chunk)
            yield b"\x00" * z
            pad -= z

    def read_file(self, entry: ExfatEntry) -> bytes:
        return b"".join(self.read_stream(entry))

    # -- directories ------------------------------------------------------------
    def _dir_bytes(self, first: int, length: Optional[int], contiguous: bool) -> bytes:
        if length is None:  # root: follow the FAT until end of chain
            out, n, guard = bytearray(), first, 0
            while 2 <= n < BAD_CLUSTER:
                out += self.dev.read_at(self._cluster_offset(n), self.cluster)
                n = self._fat(n)
                guard += 1
                if guard > self.cluster_count:
                    raise ExfatError("bucle en la cadena FAT del directorio raíz")
            return bytes(out)
        return b"".join(self.dev.read_at(self._cluster_offset(c), self.cluster)
                        for c in self._chain(first, length, contiguous))

    def _parse_dir(self, blob: bytes, parent: str) -> List[ExfatEntry]:
        out: List[ExfatEntry] = []
        i, n = 0, len(blob) // 32
        while i < n:
            e = blob[i * 32:(i + 1) * 32]
            t = e[0]
            if t == 0x00:
                break
            if t != 0x85:
                i += 1
                continue
            secondary = e[1]
            attrs = struct.unpack_from("<H", e, 4)[0]
            if secondary < 2 or i + secondary >= n:
                raise ExfatError("conjunto de entradas de directorio truncado")
            st = blob[(i + 1) * 32:(i + 2) * 32]
            if st[0] != 0xC0:
                raise ExfatError("entrada de archivo sin Stream Extension")
            flags, name_len = st[1], st[3]
            valid, = struct.unpack_from("<Q", st, 8)
            first, = struct.unpack_from("<I", st, 0x14)
            length, = struct.unpack_from("<Q", st, 0x18)
            name_units = b""
            for k in range(2, secondary + 1):
                ne = blob[(i + k) * 32:(i + k + 1) * 32]
                if ne[0] == 0xC1:
                    name_units += ne[2:32]
            name = name_units[: name_len * 2].decode("utf-16-le", "replace")
            path = f"{parent}/{name}" if parent else name
            out.append(ExfatEntry(name=name, path=path, is_dir=bool(attrs & ATTR_DIRECTORY),
                                  first_cluster=first, data_length=length,
                                  valid_length=min(valid, length),
                                  contiguous=bool(flags & 0x02)))
            i += 1 + secondary
        return out

    def list_dir(self, entry: Optional[ExfatEntry] = None) -> List[ExfatEntry]:
        if entry is None:
            return self._parse_dir(self._dir_bytes(self.root_cluster, None, False), "")
        if entry.children is None:
            entry.children = self._parse_dir(
                self._dir_bytes(entry.first_cluster, entry.data_length, entry.contiguous),
                entry.path) if entry.data_length else []
        return entry.children

    def walk(self) -> Iterator[ExfatEntry]:
        stack = list(reversed(self.list_dir()))
        while stack:
            e = stack.pop()
            yield e
            if e.is_dir:
                stack.extend(reversed(self.list_dir(e)))

    def find(self, path: str) -> Optional[ExfatEntry]:
        """Case-insensitive lookup of 'dir/sub/file'."""
        parts = [p for p in path.replace("\\", "/").split("/") if p]
        entries = self.list_dir()
        cur = None
        for idx, part in enumerate(parts):
            cur = next((e for e in entries if e.name.lower() == part.lower()), None)
            if cur is None:
                return None
            if idx < len(parts) - 1:
                if not cur.is_dir:
                    return None
                entries = self.list_dir(cur)
        return cur
