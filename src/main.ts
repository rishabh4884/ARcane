import './style.css';
import './ui/encounter.css';
import { AudioEngine } from './audio/AudioEngine.ts';
import { GESTURES } from './config/gestures.ts';
import { SPELLS } from './config/spells.ts';
import { DEFAULT_TUNING, type Tuning } from './config/tuning.ts';
import { Game } from './game/Game.ts';
import type { EngineOutput } from './gestures/GestureEngine.ts';
import { HandsEngine } from './gestures/HandsEngine.ts';
import { SpellBook } from './spells/SpellBook.ts';
import { loadJSON, saveJSON } from './storage.ts';
import { HandTracker, type TrackerStats } from './tracking/HandTracker.ts';
import type { HandSide } from './tracking/types.ts';
import { DebugOverlay } from './ui/DebugOverlay.ts';
import { el, qs } from './ui/dom.ts';
import { Hud } from './ui/Hud.ts';
import { SettingsPanel } from './ui/SettingsPanel.ts';
import { World } from './world/World.ts';

const TUNING_KEY = 'arcane.tuning.v1';

const saved = loadJSON<Partial<Tuning>>(TUNING_KEY);
let tuning: Tuning = {
  ...DEFAULT_TUNING,
  ...saved,
  // Beta is not player-adjustable; ignore the legacy stored value from before filtering worked.
  smoothing: { ...DEFAULT_TUNING.smoothing, ...saved?.smoothing, beta: DEFAULT_TUNING.smoothing.beta },
  fingers: { ...DEFAULT_TUNING.fingers, ...saved?.fingers },
  cameraFps: saved?.cameraFps === 60 ? 60 : DEFAULT_TUNING.cameraFps,
};

const world = new World(qs('#world'));
world.start();

const audio = new AudioEngine();
world.events.on((event) => audio.handle(event));
// Browsers keep audio locked until a user gesture; the loading screen's Enter is the first one.
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

const book = new SpellBook(SPELLS, GESTURES);
// Only gestures bound to a known spell are live; legendary spells wake when they are learned.
const engine = new HandsEngine(book.activeGestures(), tuning);
book.onChange(() => engine.setGestures(book.activeGestures()));
const tracker = new HandTracker(tuning.cameraFps);

const hudRoot = qs('#hud');
const hud = new Hud(hudRoot, book);
const debug = new DebugOverlay(hudRoot);
const soundButton = el('button', { class: 'sound-tool', type: 'button', onclick: () => audio.toggleMuted() });
const renderSound = () => {
  soundButton.textContent = audio.muted ? 'Sound off' : 'Sound on';
  soundButton.setAttribute('aria-pressed', String(!audio.muted));
  soundButton.setAttribute('aria-label', audio.muted ? 'Turn sound on (M)' : 'Turn sound off (M)');
};
audio.onChange(renderSound);
renderSound();
document.body.append(soundButton);
window.addEventListener('keydown', (event) => {
  if ((event.key === 'm' || event.key === 'M') && !event.metaKey && !event.ctrlKey && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) {
    audio.toggleMuted();
  }
});

const settings = new SettingsPanel(document.body, {
  sound: audio,
  book,
  tuning,
  defaults: DEFAULT_TUNING,
  isDebugVisible: () => debug.isVisible,
  onDebug: (v) => debug.setVisible(v),
  onTuning: (t) => {
    const previousCameraFps = tuning.cameraFps;
    tuning = structuredClone(t);
    engine.setTuning(tuning);
    if (tuning.cameraFps !== previousCameraFps) {
      void tracker.setFrameRate(tuning.cameraFps).catch((error: unknown) => {
        console.warn('[arcane] camera could not apply the selected frame-rate cap', error);
      });
    }
    saveJSON(TUNING_KEY, tuning);
  },
});

/** One cast, from a recognised gesture. */
function cast(spellId: string, from?: HandSide | 'both', detail?: string): void {
  const spell = SPELLS.find((s) => s.id === spellId);
  if (!spell || !book.isKnown(spell.id)) return;
  if (world.cast(spell, from, detail)) hud.flash(spell.id);
  else hud.refuse(spell.id);
}

