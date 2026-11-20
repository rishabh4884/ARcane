import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { INK } from './InkPaint.ts';

/**
 * THE INNER INK
 * ─────────────
 * The outline draws a figure's silhouette; an animator also inks inside it — the nose against the
 * cheek, the brow over the eye, an arm crossing the chest, the edge of a hood. This pass renders the
 * drawn figures' normals and depth on their own layer, finds where the surface folds sharply or one
 * part passes in front of another, and inks those edges at a drawn line weight, lighter with distance.
 */

/** Layer the drawn figures render on for the inner ink. */
export const INK_LAYER = 3;

export class InkEdgePass extends Pass {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  private readonly quad: FullScreenQuad;
  private readonly material: THREE.ShaderMaterial;

  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.Camera) {
    super();
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.target.depthTexture = new THREE.DepthTexture(1, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tNormal: { value: this.target.texture }, tDepth: { value: this.target.depthTexture },
        uTexel: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 200 },
        uInk: INK.uInk, uWeight: { value: 1.0 }, uDrawing: INK.uDrawing,
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tDiffuse; uniform sampler2D tNormal; uniform sampler2D tDepth;
        uniform vec2 uTexel; uniform float uNear; uniform float uFar; uniform vec3 uInk; uniform float uWeight; uniform float uDrawing;
        varying vec2 vUv;
        float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          float d0 = texture2D(tDepth, vUv).x;
          // Only where a drawn figure is (or borders one).
          vec2 o = uTexel * uWeight;
          float dc = viewZ(vUv);
          vec3 n0 = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
          float edge = 0.0;
          float figure = 0.0;
          for (int i = 0; i < 4; i++) {
            vec2 off = i == 0 ? vec2(o.x, 0.0) : i == 1 ? vec2(-o.x, 0.0) : i == 2 ? vec2(0.0, o.y) : vec2(0.0, -o.y);
            float dn = texture2D(tDepth, vUv + off).x;
            figure = max(figure, step(dn, 0.9999));
            vec3 n1 = texture2D(tNormal, vUv + off).xyz * 2.0 - 1.0;
            float zn = viewZ(vUv + off);
            // A fold: the surface turns sharply.
            float fold = smoothstep(0.35, 0.8, 1.0 - dot(n0, n1));
            // An overlap: one part in front of another (depth jumps relative to distance).
            float overlap = smoothstep(0.06, 0.16, abs(zn - dc) / max(dc, 0.5));
            edge = max(edge, max(fold, overlap) * step(d0, 0.9999) * step(dn, 0.9999));
          }
          // Lines lighten with distance and break a little, like ink on a brush.
          float fade = 1.0 - smoothstep(14.0, 45.0, dc);
          float broken = 0.75 + 0.25 * h(floor(vUv / uTexel / 3.0) + uDrawing);
          gl_FragColor = vec4(mix(base.rgb, uInk, edge * fade * broken * 0.85), base.a);
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
    this.needsSwap = true;
  }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    this.material.uniforms.uTexel.value.set(1 / width, 1 / height);
    this.material.uniforms.uWeight.value = Math.max(1, height / 1080);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const cam = this.camera as THREE.PerspectiveCamera;
    const mask = cam.layers.mask;
    const override = this.scene.overrideMaterial;
    const background = this.scene.background;
    const fog = this.scene.fog;
    const clear = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    cam.layers.set(INK_LAYER);
    this.scene.overrideMaterial = this.normalMaterial;
    this.scene.background = null;
    this.scene.fog = null;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x8080ff, 1);
    renderer.clear();
    renderer.render(this.scene, cam);
    renderer.setClearColor(clear, clearAlpha);
    cam.layers.mask = mask;
    this.scene.overrideMaterial = override;
    this.scene.background = background;
    this.scene.fog = fog;
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.uNear.value = cam.near;
    this.material.uniforms.uFar.value = cam.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.target.dispose();
    this.normalMaterial.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
