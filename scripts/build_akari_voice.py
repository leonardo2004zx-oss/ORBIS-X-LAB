"""Graba todas las frases de Akari con una voz neuronal y genera akari/voice-pack.js.

Requisitos: node, ffmpeg, `pip install piper-tts praat-parselmouth` y el modelo de Piper
es_AR-daniela-high (https://huggingface.co/rhasspy/piper-voices, carpeta es/es_AR/daniela/high).

Uso: python3 scripts/build_akari_voice.py RUTA/MODELO.onnx [--pilot SALIDA.wav]

Con --pilot solo graba la secuencia de prueba de la pregunta 3 (pregunta, opciones, acierto y error)
en un único wav e imprime sus mediciones, sin tocar akari/voice-pack.js.

Los segmentos, su estilo y la palabra clave de cada pregunta salen de spokenStyles() en akari/index.html (bloque /*SPEECH-START*/ ... /*SPEECH-END*/),
así que después de cambiar preguntas o diálogos hay que volver a correr este script.

Para que Akari suene alegre y no plana, cada frase pasa por Praat (PSOLA): se sube el tono (techo +3 st) y se
estira la melodía alrededor de su mediana, sin tocar el timbre ni la duración. La velocidad va solo en Piper
(length_scale). Cada segmento lleva fundidos de 5 ms para que no haya clics al encadenarlos.
"""
import base64
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import wave

import numpy as np
import parselmouth
from parselmouth.praat import call
from piper import PiperVoice, SynthesisConfig

# estilo: (length_scale, noise_scale, noise_w_scale, semitonos arriba, factor de melodía)
# Cada modelo tiene su perfil: la velocidad (length_scale) se calibra para que todos hablen al mismo ritmo,
# y el factor de melodía depende de cuánto rango trae la voz de origen.
PROFILES = {}
PROFILES["es_AR-daniela-high"] = {
    "hype": (0.84, 0.85, 1.0, 3.0, 1.85),  # festejos, burlas, sorpresas
    "play": (0.88, 0.80, 0.95, 2.5, 1.5),  # explicaciones y frases normales, con energía
    "ask": (0.90, 0.80, 0.95, 2.0, 1.5),   # la pregunta; su palabra clave sube +1 st (techo total: +3 st)
    "list": (0.95, 0.60, 0.80, 1.5, 1.15),  # opciones: tono más llano para no competir con la pregunta
    "calm": (1.00, 0.70, 0.85, 1.0, 1.25),  # suspenso: «La respuesta era…», «Atención…»
    "key": (0.96, 0.85, 1.0, 3.0, 1.7),    # lo que se revela: en el techo de tono y más fuerte
    "sad": (0.95, 0.70, 0.80, 1.5, 1.2),   # pierde una vida, game over
}
# «claude» (es_MX) trae 8-9 st de rango de origen (daniela: ~5,5) y habla ~22 % más lento con el mismo
# length_scale: se acelera (×0,78) y se estira menos la melodía. El suspenso va en los silencios, no en
# frenar la voz: calm/key/list no son más lentos que el resto.
PROFILES["es_MX-claude-high"] = {
    "hype": (0.66, 0.85, 1.0, 3.0, 1.3),
    "play": (0.69, 0.80, 0.95, 2.5, 1.2),
    "ask": (0.70, 0.80, 0.95, 2.0, 1.2),
    "list": (0.72, 0.60, 0.80, 1.5, 1.0),
    "calm": (0.70, 0.70, 0.85, 1.0, 1.1),
    "key": (0.70, 0.85, 1.0, 3.0, 1.25),
    "sad": (0.74, 0.70, 0.80, 1.5, 1.0),
}
F0_FLOOR, F0_CEIL = 150, 450  # rango de análisis de tono para una voz femenina aguda
GAIN_DB = {"hype": 2.0, "key": 2.0, "list": -1.0}  # la energía sale de intensidad y rango, no de más tono
MAX_SEMI = 3.0  # techo de subida de tono


