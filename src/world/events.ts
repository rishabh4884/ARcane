import type * as THREE from 'three';
import type { SpellEffect } from '../config/spells.ts';
import type { CreatureKind } from './Creature.ts';

/**
 * Things that happen in the world that presentation layers (screen feedback, audio, particles)
 * react to. Gameplay never depends on a listener being present.
 */
export type GameEvent =
  | { type: 'cast'; effect: SpellEffect; position: THREE.Vector3; pan: number; detail?: string }
  | { type: 'cast-refused'; effect: SpellEffect; pan: number }
  | { type: 'spell-impact'; effect: SpellEffect; position: THREE.Vector3; pan: number }
  | { type: 'player-hurt'; amount: number }
  | { type: 'player-blocked' }
  | { type: 'enemy-windup'; kind: CreatureKind; position: THREE.Vector3; pan: number }
  | { type: 'enemy-strike'; kind: CreatureKind; position: THREE.Vector3; pan: number }
  | { type: 'enemy-hit'; kind: CreatureKind; position: THREE.Vector3; pan: number; effect: SpellEffect }
  | { type: 'enemy-death'; kind: CreatureKind; position: THREE.Vector3; pan: number; height: number }
  | { type: 'projectile'; position: THREE.Vector3; pan: number }
  | { type: 'encounter'; mode: 'active' | 'won' | 'lost' };

type Listener = (event: GameEvent) => void;

export class GameEvents {
  private readonly listeners = new Set<Listener>();

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: GameEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        // A presentation fault must never break gameplay.
        console.warn('[arcane] event listener failed', error);
      }
    }
  }
}
