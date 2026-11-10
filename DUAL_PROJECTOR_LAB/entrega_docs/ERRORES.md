# ERRORES — DUAL PROJECTOR LAB

## v6 — observaciones
- Sin errores de la app en las pruebas. Ajustes de diseño hechos al revisar las capturas: en vertical, los botones − / + del solapamiento quedaban en líneas separadas (ahora van juntos), y la leyenda del mapa de luz era demasiado grande en el celular (ahora es compacta).
- Falso negativo de la prueba (no de la app): comparar las porciones de A y B sobre el patrón de cuadrícula, que es casi todo negro, daba poca diferencia. Ahora se compara sobre el panorama.
- Limitación del modelo: el brillo «2×» de la superpuesta se ve en pantalla solo un poco más claro (250 contra 228 de 255) por la curva de exposición de la imagen. El mapa de luz y el perfil muestran el valor físico simulado (2×).

## v5 — errores encontrados al probar
- **⇄ Antes/Después no volvía a «después»** (CORREGIDO): `act()` cerraba la comparación antes de procesar cualquier botón; al tocar ⇄ otra vez, se cerraba y se volvía a abrir. Ahora ⇄ maneja la comparación por sí mismo.
- **La vista se corría de costado en escritorio** al tocar un botón de la barra (CORREGIDO): el grupo de botones no hacía salto de línea y desplazaba el contenedor. Ahora los grupos se acomodan en varias filas y `#stage` usa `overflow: clip`.
- **Cartel «ANTES» encima de los avisos** (CORREGIDO): se movió abajo de la vista.
- **Franja levemente más clara en zonas oscuras de la superposición** (NO es un error): es el nivel de negro de los dos proyectores sumado; la rampa de fusión no puede atenuarlo, igual que en proyectores reales. Medido: la suma A+B en la franja es pareja (~680/765) en zonas claras.
- Falsos negativos de la prueba (no de la app), corregidos en `tests/calibracion.js`: medir el desplazamiento en una franja más corta que el rango de búsqueda daba siempre 0; contar líneas finas en una imagen muy reducida no medía la escala (ahora se mide el período de barras anchas).

## 0. Publicación pública en GitHub Pages bloqueada (ABIERTO)
- Intento: crear la rama `gh-pages` (solo `index.html`, `css/`, `js/`, `vendor/`, `.nojekyll`) y enviarla al repositorio público, ruta estándar para que GitHub publique `https://leonardo2004zx-oss.github.io/ORBIS-X-LAB/`.
- Resultado: el sistema de permisos del entorno de Claude Code lo rechazó con el motivo «Create Public Surface». No se envió nada.
- Además, desde este entorno no se puede abrir `*.github.io` (el proxy de red lo rechaza), así que tampoco se podría verificar la URL publicada sin habilitar ese host.
- Qué hace falta: que el usuario autorice explícitamente esa acción (regla de permiso para el envío a `gh-pages`), o que active GitHub Pages él mismo: repositorio → Settings → Pages → «Deploy from a branch» → rama `ccr-c47ef91f-l1boq4`, carpeta `/ (root)`, y abrir `https://leonardo2004zx-oss.github.io/ORBIS-X-LAB/DUAL_PROJECTOR_LAB/`.

## 0b. Botones de carga en el celular: causa más probable
En Android, cuando una página se abre **dentro de otra app** (el visor de Claude, de una red social, etc.) se usa un *WebView*. En un WebView, `<input type="file">` solo abre la galería si la app anfitriona implementa `onShowFileChooser`; si no, el toque no hace nada y la página no recibe ningún error. Eso coincide con lo informado: el 3D y la rotación funcionan, pero los botones no.
Mitigación en v4: (1) si el navegador se identifica como WebView (`; wv)` en el agente de usuario, o apps conocidas) aparece un aviso para abrir el enlace en Chrome con botón «Copiar enlace»; (2) si al tocar el botón la página no pierde el foco ni se oculta en 1,5 s, aparece un aviso específico de celular. En Chrome de Android real se espera que funcione, pero **no se probó en un teléfono físico**.

