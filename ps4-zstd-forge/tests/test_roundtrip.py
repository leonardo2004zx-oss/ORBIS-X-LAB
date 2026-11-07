"""Round-trip tests on a synthetic PS4 dump.  Run: python -m unittest -v"""

import json
import os
import random
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ps4_zstd_forge.archive import open_archive  # noqa: E402
from ps4_zstd_forge.extract import extract_all, extract_some  # noqa: E402
from ps4_zstd_forge.packer import pack  # noqa: E402
from ps4_zstd_forge.sfo import parse_sfo, read_game_info  # noqa: E402
from ps4_zstd_forge.verify import verify  # noqa: E402


def make_sfo(entries):
    """Build a param.sfo: entries = [(key, value)] (str -> utf8, int -> int32)."""
    keys = b""
    data = b""
    index = b""
    for key, val in sorted(entries):
        koff = len(keys)
        keys += key.encode() + b"\0"
        if isinstance(val, int):
            raw, fmt = struct.pack("<I", val), 0x0404
        else:
            raw, fmt = val.encode() + b"\0", 0x0204
        maxlen = (len(raw) + 3) // 4 * 4
        index += struct.pack("<HHIII", koff, fmt, len(raw), maxlen, len(data))
        data += raw.ljust(maxlen, b"\0")
    keys = keys.ljust((len(keys) + 3) // 4 * 4, b"\0")
    key_start = 20 + len(index)
    data_start = key_start + len(keys)
    hdr = struct.pack("<4sIIII", b"\x00PSF", 0x101, key_start, data_start, len(entries))
    return hdr + index + keys + data


def make_game(base):
    root = os.path.join(base, "CUSA99999")
    rnd = random.Random(1234)

    def put(rel, content):
        p = os.path.join(root, *rel.split("/"))
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(content)

    put("sce_sys/param.sfo", make_sfo([
        ("TITLE_ID", "CUSA99999"), ("TITLE", "Juego de Prueba™"),
        ("CONTENT_ID", "EP9999-CUSA99999_00-TESTGAME00000000"),
        ("APP_VER", "01.05"), ("VERSION", "01.00"), ("CATEGORY", "gd"),
        ("SYSTEM_VER", 0x05050000),
    ]))
    put("eboot.bin", b"\x7fELF" + bytes(rnd.getrandbits(8) for _ in range(300_000)))
    put("sce_module/libc.prx", b"PRX" * 50_000)
    text = b"".join(b"line %d of a very compressible asset\n" % i for i in range(120_000))
    put("data/levels/level01.dat", text)
    put("data/empty.bin", b"")
    put("data/música/canción_ñ.at9", os.urandom(70_000))
    put("data/" + "/".join(["deep_folder_name_%02d" % i for i in range(8)]) + "/long_file_name.bin",
        b"x" * 1000)
    os.makedirs(os.path.join(root, "data", "empty_dir"))
    return root


class RoundTrip(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="forge_test_")
        cls.src = make_game(cls.tmp)
        cls.out_dir = os.path.join(cls.tmp, "out")
        cls.stats = pack(cls.src, cls.out_dir + os.sep, level=19, threads=4,
                         frame_size=64 * 1024, log=lambda s: None)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def test_sfo(self):
        info = read_game_info(self.src)
        self.assertEqual(info.title_id, "CUSA99999")
        self.assertEqual(info.title, "Juego de Prueba™")
        self.assertEqual(info.firmware, "5.05")
        with open(os.path.join(self.src, "sce_sys", "param.sfo"), "rb") as f:
            self.assertEqual(parse_sfo(f.read())["SYSTEM_VER"], 0x05050000)

    def test_output_name_and_size(self):
        self.assertTrue(self.stats.output.endswith("CUSA99999_JuegodePrueba.tar.zst"))
        self.assertGreater(self.stats.frames, 10)
        self.assertLess(self.stats.compressed_bytes, self.stats.source_bytes)
        self.assertTrue(os.path.isfile(self.stats.manifest_path))

    def test_quick_verify(self):
        rep = verify(self.stats.output, source=self.src, mode="quick", seed=1)
        self.assertTrue(rep.ok, [c for c in rep.checks if not c.ok])

    def test_full_verify(self):
        rep = verify(self.stats.output, source=self.src, mode="full", threads=2)
        self.assertTrue(rep.ok, [c for c in rep.checks if not c.ok])

    def test_extract_all_identical(self):
        dest = os.path.join(self.tmp, "x_all")
        n = extract_all(self.stats.output, dest, threads=2)
        self.assertEqual(n, self.stats.files)
        r = subprocess.run(["diff", "-r", self.src, dest], capture_output=True)
        self.assertEqual(r.returncode, 0, r.stdout.decode())
        self.assertTrue(os.path.isdir(os.path.join(dest, "data", "empty_dir")))

    def test_random_access(self):
        dest = os.path.join(self.tmp, "x_some")
        extract_some(self.stats.output, dest, ["data/música/canción_ñ.at9", "eboot.bin"])
        for rel in ("data/música/canción_ñ.at9", "eboot.bin"):
            with open(os.path.join(self.src, rel), "rb") as a, open(os.path.join(dest, rel), "rb") as b:
                self.assertEqual(a.read(), b.read())

    def test_manifest(self):
        reader, footer, manifest = open_archive(self.stats.output)
        reader.close()
        self.assertEqual(manifest["totals"]["files"], 7)
        self.assertEqual(manifest["empty_dirs"], ["data/empty_dir"])
        self.assertEqual(manifest["game"]["title_id"], "CUSA99999")

    def test_standard_tools(self):
        """The archive is a plain .zst containing a plain tar."""
        if not shutil.which("zstd"):
            import zstandard
            with open(self.stats.output, "rb") as f:
                data = zstandard.ZstdDecompressor().stream_reader(f, read_across_frames=True).read()
            tar_path = os.path.join(self.tmp, "plain.tar")
            with open(tar_path, "wb") as t:
                t.write(data)
        else:
            tar_path = os.path.join(self.tmp, "plain.tar")
            subprocess.run(["zstd", "-d", "-q", "-f", self.stats.output, "-o", tar_path], check=True)
        r = subprocess.run(["tar", "-tf", tar_path], capture_output=True, check=True)
        names = r.stdout.decode().split()
        self.assertIn("eboot.bin", names)
        self.assertIn("__forge__/manifest.json", names)

    def test_corruption_detected(self):
        bad = os.path.join(self.tmp, "corrupt.tar.zst")
        shutil.copy(self.stats.output, bad)
        with open(bad, "r+b") as f:
            f.seek(self.stats.compressed_bytes // 3)
            b = f.read(1)
            f.seek(-1, 1)
            f.write(bytes([b[0] ^ 0xFF]))
        rep = verify(bad, mode="full", threads=2)
        self.assertFalse(rep.ok)

    def test_refuses_overwrite(self):
        with self.assertRaises(FileExistsError):
            pack(self.src, self.stats.output, log=lambda s: None)

    def test_sidecar_json(self):
        with open(self.stats.manifest_path, encoding="utf-8") as f:
            side = json.load(f)
        self.assertEqual(side["archive"]["frames"], self.stats.frames)


if __name__ == "__main__":
    unittest.main()
