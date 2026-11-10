# PRUEBAS — DUAL PROJECTOR PLAYER v7

Fecha: 2026-11-10. Navegador **visible** Chromium 153, sobre una pantalla virtual Linux (Xvfb) de 1920×1080, en **un solo monitor**.
Se dibuja con canvas por CPU (`--disable-gpu`), como en una PC sin GPU. El bloqueador de ventanas emergentes está **activo**, igual que en Edge/Chrome normales.
Video: `tests/video_sincronizacion.webm` (1280×720, 30 fps, 20 s). Cada fotograma lleva su número codificado en dos códigos de barras de 12 bits, uno en la mitad izquierda y otro en la derecha.

## A. Pruebas automáticas (`tests/dos_ventanas.js`): 17/17
Las comprobaciones de sincronía leen el número de fotograma del código de barras **pintado en cada ventana**, no el estado interno del reproductor.

| | Prueba | Resultado medido |
|---|---|---|
| ✅ | Abre un video local | 1280×720, 20.0 s |
| ✅ | Se abren dos ventanas independientes (A y B) con el bloqueador de ventanas activo | Proyector A — Dual Projector Player / Proyector B — Dual Projector Player · botón: «Ahora tocá para abrir B ▸» → «A y B abiertas ✓» |
| ✅ | Cada ventana pinta exactamente el fotograma actual del único decodificador | 100.0 % de los dibujos coinciden (±1) con el fotograma de la fuente |
| ✅ | Sincronía en pantalla entre A y B | 186 instantes comparados: mismo fotograma en 98.9 %, diferencia media 0.01, máxima 1 fotograma(s) (1 fotograma = 33 ms); un mismo fotograma aparece en A y en B con 4.7 ms de diferencia (mediana), 11.3 ms (p95) |
| ✅ | Los fotogramas avanzan al reproducir | A: 0 → 180, B: 0 → 180 |
| ✅ | Rendimiento (FPS, CPU, memoria) | FPS dibujados A 30 / B 30 (video de 30 fps) · ventanas 955×500 y 955×500 · CPU del navegador 53 % de un núcleo · memoria del navegador (PSS) 985 MB con las dos ventanas reproduciendo, 454 MB solo con el panel (RSS sumado 1599 MB) · JS 3.8 MB |
| ✅ | Cada ventana muestra una parte diferente del mismo video | A: letra «A» naranja 0.4 %, «B» celeste 0.00 % · B: «A» 0.00 %, «B» 0.4 % |
| ✅ | Pausa: ambas ventanas quedan quietas en el mismo fotograma | A 189→189 · B 189→189 |
| ✅ | Saltar a 10 s cambia el fotograma en ambas ventanas | fotograma A 300, B 300 (esperado 300) |
| ✅ | Edge blending atenúa realmente el borde compartido de A | brillo del borde derecho de A: con blending 23, sin blending 86 (centro 166) |
| ✅ | Solapamiento: en Superpuesta A y B muestran la misma imagen completa | diferencia A/B: panorámica 102.5 → superpuesta 0.0 |
| ✅ | Híbrida (50 %): A y B comparten la mitad | diferencia A/B 66.5 |
| ✅ | «Encajar» mantiene la proporción original (16:9); «Estirar» la deforma | proporción con Encajar 1.778 (16:9 = 1,778), con Estirar 3.53; borde izquierdo de A: negro 0 (barra lateral) vs. imagen 164 |
| ✅ | Alineación fina: ▶ mueve la imagen de B 2 píxeles | desplazamiento medido 2 px |
| ✅ | Cuadrícula de calibración se dibuja en las ventanas | brillo medio 49.0 → 52.1 |
| ✅ | Pantalla completa en la ventana A (pedido aceptado por el navegador) | requestFullscreen → true; tamaño del lienzo 955×500 (esta pantalla virtual no tiene gestor de ventanas, por eso no cambió el tamaño: NO verificado visualmente) |
| ✅ | Sin errores de JavaScript | [] |

## B. Sincronía medida en la GRABACIÓN DE PANTALLA (`tools/medir_grabacion.py`)
Se grabó la pantalla real con ffmpeg (x11grab, 25 cuadros/s), mientras las dos ventanas reproducían en modo panorámico.
En cada cuadro grabado se decodificó el código de barras **dentro de la ventana A** y **dentro de la ventana B**.

| Corrida | Capturas con A y B legibles | Mismo fotograma | Diferencia máxima |
|---|---|---|---|
| Final (`tests/resultados/`) | 113 | 113 (100.0 %) | 0 fotogramas |
| Anteriores, con el mismo método de dibujo | 120 · 123 | 98,3 % · 95,9 % | 1 · 2 fotogramas (33–67 ms) |

Lecturas descartadas: códigos que la compresión de la grabación volvió ilegibles. Se validan contra la secuencia de **su propia ventana**, sin suponer que A y B coinciden.
La grabación también captura la pantalla a su propio ritmo, así que puede tomar un instante en que una ventana ya se actualizó y la otra todavía no.

## C. Verificación visual
- `tests/resultados/demo_dos_ventanas.mp4`: la grabación completa. Panel arriba; ventana A (izquierda) y ventana B (derecha) abajo, con el mismo número de fotograma y el mismo tiempo.
- `ventana_A.png` / `ventana_B.png`: cada ventana muestra su parte (la letra «A» naranja solo en A y la «B» celeste solo en B).
- `panel_superpuesta.png`: en Superpuesta las dos muestran la imagen completa.

## D. Rendimiento medido (esta PC de pruebas, no Windows)
- 30 fotogramas dibujados por segundo en cada ventana (video de 30 fps). Solo se dibuja cuando hay un fotograma nuevo.
- CPU del navegador ≈ 53 % de **un** núcleo, con las dos ventanas reproduciendo y dibujo por CPU.
- Memoria (PSS, sin contar dos veces lo compartido): ≈ 985 MB con el panel y las dos ventanas; ≈ 454 MB solo con el panel. La memoria de JavaScript es de ≈ 4 MB.
  La mayor parte es memoria base del navegador Chromium. En una PC de 4 GB conviene cerrar otras pestañas.
- Con la capa de gráficos emulada (SwiftShader) el rendimiento fue mucho peor (≈ 15 fps): en esta máquina sin GPU, el camino por CPU es mejor.

## E. NO verificado
- **Proyectores reales y salida HDMI**: solo se probaron dos ventanas en un monitor.
- **Segundo monitor y «Detectar pantallas»**: no hay dos pantallas en el entorno de pruebas.
- **Pantalla completa**: el navegador aceptó el pedido, pero la pantalla virtual no tiene gestor de ventanas y el tamaño no cambió.
- **Windows real**: el lanzador `INICIAR_REPRODUCTOR.bat` no se ejecutó.
- **MP4/H.264**: el Chromium de pruebas no trae ese códec.
- **Versión web (claude.ai)**: la vista previa funciona dentro de un marco aislado, pero el navegador **bloquea abrir ventanas nuevas** allí (probado en un iframe con `sandbox="allow-scripts"`). En el visor real de claude.ai no se probó.
- **PS4 / capturadora**: solo diseño.
