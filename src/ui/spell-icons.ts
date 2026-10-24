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
  'spell-4': [
    { tag: 'path', className: 'gale-line gale-line-a', attrs: { d: 'M3 13c11-12 16 8 26 0s11-7 16-4' } },
    { tag: 'path', className: 'gale-line gale-line-b', attrs: { d: 'M3 24c11-11 17 7 27 0s10-4 15-2' } },
    { tag: 'path', className: 'gale-line gale-line-c', attrs: { d: 'M3 35c9-10 15 5 25 0s11-1 17 2' } },
    { tag: 'path', className: 'gale-tip', attrs: { d: 'm38 7 7 2-4 6' } },
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
