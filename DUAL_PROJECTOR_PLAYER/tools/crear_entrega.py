"""Genera ENTREGA_CHATGPT/ y ENTREGA_CHATGPT.zip (v7) — se entrega adjunto, NO se sube a GitHub.
Incluye el reproductor v7 completo y el código del simulador v6 (sin sus capturas).
Uso: python tools/crear_entrega.py   (desde DUAL_PROJECTOR_PLAYER)"""
import os, shutil, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAB = os.path.join(os.path.dirname(ROOT), 'DUAL_PROJECTOR_LAB')
OUT = os.path.join(ROOT, 'ENTREGA_CHATGPT')
if os.path.exists(OUT): shutil.rmtree(OUT)
os.makedirs(OUT)
skip_p = {'ENTREGA_CHATGPT', 'ENTREGA_CHATGPT.zip', 'entrega_docs', '.git', 'node_modules'}
shutil.copytree(ROOT, os.path.join(OUT, 'CODIGO_FUENTE', 'DUAL_PROJECTOR_PLAYER'), ignore=lambda d, n: [x for x in n if x in skip_p])
skip_l = skip_p | {'capturas', 'DUAL_PROJECTOR_LAB_un_archivo.html'}
shutil.copytree(LAB, os.path.join(OUT, 'CODIGO_FUENTE', 'DUAL_PROJECTOR_LAB_v6_simulador'), ignore=lambda d, n: [x for x in n if x in skip_l])
docs = os.path.join(ROOT, 'entrega_docs')
for n in os.listdir(docs): shutil.copy2(os.path.join(docs, n), os.path.join(OUT, n))
zp = os.path.join(ROOT, 'ENTREGA_CHATGPT.zip')
with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
    for d, _, files in os.walk(OUT):
        for f in sorted(files):
            p = os.path.join(d, f); z.write(p, os.path.relpath(p, ROOT))
print('Creado', zp, round(os.path.getsize(zp) / 1048576, 2), 'MB')
