import * as THREE from 'three';
import { SPELL_LIGHT_GLSL, SPELL_LIGHTS } from '../LanternLighting.ts';
import { FIGURE_LIGHT, type FigureUniforms } from '../rig/figureMaterial.ts';

/**
 * INK AND PAINT
 * ─────────────
 * Characters drawn the way an animated series paints its cels, redrawn every frame:
 *
 *  - paint: flat painted tones in three bands, lit by the caster's warm light from the front, the
 *    band edges soft and broken by a brush pattern that sticks to the surface (so they read as painted
 *    shapes, not as shading); shadows painted cool, never black; warmth at the shadow edge of skin;
 *    a crisp silver rim only where the moon behind catches the silhouette; no specular gloss.
 *  - ink: an inked outline drawn around the figure at a constant line weight on screen, thinner on
 *    distant figures, fading into the air with depth like ink in a painted scene, and boiling — its
 *    wobble re-drawn each time the drawing changes (12 times a second) — the way hand-drawn lines do.
 *
 * The same material paints the authored models (their baked colour maps) and the older procedural
 * bodies (their vertex colours), so the whole cast shares one drawn look.
 */

/** Region light and ink shared by every drawn figure (set when the wood changes). */
export const INK = {
  uFillDir: { value: new THREE.Vector3(0.35, 0.5, 0.79).normalize() },
  uMoonDir: { value: new THREE.Vector3(-0.34, 0.45, -0.82).normalize() },
  uLitColor: { value: new THREE.Color('#f2dcc0') },
  uMidColor: { value: new THREE.Color('#a9a6b2') },
  uShadeColor: { value: new THREE.Color('#4f5d7a') },
  uRimColor: { value: new THREE.Color('#d6e6f2') },
  uInk: { value: new THREE.Color('#15100d') },
  /** The drawing's frame: changes 12 times a second, re-seeding the line boil. */
  uDrawing: { value: 0 },
  uResolution: { value: new THREE.Vector2(1280, 720) },
  /** Line weight in pixels at 1080 lines of resolution. */
  uLineWeight: { value: 2.4 },
  /** 1 in a painted set: figures take the painting's own aerial haze, so they sit in its air. */
  uPaintedAir: { value: 0 },
};

const COMMON = /* glsl */`
  float ipHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float ipNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(ipHash(i), ipHash(i + vec3(1, 0, 0)), f.x), mix(ipHash(i + vec3(0, 1, 0)), ipHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(ipHash(i + vec3(0, 0, 1)), ipHash(i + vec3(1, 0, 1)), f.x), mix(ipHash(i + vec3(0, 1, 1)), ipHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float ipFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * ipNoise(p); p = p * 2.07 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }`;

export interface InkMaps {
  map: THREE.Texture | null;
  orm: THREE.Texture | null;
  emissiveMap: THREE.Texture | null;
  fx: THREE.Texture | null;
}

