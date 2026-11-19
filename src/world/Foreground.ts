import * as THREE from 'three';
import { finish } from './paint.ts';

/**
 * The near frame. A few dark, painted shapes hang into the corners of the view right in front of
 * the eye — a branch with dead leaves and moss, tall grass — and a handful of motes drift past.
 * The depth of field turns all of it into soft silhouettes, which is what gives a 2D-feeling world
 * its depth: something close and dark, the lit playing ground, then the hazy wood beyond.
 * Everything here rides with the camera and sways slowly; it stops when the wood holds still.
 */

type Shape = 'branch' | 'grass' | 'fern';

function paint(shape: Shape, seed: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  let state = seed;
  const r = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  const ink = (alpha = 1) => `rgba(5,9,8,${alpha})`;
  const limb = (x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, bend: number) => {
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const t = i / steps, t1 = (i + 1) / steps;
      const at = (k: number) => [x0 + (x1 - x0) * k + Math.sin(k * Math.PI) * bend, y0 + (y1 - y0) * k] as const;
      const [ax, ay] = at(t), [bx, by] = at(t1);
      ctx.strokeStyle = ink(); ctx.lineCap = 'round'; ctx.lineWidth = w0 + (w1 - w0) * t;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
  };
  if (shape === 'branch') {
    // A gnarled limb reaching in from the top corner, twigs, a few dead leaves, hanging moss.
    limb(-20, 40, 470, 150, 46, 10, 40);
    for (let i = 0; i < 6; i++) {
      const t = 0.15 + i * 0.14, x = -20 + 490 * t, y = 40 + 110 * t + Math.sin(t * Math.PI) * 10;
      limb(x, y, x + (r() - 0.3) * 120, y + 60 + r() * 120, 12 - i, 2, (r() - 0.5) * 40);
      for (let k = 0; k < 4; k++) {
        const lx = x + (r() - 0.3) * 120, ly = y + 40 + r() * 130;
        ctx.fillStyle = ink(0.95); ctx.beginPath(); ctx.ellipse(lx, ly, 9 + r() * 10, 4 + r() * 4, r() * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (let i = 0; i < 9; i++) {
      const x = 40 + r() * 400, y = 60 + (x / 470) * 110, len = 120 + r() * 260;
      ctx.strokeStyle = ink(0.75); ctx.lineWidth = 2 + r() * 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (r() - 0.5) * 40, y + len * 0.5, x + (r() - 0.5) * 30, y + len); ctx.stroke();
    }
  } else if (shape === 'grass') {
    // Tall blades leaning in from the bottom corner.
    for (let i = 0; i < 26; i++) {
      const x = 20 + r() * 420, h = 220 + r() * 270, lean = (r() - 0.25) * 160, w = 7 + r() * 9;
      ctx.fillStyle = ink(0.85 + r() * 0.15);
      ctx.beginPath(); ctx.moveTo(x - w, 512); ctx.quadraticCurveTo(x + lean * 0.4, 512 - h * 0.6, x + lean, 512 - h);
      ctx.quadraticCurveTo(x + lean * 0.4 + w * 0.5, 512 - h * 0.55, x + w, 512); ctx.closePath(); ctx.fill();
    }
  } else {
    // A fern frond curling up from below.
    for (let f = 0; f < 3; f++) {
      const bx = 120 + f * 110, tipX = bx + 140 - f * 40, tipY = 120 + f * 50;
      limb(bx, 520, tipX, tipY, 9, 3, -60 + f * 30);
      for (let i = 1; i < 14; i++) {
        const t = i / 14, x = bx + (tipX - bx) * t + Math.sin(t * Math.PI) * (-60 + f * 30), y = 520 + (tipY - 520) * t, len = 70 * (1 - t) + 14;
        for (const side of [-1, 1]) {
          ctx.fillStyle = ink(0.92); ctx.beginPath();
          ctx.ellipse(x + side * len * 0.5, y - len * 0.18, len * 0.5, 7 * (1 - t) + 3, side * 0.5 - 0.3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
  finish(ctx, { feather: 3, rim: [70, 92, 92], rimWidth: 6, rimStrength: 0.35, edgeShade: 0, grain: 0.02, mottle: 0.05, seed });
  return canvas;
}

interface Piece { mesh: THREE.Mesh; corner: [number, number]; size: [number, number]; depth: number; inset: [number, number] }

export class Foreground {
  readonly group = new THREE.Group();
  private readonly pieces: Piece[] = [];
  private readonly time = { value: 0 };
  private readonly textures: THREE.Texture[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly motes: THREE.Points;
  private aspect = 0;

  constructor() {
    this.group.name = 'Near frame';
    // Drawn after the world: these are the nearest things in view.
    this.group.renderOrder = 50;
    // [shape, corner (x, y in -1..1), size (m), depth (m), inset (fraction of the shape kept inside the frame), anchor]
    const layout: Array<[Shape, [number, number], [number, number], number, [number, number], 'top' | 'bottom', number]> = [
      ['branch', [-1, 1], [1.9, 1.5], 1.75, [0.66, 0.97], 'top', 1],
      ['branch', [1, 1], [1.5, 1.2], 2.3, [0.5, 0.97], 'top', 7],
      ['grass', [-1, -1], [1.2, 0.9], 1.6, [0.72, 0.96], 'bottom', 3],
      ['fern', [1, -1], [1.0, 0.85], 1.7, [0.66, 0.95], 'bottom', 5],
    ];
    for (const [shape, corner, size, depth, inset, anchor, seed] of layout) {
      const canvas = paint(shape, seed);
      const texture = canvas ? new THREE.CanvasTexture(canvas) : new THREE.Texture();
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(texture);
      const geometry = new THREE.PlaneGeometry(1, 1, 8, 8);
      this.geometries.push(geometry);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: true, alphaTest: 0.02, toneMapped: false, fog: false, side: THREE.DoubleSide });
      const time = this.time, hang = anchor === 'top' ? 1 : 0, phase = seed * 1.7;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = time;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            // Sway grows away from where the shape is held: from the top edge for hanging things,
            // from the bottom for things that grow.
            float reach = ${hang ? '1.0 - uv.y' : 'uv.y'};
            float w = reach * reach;
            transformed.x += (sin(uTime * 0.55 + ${phase.toFixed(2)} + reach * 1.3) * 0.05 + sin(uTime * 1.3 + ${phase.toFixed(2)} * 2.0) * 0.015) * w;
            transformed.y += sin(uTime * 0.8 + ${phase.toFixed(2)}) * 0.012 * w;`);
      };
      material.customProgramCacheKey = () => `foreground-${hang}-${seed}`;
      this.materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 1;
      mesh.frustumCulled = false;
      if (corner[0] > 0) mesh.scale.x = -1;
      this.group.add(mesh);
      this.pieces.push({ mesh, corner, size, depth, inset });
    }
    // Slow motes drifting close to the eye; the depth of field blooms them into soft discs.
    const count = 9, positions = new Float32Array(count * 3), seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) { positions.set([(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.8, -1.2 - Math.random() * 2.5], i * 3); seeds[i] = Math.random() * 100; }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    moteGeometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    this.geometries.push(moteGeometry);
    const moteMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.time },
      vertexShader: `uniform float uTime; attribute float seed; varying float vAlpha;
        void main(){
          vec3 p = position;
          p.x += sin(uTime * 0.07 + seed) * 0.6; p.y += sin(uTime * 0.05 + seed * 1.7) * 0.4 - mod(uTime * 0.02 + seed, 1.0) * 0.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vAlpha = pow(sin(uTime * 0.3 + seed) * 0.5 + 0.5, 4.0) * 0.08;
          gl_PointSize = clamp(60.0 / -mv.z, 3.0, 30.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: 'varying float vAlpha; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(0.85, 0.9, 0.86, (1.0 - d * d) * vAlpha); }',
    });
    this.materials.push(moteMaterial);
    this.motes = new THREE.Points(moteGeometry, moteMaterial);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 2;
    this.group.add(this.motes);
  }

  /** `dt` is already slowed by the hush, so the frame falls still with the rest of the wood. */
  update(dt: number, camera: THREE.PerspectiveCamera, reducedMotion: boolean): void {
    if (!reducedMotion) this.time.value += dt;
    if (camera.aspect !== this.aspect) {
      this.aspect = camera.aspect;
      for (const piece of this.pieces) {
        const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * piece.depth, halfW = halfH * camera.aspect;
        const [w, h] = piece.size;
        // Keep the shapes in the corners: only `inset` of each sits inside the frame.
        piece.mesh.scale.set(w * Math.sign(piece.mesh.scale.x || 1), h, 1);
        piece.mesh.position.set(piece.corner[0] * (halfW - w * (piece.inset[0] - 0.5)), piece.corner[1] * (halfH - h * (piece.inset[1] - 0.5)), -piece.depth);
      }
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const t of this.textures) t.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
