import type { AudioEngine } from '../audio/AudioEngine.ts';
import { SPELLS } from '../config/spells.ts';
import { SCRIPTS } from '../cutscene/scripts.ts';
import { CutscenePlayer } from '../cutscene/Cutscene.ts';
import type { SpellBook } from '../spells/SpellBook.ts';
import type { SettingsPanel } from '../ui/SettingsPanel.ts';
import { GameHud, GrimoireScreen, JourneyScreen, LoadingScreen, MenuScreen, PauseScreen, ResultScreen } from '../ui/screens.ts';
import type { World } from '../world/World.ts';
import { chapterOf, levelById, LEVELS, type LevelDef } from './campaign.ts';
import { Progress } from './Progress.ts';

type State = 'loading' | 'menu' | 'journey' | 'grimoire' | 'cutscene' | 'level' | 'paused' | 'result';

export interface GameDeps {
  world: World;
  audio: AudioEngine;
  book: SpellBook;
  settings: SettingsPanel;
  hudRoot: HTMLElement;
  /** Opens the camera and starts hand tracking. */
  startCamera(): Promise<void>;
}

/**
 * THE GAME
 * ────────
 * The flow from the loading screen to the freed wood: menus, the Journey, cutscenes before and
 * after levels, the level itself (waves, bosses, banners), pause, results, learning legendary
 * spells, and the ending that turns the Hushwood bright again.
 */
export class Game {
  readonly progress = new Progress();
  private state: State = 'loading';
  private readonly loading: LoadingScreen;
  private readonly menu: MenuScreen;
  private readonly journey: JourneyScreen;
  private readonly grimoire: GrimoireScreen;
  private readonly pause: PauseScreen;
  private readonly result: ResultScreen;
  private readonly hud: GameHud;
  private readonly cutscenes: CutscenePlayer;
  private level: LevelDef | null = null;
  private grimoireReturn: State = 'menu';
  private cameraState = 'Camera not started';
  private last = performance.now();
  private resolved = false;

