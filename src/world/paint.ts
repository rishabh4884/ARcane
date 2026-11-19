/**
 * Soft-paint finishing for illustrated parts.
 *
 * Inked outlines and hard alpha cuts are what make a puppet read as paper. This pass takes a
 * part painted as flat masses and finishes it the way a painter would: the silhouette softens
 * inward, the form darkens toward its edges, a thin backlight catches the edges that face the sky,
 * a little grain and mottling break up the gradients, and limbs can melt into the body they join
 * or into the mist at their feet. Everything is computed once, on the CPU, when a texture is made.
 */
export interface Finish {
  /** Inward feather of the silhouette, in canvas pixels. */
  feather?: number;
  /** Backlight colour along edges that face upward (and, more faintly, sideways). */
  rim?: [number, number, number];
  rimWidth?: number;
  rimStrength?: number;
  /** Darken the form toward its silhouette (0 = flat, 1 = black edges). */
  edgeShade?: number;
  shadeWidth?: number;
  /** Fine per-pixel grain and broad value mottling, as fractions of brightness. */
  grain?: number;
  mottle?: number;
  /** Fade alpha in from the top / out toward the bottom: [start, end] as fractions of height. */
  fadeTop?: [number, number];
  fadeBottom?: [number, number];
  seed?: number;
}

/**
 * Paint soft interior detail: everything drawn by `draw` is blurred by `radius` (canvas pixels at
 * 512 scale) and laid over the part, clipped to `clip`. Folds, sockets, cracks and glows are
 * painted here, so nothing inside a figure has a hard edge either.
 */
export function softLayer(ctx: CanvasRenderingContext2D, radius: number, draw: (layer: CanvasRenderingContext2D) => void, clip?: Path2D): void {
  if (typeof document === 'undefined') return;
  const { width, height } = ctx.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const layer = canvas.getContext('2d', { willReadFrequently: true })!;
  layer.setTransform(ctx.getTransform());
  draw(layer);
  const image = layer.getImageData(0, 0, width, height), data = image.data, n = width * height;
  const channels = [0, 1, 2, 3].map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255;
    channels[0][i] = data[i * 4] * a; channels[1][i] = data[i * 4 + 1] * a; channels[2][i] = data[i * 4 + 2] * a; channels[3][i] = a;
  }
  const r = radius * (width / 512);
  const [br, bg, bb, ba] = channels.map((c) => blur(c, width, height, r));
  for (let i = 0; i < n; i++) {
    const a = ba[i];
    data[i * 4 + 3] = Math.round(a * 255);
    if (a > 1e-4) { data[i * 4] = br[i] / a; data[i * 4 + 1] = bg[i] / a; data[i * 4 + 2] = bb[i] / a; }
  }
  layer.putImageData(image, 0, 0);
  ctx.save();
  if (clip) ctx.clip(clip);
  ctx.resetTransform();
  // Only where the figure is already painted: soft detail never spills past the silhouette.
  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

