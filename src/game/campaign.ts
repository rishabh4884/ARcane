import { CREATURE_SPECS, type CreatureKind, type Scaling } from '../world/EncounterState.ts';

/**
 * THE JOURNEY
 * ───────────
 * Forty levels in four chapters. Each chapter is eight levels of three waves, a ninth where a
 * sub-boss comes alone after the last wave, and a tenth where the chapter's ruler waits, introduced
 * by a cutscene. Every seventh level ends with a piece of the story; every boss surrenders a spell.
 */

export type Mood = 'edge' | 'fen' | 'deeps' | 'throne' | 'dawn';

export interface ChapterDef {
  id: number;
  numeral: string;
  name: string;
  subtitle: string;
  mood: Mood;
  blurb: string;
}

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 1, numeral: 'I', name: 'The Hushed Edge', subtitle: 'Where you woke', mood: 'edge',
    blurb: 'Mossy outskirts, cold lanterns, and things that watch from the ferns.' },
  { id: 2, numeral: 'II', name: 'The Mirefen', subtitle: 'Where the river drowned', mood: 'fen',
    blurb: 'Sunken paths through green water. The reeds weep, and something long moves beneath.' },
  { id: 3, numeral: 'III', name: 'The Lantern Deeps', subtitle: 'Where the lost are kept', mood: 'deeps',
    blurb: 'Under the oldest roots, lanterns hang in rows. Not all of them are empty.' },
  { id: 4, numeral: 'IV', name: 'The Unlit Throne', subtitle: 'Where the light went', mood: 'throne',
    blurb: 'Ash-pale birches and a silence that rings. At the heart of it, a crown.' },
];

export type WaveGroup = { kind: CreatureKind; count: number; from?: 'front' | 'left' | 'right' };
export type LevelKind = 'normal' | 'sub' | 'final';

export interface LevelDef {
  id: number;
  chapter: number;
  /** 1..10 within the chapter. */
  index: number;
  name: string;
  kind: LevelKind;
  waves: WaveGroup[][];
  /** Sub-boss or final boss of this level. */
  boss?: CreatureKind;
  scaling: Scaling;
  /** Cutscene played before the level starts. */
  before?: string;
  /** Cutscene played after the level is won. */
  after?: string;
  /** A line the wood leaves you with when the level is won. */
  whisper: string;
  /** Legendary spell learned on victory. */
  reward?: string;
  /** A hint shown before the first wave (early levels teach). */
  tip?: string;
}

const NAMES: readonly string[] = [
  'First Light', 'The Watching Ferns', 'Lanterns in the Mist', 'Rootfall Hollow', 'The Crooked Stile',
  'Bramble Run', 'Where the Path Forgets', 'The Empty Market', "Gorrik's Crossing", "The Matron's Bower",
  'Sunken Steps', 'The Weeping Reeds', 'Thornback Wallow', 'Graves of the Lantern-Flowers', 'The Drowned Chapel',
  'Fenlight', "Where Frogs Don't Sing", 'The Long Causeway', 'Coils of the Fen', "The Rootwarden's Heart",
  'Down the Old Roots', 'The Glowworm Gallery', 'Moth-Wing Hollow', 'The Hanging Lanterns', 'Cold Fire Glade',
  'The Bone Orchard', 'Whispering Webs', "The Warden's Footsteps", 'Antler Hall', "The Widow's Loom",
  'The Silent Rise', 'Ashen Birches', 'The Bellfields', 'Crownless Wood', 'Where You Began',
  'The Last Lantern-Flower', 'The Hush Unending', 'Steps of Night', "The Herald's Toll", 'The Unlit Throne',
];

