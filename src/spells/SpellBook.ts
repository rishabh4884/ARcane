import type { GestureDef } from '../config/gestures.ts';
import type { SpellDef } from '../config/spells.ts';
import { loadJSON, saveJSON, type KeyValueStore } from '../storage.ts';

const STORAGE_KEY = 'arcane.spellbook.v1';

/**
 * Which gesture casts which spell. A gesture casts at most one spell, and a spell has exactly one
 * gesture; gestures not bound to any spell are simply off.
 * Defaults come from config/spells.ts; the player's rebinding is saved in localStorage.
 */
export class SpellBook {
  readonly spells: readonly SpellDef[];
  readonly gestures: readonly GestureDef[];
  private bySpell = new Map<string, string>();
  private store: KeyValueStore | null | undefined;
  private listeners = new Set<() => void>();

  constructor(spells: readonly SpellDef[], gestures: readonly GestureDef[], store?: KeyValueStore | null) {
    this.spells = spells;
    this.gestures = gestures;
    this.store = store;
    this.restore();
  }

  gestureFor(spellId: string): GestureDef | undefined {
    const id = this.bySpell.get(spellId);
    return this.gestures.find((g) => g.id === id);
  }

  spellFor(gestureId: string): SpellDef | undefined {
    for (const [spellId, gId] of this.bySpell) {
      if (gId === gestureId) return this.spells.find((s) => s.id === spellId);
    }
    return undefined;
  }

  /**
   * The gestures the engine should listen for: exactly those bound to a spell, in library order
   * (the library lists stricter variants first, and the engine honours that order).
   */
  activeGestures(): GestureDef[] {
    const bound = new Set(this.bySpell.values());
    return this.gestures.filter((g) => bound.has(g.id));
  }

  /** Bind a gesture to a spell. If another spell had that gesture, the two swap. */
  assign(spellId: string, gestureId: string): void {
    if (!this.spells.some((s) => s.id === spellId)) return;
    if (!this.gestures.some((g) => g.id === gestureId)) return;
    const previous = this.bySpell.get(spellId);
    for (const [otherId, g] of this.bySpell) {
      if (otherId !== spellId && g === gestureId && previous) this.bySpell.set(otherId, previous);
    }
    this.bySpell.set(spellId, gestureId);
    this.commit();
  }

  resetToDefaults(): void {
    this.applyDefaults();
    this.commit();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private commit(): void {
    saveJSON(STORAGE_KEY, Object.fromEntries(this.bySpell), this.store);
    this.listeners.forEach((fn) => fn());
  }

  private applyDefaults(): void {
    this.bySpell = new Map(this.spells.map((s) => [s.id, s.defaultGesture]));
  }

  private restore(): void {
    this.applyDefaults();
    const saved = loadJSON<Record<string, string>>(STORAGE_KEY, this.store);
    if (!saved || typeof saved !== 'object') return;
    const used = new Set<string>();
    const next = new Map<string, string>();
    for (const spell of this.spells) {
      const g = saved[spell.id];
      if (typeof g === 'string' && this.gestures.some((x) => x.id === g) && !used.has(g)) {
        next.set(spell.id, g);
        used.add(g);
      }
    }
    // Any spell the saved data could not place keeps its default if that is still free.
    for (const spell of this.spells) {
      if (next.has(spell.id)) continue;
      const fallback = this.gestures.find((g) => !used.has(g.id));
      const pick = used.has(spell.defaultGesture) ? fallback?.id : spell.defaultGesture;
      if (pick) {
        next.set(spell.id, pick);
        used.add(pick);
      }
    }
    this.bySpell = next;
  }
}
