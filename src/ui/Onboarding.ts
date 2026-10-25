import type { SpellEffect } from '../config/spells.ts';
import type { SpellBook } from '../spells/SpellBook.ts';
import { loadJSON, saveJSON } from '../storage.ts';
import { describeError } from './errors.ts';
import { createSpellIcon } from './spell-icons.ts';
import { el, qs } from './dom.ts';

const SEEN_KEY = 'arcane.onboarding.v1';

const SPELL_GUIDE: Record<SpellEffect, { role: string; description: string }> = {
  arrow: {
    role: 'PROJECTILE',
    description: 'Send a bright arrow toward the point you’re aiming at. Pull farther to make the shot’s visual impact larger.',
  },
  lightning: {
    role: 'STRIKE',
    description: 'Call a branching bolt down onto the point beneath your hand marker.',
  },
  frost: {
    role: 'CONTROL',
    description: 'Bind a spirit in growing ice. It cannot move or attack while frozen.',
  },
  wind: {
    role: 'STRIKE',
    description: 'A sweeping gust damages and knocks a spirit away, giving you room to move.',
  },
  healing: {
    role: 'RESTORE',
    description: 'Restore 30 vitality, up to 100. Mend recovers for seven seconds between casts.',
  },
  summon: {
    role: 'SUMMON · 10 SECONDS',
    description: 'Two swift woodland gnomes sprint into range and fire rune bolts at visible enemies, then fade.',
  },
  shield: {
    role: 'WARD',
    description: 'Absorb up to 45 damage for five seconds. The ward takes six seconds to recover.',
  },
};

/** First-run camera setup and an always-available, live spell reference. */
export class Onboarding {
  private readonly dialog = qs<HTMLElement>('#intro');
  private readonly shell = qs<HTMLElement>('.onboarding-shell');
  private readonly welcome = qs<HTMLElement>('#onboarding-welcome');
  private readonly story = qs<HTMLElement>('#onboarding-story');
  private readonly guide = qs<HTMLElement>('#onboarding-guide');
  private readonly stepLabel = qs<HTMLElement>('#onboarding-step');
  private readonly title = qs<HTMLElement>('#onboarding-title');
  private readonly beginButton = qs<HTMLButtonElement>('#onboarding-begin');
  private readonly storyEnterButton = qs<HTMLButtonElement>('#onboarding-story-enter');
  private readonly welcomeMessage = qs<HTMLElement>('#onboarding-message');
  private readonly guideMessage = qs<HTMLElement>('#guide-message');
  private readonly guideGrid = qs<HTMLElement>('#spell-guide-grid');
  private readonly backButton = qs<HTMLButtonElement>('#guide-back');
  private readonly enterButton = qs<HTMLButtonElement>('#guide-enter');
  private readonly skipButton = qs<HTMLButtonElement>('#guide-skip');
  private readonly guideButton: HTMLButtonElement;
  private readonly hud: HTMLElement;
  private readonly book: SpellBook;
  private readonly startCamera: () => Promise<void>;
  private hasSeenGuide = loadJSON<boolean>(SEEN_KEY) === true;
  private cameraReady = false;
  private canReturnToWelcome = false;

  constructor(root: HTMLElement, book: SpellBook, startCamera: () => Promise<void>) {
    this.hud = root;
    this.book = book;
    this.startCamera = startCamera;
    this.guideButton = el(
      'button',
      {
        class: 'guide-tool',
        type: 'button',
            'aria-controls': 'intro',
            'aria-haspopup': 'dialog',
        title: 'Open the spell guide',
        onclick: () => this.openGuide(),
      },
      'Guide',
    );
    root.append(this.guideButton);

    this.beginButton.addEventListener('click', () => void this.beginFromWelcome());
    this.enterButton.addEventListener('click', () => void this.enterGame());
    this.storyEnterButton.addEventListener('click', () => void this.enterGame());
    this.backButton.addEventListener('click', () => this.showWelcome());
    this.skipButton.onclick = () => { if (this.cameraReady) this.close(); };
    this.book.onChange(() => this.renderSpells());
    document.addEventListener('keydown', (event) => this.onKeyDown(event));

    this.renderWelcome();
    this.renderSpells();
    this.showWelcome();
  }

  private async beginFromWelcome(): Promise<void> {
    if (this.cameraReady) {
      this.showStory();
      return;
    }
    this.setBusy(this.beginButton, true, 'Starting camera…', this.welcomeMessage);
    this.shell.setAttribute('aria-busy', 'true');
    try {
      await this.startCamera();
      this.cameraReady = true;
      this.welcomeMessage.textContent = '';
      this.welcomeMessage.dataset.state = '';
      this.showStory();
    } catch (error) {
      this.showError(this.welcomeMessage, error);
      this.beginButton.textContent = 'Try camera again';
    } finally {
      this.beginButton.disabled = false;
      this.shell.removeAttribute('aria-busy');
    }
  }

  private async enterGame(): Promise<void> {
    if (!this.cameraReady) {
      this.setBusy(this.enterButton, true, 'Starting camera…', this.guideMessage);
      this.skipButton.disabled = true;
      this.shell.setAttribute('aria-busy', 'true');
      try {
        await this.startCamera();
        this.cameraReady = true;
      } catch (error) {
        this.showError(this.guideMessage, error);
        this.enterButton.textContent = 'Try camera again';
        this.enterButton.disabled = false;
        this.skipButton.disabled = false;
        this.shell.removeAttribute('aria-busy');
        return;
      }
      this.shell.removeAttribute('aria-busy');
    }
    this.hasSeenGuide = true;
    saveJSON(SEEN_KEY, true);
    this.close();
  }

