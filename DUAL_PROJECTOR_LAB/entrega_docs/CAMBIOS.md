# CAMBIOS — DUAL PROJECTOR LAB

Rama: `ccr-c47ef91f-l1boq4` · PR #2 en `leonardo2004zx-oss/ORBIS-X-LAB`

## v3 — 7248143 (versión actual)
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
