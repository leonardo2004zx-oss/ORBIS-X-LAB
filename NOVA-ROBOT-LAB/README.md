# NOVA ROBOT LAB

Simulador web de un robot ESP32 sobre una cuadrícula 10×10. HTML + CSS + JavaScript puro: no requiere instalar nada ni servidor.

## Cómo abrirlo
Doble clic en `index.html` (se abre en Chrome o cualquier navegador moderno).

## Uso
- **AVANZAR / RETROCEDER**: mueve una celda en la dirección actual.
- **GIRAR IZQUIERDA / DERECHA**: gira 90°.
- **DETENER**: detiene el robot (queda registrado).
- **REINICIAR SIMULACIÓN**: vuelve al centro (5,5) mirando al Norte y limpia el historial.
- Teclado: flechas, Espacio (detener), R (reiniciar).

El robot no puede salir de la cuadrícula: el intento se bloquea y aparece en rojo en el historial.

## Archivos
- `index.html` — interfaz · `style.css` — estilos · `app.js` — UI · `robot.js` — lógica del robot
- `tests/` — pruebas: `node tests/robot.test.js` (lógica) y `node tests/ui.test.js` (navegador, requiere Playwright)
