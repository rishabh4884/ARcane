import { GESTURES } from '../config/gestures.ts';
import { SPELLS, type SpellDef } from '../config/spells.ts';
import { CHAPTERS, LEVELS, type LevelDef } from '../game/campaign.ts';
import type { Progress } from '../game/Progress.ts';
import type { SpellBook } from '../spells/SpellBook.ts';
import { CREATURE_SPECS, type CreatureKind } from '../world/EncounterState.ts';
import type { EncounterSnapshot } from '../world/Encounter.ts';
import { el } from './dom.ts';
import { createSpellIcon } from './spell-icons.ts';
import './game.css';

/**
 * THE GAME'S SCREENS
 * ──────────────────
 * Loading, the main menu, the Journey (every level on four winding paths), level cards, the
 * Grimoire, pause, victory and defeat, and the in-level HUD. Plain DOM over the living 3D wood.
 */

type Ui = (kind: 'hover' | 'select' | 'back' | 'unlock' | 'story') => void;
const noop: Ui = () => undefined;

function button(label: string, onClick: () => void, cls = 'g-button', ui: Ui = noop): HTMLButtonElement {
  const b = el('button', { class: cls, type: 'button' }, label);
  b.addEventListener('click', () => { ui('select'); onClick(); });
  b.addEventListener('pointerenter', () => ui('hover'));
  return b;
}

function screen(id: string, label: string): HTMLElement {
  const s = el('section', { class: `g-screen g-screen--${id}`, id: `screen-${id}`, 'aria-label': label, hidden: true });
  document.body.append(s);
  return s;
}

const gestureOf = (spell: SpellDef) => GESTURES.find((g) => g.id === spell.defaultGesture);
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ═════════════════════════════════ LOADING ═════════════════════════════════ */

export class LoadingScreen {
  readonly root = screen('loading', 'Loading');
  private readonly bar = el('span', { class: 'load-fill' });
  private readonly label = el('p', { class: 'load-label' }, 'Waking the wood…');
  private readonly enter: HTMLButtonElement;
  private readonly motes: HTMLCanvasElement = el('canvas', { class: 'load-motes', 'aria-hidden': 'true' });
  private raf = 0;

  constructor(onEnter: () => void, ui: Ui = noop) {
    const title = el('h1', { class: 'load-title' });
    for (const [i, ch] of [...'Arcane'].entries()) title.append(el('span', { style: { animationDelay: `${0.25 + i * 0.12}s` } }, ch));
    this.enter = button('Enter the Hushwood', onEnter, 'g-button g-button--primary load-enter', ui);
    this.enter.hidden = true;
    this.root.append(
      this.motes,
      el('div', { class: 'load-trees', 'aria-hidden': 'true' }, el('span'), el('span'), el('span')),
      el('div', { class: 'load-center' },
        el('p', { class: 'load-eyebrow' }, 'A dark fairy-tale adventure'),
        title,
        el('p', { class: 'load-tag' }, 'Forty levels. Eight rulers. One wood to free.'),
        el('div', { class: 'load-meter', role: 'progressbar', 'aria-label': 'Loading' }, this.bar),
        this.label,
        this.enter,
        el('p', { class: 'load-note' }, 'Played with your hands through your webcam. Nothing is recorded or sent anywhere.'),
      ),
    );
    this.root.hidden = false;
    this.drawMotes();
  }

