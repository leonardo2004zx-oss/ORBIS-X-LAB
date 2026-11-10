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

## Rendimiento
Calidad baja/media/alta, límites de escombros y de partículas, resolución dinámica y piezas que se duermen solas cuando quedan quietas.

## Código
`src/` tiene el código por secciones; `python3 build.py` las une en `index.html` (la página publicada). Para probar localmente: `python3 -m http.server` en la raíz y abrir `/destruction-lab/`.
