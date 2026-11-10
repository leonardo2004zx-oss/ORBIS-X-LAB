# Destruction Lab 3D

Ciudad 3D destructible con física real en el navegador (Three.js r160 + Rapier 0.12, cargados desde jsDelivr).

- **Meteorito**: tocá un punto; el impacto fragmenta las piezas cercanas, empuja todo en el radio, deja cráter y la roca queda como cuerpo físico.
- **Explosión**: potencia 1–10 (radio y fuerza).
- **Terremoto**: el suelo es un cuerpo cinemático que se mueve de verdad; intensidad 1–10. Desde ~5 aparece fatiga estructural (se rompen piezas de los pisos bajos primero).
- **Construir**: tocá el suelo para levantar un edificio de 2–14 pisos.
- **Reiniciar**: recrea el mundo físico sin recargar la página.
- **Ajustes**: calidad (baja/media/alta), límite de escombros y de partículas, sombras, sonido.

Los edificios están hechos de bloques físicos independientes (InstancedMesh, una llamada de dibujo). Al romperse, un bloque se divide en 4–8 escombros físicos; cuando se supera el límite, los más viejos desaparecen.

Controles: arrastrar = girar · pellizcar/rueda = zoom · dos dedos/clic derecho = desplazar · tocar = usar la herramienta. Teclado: 1–5 herramientas, R reinicia.

Uso local: `python3 -m http.server` en la raíz y abrir `/destruction-lab/`.
