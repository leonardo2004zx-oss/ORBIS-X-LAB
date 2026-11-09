# INSTRUCCIONES — DUAL PROJECTOR LAB

## Abrir desde el celular (Android)
1. Abrir **https://claude.ai/artifact/GiqKcVsBmUsEG7sc6aYj76** en **Chrome** (no dentro de la app de Claude ni de otra app). Requiere haber iniciado sesión en claude.ai con la cuenta dueña, salvo que se comparta desde «Compartir».
2. Girar el teléfono (horizontal) o tocar ⛶. Un dedo gira, dos dedos acercan.
3. 🖼 Imagen / 🎬 Video abren la galería. ⚙ Ajustes despliega los controles de A, B y Edge Blending.
4. Si aparece el aviso «Estás dentro de un visor integrado…», usar «Copiar enlace» y pegarlo en Chrome.
5. Versión pública (GitHub Pages): pendiente de autorización; ver URL_PUBLICADA.md.

## Encuadrar, enfocar y alinear (v5)
1. Cargá una foto (🖼 Imagen).
2. **🔍 Encuadre**: − / + (zoom de la foto), ⌖ Centrar, ⤢ Ajustar; arrastrá con un dedo para mover la foto y pellizcá para ampliarla. ◌ Desenfocar / ◉ Enfocar simulan el anillo de foco de los proyectores; «Nitidez digital» es un procesado aparte.
3. **🎯 Calibrar**: elegí A o B, usá las flechas (o arrastrá sobre la vista) para moverlo, ⟲/⟳ para girarlo, ±tamaño, ◌/◉ foco. La cuadrícula muestra A en naranja y B en celeste: cuando coinciden se ven blancas. La barra indica «imagen doble: N mm».
4. ↯ Desalinear para practicar, ⌖ Autoalinear, ↺ Restablecer, 📌 Marcar «antes» y ⇄ Antes/Después para comparar.
5. En celular, «✓ Listo» vuelve a la barra general.

## Ejecutar (Windows, sin instalar nada)
1. Copiar la carpeta `CODIGO_FUENTE` (o `DUAL_PROJECTOR_LAB`) a la PC, por ejemplo `C:\DUAL_PROJECTOR_LAB`.
2. Doble clic en `INICIAR.bat`, o en `index.html`, o en `DUAL_PROJECTOR_LAB_un_archivo.html`.
   Enlace local equivalente: `file:///C:/DUAL_PROJECTOR_LAB/index.html`
3. Usar Chrome o Edge actualizados. Si se ve negro: Configuración → Sistema → «Usar aceleración por hardware».

## Ejecutar con servidor local (opcional)
Con Python instalado, dentro de la carpeta:
```
python -m http.server 8000
```
Abrir `http://localhost:8000`. Para verlo desde el celular en la misma red Wi-Fi:
```
python -m http.server 8000 --bind 0.0.0.0
```
y abrir `http://IP-DE-LA-PC:8000` (la IP se ve con `ipconfig`, «Dirección IPv4»). Puede que el Firewall de Windows pida permiso.

## Versión publicada
`https://claude.ai/artifact/GiqKcVsBmUsEG7sc6aYj76` — privada (solo la cuenta del dueño). Recargar con F5 para ver la última versión.

## Reproducir el problema de los botones de carga
1. Abrir el enlace de claude.ai → panel derecho → *Contenido* → «🎬 Cargar video local…».
2. Resultado informado por el usuario: no aparece el selector.
3. Comparar con la versión local: abrir `index.html` con doble clic en Chrome/Edge y pulsar el mismo botón.
4. Anotar el texto de la línea de estado debajo de los botones y si aparece el aviso amarillo «El visor … no dejó abrir el selector».

## Ejecutar las pruebas automáticas (opcional, para desarrollo)
Requiere Node.js 18+ y Playwright (`npm i playwright` y `npx playwright install chromium`).
```
node tests/verify.js                                   # 27 pruebas (abre index.html por file://)
node tests/verify.js http://localhost:8000/index.html  # las mismas por HTTP
node tests/carga_archivos.js file:///RUTA/index.html - tests/capturas file
node tests/movil.js http://localhost:8000/index.html tests/capturas   # 20 pruebas de celular (Pixel 7 emulado)
node tests/calibracion.js http://localhost:8000/index.html tests/capturas   # 21 pruebas de encuadre, enfoque y calibración
```
En Linux sin pantalla, anteponer `xvfb-run -a` a `carga_archivos.js` (usa navegador visible).
Las capturas quedan en `tests/capturas/`.
