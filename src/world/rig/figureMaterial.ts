import * as THREE from 'three';
import { SPELL_LIGHT_GLSL, SPELL_LIGHTS } from '../LanternLighting.ts';

/**
 * THE FIGURE SHADER
 * ─────────────────
 * One material for every creature, gnome, boss and hand. It lights a sculpted body the way a night
 * scene is lit on film: the moon behind the wood (a cold rim wrapping the silhouette), the caster's
 * glow in front (a soft key that reads the form), sky and dark ground for ambient, and contact
 * occlusion baked where parts meet so joins crease instead of floating.
 *
 * Surfaces are textured procedurally in the rest pose, so detail sticks to the body as it moves and
 * stays sharp at any distance: each surface has its own albedo pattern and its own micro-relief,
 * applied as a bump map from screen-space derivatives (skin pores and wrinkles, bark furrows, cloth
 * weave and folds, bone cracks, fur and hair strands, moss clumps, chitin plates, wing veins). Skin,
 * ears, leaves and membranes let light through at the terminator and from behind; cloth and fur
 * carry a soft sheen; chitin, bone, eyes and metal take a sharp highlight. Feet sink into the ground
 * mist, spells light the figure, frost glazes it, hits flash it, and death burns it away from the top.
 */
export interface FigureUniforms {
  uTime: { value: number };
  uDissolve: { value: number };
  uEdge: { value: THREE.Color };
  uFlash: { value: number };
  uFlashColor: { value: THREE.Color };
  uFrost: { value: number };
  uGroundY: { value: number };
  uMist: { value: number };
  uHeight: { value: number };
  uEyeColor: { value: THREE.Color };
  uEyes: { value: number };
  /** Cloth: amplitude (m), top of the hanging region, bottom (model space), sideways drag. */
  uCloth: { value: THREE.Vector4 };
  uOpacity: { value: number };
  /** Multiplier on the whole figure's light (cutscene staging, the hush). */
  uExposure: { value: number };
}

const MOON = new THREE.Vector3(-0.34, 0.45, -0.82).normalize();
const FILL = new THREE.Vector3(0.42, 0.62, 0.66).normalize();

/** Region lighting shared by every figure (set when the wood changes around the caster). */
export const FIGURE_LIGHT = {
  uMoonColor: { value: new THREE.Color('#a9cadc') },
  uFillColor: { value: new THREE.Color('#dcc6a2') },
  uSky: { value: new THREE.Color('#30444a') },
  uGround: { value: new THREE.Color('#151c18') },
  uRim: { value: new THREE.Color('#a6d6d6') },
  uAir: { value: new THREE.Color('#26302f') },
};

