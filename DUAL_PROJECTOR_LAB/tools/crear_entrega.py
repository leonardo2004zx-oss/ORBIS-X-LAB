"""Genera ENTREGA_CHATGPT/ y ENTREGA_CHATGPT.zip para revisión externa.
Uso: python tools/crear_entrega.py   (desde la carpeta DUAL_PROJECTOR_LAB)"""
import os, shutil, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'ENTREGA_CHATGPT')
SKIP = {'ENTREGA_CHATGPT', 'ENTREGA_CHATGPT.zip', 'entrega_docs', '.git', 'node_modules'}
if os.path.exists(OUT): shutil.rmtree(OUT)
os.makedirs(OUT)
shutil.copytree(ROOT, os.path.join(OUT, 'CODIGO_FUENTE'), ignore=lambda d, names: [n for n in names if n in SKIP])
docs = os.path.join(ROOT, 'entrega_docs')
for n in os.listdir(docs):
    s = os.path.join(docs, n)
    (shutil.copytree if os.path.isdir(s) else shutil.copy2)(s, os.path.join(OUT, n))
zp = os.path.join(ROOT, 'ENTREGA_CHATGPT.zip')
with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
    for d, _, files in os.walk(OUT):
        for f in sorted(files):
            p = os.path.join(d, f)
            z.write(p, os.path.relpath(p, ROOT))
print('Creado', zp, round(os.path.getsize(zp) / 1048576, 2), 'MB')
