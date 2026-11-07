// Utilidades para analizar GIFs: número de fotogramas y duración de un ciclo.
// Sólo lee la cabecera y los bloques; no decodifica píxeles.

/**
 * @param {ArrayBuffer} buffer
 * @returns {{frames:number, loopMs:number, width:number, height:number}}
 */
export function inspectGif(buffer) {
  const b = new Uint8Array(buffer);
  const sig = String.fromCharCode(...b.slice(0, 6));
  if (sig !== "GIF87a" && sig !== "GIF89a") throw new Error("No es un archivo GIF válido");

  const width = b[6] | (b[7] << 8);
  const height = b[8] | (b[9] << 8);
  let p = 13;
  const packed = b[10];
  if (packed & 0x80) p += 3 * (1 << ((packed & 0x07) + 1)); // tabla de color global

  let frames = 0;
  let loopMs = 0;
  let pendingDelay = 0;

  const skipSubBlocks = () => {
    while (p < b.length) {
      const size = b[p++];
      if (size === 0) return;
      p += size;
    }
  };

  while (p < b.length) {
    const block = b[p++];
    if (block === 0x3b) break; // trailer
    if (block === 0x21) {
      const label = b[p++];
      if (label === 0xf9 && b[p] === 4) {
        const cs = b[p + 2] | (b[p + 3] << 8);
        // Los navegadores tratan retardos <= 1cs como 100ms.
        pendingDelay = cs <= 1 ? 100 : cs * 10;
      }
      skipSubBlocks();
    } else if (block === 0x2c) {
      frames++;
      loopMs += pendingDelay || 100;
      pendingDelay = 0;
      const ipacked = b[p + 8];
      p += 9;
      if (ipacked & 0x80) p += 3 * (1 << ((ipacked & 0x07) + 1)); // tabla local
      p++; // tamaño mínimo LZW
      skipSubBlocks();
    } else {
      break; // bloque desconocido / archivo truncado
    }
  }
  return { frames, loopMs, width, height };
}

/** Duración sugerida para una diapositiva: ciclos completos del GIF, entre 3 y 15 s. */
export function suggestDuration(loopMs) {
  if (!loopMs) return 5000;
  const loops = Math.max(1, Math.ceil(3000 / loopMs));
  return Math.min(15000, loops * loopMs);
}
