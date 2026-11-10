"""Graba todas las frases de Akari con una voz neuronal y genera akari/voice-pack.js.

Requisitos: node, ffmpeg y Piper (pip install piper-tts) con el modelo
es_AR-daniela-high (https://huggingface.co/rhasspy/piper-voices, carpeta es/es_AR/daniela/high).

Uso: python3 scripts/build_akari_voice.py RUTA/es_AR-daniela-high.onnx

Las frases salen de allSpoken() en akari/index.html (bloque /*SPEECH-START*/ ... /*SPEECH-END*/),
así que después de cambiar preguntas o diálogos hay que volver a correr este script.
"""
import base64
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import wave

from piper import PiperVoice, SynthesisConfig

root = pathlib.Path(__file__).resolve().parent.parent / "akari"
html = (root / "index.html").read_text(encoding="utf-8")
block = re.search(r"/\*SPEECH-START\*/(.*?)/\*SPEECH-END\*/", html, re.S).group(1)
lines = json.loads(subprocess.run(["node", "-e", block + "\nprocess.stdout.write(JSON.stringify(allSpoken()))"],
                                  capture_output=True, text=True, check=True).stdout)

voice = PiperVoice.load(sys.argv[1])
cfg = SynthesisConfig(length_scale=0.93, noise_scale=0.6, noise_w_scale=0.8)
pack = {}
with tempfile.TemporaryDirectory() as tmp:
    for i, text in enumerate(lines):
        clean = text.replace("«", "").replace("»", "").replace("…", "...")
        wav_path, mp3_path = f"{tmp}/{i}.wav", f"{tmp}/{i}.mp3"
        with wave.open(wav_path, "wb") as w:
            voice.synthesize_wav(clean, w, syn_config=cfg)
        # recorta silencios de los bordes y comprime a MP3 mono (lo decodifican todos los navegadores)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav_path, "-af",
                        "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5",
                        "-ar", "22050", "-ac", "1", "-b:a", "48k", mp3_path], check=True)
        pack[text] = base64.b64encode(pathlib.Path(mp3_path).read_bytes()).decode()

out = root / "voice-pack.js"
out.write_text("/* Voz de Akari: Piper TTS, modelo es_AR «daniela» (rhasspy/piper-voices). Generado por scripts/build_akari_voice.py */\n"
               "window.AKARI_VOICE=" + json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"{len(pack)} frases, {out.stat().st_size / 1e6:.2f} MB -> {out}")
