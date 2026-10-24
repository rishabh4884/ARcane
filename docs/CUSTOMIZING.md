# Customizing ARcane

Everything a player or designer is likely to change lives in `src/config/`. With the dev server running, edits appear instantly.

## Change what a spell looks like or which gesture casts it

Edit `src/config/spells.ts`:

```ts
{ id: 'spell-4', name: 'Spell 4', color: '#b69cff', effect: 'beam', defaultGesture: 'swish' }
```

- `name`: shown in the HUD and as the floating label when cast.
- `color`: any CSS colour.
- `effect`: `'burst' | 'ring' | 'nova' | 'beam' | 'spiral' | 'rain'`.
- `defaultGesture`: any gesture `id` from `gestures.ts`. Each gesture must be used by exactly one spell by default.

Players' own bindings are saved in their browser and win over the defaults. If you change defaults while testing, press **Restore defaults** in the Spellbook (or clear the `arcane.spellbook.v1` key in local storage).

## Add a gesture that already has a recogniser

Add an entry to `GESTURES` in `src/config/gestures.ts`. Every entry needs a `group` (its dropdown section: `sign`, `sweep`, `strike`, `sigil`, `twin-sign` or `twin-motion`). An entry is one of five kinds. Only gestures bound to a spell are live, so new ones appear in the dropdown without affecting anything else.

**Order matters.** If two live gestures would fire on the same frame, the earlier one wins. Put the stricter variant above the looser one (Phoenix Ascent above Rise, Sunwise above Circle).

Single-hand kinds:

**A held hand shape** (`kind: 'pose'`). Available poses are `fist`, `victory`, `horns`, `point`, `trident` and `open`. Open-palm holds only charge while the palm is still:

```ts
{ id: 'open-hold', group: 'sign', kind: 'pose', pose: 'open', holdMs: 600,
  name: 'Open palm', hint: 'Hold your palm up, fingers spread.', glyph: '✋' }
```

**A directional sweep** (`kind: 'swipe'`) with `direction` of `left`, `right`, `up`, `down`, `horizontal` or `vertical`, and an optional `hand` of `open` (default), `fist` or `point`. Tune with `minTravel` (palm lengths) and `minSpeed` (palm lengths per second):

```ts
{ id: 'slam', group: 'sweep', kind: 'swipe', direction: 'down', minSpeed: 8,
  name: 'Slam', hint: 'Open hand, then drive it downward.', glyph: '🫳' }
```

**A drawn circle** (`kind: 'circle'`) with `direction` of `any`, `cw` or `ccw`:

```ts
{ id: 'circle-cw', group: 'sigil', kind: 'circle', direction: 'cw',
  name: 'Clockwise circle', hint: 'Trace a circle clockwise.', glyph: '🔄' }
```

Two-hand kinds, which need both hands in view:

```ts
// both hands show the same sign
{ id: 'twin-fangs', group: 'twin-sign', kind: 'dual-pose', pose: 'victory', holdMs: 450,
  name: 'Twin Fangs', hint: 'Victory sign with both hands, and hold.', glyph: '🐍' }
// both open hands move together: 'apart' | 'together' | 'lift' | 'drop'
{ id: 'rift', group: 'twin-motion', kind: 'dual-motion', motion: 'apart',
  name: 'Rift', hint: 'Pull both open hands sharply apart.', glyph: '✴️' }
```

Because gestures and spells are paired one to one, add a spell (below) for any gesture you want to be castable.

## Add a spell

Append to `SPELLS` in `src/config/spells.ts` with an unused gesture as `defaultGesture`. The dock, Spellbook panel and key shortcuts (<kbd>1</kbd> to <kbd>9</kbd>) pick it up automatically. The dock is laid out for six columns; adjust `grid-template-columns` in `src/style.css` if you add more.

## Write a real spell effect

Placeholder effects live in `src/world/effects.ts`: one `case` per `EffectKind`, each emitting particles with a position, velocity, colour, size and lifetime. Replace a case with your own, or add a new kind to `EffectKind` in `spells.ts` and a case for it.

For richer spells (meshes, shaders, sounds), call into your own code from `World.cast(spell)` in `src/world/World.ts`. The wisp's position is the cast origin.

## Create a new kind of gesture

For example, a two-finger pinch or a wave. The pattern:

1. Add a recogniser as a pure function in `src/gestures/motion.ts` (or a new file) that takes samples or landmarks and returns a result or `null`.
2. Add a new interface to the `GestureDef` union in `src/config/gestures.ts`.
3. Call your recogniser from the loop in `GestureEngine.process` (or, for two hands, `HandsEngine.process`).
4. Test it with `makeHand` and `makeDriver`. Include a look-alike it should reject.

## Tune the feel globally

`src/config/tuning.ts` holds the defaults for smoothing, finger thresholds, hold time, cooldown, dropout tolerance and cursor reach. Players can adjust the common ones in the Spellbook panel.

## Self-hosting

`npm run build` produces a static site in `dist/`; host it anywhere that serves files over **https** (browsers only share the camera on secure pages, with `localhost` as the exception). The build uses relative paths, so it also works from a sub-folder.
