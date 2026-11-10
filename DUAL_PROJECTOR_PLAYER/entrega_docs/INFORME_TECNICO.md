# INFORME TÉCNICO — DUAL PROJECTOR PLAYER v7

## Decisión de arquitectura
| Opción | Por qué sí / no |
|---|---|
| **Navegador (Edge/Chrome) en modo aplicación** ✅ | Viene con Windows, es gratis, no instala nada y decodifica por hardware cuando hay GPU. Las ventanas por pantalla son nativas del sistema. |
| Electron | ~150 MB extra y más memoria: va en contra de las PCs de bajos recursos. |
| mpv / VLC con dos instancias | Dos decodificadores = hay que sincronizarlos; el blending es complejo. |
| OBS Studio | Válido sin programar (proyector por escena + recorte + máscara). Queda como alternativa en `docs/ARQUITECTURA_PS4.md`. |

## Flujo de un fotograma
```
<video> (un decodificador) ──► VideoFrame (instantánea, sin copia)
                                  ├─► drawOutput(A): recorte de su parte + blending + cuadrícula → canvas ventana A
                                  └─► drawOutput(B): ídem                                      → canvas ventana B
```
- El primer `requestAnimationFrame` de cualquiera de las dos ventanas dispara `drawAll()`, que dibuja las dos en la misma tarea.
- Solo se redibuja si cambia el fotograma (`requestVideoFrameCallback` → `presentedFrames`) o un ajuste (`S.ver`).

## Geometría (`js/core.js`)
- Lienzo virtual de ancho `(2 − o) · outW` y alto `outH`. A muestra `x ∈ [0, outW]` y B `x ∈ [(1 − o) · outW, (2 − o) · outW]`.
- Película: «Encajar» `s = min(V/mw, H/mh)` (proporción original, barras negras), «Llenar» `max(…)` (recorta), «Estirar» (deforma).
- Blending: en la zona compartida, degradado negro de 25 pasos con opacidad `1 − w^(1/γ)` (`w` = rampa lineal o suave). Con γ 2,2 la luz de A + B suma 1.
- En Superpuesta (o = 100 %) no hay rampa: las dos imágenes son iguales y la luz se suma.

## Medición de sincronía
- Video de prueba con el número de fotograma en dos códigos de barras de 12 bits.
- En la app (`?test=1`): cada ventana lee con `getImageData` el código que **ella pintó** y lo registra con la hora absoluta (`performance.timeOrigin + now`).
- Externa: `tools/medir_grabacion.py` decodifica los códigos dentro de cada ventana en la grabación de pantalla.

## Compatibilidad
- Edge / Chrome 94+ (`VideoFrame`, `requestVideoFrameCallback`). En navegadores sin `VideoFrame` se dibuja desde el `<video>`, con una pequeña posibilidad de 1 fotograma de diferencia.
- Window Management API (elegir pantalla): Chrome/Edge 100+, con permiso del usuario. Es opcional.
