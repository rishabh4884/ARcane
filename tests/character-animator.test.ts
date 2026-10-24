import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CharacterAnimator } from '../src/world/CharacterAnimator.ts';

function fixture() {
  const root = new THREE.Group();
  const chest = new THREE.Bone();
  chest.name = 'Chest';
  root.add(chest);
  const names = ['Idle', 'Hit_Left', 'Hit_Right', 'Shock', 'Gust', 'Stagger', 'Freeze', 'Break_Free'];
  const clips = names.map((name, i) => new THREE.AnimationClip(name, 1, [
    new THREE.NumberKeyframeTrack('Chest.rotation[x]', [0, 0.5, 1], [0, (i + 1) * 0.08, name === 'Freeze' ? 0.3 : 0]),
  ]));
  return { root, chest, clips, animator: new CharacterAnimator(root, clips) };
}

describe('reusable character animation controller', () => {
  it('plays an idle and a directional hit, then blends back to idle', () => {
    const { animator, chest } = fixture();
    expect(animator.currentClip).toBe('Idle');
    animator.update(0.3);
    expect(chest.rotation.x).toBeGreaterThan(0);
    animator.impact('arrow', 1);
    expect(animator.currentClip).toBe('Hit_Left');
    animator.update(1.2);
    expect(animator.currentClip).toBe('Idle');
    animator.impact('arrow', -1);
    expect(animator.currentClip).toBe('Hit_Right');
    animator.dispose();
  });

  it('holds a genuinely stationary frozen pose, ignores stagger, and breaks free on thaw', () => {
    const { animator, chest } = fixture();
    animator.setFrostAmount(0.4);
    animator.update(0.2);
    expect(animator.currentClip).toBe('Freeze');
    animator.setFrostAmount(1);
    animator.update(0.2);
    const frozen = chest.rotation.x;
    animator.update(1);
    expect(chest.rotation.x).toBeCloseTo(frozen, 6);
    animator.impact('lightning', 1);
    expect(animator.currentClip).toBe('Freeze');
    animator.setFrostAmount(0);
    expect(animator.currentClip).toBe('Break_Free');
    animator.update(1.2);
    expect(animator.currentClip).toBe('Idle');
    animator.dispose();
  });

  it('does not restart heavy reactions on every repeated hit or treat utilities as damage', () => {
    const { animator } = fixture();
    animator.impact('lightning', 1);
    animator.impact('arrow', 1);
    expect(animator.currentClip).toBe('Shock');
    animator.impact('healing', 1);
    animator.impact('shield', 1);
    expect(animator.currentClip).toBe('Shock');
    animator.dispose();
    expect(() => animator.dispose()).not.toThrow();
  });

  it('supports static replacement models without animation clips', () => {
    const animator = new CharacterAnimator(new THREE.Group(), []);
    expect(animator.available).toBe(false);
    expect(() => {
      animator.impact('wind', 1);
      animator.setFrostAmount(1);
      animator.update(0.1);
      animator.dispose();
    }).not.toThrow();
  });
});
