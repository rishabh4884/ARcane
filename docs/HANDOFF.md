# Arcane — handoff for the next agent

Written 2026-11-21 when the owner's Claude subscription ended mid-project. Read this first, then
[PAINTED_SETS.md](PAINTED_SETS.md) (how the look is made) and [ART_BIBLE.md](ART_BIBLE.md) (the design
brief). The git log is the detailed record; the last 25 commits are listed at the end.

## 1. Where things stand

Arcane is a webcam hand-gesture, dark fairy-tale action game (three.js + TypeScript + Vite; MediaPipe
hand tracking). Over the last two days its look was rebuilt as a **2D animated series**, made entirely in
this repo by code (no artists):

- **Drawn characters**: the sculpted models are rendered as ink and paint (flat bands, cool shadows, a
  moon rim, outlines and inner ink), animated on twos. Recently calmed so they sit with the paintings
  (fine noise, speckle and line flicker removed; thin forms such as fingers drop the brightest band).
- **Painted backgrounds**: every region of the wood (the Edge, the Mirefen, the Lantern Deeps, the Unlit
  Throne, Dawn) is a brush-painted background projected onto stand-ins, the default world. Cutscenes
  get a painting per camera shot; the Edge's are complete, other regions' are partly done (section 4).
- **Drawn props and effects**: scene props are drawn in ink and paint; all spell particles are drawn
  effects (motes, glints, cel puffs); Ember Lash is fully redrawn as effects animation; spells' light
  is drawn as cel light.
- **Living layers** over the paintings: crown sway, drifting cloud shadows, mist, moon shafts,
  lantern halos, fireflies, the swaying foreground layer.
- The title card opens on the painted Edge. The caster's hands are plain human hands (one sculpted
  surface each, two-tone, no glow).

The game builds and its 281 tests pass when the machine is idle (see the note on test timeouts in
section 5).

## 2. The owner's standing rules (from their own messages)

- **Commits:** only the owner's identity (Rishabh Patel). Never add "Co-Authored-By" or any AI
  attribution, in commits or PRs. Push to `origin main` after each major change or fix.
- **Name and positioning:** always "Arcane", a full dark fairy-tale action game, never "a spell-casting
  simulator".
- **Look:** a beautifully produced 2D animated series; mature woodland fantasy (no mascots, anime eyes,
  chibi); no visible 3D, gloss, capsule limbs or primitive-built bodies; no stiff puppet motion. Never
  ship primitive-looking stand-ins. Make everything yourself; don't defer to artists.
- **Tools and pace:** any tool is fine (Blender included). Keep working; don't pause to ask about tooling.
- **Changes to the characters' design:** keep them small. The owner asked that fixes calm the look
  without changing the design as a whole.
- **Usage:** only the weekly limit was ever a stop signal; the owner didn't mind hitting 5-hour limits.

## 3. How to run and inspect

```
npm install            # also restores MediaPipe assets
npm run dev            # http://localhost:5173 (the game needs a webcam to play)
npm test               # vitest, 281 tests
npm run build          # tsc + vite build
```

URL flags: `?world=cutout` (the old illustrated cut-out wood), `?world=authored` (the old lit 3D wood),
`?look=3d` (characters lit as 3D instead of drawn).

Without a webcam, use the dev console hooks (development builds only):

- `arcane.inspect.spot(['goblin','gorrik'], 12, walk?)` — the casting spot's view with figures
  standing up the path; `show([...kinds], distance)`, `focus(y, distance, fov)`, `hands()`, `clear()`.
- `arcane.world.previewEffect('fire', point, colour?)` — play any spell's effect outside an encounter.
- `arcane.world.setRegion('fen' | 'deeps' | 'throne' | 'dawn' | 'edge')`.
- `arcane.game.scene('intro')` — play a cutscene; `arcane.game.play(levelId)`; `arcane.game.unlockAll()`
  (changes saved progress).