const WHISPERS: readonly string[] = [
  'Somewhere far off, a bell rang once. Nothing answered it.',
  'The ferns lean toward you when you are not looking.',
  'The wraiths carry lanterns. None of them are lit by their own fire.',
  'Under the moss, the stones are carved with little suns.',
  'A gnome hat, small and red, hangs on a nail. It is still warm.',
  'The goblins fight like they are guarding something. Or someone.',
  'You found footprints of your own, going the other way.',
  'Every stall in the market sold lanterns. Every one is empty.',
  'Gorrik wore his crown like it was heavy. It was not his.',
  'The freed lights flew deeper into the wood, as if they knew the way home.',
  'The water is warm. Something below it breathes.',
  'The reeds weep for the river. It was clear, once.',
  'Thornbacks were gentle, the gnomes say. Before.',
  'Every lantern-flower here has closed. One of them twitched when you passed.',
  'The chapel bell is gone. Only the rope remains, swaying.',
  'Fenlight is not a light. It is the memory of one.',
  'No frogs. No crickets. Only you, and the drip of the trees.',
  'At the end of the causeway, a stone throne. Too small for a king.',
  'The Fenwyrm curled around nothing, as if it had lost what it guarded.',
  'Where the Star-Heart fell, a ring of grass turned green for a heartbeat.',
  'The roots here are older than the hills. They remember the Warden.',
  'The glowworms dimmed when you came near. Then, slowly, they shone back.',
  'Moth wings, everywhere. The Matron had many children.',
  'Some lanterns here hang empty. Some hold a light that flinches.',
  'Cold fire does not burn. It forgets you.',
  'The orchard grows no fruit. Only bones, polished by waiting.',
  'The webs hum a tune. You almost know it.',
  'The Warden walked this way, carrying something too bright to look at.',
  'The stag ran free at last, though it had nowhere left to go.',
  'Every light the Widow kept went home. The Deeps feel a little less deep.',
  'Up here the air rings, like a bell that never stops.',
  'The birches are white with ash. Something burned, long ago, without flame.',
  'Bells in the grass. Each one rang once and fell silent.',
  'A crown was carved on every tree. Then scratched out.',
  'You know this place. You have always known it.',
  'One lantern-flower is still open. It leans toward your hands.',
  'The Hush is loudest here. You can hear it thinking.',
  'Each step down is a step back in time.',
  'The Herald fell, and the ringing stopped. The silence after it is yours.',
  'Light. Everywhere. The Hushwood remembers its colours.',
];

/** Story beats after levels (cutscene ids), and pre-boss cutscenes. */
const AFTER: Record<number, string> = {
  7: 'tuck', 10: 'matron-fall', 14: 'flowers', 20: 'grael-fall', 21: 'name', 28: 'warden', 30: 'widow-fall', 35: 'kindler', 40: 'ending',
};
const BEFORE: Record<number, string> = { 1: 'intro', 10: 'matron', 20: 'grael', 30: 'widow', 40: 'king' };

const BOSSES: Record<number, CreatureKind> = {
  9: 'gorrik', 10: 'matron', 19: 'fenwyrm', 20: 'grael', 29: 'stag', 30: 'widow', 39: 'herald', 40: 'king',
};
const REWARDS: Record<number, string> = {
  9: 'spell-13', 10: 'spell-14', 19: 'spell-15', 20: 'spell-16', 29: 'spell-17', 30: 'spell-18', 39: 'spell-19', 40: 'spell-20',
};

const TIPS: Record<number, string> = {
  1: 'Aim with your hand. Draw the Arcane Bow: point with one hand, pinch with the other, pull back and release.',
  2: 'Watch for the wind-up: a spirit that coils is about to strike. Frostbind (✌️ held) breaks it.',
  3: 'Lantern Wraiths throw embers from afar. Raise Aegis (🖐️ held still) before one reaches you.',
  4: 'Hurt? Draw a circle with a pointing finger to Mend.',
  5: 'Sweep a fist sideways for Ember Lash; press an open hand down for Thornsnare.',
  6: 'Cut sideways with a pointing finger for Moonblade: it passes through every spirit in a line.',
  7: 'Hold horns (🤘) for a Wisp Swarm, or a trident (three fingers) for Sunflare to stun everything in sight.',
};

/** Threat cost of each kind when filling a wave's budget. */
const COST: Partial<Record<CreatureKind, number>> = { goblin: 1, mossling: 0.55, wraith: 1.5, thornback: 2, moth: 1.5, root: 2.5, hollow: 3.2 };

