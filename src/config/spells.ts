export type SpellEffect = 'arrow' | 'lightning' | 'frost' | 'wind' | 'healing' | 'summon' | 'shield';
export interface SpellDef { id: string; name: string; color: string; effect: SpellEffect; defaultGesture: string }
export const SPELLS: readonly SpellDef[] = [
  { id: 'spell-1', name: 'Arcane Bow', color: '#ff6f3c', effect: 'arrow', defaultGesture: 'lance' },
  { id: 'spell-2', name: 'Stormstrike', color: '#6ee7ff', effect: 'lightning', defaultGesture: 'impale' },
  { id: 'spell-3', name: 'Frostbind', color: '#b69cff', effect: 'frost', defaultGesture: 'victory' },
  { id: 'spell-4', name: 'Gale', color: '#7dffb2', effect: 'wind', defaultGesture: 'gale' },
  { id: 'spell-5', name: 'Mend', color: '#ff91c8', effect: 'healing', defaultGesture: 'circle' },
  { id: 'spell-6', name: 'Rise', color: '#ffd166', effect: 'summon', defaultGesture: 'rise' },
  { id: 'spell-7', name: 'Aegis', color: '#c6d9ff', effect: 'shield', defaultGesture: 'aegis' },
];
