import * as THREE from 'three';
import { Illustration } from './Illustration.ts';
import { finish, softLayer, type Finish } from './paint.ts';
import type { CreatureKind } from './Creature.ts';

type Ink = CanvasRenderingContext2D;
export type CreaturePart = 'head' | 'body' | 'arm' | 'leg' | 'lantern' | 'cape' | 'strands';
export type PupilShape = 'slit' | 'bar' | 'pin' | 'ring';

const TAU = Math.PI * 2;

/**
 * The spirits are painted, not inked: dark, quiet masses that belong to the fog, a little lighter
 * where the sky reaches them, soft at every edge, with almost nothing inside the silhouette except
 * where the eye should go: sockets, a mouth, a seam of ember. The finish pass (paint.ts) feathers
 * the edges, darkens the form toward them and lays a thin backlight along the edges facing up.
 *
 * Silhouettes are the same shapes the spirits always had; robes for the Hollow and the Wraith now
 * fall to the ground so they can flow.
 */

/** Canvas size in 512-space units: robes are drawn on a taller sheet so they need no stretching. */
const SHEET: Partial<Record<`${CreatureKind}-${CreaturePart}`, [number, number]>> = {
  'hollow-body': [512, 768], 'hollow-cape': [512, 768], 'wraith-body': [512, 768], 'hollow-strands': [256, 512],
};
/** Texture pixels per 512-space unit. Heads and robes carry the most of the figure. */
const DENSITY: Record<CreaturePart, number> = { head: 1.5, body: 1.25, cape: 1, arm: 1, leg: 1, lantern: 1, strands: 1 };

export function sheetSize(kind: CreatureKind, part: CreaturePart): [number, number] {
  return SHEET[`${kind}-${part}`] ?? [512, 512];
}

const RIM: Record<CreatureKind, [number, number, number]> = {
  goblin: [150, 176, 150], root: [176, 170, 132], hollow: [150, 180, 178], wraith: [190, 226, 232],
};

/** Flat mass with a gentle top-lit gradient. */
function mass(ctx: Ink, d: string, top: string, bottom: string, y0 = 0, y1 = 512): Path2D {
  const shape = new Path2D(d);
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fill(shape);
  return shape;
}
function blob(ctx: Ink, x: number, y: number, rx: number, ry: number, color: string, angle = 0): void {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, TAU); ctx.fill();
}
function glow(ctx: Ink, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function stroke(ctx: Ink, color: string, width: number, ...points: number[]): void {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(points[0], points[1]);
  for (let i = 2; i + 3 < points.length; i += 4) ctx.quadraticCurveTo(points[i], points[i + 1], points[i + 2], points[i + 3]);
  if ((points.length - 2) % 4 === 2) ctx.lineTo(points[points.length - 2], points[points.length - 1]);
  ctx.stroke();
}
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}

const GLOW: Record<CreatureKind, string> = { goblin: '#d4ff6a', root: '#ffb347', hollow: '#e6f3ff', wraith: '#7fe8ff' };
const rgba = (hex: string, a: number) => { const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; };

/** Textures are identical for every spirit of a kind; share them and free them with the last one. */
const shared = { art: null as Illustration | null, users: 0 };

/** Original character illustration, painted for a soft, deformable 2D bone rig. */
export class CreatureArtwork {
  private readonly art: Illustration;
  private disposed = false;

  constructor() {
    shared.art ??= new Illustration();
    shared.users++;
    this.art = shared.art;
  }

  part(kind: CreatureKind, part: CreaturePart): THREE.Texture {
    const [w, h] = sheetSize(kind, part), k = DENSITY[part];
    return this.art.texture(`${kind}-${part}-v3`, Math.round(w * k), Math.round(h * k), (ctx) => {
      ctx.scale(k, k);
      const r = seeded(kind.length * 977 + part.length * 131);
      const look: Finish = { feather: 3.2, rim: RIM[kind], rimWidth: 9, rimStrength: 0.55, edgeShade: 0.5, shadeWidth: 30, grain: 0.03, mottle: 0.14, seed: kind.length * 13 + part.length };
      const paint = { goblin: this.goblin, root: this.root, hollow: this.hollow, wraith: this.wraith }[kind];
      const extra = part === 'lantern' ? this.lantern(ctx) : paint.call(this, ctx, part, r, GLOW[kind]);
      finish(ctx, { ...look, ...extra });
    });
  }

