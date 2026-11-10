"""Banda sonora del documental: música épica, ambientes y efectos, generados con numpy.

Uso: python3 tools/audio.py <timeline.json> <salida.wav>
Mezcla la narración (rutas de los wav en la línea de tiempo) con la música y los
ambientes, aplica compresión de la música bajo la voz ("ducking") y normaliza.
"""
import json, sys, wave
import numpy as np

SR = 48000
RNG = np.random.default_rng(7)

# ---------------------------------------------------------------- utilidades
def secs(n): return int(round(n * SR))

def read_wav(path):
    with wave.open(path) as w:
        assert w.getframerate() == SR
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        if w.getnchannels() == 2: x = x.reshape(-1, 2).mean(1)
    return x

def write_wav(path, st):
    st = np.clip(st, -1, 1)
    data = (st.T.reshape(-1) * 32767).astype(np.int16) if st.ndim == 2 else (st * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())

def spectral(x, shape):
    """Filtra x en el dominio de la frecuencia con una función shape(f) -> ganancia."""
    n = len(x); X = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / SR)
    return np.fft.irfft(X * shape(f), n).astype(np.float32)

def band(lo, hi, soft=1.5):
    def s(f):
        g = np.ones_like(f)
        if lo: g *= 1 / (1 + (lo / np.maximum(f, 1)) ** (2 * soft))
        if hi: g *= 1 / (1 + (f / hi) ** (2 * soft))
        return g
    return s

def noise(n, lo=None, hi=None, soft=1.5):
    x = RNG.standard_normal(n).astype(np.float32)
    x = spectral(x, band(lo, hi, soft))
    return x / (np.abs(x).max() + 1e-9)

def adsr(n, a, r, curve=1.0):
    e = np.ones(n, np.float32)
    na, nr = min(n, secs(a)), min(n, secs(r))
    if na: e[:na] = np.linspace(0, 1, na) ** curve
    if nr: e[n - nr:] *= np.linspace(1, 0, nr) ** curve
    return e

def slow_lfo(n, rate, depth, phase=0.0):
    t = np.arange(n) / SR
    return (1 - depth + depth * 0.5 * (1 + np.sin(2 * np.pi * rate * t + phase))).astype(np.float32)

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)

class Track:
    def __init__(self, dur):
        self.n = secs(dur); self.L = np.zeros(self.n, np.float32); self.R = np.zeros(self.n, np.float32)
    def add(self, t, x, gain=1.0, pan=0.0):
        i = secs(t)
        if i >= self.n or i + len(x) <= 0: return
        if i < 0: x = x[-i:]; i = 0
        x = x[: self.n - i]
        gl, gr = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
        self.L[i:i + len(x)] += x * gain * gl; self.R[i:i + len(x)] += x * gain * gr
    def stereo(self): return np.stack([self.L, self.R])

# ---------------------------------------------------------------- instrumentos
TBL = 4096
def table(amps):
    ph = np.arange(TBL) / TBL
    w = sum(a * np.sin(2 * np.pi * (k + 1) * ph) for k, a in enumerate(amps) if a)
    return (w / np.abs(w).max()).astype(np.float32)

SAW = table([1 / (k + 1) * np.exp(-k / 14) for k in range(40)])
def vowel_table(f0, formants=((800, 1.0, 90), (1150, 0.6, 110), (2900, 0.25, 160))):
    amps = []
    for k in range(1, 60):
        f = k * f0
        if f > 9000: break
        amps.append(sum(a * np.exp(-((f - F) / bw) ** 2 / 2) for F, a, bw in formants) + 0.02 / k)
    return table(amps)

def osc(tbl, freq, n, vib=0.0, vib_rate=5.0, detune=0.0, phase0=None):
    t = np.arange(n) / SR
    f = freq * 2 ** (detune / 1200) * (1 + vib * np.sin(2 * np.pi * vib_rate * t + RNG.random() * 6))
    ph = (np.cumsum(f) / SR + (RNG.random() if phase0 is None else phase0)) % 1.0
    return tbl[(ph * TBL).astype(np.int32)]

