"""Genera GIFs animados de demostración (formato vertical 9:16) para las historias.

Uso:  python3 scripts/make_demo_gifs.py
Requiere Pillow.
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

W, H = 270, 480
FRAMES = 36
OUT = Path(__file__).resolve().parent.parent / "demo"


def save(name, frames, ms=60):
    OUT.mkdir(exist_ok=True)
    frames[0].save(OUT / name, save_all=True, append_images=frames[1:],
                   duration=ms, loop=0, optimize=True, disposal=2)
    print("✔", name)


def gradient(top, bottom):
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))
    return img


def warp():
    """1. Salto al hiperespacio: estrellas que salen del centro."""
    rnd = random.Random(1)
    stars = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(0, 1)) for _ in range(140)]
    frames = []
    for f in range(FRAMES):
        img = Image.new("RGB", (W, H), (5, 5, 20))
        d = ImageDraw.Draw(img)
        for ang, start in stars:
            r = ((start + f / FRAMES) % 1) ** 2 * 320
            r2 = r * 0.82
            cx, cy = W / 2, H / 2
            x1, y1 = cx + math.cos(ang) * r2, cy + math.sin(ang) * r2
            x2, y2 = cx + math.cos(ang) * r, cy + math.sin(ang) * r
            c = min(255, int(80 + r))
            d.line([(x1, y1), (x2, y2)], fill=(c, c, 255), width=2)
        frames.append(img)
    save("01-hiperespacio.gif", frames, 50)


def orbit():
    """2. Planeta con luna en órbita."""
    rnd = random.Random(2)
    bg = Image.new("RGB", (W, H), (8, 6, 30))
    bd = ImageDraw.Draw(bg)
    for _ in range(90):
        x, y = rnd.randrange(W), rnd.randrange(H)
        bd.point((x, y), fill=(200, 200, 230))
    frames = []
    cx, cy = W / 2, H / 2
    for f in range(FRAMES):
        img = bg.copy()
        d = ImageDraw.Draw(img)
        a = 2 * math.pi * f / FRAMES
        mx, my = cx + math.cos(a) * 105, cy + math.sin(a) * 38
        behind = math.sin(a) < 0
        moon = lambda: d.ellipse([mx - 12, my - 12, mx + 12, my + 12], fill=(220, 220, 210))
        d.ellipse([cx - 105, cy - 38, cx + 105, cy + 38], outline=(70, 60, 140))
        if behind:
            moon()
        d.ellipse([cx - 60, cy - 60, cx + 60, cy + 60], fill=(40, 120, 220))
        d.chord([cx - 60, cy - 60, cx + 60, cy + 60], 200, 340, fill=(60, 180, 120))
        d.ellipse([cx - 25 + 10 * math.cos(a), cy + 10, cx + 20 + 10 * math.cos(a), cy + 35], fill=(70, 170, 110))
        if not behind:
            moon()
        frames.append(img)
    save("02-orbita.gif", frames, 70)


def rocket():
    """3. Cohete despegando con humo."""
    frames = []
    for f in range(FRAMES):
        img = gradient((20, 30, 80), (230, 120, 90))
        d = ImageDraw.Draw(img)
        t = f / FRAMES
        y = 330 - t * 420 + math.sin(f) * 2
        x = W / 2
        rnd = random.Random(f)
        for i in range(14):
            sy = y + 70 + i * 14
            s = 6 + i * 2.2
            ox = rnd.uniform(-8, 8)
            g = max(120, 245 - i * 8)
            d.ellipse([x + ox - s, sy - s, x + ox + s, sy + s], fill=(g, g, g))
        d.polygon([(x - 6, y + 55), (x + 6, y + 55), (x, y + 75 + rnd.uniform(0, 12))], fill=(255, 190, 40))
        d.rectangle([x - 14, y, x + 14, y + 55], fill=(240, 240, 250))
        d.polygon([(x - 14, y), (x + 14, y), (x, y - 30)], fill=(220, 50, 60))
        d.polygon([(x - 14, y + 35), (x - 28, y + 58), (x - 14, y + 55)], fill=(220, 50, 60))
        d.polygon([(x + 14, y + 35), (x + 28, y + 58), (x + 14, y + 55)], fill=(220, 50, 60))
        d.ellipse([x - 6, y + 12, x + 6, y + 24], fill=(80, 170, 255))
        d.rectangle([0, 440, W, H], fill=(30, 30, 40))
        frames.append(img)
    save("03-despegue.gif", frames, 60)


def waves():
    """4. Atardecer con olas en movimiento."""
    frames = []
    for f in range(FRAMES):
        img = gradient((255, 140, 80), (120, 40, 110))
        d = ImageDraw.Draw(img)
        pulse = 4 * math.sin(2 * math.pi * f / FRAMES)
        d.ellipse([W / 2 - 50 - pulse, 190 - pulse, W / 2 + 50 + pulse, 290 + pulse], fill=(255, 225, 120))
        for layer in range(5):
            base = 270 + layer * 45
            col = (20 + layer * 8, 60 + layer * 20, 130 + layer * 15)
            pts = [(0, H)]
            for x in range(0, W + 6, 6):
                ph = 2 * math.pi * (f / FRAMES) * (1 if layer % 2 else -1)
                pts.append((x, base + 10 * math.sin(x / 28 + ph + layer)))
            pts.append((W, H))
            d.polygon(pts, fill=col)
        frames.append(img)
    save("04-atardecer.gif", frames, 70)


if __name__ == "__main__":
    warp(); orbit(); rocket(); waves()