function handle(out: EngineOutput, stats: TrackerStats): void {
  const cursors: Record<HandSide, { x: number; y: number } | null> = { left: null, right: null };
  const perHand: Partial<Record<HandSide, { progress: number; color: string }>> = {};
  const charges: Array<{ spellId: string; progress: number }> = [];

  for (const hand of out.hands) {
    cursors[hand.side] = hand.cursor;
    const spell = hand.hold ? book.spellFor(hand.hold.gestureId) : undefined;
    if (hand.hold && spell) {
      perHand[hand.side] = { progress: hand.hold.progress, color: spell.color };
      charges.push({ spellId: spell.id, progress: hand.hold.progress });
    }
  }
  if (out.bow) {
    const spell = book.spellFor(out.bow.gestureId);
    if (spell) {
      // One spell, one cursor: the aiming hand's marker shows the draw.
      perHand[out.bow.aimSide] = { progress: out.bow.progress, color: spell.color };
      charges.push({ spellId: spell.id, progress: out.bow.progress });
    }
  }
  world.setCursors(cursors);
  // Both hands make one spell: keep the aiming hand's marker, hide the drawing hand's.
  if (out.bow) world.hideMarker(out.bow.drawSide);

  // A two-hand sign charges both wisps together; otherwise each hand charges on its own.
  const twin = out.hold?.side === 'both' ? out.hold : null;
  const twinSpell = twin ? book.spellFor(twin.gestureId) : undefined;
  if (twin && twinSpell) {
    world.setCharge(twin.progress, twinSpell.color, 'both');
    charges.length = 0;
    charges.push({ spellId: twinSpell.id, progress: twin.progress });
    audio.setCharge('left', twin.progress);
    audio.setCharge('right', 0);
  } else {
    world.setCharges(perHand);
    // The bow has its own creak; the hold tone is for signs.
    audio.setCharge('left', out.bow ? 0 : perHand.left?.progress ?? 0);
    audio.setCharge('right', out.bow ? 0 : perHand.right?.progress ?? 0);
  }
  const drawCursor = out.bow ? cursors[out.bow.drawSide] : null;
  audio.setBowDraw(out.bow && out.bow.phase !== 'arming' ? out.bow.progress : null, drawCursor ? drawCursor.x * 2 - 1 : 0);
  hud.update(out, charges);
  debug.draw(out, stats);

  for (const fired of out.fired) {
    const spell = book.spellFor(fired.gestureId);
    if (spell) cast(spell.id, fired.side, fired.detail);
  }
}

// A bug in a frame handler must never stop the camera loop, or tracking would die silently.
let lastFrameError = 0;
tracker.onFrame = (hands, stats) => {
  try {
    handle(engine.process(hands, stats.timestamp), stats);
  } catch (err) {
    const now = performance.now();
    if (now - lastFrameError > 2000) console.error('[arcane] frame error', err);
    lastFrameError = now;
  }
};

// Spell recovery is a game-clock value; a light poll keeps the dock honest without a camera frame.
window.setInterval(() => hud.setCooldowns(world.cooldowns()), 100);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) engine.reset();
});

/** Fetch the hand model ahead of time so the camera starts quickly (it then comes from cache). */
async function prefetchModel(step: (f: number, label: string) => void): Promise<void> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}models/hand_landmarker.task`);
    const total = Number(response.headers.get('content-length')) || 7_800_000;
    const reader = response.body?.getReader();
    if (!reader) return;
    let read = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      step(0.64 + Math.min(1, read / total) * 0.34, 'Teaching the wood to see your hands…');
    }
  } catch {
    // Offline or blocked: the tracker falls back to its own loading path.
  }
}

const game = new Game({ world, audio, book, settings, hudRoot, startCamera: () => tracker.start() });
void game.boot(async (step) => {
  await world.warmup(step);
  await prefetchModel(step);
});

// Development-only console hooks for checking levels, scenes and spells without a camera.
if (import.meta.env.DEV) {
  Object.assign(window, {
    arcane: {
      cast: (spellId: string, side: HandSide = 'right') => cast(spellId, side, spellId === 'spell-1' ? '90% draw' : 'left'),
      aim: (x: number, y: number, side: HandSide = 'right') => world.setCursors({ [side]: { x, y } }),
      world,
      game: game.debug(),
      book,
    },
  });
}
