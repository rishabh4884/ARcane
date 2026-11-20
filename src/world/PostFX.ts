import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { InkEdgePass } from './render/InkEdgePass.ts';

/**
 * Depth of field, the way a painted 2D world stages depth: the playing ground stays crisp, the
 * leaves and grass right in front of the eye melt into soft dark shapes, and the far wood goes
 * soft into its own haze. A 16-tap golden-angle gather; each tap's own blur limits how far it can
 * reach, so a sharp spirit never smears over the blurred trees behind it.
 */
const DepthOfFieldShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uNear: { value: 0.15 },
    uFar: { value: 240 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uMaxRadius: { value: 6 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    #include <packing>
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform float uNear; uniform float uFar; uniform vec2 uResolution; uniform float uMaxRadius;
    varying vec2 vUv;
    float viewDepth(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    // 0 = sharp, 1 = fully soft. Near: only the foreground frame (a spirit at striking distance stays
    // crisp). Far: the deep wood.
    float blurAmount(float d){ return max(1.0 - smoothstep(0.7, 1.6, d), smoothstep(70.0, 140.0, d) * 0.35); }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      float coc = blurAmount(viewDepth(vUv));
      if (coc < 0.02) { gl_FragColor = base; return; }
      vec2 px = uMaxRadius / uResolution;
      vec3 sum = base.rgb; float total = 1.0;
      for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / 16.0) * coc;
        float a = fi * 2.39996323;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * r * px;
        float tapCoc = blurAmount(viewDepth(uv));
        // A sharper tap may not bleed into a softer neighbour beyond its own blur.
        float w = smoothstep(r - 0.15, r + 0.05, max(tapCoc, coc * 0.35));
        sum += texture2D(tDiffuse, uv).rgb * w; total += w;
      }
      gl_FragColor = vec4(sum / total, base.a);
    }`,
};

/**
 * Display-space grade: a soft highlight shoulder, cool shadows and warm highlights, a little
 * light from above, a slow projector flicker, an oval vignette and grain at film rate. During a
 * hush the frame dims a touch and the vignette closes in.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.5 },
    uGrain: { value: 0.045 },
    uAspect: { value: 1 },
    uHush: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uSat: { value: 1 },
    uExposure: { value: 1 },
    uDark: { value: 0 },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    /** 1 in the authored world: no lens fringe or projector flicker, lighter grain and vignette. */
    uAuthored: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; uniform float uAspect; uniform float uHush;
    uniform vec3 uTint; uniform vec3 uLift; uniform float uSat; uniform float uExposure; uniform float uDark; uniform vec2 uTexel;
    uniform float uAuthored;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 shoulder(vec3 c){
      // Values above 0.82 roll off smoothly instead of clipping; the painted world below is untouched.
      vec3 over = max(c - 0.82, 0.0);
      return min(c, vec3(0.82)) + 0.18 * (1.0 - exp(-over / 0.18));
    }
    void main(){
      // A lens's faint colour fringe toward the edges of the frame.
      vec2 fromCentre = vUv - 0.5;
      float edge2 = dot(fromCentre, fromCentre);
      vec2 ca = fromCentre * edge2 * 0.012 * (1.0 - uAuthored);
      vec3 c = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
      // A light unsharp mask: fine detail in skin, bark and grass reads crisply.
      vec3 blur = (texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
                 + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb) * 0.25;
      c = max(c + (c - blur) * mix(0.35, 0.18, uAuthored), 0.0);
      // Chapter mood: a tint and lift over the painted world, its saturation, and the King's darkness.
      c = c * uTint * uExposure + uLift;
      float l0 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l0), c, uSat);
      c *= 1.0 - uDark * 0.6;
      c = shoulder(c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Split tone: moonlit teal in the shadows, lantern amber in the highlights.
      c += mix(vec3(-0.004, 0.006, 0.014), vec3(0.018, 0.008, -0.01), smoothstep(0.15, 0.7, l));
      // Light comes from above: the top of the frame is a breath lighter, as if through haze.
      c += vec3(0.016, 0.022, 0.024) * smoothstep(0.45, 1.0, vUv.y) * (1.0 - l);
      // A slow, uneven flicker, like an old projector lamp.
      float flicker = 1.0 + (sin(uTime * 1.7) * 0.5 + sin(uTime * 4.3 + 1.3) * 0.3 + sin(uTime * 11.0) * 0.2) * 0.008 * (1.0 - uAuthored);
      c *= flicker * (1.0 - uHush * 0.07);
      vec2 q = (vUv - 0.5) * vec2(uAspect * 0.85, 1.0);
      float v = smoothstep(0.3 - uHush * 0.05, 1.0, length(q) * 1.18);
      c *= 1.0 - v * (uVignette * mix(1.0, 0.45, uAuthored) + uHush * 0.12 + uDark * 0.4);
      // Grain at 24 frames a second, heavier in the shadows.
      float frame = floor(uTime * 24.0);
      c += (hash(vUv * vec2(1931.0, 1543.0) + fract(frame * 0.1731)) - 0.5) * uGrain * mix(1.0, 0.45, uAuthored) * (1.0 - l * 0.7);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

/**
 * Depth of field, bloom (half resolution) and a grade pass. Additive spells and lanterns bloom;
 * the painted, untonemapped scenery passes through unchanged below the highlight shoulder.
 */
export class PostFX {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly depthOfField: ShaderPass;
  private readonly grade: ShaderPass;
  private enabledFlag: boolean;
  private time = 0;

  private readonly ink: InkEdgePass | null = null;

  constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, enabled = true, authored = false, drawn = false) {
    // The scene renders into a target that keeps its depth, so the depth of field can read it.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    // Drawn figures: ink the folds and overlaps inside their silhouettes.
    if (drawn) { this.ink = new InkEdgePass(scene, camera); this.composer.addPass(this.ink); }
    // No depth of field: the playing ground and every figure on it stay crisp at any distance.
    // The near frame carries its own softness, painted into its textures.
    this.depthOfField = new ShaderPass(DepthOfFieldShader);
    this.depthOfField.uniforms.uNear.value = camera.near;
    this.depthOfField.uniforms.uFar.value = camera.far;
    // Bloom softens only what is genuinely bright: in the authored world, emissives and magic.
    this.bloom = authored ? new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.45, 0.95) : new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.5, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // Edge anti-aliasing in display space: the post path bypasses the canvas's own MSAA, and SMAA
    // keeps silhouettes clean without softening the painting inside them.
    this.composer.addPass(new SMAAPass());
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uAuthored.value = authored ? 1 : 0;
    this.composer.addPass(this.grade);
    this.enabledFlag = enabled;
  }

  get enabled(): boolean { return this.enabledFlag; }

  setEnabled(enabled: boolean): void { this.enabledFlag = enabled; }

  /** Chapter grade: tint, lift, saturation and exposure (eased by the caller). */
  setGrade(tint: THREE.Vector3, lift: THREE.Vector3, saturation: number, exposure: number, vignette: number): void {
    const u = this.grade.uniforms;
    u.uTint.value.copy(tint); u.uLift.value.copy(lift); u.uSat.value = saturation; u.uExposure.value = exposure; u.uVignette.value = vignette;
  }

  /** 0 … 1 the King's devouring darkness. */
  setDark(amount: number): void { this.grade.uniforms.uDark.value = amount; }

  /** 0 normal … 1 the whole wood holding its breath. */
  setHush(amount: number): void { this.grade.uniforms.uHush.value = amount; }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.ink?.setSize(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
    // Bloom is a blur: half resolution is indistinguishable and a quarter of the cost.
    this.bloom.setSize(Math.max(1, Math.round(width * pixelRatio * 0.5)), Math.max(1, Math.round(height * pixelRatio * 0.5)));
    this.grade.uniforms.uAspect.value = width / Math.max(1, height);
    this.grade.uniforms.uTexel.value.set(1 / Math.max(1, width * pixelRatio), 1 / Math.max(1, height * pixelRatio));
    this.depthOfField.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
    // Blur radius in pixels follows the frame size, so the softness looks the same at any resolution.
    this.depthOfField.uniforms.uMaxRadius.value = Math.max(3, height * pixelRatio / 150);
  }

  render(dt: number, scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabledFlag) {
      this.renderer.render(scene, camera);
      return;
    }
    this.time += dt;
    this.grade.uniforms.uTime.value = this.time;
    this.composer.render(dt);
  }

  dispose(): void {
    this.ink?.dispose();
    this.bloom.dispose();
    this.composer.dispose();
  }
}