def strings(freq, dur, a=1.5, r=2.0):
    n = secs(dur)
    x = sum(osc(SAW, freq, n, 0.004, 5.2 + i * 0.3, d) for i, d in enumerate((-7, 0, 6)))
    x = spectral(x, band(None, min(5000, freq * 9), 1.2))
    return x * adsr(n, a, r) * 0.33

def choir(freq, dur, a=2.0, r=2.5):
    n = secs(dur); tb = vowel_table(freq)
    x = sum(osc(tb, freq, n, 0.006, 4.6 + i * 0.4, d) for i, d in enumerate((-9, -2, 4, 10)))
    return x * adsr(n, a, r) * 0.25 * slow_lfo(n, 0.2, 0.25)

def bass(freq, dur, a=1.0, r=2.0):
    n = secs(dur); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t) + 0.25 * osc(SAW, freq, n)
    return (spectral(x.astype(np.float32), band(None, 400)) * adsr(n, a, r)).astype(np.float32)

def bell(freq, dur=3.0):
    n = secs(dur); t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * freq * m * t) * np.exp(-t * d) for m, a, d in ((1, 1, 1.5), (2.01, 0.4, 3), (3.02, 0.2, 5), (4.1, 0.12, 7)))
    return (x * np.minimum(1, t * 400)).astype(np.float32) * 0.3

def drum(kind='taiko'):
    if kind == 'taiko':
        n = secs(1.6); t = np.arange(n) / SR
        f = 55 + 70 * np.exp(-t * 18)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2) + 0.5 * noise(n, 60, 900) * np.exp(-t * 22)
    elif kind == 'timp':
        n = secs(2.5); t = np.arange(n) / SR
        x = (np.sin(2 * np.pi * 73 * t) + 0.5 * np.sin(2 * np.pi * 110 * t)) * np.exp(-t * 1.6) + 0.3 * noise(n, 80, 1500) * np.exp(-t * 30)
    else:  # frame drum suave
        n = secs(0.7); t = np.arange(n) / SR
        x = np.sin(2 * np.pi * (90 + 40 * np.exp(-t * 30)) * t) * np.exp(-t * 7) + 0.25 * noise(n, 200, 3000) * np.exp(-t * 40)
    return (x / np.abs(x).max()).astype(np.float32)

# ---------------------------------------------------------------- efectos
def boom(dur=7.0):
    n = secs(dur); t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * np.cumsum(28 + 40 * np.exp(-t * 2.5)) / SR) * np.exp(-t * 0.55)
    body = noise(n, 20, 700) * np.exp(-t * 0.6) * (1 - np.exp(-t * 60))
    crack = noise(n, 800, 9000) * np.exp(-t * 8)
    x = sub * 1.0 + body * 0.9 + crack * 0.35
    return (x / np.abs(x).max()).astype(np.float32)

def whoosh(dur, rising=True, lo=150, hi=4000):
    n = secs(dur); t = np.linspace(0, 1, n)
    x1, x2 = noise(n, lo, hi * 0.3), noise(n, lo * 3, hi)
    k = t if rising else 1 - t
    env = (k ** 2.2 if rising else np.sin(np.pi * t) ** 2)
    return ((x1 * (1 - k) + x2 * k) * env).astype(np.float32)

def wind(dur, lo=100, hi=900, gust=0.12, seed=0):
    n = secs(dur)
    x = noise(n, lo, hi, 1.0)
    g = noise(n, None, 0.6, 2.0); g = 0.6 + 0.4 * g / (np.abs(g).max() + 1e-9)
    hw = noise(n, hi * 0.6, hi * 1.4, 3.0) * gust  # silbido
    return ((x + hw) * g).astype(np.float32)

def crackle(dur, rate=18, seed=1):
    n = secs(dur); x = np.zeros(n, np.float32)
    k = RNG.poisson(rate * dur)
    for p in RNG.integers(0, n - 2000, k):
        L = int(RNG.integers(80, 900)); a = RNG.random() ** 2
        x[p:p + L] += RNG.standard_normal(L).astype(np.float32) * np.exp(-np.arange(L) / (L / 5)) * a
    x = spectral(x, band(300, 8000))
    hiss = noise(n, 400, 3000) * 0.08 * slow_lfo(n, 0.7, 0.5)
    return x / (np.abs(x).max() + 1e-9) + hiss

