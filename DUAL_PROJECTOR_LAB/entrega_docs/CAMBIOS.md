# CAMBIOS — DUAL PROJECTOR LAB

Rama: `ccr-c47ef91f-l1boq4` · PR #2 en `leonardo2004zx-oss/ORBIS-X-LAB`

## v6 — laboratorio de proyección dual híbrida (versión actual)
Sobre la v5, sin reconstruir la app.
- Nueva herramienta **💡 Dual** (barra de herramientas y barra táctil):
  - Tres disposiciones: **⧉ Superpuesta** (100 % compartido: mismo tamaño, doble luz), **▭▭ Panorámica** (15 %: 1,85× de ancho) e **◫ Híbrida** (50 %: 1,5× de ancho).
  - Solapamiento ajustable con − / + (0–100 %); el control del panel ahora llega a 100 %.
  - **🌡 Mapa de luz**: luminosidad simulada en falso color (campo blanco), con curvas de nivel cada 0,25× y leyenda (1× = un proyector).
  - **Perfil de brillo** a lo ancho (curva de A, de B y total) y lectura de uniformidad.
  - **⇄ Blending SÍ/NO**: demostración antes/después de la corrección de brillo en la zona compartida.
  - **▦ Cuadrícula** (prueba de calibración) y **📊 Comparar modos**: tres tarjetas dibujadas a escala, con persona de 1,75 m, tamaño, diagonal, superficie, brillo, luz aprovechada y separación de lentes. «Probar» aplica el modo.
- **Calculadora de pantalla dual** en el panel: distancia de tiro (A y B), relación de proyección, ancho y alto del gabinete. Calcula el tamaño de cada modo, avisa si los proyectores no entran lado a lado y separa lo calculado, lo simulado y lo que requiere medición física. Aclara que no controla proyectores físicos.
- Superpuesta: la rampa de blending se desactiva (las dos imágenes son iguales y la luz se suma). En 3D, si las lentes quedan más cerca que el ancho del gabinete, B se dibuja encima de A.
- Viñeteo opcional (caída de brillo hacia los bordes, aproximado).
- Nueva prueba `tests/dual.js` (16).

## v5 — encuadre, enfoque y calibración
Sin reconstruir la app: se agregó sobre la v4.
- **Barra de herramientas debajo de la vista** (ya no tapa la imagen): *👁 Ver*, *🔍 Encuadre*, *🎯 Calibrar*. La vista (`#viewport`) ocupa el espacio libre y las barras van abajo; en celular, al usar una herramienta se oculta la barra general y aparece «✓ Listo».
- **Encuadre del contenido** (no mueve los proyectores): zoom −/+, ⌖ Centrar, ⤢ Ajustar; arrastrar con un dedo mueve la foto y pellizcar la amplía. Shader: `srcAt()` aplica `uPhoto` (zoom, desplazamiento X/Y).
- **Enfoque óptico simulado** por proyector (`P.focus`, uniforme `uFocus`): disco de desenfoque de 17 muestras. Botones ◌ Desenfocar / ◉ Enfocar / Auto-enfocar (A y B) y ◌/◉ foco por proyector en Calibrar; slider «Enfoque óptico (anillo)» en el panel.
- **Nitidez digital** (`uSharp`, máscara de enfoque): procesado de la señal, separado del enfoque óptico.
- **Calibración**: cuadrícula en píxeles de cada proyector (A naranja, B celeste) y 5 puntos de referencia; donde A y B coinciden se ve blanco, si no aparece la **imagen doble**. Lectura en la barra: posición, rotación, tamaño, foco y «imagen doble: N mm» (error calculado en la pared).
- **Mover y alinear A o B por separado**: selector A/B, flechas (un toque = un paso; mantener = repetir), paso 5 cm / 1 cm / 2 mm, ⟲/⟳ (0,1°), ±tamaño (0,2 %), arrastre con un dedo y pellizco sobre la vista (2D o 3D).
- **↯ Desalinear** (para practicar), **⌖ Autoalinear**, **↺ Restablecer**, **📌 Marcar «antes»** y **⇄ Antes/Después** (cartel «ANTES» abajo de la vista).
- Modo A ahora incluye un desenfoque leve de B (foco 0,3), como un equipo sin ajustar.
- Error corregido durante las pruebas: tocar ⇄ por segunda vez volvía a abrir la comparación en lugar de volver a «después».
- Nuevas pruebas `tests/calibracion.js` (21) con fotos reales `tests/foto_real_cafe.jpg` y `tests/foto_real_cohete.jpg` (dominio público, de scikit-image) y `tests/barras_prueba.png`.