  private openGuide(): void {
    this.canReturnToWelcome = false;
    this.showGuide(false);
  }

  private showWelcome(): void {
    this.dialog.hidden = false;
    this.shell.classList.remove('guide-open');
    this.dialog.classList.remove('story-scene');
    this.hud.inert = true;
    this.welcome.hidden = false;
    this.story.hidden = true;
    this.guide.hidden = true;
    this.canReturnToWelcome = false;
    document.body.classList.add('is-intro');
    this.stepLabel.hidden = true;
    this.shell.setAttribute('aria-labelledby', 'onboarding-title');
    this.shell.classList.remove('story-open');
    this.renderWelcome();
    this.welcomeMessage.textContent = '';
    this.welcomeMessage.dataset.state = '';
    this.shell.focus();
  }

  private showGuide(returnToWelcome: boolean): void {
    this.dialog.hidden = false;
    this.dialog.classList.remove('story-scene');
    this.shell.classList.add('guide-open');
    this.hud.inert = true;
    this.welcome.hidden = true;
    this.story.hidden = true;
    this.guide.hidden = false;
    this.canReturnToWelcome = returnToWelcome;
    this.backButton.hidden = !returnToWelcome;
    document.body.classList.add('is-intro');
    this.stepLabel.replaceChildren('SPELLBOOK ', el('i', {}, '02 / 02'));
    this.stepLabel.hidden = false;
    this.shell.setAttribute('aria-labelledby', 'guide-title');
    this.shell.classList.remove('story-open');
    this.guideMessage.textContent = '';
    this.guideMessage.dataset.state = '';
    const compact = window.matchMedia('(max-width: 560px)').matches;
    this.enterButton.textContent = this.cameraReady
      ? compact ? 'Enter arena' : 'Enter the arena'
      : compact ? 'Enable camera' : 'Enable camera & enter';
    this.enterButton.setAttribute('aria-label', this.cameraReady ? 'Enter the arena' : 'Enable camera and enter the arena');
    this.backButton.textContent = compact ? 'Back' : 'Back to setup';
    this.backButton.setAttribute('aria-label', 'Back to camera setup');
    this.skipButton.hidden = !this.cameraReady;
    this.skipButton.textContent = compact ? 'Skip' : 'Skip guide';
    this.skipButton.setAttribute('aria-label', 'Close guide and return to the world');
    this.renderSpells();
    this.shell.focus();
  }

  private showStory(): void {
    this.dialog.hidden = false;
    this.dialog.classList.add('story-scene');
    this.shell.classList.add('story-open');
    this.hud.inert = true;
    this.welcome.hidden = true;
    this.guide.hidden = true;
    this.story.hidden = false;
    this.canReturnToWelcome = false;
    this.stepLabel.hidden = true;
    this.shell.setAttribute('aria-labelledby', 'story-quote');
    document.body.classList.add('is-intro');
    this.shell.focus();
    this.storyEnterButton.focus();
  }

  private renderWelcome(): void {
    this.title.textContent = 'Arcane';
    this.beginButton.textContent = this.cameraReady ? 'Begin casting' : 'Begin casting';
  }

  private renderSpells(): void {
    this.guideGrid.replaceChildren(...this.book.spells.map((spell) => {
      const gesture = this.book.gestureFor(spell.id);
      const guide = SPELL_GUIDE[spell.effect];
      const icon = createSpellIcon(spell.id);
      icon.classList.add('guide-spell-icon');
      return el(
        'article',
        { class: 'spell-guide-card', style: { '--spell': spell.color } },
        el(
          'header',
          { class: 'spell-guide-heading' },
          icon,
          el('div', { class: 'spell-guide-name' },
            el('h3', {}, spell.name),
            el('span', { class: 'spell-role' }, guide.role),
          ),
        ),
        el('p', { class: 'spell-description' }, guide.description),
        el(
          'div',
          { class: 'spell-gesture' },
          el('span', { class: 'spell-gesture-label' }, `CAST · ${gesture?.glyph ?? '✦'} ${gesture?.name ?? 'Unbound'}`),
          el('span', { class: 'spell-gesture-hint' }, gesture?.hint ?? 'No gesture is currently assigned.'),
        ),
      );
    }));
  }

  private close(): void {
    this.dialog.hidden = true;
    this.dialog.classList.remove('story-scene');
    document.body.classList.remove('is-intro');
    this.hud.inert = false;
    document.body.dataset.worldMode = this.cameraReady ? 'hands' : 'explore';
    qs<HTMLCanvasElement>('#world canvas').focus({ preventScroll: true });
  }

  private setBusy(button: HTMLButtonElement, busy: boolean, message: string, status: HTMLElement): void {
    button.disabled = busy;
    status.textContent = busy ? message : '';
    status.dataset.state = busy ? 'busy' : '';
  }

  private showError(status: HTMLElement, error: unknown): void {
    status.textContent = describeError(error);
    status.dataset.state = 'error';
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.dialog.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!this.story.hidden || this.welcome.hidden && this.guide.hidden) return;
      if (!this.guide.hidden) {
        if (this.cameraReady) this.close();
        else this.showWelcome();
      }
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = [...this.dialog.querySelectorAll<HTMLElement>('button:not(:disabled):not([hidden]), [tabindex="0"]')]
      .filter((element) => element.getClientRects().length > 0);
    const first = focusables[0];
    const last = focusables.at(-1);
    if (!first || !last) {
      event.preventDefault();
      this.shell.focus();
    } else if (document.activeElement === this.shell) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (!this.dialog.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
