# Pyro Sky Simulator

Simulador audiovisual de fuegos artificiales en 3D para el navegador (pensado para celulares Android modernos).
Proyecto independiente: no depende de ninguna otra parte del repositorio.

## Cómo jugar
1. Tocá **ACTIVAR AUDIO** (los navegadores exigen un toque para habilitar el sonido).
2. Elegí un cohete en la consola inferior y tocá **LANZAR**. Podés lanzar varios seguidos o usar **×5 RÁFAGA**.
3. Arriba: **Cámara** (Público, Orilla, Lateral, Aérea, Seguir cohete), **Lenta** (×0,25, también baja el tono del audio),
   **Show** (armá tu secuencia, se guarda en el navegador), **Gran final** automático y **Sonido** (volumen, eco, retardo real del sonido, calidad).
4. Arrastrá el cielo para girar la cámara; pellizcá o usá los botones ± para acercar.

## Catálogo
| Cohete | Imagen | Sonido característico |
| --- | --- | --- |
| Peonía Carmesí | Esfera roja→naranja con corazón dorado | Siseo de ascenso, estampido seco |
| Sauce Dorado | Hilos dorados que caen lentos | Cola chispeante, golpe sordo, lluvia de purpurina larga |
| Halo Silbador | Dos anillos cruzados cian y violeta | Silbido que trepa de ~950 a ~3300 Hz, chasquido agudo con eco |
| Crisantemo Crepitante | Pétalos lima que revientan en "huevos de dragón" | Siseo agudo, ráfaga de crujidos sincronizada |
| Palmera Titán | Nueve hojas de cometa gruesas | Rugido grave, trueno con retumbo de 5 s |
| Saturno Estrobo | Planeta magenta + anillo turquesa + estrobos | Zumbido eléctrico, tic-tic estroboscópico |
| Espiral Fénix | Sube en sacacorchos y abre una galaxia espiral | Torbellino sincronizado con el giro, que pasa de un oído al otro |
| Medusa Eléctrica | Campana azul con tentáculos violeta que caen | Láser FM al subir, arcos eléctricos tras el estallido |
| Triple Salto | Tres estallidos encadenados, cada uno más alto y grande | Pa · pa · ¡BUM!, cada golpe más grave |
| Pirograma Musical | Corazón, estrella o sonrisa que mira a la cámara | Sube tocando una escala y suena un acorde de campanas |
| Enjambre Zumbador | Chispas que vuelan erráticas como abejas | Coro de zumbidos que se mueven por el estéreo |
| Agujero Negro | Nube que implosiona y estalla en una onda | Theremin, crescendo al revés e implosión muy grave |
| Cruz de Diamantes | Estrellas doradas que se parten en 4 cometas plateados | Silbido descendente y tableteo de crujidos |

## Audio
Todo el sonido se sintetiza con la Web Audio API (no hay muestras externas, así que no hay licencias de terceros).
Cada cohete recorre seis etapas: mecha → despegue → ascenso (voz continua que sigue al cohete cuadro a cuadro) →
estallido en capas (crack saturado, cuerpo filtrado, golpe sub-grave, retumbo) → chisporroteo/purpurina/estrobo →
reverb de valle por convolución y ecos de las colinas. La distancia a la cámara controla volumen, filtro de aire,
paneo estéreo, proporción de reverb y (opcional) el retardo por velocidad del sonido. Cada estallido varía ±12 % en tono.

## Estructura
| Archivo | Función |
| --- | --- |
| `index.html` | Interfaz y estilos |
| `js/audio.js` | Motor de audio |
| `js/fx.js` | Partículas, estelas y humo |
| `js/world.js` | Cielo, terreno, lago, luces y cámara |
| `js/rockets.js` | Catálogo de cohetes y vuelo |
| `js/main.js` | Bucle, controles, show y gran final |
| `vendor/three.min.js` | Three.js r149 (licencia MIT, ver `vendor/THREE-LICENSE.txt`) |

Para probar en local: `python3 -m http.server` dentro de `pyro-sky/` y abrir `index.html`.
