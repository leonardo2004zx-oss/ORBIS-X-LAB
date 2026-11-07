#!/usr/bin/env bash
# Ejemplo de uso de PS4 ZSTD Forge en Linux.
# Uso: ./ejemplo_uso.sh /ruta/CUSA12345 /ruta/destino
set -euo pipefail
GAME="${1:?carpeta del juego (CUSAxxxxx)}"
DEST="${2:-./ffpfsc_out}"
cd "$(dirname "$0")/.."

# 0) Comprobar que MkPFS está instalado
python3 ps4zstdforge.py doctor

# 1) Ver qué juego es (lee sce_sys/param.sfo)
python3 ps4zstdforge.py info "$GAME"

# 2) Crear la imagen .ffpfsc: zlib nivel 9, todos los núcleos, verificación rápida.
python3 ps4zstdforge.py --input "$GAME" --output "$DEST/" --level 9 --threads -1

# 3) (Opcional) Verificación completa: desempaqueta todo y compara cada archivo.
#    Necesita tanto espacio libre como ocupa el juego.
IMG="$(ls -t "$DEST"/*.ffpfsc | head -n1)"
# python3 ps4zstdforge.py verify "$IMG" --source "$GAME" --full

# 4) Instrucciones para ShadowMountPlus
cat "$IMG.shadowmount.txt"
