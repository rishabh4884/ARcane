import type { DualMotion } from '../gestures/dual.ts';
import type { SwipeDirection, SwipeHand } from '../gestures/motion.ts';
import type { PoseName } from '../gestures/poses.ts';

/**
 * THE GESTURE LIBRARY
 * ───────────────────
 * Every hand sign or motion ARcane can recognise is declared here, as data.
 * Adding one is a matter of adding an entry. Which spell a gesture casts is decided
 * separately in `spells.ts` (and can be changed by players in the Spellbook panel).
 *
 * Only gestures that are bound to a spell are live in the engine; the rest are just choices
 * in the Spellbook dropdown.
 *
 * ORDER MATTERS. If two live gestures would fire on the same frame, the earlier entry wins, so
 * keep the stricter variant above the looser one (Phoenix Ascent above Rise, Sunwise above the
 * any-direction Circle, Gale above Swish).
 */
export type GestureGroup = 'sign' | 'sweep' | 'strike' | 'sigil' | 'twin-sign' | 'twin-motion';

/** Dropdown sections, in display order. */
export const GESTURE_GROUPS: Record<GestureGroup, string> = {
  sign: 'Hand signs (hold)',
  sweep: 'Open-hand sweeps',
  strike: 'Fist & finger strikes',
  sigil: 'Sigils (draw a circle)',
  'twin-sign': 'Two-hand signs (hold)',
  'twin-motion': 'Two-hand motions',
};

interface GestureBase {
  /** Dropdown section. */
  group: GestureGroup;
  /** Stable identifier, referenced by spells and saved settings. */
  id: string;
  /** Player-facing name. */
  name: string;
  /** One sentence telling the player how to perform it. */
  hint: string;
  /** Small glyph shown in the HUD. */
  glyph: string;
}

/** Hold a hand shape. */
export interface PoseGesture extends GestureBase {
  kind: 'pose';
  pose: Exclude<PoseName, 'unknown'>;
  /** Overrides the global hold time (ms). */
  holdMs?: number;
}

/** Sweep one hand in a direction. Optional fields override SWIPE_DEFAULTS. */
export interface SwipeGesture extends GestureBase {
  kind: 'swipe';
  direction: SwipeDirection;
  hand?: SwipeHand;
  minTravel?: number;
  minSpeed?: number;
}

/** Trace a circle with a pointing finger. Optional fields override CIRCLE_DEFAULTS. */
export interface CircleGesture extends GestureBase {
  kind: 'circle';
  direction: 'any' | 'cw' | 'ccw';
  minRadius?: number;
}

/** Hold the same shape with both hands at once. */
export interface DualPoseGesture extends GestureBase {
  kind: 'dual-pose';
  pose: Exclude<PoseName, 'unknown'>;
  holdMs?: number;
}

/** Move both open hands together. */
export interface DualMotionGesture extends GestureBase {
  kind: 'dual-motion';
  motion: DualMotion;
}

export type GestureDef = PoseGesture | SwipeGesture | CircleGesture | DualPoseGesture | DualMotionGesture;

export const isDualGesture = (g: GestureDef): g is DualPoseGesture | DualMotionGesture =>
  g.kind === 'dual-pose' || g.kind === 'dual-motion';

