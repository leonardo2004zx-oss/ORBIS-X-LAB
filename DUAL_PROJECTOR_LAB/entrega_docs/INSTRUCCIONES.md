# INSTRUCCIONES — DUAL PROJECTOR LAB

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
```
En Linux sin pantalla, anteponer `xvfb-run -a` a `carga_archivos.js` (usa navegador visible).
Las capturas quedan en `tests/capturas/`.