def chirp_bird(f0=3200, notes=4):
    out = []
    for i in range(notes):
        d = 0.05 + RNG.random() * 0.08; n = secs(d); t = np.arange(n) / SR
        f = f0 * (1 + 0.3 * RNG.random()) * (1 + (RNG.random() - 0.3) * np.linspace(0, 1, n))
        out.append(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2)
        out.append(np.zeros(secs(0.03 + RNG.random() * 0.07)))
    return np.concatenate(out).astype(np.float32)

def insects(dur, f=5200, am=38):
    n = secs(dur); t = np.arange(n) / SR
    x = noise(n, f * 0.85, f * 1.15, 3) * (0.5 + 0.5 * np.sin(2 * np.pi * am * t)) ** 3
    return (x * slow_lfo(n, 0.13, 0.6)).astype(np.float32)

def crickets(dur):
    n = secs(dur); t = np.arange(n) / SR
    chirp = (np.sin(2 * np.pi * 4300 * t) * (np.sin(2 * np.pi * 30 * t) > 0.2) * ((t * 1.3) % 1 < 0.25)).astype(np.float32)
    return chirp * 0.5

def step(kind='soft'):
    n = secs(0.18); t = np.arange(n) / SR
    if kind == 'snow':
        x = noise(n, 900, 6000) * np.exp(-t * 18) * (RNG.random(n) > 0.4)
    else:
        x = noise(n, 60, 900) * np.exp(-t * 30)
    return x.astype(np.float32)

def knap():
    n = secs(0.12); t = np.arange(n) / SR
    x = noise(n, 1800, 9000) * np.exp(-t * 60) + np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 45) * 0.6
    return x.astype(np.float32)

def roar(dur=2.6, f0=70, seed=0):
    n = secs(dur); t = np.arange(n) / SR
    f = f0 * (1 + 0.25 * np.sin(np.pi * t / dur)) * (1 + 0.03 * np.sin(2 * np.pi * 9 * t))
    src = osc(SAW, 1.0, n) * 0  # marcador
    ph = np.cumsum(f) / SR
    buzz = (2 * (ph % 1) - 1).astype(np.float32)
    x = buzz + 0.8 * noise(n, 80, 2500) * (0.5 + 0.5 * np.sin(2 * np.pi * f * t))
    x = spectral(x.astype(np.float32), lambda F: 1 / (1 + (F / 900) ** 2) + 0.6 * np.exp(-((F - 450) / 120) ** 2))
    return (x * np.sin(np.pi * np.linspace(0, 1, n)) ** 0.7 / (np.abs(x).max() + 1e-9)).astype(np.float32)

def trumpet(dur=1.8):  # barrito lejano de mamut
    n = secs(dur); t = np.arange(n) / SR
    f = 380 + 160 * np.sin(np.pi * t / dur) + 12 * np.sin(2 * np.pi * 7 * t)
    ph = np.cumsum(f) / SR
    x = sum(np.sin(2 * np.pi * k * ph) / k for k in range(1, 12))
    x = spectral(x.astype(np.float32), lambda F: np.exp(-((F - 1200) / 700) ** 2) + 0.3)
    return (x * np.sin(np.pi * np.linspace(0, 1, n)) / np.abs(x).max()).astype(np.float32)

def drip():
    n = secs(0.25); t = np.arange(n) / SR
    f = 1400 + 1600 * np.exp(-t * 40)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 25)).astype(np.float32)

def squeak():
    n = secs(0.09); t = np.arange(n) / SR
    f = 5200 + 1500 * np.sin(np.pi * t / 0.09)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.09)).astype(np.float32)

