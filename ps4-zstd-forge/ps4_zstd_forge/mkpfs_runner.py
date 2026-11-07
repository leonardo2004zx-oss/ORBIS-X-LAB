"""Locate and run MkPFS (PSBrew/MkPFS, GPL-3.0) as an external program.

MkPFS is the engine that writes the PFS/PFSC container and the inner exFAT.
It is *not* bundled: it is called as a separate process, the same way
SadykovIV/PS4pkg_to_ffpfsc does.

Lookup order: ``--mkpfs`` option, ``PS4FORGE_MKPFS`` environment variable,
the ``mkpfs`` Python package in this interpreter, ``mkpfs`` on PATH.
"""

from __future__ import annotations

import importlib.util
import os
import re
import shlex
import shutil
import subprocess
import sys
from collections import deque
from typing import Callable, List, Optional, Sequence

INSTALL_HINT = (
    "MkPFS no está instalado. Instálalo con:\n"
    "  pip install \"git+https://github.com/PSBrew/MkPFS@1d5df56ae29390900e888fa12e5f9856aa797adc\"\n"
    "o indica la ruta con --mkpfs \"C:\\ruta\\mkpfs.exe\" (o la variable PS4FORGE_MKPFS)."
)

# MkPFS progress lines: "[#####-----]  42% compress @ 120.0 MiB/s ETA 3.2m"
PROGRESS_RE = re.compile(r"\[[#\-]+\]\s+(\d{1,3})%\s+(\S+)(.*)")


class MkpfsNotFound(RuntimeError):
    pass


class MkpfsError(RuntimeError):
    def __init__(self, message: str, output: str = ""):
        super().__init__(message)
        self.output = output


def find_mkpfs(explicit: Optional[str] = None) -> List[str]:
    explicit = explicit or os.environ.get("PS4FORGE_MKPFS")
    if explicit:
        if os.path.exists(explicit):
            exe = [explicit]
            if explicit.lower().endswith(".py"):
                exe = [sys.executable, explicit]
            return exe
        return shlex.split(explicit, posix=os.name != "nt")
    frozen = getattr(sys, "frozen", False)
    if not frozen and importlib.util.find_spec("mkpfs") is not None:
        return [sys.executable, "-X", "utf8", "-m", "mkpfs"]
    found = shutil.which("mkpfs")
    if found:
        return [found]
    raise MkpfsNotFound(INSTALL_HINT)


def _env() -> dict:
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def mkpfs_version(cmd: Sequence[str]) -> str:
    p = subprocess.run([*cmd, "-V"], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=_env())
    out = (p.stdout + p.stderr).strip()
    if p.returncode != 0:
        raise MkpfsError(f"mkpfs -V falló ({p.returncode})", out)
    return out.splitlines()[0] if out else "mkpfs"


def run_mkpfs(
    cmd: Sequence[str],
    on_progress: Optional[Callable[[int, str, str], None]] = None,
    on_line: Optional[Callable[[str], None]] = None,
    cancel: Optional[Callable[[], bool]] = None,
) -> str:
    """Run MkPFS, streaming its output.  Progress bars (``\\r`` updates) go to
    ``on_progress(percent, phase, rest)``; other lines to ``on_line``.
    Raises MkpfsError on a non-zero exit; returns the captured text."""
    proc = subprocess.Popen(list(cmd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            stdin=subprocess.DEVNULL, env=_env(), bufsize=0)
    tail: "deque[str]" = deque(maxlen=200)
    buf = b""

    def emit(segment: bytes):
        text = segment.decode("utf-8", "replace").strip()
        if not text:
            return
        m = PROGRESS_RE.search(text)
        if m:
            if on_progress:
                on_progress(min(100, int(m.group(1))), m.group(2), m.group(3).strip())
            return
        tail.append(text)
        if on_line:
            on_line(text)

    try:
        fd = proc.stdout.fileno()
        while True:
            if cancel and cancel():
                raise KeyboardInterrupt("cancelado")
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            buf += chunk
            parts = re.split(rb"[\r\n]", buf)
            buf = parts.pop()
            for seg in parts:
                emit(seg)
        if buf:
            emit(buf)
        rc = proc.wait()
    except BaseException:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        raise
    finally:
        proc.stdout.close()
    output = "\n".join(tail)
    if rc != 0:
        last = next((l for l in reversed(tail) if l), "sin salida")
        raise MkpfsError(f"MkPFS terminó con código {rc}: {last}", output)
    return output
