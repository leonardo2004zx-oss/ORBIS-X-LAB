# PRUEBAS — DUAL PROJECTOR LAB

Fecha: 2026-11-09 · Versión: v4 (commit ba93eb4) · Navegador: Chromium 153 (Playwright) en Linux.
Las pruebas usan los controles reales (clics, toques y sliders) y miden píxeles de la proyección con `gl.readPixels`.

## Resumen
| Conjunto | Entorno | Resultado |
|---|---|---|
| `tests/movil.js` (Pixel 7 emulado, Chrome Android, toques reales del protocolo de Chrome) | `http://localhost` | 20/20 pruebas pasaron. |
| `tests/movil.js` | **archivo exacto publicado en claude.ai (v4)**, descargado de nuevo | 20/20 pruebas pasaron. |
| `tests/carga_archivos.js` (navegador visible) | archivo publicado v4 dentro de `<iframe sandbox="allow-scripts">` | 11/11 pruebas pasaron. |
| `tests/carga_archivos.js` (navegador visible) | `file://` | 11/11 pruebas pasaron. |
| `tests/carga_archivos.js` (navegador visible) | `http://localhost` | 11/11 pruebas pasaron. |
| `tests/verify.js` (escritorio, completo) | `file://` | 27/27 pruebas pasaron. |
| `tests/verify.js` (escritorio, completo) | `http://localhost` | 27/27 pruebas pasaron. |

