# Destruction Lab 3D

Ciudad 3D destructible con física en el navegador (Three.js r160 + Rapier 0.12, cargados desde jsDelivr).

## Ciudad
Unas 1200 piezas físicas en calidad media (unas 700 en baja): torres de hormigón, rascacielos de vidrio que se angostan arriba, edificios de ladrillo, edificios escalonados y en L, con equipos de aire, tanques de agua y antenas en los techos. Avenidas, calles transversales, un río con un **puente destructible** (tablero apoyado en pilares), tráfico que circula (autos, taxis, furgonetas, colectivos y camiones), autos estacionados, farolas, árboles y parques. Todo es un cuerpo rígido real que se puede romper, empujar o arrastrar.

## Desastres (todos se pueden combinar)
- **Meteorito**: estela de fuego y humo, impacto con destello, bola de fuego, onda expansiva, cráter con roca fundida y eyecciones incandescentes. Modo **Lluvia** con cantidad configurable.
- **Explosión**: potencia 1–10; desde 8 se forma un hongo de humo.
- **Tornado**: fuerza y duración; con fuerza 8–10 es un tornado gigante que levanta autos y escombros. Se guía tocando el suelo.
- **Terremoto**: el suelo es un cuerpo cinemático que se mueve de verdad. Se toca para elegir el epicentro; desde intensidad 5 se abren grietas y desde 8 hay sacudidas verticales. Tiene duración.
- **Tsunami**: entra por el borde más cercano al punto tocado, empuja y hace flotar objetos y después se retira.
- **Tormenta eléctrica**: lluvia, rayos que buscan lo más alto, truenos e incendios.
- **Volcán**: el cono emerge empujando lo que hay encima, después hace erupción con columna de cenizas, fuente de lava, bombas de lava físicas que explotan al caer y una colada que incendia y derrite lo que toca.
- **Agujero negro**: atrae y hace girar todo lo cercano, arranca piezas de los edificios, se traga lo que cruza el horizonte y al final colapsa con una onda expansiva.

Las físicas son aproximaciones simplificadas pensadas para verse bien y correr en un celular, no simulaciones exactas.

## Cine
Sacudida de cámara según la distancia, iluminación dinámica (destellos, luz de lava, relámpagos), sonido sintetizado (impactos, derrumbes, viento, agua, truenos, lava), **cámara lenta** (botón de reloj de arena o tecla L) y **ciclo de día y noche** (botón de sol/luna o Ajustes), con ventanas y farolas encendidas de noche.

## Gráficos: antes / después
El botón **Gráficos** (arriba, o tecla G) alterna sobre la misma escena entre el aspecto clásico y el mejorado:
- Fachadas PBR generadas por código: hormigón, vidrio, ladrillo, metal y piedra, con relieve, rugosidad, partes metálicas, vidrio que refleja el cielo (mapa de entorno), variación por bloque (tono del vidrio, cortinas, luces encendidas de noche) y oscurecimiento en la base de los edificios.
- Bloom y corrección de color (posprocesado); niebla exponencial; silueta de ciudad y colinas en el horizonte.
- Bola de fuego animada con ruido 3D, humo texturizado con sombreado, chispas, onda expansiva con borde visible, luz temporal que ilumina los edificios cercanos.
- Fragmentos de tamaños irregulares; polvo al impactar; los escombros asentados quedan como restos persistentes.
- Veredas con cordón, sendas peatonales, asfalto y baldosas con relieve, charcos de luz bajo las farolas de noche, lava con brillo.

Son aproximaciones visuales en WebGL: no hay humo volumétrico real, reflejos de otros edificios, iluminación global ni destrucción por vóxeles.

## Ciudad viva (primera entrega)
- **Peatones** (60 / 130 / 220 según la calidad): una sola malla por instancias; piernas y brazos se animan en el shader. Ropa, piel, tamaño y velocidad varían. Caminan por una red de veredas (no atraviesan edificios), cruzan por las sendas peatonales cuando el semáforo se lo permite y pasan por los parques.
- **Tránsito**: semáforos en las intersecciones de la avenida, distancia con el auto de adelante, frenado y arranque suaves.
- **Reacciones**: cada desastre registra una amenaza con radio propio. Las personas cercanas la notan primero (con demora según la distancia), miran, corren alejándose por las veredas y buscan los parques (zonas seguras). Las lejanas siguen con su rutina. Quien está en el centro de un impacto cae y se levanta corriendo (sin violencia gráfica). Los autos frenan si el peligro está adelante y aceleran si quedó atrás. Sirenas y vehículos de emergencia con balizas.
- **Meteorito completo**: marca de advertencia en el suelo durante la caída, estela, destello, onda expansiva, polvo, cráter, fachadas cercanas con vidrios rotos y hollín, humo, huida de la gente, sirena y llegada de emergencias.
- **Evacuación**: botón Evacuar en el panel; todos van a los parques.
- **Panel plegable** y protección contra toques accidentales al mover la cámara.

## Titanes (criaturas originales)
- **Basalto**: gólem de roca volcánica con grietas de magma y cristales en la espalda. Surge del suelo, pisotea, golpea, arranca rocas y las lanza (proyectiles físicos).
- **Vex**: alienígena insectoide de cuatro patas con espinas bioluminiscentes y cola con aguijón. Cae del cielo, azota con la cola y dispara un rayo de plasma que corta edificios.
- Modos: **Combate** (pelean entre sí, con barras de vida, retroceso al recibir golpes y derrota sin violencia gráfica: Basalto se desmorona en rocas y Vex es abducido en un destello) o **Solo Basalto / Solo Vex** arrasando la ciudad. Furia y duración ajustables; botón Retirar.
- Interactúan de verdad con la física: cuerpos cinemáticos que empujan y rompen edificios, pisadas que fragmentan lo que está debajo. La gente huye, suenan sirenas y llegan emergencias.

## Rendimiento
Calidad baja/media/alta, límites de escombros y de partículas, resolución dinámica y piezas que se duermen solas cuando quedan quietas.

## Código
`src/` tiene el código por secciones; `python3 build.py` las une en `index.html` (la página publicada). Para probar localmente: `python3 -m http.server` en la raíz y abrir `/destruction-lab/`.