export const GESTURES: readonly GestureDef[] = [
  /* ── Hand signs ── */
  {
    id: 'fist',
    group: 'sign',
    kind: 'pose',
    pose: 'fist',
    name: 'Closed fist',
    hint: 'Squeeze one hand into a fist and hold it for a moment.',
    glyph: '✊',
  },
  {
    id: 'victory',
    group: 'sign',
    kind: 'pose',
    pose: 'victory',
    name: 'Victory sign',
    hint: 'Raise your index and middle fingers in a V, fold the other two.',
    glyph: '✌️',
  },
  {
    id: 'horns',
    group: 'sign',
    kind: 'pose',
    pose: 'horns',
    name: 'Horns',
    hint: 'Raise your index and little finger, fold the middle two.',
    glyph: '🤘',
  },
  {
    id: 'trident',
    group: 'sign',
    kind: 'pose',
    pose: 'trident',
    name: 'Trident',
    hint: 'Raise index, middle and ring like a three-pronged fork, fold the little finger, and hold.',
    glyph: '🔱',
  },
  {
    id: 'lance',
    group: 'sign',
    kind: 'pose',
    pose: 'point',
    name: 'Lance',
    hint: 'Point as if aiming a spear of light, and hold.',
    glyph: '👉',
  },
  {
    id: 'aegis',
    group: 'sign',
    kind: 'pose',
    pose: 'open',
    holdMs: 700,
    name: 'Aegis',
    hint: 'Present an open palm as a ward and hold it still.',
    glyph: '🖐️',
  },

  /* ── Open-hand sweeps (stricter first) ── */
  {
    id: 'phoenix',
    group: 'sweep',
    kind: 'swipe',
    direction: 'up',
    minTravel: 2.6,
    minSpeed: 10,
    name: 'Phoenix Ascent',
    hint: 'Open hand, one blazing-fast flick upward, like releasing a bird of fire.',
    glyph: '🔥',
  },
  {
    id: 'rise',
    group: 'sweep',
    kind: 'swipe',
    direction: 'up',
    name: 'Rise',
    hint: 'Open hand, then scoop upward quickly, like lifting something off the floor.',
    glyph: '🙌',
  },
  {
    id: 'gale',
    group: 'sweep',
    kind: 'swipe',
    direction: 'left',
    name: 'Gale',
    hint: 'Open hand, one quick sweep to your left, like parting a curtain of wind.',
    glyph: '🌬️',
  },
  {
    id: 'tempest',
    group: 'sweep',
    kind: 'swipe',
    direction: 'right',
    name: 'Tempest',
    hint: 'Open hand, one quick sweep to your right, like throwing a storm.',
    glyph: '🌪️',
  },
  {
    id: 'swish',
    group: 'sweep',
    kind: 'swipe',
    direction: 'horizontal',
    name: 'Swish',
    hint: 'With an open hand, sweep sideways in one quick, confident arc.',
    glyph: '👋',
  },
  {
    id: 'bury',
    group: 'sweep',
    kind: 'swipe',
    direction: 'down',
    name: 'Bury',
    hint: 'Open hand, then press downward as if sealing the earth.',
    glyph: '⬇️',
  },

  /* ── Fist and finger strikes ── */
  {
    id: 'sunder',
    group: 'strike',
    kind: 'swipe',
    direction: 'down',
    hand: 'fist',
    minTravel: 1.9,
    name: 'Sunder',
    hint: 'Make a fist and smash it downward in one heavy stroke.',
    glyph: '⚡',
  },
  {
    id: 'ember',
    group: 'strike',
    kind: 'swipe',
    direction: 'up',
    hand: 'fist',
    minTravel: 1.9,
    name: 'Ember Uppercut',
    hint: 'Make a fist and drive it upward, like launching a burning stone.',
    glyph: '☄️',
  },
  {
    id: 'wrath',
    group: 'strike',
    kind: 'swipe',
    direction: 'horizontal',
    hand: 'fist',
    minTravel: 1.9,
    name: 'Wrath',
    hint: 'Make a fist and swing it sideways in one hard arc.',
    glyph: '💥',
  },
  {
    id: 'slash',
    group: 'strike',
    kind: 'swipe',
    direction: 'horizontal',
    hand: 'point',
    name: 'Wyrm Slash',
    hint: 'Point one finger and cut sideways through the air like a blade.',
    glyph: '🗡️',
  },
  {
    id: 'skybolt',
    group: 'strike',
    kind: 'swipe',
    direction: 'up',
    hand: 'point',
    name: 'Skybolt',
    hint: 'Point one finger and thrust it upward, calling lightning from above.',
    glyph: '🌩️',
  },
  {
    id: 'impale',
    group: 'strike',
    kind: 'swipe',
    direction: 'down',
    hand: 'point',
    name: 'Impale',
    hint: 'Point one finger and stab it downward into the ground.',
    glyph: '📍',
  },

  /* ── Sigils (specific directions first) ── */
  {
    id: 'sunwise',
    group: 'sigil',
    kind: 'circle',
    direction: 'cw',
    name: 'Sunwise Sigil',
    hint: 'Point one finger and trace a circle clockwise, the way the sun travels.',
    glyph: '🌞',
  },
  {
    id: 'moonwise',
    group: 'sigil',
    kind: 'circle',
    direction: 'ccw',
    name: 'Moonwise Sigil',
    hint: 'Point one finger and trace a circle counter-clockwise, against the sun.',
    glyph: '🌙',
  },
  {
    id: 'circle',
    group: 'sigil',
    kind: 'circle',
    direction: 'any',
    name: 'Circle',
    hint: 'Point with one finger and trace a full circle in the air, either way.',
    glyph: '☝️',
  },

  /* ── Two-hand signs ── */
  {
    id: 'pact',
    group: 'twin-sign',
    kind: 'dual-pose',
    pose: 'fist',
    name: 'Blood Pact',
    hint: 'Raise both fists in view and hold them like sealing a vow.',
    glyph: '⚔️',
  },
  {
    id: 'eclipse',
    group: 'twin-sign',
    kind: 'dual-pose',
    pose: 'open',
    holdMs: 650,
    name: 'Eclipse',
    hint: 'Present both open palms toward the camera and hold them still.',
    glyph: '🌑',
  },
  {
    id: 'fangs',
    group: 'twin-sign',
    kind: 'dual-pose',
    pose: 'victory',
    holdMs: 450,
    name: 'Twin Fangs',
    hint: 'Make a victory sign with both hands and hold.',
    glyph: '🐍',
  },
  {
    id: 'crossfire',
    group: 'twin-sign',
    kind: 'dual-pose',
    pose: 'point',
    holdMs: 450,
    name: 'Crossfire',
    hint: 'Point both index fingers and hold, like aiming two spears.',
    glyph: '🎯',
  },
  {
    id: 'maw',
    group: 'twin-sign',
    kind: 'dual-pose',
    pose: 'horns',
    holdMs: 450,
    name: 'Wyrm’s Maw',
    hint: 'Raise horns with both hands and hold, like opening a dragon’s jaws.',
    glyph: '🐉',
  },
  {
    id: 'leviathan',
    group: 'twin-sign',
    kind: 'dual-pose',
    pose: 'trident',
    holdMs: 450,
    name: 'Leviathan',
    hint: 'Raise a trident with both hands and hold, calling the deep.',
    glyph: '🌊',
  },

  /* ── Two-hand motions ── */
  {
    id: 'rift',
    group: 'twin-motion',
    kind: 'dual-motion',
    motion: 'apart',
    name: 'Rift',
    hint: 'Both open hands in view, then pull them sharply apart.',
    glyph: '✴️',
  },
  {
    id: 'bind',
    group: 'twin-motion',
    kind: 'dual-motion',
    motion: 'together',
    name: 'Bind',
    hint: 'Both open hands wide apart, then draw them together in one motion.',
    glyph: '♾️',
  },
  {
    id: 'skywake',
    group: 'twin-motion',
    kind: 'dual-motion',
    motion: 'lift',
    name: 'Skywake',
    hint: 'Both open hands, then lift them together as if raising a storm.',
    glyph: '✨',
  },
  {
    id: 'cataclysm',
    group: 'twin-motion',
    kind: 'dual-motion',
    motion: 'drop',
    name: 'Cataclysm',
    hint: 'Both open hands held high, then slam them down together.',
    glyph: '🌋',
  },
];
