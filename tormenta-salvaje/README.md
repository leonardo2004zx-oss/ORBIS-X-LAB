# Tormenta Salvaje

Videojuego 3D de terror psicológico y supervivencia para el navegador (Android y PC).
*Hay algo entre los árboles.*

Proyecto independiente: no depende de otras carpetas del repositorio.

## Estado: versión 3 (bosque + camping explorable)
- Bosque procedural de 440 × 440 m: coníferas altas, árboles de hoja ancha, abedules y troncos secos
  (troncos con raíces, ramas y follaje en tarjetas; no conos), helechos, pasto, arbustos, rocas, troncos caídos y ramas.
- Sendero embarrado y brillante con hojas mojadas; charcos que siguen el terreno con ondas de gotas en tiempo real.
- Lluvia en GPU (hasta 13 000 gotas) inclinada por el viento, con salpicaduras; se ilumina dentro del haz de la linterna.
- Relámpagos con varios destellos por descarga, rayo visible e iluminación de todo el bosque; niebla y bancos de niebla rasante.
- Linterna con sombras (calidad media/alta), haz volumétrico y mano con guante; batería.
- Audio procedural: lluvia sobre hojas, barro y charcos (miles de gotas sintetizadas), lluvia general, viento con ráfagas
  y silbidos, crujidos de árboles posicionales (HRTF), truenos cercanos y lejanos con retardo por distancia,
  pasos según superficie (barro, charco, hojas), ramas que se quiebran, ropa mojada y respiración según el esfuerzo.
- Primera persona, caminar/correr con resistencia, colisiones con troncos y rocas, brújula, objetivo, cartel interactivo.
- Controles: joystick virtual + deslizar para mirar + botones (Android); WASD, ratón, Shift, E, F, Esc (PC).
- Cielo con luna (mares, halo y bordes plateados en las nubes) y estrellas que titilan, visibles en los claros
  que se abren cuando la tormenta afloja; la luna ilumina el bosque según qué tan despejado esté.
- Fauna: ciervo que se congela en el haz (ojos que reflejan la linterna), resopla y huye; búhos posados que giran la
  cabeza, ululan y se espantan; murciélagos en los respiros; polillas alrededor de la linterna; sapos que croan y
  saltan al charco; ojos en la oscuridad que desaparecen al iluminarlos; aullidos lejanos.
- Detalles: hojas arrastradas por las ráfagas, hongos bioluminiscentes al pie de los árboles y telarañas con gotas.
- Mapa del parque en papel (tecla M, Tab o botón Mapa): relieve, curvas de nivel, cada árbol, sendero, charcos,
  lugares conocidos, tu posición y dirección, y tu recorrido a lápiz (se guarda). Zoom con + / − o la rueda.
  Minimapa circular que gira con la mirada (se puede ocultar en Configuración).
- Portada animada, Nueva partida / Continuar / Configuración / Créditos; calidad Baja/Media/Alta, volúmenes,
  sensibilidad, FPS; resolución dinámica; guardado local automático.

### Versión 3: camping, objetos y pistas
- Camping Los Alerces al final del sendero, en un claro: arco de entrada, carpa roja familiar que se puede recorrer
  (farol encendido, la lona brilla desde adentro, el jugador se agacha), carpa naranja cerrada, carpa derrumbada,
  pabellón techado con mesas y farol colgante, dos fogatas apagadas, auto abandonado hundido en el barro,
  cabaña del guardaparques con puerta articulada, reposeras volcadas, charcos.
- Refugio de troncos a mitad del sendero.
- Pistas: diario en la carpa, libro de registro en el pabellón y llave en la guantera del auto (3/3).
  Lector de notas y lista de notas en la pausa. Pilas que recargan la linterna (la batería ahora se agota).
- Objetivos encadenados: llegar al camping → revisar → conseguir la llave → abrir la cabaña → refugiarse.
- Refugios: dentro la lluvia deja de caer, el exterior se amortigua y suena la superficie
  (lona de la carpa, madera del techo, chapa del auto); se recupera el aliento y se guarda la partida.
- Los lugares nuevos se anotan solos en el mapa.

### Optimización para celulares
- Piezas fijas del camping fusionadas por material y todos los charcos en una sola malla:
  de ~540 a ~180 dibujos por cuadro en calidad Media.
- Luna y relámpagos comparten una sola luz; los faroles del camping solo se calculan cerca: 3 luces por píxel en el bosque.
- Sin sombras de linterna en Media (solo en Alta), haz volumétrico con menos capas, menos niebla superpuesta,
  rocas más livianas, distancias de árboles ajustadas por calidad.
- Tope de 60 FPS (en pantallas de 120 Hz no se dibuja el doble), resolución dinámica que apunta a ~50 FPS,
  shaders compilados durante la carga (sin tirones al llegar al camping o al ver un animal),
  minimapa y audio actualizados con menos frecuencia.

## Próximas versiones
4. Eventos de terror psicológico, sonido posicional y final jugable.
5. Optimización, pulido cinematográfico y corrección de errores.

## Probar en local
`python3 -m http.server` dentro de esta carpeta y abrir `index.html`.

| Archivo | Función |
| --- | --- |
| `js/util.js` | Ruido, texturas pintadas en canvas, geometría de troncos y follaje |
| `js/world.js` | Terreno, sendero, charcos, árboles con LOD, sotobosque, cielo |
| `js/weather.js` | Lluvia, salpicaduras, relámpagos, director de la tormenta |
| `js/audio.js` | Motor de audio procedural |
| `js/player.js` | Controles, movimiento, linterna |
| `js/map.js` | Mapa del parque y minimapa |
| `js/fauna.js` | Animales y detalles del ambiente |
| `js/camp.js` | Camping, refugios, objetos y pistas |
| `js/main.js` | Menús, configuración, guardado, bucle |
