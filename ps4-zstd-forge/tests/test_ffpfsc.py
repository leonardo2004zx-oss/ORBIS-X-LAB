"""Tests for the .ffpfsc pipeline using tests/fake_mkpfs.py instead of MkPFS.

They check our side (validation, hard-link staging, param.json, MkPFS
arguments, verification, cleanup); the real PFS/exFAT bytes are MkPFS's job.
"""

import json
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, HERE)

from ps4_zstd_forge import cli  # noqa: E402
from ps4_zstd_forge.ffpfsc import pack_command, pack_ffpfsc, verify_ffpfsc  # noqa: E402
from ps4_zstd_forge.mkpfs_runner import MkpfsError  # noqa: E402
from ps4_zstd_forge.shadowmount import build_param_json, validate_param_json  # noqa: E402
from test_roundtrip import make_game, make_sfo  # noqa: E402

FAKE = os.path.join(HERE, "fake_mkpfs.py")


class FfpfscPipeline(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="forge_ff_")
        self.src = make_game(os.path.join(self.tmp, "games"))
        self.out = os.path.join(self.tmp, "out")
        self.calls = os.path.join(self.tmp, "calls.jsonl")
        os.environ["FAKE_MKPFS_LOG"] = self.calls
        os.environ.pop("FAKE_MKPFS_FAIL", None)
        self.logs = []

    def tearDown(self):
        os.environ.pop("FAKE_MKPFS_LOG", None)
        os.environ.pop("FAKE_MKPFS_FAIL", None)
        shutil.rmtree(self.tmp)

    def pack(self, **kw):
        kw.setdefault("log", self.logs.append)
        return pack_ffpfsc(self.src, self.out + os.sep, mkpfs=FAKE, **kw)

    def read_calls(self):
        with open(self.calls, encoding="utf-8") as f:
            return [json.loads(line) for line in f]

    def test_pack_and_verify(self):
        progress = []
        st = self.pack(level=9, threads=3, progress=lambda p, ph, d: progress.append((p, ph)))
        self.assertTrue(st.output.endswith("CUSA99999_JuegodePrueba.ffpfsc"))
        self.assertTrue(os.path.isfile(st.output))
        self.assertEqual(st.title_id, "CUSA99999")
        self.assertTrue(st.verification["ok"], st.verification)
        self.assertEqual(st.staging, "hardlink")
        # progress parsed from MkPFS "\r[###---] 42% compress" lines
        self.assertIn((100, "compress"), progress)

        pack_call = next(c for c in self.read_calls() if c["argv"][:2] == ["pack", "folder"])
        argv = pack_call["argv"]
        for flag, val in (("--version", "PS5"), ("--inode-bits", "32"), ("--cpu-count", "3"),
                          ("--compression-level", "9"), ("--compression-backend", "zlib")):
            self.assertEqual(argv[argv.index(flag) + 1], val)
        self.assertIn("--require-game-files", argv)
        self.assertIn("--no-adjust-output-file-extension", argv)
        self.assertEqual(pack_call["eboot_nlink"], 2, "eboot.bin should be hard-linked")

        # staging removed, source untouched (no param.json added to it)
        self.assertFalse(any(n.startswith(".ps4forge-stage") for n in os.listdir(os.path.dirname(self.src))))
        self.assertFalse(os.path.exists(os.path.join(self.src, "sce_sys", "param.json")))
        self.assertEqual(os.stat(os.path.join(self.src, "eboot.bin")).st_nlink, 1)

        with open(st.manifest_path, encoding="utf-8") as f:
            m = json.load(f)
        self.assertEqual(m["layout"]["inner_image"], "CUSA99999.exfat")
        self.assertEqual(m["param_json"]["titleId"], "CUSA99999")
        self.assertFalse(m["runtime_verified"])
        with open(st.shadowmount_path, encoding="utf-8") as f:
            self.assertIn("/data/shadowmount/manual.lst", f.read())

        full = verify_ffpfsc(st.output, source=self.src, mode="full", mkpfs=FAKE)
        self.assertTrue(full["ok"], full)

    def test_mkpfs_failure_cleans_up(self):
        os.environ["FAKE_MKPFS_FAIL"] = "pack"
        with self.assertRaises(MkpfsError):
            self.pack()
        leftovers = os.listdir(self.out) if os.path.isdir(self.out) else []
        self.assertEqual(leftovers, [])
        self.assertFalse(any(n.startswith(".ps4forge-stage") for n in os.listdir(os.path.dirname(self.src))))

    def test_verify_failure_rejects_image(self):
        os.environ["FAKE_MKPFS_FAIL"] = "verify"
        with self.assertRaises(MkpfsError):
            self.pack()
        self.assertFalse(os.path.exists(os.path.join(self.out, "CUSA99999_JuegodePrueba.ffpfsc")))

    def test_rejects_bad_title_id(self):
        with open(os.path.join(self.src, "sce_sys", "param.sfo"), "wb") as f:
            f.write(make_sfo([("TITLE_ID", "CUSA1"), ("TITLE", "x")]))
        with self.assertRaises(ValueError):
            self.pack()

    def test_rejects_missing_eboot(self):
        os.remove(os.path.join(self.src, "eboot.bin"))
        with self.assertRaises(ValueError):
            self.pack()

    def test_level_range(self):
        with self.assertRaises(ValueError):
            self.pack(level=22)

    def test_cli(self):
        rc = cli.main(["--input", self.src, "--output", self.out + os.sep,
                       "--mkpfs", FAKE, "--threads", "2"])
        self.assertEqual(rc, 0)
        img = os.path.join(self.out, "CUSA99999_JuegodePrueba.ffpfsc")
        self.assertEqual(cli.main(["verify", img, "--source", self.src, "--mkpfs", FAKE]), 0)
        self.assertEqual(cli.main(["info", img]), 0)
        dest = os.path.join(self.tmp, "x")
        self.assertEqual(cli.main(["extract", img, "--dest", dest, "--mkpfs", FAKE,
                                   "--only", "eboot.bin"]), 0)
        self.assertTrue(os.path.isfile(os.path.join(dest, "eboot.bin")))
        self.assertEqual(cli.main(["doctor", "--mkpfs", FAKE]), 0)
        # legacy backup format still works
        self.assertEqual(cli.main(["pack", "-i", self.src, "-o", self.out + os.sep, "-f", "zst",
                                   "-l", "3", "--verify", "none"]), 0)