  /* ───────────────────────────── Bramble Goblin ───────────────────────────── */
  private goblin(ctx: Ink, part: CreaturePart, r: () => number, glowColor: string): Finish {
    if (part === 'head') {
      const g = ctx.createLinearGradient(0, 100, 0, 420); g.addColorStop(0, '#5d6a53'); g.addColorStop(1, '#262f27');
      ctx.fillStyle = g;
      ctx.fill(new Path2D('M 152 180 Q 84 136 18 107 Q 62 254 164 278 L 348 278 Q 448 238 494 101 Q 421 135 358 181 Q 331 104 256 111 Q 178 108 152 180 Z'));
      ctx.fill(new Path2D('M 171 218 Q 171 145 253 146 Q 336 143 347 223 Q 354 333 321 383 Q 286 415 236 401 Q 169 371 166 282 Z'));
      const shape = undefined;
      softLayer(ctx, 7, (c) => {
        // Hollows of the ears, the face's soft swell, a heavy brow, cheeks falling away.
        blob(c, 108, 186, 46, 22, 'rgba(14,20,15,.55)', 0.42); blob(c, 404, 186, 46, 22, 'rgba(14,20,15,.55)', -0.42);
        glow(c, 256, 236, 110, 'rgba(120,134,104,.32)');
        blob(c, 256, 224, 92, 18, 'rgba(14,20,15,.55)');
        blob(c, 196, 320, 26, 46, 'rgba(14,20,15,.35)', 0.2); blob(c, 318, 320, 26, 46, 'rgba(14,20,15,.35)', -0.2);
        // Sockets: pits that swallow light; the eyes burn at the bottom of them.
        for (const [x, y] of [[217, 246], [298, 245]]) { blob(c, x, y, 34, 22, 'rgba(4,7,5,.96)'); glow(c, x, y, 30, rgba(glowColor, 0.18)); }
        // The long nose, lit along its bridge, shadowed beneath.
        stroke(c, 'rgba(150,164,128,.45)', 9, 258, 240, 266, 270, 274, 302);
        blob(c, 266, 318, 26, 9, 'rgba(10,15,11,.55)');
        // A crooked slash of a mouth with two pale tusks.
        stroke(c, 'rgba(6,8,6,.92)', 13, 210, 350, 256, 366, 304, 344);
        stroke(c, 'rgba(170,160,128,.8)', 7, 229, 357, 231, 344, 233, 336);
        stroke(c, 'rgba(170,160,128,.8)', 7, 295, 352, 297, 340, 299, 332);
      }, shape);
      return { mottle: 0.16 };
    }
    if (part === 'body') {
      const shape = mass(ctx, 'M 167 48 Q 247 12 335 52 L 355 197 L 389 441 Q 322 465 283 443 L 260 464 L 237 444 Q 180 470 126 444 L 153 189 Z', '#4a3c30', '#1f1915', 40, 470);
      softLayer(ctx, 9, (c) => {
        // Mossed shoulders, a belt, the slump of the tunic; nothing more.
        blob(c, 192, 108, 58, 40, 'rgba(58,74,52,.8)', 0.6); blob(c, 318, 104, 58, 40, 'rgba(58,74,52,.8)', -0.6);
        stroke(c, 'rgba(14,12,10,.7)', 34, 150, 308, 256, 334, 362, 304);
        blob(c, 260, 318, 20, 16, 'rgba(120,108,76,.55)');
        for (const x of [196, 246, 300]) stroke(c, 'rgba(10,8,7,.35)', 16, x, 200, x - 6, 330, x + 4, 440);
        glow(c, 256, 150, 120, 'rgba(110,92,72,.25)');
      }, shape);
      return {};
    }
    if (part === 'arm') {
      const shape = mass(ctx, 'M 194 35 Q 238 19 272 46 Q 305 96 285 201 L 279 330 Q 327 363 309 408 L 289 457 L 268 435 L 256 476 L 237 453 L 220 475 L 208 444 Q 173 410 202 358 L 177 210 Q 166 117 194 35 Z', '#566350', '#262f27', 30, 470);
      softLayer(ctx, 6, (c) => {
        blob(c, 232, 100, 62, 70, 'rgba(48,38,30,.85)');
        blob(c, 236, 206, 26, 12, 'rgba(10,14,11,.45)');
        // Knuckles, then talons paling toward their points.
        blob(c, 256, 410, 48, 26, 'rgba(14,18,14,.4)');
        for (const [x, y] of [[289, 452], [256, 470], [222, 470], [208, 442]]) stroke(c, 'rgba(150,144,118,.85)', 10, x - (x - 250) * 0.1, y - 26, x, y - 10, x, y);
      }, shape);
      return { fadeTop: [0, 0.07] };
    }
    const shape = mass(ctx, 'M 186 25 Q 237 7 286 30 L 289 227 L 309 381 Q 368 418 349 463 Q 283 493 180 463 Q 175 412 207 382 L 179 218 Z', '#3b4537', '#151b16', 20, 480);
    softLayer(ctx, 7, (c) => {
      blob(c, 236, 228, 30, 16, 'rgba(8,11,8,.45)');
      for (let i = 0; i < 3; i++) stroke(c, 'rgba(90,84,66,.35)', 12, 186, 258 + i * 36, 236, 248 + i * 36, 292, 244 + i * 36);
      for (const x of [300, 326, 346]) stroke(c, 'rgba(140,134,110,.7)', 8, x - 10, 452, x + 4, 462, x + 10, 470);
    }, shape);
    return { fadeTop: [0, 0.06] };
  }

