# CAMBIOS — v7 (nuevo: DUAL PROJECTOR PLAYER)

- Nueva carpeta `DUAL_PROJECTOR_PLAYER/`: reproductor real de doble salida. **El simulador v6 (`DUAL_PROJECTOR_LAB/`) no se modificó.**
- Abre video local, divide cada fotograma en A y B y los muestra en dos ventanas independientes (`about:blank`, mismo origen, funciona sin servidor).
- Un único decodificador: A y B se dibujan desde la misma instantánea del fotograma (`VideoFrame`), en la misma tarea.
- Solapamiento 0–100 % (Panorámica / Híbrida / Superpuesta), edge blending con gamma, proporción Encajar / Llenar / Estirar, alineación fina por salida (±2 px), brillo por salida y cuadrícula de calibración.
- Reproducción, pausa, búsqueda, sonido y repetición. En cada ventana: pantalla completa con ⛶, doble clic o F, y pausa con Espacio.
- Detección de pantallas con la Window Management API de Chrome/Edge (opcional).
- Rendimiento: dibuja solo con fotograma nuevo (`requestVideoFrameCallback`), lienzo a 1 píxel por píxel de pantalla y vistas previas a 4 por segundo con las ventanas abiertas.
- Lanzador `INICIAR_REPRODUCTOR.bat` (Edge/Chrome en modo aplicación).
- Diseño de la entrada por capturadora HDMI para la PS4 (`docs/ARQUITECTURA_PS4.md`), sin implementar.

## Problemas encontrados y corregidos durante las pruebas
1. **«Abrir A y B» abría solo A** con el bloqueador de ventanas activo (una ventana por clic). Ahora abre A y, en el clic siguiente, B, con un aviso en el botón.
2. **A y B podían quedar a 1–2 fotogramas** con la PC cargada: cada ventana dibujaba en su propio momento y el video podía avanzar entre una y otra. Ahora se toma una sola instantánea del fotograma y se dibujan ambas en la misma tarea.
3. **Dibujos de más**: redibujaba 60 veces/s con un video de 30 fps. Ahora dibuja solo cuando hay un fotograma nuevo (CPU de 61 % a ≈ 50 % de un núcleo).
4. **Las vistas previas duplicaban el trabajo**: ahora se actualizan 4 veces por segundo mientras las ventanas están abiertas.
5. **Posición inicial de las ventanas ignorada** en algunos sistemas: se refuerza con `resizeTo` y después `moveTo`.
6. Mensaje claro cuando un visor web no permite abrir ventanas.