export function figureMaterial(edge = new THREE.Color('#ffb066')): { material: THREE.ShaderMaterial; u: FigureUniforms } {
  const u: FigureUniforms = {
    uTime: { value: 0 },
    uDissolve: { value: 0 },
    uEdge: { value: edge },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#fff2d8') },
    uFrost: { value: 0 },
    uGroundY: { value: 0 },
    uMist: { value: 0.55 },
    uHeight: { value: 2 },
    uEyeColor: { value: new THREE.Color('#d8f27a') },
    uEyes: { value: 1 },
    uCloth: { value: new THREE.Vector4(0, 0, 1, 0) },
    uOpacity: { value: 1 },
    uExposure: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMoon: { value: MOON }, uFill: { value: FILL } }]),
    vertexColors: true,
    fog: true,
    side: THREE.DoubleSide,
    transparent: false,
    vertexShader: /* glsl */`
      #include <common>
      #include <skinning_pars_vertex>
      #include <fog_pars_vertex>
      attribute vec2 aSurf;
      attribute float aAO;
      attribute float aCurv;
      uniform float uTime;
      uniform vec4 uCloth;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vRest;
      varying vec2 vSurf;
      varying float vAO;
      varying float vCurv;
      void main() {
        vColor = color;
        vCurv = aCurv;
        vSurf = aSurf;
        vRest = position;
        vAO = aAO;
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        // Cloth and hair hang: slow overlapping waves that grow toward the free edge.
        if ((aSurf.x > 1.5 && aSurf.x < 2.5) || (aSurf.x > 10.5 && aSurf.x < 11.5) || aSurf.x > 13.5) {
          float hang = clamp((uCloth.y - position.y) / max(uCloth.y - uCloth.z, 0.001), 0.0, 1.0);
          float w = hang * hang * uCloth.x;
          float t = uTime;
          vec3 q = position;
          float wave = sin(t * 1.1 + q.y * 3.1 + q.x * 2.3) * 0.55 + sin(t * 0.63 - q.y * 5.3 + q.z * 3.7 + 1.7) * 0.3 + sin(t * 2.1 + q.x * 9.0 - q.y * 7.0) * 0.15;
          transformed.x += wave * w;
          transformed.z += (sin(t * 0.8 + q.x * 4.1 + q.y * 2.3) * 0.6 * w) - uCloth.w * hang * hang;
        }
        #include <skinning_vertex>
        #include <project_vertex>
        #include <fog_vertex>
        vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vNormalW = normalize(mat3(modelMatrix) * objectNormal);
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uMoon; uniform vec3 uFill; uniform vec3 uMoonColor; uniform vec3 uFillColor;
      uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uRim; uniform vec3 uAir;
      uniform float uTime; uniform float uDissolve; uniform vec3 uEdge; uniform float uFlash; uniform vec3 uFlashColor;
      uniform float uFrost; uniform float uGroundY; uniform float uMist; uniform float uHeight;
      uniform vec3 uEyeColor; uniform float uEyes; uniform float uOpacity; uniform float uExposure;
      varying vec3 vColor; varying vec3 vWorld; varying vec3 vNormalW; varying vec3 vRest; varying vec2 vSurf; varying float vAO; varying float vCurv;
      ${SPELL_LIGHT_GLSL}
      float h31(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float vnoise(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
      // Cellular noise for scales, plates and pores.
      float cells(vec3 p) {
        vec3 i = floor(p), f = fract(p); float d = 1.0;
        for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
          vec3 o = vec3(float(x), float(y), float(z));
          vec3 r = o + vec3(h31(i + o), h31(i + o + 17.0), h31(i + o + 31.0)) - f;
          d = min(d, dot(r, r));
        }
        return sqrt(d);
      }
      // Bump mapping from screen-space derivatives: tilts the normal by the slope of a height field.
      vec3 bump(vec3 n, vec3 pos, float h) {
        vec3 dpdx = dFdx(pos), dpdy = dFdy(pos);
        float dhdx = dFdx(h), dhdy = dFdy(h);
        vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
        float det = dot(dpdx, r1);
        vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
        return normalize(abs(det) * n - grad);
      }
      void main() {
        float sid = floor(vSurf.x + 0.5);
        float glow = vSurf.y;
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 n = normalize(vNormalW);
        if (!gl_FrontFacing) n = -n;
        float dist = length(vWorld - cameraPosition);
        // Fine relief fades with distance so it never shimmers.
        float near = 1.0 - smoothstep(6.0, 30.0, dist);
        vec3 p = vRest;
        vec3 base = vColor;
        float h = 0.0, spec = 0.0, rough = 0.6, sss = 0.0, sheen = 0.0, trans = 0.0, cavity = 1.0;
        vec3 emit = vec3(0.0);
        float rimK = 1.0;
        vec3 sssColor = vec3(0.9, 0.35, 0.25);
        if (sid < 0.5) {                       // skin: mottled, pored, creased
          float mott = fbm(p * 13.0);
          base *= 0.84 + 0.3 * mott;
          base = mix(base, base * vec3(1.14, 0.88, 0.84), smoothstep(0.55, 0.8, fbm(p * 3.3)) * 0.55);
          float pores = cells(p * 140.0);
          float creases = 1.0 - abs(fbm(p * vec3(9.0, 26.0, 9.0)) * 2.0 - 1.0);
          h = (pores * 0.0006 - pow(creases, 6.0) * 0.0018 + mott * 0.0012) * near;
          cavity = 0.92 + 0.08 * pores;
          spec = 0.22; rough = 0.45; sss = 0.55;
        } else if (sid < 1.5) {                // bark: deep furrows along the grain, plates between
          float g = fbm(vec3(p.x * 11.0, p.y * 1.7, p.z * 11.0));
          float furrow = smoothstep(0.32, 0.6, g);
          float plates = cells(vec3(p.x * 9.0, p.y * 3.0, p.z * 9.0));
          cavity = mix(0.38, 1.1, furrow) * (0.85 + 0.2 * plates);
          base *= cavity * (0.86 + 0.24 * fbm(p * 26.0));
          base = mix(base, base * vec3(0.8, 1.0, 0.72), smoothstep(0.62, 0.85, fbm(p * 5.0 + 9.0)) * 0.5);
          h = (furrow * 0.008 + plates * 0.003 + fbm(p * 60.0) * 0.0015) * (0.4 + 0.6 * near);
          rough = 0.9;
        } else if (sid < 2.5) {                // cloth: folds that fall with the fabric, weave, wear
          // Folds wander and fade in and out: fabric, not stripes.
          float fold = (sin(atan(p.x, p.z) * 7.0 + fbm(p * 2.2) * 9.0 + p.y * 3.0) * 0.5 + 0.5) * smoothstep(0.25, 0.75, fbm(p * 1.6 + 4.0));
          float weave = sin(p.x * 900.0) * sin(p.y * 900.0) * 0.5 + 0.5;
          cavity = 0.8 + 0.25 * fold;
          base *= cavity * (0.9 + 0.12 * vnoise(p * 140.0));
          base *= 1.0 - smoothstep(0.65, 0.95, fbm(p * 7.0)) * 0.25;
          h = (fold * 0.007 + weave * 0.0002 * near + fbm(p * 30.0) * 0.001) * (0.5 + 0.5 * near);
          sheen = 0.45; rough = 0.85;
        } else if (sid < 3.5) {                // bone: polished ridges, cracks, old stains
          float crack = 1.0 - smoothstep(0.0, 0.035, abs(fbm(p * 7.0) - 0.5));
          base *= (0.9 + 0.14 * fbm(p * 16.0)) * (1.0 - crack * 0.55);
          base = mix(base, base * vec3(0.7, 0.6, 0.48), smoothstep(0.5, 0.75, fbm(p * 4.0 + 3.0)) * 0.55);
          h = (-crack * 0.0025 + fbm(p * 22.0) * 0.0012) * near;
          spec = 0.45; rough = 0.35; sss = 0.15; sssColor = vec3(0.8, 0.6, 0.4);
        } else if (sid < 4.5) {                // metal: hammered, scratched, tarnished
          base *= 0.75 + 0.35 * fbm(p * 34.0);
          h = (cells(p * 40.0) * 0.0008 + vnoise(vec3(p.x * 400.0, p.y * 6.0, p.z * 400.0)) * 0.0002) * near;
          spec = 1.0; rough = 0.25;
        } else if (sid < 5.5) {                // fur: clumped strands
          float s = vnoise(vec3(p.x * 80.0, p.y * 10.0, p.z * 80.0));
          float clump = fbm(p * 18.0);
          base *= 0.62 + 0.55 * s * (0.7 + 0.5 * clump);
          h = (s * 0.003 + clump * 0.004) * near;
          sheen = 0.6; rough = 0.9;
        } else if (sid < 6.5) {                // moss: soft clumps, lighter at their tips
          float c = fbm(p * 18.0);
          float tufts = 1.0 - cells(p * 55.0);
          base *= 0.58 + 0.75 * c;
          base = mix(base, base * vec3(0.9, 1.25, 0.7), c * 0.6 + tufts * 0.2);
          h = (c * 0.008 + tufts * 0.002) * near;
          sheen = 0.3; sss = 0.25; sssColor = vec3(0.5, 0.8, 0.3);
        } else if (sid < 7.5) {
        } else if (sid < 8.5) {                // leaf: veins and translucency
          float vein = 1.0 - smoothstep(0.0, 0.05, abs(fract(p.y * 18.0 + abs(p.x) * 12.0) - 0.5));
          base *= 0.85 + 0.25 * vein;
          h = -vein * 0.0008 * near;
          trans = 0.55; sss = 0.4; sssColor = vec3(0.6, 0.9, 0.3);
        } else if (sid < 9.5) {                // stone: facets, speckle, lichen
          float f = cells(p * 6.0);
          base *= 0.74 + 0.3 * fbm(p * 9.0) + 0.12 * step(0.93, h31(floor(p * 60.0)));
          base = mix(base, vec3(0.42, 0.5, 0.3), smoothstep(0.6, 0.8, fbm(p * 4.0 + 5.0)) * 0.4);
          h = (f * 0.012 + fbm(p * 40.0) * 0.002) * (0.5 + 0.5 * near);
          rough = 0.95;
        } else if (sid < 10.5) {               // membrane: veined, dusty, glowing when backlit
          float vein = 1.0 - smoothstep(0.0, 0.06, abs(sin(atan(p.y - 1.0, p.x) * 14.0 + fbm(p * 3.0) * 2.0)));
          base *= (1.0 - vein * 0.45) * (0.85 + 0.25 * fbm(p * 30.0));
          h = vein * 0.0012 * near;
          trans = 0.9; sss = 0.3; sssColor = vec3(0.8, 0.6, 0.5); sheen = 0.25;
        } else if (sid < 11.5) {               // hair and beards: long strands with a sheen
          float s = vnoise(vec3(p.x * 110.0, p.y * 5.0, p.z * 110.0));
          base *= 0.7 + 0.45 * s;
          h = s * 0.0025 * near;
          spec = 0.3; rough = 0.4; sheen = 0.5;
        } else if (sid < 12.5) {               // hollows: mouths, sockets
          base *= 0.55;
        } else if (sid < 13.5) {               // chitin: overlapping glossy plates
          float plate = cells(p * 12.0);
          base *= 0.82 + 0.28 * fbm(p * 20.0);
          h = (smoothstep(0.2, 0.6, plate) * 0.003) * near;
          spec = 0.75; rough = 0.3;
        } else if (sid < 14.5) {               // fabric: draped, so the folds are real; weave, slubs, wear
          float twill = sin((p.x + p.z) * 520.0 + p.y * 520.0) * 0.5 + 0.5;
          float slub = vnoise(vec3(p.x * 30.0, p.y * 220.0, p.z * 30.0));
          float wear = smoothstep(0.62, 0.9, fbm(p * 5.0 + 2.0));
          base *= (0.86 + 0.1 * twill * near + 0.12 * slub) * (1.0 - wear * 0.22);
          base = mix(base, base * vec3(1.06, 1.0, 0.92) + 0.01, wear * 0.4);
          h = (twill * 0.00025 + slub * 0.0006) * near;
          sheen = 0.4; rough = 0.8; rimK = 0.4;
          // Living cloth: faint motes and threads of swallowed light drifting up through the weave.
          if (glow > 0.0) {
            float drift = fbm(vec3(p.x * 2.6, p.y * 1.1 - uTime * 0.11, p.z * 2.6));
            float vein = (1.0 - smoothstep(0.0, 0.012, abs(drift - 0.52))) * smoothstep(0.55, 0.75, fbm(p * 0.9 + vec3(0.0, uTime * 0.05, 0.0)));
            vec3 cellP = p * 30.0 + vec3(0.0, -uTime * 0.5, 0.0);
            float mote = step(0.985, h31(floor(cellP))) * (1.0 - smoothstep(0.1, 0.42, length(fract(cellP) - 0.5)));
            float breath = 0.6 + 0.4 * sin(uTime * 0.7 + p.y * 1.3 + h31(floor(cellP)) * 6.28);
            emit = vec3(0.62, 0.74, 1.0) * (vein * 0.18 + mote * 2.2 * breath) * glow;
          }
        } else {                               // thread: embroidery in metal thread, scrolling vines
          float ang = atan(p.x, p.z);
          vec2 q = vec2(ang * 20.0, p.y * 26.0);
          float scroll = abs(sin(q.x) * cos(q.y * 0.9 + sin(q.x * 0.5) * 1.4) + 0.4 * sin(q.x * 2.2 + q.y * 1.1));
          float motif = smoothstep(0.5, 0.58, scroll) * (1.0 - smoothstep(0.86, 0.95, scroll));
          float stitch = sin((q.x * 3.0 + q.y * 3.0) * 30.0) * 0.5 + 0.5;
          float tarnish = smoothstep(0.5, 0.85, fbm(p * 6.0));
          vec3 ground = base * vec3(0.22, 0.18, 0.2);
          vec3 gold = base * (1.05 + 0.25 * stitch) * (1.0 - tarnish * 0.35);
          base = mix(ground, gold, motif);
          h = (motif * 0.0018 + stitch * motif * 0.0003) * near;
          spec = mix(0.1, 1.0, motif); rough = mix(0.8, 0.3, motif); sheen = 0.3;
          if (glow > 0.0) emit = base * motif * glow * (0.55 + 0.45 * sin(uTime * 0.9 - q.x * 0.35)) * 1.6;
        }
        // Baked curvature: wear on the edges a hand or the weather would catch, dirt in the creases.
        float wearMask = smoothstep(0.35, 0.62, fbm(p * 19.0 + 3.0) + 0.12);
        float edge = smoothstep(0.1, 0.6, vCurv) * wearMask;
        float crev = smoothstep(0.05, 0.55, -vCurv);
        vec3 grey = vec3(dot(base, vec3(0.3, 0.59, 0.11)));
        if (sid > 0.5 && sid < 1.5) {          // bark weathers silver on its ridges, black in its splits
          base = mix(base, mix(grey, base, 0.45) * 1.9 + 0.022, edge * 0.75);
          base *= 1.0 - crev * 0.7;
        } else if (sid > 2.5 && sid < 3.5) {   // bone polishes on its crests, stains brown in its hollows
          base = mix(base, base * 1.35 + 0.03, edge * 0.6);
          base = mix(base, base * vec3(0.42, 0.31, 0.2), crev * 0.85);
          spec += edge * 0.3;
        } else if (sid > 3.5 && sid < 4.5) {   // metal rubs bright at the edges, tarnishes in recesses
          base = mix(base, base * 2.1 + 0.05, edge * 0.85);
          base *= 1.0 - crev * 0.6;
          spec += edge * 0.6;
        } else if (sid < 6.5 || sid > 7.5) {
          base = mix(base, base * 1.22 + 0.012, edge * 0.45);
          base = mix(base, base * vec3(0.5, 0.4, 0.34), crev * 0.65);
        }
        n = bump(n, vWorld, h);
        float ao = mix(1.0, vAO, 0.9) * cavity;

        // Light: a soft key from the caster's side, the moon behind, sky and ground between.
        float brush = (fbm(p * 6.0 + 7.0) - 0.5) * 0.22;
        float fillN = dot(n, uFill);
        float key = smoothstep(-0.2 + brush, 0.5 + brush, fillN) * 0.7 + smoothstep(0.45 + brush, 0.9 + brush, fillN) * 0.3;
        float moonN = dot(n, uMoon);
        float moon = smoothstep(-0.05 + brush, 0.5 + brush, moonN);
        float hemi = n.y * 0.5 + 0.5;
        vec3 ambient = mix(uGround, uSky, hemi) * ao;
        vec3 lightC = ambient + (uFillColor * key * 1.15 + uMoonColor * moon * 0.7) * mix(0.5, 1.0, ao);
        vec3 col = base * lightC;
        // Light under the skin: the terminator warms and softens where light wraps round the form.
        float wrapKey = smoothstep(-0.55, 0.3, fillN) - smoothstep(-0.2, 0.5, fillN);
        col += base * sssColor * sss * max(wrapKey, 0.0) * uFillColor * 0.55;
        // Thin parts glow when the moon is behind them.
        col += base * uMoonColor * trans * pow(max(0.0, dot(-V, uMoon)), 2.0) * 1.3;
        // Highlights: a tight lobe for wet and polished surfaces, broader for rough ones.
        float shininess = mix(140.0, 12.0, rough);
        vec3 Hf = normalize(uFill + V), Hm = normalize(uMoon + V);
        float sf = pow(max(dot(n, Hf), 0.0), shininess), sm = pow(max(dot(n, Hm), 0.0), shininess);
        col += (uFillColor * sf * 0.8 + uMoonColor * sm * 0.6) * spec * ao;
        float facing = clamp(dot(n, V), 0.0, 1.0);
        // Velvet sheen on cloth, fur and moss.
        col += base * sheen * pow(1.0 - facing, 3.0) * (uFillColor * 0.4 + uMoonColor * 0.3);
        // The moon wraps the silhouette from behind; the rim is what lifts a figure off the dark wood.
        float rim = pow(1.0 - facing, 2.8);
        float backlit = clamp(dot(-V, uMoon) * 0.5 + 0.7, 0.0, 1.0);
        col += uRim * rim * (0.35 + 0.65 * smoothstep(-0.3, 0.5, n.y + moonN)) * backlit * rimK * mix(0.4, 1.0, ao);
        col += base * spellIllumination(vWorld) * 1.5;
        col += emit;
        col *= uExposure;
        bool emissive = sid > 6.5 && sid < 7.5;
        if (emissive) {
          if (glow > 0.98) {
            col = uEyeColor * uEyes * (1.6 + 0.8 * rim);
            // A wet glint in each eye.
            col += vec3(1.0) * pow(max(dot(n, Hf), 0.0), 220.0) * 1.5;
          } else col = mix(col, vColor * (1.0 + glow * 2.4), clamp(glow * 1.6, 0.0, 1.0));
        }
        // Frost glazes the figure: pale, glassy, with a crystalline sparkle.
        if (uFrost > 0.0) {
          vec3 ice = vec3(0.62, 0.82, 1.0) * (0.55 + 0.7 * rim) + vec3(0.25, 0.4, 0.55) * fbm(p * 26.0);
          ice += step(0.985, h31(floor(p * 90.0 + floor(uTime * 3.0)))) * 1.2;
          ice += vec3(0.9, 0.97, 1.0) * pow(max(dot(n, Hf), 0.0), 60.0) * 0.8;
          col = mix(col, ice, uFrost * 0.72);
        }
        col += uFlashColor * uFlash * (0.35 + rim * 1.2);
        // Air and ground mist: distance softens the figure; mist swallows the feet.
        float air = 1.0 - exp(-dist * 0.016);
        float low = 1.0 - smoothstep(uGroundY - 0.05, uGroundY + uMist, vWorld.y);
        if (!emissive) col = mix(col, uAir, clamp(air * 0.32 + low * 0.55, 0.0, 0.8));
        float alpha = uOpacity;
        if (uDissolve > 0.0) {
          // Burn away from the top down, broken by noise, with a glowing edge.
          float hh = clamp((vWorld.y - uGroundY) / max(uHeight, 0.1), 0.0, 1.0);
          float front = (1.0 - hh) * 0.55 + fbm(p * 8.0) * 0.45;
          float cut = uDissolve * 1.08 - 0.04;
          if (front < cut) discard;
          col = mix(col, uEdge * 2.2, 1.0 - smoothstep(0.0, 0.07, front - cut));
        }
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  Object.assign(material.uniforms, u, FIGURE_LIGHT);
  material.uniforms.uSpellLights = SPELL_LIGHTS.uSpellLights;
  material.uniforms.uSpellColors = SPELL_LIGHTS.uSpellColors;
  return { material, u };
}
