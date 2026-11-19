import * as THREE from 'three';
import { SPELL_LIGHT_GLSL, SPELL_LIGHTS } from '../LanternLighting.ts';

/**
 * THE FIGURE SHADER
 * ─────────────────
 * One painterly material for every creature, gnome and boss. Light comes from three places, the way
 * an illustrator would light a night scene: the moon behind the wood (a cold rim that wraps the
 * silhouette), the caster's own glow in front (a soft fill that reads the face and form), and the
 * bounce off the dark ground. Shading falls into two broad bands whose edges are broken by a brush
 * noise, so forms read as painted volumes rather than plastic. Surface character (bark grooves,
 * cloth folds, bone cracks, fur strands, moss clumps, wing veins) is computed in the rest pose, so it
 * sticks to the body as it moves and stays crisp at any distance. Feet sink into the ground mist,
 * spells light the figure, frost glazes it, a hit flashes it, and death burns it away from the top.
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
const FILL = new THREE.Vector3(0.35, 0.55, 0.76).normalize();

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
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uMoon: { value: MOON }, uFill: { value: FILL },
      uMoonColor: { value: new THREE.Color('#9fc2d4') },
      uFillColor: { value: new THREE.Color('#b9a98f') },
      uSky: { value: new THREE.Color('#41575a') },
      uGround: { value: new THREE.Color('#1b241f') },
      uRim: { value: new THREE.Color('#a6d6d6') },
      uAir: { value: new THREE.Color('#26302f') },
    }]),
    vertexColors: true,
    fog: true,
    side: THREE.DoubleSide,
    transparent: false,
    vertexShader: /* glsl */`
      #include <common>
      #include <skinning_pars_vertex>
      #include <fog_pars_vertex>
      attribute vec2 aSurf;
      uniform float uTime;
      uniform vec4 uCloth;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vRest;
      varying vec2 vSurf;
      void main() {
        vColor = color;
        vSurf = aSurf;
        vRest = position;
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        // Cloth, hair and wings hang: slow overlapping waves that grow toward the free edge.
        if ((aSurf.x > 1.5 && aSurf.x < 2.5) || (aSurf.x > 10.5 && aSurf.x < 11.5)) {
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
      varying vec3 vColor; varying vec3 vWorld; varying vec3 vNormalW; varying vec3 vRest; varying vec2 vSurf;
      ${SPELL_LIGHT_GLSL}
      float h31(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float vnoise(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
      void main() {
        float sid = floor(vSurf.x + 0.5);
        float glow = vSurf.y;
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 n = normalize(vNormalW);
        if (!gl_FrontFacing) n = -n;
        vec3 p = vRest;
        vec3 base = vColor;
        float spec = 0.0, trans = 0.0, cavity = 1.0;
        if (sid < 0.5) {                       // skin
          base *= 0.84 + 0.3 * fbm(p * 13.0);
          base = mix(base, base * vec3(1.12, 0.9, 0.86), smoothstep(0.55, 0.8, fbm(p * 3.3)) * 0.6);
          spec = 0.12;
        } else if (sid < 1.5) {                // bark: long grooves that run with the grain
          float g = fbm(vec3(p.x * 11.0, p.y * 1.7, p.z * 11.0));
          float groove = smoothstep(0.38, 0.62, g);
          cavity = mix(0.45, 1.12, groove);
          base *= cavity * (0.88 + 0.22 * fbm(p * 24.0));
        } else if (sid < 2.5) {                // cloth: hanging folds and a coarse weave
          float fold = sin(atan(p.x, p.z) * 9.0 + fbm(p * 2.6) * 7.0) * 0.5 + 0.5;
          cavity = 0.7 + 0.36 * fold;
          base *= cavity * (0.92 + 0.1 * vnoise(p * 140.0));
        } else if (sid < 3.5) {                // bone: pale, cracked, stained
          float crack = 1.0 - smoothstep(0.0, 0.035, abs(fbm(p * 7.0) - 0.5));
          base *= (0.9 + 0.14 * fbm(p * 16.0)) * (1.0 - crack * 0.5);
          base = mix(base, base * vec3(0.72, 0.62, 0.5), smoothstep(0.5, 0.75, fbm(p * 4.0 + 3.0)) * 0.5);
          spec = 0.3;
        } else if (sid < 4.5) {                // metal
          spec = 1.0;
          base *= 0.75 + 0.35 * fbm(p * 34.0);
        } else if (sid < 5.5) {                // fur
          float s = vnoise(vec3(p.x * 70.0, p.y * 9.0, p.z * 70.0));
          base *= 0.68 + 0.5 * s;
        } else if (sid < 6.5) {                // moss: soft clumps, lighter at their tips
          float c = fbm(p * 18.0);
          base *= 0.62 + 0.7 * c;
          base = mix(base, base * vec3(0.9, 1.2, 0.72), c * 0.6);
        } else if (sid < 7.5) {
        } else if (sid < 8.5) {                // leaf: veins
          float vein = 1.0 - smoothstep(0.0, 0.05, abs(fract(p.y * 18.0 + abs(p.x) * 12.0) - 0.5));
          base *= 0.85 + 0.25 * vein; trans = 0.5;
        } else if (sid < 9.5) {                // stone: facets and speckle
          base *= 0.78 + 0.3 * fbm(p * 9.0) + 0.12 * step(0.93, h31(floor(p * 60.0)));
        } else if (sid < 10.5) {               // wing membrane: veined and backlit
          float vein = 1.0 - smoothstep(0.0, 0.06, abs(sin(atan(p.y - 1.0, p.x) * 14.0 + fbm(p * 3.0) * 2.0)));
          base *= 1.0 - vein * 0.45; trans = 0.9;
        } else if (sid < 11.5) {               // hair and beards: long strands
          float s = vnoise(vec3(p.x * 90.0, p.y * 5.0, p.z * 90.0));
          base *= 0.72 + 0.42 * s; spec = 0.18;
        } else if (sid < 12.5) {               // hollows: mouths, sockets
          base *= 0.6;
        } else {                               // chitin: glossy plates
          spec = 0.7;
          base *= 0.85 + 0.25 * fbm(p * 20.0);
        }

        // Painted light: two broad bands with brush-broken edges.
        float brush = (fbm(p * 6.0 + 7.0) - 0.5) * 0.3;
        float fillN = dot(n, uFill);
        float fillLit = smoothstep(-0.25 + brush, 0.35 + brush, fillN) * 0.65 + smoothstep(0.45 + brush, 0.85 + brush, fillN) * 0.35;
        float moonN = dot(n, uMoon);
        float moonLit = smoothstep(0.0 + brush, 0.45 + brush, moonN);
        float hemi = n.y * 0.5 + 0.5;
        vec3 ambient = mix(uGround, uSky, hemi) * cavity;
        vec3 lightC = ambient + uFillColor * fillLit * 0.85 + uMoonColor * moonLit * 0.7;
        vec3 col = base * lightC;
        // Thin membranes and leaves glow when the moon is behind them.
        col += base * uMoonColor * trans * pow(max(0.0, dot(-V, uMoon)), 2.0) * 1.2;
        vec3 H = normalize(uFill + V);
        col += uFillColor * spec * pow(max(dot(n, H), 0.0), 36.0) * 0.55;
        // The moon wraps the silhouette from behind; the rim is what lifts a figure off the dark wood.
        float facing = clamp(dot(n, V), 0.0, 1.0);
        float rim = pow(1.0 - facing, 2.6);
        float backlit = clamp(dot(-V, uMoon) * 0.5 + 0.7, 0.0, 1.0);
        col += uRim * rim * (0.35 + 0.65 * smoothstep(-0.3, 0.5, n.y + moonN)) * backlit * 0.9;
        col += base * spellIllumination(vWorld) * 1.5;
        col *= uExposure;
        bool emissive = sid > 6.5 && sid < 7.5;
        if (emissive) {
          if (glow > 0.98) col = uEyeColor * uEyes * (1.6 + 0.8 * rim);
          else col = mix(col, vColor * (1.0 + glow * 2.4), clamp(glow * 1.6, 0.0, 1.0));
        }
        // Frost glazes the figure: pale, glassy, with a crystalline sparkle.
        if (uFrost > 0.0) {
          vec3 ice = vec3(0.62, 0.82, 1.0) * (0.55 + 0.7 * rim) + vec3(0.25, 0.4, 0.55) * fbm(p * 26.0);
          ice += step(0.985, h31(floor(p * 90.0 + floor(uTime * 3.0)))) * 1.2;
          col = mix(col, ice, uFrost * 0.72);
        }
        col += uFlashColor * uFlash * (0.35 + rim * 1.2);
        // Air and ground mist: distance softens the figure; mist swallows the feet.
        float dist = length(vWorld - cameraPosition);
        float air = 1.0 - exp(-dist * 0.018);
        float low = 1.0 - smoothstep(uGroundY - 0.05, uGroundY + uMist, vWorld.y);
        if (!emissive) col = mix(col, uAir, clamp(air * 0.35 + low * 0.55, 0.0, 0.8));
        float alpha = uOpacity;
        if (uDissolve > 0.0) {
          // Burn away from the top down, broken by noise, with a glowing edge.
          float h = clamp((vWorld.y - uGroundY) / max(uHeight, 0.1), 0.0, 1.0);
          float front = (1.0 - h) * 0.55 + fbm(p * 8.0) * 0.45;
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
  Object.assign(material.uniforms, u);
  material.uniforms.uSpellLights = SPELL_LIGHTS.uSpellLights;
  material.uniforms.uSpellColors = SPELL_LIGHTS.uSpellColors;
  return { material, u };
}
