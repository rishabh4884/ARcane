import { describe, expect, it, vi } from 'vitest';
import { SPELLS } from '../src/config/spells.ts';
import { createSpellAnimation } from '../src/world/effects.ts';
import * as THREE from 'three';

describe('spell visuals', () => {
  // The stag bakes its sculpted body on first use; other spells keep the usual timeout.
  for (const { name, effect } of SPELLS) it(`${name} has an animated, disposable effect`, () => {
    const animation = createSpellAnimation(
      effect,
      new THREE.Vector3(0, 1, 5),
      new THREE.Vector3(0, 1, -9),
      new THREE.Color('#8adfff'),
      'left',
    );
    expect(animation.group.children.length).toBeGreaterThan(0);
    const impact = vi.fn();
    animation.setImpactCallback(impact);
    expect(animation.update(0.08)).toBe(true);
    for (let i = 0; i < 100 && impact.mock.calls.length === 0; i++) animation.update(0.05);
    expect(impact).toHaveBeenCalledTimes(1);
    expect(animation.update(12)).toBe(false);
    expect(impact).toHaveBeenCalledTimes(1);
    animation.dispose();
  }, effect === 'stag' ? 30_000 : 5_000);
});