## 4. Unfinished work (do these first)

1. **Cutscene backgrounds for the other regions.** 59 shots are planned in `art/sets/edge_layout.json`
   (written by `npx vite-node tools/dump-set.ts`). All 12 Edge shots are painted. When this was written
   a Blender render of the rest was running (37 of 59 had passes) and only 16 were painted. To finish:
   ```
   # render any shots still missing their passes (about 1–2 min each)
   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P art/set_build.py -- edge --shots --missing
   # paint them (about 1.5 min each; three painters can share the work)
   python3 art/set_paint.py edge --shots --missing --part 0/3 &
   python3 art/set_paint.py edge --shots --missing --part 1/3 &
   python3 art/set_paint.py edge --shots --missing --part 2/3
   ```
   Then commit `public/art/sets/edge/shots/`, `public/art/sets/edge/shots.json` and
   `art/review/sets/edge-*.jpg`. The game only uses shots listed in `shots.json` (painted ones), so a
   partial set is safe: a missing shot falls back to the region's gameplay painting, which looks
   stretched for camera keys far from the casting spot.
2. **Check `git status`.** The main session was committing its last work as the subscription ran
   out; anything left uncommitted in `src/world/` (for example the cel light pass, PostFX or World
   changes) should be tested, then committed or discarded.

## 5. Known issues and minor fixes

- **Test timeouts under load.** The procedural-body tests (goblin, gorrik, king) and "Spirit Stag"
  bake bodies on the CPU and time out at vitest's 5 s default while Blender is rendering. They pass
  when idle. Raising those tests' timeouts (e.g. 30 s) would make the suite robust.
- **Region set pieces are drawn live, not painted.** The bower, heartwood, loom, origin and throne set
  pieces (cutscene arenas) are three.js props drawn in ink and paint by `drawn()`; they are not in the
  cutscene paintings. Composing them into the Blender layout would make those scenes match the Edge's
  finish.
- **Remaining spells' own shapes.** Particles and light are drawn; Ember Lash is fully drawn; the other
  spells' core shapes (bolts, crystals, wards, beams) are still their older shaders. Redraw them one at
  a time with Ember Lash's `DRAWN` GLSL chunk (flat bands inside an ink line, redrawn on twos).
- **Painting details that could be better:** the Edge's near ground is a large dark area; grass tufts
  are a little uniform; very near canopies show clump shading as large scales (intro shot 0); lantern
  panes read as small windows; the Mirefen's standing water is a narrow strip.
- **Projection limits:** past a 2:1 screen (ultrawide) the frame edges show the plain fallback tone;
  ground behind trunks shows the fallback tone when the camera moves far from a painting; the menu's
  drifting camera is reduced in painted mode for this reason.
- **The hands' two-tone override** (`Character.ts`, `design.kind === 'hands'`) predates the general
  thin-form fix (73ad5f2) and is now partly redundant; harmless to keep.
- **The ember gnome** is still a procedural body (Tuck has a built model); fine in the drawn look.
- `docs/2D_PRODUCTION.md` (an artist-team plan) is superseded; `docs/VISUAL_REWRITE.md` (3D plan) too.

## 6. Recommendations and ideas

- Finish section 4, then redraw the remaining spells; they are the most visible thing not yet drawn.
- Living layers worth adding: a slowly drifting painted cloud layer in the sky (paint clouds as a
  separate RGBA layer), live ripples on the Mirefen's water, swaying painted grass cards at the edges.
- Paint the set pieces into their regions' cutscene shots (export the `cast.ts` builders to glTF, add
  them to `art/set_build.py`).
- Performance: profile on an integrated GPU. The painted set is cheap (stand-ins and one projected
  material); the ink edge pass and the cel light pass cost one extra scene render each.
- Asset weight: paintings are about 0.2–0.4 MB each (WebP); shots load per cutscene and are released
  after. Keep an eye on total size if more regions or shots are painted.
