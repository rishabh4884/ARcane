import { describe, expect, it } from 'vitest';
import { GESTURES, GESTURE_GROUPS, isDualGesture } from '../src/config/gestures.ts';
import { SPELLS } from '../src/config/spells.ts';
import { SpellBook } from '../src/spells/SpellBook.ts';
import type { KeyValueStore } from '../src/storage.ts';

const memory = (seed: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
  };
};

describe('config integrity', () => {
  it('ships seven spells with a unique, valid default gesture each', () => {
    expect(SPELLS).toHaveLength(7);
    const defaults = SPELLS.map((s) => s.defaultGesture);
    expect(new Set(defaults).size).toBe(7);
    for (const id of defaults) expect(GESTURES.some((g) => g.id === id)).toBe(true);
  });

  it('offers a rich library: unique ids, every one grouped, one- and two-hand kinds', () => {
    expect(GESTURES.length).toBeGreaterThanOrEqual(24);
    expect(new Set(GESTURES.map((g) => g.id)).size).toBe(GESTURES.length);
    for (const g of GESTURES) {
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.hint.length).toBeGreaterThan(10);
      expect(g.group in GESTURE_GROUPS).toBe(true);
    }
    expect(GESTURES.some((g) => isDualGesture(g))).toBe(true);
    expect(GESTURES.some((g) => !isDualGesture(g))).toBe(true);
  });

  it('lists a stricter variant before the looser one it overlaps', () => {
    const at = (id: string) => GESTURES.findIndex((g) => g.id === id);
    expect(at('phoenix')).toBeLessThan(at('rise'));
    expect(at('gale')).toBeLessThan(at('swish'));
    expect(at('tempest')).toBeLessThan(at('swish'));
    expect(at('sunwise')).toBeLessThan(at('circle'));
    expect(at('moonwise')).toBeLessThan(at('circle'));
  });
});

describe('SpellBook', () => {
  it('starts from the defaults', () => {
    const book = new SpellBook(SPELLS, GESTURES, memory());
    expect(book.spellFor('bowdraw')?.id).toBe('spell-1');
    expect(book.gestureFor('spell-4')?.id).toBe('gale');
  });

  it('swaps bindings so a gesture never casts two spells', () => {
    const book = new SpellBook(SPELLS, GESTURES, memory());
    book.assign('spell-1', 'circle');
    expect(book.gestureFor('spell-1')?.id).toBe('circle');
    expect(book.gestureFor('spell-5')?.id).toBe('bowdraw');
    expect(book.spellFor('circle')?.id).toBe('spell-1');
  });

  it('persists and restores bindings', () => {
    const store = memory();
    new SpellBook(SPELLS, GESTURES, store).assign('spell-2', 'rise');
    const again = new SpellBook(SPELLS, GESTURES, store);
    expect(again.gestureFor('spell-2')?.id).toBe('rise');
  });

  it('upgrades an old held-point Bow binding without resetting other spell settings', () => {
    const store = memory({ 'arcane.spellbook.v1': '{"spell-1":"lance","spell-2":"fist"}' });
    const book = new SpellBook(SPELLS, GESTURES, store);
    expect(book.gestureFor('spell-1')?.id).toBe('bowdraw');
    expect(book.gestureFor('spell-2')?.id).toBe('fist');
  });

  it('survives corrupted saved data', () => {
    const book = new SpellBook(SPELLS, GESTURES, memory({ 'arcane.spellbook.v1': '{"spell-1":"nope","spell-2":"nope"}' }));
    expect(book.gestureFor('spell-1')).toBeDefined();
    const ids = SPELLS.map((s) => book.gestureFor(s.id)?.id);
    expect(new Set(ids).size).toBe(7);
  });

  it('resets to defaults', () => {
    const book = new SpellBook(SPELLS, GESTURES, memory());
    book.assign('spell-1', 'rise');
    book.resetToDefaults();
    expect(book.gestureFor('spell-1')?.id).toBe('bowdraw');
  });

  it('only activates gestures that are bound to a spell', () => {
    const book = new SpellBook(SPELLS, GESTURES, memory());
    expect(book.activeGestures().map((g) => g.id).sort()).toEqual(SPELLS.map((s) => s.defaultGesture).sort());
    book.assign('spell-1', 'eclipse');
    const ids = book.activeGestures().map((g) => g.id);
    expect(ids).toContain('eclipse');
    expect(ids).not.toContain('fist');
    expect(ids).toHaveLength(7);
  });

  it('lets a gesture nobody uses replace the old one without swapping', () => {
    const book = new SpellBook(SPELLS, GESTURES, memory());
    book.assign('spell-2', 'cataclysm');
    expect(book.gestureFor('spell-2')?.id).toBe('cataclysm');
    expect(book.spellFor('impale')).toBeUndefined();
  });
});
