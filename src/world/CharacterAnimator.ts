import * as THREE from 'three';
import type { SpellEffect } from '../config/spells.ts';

/** Named clip convention, independent of skeleton names and enemy geometry. */
export interface CharacterClips {
  idle: string;
  hitLeft: string;
  hitRight: string;
  shock: string;
  gust: string;
  stagger: string;
  freeze: string;
  breakFree: string;
}

const DEFAULT_CLIPS: CharacterClips = {
  idle: 'Idle', hitLeft: 'Hit_Left', hitRight: 'Hit_Right', shock: 'Shock',
  gust: 'Gust', stagger: 'Stagger', freeze: 'Freeze', breakFree: 'Break_Free',
};

/** Owns clip blending, not damage or materials. Models can provide their own clip map. */
export class CharacterAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly idle: THREE.AnimationAction | undefined;
  private active: THREE.AnimationAction | undefined;
  private frost = 0;
  private frozenPose = false;
  private elapsed = 0;
  private lastHit = -Infinity;
  private disposed = false;

  constructor(
    private readonly root: THREE.Object3D,
    clips: readonly THREE.AnimationClip[],
    private readonly names: CharacterClips = DEFAULT_CLIPS,
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.idle = this.actions.get(names.idle);
    this.idle?.setLoop(THREE.LoopRepeat, Infinity).play();
    this.mixer.addEventListener('finished', this.onFinished);
  }

  get available(): boolean { return this.actions.size > 0; }
  get currentClip(): string | null { return this.active?.getClip().name ?? this.idle?.getClip().name ?? null; }

  impact(effect: SpellEffect, side: number): void {
    if (this.disposed || effect === 'healing' || effect === 'shield' || effect === 'frost' || this.frozenPose) return;
    // Repeated taps still flash the material, but do not restart a stagger every frame.
    if (this.active && this.elapsed - this.lastHit < 0.16) return;
    const name = effect === 'arrow' ? (side > 0 ? this.names.hitLeft : this.names.hitRight)
      : effect === 'lightning' ? this.names.shock
        : effect === 'wind' ? this.names.gust : this.names.stagger;
    if (this.play(name)) this.lastHit = this.elapsed;
  }

  setFrostAmount(amount: number): void {
    this.frost = THREE.MathUtils.clamp(amount, 0, 1);
    const freeze = this.actions.get(this.names.freeze);
    if (!freeze || this.disposed) return;
    if (this.frost > 0 && !this.frozenPose) {
      this.play(this.names.freeze);
      this.frozenPose = true;
    }
    if (this.frozenPose) {
      // Sample the brace pose from the actual status progression; the frozen hold never
      // advances an idle loop underneath. Thaw reverses this pose before break-free.
      freeze.paused = true;
      freeze.time = Math.min(freeze.getClip().duration * this.frost, freeze.getClip().duration);
      if (this.frost === 0) {
        this.frozenPose = false;
        if (!this.play(this.names.breakFree)) this.returnToIdle();
      }
    }
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.elapsed += dt;
    this.mixer.update(dt);
    // GLTF skeleton transforms must be current before bounds, frost and rendering.
    this.root.updateMatrixWorld(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.removeEventListener('finished', this.onFinished);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.actions.clear();
  }

  private play(name: string): boolean {
    const next = this.actions.get(name);
    if (!next) return false;
    const previous = this.active ?? this.idle;
    // Stop old fading actions on subsequent transitions; at most two clips blend.
    for (const action of this.actions.values()) if (action !== previous && action !== next) action.stop();
    next.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).setEffectiveTimeScale(1);
    next.clampWhenFinished = true;
    next.fadeIn(0.1).play();
    if (previous && previous !== next) previous.fadeOut(0.1);
    this.active = next;
    return true;
  }

  private returnToIdle(): void {
    this.active?.fadeOut(0.18);
    this.active = undefined;
    this.idle?.reset().setEffectiveWeight(1).fadeIn(0.18).play();
  }

  private onFinished = (event: { action: THREE.AnimationAction }): void => {
    if (event.action === this.active && !this.frozenPose) this.returnToIdle();
  };
}
