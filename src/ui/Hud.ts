import type { GestureDef } from '../config/gestures.ts';
import type { EngineOutput } from '../gestures/GestureEngine.ts';
import type { SpellBook } from '../spells/SpellBook.ts';
import { el } from './dom.ts';
import { createSpellIcon } from './spell-icons.ts';

interface Slot {
  root: HTMLElement;
  gesture: HTMLElement;
  bar: HTMLElement;
  cooldown: HTMLElement;
  effect: string;
  recovering: boolean;
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
    this.lastStatus = 'Raise a hand in front of the camera';
    this.status.textContent = this.lastStatus;
    this.status.dataset.state = 'idle';
    root.append(this.status, this.dock);
    this.build();
    book.onChange(() => this.build());
  }

  /** Called every camera frame. `charges` lists every spell currently filling, one per hand at most. */
  update(out: EngineOutput, charges: ReadonlyArray<{ spellId: string; progress: number }>): void {
    const text = !out.present
      ? 'Raise a hand in front of the camera'
      : out.bow
        ? out.bow.phase === 'arming' ? 'Pinch, then pull back…' : out.bow.phase === 'ready' ? 'Release to fire' : 'Pull farther…'
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

  /** Recovery sweep per slot, keyed by spell effect. */
  setCooldowns(cooldowns: Record<string, { remaining: number; total: number }>): void {
    for (const slot of this.slots.values()) {
      const cd = cooldowns[slot.effect];
      const fraction = cd && cd.total > 0 ? Math.max(0, Math.min(1, cd.remaining / cd.total)) : 0;
      const recovering = fraction > 0.001;
      slot.cooldown.style.setProperty('--cd', fraction.toFixed(3));
      if (recovering !== slot.recovering) {
        slot.recovering = recovering;
        slot.root.classList.toggle('recovering', recovering);
        // A short shimmer when a spell becomes ready again.
        if (!recovering) {
          slot.root.classList.remove('ready');
          void slot.root.offsetWidth;
          slot.root.classList.add('ready');
        }
      }
    }
  }

  /** The gesture was recognised but the spell is still recovering: a small shake on its slot. */
  refuse(spellId: string): void {
    const slot = this.slots.get(spellId);
    if (!slot) return;
    slot.root.classList.remove('refused');
    void slot.root.offsetWidth;
    slot.root.classList.add('refused');
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
      const icon = createSpellIcon(spell.id);
      const gesture = el('span', { class: 'gesture' }, g ? `${g.glyph} ${g.name}` : '');
      const bar = el('span', { class: 'bar' });
      const cooldown = el('span', { class: 'cooldown', 'aria-hidden': 'true' });
      const root = el(
        'div',
        { class: 'slot', style: { '--spell': spell.color }, title: g?.hint ?? '', 'aria-label': `${spell.name}: ${g?.name ?? 'unbound'}` },
        cooldown,
        icon,
        el('span', { class: 'name' }, spell.name),
        gesture,
        bar,
      );
      this.dock.append(root);
      this.slots.set(spell.id, { root, gesture, bar, cooldown, effect: spell.effect, recovering: false });
    }
  }
}
