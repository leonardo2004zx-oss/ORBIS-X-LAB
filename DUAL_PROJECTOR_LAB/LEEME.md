# DUAL PROJECTOR LAB — Simulador de cine gigante

Laboratorio virtual para experimentar con **dos proyectores unidos por Edge Blending**.
Funciona en el navegador (Chrome o Edge en Windows), **sin internet y sin instalar nada**.

## Cómo abrirlo en Windows

1. Copiá la carpeta `DUAL_PROJECTOR_LAB` completa a tu PC (por ejemplo a `C:\DUAL_PROJECTOR_LAB`).
2. Hacé **doble clic en `INICIAR.bat`** o directamente en **`index.html`**.
   - Enlace local, si la copiaste ahí: `file:///C:/DUAL_PROJECTOR_LAB/index.html`
3. Si se ve negro: en Chrome/Edge → Configuración → Sistema → activá “Usar aceleración por hardware”.

> Opcional (si tenés Python): `python -m http.server 8000` dentro de la carpeta y abrí `http://localhost:8000`.

## Qué podés hacer

| Zona | Para qué sirve |
|---|---|
| **Modo A / B / C** | A: sin calibración (unión visible) · B: calibración manual · C: fusión optimizada |
| **Contenido** | Panoramas (atardecer, ciudad), patrones (cuadrícula, barras, gris 50 %, blanco, negro), **video local** o imagen propia |
| **Pantalla** | 100″ a 300″ (16:9), relación de proyección *supuesta* y editable |
| **Fusión** | Superposición, intensidad del blending, gamma de compensación, forma de la curva, nivel de negro, bordes |
| **Proyector A / B** | Encendido, posición X/Y, distancia, zoom, rotación, trapecio, brillo y color RGB |
| **Vistas** | 3D frontal, 3D técnica (haces de luz), desde el sillón, y **2D de calibración** (la más liviana) |
| **Calidad** | Baja / Media / Alta. En PCs con 2 núcleos o 4 GB arranca sola en **Baja** |

Controles 3D: arrastrar = girar · rueda = acercar · clic derecho = desplazar · W A S D / Q E = caminar
(después de hacer clic en la vista). **No se bloquea el puntero.** Doble clic en un control = valor inicial.

## Qué es exacto y qué es aproximado

- **Exacto:** medidas de las pantallas 16:9 (por ejemplo 150″ = 332 × 187 cm), tamaño de la imagen combinada,
  superposición en px y cm, distancia necesaria *para la relación de proyección que elijas*.
- **Supuesto (no verificado):** relación de proyección 1,4:1 (genérica, **no es dato del Gadnic C45N**),
  1920×1080 por proyector, lente centrada, gamma 2,2.
- **Aproximación visual:** brillo, color, nivel de negro, haces de luz, sala, sillón y persona.

Es un laboratorio virtual: **no garantiza** que dos proyectores físicos se puedan fusionar perfectamente,
ni que funcione directamente con la salida HDMI de una PS4 (eso requiere hardware o software de blending aparte).

## Archivos

```
index.html        la aplicación
INICIAR.bat       acceso directo para Windows
css/styles.css    estilos
js/content.js     panoramas y patrones (dibujados por código, sin imágenes externas)
js/app.js         simulador (Three.js r147 + shader de fusión compartido por 2D y 3D)
vendor/           Three.js r147 y OrbitControls (licencia MIT), incluidos para funcionar sin internet
tests/verify.js   pruebas automáticas (opcional: Node.js + Playwright)
tests/video_prueba.webm  video de prueba para la carga de video local
```