  constructor(private readonly deps: GameDeps) {
    const ui = (kind: 'hover' | 'select' | 'back' | 'unlock' | 'story') => deps.audio.ui(kind);
    deps.book.setLearned(this.progress.learned);
    this.loading = new LoadingScreen(() => this.enter(), ui);
    this.menu = new MenuScreen({
      onContinue: () => this.playLevel(this.progress.freed ? LEVELS[LEVELS.length - 1] : this.progress.frontier),
      onNew: () => this.playLevel(LEVELS[0]),
      onJourney: () => this.openJourney(),
      onGrimoire: () => this.openGrimoire('menu'),
      onSettings: () => deps.settings.toggle(true),
      onReset: () => { this.progress.reset(); deps.book.setLearned([]); this.toMenu(); },
    }, ui);
    this.journey = new JourneyScreen((level) => { this.journey.hide(); this.playLevel(level); }, () => { ui('back'); this.toMenu(); }, ui);
    this.grimoire = new GrimoireScreen(deps.book, () => { ui('back'); this.closeGrimoire(); }, ui);
    this.pause = new PauseScreen({
      onResume: () => this.resume(),
      onRestart: () => { this.resume(); if (this.level) this.startLevel(this.level); },
      onGrimoire: () => { this.pause.hide(); this.openGrimoire('paused'); },
      onSettings: () => deps.settings.toggle(true),
      onLeave: () => { this.resume(); this.leaveLevel(); this.openJourney(); },
    }, ui);
    this.result = new ResultScreen(ui);
    this.hud = new GameHud(deps.hudRoot, () => this.pauseGame());
    this.cutscenes = new CutscenePlayer(deps.world, ui);
    this.setBody('loading');
    deps.world.setAmbient(true);
    deps.world.setMood(this.progress.freed ? 'dawn' : 'edge', 0.01);
    deps.world.events.on((e) => this.onEvent(e));
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.repeat) return;
      if (document.querySelector<HTMLElement>('#spellbook')?.hidden === false) return;
      if (this.state === 'level') this.pauseGame();
      else if (this.state === 'paused') this.resume();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'level') this.pauseGame(); });
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.state === 'level' || this.state === 'paused') this.hud.update(deps.world.snapshot(), this.state === 'paused' ? 0 : dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Warm the wood up behind the loading screen: shaders, every creature, the hand model. */
  async boot(warm: (step: (fraction: number, label: string) => void) => Promise<void>): Promise<void> {
    try {
      await warm((f, label) => this.loading.setProgress(f, label));
    } catch (error) {
      console.warn('[arcane] warm-up step failed', error);
    }
    this.loading.ready();
  }

  private async enter(): Promise<void> {
    this.deps.audio.unlock();
    this.loading.hide();
    this.cameraState = 'Starting camera…';
    this.toMenu();
    try {
      await this.deps.startCamera();
      this.cameraState = 'Camera ready';
    } catch (error) {
      console.warn('[arcane] camera failed', error);
      this.cameraState = 'Camera unavailable: allow camera access to cast';
    }
    if (this.state === 'menu') this.menu.show(this.progress, this.cameraState);
  }

  private setBody(state: State): void {
    this.state = state;
    const c = document.body.classList;
    c.toggle('is-intro', state === 'loading');
    c.toggle('is-menu', state === 'menu' || state === 'journey' || state === 'grimoire' || state === 'result');
    c.toggle('is-paused', state === 'paused');
    c.toggle('is-playing', state === 'level' || state === 'paused');
  }

  private hideScreens(): void {
    this.menu.hide(); this.journey.hide(); this.grimoire.hide(); this.pause.hide(); this.result.hide();
  }

  private toMenu(): void {
    this.hideScreens();
    this.hud.hide();
    this.deps.world.stopLevel();
    this.deps.world.setAmbient(true);
    this.deps.world.setMood(this.progress.freed ? 'dawn' : 'edge', 2.5);
    this.setBody('menu');
    this.menu.show(this.progress, this.cameraState);
  }

  private openJourney(): void {
    this.hideScreens();
    this.hud.hide();
    this.deps.world.setAmbient(true);
    this.setBody('journey');
    this.journey.show(this.progress);
  }

  private openGrimoire(from: State): void {
    this.grimoireReturn = from;
    this.hideScreens();
    this.setBody(from === 'paused' ? 'paused' : 'grimoire');
    this.grimoire.show();
  }

  private closeGrimoire(): void {
    this.grimoire.hide();
    if (this.grimoireReturn === 'paused') this.pause.show();
    else this.toMenu();
  }

  /** Play a level, with its opening cutscene when it has one. */
  private async playLevel(level: LevelDef): Promise<void> {
    this.hideScreens();
    this.hud.hide();
    if (level.before && SCRIPTS[level.before]) {
      this.setBody('cutscene');
      this.deps.world.stopLevel();
      await this.cutscenes.play(SCRIPTS[level.before]);
      this.progress.markSeen(level.before);
    }
    this.startLevel(level);
  }

  private startLevel(level: LevelDef): void {
    this.level = level;
    this.resolved = false;
    this.hideScreens();
    this.progress.setLast(level.id);
    this.deps.world.startLevel(level, chapterOf(level).mood);
    this.setBody('level');
    this.hud.start(level);
  }

  private leaveLevel(): void {
    this.deps.world.stopLevel();
    this.hud.hide();
    this.level = null;
  }

  private pauseGame(): void {
    if (this.state !== 'level') return;
    this.setBody('paused');
    this.pause.show();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.pause.hide();
    this.grimoire.hide();
    this.setBody('level');
  }

  private onEvent(e: Parameters<Parameters<World['events']['on']>[0]>[0]): void {
    if (this.state !== 'level' && this.state !== 'paused') return;
    switch (e.type) {
      case 'wave':
        this.hud.show(`Wave ${e.index + 1}`, e.index + 1 === e.total ? 'The last of them' : `of ${e.total}`, 2);
        if (e.index > 0) this.hud.hideTip();
        break;
      case 'wave-clear':
        this.hud.show('The wood stills', 'for a breath…', 2.2);
        break;
      case 'boss':
        if (e.phase === 0) this.hud.show(e.name, e.title, 3.4);
        else this.hud.show(e.phase === 1 ? `${e.name} grows angry` : `${e.name} is desperate`, e.phase === 1 ? 'Its court answers' : 'Hold on', 2.4);
        this.hud.hideTip();
        break;
      case 'darkness':
        this.hud.show('The light is being eaten', 'Cast light — Sunflare, Stormstrike — to break it', 2.8);
        break;
      case 'encounter':
        if (e.mode === 'won') void this.won();
        else if (e.mode === 'lost') this.lost();
        break;
    }
  }

  private async won(): Promise<void> {
    if (this.resolved || !this.level) return;
    this.resolved = true;
    const level = this.level;
    const stats = this.deps.world.snapshot().stats;
    this.hud.show(level.kind === 'normal' ? 'The wood quiets' : 'It is over', '', 2.6);
    const outcome = this.progress.complete(level, stats.time, stats.damageTaken);
    this.deps.book.setLearned(this.progress.learned);
    await wait(2600);
    if (level.after && SCRIPTS[level.after] && (outcome.firstTime || level.after === 'ending')) {
      this.hud.hide();
      this.deps.world.stopLevel();
      this.setBody('cutscene');
      await this.cutscenes.play(SCRIPTS[level.after]);
      this.progress.markSeen(level.after);
      if (level.after === 'ending') this.deps.world.setMood('dawn', 0.01);
    }
    this.hud.hide();
    this.deps.world.stopLevel();
    this.deps.world.setAmbient(true);
    this.setBody('result');
    const learned = outcome.learned ? SPELLS.find((s) => s.id === outcome.learned) ?? null : null;
    const next = levelById(level.id + 1);
    this.result.victory(level, stats, outcome.stars, learned, {
      next: next ? () => this.playLevel(next) : undefined,
      journey: () => this.openJourney(),
      replay: () => this.playLevel(level),
    });
  }

  private lost(): void {
    if (this.resolved || !this.level) return;
    this.resolved = true;
    const level = this.level;
    window.setTimeout(() => {
      this.hud.hide();
      this.deps.world.stopLevel();
      this.deps.world.setAmbient(true);
      this.setBody('result');
      this.result.defeat(level, { retry: () => this.startLevel(level), journey: () => this.openJourney() });
    }, 2200);
  }

  /** Development hooks. */
  debug() {
    return {
      play: (id: number) => { const l = levelById(id); if (l) this.startLevel(l); },
      scene: async (id: string) => { const s = SCRIPTS[id]; if (s) { this.hideScreens(); this.setBody('cutscene'); await this.cutscenes.play(s); this.toMenu(); } },
      win: () => { this.progress.complete(this.level!, 10, 0); },
      unlockAll: () => { for (const l of LEVELS) this.progress.complete(l, 60, 0); this.deps.book.setLearned(this.progress.learned); this.toMenu(); },
    };
  }
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