def reverb(st, seconds=3.2, wet=0.35, damp=4000):
    n = st.shape[1]; m = secs(seconds); t = np.arange(m) / SR
    out = np.empty_like(st)
    N = 1 << int(np.ceil(np.log2(n + m)))
    for c in range(2):
        ir = RNG.standard_normal(m).astype(np.float32) * np.exp(-t * 6.9 / seconds)
        ir = spectral(ir, band(120, damp)); ir[:secs(0.012)] = 0; ir /= np.sqrt((ir ** 2).sum())
        y = np.fft.irfft(np.fft.rfft(st[c], N) * np.fft.rfft(ir, N), N)[:n]
        out[c] = st[c] * (1 - wet) + y.astype(np.float32) * wet * 2.2
    return out

# ---------------------------------------------------------------- partitura
# Notas MIDI (re menor). Cada acorde: (raíz grave, voces).
CH = {
    'Dm': (38, [62, 65, 69, 74]), 'Bb': (34, [62, 65, 70, 74]), 'F': (41, [60, 65, 69, 72]), 'C': (36, [60, 64, 67, 72]),
    'Gm': (43, [62, 67, 70, 74]), 'A': (45, [61, 64, 69, 73]), 'Am': (45, [60, 64, 69, 72]), 'D': (38, [62, 66, 69, 74]),
    'Dm9': (38, [64, 65, 69, 72]), 'Bbmaj7': (34, [62, 65, 69, 74]), 'Fadd9': (41, [60, 65, 67, 69]), 'Csus': (36, [60, 65, 67, 72]),
}

