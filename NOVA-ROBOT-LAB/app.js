// NOVA ROBOT LAB — interfaz.
(function () {
  const SIZE = 10;
  const robot = NovaRobot.createRobot(SIZE);
  const ANGLE = { N: 0, E: 90, S: 180, O: 270 };
  let angle = 0;
  const $ = (id) => document.getElementById(id);
  const grid = $('grid'), bot = $('robot');

  for (let i = 0; i < SIZE * SIZE; i++) {
    const c = document.createElement('div'); c.className = 'cell'; $('cells').appendChild(c);
  }
  grid.style.setProperty('--size', SIZE);

  function render(blocked) {
    // Rotación acumulada para que el giro sea siempre por el camino corto.
    let diff = (ANGLE[robot.dir] - (angle % 360) + 540) % 360 - 180;
    angle += diff;
    bot.style.setProperty('--x', robot.x);
    bot.style.setProperty('--y', robot.y);
    bot.style.setProperty('--a', angle + 'deg');
    bot.classList.toggle('blocked', !!blocked);
    if (blocked) { bot.classList.remove('shake'); void bot.offsetWidth; bot.classList.add('shake'); }
    $('pos').textContent = `(${robot.x}, ${robot.y})`;
    $('dir').textContent = NovaRobot.DIR_NAMES[robot.dir];
    $('state').textContent = robot.state;
    $('state').dataset.state = robot.state;
    $('count').textContent = robot.history.length;
    $('history').innerHTML = robot.history.slice().reverse().map(h =>
      `<li class="${h.ok ? '' : 'err'}"><span class="n">#${h.n}</span><b>${h.cmd}</b>` +
      `<span>(${h.x},${h.y}) ${h.dir}</span>${h.note ? `<em>${h.note}</em>` : ''}</li>`).join('');
  }

  const actions = { forward: robot.forward, backward: robot.backward, left: robot.left,
    right: robot.right, stop: robot.stop, reset: () => { angle = 0; robot.reset(); return true; } };
  document.querySelectorAll('[data-cmd]').forEach(b =>
    b.addEventListener('click', () => render(!actions[b.dataset.cmd]())));
  const KEYS = { ArrowUp: 'forward', ArrowDown: 'backward', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'stop', r: 'reset' };
  document.addEventListener('keydown', e => {
    const k = KEYS[e.key]; if (k) { e.preventDefault(); render(!actions[k]()); }
  });
  render();
})();
