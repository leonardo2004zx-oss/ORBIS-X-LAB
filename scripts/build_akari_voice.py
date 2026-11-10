"""Graba todas las frases de Akari con una voz neuronal y genera akari/voice-pack.js.

Requisitos: node, ffmpeg, `pip install piper-tts praat-parselmouth` y el modelo de Piper
es_AR-daniela-high (https://huggingface.co/rhasspy/piper-voices, carpeta es/es_AR/daniela/high).

Uso: python3 scripts/build_akari_voice.py RUTA/es_AR-daniela-high.onnx

Las frases y su estilo salen de spokenStyles() en akari/index.html (bloque /*SPEECH-START*/ ... /*SPEECH-END*/),
así que después de cambiar preguntas o diálogos hay que volver a correr este script.

Para que Akari suene alegre y no plana, cada frase pasa por Praat (PSOLA): se sube el tono y se
estira la melodía alrededor de su mediana, sin tocar el timbre. Cada estilo tiene su intensidad.
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
    "play": (0.88, 0.80, 0.95, 2.5, 1.5),  # preguntas y explicaciones, con energía
    "sad": (0.95, 0.70, 0.80, 1.5, 1.2),   # pierde una vida, game over
}


def liven(inp, out, semi, expand):
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
    new = med * 2 ** ((12 * np.log2(fs / med) * expand + semi) / 12)
    npt = call("Create PitchTier", "p", snd.xmin, snd.xmax)
    for t, f in zip(ts, new):
        call(npt, "Add point", t, float(min(f, 700)))
    call([npt, man], "Replace pitch tier")
    res = call(man, "Get resynthesis (overlap-add)")
    call(res, "Scale peak", 0.9)  # evita recortes al guardar
    res.save(out, "WAV")


root = pathlib.Path(__file__).resolve().parent.parent / "akari"
html = (root / "index.html").read_text(encoding="utf-8")
block = re.search(r"/\*SPEECH-START\*/(.*?)/\*SPEECH-END\*/", html, re.S).group(1)
lines = json.loads(subprocess.run(["node", "-e", block + "\nprocess.stdout.write(JSON.stringify(spokenStyles()))"],
                                  capture_output=True, text=True, check=True).stdout)

voice = PiperVoice.load(sys.argv[1])
pack = {}
with tempfile.TemporaryDirectory() as tmp:
    for i, (text, style) in enumerate(lines):
        ls, ns, nw, semi, expand = STYLES[style]
        clean = text.replace("«", "").replace("»", "").replace("…", "...")
        raw, lively, mp3 = f"{tmp}/{i}.wav", f"{tmp}/{i}l.wav", f"{tmp}/{i}.mp3"
        with wave.open(raw, "wb") as w:
            voice.synthesize_wav(clean, w, syn_config=SynthesisConfig(length_scale=ls, noise_scale=ns, noise_w_scale=nw))
        liven(raw, lively, semi, expand)
        # recorta silencios, da brillo y nivela volumen; MP3 mono lo decodifican todos los navegadores
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", lively, "-af",
                        "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                        "treble=g=2.5:f=3200,loudnorm=I=-16:TP=-1.5",
                        "-ar", "22050", "-ac", "1", "-b:a", "48k", mp3], check=True)
        pack[text] = base64.b64encode(pathlib.Path(mp3).read_bytes()).decode()

out = root / "voice-pack.js"
out.write_text("/* Voz de Akari: Piper TTS, modelo es_AR «daniela» (rhasspy/piper-voices), entonación ajustada con Praat. "
               "Generado por scripts/build_akari_voice.py */\n"
               "window.AKARI_VOICE=" + json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"{len(pack)} frases, {out.stat().st_size / 1e6:.2f} MB -> {out}")
