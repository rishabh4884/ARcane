import type { CreatureKind } from '../EncounterState.ts';
import type { Design } from '../rig/Character.ts';
import { BOSS_DESIGNS } from './bosses.ts';
import { CREATURE_DESIGNS } from './creatures.ts';
import { SPIRIT_DESIGNS } from './spirits.ts';

/** Every creature's body and motion, by kind. */
export const DESIGNS: Record<CreatureKind, Design> = { ...SPIRIT_DESIGNS, ...CREATURE_DESIGNS, ...BOSS_DESIGNS };
