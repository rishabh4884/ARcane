type Shape = { tag: 'path' | 'circle' | 'line'; className: string; attrs: Record<string, string> };

const ICONS: Record<string, readonly Shape[]> = {
  'spell-1': [
    { tag: 'path', className: 'bow-limb', attrs: { d: 'M34 4C11 10 11 38 34 44' } },
    { tag: 'path', className: 'bow-string', attrs: { d: 'M34 4v40' } },
    { tag: 'path', className: 'bow-arrow', attrs: { d: 'M4 24h37m-9-9 9 9-9 9' } },
    { tag: 'path', className: 'bow-fletching', attrs: { d: 'M8 24l-4-6m4 6-4 6' } },
  ],
  'spell-2': [
    { tag: 'path', className: 'lightning-branch', attrs: { d: 'm25 16 10-7m-13 23-11 8' } },
    { tag: 'path', className: 'lightning-bolt', attrs: { d: 'M28 3 10 27h13l-3 18 19-27H26z', fill: 'currentColor' } },
    { tag: 'path', className: 'lightning-ground', attrs: { d: 'M4 45h40m-34-4 5 4m19 0 5-4' } },
  ],
  'spell-3': [
    { tag: 'path', className: 'frost-spire', attrs: { d: 'M24 3 36 17 31 38 24 45 17 38 12 17z' } },
    { tag: 'path', className: 'frost-facet', attrs: { d: 'm12 17 12 9 12-9M24 26v19m0-19 7 12' } },
    { tag: 'path', className: 'frost-shard', attrs: { d: 'm5 26 6-9 6 9-6 9zM31 31l6-9 6 9-6 9z' } },
  ],
  'spell-5': [
    { tag: 'path', className: 'mend-ring mend-ring-a', attrs: { d: 'M24 3A21 21 0 0 1 45 24' } },
    { tag: 'path', className: 'mend-ring mend-ring-b', attrs: { d: 'M45 25A21 21 0 0 1 24 45' } },
    { tag: 'path', className: 'mend-ring mend-ring-c', attrs: { d: 'M23 45A21 21 0 0 1 3 25' } },
    { tag: 'path', className: 'mend-ring mend-ring-d', attrs: { d: 'M3 23A21 21 0 0 1 23 3' } },
    { tag: 'path', className: 'mend-stitch', attrs: { d: 'm17 24 4 4 10-11m-7 18v6m-8-9 4 3' } },
  ],
  'spell-6': [
    { tag: 'path', className: 'rise-ground', attrs: { d: 'M3 39h12m18 0h12M17 39l7-6 7 6' } },
    { tag: 'path', className: 'rise-crack', attrs: { d: 'm23 45 3-5-3-4 3-4' } },
    { tag: 'circle', className: 'rise-bot rise-bot-a', attrs: { cx: '15', cy: '21', r: '4.5' } },
    { tag: 'path', className: 'rise-bot rise-body-a', attrs: { d: 'M9 35v-5a6 6 0 0 1 12 0v5z', fill: 'currentColor' } },
    { tag: 'circle', className: 'rise-bot rise-bot-b', attrs: { cx: '33', cy: '17', r: '4.5' } },
    { tag: 'path', className: 'rise-bot rise-body-b', attrs: { d: 'M27 31v-5a6 6 0 0 1 12 0v5z', fill: 'currentColor' } },
  ],
  'spell-7': [
    { tag: 'path', className: 'shield-fill', attrs: { d: 'M24 3 43 10v12c0 11-8 19-19 23C13 41 5 33 5 22V10z', fill: 'currentColor', opacity: '0.12' } },
    { tag: 'path', className: 'shield-outline', attrs: { d: 'M24 3 43 10v12c0 11-8 19-19 23C13 41 5 33 5 22V10z' } },
    { tag: 'path', className: 'shield-seam', attrs: { d: 'M24 8v32m-9-21 9 5 9-5' } },
    { tag: 'path', className: 'shield-rune', attrs: { d: 'm18 26 4 4 8-10' } },
  ],
  'spell-8': [
    { tag: 'path', className: 'icon-main', attrs: { d: 'M8 40c6-4 4-12 10-16s14-2 16-10' } },
    { tag: 'path', className: 'icon-accent', attrs: { d: 'M34 14c2-4 6-6 8-10M30 20c4 0 8 2 10 6' } },
    { tag: 'circle', className: 'icon-accent', attrs: { cx: '12', cy: '38', r: '2.5', fill: 'currentColor' } },
  ],
  'spell-9': [
    { tag: 'path', className: 'icon-main', attrs: { d: 'M24 44V26c0-6-8-8-8-16M24 30c0-6 9-7 9-15M24 36c-4-2-10 0-12-4' } },
    { tag: 'path', className: 'icon-accent', attrs: { d: 'M16 10l-3-3M33 15l3-3M12 32l-3 1M8 44h32' } },
  ],
  'spell-10': [
    { tag: 'path', className: 'icon-main', attrs: { d: 'M8 30C14 12 34 8 42 14 30 12 18 18 14 32z', fill: 'currentColor' } },
    { tag: 'path', className: 'icon-accent', attrs: { d: 'M6 40l10-6M14 42l6-4' } },
  ],
  'spell-11': [
    { tag: 'circle', className: 'icon-main', attrs: { cx: '14', cy: '16', r: '4' } },
    { tag: 'circle', className: 'icon-main', attrs: { cx: '33', cy: '12', r: '3.5' } },
    { tag: 'circle', className: 'icon-main', attrs: { cx: '30', cy: '32', r: '4.5' } },
    { tag: 'circle', className: 'icon-main', attrs: { cx: '12', cy: '35', r: '3' } },
    { tag: 'path', className: 'icon-accent', attrs: { d: 'M18 18c4 4 6 8 8 12M30 15c-4 4-8 10-15 18' } },
  ],
  'spell-12': [
    { tag: 'circle', className: 'icon-main', attrs: { cx: '24', cy: '24', r: '7' } },
    { tag: 'path', className: 'icon-accent', attrs: { d: 'M24 5v7M24 36v7M5 24h7M36 24h7M10.5 10.5l5 5M32.5 32.5l5 5M37.5 10.5l-5 5M15.5 32.5l-5 5' } },
  ],
  'spell-13': [
    { tag: 'path', className: 'icon-main', attrs: { d: 'M4 34h40M24 34l-4-10 6-6-3-10' } },
    { tag: 'path', className: 'icon-accent', attrs: { d: 'M10 34l4-6 4 6M30 34l4-8 5 8' } },
  ],
  'spell-14': [
    { tag: 'path', className: 'icon-main', attrs: { d: 'M24 6c10 6 14 18 0 36C10 24 14 12 24 6z' } },
    { tag: 'path', className: 'icon-accent', attrs: { d: 'M24 12v24M12 18c-4 2-6 6-6 10M36 18c4 2 6 6 6 10' } },
  ],
  'spell-15': [
    { tag: 'path', className: 'icon-main', attrs: { d: 'M4 30c6-8 10 8 16 0s10 8 16 0 6-4 8-6' } },
    { tag: 'path', className: 'icon-accent', attrs: { d: 'M30 16c4-6 10-4 12 0-4-1-6 0-8 3M4 40c6-6 10 6 16 0s10 6 16 0' } },
  ],
  'spell-16': [
    { tag: 'path', className: 'icon-main', attrs: { d: 'M24 44V22M24 22c-10 0-14-8-14-16 8 0 14 6 14 16zM24 26c8 0 12-6 12-14-6 0-12 4-12 14z' } },
    { tag: 'circle', className: 'icon-accent', attrs: { cx: '24', cy: '14', r: '2', fill: 'currentColor' } },
  ],
  'spell-17': [
    { tag: 'path', className: 'icon-main', attrs: { d: 'M12 40l4-12 10-4 8 2 6 12M26 24l-2-8 4-6' } },
    { tag: 'path', className: 'icon-accent', attrs: { d: 'M28 10l-4-6M28 10l6-4M24 16l-6-6M30 12l8-2' } },
  ],
  'spell-18': [
    { tag: 'path', className: 'icon-main', attrs: { d: 'M30 6l2.5 7 7.5.5-6 4.5 2 7-6-4-6 4 2-7-6-4.5 7.5-.5z', fill: 'currentColor' } },
    { tag: 'path', className: 'icon-accent', attrs: { d: 'M20 22L8 40M28 28l-8 14M14 18L4 30' } },
  ],
  'spell-19': [
    { tag: 'path', className: 'icon-main', attrs: { d: 'M16 30c0-10 3-18 8-18s8 8 8 18zM12 30h24M22 34a2 2 0 0 0 4 0' } },
    { tag: 'path', className: 'icon-accent', attrs: { d: 'M8 40c5 3 27 3 32 0' } },
  ],
  'spell-20': [
    { tag: 'path', className: 'icon-main', attrs: { d: 'M4 36h40M12 36a12 12 0 0 1 24 0' } },
    { tag: 'path', className: 'icon-accent', attrs: { d: 'M24 18V6M14 21l-6-8M34 21l6-8M24 44v-4' } },
  ],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Hand-authored inline spell emblems; distinct from the gesture glyphs shown beneath them. */
export function createSpellIcon(spellId: string): SVGSVGElement {
  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('viewBox', '0 0 48 48');
  root.setAttribute('class', `spell-icon spell-icon--${spellId}`);
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('focusable', 'false');
  root.setAttribute('fill', 'none');
  root.setAttribute('stroke', 'currentColor');
  root.setAttribute('stroke-width', '2.6');
  root.setAttribute('stroke-linecap', 'round');
  root.setAttribute('stroke-linejoin', 'round');

  const shapes = ICONS[spellId] ?? [];
  for (const shape of shapes) {
    const node = document.createElementNS(SVG_NS, shape.tag);
    node.setAttribute('class', shape.className);
    for (const [name, value] of Object.entries(shape.attrs)) node.setAttribute(name, value);
    root.append(node);
  }
  return root;
}