  setProgress(fraction: number, label: string): void {
    this.bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, fraction))})`;
    this.label.textContent = label;
  }

  ready(): void {
    this.setProgress(1, 'The wood is listening.');
    this.enter.hidden = false;
    this.enter.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.classList.add('leaving');
    window.setTimeout(() => { this.root.hidden = true; cancelAnimationFrame(this.raf); }, 900);
  }

  /** Drifting embers behind the title. */
  private drawMotes(): void {
    const c = this.motes, g = c.getContext('2d');
    if (!g) return;
    const motes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, s: 0.01 + Math.random() * 0.03, p: Math.random() * 6 }));
    const frame = (time: number) => {
      const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = c.clientHeight * devicePixelRatio);
      g.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.y -= m.s * 0.01;
        if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
        const x = (m.x + Math.sin(time * 0.0004 + m.p) * 0.02) * w, y = m.y * h;
        const a = 0.25 + 0.5 * (Math.sin(time * 0.002 + m.p) * 0.5 + 0.5);
        const grad = g.createRadialGradient(x, y, 0, x, y, m.r * 6 * devicePixelRatio);
        grad.addColorStop(0, `rgba(255,214,150,${a})`);
        grad.addColorStop(1, 'rgba(255,214,150,0)');
        g.fillStyle = grad;
        g.beginPath(); g.arc(x, y, m.r * 6 * devicePixelRatio, 0, Math.PI * 2); g.fill();
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
}

/* ═════════════════════════════════ MAIN MENU ═════════════════════════════════ */

export interface MenuActions { onContinue(): void; onNew(): void; onJourney(): void; onGrimoire(): void; onSettings(): void; onReset(): void }

export class MenuScreen {
  readonly root = screen('menu', 'Main menu');
  private readonly cont = el('div', { class: 'menu-actions' });
  private readonly status = el('p', { class: 'menu-status' });
  private readonly freedNote = el('p', { class: 'menu-freed', hidden: true }, 'The Hushwood is free. Its lights are home.');

  constructor(private readonly actions: MenuActions, private readonly ui: Ui = noop) {
    this.root.append(
      el('div', { class: 'menu-panel' },
        el('p', { class: 'menu-eyebrow' }, 'The Hushwood'),
        el('h1', { class: 'menu-title' }, 'Arcane'),
        el('p', { class: 'menu-tag' }, 'Something took the light. Take it back.'),
        this.freedNote,
        this.cont,
        this.status,
      ),
      el('p', { class: 'menu-foot' }, 'Esc pauses · M mutes'),
    );
  }

  show(progress: Progress, camera: string): void {
    const frontier = progress.frontier;
    this.cont.replaceChildren();
    if (progress.started) {
      const label = progress.freed ? 'Return to the wood' : `Continue — ${frontier.id}. ${frontier.name}`;
      this.cont.append(button(label, this.actions.onContinue, 'g-button g-button--primary', this.ui));
    } else {
      this.cont.append(button('Begin the Journey', this.actions.onNew, 'g-button g-button--primary', this.ui));
    }
    this.cont.append(
      button('Journey', this.actions.onJourney, 'g-button', this.ui),
      button('Grimoire', this.actions.onGrimoire, 'g-button', this.ui),
      button('Spellbook & settings', this.actions.onSettings, 'g-button', this.ui),
    );
    if (progress.started) {
      const reset = button('Forget the journey', () => { if (window.confirm('Start over? Your progress and learned spells will be forgotten.')) this.actions.onReset(); }, 'g-button g-button--quiet', this.ui);
      this.cont.append(reset);
    }
    this.freedNote.hidden = !progress.freed;
    this.status.textContent = `${progress.completedCount} of ${LEVELS.length} levels · ${camera}`;
    this.root.hidden = false;
    this.root.classList.remove('leaving');
  }

  hide(): void { this.root.hidden = true; }
}

/* ═════════════════════════════════ JOURNEY ═════════════════════════════════ */

const KIND_LABEL: Record<LevelDef['kind'], string> = { normal: 'Three waves', sub: 'Three waves, then a sub-boss', final: 'Final boss' };

export class JourneyScreen {
  readonly root = screen('journey', 'The Journey');
  private readonly track = el('div', { class: 'journey-track' });
  private readonly card = el('aside', { class: 'level-card', hidden: true, role: 'dialog', 'aria-modal': 'true' });

  constructor(private readonly onBegin: (level: LevelDef) => void, private readonly onBack: () => void, private readonly ui: Ui = noop) {
    this.root.append(
      el('header', { class: 'g-header' },
        button('← Back', onBack, 'g-button g-button--quiet', ui),
        el('div', {}, el('p', { class: 'g-eyebrow' }, 'Forty levels · four reaches'), el('h2', {}, 'The Journey')),
      ),
      this.track,
      this.card,
    );
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.root.hidden) { if (!this.card.hidden) this.card.hidden = true; else onBack(); } });
  }

  show(progress: Progress): void {
    this.track.replaceChildren();
    for (const chapter of CHAPTERS) {
      const levels = LEVELS.filter((l) => l.chapter === chapter.id);
      const done = levels.filter((l) => progress.isComplete(l.id)).length;
      const open = progress.isUnlocked(levels[0].id);
      const path = el('div', { class: 'chapter-path' });
      // A winding path through the chapter's ten levels.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 1000 160');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('class', 'chapter-line');
      const d = levels.map((_, i) => `${i ? 'L' : 'M'}${50 + i * 100},${80 + Math.sin(i * 1.3 + chapter.id) * 46}`).join(' ');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', d);
      svg.append(line);
      path.append(svg);
      levels.forEach((level, i) => {
        const unlocked = progress.isUnlocked(level.id);
        const complete = progress.isComplete(level.id);
        const record = progress.record(level.id);
        const node = el('button', {
          class: `level-node level-node--${level.kind}${complete ? ' is-done' : ''}${unlocked ? '' : ' is-locked'}${progress.frontier.id === level.id ? ' is-next' : ''}`,
          type: 'button', 'aria-label': `Level ${level.id}: ${level.name}${unlocked ? '' : ' (locked)'}`,
          style: { left: `${5 + i * 10}%`, top: `${(80 + Math.sin(i * 1.3 + chapter.id) * 46) / 1.6}%` },
        },
        el('span', { class: 'node-num' }, level.kind === 'final' ? '♛' : level.kind === 'sub' ? '✦' : String(level.index)),
        el('span', { class: 'node-stars' }, complete ? '★'.repeat(record?.stars ?? 1) : ''));
        if (unlocked) {
          node.addEventListener('click', () => { this.ui('select'); this.openCard(level, progress); });
          node.addEventListener('pointerenter', () => this.ui('hover'));
        } else node.disabled = true;
        path.append(node);
      });
      this.track.append(el('section', { class: `chapter chapter--${chapter.mood}${open ? '' : ' is-sealed'}` },
        el('header', { class: 'chapter-head' },
          el('span', { class: 'chapter-numeral' }, chapter.numeral),
          el('div', {}, el('h3', {}, chapter.name), el('p', {}, open ? chapter.blurb : 'Sealed. Defeat the ruler of the reach before it.')),
          el('span', { class: 'chapter-count' }, `${done} / 10`)),
        path));
    }
    this.card.hidden = true;
    this.root.hidden = false;
    const next = this.track.querySelector<HTMLElement>('.is-next');
    next?.scrollIntoView({ block: 'center' });
  }

  private openCard(level: LevelDef, progress: Progress): void {
    const chapter = CHAPTERS[level.chapter - 1];
    const kinds = new Set<CreatureKind>();
    for (const wave of level.waves) for (const g of wave) kinds.add(g.kind);
    const reward = level.reward ? SPELLS.find((s) => s.id === level.reward) : undefined;
    const record = progress.record(level.id);
    this.card.replaceChildren(
      el('p', { class: 'g-eyebrow' }, `${chapter.numeral} · ${chapter.name} · Level ${level.index}`),
      el('h3', {}, level.name),
      el('p', { class: 'card-kind' }, KIND_LABEL[level.kind]),
      level.boss ? el('p', { class: 'card-boss' }, `${CREATURE_SPECS[level.boss].name} — ${CREATURE_SPECS[level.boss].title ?? ''}`) : '',
      kinds.size ? el('ul', { class: 'card-foes' }, ...[...kinds].map((k) => el('li', {}, CREATURE_SPECS[k].name))) : '',
      reward ? el('p', { class: 'card-reward' }, 'Surrenders a legendary spell: ', el('strong', {}, reward.name)) : '',
      record ? el('p', { class: 'card-record' }, `Best: ${fmtTime(record.time)} · ${'★'.repeat(record.stars)}`) : '',
      el('div', { class: 'card-actions' },
        button('Close', () => { this.card.hidden = true; }, 'g-button g-button--quiet', this.ui),
        button(record ? 'Play again' : 'Begin', () => this.onBegin(level), 'g-button g-button--primary', this.ui)),
    );
    this.card.hidden = false;
    this.card.querySelector<HTMLButtonElement>('.g-button--primary')?.focus({ preventScroll: true });
  }

  hide(): void { this.root.hidden = true; this.card.hidden = true; }
}

/* ═════════════════════════════════ GRIMOIRE ═════════════════════════════════ */

export class GrimoireScreen {
  readonly root = screen('grimoire', 'Grimoire');
  private readonly grid = el('div', { class: 'grimoire-grid' });

  constructor(private readonly book: SpellBook, private readonly onBack: () => void, ui: Ui = noop) {
    this.root.append(
      el('header', { class: 'g-header' },
        button('← Back', onBack, 'g-button g-button--quiet', ui),
        el('div', {}, el('p', { class: 'g-eyebrow' }, 'Every spell has its own movement'), el('h2', {}, 'The Grimoire'))),
      el('p', { class: 'grimoire-primer' }, 'Aim with the marker that follows your palm. Hold a sign until its ring fills; sweeps, strikes and circles cast the moment they are recognised. Legendary spells are taken from the things that rule the wood.'),
      this.grid,
    );
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.root.hidden) onBack(); });
  }

  show(): void {
    this.grid.replaceChildren();
    for (const spell of SPELLS) {
      const known = this.book.isKnown(spell.id);
      const g = this.book.gestureFor(spell.id) ?? gestureOf(spell);
      const card = el('article', { class: `spell-card${known ? '' : ' is-sealed'}${spell.tier === 'legend' ? ' is-legend' : ''}` },
        el('div', { class: 'spell-card-icon' }, createSpellIcon(spell.id)),
        el('div', { class: 'spell-card-body' },
          el('p', { class: 'spell-card-tier' }, spell.tier === 'legend' ? (known ? 'Legendary' : 'Sealed · Legendary') : 'Known'),
          el('h3', {}, known ? spell.name : spell.name),
          el('p', { class: 'spell-card-gesture' }, g ? `${g.glyph}  ${g.name}` : ''),
          el('p', { class: 'spell-card-hint' }, known ? g?.hint ?? '' : `Defeat the ruler of level ${spell.learnedAt} to learn it.`),
          el('p', { class: 'spell-card-effect' }, spell.effectText),
          el('p', { class: 'spell-card-lore' }, `“${spell.lore}”`),
          el('p', { class: 'spell-card-cd' }, `Returns in ${spell.cooldown}s`)));
      card.style.setProperty('--spell', spell.color);
      this.grid.append(card);
    }
    this.root.hidden = false;
  }

  hide(): void { this.root.hidden = true; }
}

/* ═════════════════════════════════ PAUSE ═════════════════════════════════ */

export interface PauseActions { onResume(): void; onRestart(): void; onGrimoire(): void; onSettings(): void; onLeave(): void }

export class PauseScreen {
  readonly root = screen('pause', 'Paused');
  constructor(actions: PauseActions, ui: Ui = noop) {
    this.root.append(el('div', { class: 'pause-panel' },
      el('p', { class: 'g-eyebrow' }, 'The wood waits'),
      el('h2', {}, 'Paused'),
      button('Resume', actions.onResume, 'g-button g-button--primary', ui),
      button('Restart level', actions.onRestart, 'g-button', ui),
      button('Grimoire', actions.onGrimoire, 'g-button', ui),
      button('Spellbook & settings', actions.onSettings, 'g-button', ui),
      button('Leave to the Journey', actions.onLeave, 'g-button g-button--quiet', ui)));
  }
  show(): void { this.root.hidden = false; this.root.querySelector<HTMLButtonElement>('.g-button--primary')?.focus({ preventScroll: true }); }
  hide(): void { this.root.hidden = true; }
}

/* ═════════════════════════════════ RESULTS ═════════════════════════════════ */

export class ResultScreen {
  readonly root = screen('result', 'Result');
  constructor(private readonly ui: Ui = noop) {}

  victory(level: LevelDef, stats: EncounterSnapshot['stats'], stars: number, learned: SpellDef | null, actions: { next?: () => void; journey: () => void; replay: () => void }): void {
    const chapter = CHAPTERS[level.chapter - 1];
    const parts: Array<Node | string> = [
      el('p', { class: 'g-eyebrow' }, `${chapter.numeral} · ${chapter.name} · Level ${level.index}`),
      el('h2', { class: 'result-title' }, level.kind === 'final' ? 'The ruler falls' : level.kind === 'sub' ? 'The great one is released' : 'The wood quiets'),
      el('p', { class: 'result-name' }, level.name),
      el('p', { class: 'result-stars', 'aria-label': `${stars} of 3 stars` }, ...[1, 2, 3].map((i) => el('span', { class: i <= stars ? 'on' : '' }, '★'))),
      el('dl', { class: 'result-stats' },
        el('div', {}, el('dt', {}, 'Time'), el('dd', {}, fmtTime(stats.time))),
        el('div', {}, el('dt', {}, 'Vitality lost'), el('dd', {}, String(Math.round(stats.damageTaken)))),
        el('div', {}, el('dt', {}, 'Spells cast'), el('dd', {}, String(stats.casts))),
        el('div', {}, el('dt', {}, 'Spirits released'), el('dd', {}, String(stats.released)))),
      el('p', { class: 'result-whisper' }, level.whisper),
    ];
    if (learned) {
      const g = gestureOf(learned);
      const reveal = el('div', { class: 'learned' },
        el('div', { class: 'learned-sigil' }, createSpellIcon(learned.id)),
        el('div', {},
          el('p', { class: 'g-eyebrow' }, 'Legendary spell learned'),
          el('h3', {}, learned.name),
          el('p', { class: 'learned-gesture' }, g ? `${g.glyph}  ${g.name} — ${g.hint}` : ''),
          el('p', { class: 'learned-effect' }, learned.effectText)));
      reveal.style.setProperty('--spell', learned.color);
      parts.push(reveal);
      this.ui('unlock');
    }
    const row = el('div', { class: 'result-actions' },
      button('Journey', actions.journey, 'g-button g-button--quiet', this.ui),
      button('Play again', actions.replay, 'g-button', this.ui));
    if (actions.next) row.append(button('Next level', actions.next, 'g-button g-button--primary', this.ui));
    parts.push(row);
    this.root.replaceChildren(el('div', { class: 'result-panel result-panel--won' }, ...parts));
    this.root.hidden = false;
    this.root.querySelector<HTMLButtonElement>('.g-button--primary')?.focus({ preventScroll: true });
  }

  defeat(level: LevelDef, actions: { retry: () => void; journey: () => void }): void {
    this.root.replaceChildren(el('div', { class: 'result-panel result-panel--lost' },
      el('p', { class: 'g-eyebrow' }, `Level ${level.id} · ${level.name}`),
      el('h2', { class: 'result-title' }, 'The wood claims you'),
      el('p', { class: 'result-whisper' }, 'Rest. The wood forgets quickly. So can you.'),
      el('div', { class: 'result-actions' },
        button('Journey', actions.journey, 'g-button g-button--quiet', this.ui),
        button('Try again', actions.retry, 'g-button g-button--primary', this.ui))));
    this.root.hidden = false;
    this.root.querySelector<HTMLButtonElement>('.g-button--primary')?.focus({ preventScroll: true });
  }

  hide(): void { this.root.hidden = true; }
}

/* ═════════════════════════════════ IN-LEVEL HUD ═════════════════════════════════ */

export class GameHud {
  readonly root = el('section', { class: 'game-hud', hidden: true, 'aria-label': 'Level' });
  private readonly where = el('div', { class: 'hud-where' });
  private readonly health = el('div', { class: 'hud-vital', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100' });
  private readonly healthFill = el('span', { class: 'hud-vital-fill' });
  private readonly healthGhost = el('span', { class: 'hud-vital-ghost' });
  private readonly healthValue = el('span', { class: 'hud-vital-value' });
  private readonly ward = el('span', { class: 'hud-ward' });
  private readonly waves = el('div', { class: 'hud-waves' });
  private readonly boss = el('div', { class: 'hud-boss', hidden: true });
  private readonly bossName = el('p', { class: 'hud-boss-name' });
  private readonly bossFill = el('span', { class: 'hud-boss-fill' });
  private readonly bossGhost = el('span', { class: 'hud-boss-ghost' });
  private readonly banner = el('div', { class: 'hud-banner', 'aria-live': 'polite' });
  private readonly tip = el('p', { class: 'hud-tip' });
  private ghost = 100;
  private bossGhostValue = 1;
  private bannerTimer = 0;

  constructor(parent: HTMLElement, onPause: () => void) {
    const pause = el('button', { class: 'hud-pause', type: 'button', 'aria-label': 'Pause (Esc)' }, el('span'), el('span'));
    pause.addEventListener('click', onPause);
    this.health.append(el('span', { class: 'hud-vital-label' }, 'Vitality'), this.healthValue, el('span', { class: 'hud-vital-track' }, this.healthGhost, this.healthFill), this.ward);
    this.boss.append(this.bossName, el('span', { class: 'hud-boss-track' }, this.bossGhost, this.bossFill, el('i', { style: { left: '33%' } }), el('i', { style: { left: '67%' } })));
    this.root.append(el('div', { class: 'hud-top' }, el('div', { class: 'hud-left' }, this.where, this.health), this.waves, pause), this.boss, this.banner, this.tip);
    parent.append(this.root);
  }

  start(level: LevelDef): void {
    const chapter = CHAPTERS[level.chapter - 1];
    this.where.replaceChildren(el('span', { class: 'hud-chapter' }, `${chapter.numeral} · ${chapter.name}`), el('span', { class: 'hud-level' }, `${level.index}. ${level.name}`));
    this.boss.hidden = true;
    this.ghost = 100;
    this.bossGhostValue = 1;
    this.tip.textContent = level.tip ?? '';
    this.tip.hidden = !level.tip;
    this.root.hidden = false;
    this.show(level.name, level.kind === 'final' ? 'The ruler of this reach awaits' : `${chapter.numeral} · Level ${level.index}`, 2.6);
  }

  hide(): void { this.root.hidden = true; }

  /** A large centred line that fades: wave calls, boss names, the end of a fight. */
  show(text: string, sub = '', seconds = 2.4): void {
    this.banner.replaceChildren(el('h2', {}, text), sub ? el('p', {}, sub) : '');
    this.banner.classList.remove('shown');
    void this.banner.offsetWidth;
    this.banner.classList.add('shown');
    this.bannerTimer = seconds;
  }

  update(s: EncounterSnapshot, dt: number): void {
    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) this.banner.classList.remove('shown');
    const hp = Math.max(0, s.player.health);
    this.ghost += (hp - this.ghost) * Math.min(1, dt * 1.5);
    if (this.ghost < hp) this.ghost = hp;
    this.healthFill.style.transform = `scaleX(${hp / 100})`;
    this.healthGhost.style.transform = `scaleX(${this.ghost / 100})`;
    this.healthValue.textContent = `${Math.ceil(hp)}`;
    this.health.setAttribute('aria-valuenow', String(Math.ceil(hp)));
    this.health.dataset.low = String(hp < 30);
    this.ward.textContent = s.player.veil > 0 ? `Moonveil ${Math.ceil(s.player.veil)}s` : s.player.shield > 0 ? `Ward ${Math.ceil(s.player.shield)} · ${Math.ceil(s.player.shieldTime)}s` : s.player.regen > 0 ? 'Blooming' : '';
    this.root.dataset.dark = String(s.player.darkness > 0);
    if (s.waves > 0) {
      const dots = Array.from({ length: s.waves }, (_, i) => el('i', { class: i < s.wave - (s.mode === 'wave' ? 1 : 0) || s.mode === 'boss' || s.mode === 'boss-intro' || s.mode === 'won' ? 'done' : i === s.wave - 1 ? 'now' : '' }));
      const label = s.mode === 'boss' || s.mode === 'boss-intro' ? 'The great one' : s.mode === 'breather' ? `Wave ${s.wave} cleared` : `Wave ${Math.max(1, s.wave)} of ${s.waves}`;
      this.waves.replaceChildren(el('span', {}, label), el('span', { class: 'hud-wave-dots' }, ...dots), el('span', { class: 'hud-left-count' }, s.mode === 'wave' ? `${s.alive} remain` : ''));
    } else this.waves.replaceChildren(el('span', {}, s.boss ? 'The ruler of the reach' : ''));
    if (s.boss) {
      this.boss.hidden = false;
      const f = Math.max(0, s.boss.health / s.boss.max);
      this.bossGhostValue += (f - this.bossGhostValue) * Math.min(1, dt * 1.2);
      if (this.bossGhostValue < f) this.bossGhostValue = f;
      this.bossFill.style.transform = `scaleX(${f})`;
      this.bossGhost.style.transform = `scaleX(${this.bossGhostValue})`;
      this.bossName.replaceChildren(el('strong', {}, s.boss.name), el('span', {}, s.boss.title));
    } else this.boss.hidden = true;
  }

  hideTip(): void { this.tip.hidden = true; }
}
