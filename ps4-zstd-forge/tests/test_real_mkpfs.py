"""End-to-end test with the REAL MkPFS.  Skipped when MkPFS is not installed.

    pip install "git+https://github.com/PSBrew/MkPFS@1d5df56ae29390900e888fa12e5f9856aa797adc"
    python -m unittest tests.test_real_mkpfs -v

It builds a synthetic game with MkPFS and checks it with the native reader
(PFS/PFSC/exFAT), which is what proves both sides agree on the format.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, HERE)

from ps4_zstd_forge.ffpfsc import pack_ffpfsc  # noqa: E402
from ps4_zstd_forge.ffpfsc_native import extract_native, verify_native  # noqa: E402
from ps4_zstd_forge.mkpfs_runner import MkpfsNotFound, find_mkpfs  # noqa: E402
from test_roundtrip import make_game  # noqa: E402

try:
    MKPFS = find_mkpfs()
except MkpfsNotFound:
    MKPFS = None


@unittest.skipIf(MKPFS is None, "MkPFS no está instalado")
class RealMkpfs(unittest.TestCase):
    def test_pack_verify_extract(self):
        tmp = tempfile.mkdtemp(prefix="forge_real_")
        try:
            src = make_game(tmp)
            st = pack_ffpfsc(src, os.path.join(tmp, "out") + os.sep, level=6, threads=2,
                             log=lambda s: None)
            self.assertTrue(st.verification["ok"], st.verification)
            rep = verify_native(st.output, source=src, mode="full", title_id="CUSA99999")
            self.assertTrue(rep["ok"], rep)
            dest = os.path.join(tmp, "x")
            extract_native(st.output, dest)
            os.remove(os.path.join(dest, "sce_sys", "param.json"))
            r = subprocess.run(["diff", "-r", src, dest], capture_output=True)
            self.assertEqual(r.returncode, 0, r.stdout.decode())
        finally:
            shutil.rmtree(tmp)


if __name__ == "__main__":
    unittest.main()