class ParamJson(unittest.TestCase):
    def test_localized_and_user_params(self):
        sfo = {"TITLE_ID": "CUSA00001", "TITLE": "Juego", "TITLE_01": "Game",
               "TITLE_08": "Игра", "USER_DEFINED_PARAM_1": 3, "USER_DEFINED_PARAM_2": 0}
        raw = build_param_json("CUSA00001", sfo)
        self.assertFalse(raw.startswith(b"\xef\xbb\xbf"))
        d = validate_param_json(raw, "CUSA00001")
        self.assertEqual(d["titleName"], "Juego")
        self.assertEqual(d["localizedParameters"]["en-US"]["titleName"], "Game")
        self.assertEqual(d["localizedParameters"]["ru-RU"]["titleName"], "Игра")
        self.assertEqual(d["localizedParameters"]["defaultLanguage"], "en-US")
        self.assertEqual(d["userDefinedParam1"], 3)
        self.assertNotIn("userDefinedParam2", d)

    def test_keeps_existing_fields(self):
        raw = build_param_json("CUSA00001", {"TITLE": "X"}, existing=b'{"foo": 1, "titleId": "OLD"}')
        d = json.loads(raw)
        self.assertEqual(d["foo"], 1)
        self.assertEqual(d["titleId"], "CUSA00001")

    def test_validation_errors(self):
        with self.assertRaises(ValueError):
            validate_param_json(b"\xef\xbb\xbf{}", "CUSA00001")
        with self.assertRaises(ValueError):
            validate_param_json(b'{"titleId": "CUSA00002", "titleName": "x"}', "CUSA00001")
        with self.assertRaises(ValueError):
            validate_param_json(b'{"titleId": "CUSA00001"}', "CUSA00001")

    def test_pack_command_backend_auto(self):
        cmd = pack_command(["mkpfs"], "src", "dst", 7, 4, "auto", "/tmp")
        self.assertNotIn("--compression-backend", cmd)
        self.assertEqual(cmd[-2:], ["src", "dst"])


if __name__ == "__main__":
    unittest.main()
