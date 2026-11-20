import type * as THREE from 'three';
import type { SpellEffect } from '../config/spells.ts';
import type { AttackType, CreatureKind } from './EncounterState.ts';

/**
 * Things that happen in the world that presentation layers (screen feedback, audio, particles,
 * the HUD) react to. Gameplay never depends on a listener being present.
 */
export type GameEvent =
  | { type: 'cast'; effect: SpellEffect; position: THREE.Vector3; pan: number; detail?: string }
  | { type: 'cast-refused'; effect: SpellEffect; pan: number }
  | { type: 'spell-impact'; effect: SpellEffect; position: THREE.Vector3; pan: number }
  | { type: 'player-hurt'; amount: number; source?: string }
  | { type: 'player-blocked' }
  | { type: 'enemy-windup'; kind: CreatureKind; position: THREE.Vector3; pan: number; attack?: AttackType; boss?: boolean }
  | { type: 'enemy-strike'; kind: CreatureKind; position: THREE.Vector3; pan: number; attack?: AttackType; boss?: boolean }
  | { type: 'enemy-hit'; kind: CreatureKind; position: THREE.Vector3; pan: number; effect: SpellEffect; amount?: number; critical?: boolean }
  | { type: 'enemy-death'; kind: CreatureKind; position: THREE.Vector3; pan: number; height: number; boss?: boolean }
  | { type: 'projectile'; position: THREE.Vector3; pan: number; style?: string }
  | { type: 'encounter'; mode: 'active' | 'won' | 'lost' }
  | { type: 'wave'; index: number; total: number }
  | { type: 'wave-clear'; index: number }
  | { type: 'boss'; kind: CreatureKind; phase: number; name: string; title: string }
  | { type: 'boss-arrive'; kind: CreatureKind; position: THREE.Vector3; pan: number }
  | { type: 'gust'; position: THREE.Vector3; color: string }
  | { type: 'darkness'; seconds: number }
  | { type: 'toll'; position: THREE.Vector3 }
  | { type: 'quake'; position: THREE.Vector3; amount: number }
  /** The whole wood falls still for `duration` seconds. */
  | { type: 'hush'; duration: number };

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
