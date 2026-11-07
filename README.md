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
