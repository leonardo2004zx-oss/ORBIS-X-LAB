# PRUEBAS — DUAL PROJECTOR LAB (v5)

Fecha: 2026-11-09 · Navegador: Chromium 153 (Playwright). Celular: **Pixel 7 emulado** (Chrome Android, pantalla táctil, toques enviados por el protocolo de depuración de Chrome).
Foto real usada: `tests/foto_real_cafe.jpg` (fotografía real de dominio público, del paquete scikit-image).

## A. Pruebas AUTOMÁTICAS
Miden la **imagen renderizada** (píxeles leídos de WebGL con `gl.readPixels`), no solo que un botón exista.

| Conjunto | Entorno | Resultado |
|---|---|---|
| `tests/calibracion.js` | **archivo exacto publicado en claude.ai (v5)** | 21/21 pruebas pasaron. |
| `tests/calibracion.js` | servidor local | 21/21 pruebas pasaron. |
| `tests/movil.js` (video, modos A/B/C, gestos, galería) | archivo publicado v5 | 20/20 pruebas pasaron. |
| `tests/movil.js` | servidor local | 20/20 pruebas pasaron. |
| `tests/carga_archivos.js` (navegador visible) | archivo publicado v5 dentro de iframe aislado | 11/11 pruebas pasaron. |
| `tests/carga_archivos.js` (navegador visible) | `file://` | 11/11 pruebas pasaron. |
| `tests/carga_archivos.js` (navegador visible) | servidor local | 11/11 pruebas pasaron. |
| `tests/verify.js` (escritorio completo, modos A/B/C) | `file://` | 27/27 pruebas pasaron. |
| `tests/verify.js` | servidor local | 27/27 pruebas pasaron. |

Cómo se mide cada cosa:
- **Enfoque**: «energía de gradiente» de una zona de la foto (suma de diferencias entre píxeles vecinos). Baja al desenfocar y vuelve al valor exacto al enfocar.
- **Zoom**: con una imagen de barras de período fijo se mide la separación entre barras en pantalla; debe crecer en la misma proporción que el zoom.
- **Arrastre**: se compara una fila de píxeles antes y después; el desplazamiento medido debe ser igual al del dedo.
- **Alineación**: error geométrico en milímetros + diferencia de píxeles entre «solo A» y «solo B» en la franja compartida (si están alineados, muestran lo mismo).

### Encuadre, enfoque y calibración — archivo publicado v5
| | Prueba | Detalle |
|---|---|---|
| ✅ | Foto real cargada desde el botón «🖼 Imagen» | "Mostrando “foto_real_cafe.jpg” (600×400)." · textura 600×400 |
| ✅ | «◌ Desenfocar» realmente desenfoca la imagen | nitidez medida 22.8 → 14.4 (63 %), foco A/B = 0.4/0.4 |
| ✅ | «◉ Enfocar» devuelve la nitidez original | nitidez 14.4 → 22.8 (original 22.8) |
| ✅ | El enfoque es independiente del zoom y de la geometría | posición/tamaño de A y zoom de la foto sin cambios al desenfocar |
| ✅ | «Nitidez digital +» realza los bordes (procesado, distinto del foco) | nitidez 22.8 → 43.5 (191 %) |
| ✅ | El enfoque se ve también en la vista 3D | nitidez en 3D 20.3 → 16.9 → (auto-enfocar) 20.3 |
| ✅ | «+» amplía y «−» reduce la foto (cambia la escala real) | separación entre líneas en A: 52 px → (+ +, zoom 156 %) 81 px → (− − −, zoom 80 %) 42 px (proporcional al zoom) |
| ✅ | Arrastrar con un dedo mueve la foto lo mismo que el dedo | dedo +60 px → la imagen se movió 60 px del lienzo (esperado 60), desplazamiento 12 % |
| ✅ | Pellizcar amplía la foto | zoom 100 % → 300 %; la imagen cambió (dif 31.8) |
| ✅ | «⌖ Centrar» y «⤢ Ajustar» restauran el encuadre | tras centrar: desplazamiento 0/0 (zoom 300 %); tras ajustar la imagen es idéntica a la original (dif 0.00) |
| ✅ | «↯ Desalinear» produce imagen doble visible | error 0 → 56 mm; diferencia A/B en la franja compartida 0.0 → 14.6 |
| ✅ | El desalineado se ve también en 3D | cambio de la imagen 3D: 20.0 |
| ✅ | «⇄ Antes/Después» alterna entre el estado guardado y el actual | ANTES: error 0 mm (cartel visible); DESPUÉS: 56 mm; imagen después = actual (dif 0.00) |
| ✅ | Realinear a mano con toques (arrastre + flechas + ⟳ + tamaño + foco) | tras arrastrar: X -0.0 cm, Y -0.0 cm; final: error 0.1 mm · diferencia A/B 14.6 → 0.0 · barra: "B: X -0.0 cm · Y -0.0 cm · 0.00° · 100.0 % · foco 0.0imagen doble: 0 mm ✔ alineado" |
| ✅ | Pellizcar en Calibrar cambia el tamaño de la proyección seleccionada | zoom de B 100.0 % → 120.0 % |
| ✅ | «⌖ Autoalinear» vuelve a superponer A y B | error 0.0 mm; diferencia A/B 1.3 (alineado original 0.0) |
| ✅ | «↺ Restablecer» vuelve todo a los valores iniciales | {"e":4.440892098500626e-16,"f":[0,0],"ph":[1,0,0],"sh":0,"mode":"C"} |
| ✅ | «▦ Cuadrícula» muestra y oculta la cuadrícula con puntos de referencia | cambio de imagen al ocultarla: 50.4 |
| ✅ | Los botones no tapan la vista (horizontal y vertical) | horiz. calibrar {"tooldock":"ok","mbar":"ok","vista":"839×347","frac":0.84,"over":0} · horiz. ver {"tooldock":"ok","mbar":"ok","vista":"839×347","frac":0.84,"over":0} · vert. ver {"tooldock":"ok","mbar":"ok","vista":"412×635","frac":0.76,"over":0} · vert. calibrar {"tooldock":"ok","mbar":"ok","vista":"412×454","frac":0.54,"over":0} |
| ✅ | En vertical, las flechas mueven la proyección | X de B 0.0 → 5.0 cm |
| ✅ | Consola sin errores | [] |

