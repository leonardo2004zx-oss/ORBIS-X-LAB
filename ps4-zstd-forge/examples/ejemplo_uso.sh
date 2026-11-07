#!/usr/bin/env bash
# Ejemplo de uso de PS4 ZSTD Forge en Linux.
# Uso: ./ejemplo_uso.sh /ruta/CUSA12345 /ruta/destino
set -euo pipefail
GAME="${1:?carpeta del juego (CUSAxxxxx)}"
DEST="${2:-./zstd_out}"
cd "$(dirname "$0")/.."

# 1) Ver qué juego es (lee sce_sys/param.sfo)
python3 ps4zstdforge.py info "$GAME"

# 2) Empaquetar: nivel 22 (máximo), todos los núcleos, verificación rápida.
python3 ps4zstdforge.py --input "$GAME" --output "$DEST/" --level 22 --threads -1

# 3) (Opcional) Verificación completa contra el origen: descomprime todo.
ARCHIVE="$(ls -t "$DEST"/*.tar.zst | head -n1)"
python3 ps4zstdforge.py verify "$ARCHIVE" --source "$GAME" --full

# 4) (Opcional) Sacar un solo archivo sin descomprimir el resto.
python3 ps4zstdforge.py extract "$ARCHIVE" --dest "$DEST/prueba" --only sce_sys/param.sfo
