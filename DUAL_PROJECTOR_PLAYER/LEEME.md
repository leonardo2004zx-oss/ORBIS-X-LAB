# DUAL PROJECTOR PLAYER v7 — reproductor real de doble salida

Abre un video local, **divide cada fotograma en dos partes (A y B)** y muestra cada parte en **su propia ventana**.
Cada ventana se puede llevar a un monitor o proyector distinto y poner en pantalla completa.
Tiene solapamiento ajustable, edge blending con compensación gamma, alineación fina y cuadrícula de calibración.

El **simulador v6** sigue intacto en la carpeta `DUAL_PROJECTOR_LAB/`.

## Cómo usarlo en Windows (sin instalar nada)
1. Copiá la carpeta `DUAL_PROJECTOR_PLAYER` a tu PC.
2. Doble clic en **`INICIAR_REPRODUCTOR.bat`**. Abre el reproductor en Edge (o Chrome) como una aplicación.
   También funciona abriendo `index.html` con doble clic.
3. **🎬 Abrir video local…** (o «Video de prueba» para medir la sincronía).
4. Tocá **«Abrir A y B»** dos veces: el navegador permite abrir una ventana por clic. Si aparece un aviso de ventanas bloqueadas, permitilas para esta página.
5. Llevá cada ventana a su pantalla. En Edge/Chrome podés usar **🖥 Detectar pantallas** para que se abran directamente en el monitor elegido.
6. Dentro de cada ventana: **⛶**, doble clic o la tecla **F** = pantalla completa · **Espacio** = pausa.
7. Ajustá el **solapamiento** (Panorámica 15 % / Híbrida 50 % / Superpuesta 100 %), el **edge blending**, la **proporción** (Encajar no deforma ni recorta) y la **alineación fina** (◀ ▶ ▲ ▼ de a 2 píxeles).

## Cómo funciona
- **Un solo decodificador.** Hay un único `<video>`. Las ventanas A y B son ventanas `about:blank` del mismo origen que dibujan su parte de ese video. Para cada fotograma se toma **una sola instantánea** (`VideoFrame`, sin copiar píxeles) y con ella se dibujan A y B en la misma tarea, así el video no puede avanzar entre una y otra.
- **Liviano.** Usa canvas 2D (no necesita WebGL) y dibuja solo cuando hay un fotograma nuevo (`requestVideoFrameCallback`), o sea 30 veces por segundo para un video de 30 fps. Con las ventanas abiertas, las vistas previas del panel se actualizan 4 veces por segundo.
- **Edge blending.** En la zona compartida, la señal se atenúa con `w^(1/γ)` para que la luz de A + B sume 1, con la misma fórmula que el simulador v6.

## Archivos
```
index.html, css/player.css      panel de control
js/core.js                      reparto del fotograma A/B, proporción y blending (sin dependencias)
js/player.js                    video, ventanas de salida, controles y medición
INICIAR_REPRODUCTOR.bat         lanzador para Windows (Edge/Chrome en modo aplicación)
docs/ARQUITECTURA_PS4.md        diseño futuro con capturadora HDMI (no implementado)
tests/dos_ventanas.js           prueba real con dos ventanas (Playwright + navegador visible)
tests/video_sincronizacion.webm video de prueba con el número de fotograma codificado
tools/crear_video_prueba.py     genera el video de prueba
tools/medir_grabacion.py        mide la sincronía sobre una grabación de pantalla
```

## Pruebas
```
xvfb-run -a -s "-screen 0 1920x1080x24" node tests/dos_ventanas.js "http://localhost:8000/index.html?test=1" resultados 1
python -I tools/medir_grabacion.py resultados/demo_dos_ventanas.mp4 0,575,955,505 965,575,955,505 <desde_s> <hasta_s>
```
Con `?test=1`, cada ventana lee el número de fotograma del código de barras que **ella misma pintó**.

## Lo que todavía NO está comprobado
- Salida a **proyectores reales por HDMI** y a un **segundo monitor** (aquí solo se probaron dos ventanas en un monitor).
- Ejecución en **Windows** real (se probó en Linux con Chromium 153). El `.bat` no se ejecutó.
- Formatos: se probó WebM (VP8). MP4/H.264 depende del navegador (Edge y Chrome en Windows lo reproducen).
- Captura HDMI de la PS4: solo diseño (ver `docs/ARQUITECTURA_PS4.md`).
