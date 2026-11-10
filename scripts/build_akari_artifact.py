"""Genera una versión de Akari Game Show en un solo archivo, con la voz grabada adentro.

Uso: python3 scripts/build_akari_artifact.py SALIDA.html

Quita la envoltura <!doctype>/<head> de akari/index.html y reemplaza la carga de
akari/voice-pack.js por el script en línea, para publicarlo como página única.
"""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent / "akari"
html = (root / "index.html").read_text(encoding="utf-8")
pack = (root / "voice-pack.js").read_text(encoding="utf-8")
if re.search(r"</script", pack, re.I):
    sys.exit("voice-pack.js contiene '</script' y no se puede poner en línea")

body = html.split("<!--WRAP-END-->\n", 1)[1].split("<!--WRAP-START-->", 1)[0]
body = re.sub(r"<!--VOICEPACK-->.*?<!--/VOICEPACK-->", lambda _: "<script>" + pack + "</script>", body, flags=re.S)
pathlib.Path(sys.argv[1]).write_text(body, encoding="utf-8")
print(f"{sys.argv[1]}: {len(body) / 1e6:.2f} MB")