def phon_count(text):
    return sum(1 for sent in voice.phonemize(text) for ph in sent if ph not in "ˈˌ")


def keyword_span(raw, text, k):
    """Estima en qué tramo del audio se dice la palabra clave, por proporción de fonemas."""
    i = text.find(k)
    total = phon_count(text)
    if i < 0 or not total:
        return None
    a, b = phon_count(text[:i]) / total, phon_count(text[:i + len(k)]) / total
    with wave.open(raw) as w:
        sr = w.getframerate()
        x = np.abs(np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float))
    loud = np.where(x > x.max() * 0.06)[0]
    v0, v1 = loud[0] / sr, loud[-1] / sr
    return v0 + a * (v1 - v0) - 0.03, v0 + b * (v1 - v0) + 0.05


def liven(inp, out, semi, expand, span=None):
    snd = parselmouth.Sound(inp)
    man = call(snd, "To Manipulation", 0.01, F0_FLOOR, F0_CEIL)
    pt = call(man, "Extract pitch tier")
    n = call(pt, "Get number of points")
    if n < 3:
        call(snd, "Scale peak", 0.9)
        snd.save(out, "WAV")
        return
    ts = [call(pt, "Get time from index", i) for i in range(1, n + 1)]
    fs = np.array([call(pt, "Get value at index", i) for i in range(1, n + 1)])
    med = np.median(fs)
    boost = np.zeros(len(ts))
    if span:  # énfasis: la palabra clave sube 1 semitono con rampas suaves de 40 ms
        t0, t1 = span
        boost = 1.0 * np.clip(np.minimum((np.array(ts) - t0) / 0.04, (t1 - np.array(ts)) / 0.04), 0, 1)
    new = med * 2 ** ((12 * np.log2(fs / med) * expand + np.minimum(semi + boost, MAX_SEMI)) / 12)
    npt = call("Create PitchTier", "p", snd.xmin, snd.xmax)
    for t, f in zip(ts, new):
        call(npt, "Add point", t, float(min(f, 700)))
    call([npt, man], "Replace pitch tier")
    res = call(man, "Get resynthesis (overlap-add)")
    if span:  # y un poco más fuerte (+3 dB); Praat nunca cambia la duración
        e0, e1 = t0, t1
        call(res, "Formula", f"self * (1 + 0.41 * min(1, max(0, min((x - {e0}) / 0.04, ({e1} - x) / 0.04))))")
    call(res, "Scale peak", 0.9)  # evita recortes al guardar
    res.save(out, "WAV")


def render(text, style, keyword, tmp, i):
    """Graba un segmento y devuelve la ruta del wav procesado (antes de comprimir)."""
    ls, ns, nw, semi, expand = STYLES[style]
    clean = text.replace("«", "").replace("»", "").replace("…", "...")
    raw, lively, final = f"{tmp}/{i}.wav", f"{tmp}/{i}l.wav", f"{tmp}/{i}f.wav"
    with wave.open(raw, "wb") as w:
        voice.synthesize_wav(clean, w, syn_config=SynthesisConfig(length_scale=ls, noise_scale=ns, noise_w_scale=nw))
    liven(raw, lively, semi, expand, keyword_span(raw, clean, keyword) if keyword else None)
    # recorta silencios, da brillo, nivela volumen y pone fundidos de 5 ms
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", lively, "-af",
                    "silenceremove=start_periods=1:start_threshold=-50dB,afade=t=in:d=0.005,areverse,silenceremove=start_periods=1:start_threshold=-50dB,afade=t=in:d=0.005,areverse,"
                    f"treble=g=2.5:f=3200,loudnorm=I=-16:TP=-1.5,volume={GAIN_DB.get(style, 0)}dB,afade=t=in:d=0.005,areverse,afade=t=in:d=0.005,areverse",
                    "-ar", "22050", "-ac", "1", final], check=True)
    return final


