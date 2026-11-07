"""ShadowMountPlus metadata: ``sce_sys/param.json`` for PS4 titles.

ShadowMountPlus finds a game inside an image by reading
``sce_sys/param.json`` (not ``param.sfo``): it needs a 9-character
``titleId`` and a ``titleName`` (top level, with an ``en-US`` fallback under
``localizedParameters``).  PS4 dumps only have ``param.sfo``, so the packer
adds a ``param.json`` derived from it to the *staged* copy of the game.
``param.sfo`` itself is kept byte for byte.

Behaviour documented by SadykovIV/PS4pkg_to_ffpfsc
(docs/SHADOWMOUNTPLUS_PS4_SUPPORT.md, docs/FORMAT_COMPATIBILITY.md):
UTF-8 without BOM, exact 9-char title ID, ``titleName`` + ``en-US.titleName``,
localized ``TITLE_00..29`` mapped to system locales, non-zero
``USER_DEFINED_PARAM_1..4`` mirrored as ``userDefinedParam1..4``.
"""

from __future__ import annotations

import json
from typing import Dict, Optional

# PS4 system-language order of TITLE_00 ... TITLE_29 in param.sfo, written
# with the locale names used by PS5 appmeta JSON.
TITLE_LOCALES = (
    "ja-JP", "en-US", "fr-FR", "es-ES", "de-DE", "it-IT", "nl-NL", "pt-PT",
    "ru-RU", "ko-KR", "zh-Hant", "zh-Hans", "fi-FI", "sv-SE", "da-DK", "no-NO",
    "pl-PL", "pt-BR", "en-GB", "tr-TR", "es-419", "ar-AE", "fr-CA", "cs-CZ",
    "hu-HU", "el-GR", "ro-RO", "th-TH", "vi-VN", "id-ID",
)


def _text(v) -> Optional[str]:
    return v.strip() if isinstance(v, str) and v.strip() else None


def pick_title(sfo: Dict[str, object]) -> str:
    return (_text(sfo.get("TITLE")) or _text(sfo.get("TITLE_01"))
            or _text(sfo.get("CONTENT_ID")) or _text(sfo.get("TITLE_ID")) or "Unknown Game")


def build_param_json(title_id: str, sfo: Dict[str, object],
                     existing: Optional[bytes] = None) -> bytes:
    """Return the param.json bytes for ShadowMountPlus.

    Fields of an existing, valid param.json are kept; the ones ShadowMountPlus
    reads are (re)written from param.sfo."""
    data: Dict[str, object] = {}
    if existing and not existing.startswith(b"\xef\xbb\xbf"):
        try:
            parsed = json.loads(existing.decode("utf-8"))
            if isinstance(parsed, dict):
                data = parsed
        except (UnicodeDecodeError, ValueError):
            pass

    title = pick_title(sfo)
    loc = data.get("localizedParameters")
    loc = dict(loc) if isinstance(loc, dict) else {}
    for i, locale in enumerate(TITLE_LOCALES):
        name = _text(sfo.get(f"TITLE_{i:02d}"))
        if name:
            entry = dict(loc.get(locale) or {}) if isinstance(loc.get(locale), dict) else {}
            entry["titleName"] = name
            loc[locale] = entry
    en = dict(loc.get("en-US") or {}) if isinstance(loc.get("en-US"), dict) else {}
    en["titleName"] = _text(sfo.get("TITLE_01")) or title
    loc["en-US"] = en
    default = loc.get("defaultLanguage")
    if not (isinstance(default, str) and isinstance(loc.get(default), dict)):
        loc["defaultLanguage"] = "en-US"

    data["localizedParameters"] = loc
    data["titleId"] = title_id
    data["titleName"] = title
    for i in range(1, 5):
        v = sfo.get(f"USER_DEFINED_PARAM_{i}")
        if isinstance(v, int) and v != 0:
            data[f"userDefinedParam{i}"] = v
    return (json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def validate_param_json(raw: bytes, title_id: str) -> Dict[str, object]:
    """Raise ValueError unless ShadowMountPlus can read this param.json."""
    if raw.startswith(b"\xef\xbb\xbf"):
        raise ValueError("param.json no puede llevar BOM UTF-8")
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as e:
        raise ValueError(f"param.json no es JSON UTF-8 válido: {e}") from e
    if not isinstance(data, dict):
        raise ValueError("param.json no es un objeto JSON")
    tid = data.get("titleId", data.get("title_id"))
    if tid != title_id or len(tid or "") != 9:
        raise ValueError(f"param.json titleId={tid!r}, se esperaba {title_id!r}")
    name = data.get("titleName")
    if not name:
        en = (data.get("localizedParameters") or {}).get("en-US") or {}
        name = en.get("titleName") if isinstance(en, dict) else None
    if not isinstance(name, str) or not name:
        raise ValueError("param.json no tiene titleName")
    return data
