import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** Display-space grade: soft highlight shoulder, cool shadows / warm highlights, vignette, fine grain. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.035 },
    uAspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; uniform float uAspect;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 shoulder(vec3 c){
      // Values above 0.82 roll off smoothly instead of clipping; the painted world below is untouched.
      vec3 over = max(c - 0.82, 0.0);
      return min(c, vec3(0.82)) + 0.18 * (1.0 - exp(-over / 0.18));
    }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = shoulder(c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Split tone: moonlit teal in the shadows, lantern amber in the highlights.
      c += mix(vec3(-0.004, 0.006, 0.014), vec3(0.018, 0.008, -0.01), smoothstep(0.15, 0.7, l));
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      float v = smoothstep(0.35, 1.05, length(q) * 1.15);
      c *= 1.0 - v * uVignette;
      c += (hash(vUv * vec2(1931.0, 1543.0) + fract(uTime * 7.3)) - 0.5) * uGrain * (1.0 - l * 0.6);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

/**
 * Bloom (half resolution) plus a grade pass. Additive spells and lanterns bloom; the painted,
 * untonemapped scenery passes through unchanged below the highlight shoulder.
 */
export class PostFX {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  private enabledFlag: boolean;
  private time = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, enabled = true) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.5, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.enabledFlag = enabled;
  }

  get enabled(): boolean { return this.enabledFlag; }

  setEnabled(enabled: boolean): void { this.enabledFlag = enabled; }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    // Bloom is a blur: half resolution is indistinguishable and a quarter of the cost.
    this.bloom.setSize(Math.max(1, Math.round(width * pixelRatio * 0.5)), Math.max(1, Math.round(height * pixelRatio * 0.5)));
    this.grade.uniforms.uAspect.value = width / Math.max(1, height);
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
    this.bloom.dispose();
    this.composer.dispose();
  }
}