## 1. Los botones «Cargar video local» y «Cargar imagen» no abren el selector (ABIERTO en el entorno del usuario)

**Síntoma (informado por el usuario):** al pulsar los botones no aparece el selector de archivos. La sala 3D y la rotación funcionan.
El usuario abre la app desde el enlace de claude.ai (`https://claude.ai/artifact/GiqKcVsBmUsEG7sc6aYj76`).

**Mensajes de consola:** en las pruebas no aparece ningún error de JavaScript. No hay acceso a la consola del navegador del usuario.

**Historial**
| Versión | Cómo abría el selector | Resultado en nuestras pruebas | Resultado del usuario |
|---|---|---|---|
| v1 (7550ffe) | `<input type=file hidden>` + `input.click()` desde el botón | se abre | no se abre |
| v2 (87bed08) | `<label for=…>` nativo, input fuera de pantalla | se abre | no se abre |
| v3 (7248143) | el `<input type=file>` real, transparente, cubre todo el botón (clic directo) + aviso si se bloquea + arrastrar + pegar | se abre | **pendiente de confirmar** |

**Comprobado:** las tres versiones abren el selector en Chromium visible (Xvfb) con `file://`, con `http://localhost` y dentro de un
`<iframe sandbox="allow-scripts">`. El archivo exacto publicado en claude.ai (versión 3, descargado de nuevo) pasa las 11 pruebas de carga.

**Causa más probable:** el visor donde se abre la página (la vista de claude.ai o la app de Claude) no permite que el marco de la página abra
el diálogo de archivos del sistema operativo. No es algo que el código de la página pueda controlar ni verificar desde nuestro entorno.

**Mitigación en v3:** si al pulsar el botón la ventana no pierde el foco en 1,5 s (no se abrió ningún diálogo), aparece el aviso
`#pickBlocked` con tres alternativas: arrastrar el archivo sobre la vista, pegarlo con Ctrl+V, o abrir la versión local (`INICIAR.bat`).
La línea `#fileStatus` debajo de los botones muestra en qué paso quedó la carga.

**Cómo confirmarlo:** abrir `DUAL_PROJECTOR_LAB/index.html` (o `DUAL_PROJECTOR_LAB_un_archivo.html`) con doble clic en Chrome o Edge, fuera de la app de Claude,
y pulsar los botones. Si ahí funciona y en el visor no, la causa es el visor.

**Limitación del detector:** se basa en el evento `blur` de la ventana. Si un navegador abriera el diálogo sin quitar el foco, el aviso
podría aparecer aunque el selector sí se haya abierto (es solo informativo; desaparece al elegir un archivo).

## 2. Error 404 en la consola por el ícono de la pestaña (CORREGIDO en v3)
`Failed to load resource: the server responded with a status of 404 (File not found)` al abrir por `http://localhost`: el navegador pedía `/favicon.ico`.
Corrección: ícono SVG incrustado como `data:` en `index.html`.

## 3. Video «sin cambios de píxeles» en una prueba (FALSO POSITIVO de la prueba, corregido)
La primera versión de `tests/carga_archivos.js` medía solo 4 puntos de la pantalla, que caían sobre zonas estáticas del video de prueba.
Ahora mide 300 puntos: entre 28 y 33 cambian de imagen mientras el tiempo del video avanza. No era un error de la aplicación.

## 4. Advertencias conocidas (no son errores)
- La `Promise` de `video.play()` puede rechazarse si el navegador exige un gesto del usuario; el video queda listo y se muestra «pulsá ▶ Reproducir».
- MP4 (H.264): el Chromium de pruebas no trae ese códec, por eso las pruebas usan WebM. Chrome y Edge en Windows sí lo reproducen.
