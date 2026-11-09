# INFORME TÉCNICO — DUAL PROJECTOR LAB

Simulador web de **Edge Blending** con dos proyectores virtuales (A y B) que forman una sola imagen gigante.
Es un laboratorio virtual: no controla proyectores reales ni la salida HDMI de una consola.

## Tecnologías
- HTML + CSS + JavaScript sin compilación ni dependencias de npm.
- **Three.js r147** (`vendor/three.min.js`) y **OrbitControls** (`vendor/OrbitControls.js`), incluidos en la carpeta (licencia MIT).
  Se usó r147 porque es la última versión con *scripts clásicos* (UMD): así la app abre con doble clic (`file://`), sin servidor.
- WebGL 1 (compatible con gráficos integrados Intel antiguos).
- Canvas 2D para generar panoramas y patrones (no hay imágenes externas).

## Arquitectura
```
index.html        estructura de la interfaz (barra superior, escenario, panel lateral)
css/styles.css    estilos (tema oscuro, responsive)
js/content.js     window.DPLContent: panoramas procedurales y patrones de calibración
js/app.js         simulador completo (un IIFE):
                  - estado S (modo, vista, tamaño, superposición, parámetros de A y B)
                  - geometría exacta (pantalla 16:9, distancia, superposición física)
                  - shader de pantalla compartido por la vista 3D y la 2D
                  - sala 3D (piso, paredes, butacas InstancedMesh, sillón, persona, proyectores, haces)
                  - interfaz (sliders generados por código, modos A/B/C, pestañas A/B)
                  - carga de video/imagen (botones, arrastrar, pegar)
                  - render bajo demanda y API de prueba window.DPL
DUAL_PROJECTOR_LAB_un_archivo.html   la misma app en un único archivo (todo en línea)
tests/verify.js                      27 pruebas funcionales (Playwright)
tests/carga_archivos.js              11 pruebas específicas de carga de archivos (navegador visible)
```

### El shader de fusión (núcleo del simulador)
Para cada punto P de la pantalla y cada proyector:
1. Pasa P a coordenadas locales (u,v) del proyector (posición, ancho = distancia ÷ relación de proyección × zoom, rotación, trapecio).
2. Elige su porción de la **única** fuente: A usa `s = u/T`, B usa `s = (u + 1 − o)/T`, con `T = 2 − o` y `o` = superposición.
   Así A y B muestran partes distintas y la franja compartida tiene el mismo contenido.
3. Rampa de fusión en la zona compartida: `w = mix(lineal, smoothstep, curva)`, atenuada por la intensidad.
   La rampa se aplica a la **señal** como `w^(1/gamma)`; el proyector simulado eleva la señal a 2,2.
   Con gamma de compensación 2,2 la luz de A + B suma exactamente 1 → unión invisible.
4. Luz lineal = señal^2,2 × brillo × color + nivel de negro (el negro no se puede atenuar, como en la realidad).
5. Suma A + B, aplica una curva de exposición (aproximación visual) y vuelve a gamma 2,2.

La vista 2D y la 3D usan **el mismo material**, por eso muestran exactamente el mismo resultado.

### Rendimiento (pensado para Celeron N2808 / 4 GB)
- Render **bajo demanda**: en reposo no se dibuja nada (0 cuadros por segundo).
- Calidad Baja / Media / Alta (resolución interna y tamaño de la fuente). Se elige Baja automáticamente con ≤ 2 núcleos o ≤ 4 GB.
- Video limitado a 24–30 cuadros por segundo.
- Sin sombras, sin postprocesado, materiales Lambert, butacas instanciadas.
- Sin bloqueo del puntero.

## Encuadre, enfoque y calibración (v5)
Tres conceptos separados, en controles separados:
| Concepto | Qué cambia | Dónde | Uniforme |
|---|---|---|---|
| Encuadre del contenido (zoom/centrar) | qué parte de la foto se proyecta | 🔍 Encuadre | `uPhoto` |
| Enfoque óptico (simulado) | nitidez del haz de cada proyector (disco de desenfoque) | 🔍 Encuadre (A y B) / 🎯 Calibrar (uno) | `uFocus` |
| Nitidez digital | procesado de la señal (máscara de enfoque) | 🔍 Encuadre | `uSharp` |
| Alineación geométrica | posición, giro y tamaño de cada proyector en la pared | 🎯 Calibrar | `uGA`, `uGB` |
- `srcAt(s)` aplica el encuadre; el desenfoque toma 17 muestras solo si el foco ≠ 0 (no cuesta nada enfocado).
- `calib(s, color)`: cuadrícula de 16×9 celdas por proyector y 5 puntos de referencia, con `fwidth` (`OES_standard_derivatives`) para líneas nítidas.
- `alignError()` calcula, en metros sobre la pared, la separación entre la copia de A y la de B del mismo punto del panorama (3 puntos de la superposición).
- Gestos de herramienta: `Pointer Events` + `Raycaster` contra el plano de la pared (sirve en 2D y 3D). En modo herramienta se desactiva `OrbitControls`.
- `#viewport` (la vista) y las barras `#tooldock`/`#mbar` son hermanos en una columna flex: las barras nunca se superponen al lienzo.

## Versión para celular (v4)
- `body.m` se activa con puntero táctil (`pointer: coarse`) o ancho ≤ 900 px. Cambia el diseño: barra táctil `#mbar`, panel como hoja lateral, barra superior oculta en horizontal baja.
- OrbitControls con `touches = { ONE: ROTATE, TWO: DOLLY_PAN }`.
- `resize()` recalcula el ángulo de cámara (50° horizontal / 72° vertical) y re-encuadra al girar.
- `adaptQuality()` mide el tiempo entre cuadros seguidos y baja la calidad si va lenta.
- Carga: `handleFile()` única; imágenes por `FileReader` → `data:` y reducción en canvas si superan la textura máxima; video por `blob:` (reintento `data:`), con lienzo reducido para resoluciones grandes (`setupVideoTexture()` / `drawVideoFrame()`).
- `isInAppWebView()` detecta WebView de Android y muestra `#wvBanner`.

## Funciones implementadas
- Sala de cine 3D: pantalla, dos proyectores con soporte, haces de luz, butacas, sillón, persona de 1,75 m, tiras LED.
- Vistas: frontal 3D, técnica 3D (haces de color y contornos), desde el sillón, 2D de calibración. Recorrido con mouse y W A S D / Q E.
- Modos: A sin calibración, B manual, C fusión optimizada. Mover un control de calibración pasa a modo B.
- Controles por proyector: encendido, posición X/Y, distancia, zoom, rotación, trapecio vertical, brillo, R/G/B, igualar con el otro.
- Fusión: superposición (0–40 %), intensidad, gamma de compensación, forma de la curva, nivel de negro, bordes, auto-alinear.
- Contenido: 2 panoramas, 5 patrones (cuadrícula, barras, gris 50 %, blanco, negro), imagen propia, video local (play/pausa/sonido/búsqueda, ajuste recortar/encajar/estirar).
- Carga de archivos: botón (input real bajo el clic), arrastrar y soltar, pegar con Ctrl+V, aviso si el visor bloquea el selector.
- Tamaños 100″–300″ con cálculo 16:9 exacto, tabla comparativa, distancia necesaria, superposición física vs. de contenido, resolución combinada.
- Separación explícita entre geometría exacta, supuestos y aproximaciones visuales.

## Supuestos (no son datos del Gadnic C45N)
- Relación de proyección 1,4:1 (editable). - 1920×1080 por proyector. - Lente centrada. - Gamma 2,2.
