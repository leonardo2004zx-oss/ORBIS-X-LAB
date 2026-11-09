# ERRORES — DUAL PROJECTOR LAB

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
