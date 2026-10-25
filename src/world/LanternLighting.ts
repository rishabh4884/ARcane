import * as THREE from 'three';

/** One world-space light field, shared by soil, illustrated trees, grass and fog. */
export const LANTERN_COUNT = 6;
export type LanternUniform = { value: THREE.Vector4[] };

// w carries the intensity; an unused light is all zeroes. All six slots are stable GPU uniforms.
export function createLanternUniform(): LanternUniform {
  return { value: Array.from({ length: LANTERN_COUNT }, () => new THREE.Vector4()) };
}

export const LANTERN_GLSL = `
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
                        + lamplight * vec3(0.83, 0.55, 0.22);`);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}-lantern-lit-${ambient}`;
}
