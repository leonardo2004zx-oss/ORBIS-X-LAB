// Animaciones de texto compartidas por el visor y el exportador de vídeo.

export const ANIMATIONS = {
  none: "Sin animación",
  fade: "Aparecer",
  rise: "Subir",
  pop: "Rebote",
  type: "Máquina de escribir",
  float: "Flotar",
};

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * Estado del texto en el instante `t` (ms desde que empieza la diapositiva).
 * `dy` está expresado en fracción de la altura del lienzo.
 */
export function captionState(anim, t, text) {
  const k = clamp(t / 700);
  switch (anim) {
    case "fade":
      return { alpha: easeOut(k), dy: 0, scale: 1, text };
    case "rise":
      return { alpha: easeOut(k), dy: (1 - easeOut(k)) * 0.08, scale: 1, text };
    case "pop":
      return { alpha: clamp(k * 3), dy: 0, scale: 0.3 + 0.7 * easeBack(k), text };
    case "type": {
      const chars = Math.floor(t / 55);
      return { alpha: 1, dy: 0, scale: 1, text: text.slice(0, chars) };
    }
    case "float":
      return { alpha: easeOut(k), dy: Math.sin(t / 450) * 0.012, scale: 1, text };
    default:
      return { alpha: 1, dy: 0, scale: 1, text };
  }
}

export const POSITIONS = { top: 0.22, center: 0.5, bottom: 0.82 };
