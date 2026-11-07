"""Test double for the MkPFS CLI (NOT a real PFS writer).

Implements `mkpfs -V`, `pack folder` and `verify` well enough to test PS4
ZSTD Forge's orchestration.  `pack folder` writes a real-layout .ffpfsc with
tests/ffpfsc_fixture.py (PFS v2 + PFSC/zlib + exFAT).  Every call is appended (as JSON) to the file
named by FAKE_MKPFS_LOG.
"""

import json
import os
import sys
import struct

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ffpfsc_fixture import build_ffpfsc  # noqa: E402


def log_call(extra=None):
    path = os.environ.get("FAKE_MKPFS_LOG")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"argv": sys.argv[1:], **(extra or {})}) + "\n")


def positional(args):
    out, skip = [], False
    takes_value = {"--version", "--inode-bits", "--cpu-count", "--compression-level",
                   "--compression-backend", "--temp-folder", "--format", "--only"}
    for a in args:
        if skip:
            skip = False
            continue
        if a in takes_value:
            skip = True
            continue
        if a.startswith("--"):
            continue
        out.append(a)
    return out


def bar(phase, pct):
    fill = pct * 32 // 100
    sys.stderr.write(f"\r[{'#' * fill}{'-' * (32 - fill)}] {pct:3d}% {phase} @ 10.0 MiB/s")
    if pct == 100:
        sys.stderr.write("\n")
    sys.stderr.flush()


def main():
    args = sys.argv[1:]
    if args == ["-V"]:
        print("MkPFS 1.1.0 (fake)")
        return 0
    if os.environ.get("FAKE_MKPFS_FAIL") == args[0]:
        print("ERROR: simulated failure", file=sys.stderr)
        return 1
    if args[:2] == ["pack", "folder"]:
        src, dst = positional(args[2:])
        nlink = os.stat(os.path.join(src, "eboot.bin")).st_nlink
        if "--require-game-files" in args:
            for req in ("eboot.bin", os.path.join("sce_sys", "param.json")):
                if not os.path.exists(os.path.join(src, req)):
                    print(f"ERROR: Missing required file: {req}", file=sys.stderr)
                    return 1
        log_call({"eboot_nlink": nlink})
        print(f"Packing {src}")
        with open(os.path.join(src, "sce_sys", "param.json"), encoding="utf-8") as f:
            title_id = json.load(f)["titleId"]
        for pct in (10, 50, 100):
            bar("compress", pct)
        build_ffpfsc(src, dst, title_id)
        print("Done.")
        return 0
    log_call()
    if args[0] == "verify":
        (img,) = positional(args[1:])
        with open(img, "rb") as f:
            version, magic = struct.unpack("<qq", f.read(16))
        if magic != 20130315:
            print("ERROR: not a PFS image", file=sys.stderr)
            return 1
        bar("verify", 100)
        print("Verification passed: 0 errors")
        return 0
    print("unsupported", args, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
