# PRUEBAS — DUAL PROJECTOR LAB

Fecha: 2026-11-09 · Versión probada: commit 7248143 (v3) · Navegador: Chromium 153 (Playwright) en Linux.
Todas las pruebas usan los controles reales de la interfaz (clics y sliders) y miden píxeles de la proyección con `gl.readPixels`.

## Resumen
| Conjunto | Entorno | Resultado |
|---|---|---|
| `tests/verify.js` | `file://` (sin servidor) | 27/27 pruebas pasaron. |
| `tests/verify.js` | `http://localhost` | 27/27 pruebas pasaron. |
| `tests/carga_archivos.js` (navegador **visible**, Xvfb) | `file://` | 11/11 pruebas pasaron. |
| `tests/carga_archivos.js` (navegador **visible**) | `http://localhost` | 11/11 pruebas pasaron. |
| `tests/carga_archivos.js` (navegador **visible**) | **archivo exacto publicado en claude.ai** (v3, descargado de nuevo) dentro de `<iframe sandbox="allow-scripts">` | 11/11 pruebas pasaron. |

## Carga de archivos — archivo publicado, dentro de iframe aislado
| | Prueba | Detalle |
|---|---|---|
| ✅ | Clic en "Cargar imagen…" abre el selector de archivos | selector abierto (acepta: image/*) |
| ✅ | La imagen aparece en la pantalla virtual: A muestra la mitad roja y B la mitad azul | color medio en A: rgb(216,86,86) · en B: rgb(95,118,221) · estado: "Mostrando “imagen_prueba.png” (1600×450)." |
| ✅ | Clic en "Cargar video local…" abre el selector de archivos | selector abierto (acepta: video/*,.mp4,.webm,.mkv,.mov,.m4v,.ogv) |
| ✅ | El video se reproduce en la pantalla virtual | tiempo 0.31 → 2.01 s; ancho 1280 px; 29 de 300 puntos de la pantalla cambiaron de imagen; estado: "Reproduciendo “video_prueba.webm” (1280×360), repartido entre A y B." |
| ✅ | El video se reparte entre A y B (partes distintas, franja compartida idéntica) | diferencia en partes propias 146.3 · en la franja compartida 0.0 |
| ✅ | 3D activo y la rotación con el mouse cambia la vista | diferencia de imagen tras arrastrar: 244.7 |
| ✅ | Controles de Edge Blending siguen funcionando | intensidad 1 → 0.3, superposición → 0.25 |
| ✅ | Si el visor bloquea el selector, aparece un aviso con alternativas | aviso visible |
| ✅ | Alternativa: arrastrar y soltar la imagen la carga |  |
| ✅ | Alternativa: pegar el archivo con Ctrl+V lo carga |  |
| ✅ | Consola sin errores | [] |

## Carga de archivos — file://
| | Prueba | Detalle |
|---|---|---|
| ✅ | Clic en "Cargar imagen…" abre el selector de archivos | selector abierto (acepta: image/*) |
| ✅ | La imagen aparece en la pantalla virtual: A muestra la mitad roja y B la mitad azul | color medio en A: rgb(218,105,105) · en B: rgb(105,126,221) · estado: "Mostrando “imagen_prueba.png” (1600×450)." |
| ✅ | Clic en "Cargar video local…" abre el selector de archivos | selector abierto (acepta: video/*,.mp4,.webm,.mkv,.mov,.m4v,.ogv) |
| ✅ | El video se reproduce en la pantalla virtual | tiempo 0.31 → 2.04 s; ancho 1280 px; 33 de 300 puntos de la pantalla cambiaron de imagen; estado: "Reproduciendo “video_prueba.webm” (1280×360), repartido entre A y B." |
| ✅ | El video se reparte entre A y B (partes distintas, franja compartida idéntica) | diferencia en partes propias 147.5 · en la franja compartida 0.0 |
| ✅ | 3D activo y la rotación con el mouse cambia la vista | diferencia de imagen tras arrastrar: 286.7 |
| ✅ | Controles de Edge Blending siguen funcionando | intensidad 1 → 0.3, superposición → 0.25 |
| ✅ | Si el visor bloquea el selector, aparece un aviso con alternativas | aviso visible |
| ✅ | Alternativa: arrastrar y soltar la imagen la carga |  |
| ✅ | Alternativa: pegar el archivo con Ctrl+V lo carga |  |
| ✅ | Consola sin errores | [] |

## Funcional completo — file://
| | Prueba | Detalle |
|---|---|---|
| ✅ | La aplicación carga sin errores | tiempo hasta lista: 420 ms; errores: [] |
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
| ✅ | Video local: se carga, se reproduce y la imagen cambia | t 0.51 → 1.89 s; cambio de píxeles 5.8 |
| ✅ | Video sincronizado: una sola fuente; la franja compartida es idéntica en A y B | textura única de video: true; dif. franja 0.0; dif. partes propias 142.0 |
| ✅ | Botón "Cargar imagen…" abre el selector y carga la imagen | fuente actual: imagen |
| ✅ | Interfaz liviana con CPU 4× más lenta | carga 404 ms; memoria JS 14.5 MB; render mediano 1.9 ms (GPU por software); respuesta a un control 94 ms |
| ✅ | En reposo no se redibuja (no consume GPU) | cuadros dibujados en 1,5 s quieta: 0 |
| ✅ | No usa bloqueo del puntero | pointerLockElement = null |
| ✅ | Pantalla angosta sin desplazamiento horizontal | exceso: 0 px |
| ✅ | Sin errores de JavaScript durante toda la prueba | [] |

## NO verificado
- **Dentro del visor de claude.ai / app de Claude**: no hay forma de automatizarlo desde este entorno. Es justamente donde el usuario ve el fallo.
- **Windows real y un Celeron N2808 real**: se emuló una CPU 4× más lenta y gráficos por software (SwiftShader).
- **MP4 (H.264)**: el Chromium de pruebas no tiene ese códec; se probó con WebM.
- **Arrastrar desde el Explorador y Ctrl+V reales**: se simularon con eventos `DragEvent`/`ClipboardEvent` que llevan un `File` real.
- **Selector de archivos «real» del sistema**: Playwright intercepta el diálogo (evento `filechooser`), que es el mismo punto en que el navegador lo abriría; no se vio la ventana de Windows.
- **Celular**: solo se probó el diseño a 390 px de ancho (sin desplazamiento horizontal), no en un teléfono real.

## Registros completos
Ver carpeta `REGISTROS/` (salida exacta de cada ejecución) y `CODIGO_FUENTE/tests/capturas/` (capturas de pantalla).
