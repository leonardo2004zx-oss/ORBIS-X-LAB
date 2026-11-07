"""Post-pack verification.

quick: seek table, every zstd frame header, footer/manifest, tar layout,
       a random sample of frames fully decompressed (checksums) and, when
       the source folder is available, compared byte for byte with it.
full:  decompresses the whole archive, re-reads every tar member and
       checks its SHA-256 against the manifest (and against the source
       folder if given).
"""

from __future__ import annotations

import bisect
import hashlib
import os
import random
import tarfile
from dataclasses import dataclass, field
from typing import Callable, List, Optional

import zstandard

from .archive import FOOTER_NAME, MANIFEST_NAME, open_archive, read_tar_member_at
from .packer import scan_tree
from .seekable import SequentialStream, ZSTD_FRAME_MAGIC
from .sfo import find_game_root


@dataclass
class Check:
    name: str
    ok: bool
    detail: str


@dataclass
class VerifyReport:
    mode: str
    checks: List[Check] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(c.ok for c in self.checks)

    def add(self, name, ok, detail):
        self.checks.append(Check(name, bool(ok), detail))

    def summary(self) -> str:
        n_ok = sum(c.ok for c in self.checks)
        label = "Verificación rápida" if self.mode == "quick" else "Verificación completa"
        state = "superada" if self.ok else "FALLIDA"
        return f"{label} {state}: {n_ok}/{len(self.checks)} comprobaciones"


def gib(n: int) -> str:
    return f"{n / 2**30:.2f} GiB"


def _src_path(root: str, rel: str) -> str:
    return os.path.join(root, *rel.split("/"))


def verify(
    archive_path: str,
    source: Optional[str] = None,
    mode: str = "quick",
    sample_percent: float = 10.0,
    threads: int = -1,
    seed: Optional[int] = None,
    progress: Optional[Callable[[int, int], None]] = None,
) -> VerifyReport:
    rep = VerifyReport(mode=mode)
    try:
        reader, footer, manifest = open_archive(archive_path)
    except Exception as e:  # noqa: BLE001 - report any structural failure
        rep.add("cabeceras", False, f"no se pudo abrir el archivo: {e}")
        return rep
    src_root = find_game_root(source) if source else None
    try:
        _structure_checks(rep, reader, footer, manifest)
        if src_root:
            _source_manifest_check(rep, manifest, src_root)
        if mode == "full":
            _full_check(rep, reader, manifest, src_root, threads, progress)
        else:
            _sample_check(rep, reader, manifest, src_root, sample_percent, seed, progress)
    finally:
        reader.close()
    return rep


# ---------------------------------------------------------------------------


def _structure_checks(rep, reader, footer, manifest):
    n = len(reader.entries)
    expected = reader.compressed_frames_size + reader.seek_table_size
    rep.add(
        "tabla de búsqueda",
        expected == reader.file_size,
        f"{n} tramas zstd, {reader.file_size} bytes "
        f"({'con' if reader.has_checksums else 'sin'} checksums XXH64)",
    )

    bad = []
    for i, e in enumerate(reader.entries):
        hdr = reader.read_frame_header(i)
        magic = int.from_bytes(hdr[:4], "little")
        if magic != ZSTD_FRAME_MAGIC:
            bad.append(f"trama {i}: magic {magic:#x}")
        else:
            try:
                p = zstandard.get_frame_parameters(hdr)
                if p.content_size != e.decompressed_size:
                    bad.append(f"trama {i}: tamaño {p.content_size} != {e.decompressed_size}")
            except zstandard.ZstdError as ex:
                bad.append(f"trama {i}: {ex}")
        if len(bad) >= 5:
            break
    rep.add(
        "cabeceras de tramas",
        not bad,
        f"{n} cabeceras zstd coinciden con la tabla" if not bad else "; ".join(bad),
    )

    mbytes = reader.read_at(footer["manifest_offset"], footer["manifest_size"])
    msha = hashlib.sha256(mbytes).hexdigest()
    files = manifest.get("files", [])
    totals = manifest.get("totals", {})
    rep.add(
        "manifiesto",
        msha == footer.get("manifest_sha256")
        and len(files) == totals.get("files") == footer.get("files"),
        f"{MANIFEST_NAME}: {len(files)} archivos, SHA-256 "
        f"{'correcto' if msha == footer.get('manifest_sha256') else 'INCORRECTO'}",
    )

    # Tar layout: offsets increasing, inside the stream, sizes add up.
    problems = []
    last_end = 0
    size_sum = 0
    for f in files:
        if f["h"] < last_end or f["o"] < f["h"] + 512:
            problems.append(f"{f['p']}: desplazamiento incoherente")
        last_end = f["o"] + f["s"]
        size_sum += f["s"]
        if len(problems) >= 5:
            break
    if last_end > footer["manifest_offset"]:
        problems.append("los datos se solapan con el manifiesto")
    rep.add(
        "tamaños",
        not problems and size_sum == totals.get("bytes"),
        f"{size_sum} bytes en {len(files)} archivos"
        + ("" if not problems else " · " + "; ".join(problems)),
    )


