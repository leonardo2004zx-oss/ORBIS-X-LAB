"""Mide la sincronía en una GRABACIÓN DE PANTALLA: decodifica el código de barras de 12 bits del video de prueba
en la región de cada ventana, cuadro por cuadro, y compara el fotograma que muestra A con el que muestra B.
Uso: python -I tools/medir_grabacion.py grabacion.mp4 x0,y0,w,h(A) x0,y0,w,h(B) [desde_s] [hasta_s]
"""
import sys, subprocess, json
import numpy as np
src = sys.argv[1]
regs = [tuple(map(int, a.split(','))) for a in sys.argv[2:4]]
W, H = 1920, 1080
rng = []
if len(sys.argv) > 5: rng = ['-ss', sys.argv[4], '-to', sys.argv[5]]
p = subprocess.Popen(['ffmpeg', '-loglevel', 'error'] + rng + ['-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
def decode(img):
    # busca los marcos rojos de los códigos (r alto, g y b bajos) y lee 12 celdas en el centro del marco
    red = (img[:, :, 0] > 190) & (img[:, :, 1] < 70) & (img[:, :, 2] < 70)
    ys, xs = np.nonzero(red)
    if len(xs) < 50: return None
    # agrupar columnas en marcos separados
    cols = np.unique(xs); groups = []; start = cols[0]; prev = cols[0]
    for c in cols[1:]:
        if c - prev > 3: groups.append((start, prev)); start = c
        prev = c
    groups.append((start, prev))
    for gx0, gx1 in sorted(groups, key=lambda g: -(g[1] - g[0])):
        if gx1 - gx0 < 60: continue
        m = (xs >= gx0) & (xs <= gx1); gy0, gy1 = ys[m].min(), ys[m].max()
        # interior del marco: se mide sobre la fila central dónde termina el rojo a cada lado
        cy = int((gy0 + gy1) / 2)
        row = red[cy, gx0:gx1 + 1]
        nz = np.nonzero(~row)[0]
        if len(nz) < 24: continue
        ix0, ix1 = gx0 + nz[0], gx0 + nz[-1] + 1
        f = 0
        for b in range(12):
            x = int(ix0 + (b + 0.5) * (ix1 - ix0) / 12)
            v = img[cy - 1:cy + 2, x - 1:x + 2].mean()
            f = (f << 1) | (1 if v > 128 else 0)
        return f
    return None
n = 0; res = []
while True:
    buf = p.stdout.read(W * H * 3)
    if len(buf) < W * H * 3: break
    img = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    fa, fb = [decode(img[y:y + h, x:x + w]) for (x, y, w, h) in regs]
    res.append((n, fa, fb)); n += 1
# Validación SIN suponer que A y B coinciden: cada lectura se compara con la secuencia de SU propia ventana.
# Es válida si queda a ±3 fotogramas de la mediana de sus 6 vecinos (el video avanza ~1,2 fotogramas por cuadro grabado).
def valid_mask(seq):
    ok = []
    for k, v in enumerate(seq):
        if v is None: ok.append(False); continue
        nb = [seq[j] for j in range(max(0, k - 3), min(len(seq), k + 4)) if j != k and seq[j] is not None]
        if len(nb) < 3: ok.append(False); continue
        nb.sort(); med = nb[len(nb) // 2]
        ok.append(abs(v - med) <= 3)
    return ok
A = [a for (_, a, _) in res]; B = [b for (_, _, b) in res]
va, vb = valid_mask(A), valid_mask(B)
both = [(A[k], B[k]) for k in range(len(res)) if A[k] is not None and B[k] is not None]
pairs = [(A[k], B[k]) for k in range(len(res)) if va[k] and vb[k]]
bad = [None] * (len(both) - len(pairs))
d = [abs(a - b) for a, b in pairs]
same = sum(1 for v in d if v == 0)
out = {'cuadros_grabados': n, 'cuadros_con_A_y_B_legibles': len(pairs), 'lecturas_descartadas': len(bad), 'mismo_fotograma': same,
       'porcentaje_mismo': round(100 * same / max(1, len(pairs)), 1), 'diferencia_maxima': max(d) if d else None,
       'histograma': {str(k): d.count(k) for k in sorted(set(d))}}
print(json.dumps(out, ensure_ascii=False))
