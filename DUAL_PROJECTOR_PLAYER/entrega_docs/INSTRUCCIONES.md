# INSTRUCCIONES — v7

## Usar el reproductor en Windows
1. Copiar `DUAL_PROJECTOR_PLAYER` a la PC.
2. Doble clic en `INICIAR_REPRODUCTOR.bat` (o en `index.html`).
3. «🎬 Abrir video local…» o «Video de prueba».
4. «Abrir A y B» **dos veces** (una ventana por clic). Permitir ventanas emergentes si el navegador lo pide.
5. Llevar cada ventana a su monitor o proyector (o «🖥 Detectar pantallas») y pulsar ⛶ / F / doble clic dentro de cada una.
6. Ajustar solapamiento, blending, proporción y alineación desde el panel.

## Probar sin proyectores
Con un solo monitor, las dos ventanas lado a lado ya muestran la división. La zona compartida aparece repetida en las dos, porque con proyectores reales esa franja se superpone.

## Reproducir las pruebas
Linux con Node.js, Playwright, Xvfb y ffmpeg:
```
cd DUAL_PROJECTOR_PLAYER && python3 -m http.server 8790 &
CHROME_ARGS="--disable-gpu" xvfb-run -a -s "-screen 0 1920x1080x24" node tests/dos_ventanas.js "http://127.0.0.1:8790/index.html?test=1" tests/resultados 1
read a b < tests/resultados/segmento_medicion.txt
python3 -I tools/medir_grabacion.py tests/resultados/demo_dos_ventanas.mp4 0,575,955,505 965,575,955,505 $a $b
```
Para regenerar el video de prueba: `python3 tools/crear_video_prueba.py tests/video_sincronizacion.webm 20 30`.

## Simulador v6
Sigue en `DUAL_PROJECTOR_LAB/` (sin cambios). Enlace: https://claude.ai/artifact/GiqKcVsBmUsEG7sc6aYj76
