"""Genera la narración con Piper (TTS neuronal libre, voz es_MX) y la línea de tiempo.

Uso: python3 tools/tts.py <voz.onnx> <dir_salida>
Salida: <dir>/lineas/*.wav (48 kHz mono), <dir>/timeline.json, <dir>/subtitulos.vtt
"""
import json, os, subprocess, sys, wave
import numpy as np

GAP = 0.75          # silencio entre frases de una misma escena
LENGTH_SCALE = "1.08"  # un poco más pausado que el valor por defecto

def dur(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()

def pauses(path, min_gap=0.22):
    """Silencios internos (inicio, fin) en segundos: sirven para sincronizar la imagen con la voz."""
    with wave.open(path) as w:
        sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    hop = int(sr * 0.01); n = len(x) // hop
    rms = np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(1)) / 32768
    voiced = rms > max(0.01, rms.max() * 0.06)
    idx = np.flatnonzero(voiced)
    if len(idx) == 0: return []
    out, run = [], None
    for i in range(idx[0], idx[-1]):
        if not voiced[i]:
            run = i if run is None else run
        elif run is not None:
            if (i - run) * 0.01 >= min_gap: out.append([round(run * 0.01, 2), round(i * 0.01, 2)])
            run = None
    return out

def chunks(text, maxlen=84):
    """Divide una frase larga en subtítulos breves (por oraciones y, si hace falta, por comas)."""
    import re
    parts = [p.strip() for p in re.split(r'(?<=[.:;])\s+|(?<=\.\.\.)\s+', text) if p.strip()]
    out = []
    def split(p):
        if len(p) <= maxlen: return [p]
        mid = len(p) / 2
        commas = [m.end() for m in re.finditer(r',\s', p) if 0.25 * len(p) < m.end() < 0.75 * len(p)]
        spaces = [m.start() for m in re.finditer(r'\s', p)]
        cut = min(commas or spaces, key=lambda c: abs(c - mid))
        return split(p[:cut].strip()) + split(p[cut:].strip())
    for p in parts: out += split(p)
    return out

def vtt_ts(t):
    h, r = divmod(t, 3600); m, s = divmod(r, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"

def main():
    voice, out = sys.argv[1], sys.argv[2]
    here = os.path.dirname(os.path.abspath(__file__))
    spec = json.load(open(os.path.join(here, "..", "narracion.json"), encoding="utf-8"))
    os.makedirs(os.path.join(out, "lineas"), exist_ok=True)
    t = spec["intro"]
    scenes, cues = [], []
    for si, sc in enumerate(spec["escenas"]):
        start = t
        t += sc["pre"]
        lines = []
        for li, text in enumerate(sc["lineas"]):
            raw = os.path.join(out, "lineas", f"{si:02d}_{li}_raw.wav")
            wav = os.path.join(out, "lineas", f"{si:02d}_{li}.wav")
            if not os.path.exists(wav):
                subprocess.run([sys.executable, "-m", "piper", "-m", voice, "-f", raw,
                                "--length-scale", LENGTH_SCALE, "--sentence-silence", "0.35"],
                               input=text.encode("utf-8"), check=True, capture_output=True)
                subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", raw, "-af",
                                "highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=120,aresample=48000",
                                "-ac", "1", "-ar", "48000", wav], check=True)
                os.remove(raw)
            d = dur(wav)
            lines.append({"start": round(t, 3), "end": round(t + d, 3), "text": text, "wav": wav,
                          "pauses": pauses(wav)})
            parts = chunks(text); total = sum(len(p) for p in parts); a = t
            for p in parts:
                b = a + d * len(p) / total
                cues.append((a, b, p)); a = b
            t += d + GAP
        t += sc["post"] - GAP
        scenes.append({"id": sc["id"], "era": sc["era"], "start": round(start, 3), "end": round(t, 3), "lines": lines})
    total = t + spec["outro"]
    tl = {"title": spec["titulo"], "subtitle": spec["subtitulo"], "intro": spec["intro"],
          "duration": round(total, 3), "scenes": scenes}
    json.dump(tl, open(os.path.join(out, "timeline.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    with open(os.path.join(out, "subtitulos.vtt"), "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for i, (a, b, txt) in enumerate(cues, 1):
            f.write(f"{i}\n{vtt_ts(a)} --> {vtt_ts(b)}\n{txt}\n\n")
    print(f"duración total: {total:.1f} s")
    for s in scenes:
        print(f"  {s['id']:18s} {s['start']:7.1f} → {s['end']:7.1f}")

if __name__ == "__main__":
    main()
