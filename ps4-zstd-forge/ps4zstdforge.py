#!/usr/bin/env python3
"""Entry point: python ps4zstdforge.py --input CUSA00000 --output out/"""
import sys

from ps4_zstd_forge.cli import main

if __name__ == "__main__":
    sys.exit(main())
