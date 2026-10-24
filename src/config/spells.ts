export interface SpellDef { id: string; name: string; color: string; effect: string; defaultGesture: string }
export const SPELLS: readonly SpellDef[] = [
  { id: 'spell-1', name: 'Ember', color: '#ff6f3c', effect: 'burst', defaultGesture: 'fist' },
  { id: 'spell-2', name: 'Prism', color: '#6ee7ff', effect: 'spiral', defaultGesture: 'victory' },
  { id: 'spell-3', name: 'Wyrm', color: '#b69cff', effect: 'burst', defaultGesture: 'horns' },
  { id: 'spell-4', name: 'Gale', color: '#7dffb2', effect: 'stream', defaultGesture: 'swish' },
  { id: 'spell-5', name: 'Sigil', color: '#ffd166', effect: 'ring', defaultGesture: 'circle' },
  { id: 'spell-6', name: 'Rise', color: '#ff91c8', effect: 'stream', defaultGesture: 'rise' },
];
