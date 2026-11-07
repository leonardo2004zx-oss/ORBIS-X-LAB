"""Minimal param.sfo parser + PS4 dump detection."""

from __future__ import annotations

import os
import struct
from dataclasses import dataclass, field
from typing import Dict, Optional

SFO_MAGIC = b"\x00PSF"
FMT_UTF8_SPECIAL = 0x0004
FMT_UTF8 = 0x0204
FMT_INT32 = 0x0404

CATEGORIES = {
    "gd": "Juego (gd)",
    "gp": "Parche (gp)",
    "ac": "Contenido adicional (ac)",
    "gde": "App (gde)",
}


def parse_sfo(data: bytes) -> Dict[str, object]:
    if data[:4] != SFO_MAGIC:
        raise ValueError("not a param.sfo (bad magic)")
    _magic, _ver, key_start, data_start, count = struct.unpack_from("<4sIIII", data, 0)
    out: Dict[str, object] = {}
    for i in range(count):
        koff, fmt, dlen, _dmax, doff = struct.unpack_from("<HHIII", data, 20 + 16 * i)
        kpos = key_start + koff
        key = data[kpos : data.index(b"\0", kpos)].decode("ascii", "replace")
        raw = data[data_start + doff : data_start + doff + dlen]
        if fmt == FMT_INT32:
            out[key] = struct.unpack("<I", raw[:4])[0]
        elif fmt in (FMT_UTF8, FMT_UTF8_SPECIAL):
            out[key] = raw.split(b"\0", 1)[0].decode("utf-8", "replace")
        else:
            out[key] = raw.hex()
    return out


def system_ver_str(v: Optional[int]) -> Optional[str]:
    """0x05050000 -> '5.05' (PS4 stores the firmware as BCD-like hex)."""
    if not isinstance(v, int) or v == 0:
        return None
    return f"{(v >> 24) & 0xFF:x}.{(v >> 16) & 0xFF:02x}"


@dataclass
class GameInfo:
    root: str
    title_id: Optional[str] = None
    title: Optional[str] = None
    content_id: Optional[str] = None
    app_ver: Optional[str] = None
    version: Optional[str] = None
    category: Optional[str] = None
    firmware: Optional[str] = None
    has_eboot: bool = False
    notes: list = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "title_id": self.title_id,
            "title": self.title,
            "content_id": self.content_id,
            "app_ver": self.app_ver,
            "version": self.version,
            "category": self.category,
            "firmware": self.firmware,
        }


def _looks_like_game(path: str) -> bool:
    return os.path.isfile(os.path.join(path, "sce_sys", "param.sfo")) or os.path.isfile(
        os.path.join(path, "eboot.bin")
    )


def find_game_root(path: str) -> str:
    """Return the directory that contains eboot.bin / sce_sys.

    Accepts the game folder itself (CUSAxxxxx/) or a parent that holds exactly
    one game folder (e.g. CUSAxxxxx/app/ or a download folder)."""
    path = os.path.abspath(path)
    if _looks_like_game(path):
        return path
    try:
        children = [
            os.path.join(path, d)
            for d in sorted(os.listdir(path))
            if os.path.isdir(os.path.join(path, d))
        ]
    except OSError:
        return path
    games = [c for c in children if _looks_like_game(c)]
    if len(games) == 1:
        return games[0]
    return path


def read_game_info(root: str) -> GameInfo:
    info = GameInfo(root=root, has_eboot=os.path.isfile(os.path.join(root, "eboot.bin")))
    sfo_path = os.path.join(root, "sce_sys", "param.sfo")
    if os.path.isfile(sfo_path):
        try:
            with open(sfo_path, "rb") as f:
                sfo = parse_sfo(f.read())
            info.title_id = sfo.get("TITLE_ID")
            info.title = sfo.get("TITLE")
            info.content_id = sfo.get("CONTENT_ID")
            info.app_ver = sfo.get("APP_VER")
            info.version = sfo.get("VERSION")
            cat = sfo.get("CATEGORY")
            info.category = CATEGORIES.get(cat, cat)
            info.firmware = system_ver_str(sfo.get("SYSTEM_VER"))
        except (ValueError, struct.error, OSError) as e:
            info.notes.append(f"param.sfo ilegible: {e}")
    else:
        info.notes.append("No hay sce_sys/param.sfo: no parece un dump de PS4.")
    if not info.has_eboot:
        info.notes.append("No hay eboot.bin en la raíz del juego.")
    if not info.title_id:
        # Fall back to a CUSAxxxxx folder name.
        base = os.path.basename(root.rstrip(os.sep))
        if base[:4].upper() in ("CUSA", "PLAS", "PCAS", "PCJS", "PLJS", "PLJM"):
            info.title_id = base[:9].upper()
    return info
