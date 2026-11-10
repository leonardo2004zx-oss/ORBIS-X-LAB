# Arquitectura futura: PS4 → capturadora HDMI → dos proyectores

> **Estado: solo diseño. No está implementado ni probado.** No tenemos la capturadora ni dos proyectores para probarlo.
> Nada de esto garantiza que funcione con un modelo concreto de capturadora o de proyector.

## Idea
El reproductor v7 ya separa **la fuente** (un único `<video>`) de **las salidas** (ventanas A y B que dibujan su parte).
Para la PS4 solo cambia la fuente: en lugar de un archivo, la imagen llega de una capturadora HDMI.

```
 PS4 ──HDMI──► Capturadora HDMI→USB (UVC) ──USB──► PC con Windows
                                                     │
                                  navegador (Edge/Chrome) o programa nativo
                                                     │  getUserMedia() → MediaStream → <video>  (un solo decodificador)
                                     ┌───────────────┴───────────────┐
                               Ventana A (parte izquierda)   Ventana B (parte derecha)
                               + edge blending               + edge blending
                                     │                               │
                            salida de video 1 ──► Proyector A   salida de video 2 ──► Proyector B
```

## Piezas
| Pieza | Opción gratuita / abierta | Notas |
|---|---|---|
| Captura | Capturadora **UVC** (aparece como una cámara web; Windows no necesita driver) | Las más baratas (chip MS2109 y similares) suelen entregar 1080p a 30 fps comprimido en MJPEG. Hay que verificar el modelo concreto. |
| Entrada al programa | `navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080, frameRate: 60 } })` | El mismo `<video>` que hoy usa archivos recibiría el `MediaStream`. Es un cambio chico en `player.js` (una fuente nueva). |
| Reparto A/B y blending | El núcleo actual (`js/core.js`) | No hay que cambiarlo. |
| Dos salidas | Dos ventanas en pantalla completa, cada una en un monitor/proyector | La PC necesita **dos salidas de video** (por ejemplo, HDMI + VGA, o una placa con dos salidas). Muchas notebooks solo tienen una salida externa. |
| Alternativa sin programar | **OBS Studio** (gratuito y abierto): «Proyector a pantalla completa» por escena + filtros de recorte y máscara de imagen para el blending | Sirve para comparar resultados y latencia. |

## HDCP
La PS4 cifra su salida HDMI con HDCP; la mayoría de las capturadoras no reciben señal con HDCP activo.
La consola tiene en su configuración la opción de **desactivar HDCP** (Ajustes → Sistema), que Sony ofrece para captura y transmisión.
Algunas aplicaciones de video de la consola pueden no funcionar con HDCP desactivado. No se debe intentar capturar contenido protegido.

## Latencia (estimación a medir, no medida)
| Etapa | Estimación |
|---|---|
| Capturadora (compresión MJPEG + USB) | 30–100 ms |
| Decodificación + navegador + composición | 17–50 ms |
| Proyector (procesamiento interno) | 16–60 ms |
| **Total** | **≈ 60–200 ms**: aceptable para películas; para juegos rápidos puede notarse |

Cómo medirla cuando haya hardware: un cronómetro en pantalla en la PS4 (o en la PC origen), y una foto con el celular que capture a la vez la TV original y la proyección.

## Plan por etapas (cuando haya hardware)
1. Probar la capturadora sola en la Cámara de Windows u OBS: resolución, fps y si recibe señal de la PS4 con HDCP desactivado.
2. Agregar la fuente «capturadora» al reproductor: `getUserMedia` + selector de dispositivo. Se puede probar antes con una cámara web común.
3. Medir la latencia y los fps con las dos salidas.
4. Probar con dos proyectores reales: alineación física, blending y uniformidad de brillo.

## Límites conocidos
- Una PC de bajos recursos puede no sostener 1080p60 de captura + dos salidas: primero hay que medir con 720p30.
- El audio de la PS4 llega por la capturadora (si la capturadora lo soporta) y se reproduce en la PC.
- No hay control de los proyectores (encendido, foco, keystone): se ajustan con sus propios menús.
