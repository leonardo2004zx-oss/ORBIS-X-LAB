"""Graba todas las frases de Akari con una voz neuronal y genera akari/voice-pack.js.

Requisitos: node, ffmpeg, `pip install piper-tts praat-parselmouth` y el modelo de Piper
es_AR-daniela-high (https://huggingface.co/rhasspy/piper-voices, carpeta es/es_AR/daniela/high).

Uso: python3 scripts/build_akari_voice.py RUTA/es_AR-daniela-high.onnx

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
STYLES = {
    "hype": (0.84, 0.85, 1.0, 3.0, 1.85),  # festejos, burlas, sorpresas
    "play": (0.88, 0.80, 0.95, 2.5, 1.5),  # explicaciones y frases normales, con energía
    "ask": (0.90, 0.80, 0.95, 2.0, 1.5),   # la pregunta; su palabra clave sube +1 st (techo total: +3 st)
    "list": (0.95, 0.60, 0.80, 1.5, 1.15),  # opciones: tono más llano para no competir con la pregunta
    "calm": (1.00, 0.70, 0.85, 1.0, 1.25),  # suspenso: «La respuesta era…», «Atención…»
    "key": (0.96, 0.85, 1.0, 3.0, 1.7),    # lo que se revela: en el techo de tono y más fuerte
    "sad": (0.95, 0.70, 0.80, 1.5, 1.2),   # pierde una vida, game over
}
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
    man = call(snd, "To Manipulation", 0.01, 90, 600)
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


root = pathlib.Path(__file__).resolve().parent.parent / "akari"
html = (root / "index.html").read_text(encoding="utf-8")
block = re.search(r"/\*SPEECH-START\*/(.*?)/\*SPEECH-END\*/", html, re.S).group(1)
voice = PiperVoice.load(sys.argv[1])
lines = json.loads(subprocess.run(["node", "-e", block + "\nprocess.stdout.write(JSON.stringify(spokenStyles()))"],
                                  capture_output=True, text=True, check=True).stdout)
pack = {}
with tempfile.TemporaryDirectory() as tmp:
    for i, (text, style, keyword) in enumerate(lines):
        ls, ns, nw, semi, expand = STYLES[style]
        clean = text.replace("«", "").replace("»", "").replace("…", "...")
        raw, lively, mp3 = f"{tmp}/{i}.wav", f"{tmp}/{i}l.wav", f"{tmp}/{i}.mp3"
        with wave.open(raw, "wb") as w:
            voice.synthesize_wav(clean, w, syn_config=SynthesisConfig(length_scale=ls, noise_scale=ns, noise_w_scale=nw))
        liven(raw, lively, semi, expand, keyword_span(raw, clean, keyword) if keyword else None)
        # recorta silencios, da brillo y nivela volumen; MP3 mono lo decodifican todos los navegadores
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", lively, "-af",
                        "silenceremove=start_periods=1:start_threshold=-50dB,afade=t=in:d=0.005,areverse,silenceremove=start_periods=1:start_threshold=-50dB,afade=t=in:d=0.005,areverse,"
                        f"treble=g=2.5:f=3200,loudnorm=I=-16:TP=-1.5,volume={GAIN_DB.get(style, 0)}dB,afade=t=in:d=0.005,areverse,afade=t=in:d=0.005,areverse",
                        "-ar", "22050", "-ac", "1", "-b:a", "40k", mp3], check=True)
        pack[style + "|" + text] = base64.b64encode(pathlib.Path(mp3).read_bytes()).decode()

out = root / "voice-pack.js"
out.write_text("/* Voz de Akari: Piper TTS, modelo es_AR «daniela» (rhasspy/piper-voices), entonación ajustada con Praat. "
               "Generado por scripts/build_akari_voice.py */\n"
               "window.AKARI_VOICE=" + json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"{len(pack)} frases, {out.stat().st_size / 1e6:.2f} MB -> {out}")