/** The paint pass for a skinned figure. With no maps it paints from vertex colours and baked occlusion. */
export function inkPaintMaterial(maps: InkMaps | null, u: FigureUniforms): THREE.ShaderMaterial {
  const textured = !!maps?.map;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...u, ...INK, uAir: FIGURE_LIGHT.uAir, ...SPELL_LIGHTS,
      map: { value: maps?.map ?? null }, ormMap: { value: maps?.orm ?? null }, emitMap: { value: maps?.emissiveMap ?? null }, fxMap: { value: maps?.fx ?? null },
    },
    defines: textured ? { INK_TEXTURED: '' } : {},
    vertexColors: !textured,
    side: THREE.FrontSide,
    vertexShader: /* glsl */`
      #include <common>
      #include <skinning_pars_vertex>
      attribute float aAO;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vWorld;
      varying vec3 vRest;
      varying vec3 vCol;
      varying float vAOv;
      void main() {
        vUv = uv;
        vRest = position;
        #ifdef USE_COLOR
          vCol = color;
        #else
          vCol = vec3(1.0);
        #endif
        vAOv = aAO;
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vNormalW = normalize(mat3(modelMatrix) * objectNormal);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform sampler2D ormMap; uniform sampler2D emitMap; uniform sampler2D fxMap;
      uniform vec3 uFillDir; uniform vec3 uMoonDir; uniform vec3 uLitColor; uniform vec3 uMidColor; uniform vec3 uShadeColor; uniform vec3 uRimColor; uniform vec3 uInk;
      uniform float uDrawing; uniform vec3 uAir; uniform float uPaintedAir;
      uniform float uTime; uniform float uDissolve; uniform vec3 uEdge; uniform float uFlash; uniform vec3 uFlashColor;
      uniform float uFrost; uniform float uGroundY; uniform float uMist; uniform float uHeight; uniform vec3 uEyeColor; uniform float uEyes;
      uniform float uOpacity; uniform float uExposure;
      varying vec2 vUv; varying vec3 vNormalW; varying vec3 vWorld; varying vec3 vRest; varying vec3 vCol; varying float vAOv;
      ${SPELL_LIGHT_GLSL}
      ${COMMON}
      void main() {
        #ifdef INK_TEXTURED
          // Colour read a little soft: painted masses, not texture noise.
          vec3 base = texture2D(map, vUv, 1.4).rgb;
          float ao = texture2D(ormMap, vUv).r;
          vec3 fx = texture2D(fxMap, vUv).rgb;
          vec3 emit = texture2D(emitMap, vUv).rgb;
        #else
          vec3 base = vCol;
          float ao = vAOv;
          vec3 fx = vec3(0.0, 0.0, 0.35);
          vec3 emit = vec3(0.0);
        #endif
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 n = normalize(vNormalW);
        if (!gl_FrontFacing) n = -n;
        // The brush: a pattern stuck to the body that breaks every band edge into painted strokes.
        float brush = ipFbm(vRest * 9.0 + vec3(0.0, 0.0, floor(uDrawing * 0.5) * 0.0)) - 0.5;
        float fine = ipNoise(vRest * 38.0) - 0.5;
        float t = dot(n, uFillDir) * 0.5 + 0.5 + brush * 0.16 + fine * 0.04;
        t *= mix(0.55, 1.0, smoothstep(0.25, 0.85, ao));
        float aa = max(fwidth(t), 0.002);
        float lit = smoothstep(0.5 - aa * 1.5, 0.5 + aa * 1.5, t);
        float top = smoothstep(0.8 - aa * 1.5, 0.8 + aa * 1.5, t + brush * 0.08);
        vec3 shadow = base * uShadeColor * mix(0.62, 1.0, ao);
        vec3 mid = base * uMidColor;
        vec3 light = base * uLitColor;
        vec3 col = mix(shadow, mix(mid, light, top), lit);
        // Skin and thin things warm at the shadow edge.
        col += base * vec3(0.55, 0.16, 0.08) * fx.b * (1.0 - abs(lit * 2.0 - 1.0)) * 0.7;
        // Deep creases inked in where the body folds.
        col = mix(col, uInk, smoothstep(0.32, 0.12, ao) * 0.55);
        // The moon behind paints a crisp silver edge only on what turns toward it at the silhouette.
        float facing = clamp(dot(n, V), 0.0, 1.0);
        float rimAmt = (1.0 - facing) * clamp(dot(n, uMoonDir) * 0.8 + 0.45, 0.0, 1.0);
        float rim = smoothstep(0.5, 0.56, rimAmt + brush * 0.06);
        col = mix(col, base * 0.35 + uRimColor * 0.62, rim * 0.8);
        col += base * spellIllumination(vWorld) * 1.2;
        // Eyes and captive light: pure-white emission takes the creature's living eye colour.
        float eyeK = min(emit.r, min(emit.g, emit.b));
        vec3 glow = (emit - eyeK) + eyeK * uEyeColor * uEyes * 1.6;
        col += glow;
        if (uFrost > 0.0) {
          vec3 ice = mix(vec3(0.62, 0.8, 0.95), vec3(0.9, 0.97, 1.0), lit) + step(0.985, ipHash(floor(vRest * 90.0 + floor(uTime * 3.0)))) * 0.8;
          col = mix(col, ice, uFrost * 0.7);
        }
        col += uFlashColor * uFlash * 0.5;
        // Into the air: distance and ground mist soften the drawing like the painted set behind it.
        float dist = length(vWorld - cameraPosition);
        float air = mix((1.0 - exp(-dist * 0.018)) * 0.4, (1.0 - exp(-max(dist - 8.0, 0.0) / 62.0)) * 0.92, uPaintedAir);
        float low = 1.0 - smoothstep(uGroundY - 0.05, uGroundY + uMist, vWorld.y);
        col = mix(col, uAir, clamp(air + low * 0.45, 0.0, 0.88) * (1.0 - min(1.0, length(glow))));
        col *= uExposure;
        if (uDissolve > 0.0) {
          float hh = clamp((vWorld.y - uGroundY) / max(uHeight, 0.1), 0.0, 1.0);
          float front = (1.0 - hh) * 0.55 + ipFbm(vRest * 8.0) * 0.45;
          float cut = uDissolve * 1.08 - 0.04;
          if (front < cut) discard;
          col = mix(col, uEdge * 2.0, 1.0 - smoothstep(0.0, 0.07, front - cut));
        }
        gl_FragColor = vec4(col, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  return material;
}

/**
 * The ink: the figure's back faces pushed out along their normals by a constant number of pixels and
 * drawn in ink behind it — a drawn outline that follows every pose. The wobble is re-seeded each new
 * drawing, so the line boils like hand inking.
 */
export function inkLineMaterial(u: FigureUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...u, ...INK, uAir: FIGURE_LIGHT.uAir },
    side: THREE.BackSide,
    vertexShader: /* glsl */`
      #include <common>
      #include <skinning_pars_vertex>
      uniform vec2 uResolution; uniform float uLineWeight; uniform float uDrawing;
      varying vec3 vWorld;
      varying vec3 vRest;
      ${COMMON}
      void main() {
        vRest = position;
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
        vec3 nView = normalize(normalMatrix * objectNormal);
        vec4 clip = projectionMatrix * mv;
        vec2 dir = (projectionMatrix * vec4(nView, 0.0)).xy;
        float len = length(dir);
        dir = len > 1e-5 ? dir / len : vec2(0.0);
        float depth = -mv.z;
        // Line weight: constant on screen, lighter on distant figures, pressure varying along the line,
        // re-drawn (boiled) with each new drawing.
        float pressure = 0.7 + 0.6 * ipNoise(position * 14.0 + vec3(uDrawing * 1.7));
        float px = uLineWeight * (uResolution.y / 1080.0) * clamp(9.0 / depth, 0.42, 1.0) * pressure;
        clip.xy += dir * px * 2.0 / uResolution * clip.w;
        clip.z += 0.0004 * clip.w;
        gl_Position = clip;
        vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uInk; uniform vec3 uAir; uniform float uPaintedAir; uniform float uDissolve; uniform float uGroundY; uniform float uHeight; uniform float uOpacity;
      varying vec3 vWorld;
      varying vec3 vRest;
      ${COMMON}
      void main() {
        if (uDissolve > 0.0) {
          float hh = clamp((vWorld.y - uGroundY) / max(uHeight, 0.1), 0.0, 1.0);
          float front = (1.0 - hh) * 0.55 + ipFbm(vRest * 8.0) * 0.45;
          if (front < uDissolve * 1.08 - 0.02) discard;
        }
        float dist = length(vWorld - cameraPosition);
        float air = mix((1.0 - exp(-dist * 0.022)) * 0.75, (1.0 - exp(-max(dist - 6.0, 0.0) / 55.0)) * 0.95, uPaintedAir);
        gl_FragColor = vec4(mix(uInk, uAir, clamp(air, 0.0, 0.92)), uOpacity);
        #include <colorspace_fragment>
      }`,
  });
}

/** Maps for ink and paint from a GLB's standard material plus the pipeline's fx map. */
export function inkMapsFrom(source: THREE.Material, fx: THREE.Texture | null): InkMaps {
  const m = source as THREE.MeshStandardMaterial;
  return { map: m.map, orm: m.roughnessMap ?? m.aoMap, emissiveMap: m.emissiveMap, fx };
}