### Celular (regresión: video, modos, gestos) — archivo publicado v5
| | Prueba | Detalle |
|---|---|---|
| ✅ | Abre en modo celular (horizontal) | carga 392 ms; barra táctil visible; barra superior: none; desborde horizontal 0 px; calidad inicial medium |
| ✅ | El 3D se visualiza | píxeles centrales: [[217,121,130],[220,123,131],[226,143,128]] |
| ✅ | Un dedo gira la cámara 3D | la cámara se movió 6.07 m alrededor del objetivo, distancia 3.16 → 3.16 m |
| ✅ | Dos dedos acercan y alejan | distancia 3.16 → (separar) 0.54 → (juntar) 2.47 m |
| ✅ | Botón «⟲ Inicio» vuelve a la vista inicial | posición final a 0.000 m de la inicial |
| ✅ | Modos A, B y C desde la barra táctil | A:0/1 · B:1/1 · C:1/2.2 (modo:intensidad/gamma) |
| ✅ | Botones 2D/3D y vista técnica | vista 2d, cámara tech |
| ✅ | Panel de ajustes desplegable con controles de A/B y Edge Blending | panel abierto en x=419 (ancho 420 de 839), B movido 0.15 m, blending 0.4, control deslizante de 391px, se cierra: true |
| ✅ | Botones táctiles grandes (≥ 44 px) | lado menor de cada botón: 44, 44, 44, 50, 52, 52, 52, 52, 52, 52, 46, 52 px |
| ✅ | Botón «🖼 Imagen» abre el selector de la galería | acepta: image/* |
| ✅ | La imagen se muestra y se reparte entre A (rojo) y B (azul) | A rgb(221,136,136) · B rgb(118,136,222) · "Mostrando “imagen_prueba.png” (1600×450)." |
| ✅ | Botón «🎬 Video» abre el selector de archivos | acepta: video/*,.mp4,.webm,.mkv,.mov,.m4v,.3gp |
| ✅ | El video se reproduce sobre la pantalla virtual (una sola fuente para A y B) | t 0.32 → 1.52 s · "Reproduciendo “video_prueba.webm” (1280×360), repartido entre A y B." |
| ✅ | Botón «⛶» pantalla completa responde | pantalla completa activada |
| ✅ | Foto de 24 MP (6000×4000) se reduce para la GPU del teléfono | textura 4096×2731 · "Mostrando “foto_24mp.jpg” (6000×4000)." |
| ✅ | Video 4K se reduce en lugar de subir 4K a la GPU en cada cuadro | textura 1920×1080 · t=0.97 s · "Reproduciendo “video_4k.webm” (3840×2160, reducido a 1920×1080 para fluidez), repartido entre A y B." |
| ✅ | Si un visor bloquea la galería, aparece el aviso para abrir en Chrome | {"v":true,"mob":true} |
| ✅ | Vertical: sin desborde y barra táctil visible | {"over":0,"mbar":true} |
| ✅ | En un visor integrado (WebView) avisa que conviene abrir en Chrome | aviso visible: true |
| ✅ | Consola sin errores | [] |

## B. Verificación VISUAL (las capturas las miré)
Capturas en `CODIGO_FUENTE/tests/capturas/`. Revisé ampliadas:
| Captura | Qué se comprobó a la vista |
|---|---|
| `verif_visual_enfoque.png` | La foto del café pierde detalle claramente al desenfocar (vetas de la madera, borde de la taza, cuchara) y gana contraste de bordes con nitidez digital. |
| `verif_visual_alineacion.png` | Desalineado: los puntos de referencia y la cuadrícula aparecen dobles (naranja A y celeste B separados). Realineado a mano: puntos y líneas superpuestos, blancos. |
| `verif_visual_zoom_comparar_vertical.png` | El zoom agranda las barras; el cartel «ANTES» aparece abajo de la vista sin tapar avisos; en vertical todos los controles quedan debajo de la vista. |
| `verif_visual_nivel_negro.png` | Franja apenas más clara solo en zonas oscuras de la superposición: es el nivel de negro sumado (comportamiento real esperado, no un error). |
| `cal_10_vertical_ver.png`, `cal_11_vertical_calibrar.png` | Vertical: la vista y las barras no se superponen. |

## C. NO verificado
- **Ningún teléfono Android físico.** Los toques son eventos táctiles emulados; no se probó en la pantalla de un celular real ni con la galería real de Android (Playwright intercepta el selector de archivos).
- **Fotos tomadas con tu celular**: se usó una foto real de dominio público (600×400). No se probaron fotos HEIC reales.
- **Rendimiento en GPU de teléfono**: se usó gráficos por software. El desenfoque usa 17 muestras por píxel solo cuando el foco no es 0.
- **URL pública**: GitHub Pages sigue sin publicarse (bloqueado por permisos).
