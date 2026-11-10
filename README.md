# Orbis Historias

Crea **historias verticales (9:16) a partir de GIFs animados**, al estilo de las "stories" de redes sociales.

- Arrastra o elige varios GIFs: cada GIF **con movimiento** se convierte en una diapositiva. Los GIFs estáticos (1 solo fotograma) se descartan automáticamente.
- La duración de cada diapositiva se calcula leyendo los retardos del GIF, para que se reproduzcan ciclos completos (editable de 1 a 15 s).
- Añade texto con animación (aparecer, subir, rebote, máquina de escribir, flotar), posición, color, tamaño y fondo.
- Reordena o elimina diapositivas.
- **Ver historia**: visor a pantalla completa con barras de progreso. Toca a la derecha/izquierda para avanzar/retroceder, mantén pulsado (o barra espaciadora) para pausar, `Esc` para salir.
- **Exportar vídeo**: graba la historia completa en WebM 540×960 (con los textos animados) para compartirla.
- El proyecto se guarda automáticamente en el navegador (IndexedDB).

## Uso

Es una app estática, sin dependencias. Sírvela con cualquier servidor local:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

Pulsa **Cargar demo** para ver la historia de ejemplo «El viaje de Orbis».

## GIFs de demostración

Los GIFs de `demo/` se generan con Pillow:

```bash
python3 scripts/make_demo_gifs.py
```

## Estructura

| Archivo | Función |
| --- | --- |
| `index.html`, `css/styles.css` | Interfaz (editor y visor) |
| `js/app.js` | Lógica del editor, visor y persistencia |
| `js/gif.js` | Lee fotogramas y duración del GIF (detecta movimiento) |
| `js/caption.js` | Animaciones de texto compartidas |
| `js/export.js` | Exportación a vídeo con `MediaRecorder` |
| `js/store.js` | Guardado en IndexedDB |

## Akari Game Show

Juego de preguntas en `akari/index.html`, con Akari, una presentadora anime que habla, cambia de expresión y reacciona a tus respuestas. Es un único archivo sin dependencias.

- 43 preguntas en 6 categorías (cultura general, anime, videojuegos, terror, lógica y tramposas) y tres niveles de dificultad. Cada partida tiene 15 preguntas, 3 vidas, 20 segundos por pregunta, rachas que multiplican los puntos y un comodín 50:50.
- Se puede responder con botones, con el teclado (`1`–`4` o `A`–`D`, `Enter` para seguir) o con el micrófono (si el navegador lo permite).
- Akari habla con la voz en español del dispositivo (`speechSynthesis`). Si el dispositivo no tiene voz, no tiene voces en español o la voz no arranca, el juego cambia solo a una **voz integrada** (`akari/mespeak-es.js`: meSpeak/eSpeak con voz en español, licencia GNU GPL v3) que suena por WebAudio. En el menú se puede elegir *Auto*, *Del celular* o *Integrada*, y probar la voz.
- `python3 scripts/build_akari_artifact.py salida.html` genera una versión de un solo archivo con la voz integrada adentro.
- Récord, historial y partida en curso se guardan en el navegador (`localStorage`).

```bash
python3 -m http.server 8000
# abre http://localhost:8000/akari/
```
