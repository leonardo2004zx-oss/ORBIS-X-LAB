"""Test double for the MkPFS CLI (NOT a real PFS writer).

Implements just enough of `mkpfs -V`, `pack folder`, `verify` and
`unpack --deep [--only]` to test PS4 ZSTD Forge's orchestration: the "image"
is a zip of the staged folder.  Every call is appended (as JSON) to the file
named by FAKE_MKPFS_LOG.
"""

import json
import os
import sys
import time
import zipfile


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
        files = []
        for d, _dirs, fs in os.walk(src):
            for name in fs:
                files.append(os.path.join(d, name))
        with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
            for i, p in enumerate(sorted(files), 1):
                z.write(p, os.path.relpath(p, src).replace(os.sep, "/"))
                bar("compress", i * 100 // len(files))
        print("Done.")
        return 0
    log_call()
    if args[0] == "verify":
        (img,) = positional(args[1:])
        with zipfile.ZipFile(img) as z:
            bad = z.testzip()
        if bad:
            print(f"ERROR: checksum mismatch in {bad}", file=sys.stderr)
            return 1
        bar("verify", 100)
        print("Verification passed: 0 errors")
        return 0
    if args[0] == "unpack":
        img, dest = positional(args[1:])
        only = [args[i + 1] for i, a in enumerate(args) if a == "--only"]
        with zipfile.ZipFile(img) as z:
            names = z.namelist()
            if only:
                names = [n for n in names if any(n == o or n.startswith(o.rstrip("/") + "/") for o in only)]
            for n in names:
                z.extract(n, dest)
        time.sleep(0)
        return 0
    print("unsupported", args, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
