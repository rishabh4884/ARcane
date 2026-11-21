import * as THREE from 'three';
import { SPELL_LIGHT_GLSL, SPELL_LIGHTS } from '../LanternLighting.ts';
import { FIGURE_LIGHT } from '../rig/figureMaterial.ts';
import { INK, INK_NOISE } from './InkPaint.ts';
import { INK_LAYER } from './InkEdgePass.ts';

/**
 * DRAWN PROPS
 * ───────────
 * Everything built in three.js for a scene — Tuck's stump, lantern-flowers, butterflies, a fallen
 * log, the bower, the root throne — is drawn in the same ink and paint as the cast: its colour in
 * three flat bands (lit, mid, cool shade) with brush-broken edges, a silver rim where it turns toward
 * the moon, ink along its edges (the edge pass), and the same air as everything at its distance. What
 * glows keeps its glow. Effects that are already drawn (shader materials, sprites, points) are left
 * alone.
 */

const converted = new WeakMap<THREE.Material, THREE.Material>();

function glowing(m: THREE.Material): boolean {
  const any = m as THREE.MeshBasicMaterial & THREE.MeshStandardMaterial;
  if (m.blending === THREE.AdditiveBlending) return true;
  if ((m as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    const c = any.color;
    return any.toneMapped === false || (c && c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722 > 0.62);
  }
  return false;
}

function inkPropMaterial(source: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial): THREE.ShaderMaterial {
  const s = source as THREE.MeshStandardMaterial;
  const emissive = s.emissive ? s.emissive.clone().multiplyScalar(s.emissiveIntensity ?? 1) : new THREE.Color(0, 0, 0);
  const m = new THREE.ShaderMaterial({
    defines: { PROP_MAP: s.map ? 1 : 0 },
    vertexColors: !!s.vertexColors,
    transparent: s.transparent,
    depthWrite: s.depthWrite,
    side: s.side,
    uniforms: {
      uColor: { value: s.color ? s.color.clone() : new THREE.Color(1, 1, 1) },
      tMap: { value: s.map ?? null },
      uEmissive: { value: emissive },
      uOpacity: { value: s.opacity ?? 1 },
      ...INK,
      uAir: FIGURE_LIGHT.uAir,
      ...SPELL_LIGHTS,
    },
    vertexShader: /* glsl */`
      varying vec3 vNormalW; varying vec3 vWorld; varying vec2 vUv; varying vec3 vTint;
      void main() {
        vec4 w = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          w = instanceMatrix * w;
          n = mat3(instanceMatrix) * n;
        #endif
        w = modelMatrix * w;
        vWorld = w.xyz;
        vNormalW = normalize(mat3(modelMatrix) * n);
        vUv = uv;
        vTint = vec3(1.0);
        #ifdef USE_COLOR
          vTint = color.rgb;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vTint *= instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform sampler2D tMap; uniform vec3 uEmissive; uniform float uOpacity;
      uniform vec3 uFillDir; uniform vec3 uMoonDir; uniform vec3 uLitColor; uniform vec3 uMidColor; uniform vec3 uShadeColor; uniform vec3 uRimColor;
      uniform float uDrawing; uniform vec3 uAir; uniform float uPaintedAir;
      varying vec3 vNormalW; varying vec3 vWorld; varying vec2 vUv; varying vec3 vTint;
      ${SPELL_LIGHT_GLSL}
      ${INK_NOISE}
      void main() {
        vec3 base = uColor * vTint;
        #if PROP_MAP
          base *= texture2D(tMap, vUv, 1.2).rgb;
        #endif
        vec3 n = normalize(vNormalW);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        // The brush, stuck to the thing: every band edge broken into painted strokes.
        float brush = ipFbm(vWorld * 2.6) - 0.5;
        float t = dot(n, uFillDir) * 0.5 + 0.5 + brush * 0.15;
        float aa = max(fwidth(t), 0.002);
        float lit = smoothstep(0.5 - aa * 1.5, 0.5 + aa * 1.5, t);
        float top = smoothstep(0.8 - aa * 1.5, 0.8 + aa * 1.5, t + brush * 0.08);
        vec3 col = mix(base * uShadeColor, mix(base * uMidColor, base * uLitColor, top), lit);
        float facing = clamp(dot(n, V), 0.0, 1.0);
        float rim = smoothstep(0.5, 0.56, (1.0 - facing) * clamp(dot(n, uMoonDir) * 0.8 + 0.45, 0.0, 1.0));
        col = mix(col, base * 0.35 + uRimColor * 0.62, rim * 0.6);
        col += base * spellIllumination(vWorld) * 1.2;
        col += uEmissive;
        float dist = length(vWorld - cameraPosition);
        float air = mix((1.0 - exp(-dist * 0.018)) * 0.4, (1.0 - exp(-max(dist - 8.0, 0.0) / 62.0)) * 0.92, uPaintedAir);
        col = mix(col, uAir, clamp(air, 0.0, 0.88) * (1.0 - min(1.0, length(uEmissive))));
        gl_FragColor = vec4(col, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  m.name = `${source.name || source.type} (drawn)`;
  return m;
}

function convert(material: THREE.Material): THREE.Material {
  const done = converted.get(material);
  if (done) return done;
  const kind = material as THREE.Material & { isMeshStandardMaterial?: boolean; isMeshBasicMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean };
  const convertible = kind.isMeshStandardMaterial || kind.isMeshBasicMaterial || kind.isMeshLambertMaterial || kind.isMeshPhongMaterial;
  if (!convertible || glowing(material)) { converted.set(material, material); return material; }
  const drawn = inkPropMaterial(material as THREE.MeshStandardMaterial);
  converted.set(material, drawn);
  converted.set(drawn, drawn);
  return drawn;
}

/** Draw every built prop under `root` in ink and paint (idempotent). */
export function drawn<T extends THREE.Object3D>(root: T): T {
  const replaced = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || o.userData.keepLit) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((m) => { const c = convert(m); if (c !== m) replaced.add(m); return c; });
    if (next.some((c, i) => c !== mats[i])) {
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
      mesh.layers.enable(INK_LAYER);
    }
  });
  // The lit originals are no longer drawn anywhere this prop is.
  for (const m of replaced) m.dispose();
  return root;
}
