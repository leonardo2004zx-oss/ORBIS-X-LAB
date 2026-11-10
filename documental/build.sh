#!/usr/bin/env bash
# Compila el documental "La rama humana" de principio a fin con herramientas libres.
# Requisitos: python3 + numpy, piper-tts, node + playwright (Chromium), ffmpeg.
# Uso: ./build.sh [directorio_de_trabajo]
set -euo pipefail
cd "$(dirname "$0")"
WORK="${1:-build}"; mkdir -p "$WORK/seg" "$WORK/voices"
VOICE="$WORK/voices/es_MX-claude-high.onnx"
if [ ! -f "$VOICE" ]; then
  base=https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx
  curl -sSL -o "$VOICE" "$base"; curl -sSL -o "$VOICE.json" "$base.json"
fi
# 1) Narración y línea de tiempo
python3 tools/tts.py "$VOICE" "$WORK"
DUR=$(python3 -c "import json;print(json.load(open('$WORK/timeline.json'))['duration'])")
# 2) Fotogramas (4 procesos en paralelo, 24 fps)
for i in 0 1 2 3; do
  a=$(python3 -c "print(round(round($DUR*$i/4*24)/24,4))"); b=$(python3 -c "print(round(round($DUR*($i+1)/4*24)/24,4))")
  node render/capture.mjs --timeline "$WORK/timeline.json" --out "$WORK/seg/s$i.mp4" --from "$a" --to "$b" &
done
wait
for i in 0 1 2 3; do echo "file 's$i.mp4'"; done > "$WORK/seg/list.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$WORK/seg/list.txt" -c copy "$WORK/video_raw.mp4"
# 3) Música, ambientes, efectos y mezcla con la voz
python3 tools/audio.py "$WORK/timeline.json" "$WORK/mezcla.wav"
# 4) Codificación final H.264 + AAC (dos pasadas, < 100 MB) con normalización de sonoridad
ffmpeg -v error -y -i "$WORK/video_raw.mp4" -c:v libx264 -preset slow -b:v 2400k -tune film -pass 1 -passlogfile "$WORK/x264" -an -f mp4 /dev/null
ffmpeg -v error -y -i "$WORK/video_raw.mp4" -i "$WORK/mezcla.wav" -map 0:v -map 1:a \
  -c:v libx264 -preset slow -b:v 2400k -maxrate 5000k -bufsize 8000k -tune film -pass 2 -passlogfile "$WORK/x264" \
  -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" -c:a aac -b:a 192k -shortest la-rama-humana.mp4
cp "$WORK/subtitulos.vtt" subtitulos.vtt
ffmpeg -v error -y -ss 4 -i la-rama-humana.mp4 -frames:v 1 -q:v 3 poster.jpg
echo "Listo: documental/la-rama-humana.mp4"