  /* ───────────────────────────── Rootbound ───────────────────────────── */
  private root(ctx: Ink, part: CreaturePart, r: () => number, glowColor: string): Finish {
    const grain = (c: Ink, x0: number, x1: number, y0: number, y1: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const x = x0 + r() * (x1 - x0), top = y0 + r() * (y1 - y0) * 0.3, bottom = top + (y1 - y0) * (0.4 + r() * 0.5);
        stroke(c, i % 3 ? 'rgba(12,15,10,.4)' : 'rgba(120,120,92,.18)', 5 + r() * 6, x, top, x + (r() - 0.5) * 30, (top + bottom) / 2, x + (r() - 0.5) * 20, bottom);
      }
    };
    const ember = (c: Ink, ...points: number[]) => { stroke(c, rgba(glowColor, 0.28), 6, ...points); stroke(c, 'rgba(255,226,170,.35)', 2, ...points); };
    if (part === 'head') {
      const shape = mass(ctx, 'M 171 167 L 101 101 L 97 29 L 132 67 L 151 34 L 166 121 L 205 158 L 239 122 L 224 26 L 257 73 L 284 8 L 289 113 L 323 161 L 372 90 L 382 22 L 407 84 L 434 57 L 411 140 L 350 212 L 364 390 L 318 462 L 195 464 L 149 391 Z', '#59624a', '#1e251c', 20, 470);
      softLayer(ctx, 6, (c) => {
        grain(c, 150, 370, 120, 470, 16);
        for (const [x, y] of [[118, 60], [250, 40], [396, 58], [300, 140], [200, 140]]) blob(c, x, y, 26, 16, 'rgba(70,92,52,.65)');
        // The face is a hollow in the wood, lit faintly from deep inside.
        blob(c, 260, 312, 62, 86, 'rgba(3,5,4,.95)');
        glow(c, 260, 340, 70, rgba(glowColor, 0.16));
        for (const [x, y] of [[230, 281], [288, 281]]) { blob(c, x, y, 22, 13, 'rgba(0,0,0,.95)'); glow(c, x, y, 26, rgba(glowColor, 0.22)); }
        for (let i = 0; i < 5; i++) stroke(c, 'rgba(120,104,70,.5)', 5, 232 + i * 14, 342, 234 + i * 14, 352, 236 + i * 14, 360);
        ember(c, 172, 300, 186, 340, 178, 392);
        ember(c, 344, 252, 330, 300, 340, 344);
      }, shape);
      return { mottle: 0.18 };
    }
    if (part === 'body') {
      const shape = mass(ctx, 'M 188 32 Q 254 10 322 45 L 353 172 L 334 288 L 373 461 L 306 437 L 276 484 L 231 448 L 181 480 L 145 459 L 178 290 L 156 154 Z', '#535b44', '#1b211a', 20, 480);
      softLayer(ctx, 7, (c) => {
        grain(c, 150, 370, 40, 480, 22);
        blob(c, 256, 70, 120, 34, 'rgba(66,86,50,.75)');
        // The hollow in the trunk, and something small still watching from inside it.
        blob(c, 254, 210, 42, 92, 'rgba(2,4,3,.96)');
        blob(c, 245, 198, 5, 3, rgba(glowColor, 0.9)); blob(c, 263, 197, 5, 3, rgba(glowColor, 0.9));
        ember(c, 196, 330, 214, 380, 202, 440);
        ember(c, 322, 150, 312, 200, 326, 246);
      }, shape);
      return {};
    }
    if (part === 'arm') {
      const shape = mass(ctx, 'M 200 22 Q 263 10 289 59 L 267 199 L 298 346 L 335 412 L 310 446 L 287 409 L 282 486 L 257 477 L 253 420 L 225 476 L 205 453 L 225 385 L 188 240 L 174 147 Z', '#5d654a', '#1f281e', 20, 480);
      softLayer(ctx, 6, (c) => { grain(c, 185, 300, 30, 400, 10); blob(c, 236, 60, 50, 26, 'rgba(66,86,50,.6)'); ember(c, 238, 170, 246, 210, 240, 250); }, shape);
      return { fadeTop: [0, 0.07] };
    }
    const shape = mass(ctx, 'M 187 17 L 286 20 L 274 241 L 316 367 L 405 456 L 319 440 L 354 493 L 270 463 L 209 498 L 232 447 L 134 475 L 201 371 L 169 216 Z', '#4b5540', '#161c15', 20, 490);
    softLayer(ctx, 6, (c) => { grain(c, 170, 300, 20, 460, 12); blob(c, 260, 452, 90, 22, 'rgba(52,72,42,.6)'); }, shape);
    return { fadeTop: [0, 0.06] };
  }

  /* ───────────────────────────── Antlered Hollow ───────────────────────────── */
  private hollow(ctx: Ink, part: CreaturePart, r: () => number, glowColor: string): Finish {
    if (part === 'head') {
      // Antlers: dark, thin and branching, drawn as part of the silhouette so they feather too.
      ctx.strokeStyle = '#1d2422'; ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(256 + side * 52, 250); ctx.bezierCurveTo(256 + side * 117, 178, 256 + side * 108, 98, 256 + side * 181, 25); ctx.stroke();
        for (let i = 0; i < 3; i++) { ctx.lineWidth = 9 - i * 2; ctx.beginPath(); ctx.moveTo(256 + side * (94 + i * 20), 175 - i * 45); ctx.quadraticCurveTo(256 + side * (75 + i * 13), 111 - i * 29, 256 + side * (84 + i * 14), 53 - i * 17); ctx.stroke(); }
      }
      const skull = new Path2D('M 215 222 Q 255 198 296 220 L 314 285 L 285 407 L 258 456 L 226 412 L 198 287 Z');
      const g = ctx.createLinearGradient(0, 200, 0, 460); g.addColorStop(0, '#cbc8b0'); g.addColorStop(0.6, '#8d917f'); g.addColorStop(1, '#4d554c');
      ctx.fillStyle = g; ctx.fill(skull);
      softLayer(ctx, 5, (c) => {
        // Bone that curves away at the temples, sockets sunk deep, stains weeping from them.
        blob(c, 206, 300, 16, 70, 'rgba(30,36,32,.5)'); blob(c, 306, 300, 16, 70, 'rgba(30,36,32,.5)');
        for (const x of [229, 286]) { blob(c, x, 290, 18, 15, 'rgba(0,0,0,.97)'); stroke(c, 'rgba(40,46,40,.45)', 7, x, 300, x - 2, 330, x, 360); glow(c, x, 290, 18, rgba(glowColor, 0.12)); }
        blob(c, 258, 342, 9, 30, 'rgba(6,8,7,.85)');
        for (let i = 0; i < 6; i++) blob(c, 258, 392 + i * 9, 6 - i * 0.6, 3, 'rgba(196,196,174,.55)');
        stroke(c, 'rgba(40,46,42,.4)', 3, 240, 232, 252, 250, 262, 270);
      }, skull);
      return { rimStrength: 0.45, edgeShade: 0.35, feather: 2.6 };
    }
    if (part === 'strands') {
      // Dead moss hanging from the tines, painted as separate strands so the rig can let it drift.
      for (let i = 0; i < 9; i++) {
        const x = 40 + i * 22 + r() * 10, len = 220 + r() * 260;
        stroke(ctx, `rgba(${96 + i * 5},${112 + i * 4},${98},${0.55 + r() * 0.3})`, 3 + r() * 3, x, 0, x + (r() - 0.5) * 30, len * 0.5, x + (r() - 0.5) * 20, len);
      }
      return { feather: 1.5, rim: undefined, edgeShade: 0, fadeBottom: [0.55, 1], grain: 0.02 };
    }
    if (part === 'body' || part === 'cape') {
      // A floor-length shroud that hangs from a narrow collar and widens to a tattered hem.
      const front = part === 'body';
      const hem = Array.from({ length: 13 }, (_, i) => {
        const x = (front ? 430 : 470) - i * ((front ? 332 : 428) / 12);
        const y = i % 2 ? 738 + r() * 14 : 760 + r() * 8;
        return `L ${x.toFixed(0)} ${y.toFixed(0)}`;
      }).join(' ');
      const d = front
        ? `M 210 6 Q 256 -4 302 6 Q 352 20 362 54 Q 378 200 392 400 Q 404 600 430 752 ${hem} Q 112 600 122 400 Q 136 200 150 54 Q 160 20 210 6 Z`
        : `M 196 40 Q 256 22 316 40 Q 390 90 408 260 Q 424 480 470 752 ${hem} Q 88 480 104 260 Q 122 90 196 40 Z`;
      const shape = mass(ctx, d, front ? '#24312f' : '#141d1d', front ? '#091111' : '#050a0a', 0, 768);
      softLayer(ctx, 10, (c) => {
        // Long, slow folds; a ribcage pressing through the cloth.
        for (let i = 0; i < 7; i++) {
          const x = 150 + i * 36 + r() * 12;
          stroke(c, i % 2 ? 'rgba(2,6,6,.5)' : 'rgba(86,112,108,.16)', 20 + r() * 12, x, 80, x + (x - 256) * 0.15, 400, x + (x - 256) * 0.45, 760);
        }
        if (front) for (let i = 0; i < 5; i++) stroke(c, 'rgba(170,186,170,.11)', 9 - i, 256 - 70 + i * 6, 120 + i * 30, 256, 100 + i * 30, 256 + 70 - i * 6, 120 + i * 30);
      }, shape);
      return { fadeBottom: [0.8, 1], rimStrength: 0.4, edgeShade: 0.45, feather: 4 };
    }
    const shape = mass(ctx, 'M 211 18 L 270 20 L 288 119 L 268 245 L 289 378 L 320 436 L 300 459 L 276 423 L 280 491 L 261 489 L 247 426 L 234 484 L 218 475 L 225 397 L 191 247 L 193 116 Z', '#1e2b2a', '#0a1212', 20, 480);
    softLayer(ctx, 5, (c) => {
      // Sleeve to the wrist, then bare bone: long pale fingers.
      for (const [x0, y0, x1, y1] of [[290, 400, 304, 452], [276, 410, 280, 486], [250, 410, 262, 484], [232, 404, 226, 478]]) stroke(c, 'rgba(176,180,160,.75)', 7, x0, y0, (x0 + x1) / 2 + 3, (y0 + y1) / 2, x1, y1);
      blob(c, 262, 398, 30, 14, 'rgba(150,156,138,.35)');
    }, shape);
    return { fadeTop: [0, 0.07] };
  }

  /* ───────────────────────────── Lantern Wraith ───────────────────────────── */
  private wraith(ctx: Ink, part: CreaturePart, r: () => number, glowColor: string): Finish {
    if (part === 'head') {
      const shape = mass(ctx, 'M 162 233 Q 173 75 261 68 Q 354 102 365 254 L 347 395 L 292 455 L 207 438 L 155 373 Z', '#7f979a', '#2f4a50', 60, 450);
      softLayer(ctx, 9, (c) => {
        for (let i = 0; i < 4; i++) { const o = i - 1.5; stroke(c, 'rgba(26,48,52,.35)', 18, 256 + o * 40, 100, 256 + o * 56, 260, 256 + o * 44, 430); }
        // The hood opens onto nothing; two cold lights hang in the dark.
        blob(c, 258, 300, 62, 84, 'rgba(2,6,8,.97)');
        for (const [x, y] of [[234, 278], [283, 278]]) glow(c, x, y, 30, rgba(glowColor, 0.2));
        stroke(c, 'rgba(120,200,212,.12)', 8, 220, 312, 240, 330, 258, 332);
      }, shape);
      return { rimStrength: 0.6 };
    }
    if (part === 'body') {
      const shape = mass(ctx, 'M 214 10 Q 256 0 298 10 Q 330 40 336 110 Q 372 140 372 220 Q 382 420 420 640 Q 432 700 448 760 L 410 736 L 380 764 L 344 740 L 310 768 L 276 744 L 244 768 L 210 744 L 176 766 L 142 738 L 104 760 Q 116 700 128 640 Q 150 420 140 220 Q 140 140 176 110 Q 182 40 214 10 Z', '#738f93', '#2a4550', 0, 768);
      softLayer(ctx, 11, (c) => {
        for (let i = 0; i < 6; i++) { const x = 170 + i * 34; stroke(c, i % 2 ? 'rgba(20,40,48,.4)' : 'rgba(200,236,240,.12)', 24, x, 140, x + (x - 256) * 0.2, 420, x + (x - 256) * 0.5, 760); }
        // The lantern's warmth catches the front of the robe from below.
        glow(c, 330, 470, 170, 'rgba(255,190,110,.16)');
      }, shape);
      return { fadeBottom: [0.5, 1], rimStrength: 0.65, edgeShade: 0.35, feather: 5 };
    }
    if (part === 'arm') {
      const shape = mass(ctx, 'M 198 23 Q 254 14 294 55 L 276 171 L 251 258 L 273 354 L 304 399 L 287 419 L 268 406 L 264 464 L 246 453 L 237 403 L 218 446 L 202 427 L 215 366 L 181 248 L 174 145 Z', '#7a9497', '#2f4b52', 20, 470);
      softLayer(ctx, 6, (c) => { blob(c, 250, 400, 34, 20, 'rgba(210,236,236,.35)'); stroke(c, 'rgba(20,40,46,.35)', 16, 220, 40, 214, 160, 230, 300); }, shape);
      return { fadeTop: [0, 0.08] };
    }
    return {};
  }

  private lantern(ctx: Ink): Finish {
    const shape = mass(ctx, 'M 204 95 Q 256 27 310 95 L 306 152 L 343 188 L 327 417 L 185 417 L 169 188 L 207 150 Z', '#5c5a40', '#1d2520', 30, 420);
    ctx.strokeStyle = '#2b2f26'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(256, 52, 22, Math.PI * 0.1, Math.PI * 0.9, true); ctx.stroke();
    softLayer(ctx, 6, (c) => {
      const g = c.createRadialGradient(256, 300, 0, 256, 300, 120);
      g.addColorStop(0, 'rgba(255,248,214,1)'); g.addColorStop(0.35, 'rgba(250,206,120,.95)'); g.addColorStop(1, 'rgba(150,110,60,.6)');
      c.fillStyle = g; c.fillRect(194, 196, 124, 196);
      for (const x of [206, 254, 306]) stroke(c, 'rgba(30,32,24,.85)', 9, x, 190, x, 300, x, 405);
    }, shape);
    return { rim: [255, 220, 160], rimStrength: 0.3, edgeShade: 0.25 };
  }

  /** Glowing iris: a bright pinpoint, a ring and fibres. White, so each creature tints it. */
  iris(): THREE.Texture {
    return this.art.texture('creature-iris', 128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      for (const [at, a] of [[0, 1], [0.22, 0.9], [0.5, 0.42], [0.62, 0.7], [0.7, 0.25], [1, 0]] as const) g.addColorStop(at, `rgba(255,255,255,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 12, 64 + Math.sin(a) * 12); ctx.lineTo(64 + Math.cos(a) * 38, 64 + Math.sin(a) * 38); ctx.stroke(); }
    });
  }
  /** The dark pupil drawn over the iris. Its shape is the creature's character. */
  pupil(shape: PupilShape): THREE.Texture {
    return this.art.texture(`creature-pupil-${shape}`, 128, 128, (ctx) => {
      const soft = (draw: () => void) => { ctx.save(); ctx.shadowColor = 'rgba(255,255,255,.9)'; ctx.shadowBlur = 8; ctx.fillStyle = '#ffffff'; ctx.beginPath(); draw(); ctx.fill(); ctx.restore(); };
      if (shape === 'slit') soft(() => { ctx.moveTo(64, 8); ctx.quadraticCurveTo(84, 64, 64, 120); ctx.quadraticCurveTo(44, 64, 64, 8); });
      else if (shape === 'bar') soft(() => { ctx.ellipse(64, 64, 52, 15, 0, 0, TAU); });
      else if (shape === 'pin') soft(() => { ctx.arc(64, 64, 22, 0, TAU); });
      else { soft(() => { ctx.arc(64, 64, 40, 0, TAU); }); ctx.globalCompositeOperation = 'destination-out'; const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 22); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(64, 64, 22, 0, TAU); ctx.fill(); }
    });
  }
  /** A soft, dark mouth hollow with a faint inner glow and a suggestion of teeth. */
  mouth(kind: CreatureKind = 'goblin'): THREE.Texture {
    return this.art.texture(`creature-mouth-${kind}`, 256, 128, (ctx) => {
      ctx.save(); ctx.translate(128, 64); ctx.scale(1, 0.5);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 120);
      g.addColorStop(0, rgba(GLOW[kind], 0.28)); g.addColorStop(0.3, 'rgba(4,4,4,.97)'); g.addColorStop(0.68, 'rgba(4,8,7,.88)'); g.addColorStop(1, 'rgba(4,8,7,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 124, 0, TAU); ctx.fill(); ctx.restore();
      softLayer(ctx, 2, (c) => {
        c.fillStyle = 'rgba(200,192,160,.5)';
        for (let i = 0; i < 9; i++) { const x = 52 + i * 19, top = 64 - Math.sqrt(Math.max(0, 1 - ((x - 128) / 92) ** 2)) * 40; c.beginPath(); c.moveTo(x - 4, top); c.lineTo(x, top + 12); c.lineTo(x + 4, top); c.fill(); }
      });
    });
  }
  /** A soft pool of shadow and mist where a spirit meets the ground. */
  footing(): THREE.Texture {
    return this.art.texture('creature-footing', 128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    });
  }
  /** A curved streak of light left behind by a raking swing, brightest in the middle. */
  smear(): THREE.Texture {
    return this.art.texture('creature-smear', 256, 256, (ctx) => {
      const steps = 48;
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1), a0 = Math.PI / 2 - 0.95 + t * 1.9, a1 = a0 + 1.9 / steps + 0.01, fade = Math.sin(t * Math.PI) ** 1.4;
        const band = ctx.createRadialGradient(128, 128, 92, 128, 128, 128);
        band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.6, `rgba(255,255,255,${0.4 * fade})`); band.addColorStop(0.85, `rgba(255,255,255,${0.7 * fade})`); band.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = band; ctx.beginPath(); ctx.moveTo(128, 128); ctx.arc(128, 128, 128, a0, a1); ctx.closePath(); ctx.fill();
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (--shared.users === 0) { shared.art?.dispose(); shared.art = null; }
  }
}