def _source_manifest_check(rep, manifest, src_root):
    scan = scan_tree(src_root)
    src = {rel: size for rel, size, _ in scan.files}
    man = {f["p"]: f["s"] for f in manifest["files"]}
    missing = sorted(set(src) - set(man))
    extra = sorted(set(man) - set(src))
    diff = sorted(p for p in set(src) & set(man) if src[p] != man[p])
    ok = not (missing or extra or diff)
    detail = f"{len(man)} archivos, mismas rutas que el origen"
    if not ok:
        detail = (f"faltan {len(missing)}, sobran {len(extra)}, tamaño distinto {len(diff)}: "
                  + ", ".join((missing + extra + diff)[:5]))
    rep.add("rutas vs origen", ok, detail)
    ed_ok = sorted(scan.empty_dirs) == sorted(manifest.get("empty_dirs", []))
    rep.add("carpetas vacías", ed_ok,
            f"{len(manifest.get('empty_dirs', []))} coinciden" if ed_ok else
            f"origen {len(scan.empty_dirs)} != archivo {len(manifest.get('empty_dirs', []))}")


def _sample_check(rep, reader, manifest, src_root, sample_percent, seed, progress):
    files = manifest["files"]
    starts = [f["o"] for f in files]
    hdrs = [f["h"] for f in files]
    n = len(reader.entries)
    k = max(min(n, 32), int(round(n * sample_percent / 100.0)))
    rng = random.Random(seed)
    sample = set(rng.sample(range(n), min(k, n)))
    sample.update({0, n - 1})
    sample = sorted(sample)

    checked_bytes = 0
    headers_checked = 0
    errors = []
    handles = {}

    def src_read(rel, off, size):
        fh = handles.get(rel)
        if fh is None:
            if len(handles) > 64:
                for h in handles.values():
                    h.close()
                handles.clear()
            fh = handles[rel] = open(_src_path(src_root, rel), "rb")
        fh.seek(off)
        return fh.read(size)

    try:
        for done, i in enumerate(sample, 1):
            try:
                data = reader.decompress_frame(i)
            except Exception as e:  # noqa: BLE001
                errors.append(f"trama {i}: {e}")
                continue
            d0 = reader.d_offsets[i]
            d1 = d0 + len(data)
            # File data overlapping this frame.
            j = max(0, bisect.bisect_right(starts, d0) - 1)
            while j < len(files) and files[j]["o"] < d1:
                f = files[j]
                a, b = max(d0, f["o"]), min(d1, f["o"] + f["s"])
                if a < b:
                    checked_bytes += b - a
                    if src_root:
                        want = src_read(f["p"], a - f["o"], b - a)
                        if want != data[a - d0 : b - d0]:
                            errors.append(f"{f['p']}: contenido distinto al origen")
                j += 1
            # Tar headers that start in this frame.
            h = bisect.bisect_left(hdrs, d0)
            while h < len(files) and hdrs[h] < d1:
                ti = read_tar_member_at(reader, hdrs[h])
                if ti.name != files[h]["p"] or ti.size != files[h]["s"] or ti.offset_data != files[h]["o"]:
                    errors.append(f"cabecera tar de {files[h]['p']} no coincide")
                headers_checked += 1
                h += 1
            if progress:
                progress(done, len(sample))
            if len(errors) >= 10:
                break
    finally:
        for fh in handles.values():
            fh.close()

    total = manifest["totals"]["bytes"]
    rep.add(
        "cantidad revisada",
        not errors,
        f"{gib(checked_bytes)} de {gib(total)} en {len(sample)} muestras, "
        f"{headers_checked} cabeceras tar"
        + (", comparado con el origen" if src_root else "")
        + ("" if not errors else " · " + "; ".join(errors[:5])),
    )


def _full_check(rep, reader, manifest, src_root, threads, progress):
    by_path = {f["p"]: f for f in manifest["files"]}
    dirs = set(manifest.get("dirs", []))
    seen_files = 0
    seen_dirs = 0
    errors = []
    total = reader.decompressed_size
    pos = 0

    def on_frame(n):
        nonlocal pos
        pos += n
        if progress:
            progress(pos, total)

    stream = SequentialStream(reader, threads=threads, on_frame=on_frame)
    try:
        with tarfile.open(fileobj=stream, mode="r|", encoding="utf-8") as tf:
            for ti in tf:
                if ti.name in (MANIFEST_NAME, FOOTER_NAME):
                    continue
                if ti.isdir():
                    seen_dirs += ti.name.rstrip("/") in dirs
                    continue
                f = by_path.get(ti.name)
                if f is None or not ti.isreg():
                    errors.append(f"{ti.name}: no está en el manifiesto")
                    continue
                h = hashlib.sha256()
                fobj = tf.extractfile(ti)
                while True:
                    chunk = fobj.read(1024 * 1024)
                    if not chunk:
                        break
                    h.update(chunk)
                digest = h.hexdigest()
                if digest != f["sha256"]:
                    errors.append(f"{ti.name}: SHA-256 distinto al manifiesto")
                elif src_root:
                    hs = hashlib.sha256()
                    with open(_src_path(src_root, ti.name), "rb") as s:
                        for chunk in iter(lambda: s.read(1024 * 1024), b""):
                            hs.update(chunk)
                    if hs.hexdigest() != digest:
                        errors.append(f"{ti.name}: distinto al origen")
                seen_files += 1
                if len(errors) >= 10:
                    break
    except Exception as e:  # noqa: BLE001
        errors.append(f"error al descomprimir: {e}")

    rep.add(
        "descompresión completa",
        not errors and seen_files == len(by_path) and seen_dirs == len(dirs),
        f"{seen_files}/{len(by_path)} archivos y {seen_dirs}/{len(dirs)} carpetas, "
        f"{gib(total)} de tar, todas las tramas con checksum"
        + (" y SHA-256 comparado con el origen" if src_root else " y SHA-256 del manifiesto")
        + ("" if not errors else " · " + "; ".join(errors[:5])),
    )