## v4 — ba93eb4: versión para celular
- Barra táctil inferior: modos A/B/C, 2D/3D, Técnica/Frontal, ⟲ Inicio, 🎬 Video, 🖼 Imagen, ⛶ pantalla completa, ⚙ Ajustes. Botones ≥ 44 px.
- Panel de ajustes como hoja lateral desplegable (se abre con ⚙, se cierra con ✕). Incluye calidad gráfica y «ajustar sola».
- Gestos: un dedo gira, dos dedos acercan/alejan y desplazan. En 2D el navegador conserva sus gestos (`touch-action` según la vista).
- Pantalla completa con intento de bloqueo en horizontal (`screen.orientation.lock`), con aviso si el visor no lo permite.
- Botón «⟲ Vista inicial» también en escritorio.
- Al girar el teléfono se re-encuadra la cámara; en vertical se abre el ángulo (72°) en vez de alejar la cámara. En vertical la barra se acomoda en dos filas.
- Calidad adaptable: si durante una interacción 25 cuadros tardan > 50 ms, baja un nivel (Alta→Media→Baja) y avisa.
- Carga de archivos: un mismo manejador para todos los `<input type=file data-kind>`; detector de bloqueo también por `visibilitychange` (Android); aviso de WebView; extensiones `.3gp`, `.heic`.
- Fotos grandes (ej. 24 MP) se reducen al tamaño máximo de textura (4096, o 2048 en calidad baja). Videos de más de 1080p (720p en baja) se dibujan en un lienzo reducido en vez de subir 4K a la GPU en cada cuadro.
- Mensajes de error claros: códec no compatible (HEVC/H.265), archivo dañado, HEIC no compatible, pantalla completa no permitida.
- Nueva prueba `tests/movil.js` (20 pruebas, Pixel 7 emulado con toques reales del protocolo de Chrome).
- `tests/verify.js`: los selectores de modo ahora apuntan a `#panel [data-mode]` (hay botones de modo duplicados en la barra táctil).

## v3 — 7248143
Respecto de v2. Solo se tocó la carga de archivos; el simulador 3D/2D no cambió.
- **Botones de carga:** el `<input type="file">` real ahora está *dentro* de cada botón, transparente y del mismo tamaño. El clic del usuario cae directamente sobre el input (sin `label` ni `.click()` por código).
- **Detector de bloqueo:** si el selector no se abre, aparece un aviso (`#pickBlocked`) con alternativas.
- **Pegar archivos:** nuevo manejador `paste` (Ctrl+V de un archivo copiado en el Explorador).
- **Entrada única** `handleFile()` para botón, arrastrar y pegar; reconoce el tipo por MIME o extensión.
- **Imagen:** se lee con `FileReader` como `data:` URL (antes `blob:`).
- **Video:** `blob:` URL con reintento automático por `data:` URL (hasta 120 MB) si el navegador da error.
- **Línea de estado** `#fileStatus`: «Abriendo el selector…», «Video recibido: … (MB)», «Reproduciendo …», errores.
- **Errores visibles:** `window.onerror` y `unhandledrejection` se muestran en pantalla.
- **Favicon** incrustado (eliminó el 404 de la consola).
- Nuevo `DUAL_PROJECTOR_LAB_un_archivo.html` (la app completa en un solo archivo).
- Nuevas pruebas `tests/carga_archivos.js` + `tests/imagen_prueba.png`.

## v2 — 87bed08
- Botones de carga convertidos en `<label for="fileVideo|fileImage">`; inputs ocultos fuera de pantalla en vez de `hidden`.
- Arrastrar y soltar sobre la vista.
- Elegir «Video local» en la lista sin video cargado muestra un aviso en lugar de abrir el selector por código.
- `tests/verify.js` hace clic real en los botones (27 pruebas).

## v1 — 7550ffe
Primera versión: simulador completo (sala 3D, vista 2D, modos A/B/C, patrones, video, tamaños 100–300″, cálculos, calidad, 26 pruebas).
