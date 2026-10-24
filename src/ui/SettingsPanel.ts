import { GESTURE_GROUPS, isDualGesture, type GestureDef, type GestureGroup } from '../config/gestures.ts';
import type { Tuning } from '../config/tuning.ts';
import type { SpellBook } from '../spells/SpellBook.ts';
import { el } from './dom.ts';

export interface SettingsOptions {
  book: SpellBook;
  tuning: Tuning;
  defaults: Tuning;
  onTuning: (t: Tuning) => void;
  onDebug: (visible: boolean) => void;
  isDebugVisible: () => boolean;
}

const smoothnessToCutoff = (s: number): number => 4 - (s / 100) * 3.5;
const cutoffToSmoothness = (c: number): number => Math.round(((4 - c) / 3.5) * 100);

/** The Spellbook panel: rebind gestures to spells and tune how the detection feels. */
export class SettingsPanel {
  readonly toggleButton: HTMLButtonElement;
  private readonly panel = el('aside', { class: 'panel', id: 'spellbook', hidden: true, 'aria-label': 'Spellbook' });
  private readonly o: SettingsOptions;
  private tuning: Tuning;

  constructor(root: HTMLElement, options: SettingsOptions) {
    this.o = options;
    this.tuning = structuredClone(options.tuning);
    this.toggleButton = el('button', { class: 'tool', type: 'button', 'aria-controls': 'spellbook', 'aria-expanded': 'false', onclick: () => this.toggle() }, 'Spellbook');
    root.append(this.toggleButton, this.panel);
    options.book.onChange(() => !this.panel.hidden && this.render());
    window.addEventListener('keydown', (e) => e.key === 'Escape' && !this.panel.hidden && this.toggle(false));
    this.render();
  }

  toggle(open = this.panel.hidden): void {
    this.panel.hidden = !open;
    this.toggleButton.setAttribute('aria-expanded', String(open));
    if (open) this.render();
  }

  private render(): void {
    const { book } = this.o;
    const rows = book.spells.map((spell) => {
      const current = book.gestureFor(spell.id);
      const option = (g: GestureDef) => {
        const opt = el('option', { value: g.id }, `${g.glyph} ${g.name}${isDualGesture(g) ? ' · 2 hands' : ''}`);
        if (current?.id === g.id) opt.selected = true;
        return opt;
      };
      const groups = (Object.keys(GESTURE_GROUPS) as GestureGroup[]).map((key) =>
        el('optgroup', { label: GESTURE_GROUPS[key] }, ...book.gestures.filter((g) => g.group === key).map(option)),
      );
      const select = el(
        'select',
        {
          'aria-label': `Gesture for ${spell.name}`,
          onchange: (e: Event) => book.assign(spell.id, (e.target as HTMLSelectElement).value),
        },
        ...groups,
      );
      return el(
        'div',
        { class: 'spell-row', style: { '--spell': spell.color } },
        el('label', { class: 'row' }, el('span', { class: 'dot' }), el('span', { class: 'label' }, spell.name), select),
        el('p', { class: 'hint' }, current?.hint ?? ''),
      );
    });

    const slider = (label: string, min: number, max: number, step: number, value: number, unit: string, set: (v: number) => void) => {
      const out = el('output', {}, `${value}${unit}`);
      const input = el('input', { type: 'range', min, max, step, value, 'aria-label': label });
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = `${v}${unit}`;
        set(v);
        this.o.onTuning(this.tuning);
      });
      return el('label', { class: 'row slider' }, el('span', { class: 'label' }, label), input, out);
    };

    const debug = el('input', { type: 'checkbox', id: 'arcane-debug-toggle' });
    debug.checked = this.o.isDebugVisible();
    debug.addEventListener('change', () => this.o.onDebug(debug.checked));

    this.panel.replaceChildren(
      el('header', {}, el('h2', {}, 'Spellbook'), el('button', { class: 'close', type: 'button', 'aria-label': 'Close spellbook', onclick: () => this.toggle(false) }, '×')),
      el('p', { class: 'note' }, 'Choose which gesture casts each spell. Pick one that is already used and the two swap. Gestures not assigned to a spell are switched off. Two-hand gestures need both hands in view. If two assigned gestures overlap, the stricter one wins.'),
      ...rows,
      el('h3', {}, 'Feel'),
      slider('Smoothness', 0, 100, 1, cutoffToSmoothness(this.tuning.smoothing.minCutoff), '', (v) => (this.tuning.smoothing.minCutoff = smoothnessToCutoff(v))),
      slider('Hold time', 150, 800, 10, this.tuning.poseHoldMs, ' ms', (v) => (this.tuning.poseHoldMs = v)),
      slider('Pause between casts', 200, 1500, 50, this.tuning.cooldownMs, ' ms', (v) => (this.tuning.cooldownMs = v)),
      slider('Reach', 1, 2, 0.05, this.tuning.cursorGain, '×', (v) => (this.tuning.cursorGain = v)),
      el('label', { class: 'row check' }, debug, el('span', {}, 'Show tracking view (D)')),
      el('button', {
        class: 'reset',
        type: 'button',
        onclick: () => {
          book.resetToDefaults();
          this.tuning = structuredClone(this.o.defaults);
          this.o.onTuning(this.tuning);
          this.render();
        },
      }, 'Restore defaults'),
    );
  }
}
