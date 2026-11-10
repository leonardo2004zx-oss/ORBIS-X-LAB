# PRUEBAS — DUAL PROJECTOR LAB (v6, proyección dual híbrida)

Fecha: 2026-11-10 · Chromium 153 (Playwright). Celular: **Pixel 7 emulado** (Chrome Android, táctil).

## A. Pruebas AUTOMÁTICAS
Miden la imagen renderizada (`gl.readPixels`) y los valores calculados, no solo la existencia de los botones.

| Conjunto | Entorno | Resultado |
|---|---|---|
| `tests/dual.js` (modos, mapa de luz, blending, calculadora) | **archivo exacto publicado (v6)** | 16/16 pruebas pasaron. |
| `tests/dual.js` | servidor local | 16/16 pruebas pasaron. |
| `tests/calibracion.js` (foto real, enfoque, alineación táctil) | archivo publicado v6 | 21/21 pruebas pasaron. |
| `tests/calibracion.js` | servidor local | 21/21 pruebas pasaron. |
| `tests/movil.js` (video, modos A/B/C, gestos, galería) | archivo publicado v6 | 20/20 pruebas pasaron. |
| `tests/movil.js` | servidor local | 20/20 pruebas pasaron. |
| `tests/carga_archivos.js` (navegador visible) | archivo publicado v6 en iframe aislado | 11/11 pruebas pasaron. |
| `tests/carga_archivos.js` | servidor local | 11/11 pruebas pasaron. |
| `tests/verify.js` (escritorio, modos A/B/C) | `file://` | 27/27 pruebas pasaron. |

### Proyección dual — archivo publicado v6
| | Prueba | Detalle |
|---|---|---|
| ✅ | Botón «💡 Dual» abre la demostración dual | panel visible con 3 modos |
| ✅ | A y B proyectan porciones distintas de la imagen | diferencia media entre la parte propia de A y la de B: 12.5 |
| ✅ | Superpuesta: mismo tamaño que un proyector y el doble de luz | ancho 3.32 m = 1 proyector; luz simulada 2.01×; brillo medido en pantalla 250 vs. un solo proyector 228 |
| ✅ | Panorámica: 1,85× más ancha con luz pareja de 1× | ancho 6.14 m (1.85×), uniformidad 100 %, brillo medido izq./centro/der. 228/229/228 |
| ✅ | Híbrida: 1,5× más ancha, pareja con blending | ancho 4.98 m, uniformidad 100 %, brillo medido 228/229/228 |
| ✅ | Sin blending la zona compartida brilla de más; con blending se corrige | brillo medido borde/centro — sin blending 228/250 (luz 1.00–2.01×) · con blending 228/229 (luz 1.00–1.01×) |
| ✅ | − / + cambian el solapamiento y el tamaño | solapamiento 50 → 60 % (ancho 4.65 m) → 45 % (ancho 5.15 m) |
| ✅ | Mapa de luz: mismo color en toda la pantalla con blending; otro color en el centro sin blending | con blending borde rgb(251,218,56) centro rgb(251,218,56) · sin blending borde rgb(251,218,56) centro rgb(254,254,254) · leyenda visible: true |
| ✅ | Calculadora: 4,2 m ÷ 1,4 = 3,00 m de ancho por proyector (y la escena 3D usa el mismo tamaño) | ancho 3.00 m, alto 1.69 m; híbrida 4.50 m de ancho |
| ✅ | Calculadora avisa si los proyectores no entran lado a lado | con gabinete de 60 cm y 85 % compartido: "Lentes separadas 0,45 m: no entran lado a lado (gabinete de 60 cm): hay que apilarlos.📐 calculado tamaño, diagonal, superficie y separación (geometría exacta con tus valores)." |
| ✅ | Distingue calculado / simulado / requiere medición, y aclara que no controla proyectores | {"calc":true,"sim":true,"med":true,"noctrl":true} |
| ✅ | «📊 Comparar modos» muestra los 3 modos y «Probar» aplica uno | ⧉ Superpuesta (100 % compartido) / ▭▭ Panorámica (15 % compartido) / ◫ Híbrida (50 % compartido) → probar Superpuesta: solapamiento 100 % |
| ✅ | La vista 3D muestra la proyección superpuesta | píxeles [[250,250,250],[250,250,250]] |
| ✅ | «▦ Cuadrícula» (prueba de calibración) cambia la imagen | diferencia 60.6 |
| ✅ | La barra Dual no tapa la vista (horizontal y vertical) | horizontal {"tapa":false,"over":0} · vertical {"tapa":false,"over":0,"alto":452} |
| ✅ | Consola sin errores | [] |

## B. Verificación VISUAL (capturas revisadas)
| Captura | Qué se comprobó a la vista |
|---|---|
| `verif_visual_dual.png` | Mapa de luz de la híbrida: sin blending el centro aparece blanco (2×) y con blending toda la pantalla queda amarilla (1×). Superpuesta en 3D: una sola imagen con el doble de luz. Calculadora con 4,2 m y relación 1,4:1. |
| `dual_comparar_modos.png` | Las tres tarjetas a escala con persona de 1,75 m; la superpuesta aclara que «requiere medición» al apilar. |
| `dual_vertical.png` | En vertical, la barra Dual queda debajo de la vista y no la tapa. |

## C. NO verificado
- **Teléfono Android físico**: todo lo táctil es emulado.
- **Luz real**: el brillo y la uniformidad son simulados. Los lúmenes reales, la uniformidad y el color necesitan un luxómetro y los proyectores reales.
- **Relación de proyección del Gadnic C45N**: es un supuesto (1,4:1). Medila.
- **Apilado físico**: la corrección de la diferencia de altura (keystone o desplazamiento de lente) no se puede verificar sin los equipos.
- **URL pública**: GitHub Pages sigue bloqueado por permisos.