def build(tl):
    dur = tl['duration']
    S = {s['id']: s for s in tl['scenes']}
    loc = lambda sid, i: (S[sid]['lines'][i]['start'], S[sid]['lines'][i]['end'])
    music, amb, fx = Track(dur), Track(dur), Track(dur)

    def section(t0, t1, prog, lvl=1.0, choirs=0.0, strings_on=True, bass_on=True, bells=0.0, octave=0):
        n = len(prog); d = (t1 - t0) / n
        for i, c in enumerate(prog):
            root, voices = CH[c]
            st = t0 + i * d; ln = d + 2.2
            if bass_on: music.add(st, bass(mtof(root), ln, 1.2, 2.2), 0.5 * lvl)
            if strings_on:
                for j, v in enumerate(voices): music.add(st, strings(mtof(v + octave), ln, 1.6, 2.4), 0.30 * lvl, pan=(j - 1.5) * 0.35)
                music.add(st, strings(mtof(root + 12), ln, 1.6, 2.4), 0.3 * lvl)
            if choirs:
                for j, v in enumerate(voices[1:3]): music.add(st, choir(mtof(v), ln, 2.0, 2.4), 0.5 * choirs * lvl, pan=(j - 0.5) * 0.6)
            if bells:
                for k in range(4):
                    v = voices[(k * 2 + i) % len(voices)] + 12
                    music.add(st + k * d / 4, bell(mtof(v), 3.0), 0.22 * bells, pan=np.sin(k + i) * 0.6)

    def drums(t0, t1, period, kind='taiko', gain=0.5, accent=4):
        t, k = t0, 0
        while t < t1:
            music.add(t, drum(kind), gain * (1.0 if k % accent == 0 else 0.6), pan=0.0 if k % 2 else 0.1)
            t += period; k += 1

    intro, im, inv, mam, arb = 0.0, S['impacto'], S['invierno'], S['mamiferos'], S['arbol']
    aus, ere, nea, sap, hoy = S['australopithecus'], S['erectus'], S['neandertales'], S['sapiens'], S['hoy']
    IMP = loc('impacto', 1)[0] + 5.1; FB = IMP - 6.5

    # --- intro: espacio
    music.add(0, bass(mtof(26), 10, 4, 3), 0.6)
    section(0.5, im['start'], ['Dm9', 'Bbmaj7'], 0.55, choirs=0.5, bells=0.7)
    # --- impacto: majestuoso y luego tensión
    section(im['start'], FB, ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb'], 0.85, choirs=0.6)
    n = secs(IMP - FB + 0.1)
    for j, m in enumerate([50, 51, 56, 57, 62, 63]):  # racimo ascendente
        x = strings(mtof(m), IMP - FB + 0.1, 3.5, 0.05) * np.linspace(0.2, 1.4, n) ** 2
        music.add(FB, x, 0.32, pan=(j - 2.5) * 0.3)
    t = FB + 1.5; k = 0
    while t < IMP - 0.2:  # redoble de timbales
        music.add(t, drum('timp'), 0.25 + 0.6 * (t - FB) / (IMP - FB)); t += max(0.12, 0.6 - 0.09 * k); k += 1
    music.add(IMP + 2.5, bass(mtof(26), im['end'] - IMP + 2, 2.5, 3), 0.7)
    music.add(IMP + 2.5, choir(mtof(50), im['end'] - IMP + 2, 3, 3), 0.35)
    # --- invierno: desolación y esperanza
    section(inv['start'], inv['lines'][2]['start'], ['Dm', 'Dm9', 'Gm', 'Dm'], 0.5, choirs=0.35, octave=-12)
    section(inv['lines'][2]['start'], inv['end'], ['Bb', 'F', 'C'], 0.6, bells=0.6)
    # --- mamíferos: luminoso
    section(mam['start'], mam['end'], ['F', 'C', 'Dm', 'Bb', 'F', 'Csus', 'F'], 0.7, bells=1.0)
    # --- árbol: reflexivo con pulso
    section(arb['start'], arb['end'], ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'], 0.7, choirs=0.4, bells=0.4)
    drums(arb['lines'][2]['start'], arb['end'], 1.2, 'frame', 0.35)
    # --- australopithecus
    section(aus['start'], aus['end'], ['Bb', 'F', 'Gm', 'Dm', 'Bb', 'C'], 0.75, choirs=0.5)
    drums(aus['start'] + 1, aus['end'], 1.53, 'frame', 0.3, accent=2)
    # --- erectus: épico
    section(ere['start'], ere['end'], ['Dm', 'C', 'Bb', 'A', 'Dm'], 0.9, choirs=0.7)
    drums(ere['start'] + 0.5, ere['end'] - 0.5, 0.75, 'taiko', 0.45)
    # --- neandertales: frío
    section(nea['start'], nea['end'], ['Dm', 'Gm', 'Bb', 'A', 'Dm', 'Gm'], 0.75, choirs=0.8, octave=-12)
    # --- sapiens: ascenso
    section(sap['start'], sap['end'], ['Bb', 'F', 'C', 'Dm', 'Bb', 'F', 'C', 'F'], 0.95, choirs=0.7, bells=0.5)
    drums(sap['start'] + 6, sap['lines'][2]['start'], 0.75, 'taiko', 0.4)
    # --- hoy y cierre: resolución en re mayor
    section(hoy['start'], hoy['lines'][1]['start'] - 0.2, ['Bb', 'C', 'Dm', 'F'], 1.0, choirs=0.8)
    music.add(hoy['lines'][1]['start'] - 0.4, drum('timp'), 0.6)
    section(hoy['lines'][1]['start'] - 0.2, dur - 1.0, ['D', 'Bb', 'D'], 0.9, choirs=1.0, bells=0.8)

    # ---------------- ambientes y efectos
    def amb_add(t0, t1, x, g, pan=0.0, fade=1.5):
        n = min(len(x), secs(t1 - t0)); x = x[:n] * adsr(n, fade, fade); amb.add(t0, x, g, pan)
    # Cretácico
    a, b = im['start'], IMP
    amb_add(a, b + 0.5, wind(b - a + 0.5, 80, 700), 0.12)
    amb_add(a, b, insects(b - a, 4600, 31), 0.03, 0.4)
    fx.add(a + 3.0, roar(3.2, 38), 0.22, -0.5)   # saurópodo lejano (grave)
    fx.add(a + 10.5, roar(3.0, 34), 0.18, 0.5)
    fx.add(FB + 2.2, roar(2.4, 85), 0.45, -0.3)  # terópodo
    fx.add(FB, whoosh(IMP - FB, True, 60, 3000), 0.55)
    fx.add(IMP - 0.05, boom(8.0), 1.0)
    fx.add(IMP + 1.4, whoosh(2.5, False, 100, 5000), 0.35)
    amb_add(IMP, inv['start'] + 3, noise(secs(inv['start'] + 3 - IMP), 20, 200) * slow_lfo(secs(inv['start'] + 3 - IMP), 0.3, 0.5), 0.35, fade=2.5)
    # invierno de impacto
    a, b = inv['start'], inv['end']
    amb_add(a, b, wind(b - a, 150, 1200, 0.25), 0.22)
    amb_add(a, b, crackle(b - a, 10), 0.05, -0.4)
    tb = inv['lines'][1]['start'] + 7.8
    fx.add(tb + 0.5, chirp_bird(2900, 3), 0.12, -0.5); fx.add(tb + 0.7, whoosh(0.6, False, 300, 3000), 0.1, -0.5)
    em = inv['lines'][2]['start'] + 1.6
    for k in range(5): fx.add(em + 0.6 + k * 0.7, squeak(), 0.05 + 0.02 * (k % 2), 0.3)
    # bosque del Eoceno
    a, b = mam['start'], mam['end']
    amb_add(a, b, wind(b - a, 300, 2500, 0.05) * 0.6, 0.1)
    amb_add(a, b, insects(b - a, 6200, 44), 0.035, 0.5)
    for k in range(int((b - a) / 1.3)):
        fx.add(a + 0.5 + k * 1.3 + RNG.random(), chirp_bird(2400 + RNG.random() * 2200, int(RNG.integers(2, 6))), 0.05 + 0.04 * RNG.random(), RNG.uniform(-0.8, 0.8))
    pr = mam['lines'][1]['start'] + 6.5
    fx.add(pr, squeak(), 0.06); fx.add(pr + 0.25, squeak(), 0.05)
    # árbol: brillo suave
    amb_add(arb['start'], arb['end'], noise(secs(arb['end'] - arb['start']), 3000, 9000) * slow_lfo(secs(arb['end'] - arb['start']), 0.1, 0.8), 0.012)
    # sabana del Plioceno
    a, b = aus['start'], aus['end']
    amb_add(a, b, wind(b - a, 150, 1500, 0.08), 0.12)
    amb_add(a, b, insects(b - a, 7000, 60), 0.025, -0.3)
    for k in range(6): fx.add(a + 2 + k * 3.7, chirp_bird(3500, 3), 0.04, RNG.uniform(-0.8, 0.8))
    t = a + 0.8
    while t < b - 0.5:
        for off in (0.0, 0.5, 1.0): fx.add(t + off, step('soft'), 0.07, 0.1)
        t += 1.53
    # Homo erectus
    a, b = ere['start'], ere['lines'][1]['start'] - 0.3
    amb_add(a, b + 0.5, wind(b - a + 0.5, 200, 1800, 0.06), 0.13)
    amb_add(a, b + 0.5, insects(b - a + 0.5, 5600, 52), 0.04)
    a2, b2 = b, ere['lines'][1]['start'] + 4.6
    amb_add(a2, b2 + 0.6, crackle(b2 - a2 + 0.6, 26), 0.2)
    amb_add(a2, b2 + 0.6, crickets(b2 - a2 + 0.6), 0.03, 0.5)
    t = a2 + 0.4
    while t < b2: fx.add(t, knap(), 0.12, -0.35); t += 2 * np.pi / 7
    fx.add(b2 - 0.3, whoosh(1.4, False, 200, 6000), 0.2)
    # glaciación
    a, b = nea['start'], nea['lines'][1]['start'] - 0.3
    amb_add(a, b + 0.5, wind(b - a + 0.5, 200, 2200, 0.35), 0.28)
    fx.add(a + 3.5, trumpet(2.0), 0.06, 0.6); fx.add(a + 9.5, trumpet(1.6), 0.045, 0.4)
    t = a + 0.3
    while t < b: fx.add(t, step('snow'), 0.06, 0.1); t += 0.55
    lu = nea['lines'][1]['start'] + (nea['lines'][1]['pauses'][0][1] if nea['lines'][1]['pauses'] else 5) - 0.1
    amb_add(b, lu + 0.5, crackle(lu - b + 0.5, 24), 0.2)
    amb_add(b, lu + 0.5, wind(lu - b + 0.5, 100, 500), 0.1)
    # Homo sapiens
    a = sap['start']; mp = sap['lines'][0]['start'] + 5.4; cv = sap['lines'][2]['start'] - 0.2; fm = sap['lines'][2]['start'] + 4.5
    amb_add(a, mp + 0.5, wind(mp - a + 0.5, 150, 1200), 0.1)
    for k in range(4): fx.add(a + 1 + k * 1.2, chirp_bird(3000, 4), 0.05, RNG.uniform(-0.8, 0.8))
    fx.add(mp - 0.3, whoosh(1.5, False, 200, 6000), 0.2)
    amb_add(cv, fm + 0.5, crackle(fm - cv + 0.5, 20), 0.15)
    for k in range(4): fx.add(cv + 0.8 + k * 1.1, drip(), 0.05, RNG.uniform(-0.6, 0.6))
    amb_add(fm, sap['end'] + 0.5, wind(sap['end'] - fm + 0.5, 300, 3000, 0.05), 0.12)
    for k in range(4): fx.add(fm + 0.6 + k * 1.4, chirp_bird(2600, 3), 0.04, RNG.uniform(-0.8, 0.8))
    # hoy
    amb_add(hoy['start'], hoy['end'], noise(secs(hoy['end'] - hoy['start']), 30, 160), 0.12, fade=2.5)
    return music, amb, fx

def envelope(x, attack=0.05, release=0.45):
    hop = 480; n = len(x) // hop + 1
    pad = np.zeros(n * hop, np.float32); pad[:len(x)] = x
    r = np.sqrt((pad.reshape(n, hop) ** 2).mean(1))
    e = np.zeros(n, np.float32); v = 0.0
    ka, kr = np.exp(-hop / (SR * attack)), np.exp(-hop / (SR * release))
    for i in range(n):
        k = ka if r[i] > v else kr; v = k * v + (1 - k) * r[i]; e[i] = v
    return np.repeat(e, hop)[: len(x)]

def main():
    tl = json.load(open(sys.argv[1], encoding='utf-8'))
    dur = tl['duration']
    music, amb, fx = build(tl)
    voice = Track(dur)
    for s in tl['scenes']:
        for l in s['lines']:
            voice.add(l['start'], read_wav(l['wav']), 1.0)
    v = voice.L / 1.414  # mono
    # música con reverberación amplia, ambientes con algo menos
    M = reverb(music.stereo(), 3.6, 0.45)
    A = amb.stereo(); F = reverb(fx.stereo(), 1.8, 0.2)
    # ducking: la música baja ~9 dB cuando habla el narrador
    env = envelope(v)
    duck = 1 - 0.75 * np.clip(env / 0.04, 0, 1)
    M *= duck; A *= (1 - 0.35 * np.clip(env / 0.05, 0, 1))
    V = reverb(np.stack([v, v]), 0.9, 0.08)
    M *= 0.15; A *= 1.4; F *= 1.2; V *= 1.15
    mix = M + A + F + V
    act = env > 0.02
    db = lambda x, m: 20 * np.log10(np.sqrt((x[:, m] ** 2).mean()) + 1e-9)
    for name, x in (('voz', V), ('musica', M), ('ambiente', A), ('efectos', F)):
        print(f'{name:9s} con voz {db(x, act):6.1f} dB   sin voz {db(x, ~act):6.1f} dB')
    # fundido final y limitador suave
    n = mix.shape[1]; fade = secs(2.0); mix[:, n - fade:] *= np.linspace(1, 0, fade)
    peak = np.abs(mix).max(); mix = mix / peak * 1.25
    mix = np.tanh(mix) * 0.89
    rms = np.sqrt((mix ** 2).mean())
    print(f'pico {np.abs(mix).max():.3f}  rms {20 * np.log10(rms):.1f} dBFS')
    write_wav(sys.argv[2], mix)
    # pistas separadas para revisión
    write_wav(sys.argv[2].replace('.wav', '_musica.wav'), np.tanh(M / (np.abs(M).max() + 1e-9)) * 0.8)

if __name__ == '__main__':
    main()