- Add tests for `planShots` (coverage and per-scene light) and for `PaintedSet`'s painting choice.

## 7. How the pieces fit (map of files)

- `src/world/PaintedSet.ts` — loads a set (painting, depth, camera, stand-ins), projects two paintings
  at once, chooses and weighs them per frame (`paintedShots.ts: viewScore`), region paintings,
  cutscene shots (`prepareShots`/`releaseShots`), crown sway, cloud shadows.
- `src/world/paintedShots.ts` — which cutscene keys need their own painting, and in whose light.
- `src/world/woodlandLayout.ts` — the ground, trees, stones and the gate as data, shared by the game
  and the painting pipeline. `tools/dump-set.ts` writes it out for Blender.
- `src/world/ForestEnvironment.ts`, `src/world/regions.ts` — the painted world, region paintings, mist
  tint and drawn light per region; region props step aside when painted.
- `src/world/render/InkPaint.ts`, `InkEdgePass.ts` — drawn characters; `DrawnProp.ts` — drawn props;
  `src/world/particles.ts` — drawn particles; `src/world/fx/emberLash.ts` — the model drawn effect.
- `src/world/rig/Character.ts`, `src/world/rig/Body.ts`, `src/world/rig/Sculpt.ts` — figures; the hands
  are in `src/cutscene/cast.ts` (`KINDLER_HANDS`).
- `src/cutscene/Cutscene.ts`, `scripts.ts` — cutscenes; shots load while each opens in black.
- `art/` — Python art pipelines: `build.py` (character models via Blender: `npm run art -- <asset>`),
  `set_build.py` (Blender: a set's layout passes, stand-ins, shot passes), `set_paint.py` and
  `arcane_art/painter.py` (plain Python with numpy, scipy and Pillow: design and brush painting, region
  directions in `DIRECTIONS`). Intermediates go to `art/build/` (ignored); outputs to `public/art/`.
- `public/art/sets/edge/` — `paint.webp`, `depth.png`, `meta.json`, `proxies.glb`, `regions/<key>/`,
  `shots/<name>/`, `shots.json`.

Blender 5.2 is at `/Applications/Blender.app`. A full Edge rebuild (`npm run set -- edge`) takes about
5 minutes; repainting from cached passes (`npm run set:paint -- edge`) about 1–2 minutes;
`--regions` repaints the four region paintings.

## 8. Recent commits

```
1c36a46 Let the summoning column read as light, not a glass tube
c206c58 Keep broad flashes soft in the cel light
73ad5f2 Keep the brightest band to broad forms on figures and props
90a530a Draw the caster's hands in two tones
61ca7ca Draw spells' light as cel light
8d1245f Soften the warm edge on the drawn figures into a band
f2792a1 Make the Kindler's hands plain human hands
968c50b Calm the drawn characters against the painted sets
2b0270f Plan and paint shots for every cutscene, each in the light of its moment
819415b Draw the Kindler's fingers as one line from knuckle to tip
dafbecb Draw every spell's sparks, motes and smoke as effects animation
0ce23c2 Draw every scene prop in ink and paint, in each region's light
9a3cbef Paint every region of the wood in its own light
99b4a65 Paint a background for every cutscene shot in the Edge
856061e Build Tuck and draw him in ink and paint
50dcd94 Redraw Ember Lash as drawn effects animation
26b742f Let clouds pass the moon over the painted wood
74894b1 Make the painted wood the default, and open on it
69aae6c Paint the Hushed Edge as a set and stand it up in the game
954110e Draw the cast in ink and paint, animated on twos
a9c469d Plan Arcane as a 2D animated series
ea6de2f Unhook Tuck's unbuilt model
dcc9173 Pause the 3D pipeline where it stands
e5a6bf5 Rebuild Gorrik as a brute of real mass, and stage Ember Lash in five beats
6c98ef1 Skin authored characters and bring the Bramble Goblin into the game
```
