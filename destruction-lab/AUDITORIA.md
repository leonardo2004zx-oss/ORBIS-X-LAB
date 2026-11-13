# Auditoría técnica — Destruction Lab 3D

## Estado del motor
- **Render**: Three.js r160 (WebGL2) con renderizado *forward*, materiales PBR (`MeshStandardMaterial`), sombras PCF de una luz direccional, mapa de entorno PMREM generado del cielo, bloom + corrección de color (EffectComposer) y niebla exponencial.
- **Física**: Rapier 0.12 (WASM). Unas 1.200 piezas en calidad media; cada bloque de edificio es un cuerpo rígido.
- **Contenido**: no hay modelos de artista. Todo (edificios, autos, árboles, peatones, titanes) se construye en código con primitivas y texturas generadas en `<canvas>`. No hay esqueletos ni animaciones importadas: las animaciones son articulaciones movidas por código.
- **Entrega**: una sola página HTML (~330 KB) publicada como artifact de claude.ai; las librerías vienen de jsDelivr.

## Por qué el resultado se veía básico
1. **Geometría**: los titanes eran cajas, esferas y conos sin bisel, sin panelado ni piezas secundarias. A la escala de un gigante eso se lee como "figura geométrica".
2. **Materiales**: texturas pequeñas y genéricas, sin desgaste por pieza ni detalles de escala (remaches, juntas, calcomanías).
3. **Animación**: poses rígidas en el primer intento; luego resortes por articulación, pero con pocas articulaciones (sin dedos, pies que no se adaptan al suelo, sin pistones).
4. **Ciudad**: edificios formados por bloques físicos del mismo tamaño; la destrucción real exige esa granularidad y eso limita el detalle por bloque.

## Limitaciones reales
- **Modelos de calidad cinematográfica**: requieren trabajo de artista (horas/días por personaje) o modelos de terceros. Desde este entorno **solo hay salida de red a GitHub (archivos crudos) y npm**; Sketchfab, Poly Pizza, Kenney, Quaternius y Poly Haven están bloqueados. Los repositorios CC0 accesibles (KayKit, Quaternius, Vuena, Polygonal Mind) tienen modelos low-poly o estilo juguete: ninguno es un robot o kaiju realista.
- **Si conseguís un GLB con licencia válida** (por ejemplo CC0 o CC-BY de Sketchfab, verificando la licencia), se puede integrar: GLTFLoader con compresión Meshopt/Draco y texturas KTX2 se publican junto a la página.
- **WebGL en Android a 30 FPS**: el presupuesto es de aproximadamente 100–200 llamadas de dibujo, 300–600 mil triángulos y un solo pase de sombras. Humo volumétrico real (raymarching), reflejos en tiempo real de otros edificios, iluminación global y destrucción por vóxeles quedan fuera de ese presupuesto o requieren otra arquitectura (WebGPU, motor dedicado).
- **Medición**: el navegador de este servidor no tiene GPU (renderiza por software a ~10 FPS), así que **los FPS reales del teléfono solo se pueden medir en el teléfono**.

## Plan por etapas
1. **VEX** (robot) — esta entrega: modelo de superficies duras hecho en código, mucho más detallado: placas biseladas y cónicas, materiales PBR con panelado/remaches/arañazos/desgaste, pistones hidráulicos que se extienden con las articulaciones, cables, reactor, visor, manos con dedos, pies que se adaptan al suelo, pisadas con peso (cámara, sonido metálico, polvo).
2. **BASALTO** (kaiju orgánico): cuerpo continuo (no piezas sueltas), mandíbula, columna, cola, escamas por normal map, bioluminiscencia, respiración.
3. **Combate jugable**: controlar a VEX (joystick táctil + botones de golpe, agarre, especial), colisiones de golpes con daño visible en blindaje/criatura y destrucción según el punto de impacto.
4. **Ciudad y cámara**: más detalle de fachada sin perder destructibilidad, cámara en tercera persona baja.
