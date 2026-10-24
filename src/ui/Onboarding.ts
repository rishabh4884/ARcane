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
    description: 'Wrap a target in ice for a few seconds and flash its armor. It does not slow or immobilize gameplay yet.',
  },
  wind: {
    role: 'STRIKE',
    description: 'Send a directional gust across the field. It creates an impact reaction, but does not push enemies back.',
  },
  healing: {
    role: 'SUPPORT · PREVIEW',
    description: 'Knit a broken ring of restorative light. Healing is visual only for now; health is not tracked.',
  },
  summon: {
    role: 'SUMMON · PREVIEW',
    description: 'Raise two spectral sentries from the ground. They look the part, but do not fight yet.',
  },
  shield: {
    role: 'WARD · PREVIEW',
    description: 'Unfold a protective ward in front of you. It does not block hits yet.',
  },
};

/** First-run camera setup and an always-available, live spell reference. */
export class Onboarding {
  private readonly dialog = qs<HTMLElement>('#intro');
  private readonly shell = qs<HTMLElement>('.onboarding-shell');
  private readonly welcome = qs<HTMLElement>('#onboarding-welcome');
  private readonly guide = qs<HTMLElement>('#onboarding-guide');
  private readonly stepLabel = qs<HTMLElement>('#onboarding-step');
  private readonly title = qs<HTMLElement>('#onboarding-title');
  private readonly lead = qs<HTMLElement>('.welcome-lead');
  private readonly beginButton = qs<HTMLButtonElement>('#onboarding-begin');
  private readonly reviewButton = qs<HTMLButtonElement>('#onboarding-review');
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
  private previewMode = false;

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
    this.backButton.addEventListener('click', () => this.showWelcome());
    qs<HTMLButtonElement>('#onboarding-explore').addEventListener('click', () => {
      this.previewMode = true;
      this.close();
    });
    this.skipButton.onclick = () => { if (this.cameraReady || this.previewMode) this.close(); };
    this.book.onChange(() => this.renderSpells());
    document.addEventListener('keydown', (event) => this.onKeyDown(event));

    this.renderWelcome();
    this.renderSpells();
    this.showWelcome();
  }

  private async beginFromWelcome(): Promise<void> {
    if (this.cameraReady) {
      this.showGuide(true);
      return;
    }
    this.setBusy(this.beginButton, true, 'Starting camera…', this.welcomeMessage);
    this.shell.setAttribute('aria-busy', 'true');
    try {
      await this.startCamera();
      this.cameraReady = true;
      this.welcomeMessage.textContent = '';
      this.welcomeMessage.dataset.state = '';
      if (this.hasSeenGuide) this.close();
      else this.showGuide(true);
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
    this.hud.inert = true;
    this.welcome.hidden = false;
    this.guide.hidden = true;
    this.canReturnToWelcome = false;
    document.body.classList.add('is-intro');
    this.stepLabel.replaceChildren('FIRST LIGHT ', el('i', {}, '01 / 02'));
    this.renderWelcome();
    this.welcomeMessage.textContent = this.cameraReady
      ? 'Camera ready. You can review the guide or continue playing.'
      : 'Your browser will ask for camera access.';
    this.welcomeMessage.dataset.state = '';
    this.shell.focus();
  }

  private showGuide(returnToWelcome: boolean): void {
    this.dialog.hidden = false;
    this.shell.classList.add('guide-open');
    this.hud.inert = true;
    this.welcome.hidden = true;
    this.guide.hidden = false;
    this.canReturnToWelcome = returnToWelcome;
    this.backButton.hidden = !returnToWelcome;
    document.body.classList.add('is-intro');
    this.stepLabel.replaceChildren('SPELLBOOK ', el('i', {}, '02 / 02'));
    this.guideMessage.textContent = '';
    this.guideMessage.dataset.state = '';
    const compact = window.matchMedia('(max-width: 560px)').matches;
    this.enterButton.textContent = this.cameraReady
      ? compact ? 'Enter arena' : 'Enter the arena'
      : compact ? 'Enable camera' : 'Enable camera & enter';
    this.enterButton.setAttribute('aria-label', this.cameraReady ? 'Enter the arena' : 'Enable camera and enter the arena');
    this.backButton.textContent = compact ? 'Back' : 'Back to setup';
    this.backButton.setAttribute('aria-label', 'Back to camera setup');
    this.skipButton.hidden = !(this.cameraReady || this.previewMode);
    this.skipButton.textContent = this.previewMode && !this.cameraReady ? 'Back to exploring' : compact ? 'Skip' : 'Skip guide';
    this.skipButton.setAttribute('aria-label', 'Close guide and return to the world');
    this.renderSpells();
    this.shell.focus();
  }

  private renderWelcome(): void {
    if (this.hasSeenGuide) {
      this.title.replaceChildren('Welcome', document.createElement('br'), 'back, caster.');
      this.lead.textContent = 'The field is waiting. Review your spells or jump straight in.';
      this.beginButton.textContent = this.cameraReady ? 'Continue to spell guide' : 'Begin casting';
      this.reviewButton.textContent = this.cameraReady ? 'Enter the arena' : 'Review the spell guide';
      this.reviewButton.onclick = () => {
        if (this.cameraReady) void this.enterGame();
        else this.showGuide(true);
      };
      return;
    }
    this.title.replaceChildren('The magic', document.createElement('br'), 'starts with you.');
    this.lead.textContent = 'Your hands are the wand. Let’s get you ready to cast.';
    this.beginButton.textContent = this.cameraReady ? 'Continue to spell guide' : 'Enable camera & continue';
    this.reviewButton.textContent = 'See the spell guide first';
    this.reviewButton.onclick = () => this.showGuide(true);
  }

  private renderSpells(): void {
    this.guideGrid.replaceChildren(...this.book.spells.map((spell, index) => {
      const gesture = this.book.gestureFor(spell.id);
      const guide = SPELL_GUIDE[spell.effect];
      const key = el('kbd', { class: 'spell-key', 'aria-label': `Keyboard shortcut ${index + 1}` }, String(index + 1));
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
          key,
        ),
        el('p', { class: 'spell-description' }, guide.description),
        el(
          'div',
          { class: 'spell-gesture' },
          el('span', { class: 'spell-gesture-label' }, `CAST · ${gesture?.glyph ?? '✦'} ${gesture?.name ?? 'Unbound'}`),
          el('span', { class: 'spell-gesture-hint' }, gesture?.hint ?? 'Choose a gesture in the Spellbook.'),
        ),
      );
    }));
  }

  private close(): void {
    this.dialog.hidden = true;
    document.body.classList.remove('is-intro');
    this.hud.inert = false;
    document.body.dataset.worldMode = this.cameraReady ? 'hands' : 'explore';
    if (this.previewMode && !this.cameraReady) {
      const status = this.hud.querySelector<HTMLElement>('.status');
      if (status) status.textContent = 'Exploring · camera off';
    }
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
      if (this.cameraReady || this.previewMode) this.close();
      else if (!this.guide.hidden) this.showWelcome();
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