def measure(path):
    """Rango de F0 (5-95 %, en semitonos), pendiente (st/s) y duración (ms)."""
    snd = parselmouth.Sound(path)
    p = snd.to_pitch_ac(time_step=0.01, pitch_floor=F0_FLOOR, pitch_ceiling=F0_CEIL)
    f0, t = p.selected_array["frequency"], p.xs()
    m = f0 > 0
    if m.sum() < 5:
        return 0.0, 0.0, snd.duration * 1000
    st = 12 * np.log2(f0[m] / 100)
    return np.percentile(st, 95) - np.percentile(st, 5), np.polyfit(t[m], st, 1)[0], snd.duration * 1000


model = pathlib.Path(sys.argv[1])
STYLES = PROFILES[model.name.removesuffix(".onnx")]
voice = PiperVoice.load(str(model))
root = pathlib.Path(__file__).resolve().parent.parent / "akari"

if "--pilot" in sys.argv:
    out = sys.argv[sys.argv.index("--pilot") + 1]
    q, opts = "¿Qué órganos producen la orina?", ["La vejiga urinaria.", "Los riñones.", "Los uréteres.", "El hígado."]
    x = "Los riñones la producen. La vejiga solo la guarda."
    seq = [("Pregunta 3.", "play", "", 300), (q, "ask", "producen", 450)]
    for k, (l, o) in enumerate(zip(["A.", "Be.", "Ce.", "De."], opts)):
        seq += [(l, "list", "", 90), (o, "list", "", 260 if k < 3 else 1000)]
    seq += [("A ver…", "calm", "", 400), ("¡Correctísimo! Me caés bien.", "hype", "", 300), (x, "play", "", 1000),
            ("¡Jajaja, no! Perdón, perdón… bueno, no tanto.", "hype", "", 400), ("La respuesta era…", "calm", "", 500),
            ("Los riñones.", "key", "", 300), (x, "play", "", 0)]
    parts = []
    print(f"{'segmento':48} {'estilo':5} {'rango':>7} {'pend.':>7} {'dur':>6}")
    with tempfile.TemporaryDirectory() as tmp:
        for i, (text, style, kw, pause) in enumerate(seq):
            f = render(text, style, kw, tmp, i)
            r, sl, d = measure(f)
            print(f"{text[:48]:48} {style:5} {r:5.1f}st {sl:+6.1f} {d:5.0f}ms")
            with wave.open(f) as w:
                parts += [np.frombuffer(w.readframes(w.getnframes()), np.int16), np.zeros(int(22050 * pause / 1000), np.int16)]
    with wave.open(out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050); w.writeframes(np.concatenate(parts).tobytes())
    sys.exit(0)

html = (root / "index.html").read_text(encoding="utf-8")
block = re.search(r"/\*SPEECH-START\*/(.*?)/\*SPEECH-END\*/", html, re.S).group(1)
lines = json.loads(subprocess.run(["node", "-e", block + "\nprocess.stdout.write(JSON.stringify(spokenStyles()))"],
                                  capture_output=True, text=True, check=True).stdout)
pack = {}
with tempfile.TemporaryDirectory() as tmp:
    for i, (text, style, keyword) in enumerate(lines):
        f = render(text, style, keyword, tmp, i)
        mp3 = f"{tmp}/{i}.mp3"  # MP3 mono: lo decodifican todos los navegadores
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f, "-b:a", "40k", mp3], check=True)
        pack[style + "|" + text] = base64.b64encode(pathlib.Path(mp3).read_bytes()).decode()

out = root / "voice-pack.js"
out.write_text(f"/* Voz de Akari: Piper TTS, modelo {model.name.removesuffix('.onnx')} (rhasspy/piper-voices), entonación ajustada con Praat. "
               "Generado por scripts/build_akari_voice.py */\n"
               "window.AKARI_VOICE=" + json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"{len(pack)} frases, {out.stat().st_size / 1e6:.2f} MB -> {out}")
