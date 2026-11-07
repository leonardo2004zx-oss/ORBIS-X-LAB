"""Native PFS/PFSC/exFAT reader: integrity checks and extraction."""

import os
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, HERE)

from ffpfsc_fixture import build_exfat, build_pfs  # noqa: E402
from ps4_zstd_forge.ffpfsc_native import extract_native, open_ffpfsc, verify_native  # noqa: E402
from ps4_zstd_forge.shadowmount import build_param_json  # noqa: E402
from test_roundtrip import make_game  # noqa: E402


class Native(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="forge_native_")
        cls.src = make_game(cls.tmp)
        with open(os.path.join(cls.src, "sce_sys", "param.json"), "wb") as f:
            f.write(build_param_json("CUSA99999", {"TITLE": "Juego"}))
        cls.raw = build_exfat(cls.src)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def image(self, name, **kw):
        p = os.path.join(self.tmp, name)
        inner = kw.pop("inner", "CUSA99999.exfat")
        with open(p, "wb") as f:
            f.write(build_pfs(inner, self.raw, **kw))
        return p

    def failed(self, rep):
        return [c["name"] for c in rep["checks"] if not c["ok"]]

    def test_good_image_full(self):
        rep = verify_native(self.image("ok.ffpfsc"), source=self.src, mode="full",
                            title_id="CUSA99999", threads=2)
        self.assertTrue(rep["ok"], rep)
        names = [c["name"] for c in rep["checks"]]
        for n in ("cabecera PFS", "cabecera PFSC", "bloques zlib", "exFAT interna",
                  "archivos requeridos", "param.json ShadowMountPlus", "todos los archivos"):
            self.assertIn(n, names)

    def test_corrupt_zlib_block_detected(self):
        def tamper(payload):
            b = bytearray(payload)
            off0, off1 = struct.unpack_from("<QQ", b, 0x400 + 8 * 3)
            mid = (off0 + off1) // 2
            b[mid] ^= 0xFF
            return bytes(b)
        rep = verify_native(self.image("bad.ffpfsc", tamper=tamper), mode="quick")
        self.assertIn("bloques zlib", self.failed(rep))

    def test_truncated_image(self):
        p = self.image("trunc.ffpfsc")
        with open(p, "r+b") as f:
            f.truncate(os.path.getsize(p) // 2)
        self.assertFalse(verify_native(p)["ok"])

    def test_not_pfs(self):
        p = os.path.join(self.tmp, "x.ffpfsc")
        with open(p, "wb") as f:
            f.write(b"\x28\xb5\x2f\xfd" + b"\0" * 5000)
        rep = verify_native(p)
        self.assertEqual(self.failed(rep), ["contenedor FFPFSC"])

    def test_wrong_inner_name_and_profile(self):
        rep = verify_native(self.image("v1.ffpfsc", inner="OTHER.exfat", version=1),
                            title_id="CUSA99999")
        self.assertIn("imagen interna", self.failed(rep))
        self.assertIn("perfil PS5", self.failed(rep))

    def test_extract_identical(self):
        dest = os.path.join(self.tmp, "x_all")
        n = extract_native(self.image("e.ffpfsc"), dest)
        self.assertEqual(n, 8)
        r = subprocess.run(["diff", "-r", self.src, dest], capture_output=True)
        self.assertEqual(r.returncode, 0, r.stdout.decode())

    def test_extract_only_case_insensitive(self):
        dest = os.path.join(self.tmp, "x_only")
        extract_native(self.image("o.ffpfsc"), dest, only=["SCE_SYS/PARAM.SFO", "data/música"])
        self.assertTrue(os.path.isfile(os.path.join(dest, "sce_sys", "param.sfo")))
        self.assertTrue(os.path.isfile(os.path.join(dest, "data", "música", "canción_ñ.at9")))
        self.assertFalse(os.path.exists(os.path.join(dest, "eboot.bin")))

    def test_random_access(self):
        img = open_ffpfsc(self.image("r.ffpfsc"))
        try:
            with open(os.path.join(self.src, "data", "levels", "level01.dat"), "rb") as f:
                want = f.read()
            e = img.exfat.find("data/levels/level01.dat")
            self.assertEqual(img.exfat.read_file(e), want)  # fragmented FAT chain
            self.assertEqual(img.inner.read_at(3, 8), self.raw[3:11])  # "EXFAT   "
        finally:
            img.close()


if __name__ == "__main__":
    unittest.main()
