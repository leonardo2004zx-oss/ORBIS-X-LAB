// NOVA ROBOT LAB — lógica pura del robot (sin DOM), reutilizable y testeable.
(function (root) {
  const DIRS = ['N', 'E', 'S', 'O'];
  const DIR_NAMES = { N: 'Norte', E: 'Este', S: 'Sur', O: 'Oeste' };
  const DELTA = { N: [0, -1], E: [1, 0], S: [0, 1], O: [-1, 0] };

  function createRobot(size = 10) {
    const r = { size, history: [] };
    r.reset = function () {
      r.x = Math.floor(size / 2); r.y = Math.floor(size / 2);
      r.dir = 'N'; r.state = 'LISTO'; r.history = [];
      log('REINICIO', true, 'Posición inicial');
    };
    function log(cmd, ok, note) {
      r.history.push({ n: r.history.length + 1, cmd, ok, note, x: r.x, y: r.y, dir: r.dir });
    }
    function move(sign, name) {
      const [dx, dy] = DELTA[r.dir];
      const nx = r.x + dx * sign, ny = r.y + dy * sign;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
        r.state = 'BLOQUEADO'; log(name, false, 'Límite de la cuadrícula'); return false;
      }
      r.x = nx; r.y = ny; r.state = 'EN MOVIMIENTO'; log(name, true); return true;
    }
    function turn(step, name) {
      r.dir = DIRS[(DIRS.indexOf(r.dir) + step + 4) % 4];
      r.state = 'GIRANDO'; log(name, true); return true;
    }
    r.forward = () => move(1, 'AVANZAR');
    r.backward = () => move(-1, 'RETROCEDER');
    r.left = () => turn(-1, 'GIRAR IZQ');
    r.right = () => turn(1, 'GIRAR DER');
    r.stop = () => { r.state = 'DETENIDO'; log('DETENER', true); return true; };
    r.reset();
    return r;
  }
  const api = { createRobot, DIR_NAMES };
  if (typeof module !== 'undefined') module.exports = api; else root.NovaRobot = api;
})(this);
