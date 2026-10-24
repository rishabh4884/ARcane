import './style.css';
import { GESTURES } from './config/gestures.ts';
import { SPELLS } from './config/spells.ts';
import { DEFAULT_TUNING, type Tuning } from './config/tuning.ts';
import type { EngineOutput } from './gestures/GestureEngine.ts';
import { HandsEngine } from './gestures/HandsEngine.ts';
import { SpellBook } from './spells/SpellBook.ts';
import { loadJSON, saveJSON } from './storage.ts';
import { HandTracker } from './tracking/HandTracker.ts';
import type { HandSide } from './tracking/types.ts';
import { DebugOverlay } from './ui/DebugOverlay.ts';
import { qs } from './ui/dom.ts';
import { describeError } from './ui/errors.ts';
import { Hud } from './ui/Hud.ts';
import { Onboarding } from './ui/Onboarding.ts';
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
};

const world = new World(qs('#world'));
world.start();

const book = new SpellBook(SPELLS, GESTURES);
// Only gestures bound to a spell are live; the rest are just choices in the Spellbook dropdown.
const engine = new HandsEngine(book.activeGestures(), tuning);
book.onChange(() => engine.setGestures(book.activeGestures()));
const tracker = new HandTracker();

const hudRoot = qs('#hud');
const hud = new Hud(hudRoot, book);
const debug = new DebugOverlay(hudRoot);
new Onboarding(hudRoot, book, () => tracker.start());
new SettingsPanel(hudRoot, {
  book,
  tuning,
  defaults: DEFAULT_TUNING,
  isDebugVisible: () => debug.isVisible,
  onDebug: (v) => debug.setVisible(v),
  onTuning: (t) => {
    tuning = structuredClone(t);
    engine.setTuning(tuning);
    saveJSON(TUNING_KEY, tuning);
  },
});

/** One cast, from any source: a recognised gesture or a keyboard shortcut. */
function cast(spellId: string, from?: HandSide | 'both'): void {
  const spell = SPELLS.find((s) => s.id === spellId);
  if (!spell) return;
  world.cast(spell, from);
  hud.flash(spell.id);
}

function handle(out: EngineOutput, fps: number): void {
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
  world.setCursors(cursors);

  // A two-hand sign charges both wisps together; otherwise each hand charges on its own.
  const twin = out.hold?.side === 'both' ? out.hold : null;
  const twinSpell = twin ? book.spellFor(twin.gestureId) : undefined;
  if (twin && twinSpell) {
    world.setCharge(twin.progress, twinSpell.color, 'both');
    charges.length = 0;
    charges.push({ spellId: twinSpell.id, progress: twin.progress });
  } else {
    world.setCharges(perHand);
  }
  hud.update(out, charges);
  debug.draw(out, fps);

  for (const fired of out.fired) {
    const spell = book.spellFor(fired.gestureId);
    if (spell) cast(spell.id, fired.side);
  }
}

// A bug in a frame handler must never stop the camera loop, or tracking would die silently.
let lastFrameError = 0;
tracker.onFrame = (hands, stats) => {
  try {
    handle(engine.process(hands, performance.now()), stats.fps);
  } catch (err) {
    const now = performance.now();
    if (now - lastFrameError > 2000) console.error('[arcane] frame error', err);
    lastFrameError = now;
  }
};


/* ───────────────────────────── start-up flow ───────────────────────────── */

const intro = qs('#intro');
const begin = qs<HTMLButtonElement>('#begin');
const message = qs('#intro-message');
document.body.classList.add('is-intro');

begin.addEventListener('click', async () => {
  begin.disabled = true;
  message.textContent = 'Waking the camera…';
  message.dataset.state = 'busy';
  try {
    await tracker.start();
    intro.hidden = true;
    document.body.classList.remove('is-intro');
  } catch (err) {
    message.textContent = describeError(err);
    message.dataset.state = 'error';
    begin.textContent = 'Try again';
    begin.disabled = false;
    console.error(err);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) engine.reset();
});
