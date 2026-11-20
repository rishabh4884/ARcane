import * as THREE from 'three';
import { SPELL_LIGHT_GLSL, SPELL_LIGHTS } from '../LanternLighting.ts';
import { FIGURE_LIGHT, type FigureUniforms } from '../rig/figureMaterial.ts';

/**
 * THE STYLISED MATERIAL
 * ─────────────────────
 * One lighting model for every authored asset, characters and scenery alike, so the whole image
 * belongs to one production. It is three.js's standard material — real lights, real shadows, fog,
 * skinning, morphs — with the direct lighting reshaped by what each surface is made of, read from
 * the asset's baked maps:
 *
 *   albedo · normal · ORM (occlusion, roughness, metalness) · emission · fx (sheen, translucency,
 *   subsurface)
 *
 * Diffuse light wraps a little past the terminator and softens it (more where there is subsurface:
 * skin warms at its shadow edge), thin parts glow when lit from behind, cloth, fur and moss carry a
 * velvet sheen at grazing angles, and highlights come only from the roughness the asset was painted
 * with — no blanket rim light, no plastic gloss. The figure effects every character relies on
 * (dissolve, hit flash, frost, eye glow, ground mist, exposure) are layered on top with the same
 * uniforms the procedural figure material uses.
 */

export interface StylizedMaps {
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  normalScale?: THREE.Vector2;
  orm: THREE.Texture | null;
  emissiveMap: THREE.Texture | null;
  fx: THREE.Texture | null;
}

const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;
const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLACK.needsUpdate = true;

export function figureUniforms(edge: THREE.Color): FigureUniforms {
  return {
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
}

/** Maps from a GLB's own standard material plus the pipeline's fx map. */
export function mapsFrom(source: THREE.Material, fx: THREE.Texture | null): StylizedMaps {
  const m = source as THREE.MeshStandardMaterial;
  return { map: m.map, normalMap: m.normalMap, normalScale: m.normalScale?.clone(), orm: m.roughnessMap ?? m.aoMap, emissiveMap: m.emissiveMap, fx };
}

/**
 * three.js's physical lighting chunk with the stylised direct diffuse (wrap, terminator warmth,
 * translucency, sheen). Needs a global `vec3 stylFx` (sheen, translucency, subsurface) declared
 * before it and set before the lights run.
 */
export function stylizedLights(): string {
  return THREE.ShaderChunk.lights_physical_pars_fragment
      .replace(
        /float dotNL = saturate\( dot\( geometryNormal, directLight\.direction \) \);\s*vec3 irradiance = dotNL \* directLight\.color;/,
        `float NoL = dot( geometryNormal, directLight.direction );
	float dotNL = saturate( NoL );
	vec3 irradiance = dotNL * directLight.color;
	// Stylised diffuse: a gentle wrap past the terminator, wider with subsurface, softly shaped.
	float wrapK = 0.12 + stylFx.b * 0.38;
	float wrapped = saturate( ( NoL + wrapK ) / ( 1.0 + wrapK ) );
	wrapped = wrapped * wrapped * ( 3.0 - 2.0 * wrapped ) * 0.65 + wrapped * 0.35;
	vec3 styleDiffuse = wrapped * directLight.color;
	// Light under the skin warms the shadow edge.
	float term = saturate( 1.0 - abs( NoL + 0.08 ) * 2.6 ) * stylFx.b;
	styleDiffuse += directLight.color * term * vec3( 0.95, 0.42, 0.28 ) * 0.42;
	// Thin parts (ears, leaves, membranes, cloth edges) glow when the light is behind them.
	float behind = saturate( dot( -geometryNormal, directLight.direction ) );
	float viewThrough = saturate( dot( -geometryViewDir, directLight.direction ) );
	styleDiffuse += directLight.color * stylFx.g * ( behind * 0.45 + pow( viewThrough, 3.0 ) * 0.7 );
	// Velvet sheen at grazing angles on cloth, fur and moss.
	float facing = saturate( dot( geometryNormal, geometryViewDir ) );
	styleDiffuse += directLight.color * stylFx.r * pow( 1.0 - facing, 3.0 ) * saturate( NoL + 0.35 ) * 0.9;`)
      .replace(
        /reflectedLight\.directDiffuse \+= irradiance \* BRDF_Lambert\( material\.diffuseColor \);\s*\}/,
        'reflectedLight.directDiffuse += styleDiffuse * BRDF_Lambert( material.diffuseColor );\n}');
}

