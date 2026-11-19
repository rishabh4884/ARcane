/**
 * THE GRIMOIRE
 * ────────────
 * Every spell the caster can learn. Eleven are known from the first night; eight legendary spells
 * are taken from the things that rule the Hushwood: each sub-boss and final boss surrenders one
 * when it falls. Legendary spells are powerful and slow to return.
 */
export type SpellEffect =
  | 'arrow' | 'lightning' | 'frost' | 'healing' | 'summon' | 'shield'
  | 'fire' | 'roots' | 'blade' | 'wisps' | 'flare'
  | 'quake' | 'veil' | 'tide' | 'bloom' | 'stag' | 'starfall' | 'stillness' | 'dawn';

export type SpellTier = 'base' | 'legend';

export interface SpellDef {
  id: string;
  name: string;
  color: string;
  effect: SpellEffect;
  defaultGesture: string;
  tier: SpellTier;
  /** Recovery after a cast (seconds). */
  cooldown: number;
  /** One line for the grimoire. */
  lore: string;
  /** What it does, plainly. */
  effectText: string;
  /** Legendary spells: the level whose boss surrenders it. */
  learnedAt?: number;
}

export const SPELLS: readonly SpellDef[] = [
  { id: 'spell-1', name: 'Arcane Bow', color: '#ff6f3c', effect: 'arrow', defaultGesture: 'bowdraw', tier: 'base', cooldown: 0.4,
    lore: 'An arrow of ash and light, loosed from a bow only you can see.', effectText: 'A single swift shot. The harder you draw, the harder it flies.' },
  { id: 'spell-2', name: 'Stormstrike', color: '#6ee7ff', effect: 'lightning', defaultGesture: 'impale', tier: 'base', cooldown: 1.5,
    lore: 'The sky still listens, even here.', effectText: 'Lightning falls on the spirit beneath your aim. Heavy damage.' },
  { id: 'spell-3', name: 'Frostbind', color: '#b69cff', effect: 'frost', defaultGesture: 'victory', tier: 'base', cooldown: 2.2,
    lore: 'Cold enough to stop a heartbeat mid-thought.', effectText: 'Freezes a spirit solid and breaks its wind-up. Great beasts only slow.' },
  { id: 'spell-5', name: 'Mend', color: '#ff91c8', effect: 'healing', defaultGesture: 'circle', tier: 'base', cooldown: 7,
    lore: 'Draw the old shape, and the wood remembers you whole.', effectText: 'Restores 30 vitality.' },
  { id: 'spell-6', name: 'Rise', color: '#ffd166', effect: 'summon', defaultGesture: 'rise', tier: 'base', cooldown: 12,
    lore: 'The gnomes are small, stubborn and on your side.', effectText: 'Two gnomes climb out of the earth and pelt spirits with stones.' },
  { id: 'spell-7', name: 'Aegis', color: '#c6d9ff', effect: 'shield', defaultGesture: 'aegis', tier: 'base', cooldown: 6,
    lore: 'A palm held up against the dark.', effectText: 'A 45-point ward for 5 seconds. Raise it before a blow lands.' },
  { id: 'spell-8', name: 'Ember Lash', color: '#ff8a3d', effect: 'fire', defaultGesture: 'wrath', tier: 'base', cooldown: 2.6,
    lore: 'A coal remembered from a hearth that is long cold.', effectText: 'A whip of fire that sets a spirit burning for 4 seconds.' },
  { id: 'spell-9', name: 'Thornsnare', color: '#9fd36b', effect: 'roots', defaultGesture: 'bury', tier: 'base', cooldown: 7,
    lore: 'Ask the roots nicely. They hold grudges, too.', effectText: 'Roots burst up and pin a spirit and anything beside it for 4 seconds.' },
  { id: 'spell-10', name: 'Moonblade', color: '#dfe8ff', effect: 'blade', defaultGesture: 'slash', tier: 'base', cooldown: 3.2,
    lore: 'A crescent cut from the last thin moon.', effectText: 'A flying crescent that cuts through every spirit in its path.' },
  { id: 'spell-11', name: 'Wisp Swarm', color: '#9ff0d4', effect: 'wisps', defaultGesture: 'horns', tier: 'base', cooldown: 6,
    lore: 'Small lights that remember being free. They hunt for you.', effectText: 'Four seeking wisps fly to the nearest spirits.' },
  { id: 'spell-12', name: 'Sunflare', color: '#fff0a8', effect: 'flare', defaultGesture: 'trident', tier: 'base', cooldown: 14,
    lore: 'A sliver of a morning this wood has not seen in years.', effectText: 'A blinding flash: every spirit in sight is stunned and its wind-up broken.' },

  { id: 'spell-13', name: 'Earthshatter', color: '#d79a5b', effect: 'quake', defaultGesture: 'sunder', tier: 'legend', cooldown: 22, learnedAt: 9,
    lore: "Gorrik's war-stomp, taken from him with his crown.", effectText: 'The ground splits in a line toward your aim; everything on it is broken and stunned.' },
  { id: 'spell-14', name: 'Moonveil', color: '#cbb8ff', effect: 'veil', defaultGesture: 'eclipse', tier: 'legend', cooldown: 40, learnedAt: 10,
    lore: "The Matron's own veil, woven of dust and moonlight.", effectText: 'For 7 seconds nothing can touch you, and projectiles turn back on their makers.' },
  { id: 'spell-15', name: 'Tidecaller', color: '#5fd0e8', effect: 'tide', defaultGesture: 'leviathan', tier: 'legend', cooldown: 45, learnedAt: 19,
    lore: 'The fen remembers the river it used to be.', effectText: 'A spectral serpent of water sweeps the field, striking and driving back every spirit.' },
  { id: 'spell-16', name: 'Verdant Bloom', color: '#7fe08a', effect: 'bloom', defaultGesture: 'skywake', tier: 'legend', cooldown: 60, learnedAt: 20,
    lore: 'A seed of the Star-Heart, still warm.', effectText: 'Restores all vitality, heals over time, and roots every spirit in place.' },
  { id: 'spell-17', name: 'Spirit Stag', color: '#f2f7ff', effect: 'stag', defaultGesture: 'fangs', tier: 'legend', cooldown: 40, learnedAt: 29,
    lore: 'Freed from its bones, the stag runs for you now.', effectText: 'A stag of white light charges down your aim, trampling all in its way.' },
  { id: 'spell-18', name: 'Starfall', color: '#ffd9f2', effect: 'starfall', defaultGesture: 'cataclysm', tier: 'legend', cooldown: 55, learnedAt: 30,
    lore: "The Widow's lanterns, emptied into the sky and called back down.", effectText: 'Stars fall on every spirit in the wood; the one you aim at takes two.' },
  { id: 'spell-19', name: 'The Stillness', color: '#a7c4c9', effect: 'stillness', defaultGesture: 'bind', tier: 'legend', cooldown: 50, learnedAt: 39,
    lore: "The Herald's bell, rung once by a kinder hand.", effectText: 'Every spirit holds utterly still for 6 seconds (great ones for 3).' },
  { id: 'spell-20', name: 'Dawnbreak', color: '#ffe7a3', effect: 'dawn', defaultGesture: 'maw', tier: 'legend', cooldown: 70, learnedAt: 40,
    lore: 'Every light the King swallowed, given back at once.', effectText: 'A beam of dawn burns through everything on your aim and singes the rest.' },
];

export const BASE_SPELLS = SPELLS.filter((s) => s.tier === 'base');
export const LEGEND_SPELLS = SPELLS.filter((s) => s.tier === 'legend');

/** Effects that hurt spirits (the rest guard, heal or summon). */
export const OFFENSIVE: ReadonlySet<SpellEffect> = new Set<SpellEffect>([
  'arrow', 'lightning', 'frost', 'fire', 'roots', 'blade', 'wisps', 'flare', 'quake', 'tide', 'stag', 'starfall', 'dawn', 'summon',
]);
