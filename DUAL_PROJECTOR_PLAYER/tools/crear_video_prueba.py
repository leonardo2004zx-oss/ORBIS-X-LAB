"""Genera el video de prueba de sincronización (requiere Python + Pillow + ffmpeg).
Cada fotograma lleva su número escrito y codificado en DOS códigos de barras de 12 bits,
uno en la mitad izquierda y otro en la mitad derecha. Así se puede medir qué fotograma
muestra la ventana A y cuál la ventana B en el mismo instante.
Uso: python tools/crear_video_prueba.py salida.webm [segundos] [fps]
"""
import sys, subprocess
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
secs = float(sys.argv[2]) if len(sys.argv) > 2 else 20
fps = int(sys.argv[3]) if len(sys.argv) > 3 else 30
W, H = 1280, 720            # 16:9, como una película común
N = int(secs * fps)
BITS = 12
# zonas de los códigos (fracciones del fotograma): izquierda y derecha
BAR_Y0, BAR_Y1 = 0.04, 0.12
BARS = [(0.05, 0.40), (0.60, 0.95)]
try:
    big = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 120)
    mid = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 40)
except OSError:
    big = mid = ImageFont.load_default()

ff = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                       '-s', f'{W}x{H}', '-r', str(fps), '-i', '-', '-c:v', 'libvpx', '-b:v', '2M', '-deadline', 'realtime',
                       '-cpu-used', '8', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
for f in range(N):
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for x in range(0, W, 8):   # fondo: degradado de colores que se mueve
        c = ((x * 255 // W + f * 3) % 255, 80, 255 - x * 255 // W)
        d.rectangle([x, 0, x + 8, H], fill=c)
    d.rectangle([0, int(H * 0.5) - 3, W, int(H * 0.5) + 3], fill=(255, 255, 255))      # línea horizontal (alineación)
    x = int((f % fps) / fps * W)
    d.rectangle([x - 6, int(H * 0.2), x + 6, int(H * 0.95)], fill=(255, 255, 0))      # barra que recorre la pantalla cada segundo
    d.text((W * 0.22, H * 0.55), 'A', font=big, fill=(255, 160, 80), anchor='mm')
    d.text((W * 0.78, H * 0.55), 'B', font=big, fill=(80, 190, 255), anchor='mm')
    d.text((W * 0.5, H * 0.32), f'{f:04d}', font=big, fill=(255, 255, 255), anchor='mm', stroke_width=4, stroke_fill=(0, 0, 0))
    d.text((W * 0.5, H * 0.88), f'{f / fps:06.2f} s', font=mid, fill=(255, 255, 255), anchor='mm', stroke_width=2, stroke_fill=(0, 0, 0))
    for x0, x1 in BARS:      # código de barras: bit más significativo a la izquierda
        cw = (x1 - x0) * W / BITS
        d.rectangle([x0 * W - 6, BAR_Y0 * H - 6, x1 * W + 6, BAR_Y1 * H + 6], fill=(255, 0, 0))
        for b in range(BITS):
            on = (f >> (BITS - 1 - b)) & 1
            d.rectangle([x0 * W + b * cw, BAR_Y0 * H, x0 * W + (b + 1) * cw - 1, BAR_Y1 * H], fill=(255, 255, 255) if on else (0, 0, 0))
    ff.stdin.write(im.tobytes())
ff.stdin.close(); ff.wait()
print('creado', out, N, 'fotogramas', W, 'x', H, fps, 'fps')
