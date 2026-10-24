import type { GestureDef } from '../config/gestures.ts';
import type { EngineOutput } from '../gestures/GestureEngine.ts';
import type { SpellBook } from '../spells/SpellBook.ts';
import { el } from './dom.ts';

interface Slot {
  root: HTMLElement;
  gesture: HTMLElement;
  glyph: HTMLElement;
  bar: HTMLElement;
}

/** The spell dock and hand-status line. Purely presentational: it never touches tracking. */
export class Hud {
  private readonly book: SpellBook;
  private readonly dock = el('nav', { class: 'dock', 'aria-label': 'Spells' });
  private readonly status = el('p', { class: 'status', role: 'status' });
  private readonly slots = new Map<string, Slot>();
  private lastStatus = '';

  constructor(root: HTMLElement, book: SpellBook) {
    this.book = book;
    root.append(this.status, this.dock);
    this.build();
    book.onChange(() => this.build());
  }

  /** Called every camera frame. `charges` lists every spell currently filling, one per hand at most. */
  update(out: EngineOutput, charges: ReadonlyArray<{ spellId: string; progress: number }>): void {
    const text = !out.present
      ? 'Raise a hand in front of the camera'
      : out.hold
        ? 'Hold it…'
        : out.hands.length > 1
          ? 'Both hands found'
          : `${out.hands[0]?.side === 'left' ? 'Left' : 'Right'} hand found`;
    if (text !== this.lastStatus) {
      this.lastStatus = text;
      this.status.textContent = text;
      this.status.dataset.state = out.present ? 'ok' : 'idle';
    }
    for (const [id, slot] of this.slots) {
      let progress = 0;
      for (const c of charges) if (c.spellId === id) progress = Math.max(progress, c.progress);
      slot.bar.style.transform = `scaleX(${progress})`;
    }
  }

  flash(spellId: string): void {
    const slot = this.slots.get(spellId);
    if (!slot) return;
    slot.root.classList.remove('cast');
    void slot.root.offsetWidth; // restart the CSS animation
    slot.root.classList.add('cast');
  }

  private build(): void {
    this.dock.replaceChildren();
    this.slots.clear();
    for (const spell of this.book.spells) {
      const g: GestureDef | undefined = this.book.gestureFor(spell.id);
      const glyph = el('span', { class: 'glyph', 'aria-hidden': 'true' }, g?.glyph ?? '?');
      const gesture = el('span', { class: 'gesture' }, g?.name ?? '');
      const bar = el('span', { class: 'bar' });
      const root = el(
        'div',
        { class: 'slot', style: { '--spell': spell.color }, title: g?.hint ?? '' },
        glyph,
        el('span', { class: 'name' }, spell.name),
        gesture,
        bar,
      );
      this.dock.append(root);
      this.slots.set(spell.id, { root, gesture, glyph, bar });
    }
  }
}