function pool(level: number): Array<[CreatureKind, number]> {
  if (level <= 2) return [['goblin', 1]];
  if (level <= 3) return [['goblin', 3], ['wraith', 1]];
  if (level <= 10) return [['goblin', 4], ['wraith', 2], ['root', level >= 4 ? 1.2 : 0]];
  if (level <= 20) return [['goblin', 3], ['wraith', 2], ['root', 1], ['mossling', 3], ['thornback', level >= 13 ? 1.5 : 0], ['hollow', level >= 15 ? 0.8 : 0]];
  if (level <= 30) return [['goblin', 2], ['wraith', 2], ['root', 1], ['mossling', 2.5], ['thornback', 1.4], ['hollow', 1], ['moth', level >= 21 ? 2.5 : 0]];
  return [['goblin', 2], ['wraith', 2.2], ['root', 1.2], ['mossling', 2], ['thornback', 1.6], ['hollow', 1.4], ['moth', 2.4]];
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
}

function waves(level: number): WaveGroup[][] {
  if (level === 1) return [[{ kind: 'goblin', count: 2 }], [{ kind: 'goblin', count: 3 }], [{ kind: 'goblin', count: 4 }]];
  if (level === 2) return [[{ kind: 'goblin', count: 3 }], [{ kind: 'goblin', count: 4 }], [{ kind: 'goblin', count: 3 }, { kind: 'goblin', count: 2, from: 'left' }]];
  const random = seeded(level * 7919);
  const out: WaveGroup[][] = [];
  const kinds = pool(level).filter(([, w]) => w > 0);
  const totalWeight = kinds.reduce((s, [, w]) => s + w, 0);
  for (let w = 0; w < 3; w++) {
    let budget = 2.6 + level * 0.32 + w * 1.5 + (level > 20 ? 1.5 : 0);
    const counts = new Map<CreatureKind, number>();
    let bodies = 0;
    const cap = 7 + Math.floor(level / 8);
    for (let guard = 0; budget > 0.5 && bodies < cap && guard < 60; guard++) {
      let pick = random() * totalWeight;
      let kind = kinds[0][0];
      for (const [k, weight] of kinds) { pick -= weight; if (pick <= 0) { kind = k; break; } }
      const cost = COST[kind] ?? 1;
      if (cost > budget + 0.4) continue;
      const n = kind === 'mossling' ? 2 : 1;
      counts.set(kind, (counts.get(kind) ?? 0) + n);
      budget -= cost * n;
      bodies += n;
    }
    const groups: WaveGroup[] = [];
    let i = 0;
    for (const [kind, count] of counts) {
      // From the fourth level on, some of each wave come in from the sides of the clearing.
      const from = level >= 4 && i % 3 === 2 ? (random() < 0.5 ? 'left' : 'right') : 'front';
      groups.push({ kind, count, from });
      i++;
    }
    out.push(groups);
  }
  // Waves always grow: order them by how much they threaten.
  const threat = (w: WaveGroup[]) => w.reduce((s, g) => s + g.count * CREATURE_SPECS[g.kind].health, 0);
  return out.sort((a, b) => threat(a) - threat(b));
}

export const LEVELS: readonly LevelDef[] = NAMES.map((name, i) => {
  const id = i + 1;
  const chapter = Math.ceil(id / 10);
  const index = id - (chapter - 1) * 10;
  const kind: LevelKind = index === 10 ? 'final' : index === 9 ? 'sub' : 'normal';
  const d = id - 1;
  return {
    id, chapter, index, name, kind,
    // A final boss is the level: its court arrives in its phases, not in waves before it.
    waves: kind === 'final' ? [] : waves(id),
    boss: BOSSES[id],
    scaling: { health: 1 + d * 0.03, damage: 1 + d * 0.018, speed: 1 + d * 0.004 },
    before: BEFORE[id],
    after: AFTER[id],
    whisper: WHISPERS[i],
    reward: REWARDS[id],
    tip: TIPS[id],
  };
});

export const levelById = (id: number): LevelDef | undefined => LEVELS.find((l) => l.id === id);
export const chapterOf = (level: LevelDef): ChapterDef => CHAPTERS[level.chapter - 1];
