import * as THREE from 'three';

/** One world-space light field, shared by soil, illustrated trees, grass and fog. */
export const LANTERN_COUNT = 6;
export type LanternUniform = { value: THREE.Vector4[] };

// w carries the intensity; an unused light is all zeroes. All six slots are stable GPU uniforms.
export function createLanternUniform(): LanternUniform {
  return { value: Array.from({ length: LANTERN_COUNT }, () => new THREE.Vector4()) };
}

/**
 * Two short-lived world lights (a lightning strike and its bolt) that every illustrated surface,
 * grass blade, fog bank and creature responds to. Most of the forest is unlit artwork, so real
 * three.js lights cannot brighten it; this shared uniform can.
 *   uSpellLights[i]: xyz position, w intensity   uSpellColors[i]: rgb colour, w radius
 */
export const SPELL_LIGHT_COUNT = 2;
export const SPELL_LIGHTS = {
  uSpellLights: { value: Array.from({ length: SPELL_LIGHT_COUNT }, () => new THREE.Vector4()) },
  uSpellColors: { value: Array.from({ length: SPELL_LIGHT_COUNT }, () => new THREE.Vector4(1, 1, 1, 1)) },
};

export const SPELL_LIGHT_GLSL = `
  uniform vec4 uSpellLights[2];
  uniform vec4 uSpellColors[2];
  vec3 spellIllumination(vec3 surface) {
    vec3 light = vec3(0.0);
    for (int i = 0; i < 2; i++) {
      vec4 l = uSpellLights[i];
      if (l.w <= 0.0) continue;
      float reach = 1.0 - smoothstep(0.0, max(uSpellColors[i].w, 0.001), length(surface - l.xyz));
      light += uSpellColors[i].rgb * reach * reach * l.w;
    }
    return light;
  }
`;

/** Attach the shared spell-light uniforms to a compiled shader. */
export function bindSpellLights(uniforms: Record<string, THREE.IUniform>): void {
  uniforms.uSpellLights = SPELL_LIGHTS.uSpellLights;
  uniforms.uSpellColors = SPELL_LIGHTS.uSpellColors;
}

export const LANTERN_GLSL = SPELL_LIGHT_GLSL + `
  uniform vec4 uLanterns[6];
  float lanternIllumination(vec3 surface) {
    float amount = 0.0;
    for (int i = 0; i < 6; i++) {
      vec4 lamp = uLanterns[i];
      vec3 fromLamp = surface - lamp.xyz;
      float reach = 1.0 - smoothstep(1.0, 9.5, length(fromLamp));
      // The metal hood casts the upper half of the lantern into shadow.
      float hood = 1.0 - smoothstep(-0.2, 1.5, fromLamp.y);
      amount += reach * reach * hood * lamp.w;
    }
    return min(amount, 1.25);
  }
`;

/** Compose with existing geometry/wind shader patches; shade the *actual* world position. */
export function illuminateIllustration(material: THREE.MeshBasicMaterial, lanterns: LanternUniform, ambient = 0.34): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uLanterns = lanterns;
    bindSpellLights(shader.uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLanternWorld;');
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 lampVertex = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        lampVertex = instanceMatrix * lampVertex;
      #endif
      vLanternWorld = (modelMatrix * lampVertex).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vLanternWorld;\n${LANTERN_GLSL}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float lamplight = lanternIllumination(vLanternWorld);
      diffuseColor.rgb *= vec3(${ambient.toFixed(3)}, ${(ambient * 1.10).toFixed(3)}, ${(ambient * 1.11).toFixed(3)})
                        + lamplight * vec3(0.83, 0.55, 0.22)
                        + spellIllumination(vLanternWorld);`);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}-lantern-lit-v2-${ambient}`;
}
