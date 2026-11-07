"""Test-only writer of small .ffpfsc images (PFS v2 + PFSC/zlib + exFAT),
following the layout MkPFS produces.  Used by fake_mkpfs.py so the native
reader is exercised against real container structures.  Not for production:
the real images are written by MkPFS.
"""

import os
import struct
import zlib

SECTOR = 512
CLUSTER = 4096
PFS_BLOCK = 0x10000
PFSC_BLOCK = 0x10000


# ---------------------------------------------------------------- exFAT ----
class _Node:
    def __init__(self, name, path, is_dir, size=0):
        self.name, self.path, self.is_dir, self.size = name, path, is_dir, size
        self.children = []
        self.first = 0
        self.clusters = 0


def _tree(root):
    top = _Node("", root, True)

    def fill(node):
        for name in sorted(os.listdir(node.path)):
            p = os.path.join(node.path, name)
            if os.path.isdir(p):
                c = _Node(name, p, True)
                fill(c)
            else:
                c = _Node(name, p, False, os.path.getsize(p))
            node.children.append(c)
    fill(top)
    return top


def _set_len(child):
    return 2 + (len(child.name) + 14) // 15


def build_exfat(src_dir, fragment=True):
    root = _tree(src_dir)
    order = []

    def plan(node):
        order.append(node)
        for c in node.children:
            if c.is_dir:
                plan(c)
            else:
                order.append(c)
    plan(root)
    for n in order:
        if n.is_dir:
            nbytes = sum(_set_len(c) for c in n.children) * 32 + 32
            n.clusters = max(1, -(-nbytes // CLUSTER))
        else:
            n.clusters = -(-n.size // CLUSTER)
    total = sum(n.clusters for n in order)
    fat_entries = total + 2
    fat_sectors = -(-fat_entries * 4 // SECTOR)
    fat_off = 24
    heap_off = fat_off + fat_sectors
    heap_off += (-heap_off) % (CLUSTER // SECTOR)
    fat = [0xFFFFFFF8, 0xFFFFFFFF] + [0] * total

    # Allocate. With fragment=True, multi-cluster files get their clusters in
    # reverse order so the reader must follow the FAT chain.
    nxt = 2
    for n in order:
        if not n.clusters:
            continue
        cl = list(range(nxt, nxt + n.clusters))
        nxt += n.clusters
        if fragment and not n.is_dir and len(cl) > 1:
            cl = [cl[0]] + cl[:0:-1]
        n.first = cl[0]
        for a, b in zip(cl, cl[1:]):
            fat[a] = b
        fat[cl[-1]] = 0xFFFFFFFF
        n.chain = cl

    heap = bytearray(total * CLUSTER)

    def put(cluster_list, data):
        for i, c in enumerate(cluster_list):
            piece = data[i * CLUSTER:(i + 1) * CLUSTER]
            o = (c - 2) * CLUSTER
            heap[o:o + len(piece)] = piece

    for n in order:
        if n.is_dir:
            blob = bytearray()
            for c in n.children:
                length = c.clusters * CLUSTER if c.is_dir else c.size
                secondary = _set_len(c) - 1
                fe = bytearray(32)
                fe[0], fe[1] = 0x85, secondary
                struct.pack_into("<H", fe, 4, 0x10 if c.is_dir else 0x20)
                st = bytearray(32)
                st[0], st[1], st[3] = 0xC0, 0x01 if c.first else 0x00, len(c.name)
                struct.pack_into("<Q", st, 8, length)
                struct.pack_into("<I", st, 0x14, c.first)
                struct.pack_into("<Q", st, 0x18, length)
                names = bytearray()
                u = c.name.encode("utf-16-le")
                for k in range(secondary - 1):
                    ne = bytearray(32)
                    ne[0] = 0xC1
                    chunk = u[k * 30:(k + 1) * 30]
                    ne[2:2 + len(chunk)] = chunk
                    names += ne
                blob += fe + st + names
            put(n.chain, bytes(blob))
        elif n.clusters:
            with open(n.path, "rb") as f:
                put(n.chain, f.read())

    vbr = bytearray(SECTOR)
    vbr[0:3] = b"\xeb\x76\x90"
    vbr[3:11] = b"EXFAT   "
    vol_sectors = heap_off + total * CLUSTER // SECTOR
    struct.pack_into("<Q", vbr, 0x48, vol_sectors)
    struct.pack_into("<IIIII", vbr, 0x50, fat_off, fat_sectors, heap_off, total, root.first)
    vbr[0x6C], vbr[0x6D] = 9, 3  # 512-byte sectors, 8 sectors per cluster
    vbr[510:512] = b"\x55\xaa"
    image = bytearray(heap_off * SECTOR)
    image[0:SECTOR] = vbr
    fat_bytes = struct.pack(f"<{len(fat)}I", *fat)
    image[fat_off * SECTOR:fat_off * SECTOR + len(fat_bytes)] = fat_bytes
    return bytes(image + heap)


# ----------------------------------------------------------- PFS + PFSC ----
def encode_pfsc(raw, level=6):
    n = -(-len(raw) // PFSC_BLOCK)
    blocks = []
    for i in range(n):
        blk = raw[i * PFSC_BLOCK:(i + 1) * PFSC_BLOCK].ljust(PFSC_BLOCK, b"\0")
        z = zlib.compress(blk, level)
        blocks.append(z if len(z) < PFSC_BLOCK else blk)
    data_start = 0x10000
    assert 0x400 + (n + 1) * 8 <= data_start
    offs = [data_start]
    for b in blocks:
        offs.append(offs[-1] + len(b))
    head = bytearray(data_start)
    struct.pack_into("<IIIIqqQq", head, 0, 0x43534650, 0, 6, PFSC_BLOCK, PFSC_BLOCK,
                     0x400, data_start, n * PFSC_BLOCK)
    struct.pack_into(f"<{n + 1}Q", head, 0x400, *offs)
    return bytes(head) + b"".join(blocks)


def _dirent(ino, typ, name):
    nb = name.encode("ascii")
    size = len(nb) + 17
    size += (-size) % 8
    return struct.pack("<Iiii", ino, typ, len(nb), size) + nb + b"\0" * (size - 16 - len(nb))


def _inode(mode, flags, size, size_c, first_block, nblocks):
    b = bytearray(0xA8)
    struct.pack_into("<HHI", b, 0, mode, 1, flags)
    struct.pack_into("<qq", b, 8, size, size_c)
    struct.pack_into("<I", b, 0x60, nblocks)
    struct.pack_into("<i", b, 0x64, first_block)
    return bytes(b)


def build_pfs(inner_name, inner_raw, level=6, version=2, tamper=None):
    payload = encode_pfsc(inner_raw, level)
    if tamper:
        payload = tamper(payload)
    blocks_of = lambda n: max(1, -(-n // PFS_BLOCK))  # noqa: E731
    super_root = _dirent(0, 4, ".") + _dirent(0, 5, "..") + \
        _dirent(1, 2, "flat_path_table") + _dirent(2, 3, "uroot")
    uroot = _dirent(2, 4, ".") + _dirent(0, 5, "..") + _dirent(3, 2, inner_name)
    fpt = struct.pack("<II", 0x12345678, 3)
    # blocks: 0 header, 1 inodes, 2 superroot, 3 uroot, 4 fpt, 5.. payload
    first_payload = 5
    nblocks_payload = blocks_of(len(payload))
    ndblock = first_payload + nblocks_payload
    inodes = (_inode(0x4000 | 0o555, 0, len(super_root), len(super_root), 2, 1)
              + _inode(0x8000 | 0o444, 0, len(fpt), len(fpt), 4, 1)
              + _inode(0x4000 | 0o555, 0, len(uroot), len(uroot), 3, 1)
              + _inode(0x8000 | 0o444, 1, len(payload), len(inner_raw), first_payload, nblocks_payload))
    hdr = bytearray(PFS_BLOCK)
    struct.pack_into("<qq", hdr, 0, version, 20130315)
    hdr[0x1A] = 1
    struct.pack_into("<H", hdr, 0x1C, 0x8)
    struct.pack_into("<I", hdr, 0x20, PFS_BLOCK)
    struct.pack_into("<qqqq", hdr, 0x28, 1, 4, ndblock, 1)

    def blk(data):
        return data + b"\0" * ((-len(data)) % PFS_BLOCK)
    out = bytes(hdr) + blk(inodes) + blk(super_root) + blk(uroot) + blk(fpt) + blk(payload)
    assert len(out) == ndblock * PFS_BLOCK
    return out


def build_ffpfsc(src_dir, out_path, title_id, level=6, **kw):
    raw = build_exfat(src_dir)
    with open(out_path, "wb") as f:
        f.write(build_pfs(f"{title_id}.exfat", raw, level, **kw))