/** Two passes of a running-sum box blur ≈ a gaussian of the same radius. */
function blur(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius / 1.5));
  let a = Float32Array.from(source), b = new Float32Array(source.length);
  const span = r * 2 + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += a[row + Math.min(width - 1, Math.max(0, x))];
      for (let x = 0; x < width; x++) {
        b[row + x] = sum / span;
        sum += a[row + Math.min(width - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += b[Math.min(height - 1, Math.max(0, y)) * width + x];
      for (let y = 0; y < height; y++) {
        a[y * width + x] = sum / span;
        sum += b[Math.min(height - 1, y + r + 1) * width + x] - b[Math.max(0, y - r) * width + x];
      }
    }
  }
  b = a;
  return b;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function valueNoise(seed: number, cells: number): (u: number, v: number) => number {
  let state = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  const grid = Array.from({ length: (cells + 1) * (cells + 1) }, rnd);
  return (u, v) => {
    const x = Math.min(cells - 1e-6, Math.max(0, u * cells)), y = Math.min(cells - 1e-6, Math.max(0, v * cells));
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (i: number, j: number) => grid[j * (cells + 1) + i];
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
  };
}

export function finish(ctx: CanvasRenderingContext2D, options: Finish = {}): void {
  const { width, height } = ctx.canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const n = width * height;
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3] / 255;
  const scale = width / 512;
  const feather = blur(alpha, width, height, (options.feather ?? 3) * scale);
  const rimWidth = (options.rimWidth ?? 10) * scale;
  const rimField = options.rim ? blur(alpha, width, height, rimWidth) : null;
  const shadeField = (options.edgeShade ?? 0) > 0 ? blur(alpha, width, height, (options.shadeWidth ?? 26) * scale) : null;
  const mottleAt = valueNoise(options.seed ?? 7, 9);
  const fineAt = valueNoise((options.seed ?? 7) + 31, 40);
  let state = ((options.seed ?? 7) * 7919) >>> 0 || 1;
  const rnd = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  const rim = options.rim, rimStrength = options.rimStrength ?? 0.7, edgeShade = options.edgeShade ?? 0;
  const grain = options.grain ?? 0.035, mottle = options.mottle ?? 0.12;
  const step = Math.max(1, Math.round(rimWidth * 0.5));
  for (let y = 0; y < height; y++) {
    const v = y / height;
    let fade = 1;
    if (options.fadeTop) fade *= smooth(options.fadeTop[0], options.fadeTop[1], v);
    if (options.fadeBottom) fade *= 1 - smooth(options.fadeBottom[0], options.fadeBottom[1], v);
    for (let x = 0; x < width; x++) {
      const i = y * width + x, a = alpha[i];
      if (a <= 0.003) { data[i * 4 + 3] = 0; continue; }
      const u = x / width;
      let light = 1 + (mottleAt(u, v) - 0.5) * 2 * mottle + (fineAt(u, v) - 0.5) * mottle * 0.6 + (rnd() - 0.5) * 2 * grain;
      if (shadeField) light *= 1 - edgeShade * (1 - smooth(0.35, 1, shadeField[i]));
      let r = data[i * 4] * light, g = data[i * 4 + 1] * light, b = data[i * 4 + 2] * light;
      if (rim && rimField) {
        // Which way does the edge face? Compare the field just above and below this pixel.
        const above = rimField[Math.max(0, y - step) * width + x], below = rimField[Math.min(height - 1, y + step) * width + x];
        const left = rimField[y * width + Math.max(0, x - step)], right = rimField[y * width + Math.min(width - 1, x + step)];
        const facingUp = Math.max(0, below - above) * 3, facingSide = Math.abs(right - left) * 1.4;
        const edge = smooth(0.25, 0.95, 1 - rimField[i]) * a;
        const k = edge * Math.min(1, facingUp + facingSide * 0.45) * rimStrength;
        r += (rim[0] - r) * k; g += (rim[1] - g) * k; b += (rim[2] - b) * k;
      }
      data[i * 4] = Math.min(255, r); data[i * 4 + 1] = Math.min(255, g); data[i * 4 + 2] = Math.min(255, b);
      // Inward feather: fully soft at the boundary, solid a few pixels in.
      data[i * 4 + 3] = Math.round(255 * a * smooth(0.18, 0.82, feather[i]) * fade);
    }
  }
  bleed(data, width, height, scale);
  ctx.putImageData(image, 0, 0);
}

/**
 * Carry each edge's colour out into the transparent pixels around it. Textures are filtered and
 * mipmapped with straight alpha, so without this the soft edges would pick up a dark fringe.
 */
function bleed(data: Uint8ClampedArray, width: number, height: number, scale: number): void {
  const n = width * height;
  const a = new Float32Array(n), r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = data[i * 4 + 3] / 255;
    a[i] = w; r[i] = data[i * 4] * w; g[i] = data[i * 4 + 1] * w; b[i] = data[i * 4 + 2] * w;
  }
  const radius = 5 * scale;
  const wa = blur(a, width, height, radius), wr = blur(r, width, height, radius), wg = blur(g, width, height, radius), wb = blur(b, width, height, radius);
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] > 250 || wa[i] < 1e-4) continue;
    const keep = data[i * 4 + 3] / 255;
    data[i * 4] = data[i * 4] * keep + (wr[i] / wa[i]) * (1 - keep);
    data[i * 4 + 1] = data[i * 4 + 1] * keep + (wg[i] / wa[i]) * (1 - keep);
    data[i * 4 + 2] = data[i * 4 + 2] * keep + (wb[i] / wa[i]) * (1 - keep);
  }
}