export function stylizedMaterial(maps: StylizedMaps, u: FigureUniforms, opts: { figure?: boolean } = {}): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    normalScale: maps.normalScale ?? new THREE.Vector2(1, 1),
    aoMap: maps.orm,
    aoMapIntensity: 1,
    roughnessMap: maps.orm,
    metalnessMap: maps.orm,
    roughness: 1,
    metalness: 1,
    emissiveMap: maps.emissiveMap ?? BLACK,
    emissive: new THREE.Color(1, 1, 1),
  });
  const fx = maps.fx ?? BLACK;
  const figure = opts.figure ?? true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, { fxMap: { value: fx }, uAir: FIGURE_LIGHT.uAir, ...SPELL_LIGHTS });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vStylWorld;
        varying vec3 vStylRest;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vStylRest = position;
        vStylWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #ifdef USE_INSTANCING
          vStylWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    const lights = stylizedLights();
    if (!lights.includes('float wrapK') || !lights.includes('styleDiffuse * BRDF')) console.warn('[arcane] stylised lighting patch did not apply; three.js chunk changed');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        vec3 stylFx = vec3( 0.0 );
        uniform sampler2D fxMap;
        uniform float uTime; uniform float uDissolve; uniform vec3 uEdge; uniform float uFlash; uniform vec3 uFlashColor;
        uniform float uFrost; uniform float uGroundY; uniform float uMist; uniform float uHeight; uniform vec3 uEyeColor;
        uniform float uEyes; uniform float uOpacity; uniform float uExposure; uniform vec3 uAir;
        varying vec3 vStylWorld;
        varying vec3 vStylRest;
        ${SPELL_LIGHT_GLSL}
        float stylHash( vec3 p ) { p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
        float stylNoise( vec3 x ) {
          vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( mix( stylHash( i ), stylHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( stylHash( i + vec3( 0, 1, 0 ) ), stylHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                      mix( mix( stylHash( i + vec3( 0, 0, 1 ) ), stylHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( stylHash( i + vec3( 0, 1, 1 ) ), stylHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
        }
        float stylFbm( vec3 p ) { float a = 0.5, s = 0.0; for ( int i = 0; i < 4; i++ ) { s += a * stylNoise( p ); p = p * 2.03 + vec3( 1.7, 9.2, 3.1 ); a *= 0.5; } return s; }`)
      .replace('#include <lights_physical_pars_fragment>', lights)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #ifdef USE_MAP
          stylFx = texture2D( fxMap, vMapUv ).rgb;
        #endif
        ${figure ? `// Eyes are painted pure white emission: they take the creature's living eye colour.
        float eyeK = min( totalEmissiveRadiance.r, min( totalEmissiveRadiance.g, totalEmissiveRadiance.b ) );
        totalEmissiveRadiance = ( totalEmissiveRadiance - eyeK ) + eyeK * uEyeColor * uEyes * 1.6;` : ''}`)
      .replace('#include <opaque_fragment>', `
        outgoingLight += diffuseColor.rgb * spellIllumination( vStylWorld ) * 1.5;
        ${figure ? `
        if ( uFrost > 0.0 ) {
          vec3 V = normalize( cameraPosition - vStylWorld );
          float rimF = pow( 1.0 - saturate( dot( normal, V ) ), 2.0 );
          vec3 ice = vec3( 0.62, 0.82, 1.0 ) * ( 0.45 + 0.7 * rimF ) + vec3( 0.25, 0.4, 0.55 ) * stylFbm( vStylRest * 26.0 );
          ice += step( 0.985, stylHash( floor( vStylRest * 90.0 + floor( uTime * 3.0 ) ) ) ) * 1.2;
          outgoingLight = mix( outgoingLight, ice, uFrost * 0.72 );
        }
        outgoingLight += uFlashColor * uFlash * 0.45;
        float low = 1.0 - smoothstep( uGroundY - 0.05, uGroundY + uMist, vStylWorld.y );
        outgoingLight = mix( outgoingLight, uAir, low * 0.5 );
        outgoingLight *= uExposure;
        if ( uDissolve > 0.0 ) {
          float hh = clamp( ( vStylWorld.y - uGroundY ) / max( uHeight, 0.1 ), 0.0, 1.0 );
          float front = ( 1.0 - hh ) * 0.55 + stylFbm( vStylRest * 8.0 ) * 0.45;
          float cut = uDissolve * 1.08 - 0.04;
          if ( front < cut ) discard;
          outgoingLight = mix( outgoingLight, uEdge * 2.2, 1.0 - smoothstep( 0.0, 0.07, front - cut ) );
        }
        diffuseColor.a *= uOpacity;` : ''}
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `stylized-v1-${figure ? 'figure' : 'prop'}`;
  return material;
}

/** A stylised material for a static prop from its GLB (no figure effects). */
export function propMaterial(source: THREE.Material, fx: THREE.Texture | null): THREE.MeshStandardMaterial {
  return stylizedMaterial(mapsFrom(source, fx), figureUniforms(new THREE.Color('#ffffff')), { figure: false });
}

export { WHITE as WHITE_TEXTURE };
