import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * CEL LIGHT
 * ─────────
 * Spells are made of light, and an effects animator draws light as shapes: a hard bright core, a
 * flat band of colour around it, a fainter band beyond, then nothing. Every additive glow a spell
 * makes (its ribbons, domes, bolts, halos) is moved to its own layer; this pass renders that light,
 * hidden behind whatever stands in front of it, into its own buffer, cuts it into those bands, keeps
 * only a whisper of the soft falloff, and adds it back over the frame. The bloom that follows lays the
 * soft halo of digital compositing around the hard cores. With no spell in the air it does nothing.
 */

/** Layer the spells' additive light renders on. */
export const CEL_LIGHT_LAYER = 5;

export class CelLightPass extends Pass {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  private readonly quad: FullScreenQuad;
  private readonly material: THREE.ShaderMaterial;
  private readonly layers = new THREE.Layers();
  private readonly hidden: THREE.Object3D[] = [];

  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.Camera) {
    super();
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tLight: { value: this.target.texture } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform sampler2D tLight;
        varying vec2 vUv;
        float band(float l, float at, float w) { return smoothstep(at - w, at + w, l); }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec3 light = texture2D(tLight, vUv).rgb;
          float l = max(light.r, max(light.g, light.b));
          vec3 hue = light / max(l, 1e-4);
          float w = max(fwidth(l) * 0.75, 0.004);
          // The body of the light and its hot core are cut into flat bands; faint light (halos,
          // washes) stays soft and quiet, as an animator would airbrush it.
          float body = band(l, 0.38, w);
          float core = band(l, 0.6, w);
          vec3 cel = hue * (body * 0.3 + core * 0.55) * 1.15;
          cel = mix(cel, vec3(1.0), band(l, 0.85, w) * 0.5);
          vec3 soft = light * mix(0.62, 0.15, body);
          gl_FragColor = vec4(base.rgb + cel + soft, base.a);
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
    this.layers.set(CEL_LIGHT_LAYER);
    this.enabled = false;           // the world enables it while spell light is in the air
  }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const camLayers = this.camera.layers.mask;
    const background = this.scene.background;
    const override = this.scene.overrideMaterial;
    const clear = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;     // the light must land on the depth laid down before it
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    this.scene.background = null;
    // What stands in front hides the light: lay down the depth of everything solid first (not the
    // mist, the halos or the particles, which light passes through).
    this.scene.traverseVisible((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if ((o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite || (m && !Array.isArray(m) && (m.transparent || !m.depthWrite))) this.hidden.push(o);
    });
    for (const o of this.hidden) o.visible = false;
    this.scene.overrideMaterial = this.depthOnly;
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = override;
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
    // Then only the spells' light.
    this.camera.layers.mask = this.layers.mask;
    renderer.render(this.scene, this.camera);
    this.camera.layers.mask = camLayers;
    this.scene.background = background;
    renderer.setClearColor(clear, alpha);
    renderer.autoClear = autoClear;
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.tLight.value = this.target.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.depthOnly.dispose();
    this.quad.dispose();
  }
}

/** Move a spell's additive light onto the cel-light layer; returns how many things it moved or found. */
export function tagSpellLight(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    const additive = Array.isArray(m) ? m.some((x) => x.blending === THREE.AdditiveBlending) : m.blending === THREE.AdditiveBlending;
    if (!additive) return;
    if (!o.layers.isEnabled(CEL_LIGHT_LAYER) || o.layers.isEnabled(0)) o.layers.set(CEL_LIGHT_LAYER);
    if (o.visible) n++;
  });
  return n;
}
