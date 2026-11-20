import { BLOOMKIN_COATS, bloomkin, KINDLER_HANDS, WARDEN } from '../../cutscene/cast.ts';
import { GNOME_DESIGNS } from '../GnomeSummons.ts';
import type { Design } from '../rig/Character.ts';
import { DESIGNS } from './index.ts';

/**
 * Every body the game ever builds, by a stable key: the creatures, the summoned gnomes and the
 * cutscene cast. The bakery uses the key to build a design in a worker and to find it in the cache.
 */
export const DESIGN_REGISTRY: Record<string, Design> = {
  ...DESIGNS,
  'gnome-ember': GNOME_DESIGNS.ember,
  'gnome-moss': GNOME_DESIGNS.moss,
  hands: KINDLER_HANDS,
  warden: WARDEN,
  ...Object.fromEntries(BLOOMKIN_COATS.map(([fur, cap], i) => [`bloomkin-${i}`, bloomkin(fur, cap)])),
};