## Celular — archivo publicado v4
| | Prueba | Detalle |
|---|---|---|
| ✅ | Abre en modo celular (horizontal) | carga 361 ms; barra táctil visible; barra superior: none; desborde horizontal 0 px; calidad inicial medium |
| ✅ | El 3D se visualiza | píxeles centrales: [[215,113,131],[219,114,133],[225,133,129]] |
| ✅ | Un dedo gira la cámara 3D | la cámara se movió 6.88 m alrededor del objetivo, distancia 3.75 → 3.75 m |
| ✅ | Dos dedos acercan y alejan | distancia 3.75 → (separar) 0.64 → (juntar) 2.94 m |
| ✅ | Botón «⟲ Inicio» vuelve a la vista inicial | posición final a 0.000 m de la inicial |
| ✅ | Modos A, B y C desde la barra táctil | A:0/1 · B:1/1 · C:1/2.2 (modo:intensidad/gamma) |
| ✅ | Botones 2D/3D y vista técnica | vista 2d, cámara tech |
| ✅ | Panel de ajustes desplegable con controles de A/B y Edge Blending | panel abierto en x=419 (ancho 420 de 839), B movido 0.15 m, blending 0.4, control deslizante de 391px, se cierra: true |
| ✅ | Botones táctiles grandes (≥ 44 px) | lado menor de cada botón: 44, 44, 44, 50, 52, 52, 52, 52, 46, 52 px |
| ✅ | Botón «🖼 Imagen» abre el selector de la galería | acepta: image/* |
| ✅ | La imagen se muestra y se reparte entre A (rojo) y B (azul) | A rgb(221,136,136) · B rgb(118,136,222) · "Mostrando “imagen_prueba.png” (1600×450)." |
| ✅ | Botón «🎬 Video» abre el selector de archivos | acepta: video/*,.mp4,.webm,.mkv,.mov,.m4v,.3gp |
| ✅ | El video se reproduce sobre la pantalla virtual (una sola fuente para A y B) | t 0.32 → 1.52 s · "Reproduciendo “video_prueba.webm” (1280×360), repartido entre A y B." |
| ✅ | Botón «⛶» pantalla completa responde | pantalla completa activada |
| ✅ | Foto de 24 MP (6000×4000) se reduce para la GPU del teléfono | textura 4096×2731 · "Mostrando “foto_24mp.jpg” (6000×4000)." |
| ✅ | Video 4K se reduce en lugar de subir 4K a la GPU en cada cuadro | textura 1920×1080 · t=0.99 s · "Reproduciendo “video_4k.webm” (3840×2160, reducido a 1920×1080 para fluidez), repartido entre A y B." |
| ✅ | Si un visor bloquea la galería, aparece el aviso para abrir en Chrome | {"v":true,"mob":true} |
| ✅ | Vertical: sin desborde y barra táctil visible | {"over":0,"mbar":true} |
| ✅ | En un visor integrado (WebView) avisa que conviene abrir en Chrome | aviso visible: true |
| ✅ | Consola sin errores | [] |

## Carga de archivos — archivo publicado v4 en iframe aislado
| | Prueba | Detalle |
|---|---|---|
| ✅ | Clic en "Cargar imagen…" abre el selector de archivos | selector abierto (acepta: image/*) |
| ✅ | La imagen aparece en la pantalla virtual: A muestra la mitad roja y B la mitad azul | color medio en A: rgb(216,86,86) · en B: rgb(95,118,221) · estado: "Mostrando “imagen_prueba.png” (1600×450)." |
| ✅ | Clic en "Cargar video local…" abre el selector de archivos | selector abierto (acepta: video/*,.mp4,.webm,.mkv,.mov,.m4v,.ogv) |
| ✅ | El video se reproduce en la pantalla virtual | tiempo 0.35 → 2.07 s; ancho 1280 px; 32 de 300 puntos de la pantalla cambiaron de imagen; estado: "Reproduciendo “video_prueba.webm” (1280×360), repartido entre A y B." |
| ✅ | El video se reparte entre A y B (partes distintas, franja compartida idéntica) | diferencia en partes propias 144.7 · en la franja compartida 0.0 |
| ✅ | 3D activo y la rotación con el mouse cambia la vista | diferencia de imagen tras arrastrar: 282.7 |
| ✅ | Controles de Edge Blending siguen funcionando | intensidad 1 → 0.3, superposición → 0.25 |
| ✅ | Si el visor bloquea el selector, aparece un aviso con alternativas | aviso visible |
| ✅ | Alternativa: arrastrar y soltar la imagen la carga |  |
| ✅ | Alternativa: pegar el archivo con Ctrl+V lo carga |  |
| ✅ | Consola sin errores | [] |

## Escritorio completo — file://
| | Prueba | Detalle |
|---|---|---|
| ✅ | La aplicación carga sin errores | tiempo hasta lista: 380 ms; errores: [] |
| ✅ | Cambio 2D ⇄ 3D y vistas frontal / técnica / sillón | 2d → 3d → tech → seat → front |
| ✅ | A y B proyectan partes diferentes (no es la misma imagen duplicada) | sunset: 14.7, city: 13.6, grid: 17.7 niveles de diferencia media en el mismo punto local |
| ✅ | La zona de superposición muestra el mismo contenido en A y B (panorama continuo) | sunset: 0.0, city: 0.0, grid: 0.0 niveles en la franja compartida |
| ✅ | Modo A: la unión se ve más brillante | {"base":141,"max":180.6,"min":137,"brightPts":11} |
| ✅ | Modo B (rampa lineal, gamma 1): aparece una banda oscura | {"base":141,"max":145,"min":98.3,"brightPts":0} |
| ✅ | Modo C: transición casi invisible (variación < 6 niveles) | {"base":145,"max":146,"min":145,"brightPts":0} |
| ✅ | El control de superposición cambia el ancho de la franja | puntos brillantes con 5 %: 4, con 30 %: 27 |
| ✅ | El control de intensidad del Edge Blending elimina la franja | sin blending: pico +40.0; con blending: variación 1.0 |
| ✅ | Mover un control de calibración pasa a Modo B (manual) | modo actual: B |
| ✅ | Posición horizontal de B mueve su imagen | centro X: 1.411 → 1.611 m; cambio de píxeles 27.5 |
| ✅ | Control "Posición vertical" modifica la proyección | 0.000 → 0.100 |
| ✅ | Control "Distancia (cambia el tamaño)" modifica la proyección | 3.321 → 4.286 |
| ✅ | Control "Tamaño / zoom" modifica la proyección | 4.286 → 4.714 |
| ✅ | Control "Rotación" modifica la proyección | 0.000 → 0.035 |
| ✅ | Brillo de B lo oscurece | 228.0 → 192.0 |
| ✅ | Corrección de color (azul de B) cambia el tono | RGB 192,192,129 |
| ✅ | Apagar B deja su zona sin imagen | luminancia 17.0 |
| ✅ | Tamaños 100″–300″ calculan 16:9 correctamente | 300″ → 664×374 cm; 100″ → 221.4×124.5 cm |
| ✅ | Video local: se carga, se reproduce y la imagen cambia | t 0.51 → 1.92 s; cambio de píxeles 5.8 |
| ✅ | Video sincronizado: una sola fuente; la franja compartida es idéntica en A y B | textura única de video: true; dif. franja 0.0; dif. partes propias 142.0 |
| ✅ | Botón "Cargar imagen…" abre el selector y carga la imagen | fuente actual: imagen |
| ✅ | Interfaz liviana con CPU 4× más lenta | carga 418 ms; memoria JS 14.5 MB; render mediano 0.2 ms (GPU por software); respuesta a un control 67 ms |
| ✅ | En reposo no se redibuja (no consume GPU) | cuadros dibujados en 1,5 s quieta: 0 |
| ✅ | No usa bloqueo del puntero | pointerLockElement = null |
| ✅ | Pantalla angosta sin desplazamiento horizontal | exceso: 0 px |
| ✅ | Sin errores de JavaScript durante toda la prueba | [] |

## NO verificado
- **Ningún teléfono Android físico.** Todo lo táctil es emulación de Chromium (Pixel 7) con eventos táctiles del protocolo de depuración.
- **La galería real de Android**: Playwright intercepta el selector (`filechooser`); no se vio la interfaz de la galería.
- **Dentro de la app de Claude / WebView real**: no se puede automatizar desde aquí. Solo se simuló el agente de usuario de WebView (aparece el aviso).
- **URL pública de GitHub Pages**: no se publicó (bloqueado por permisos) y `*.github.io` no es accesible desde este entorno.
- **Rendimiento en GPU real de teléfono**: se usó gráficos por software (SwiftShader).
- **MP4 H.264 / HEVC y fotos HEIC reales**: el Chromium de pruebas no trae esos códecs; se probaron WebM y JPG/PNG (incluida una foto de 24 MP y un video 4K).
- **Bloqueo de orientación horizontal**: la API se llama, pero en emulación no hay giro físico.
