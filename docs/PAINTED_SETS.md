# Painted sets and the drawn look

> Picking the project up? Start with [HANDOFF.md](HANDOFF.md).

Arcane looks like a 2D animated series: drawn characters in ink and paint, standing in painted
backgrounds, with effects drawn the way an effects animator draws them. All of it is made in this
repository, by the pipeline described here. [ART_BIBLE.md](ART_BIBLE.md) is the design brief; this
is how the pictures are made.

## The cast: ink and paint

Characters are the sculpted models (`art/assets/*.py`, built with `npm run art -- <asset>`) rendered as
drawings, not lit as 3D:

- **Paint:** three flat bands (lit, mid, shade) with brush-broken edges, cool shadow colours, a moon
  rim on the edge facing the moon, crease ink in the folds (`src/world/render/InkPaint.ts`).
- **Line:** an outline of constant on-screen weight that thins with distance and boils from drawing to
  drawing, plus a screen-space pass that inks folds and overlaps inside the silhouette
  (`src/world/render/InkEdgePass.ts`).
- **Timing:** figures move on twos (12 drawings a second); strikes and hits go to ones.
- **Air:** in a painted set, figures take the painting's own aerial haze, so a creature at forty metres
  sinks into the same air as the trees around it.
- **Calm against the paintings:** a figure carries no finer variation than the painting behind it. Band
  edges bend with one broad brush pattern, colour and occlusion are read broad so the sculpt's grain
  never speckles the shadows, only the deepest creases are inked, the warm turn between light and
  shadow is a soft band rather than a line, the brightest band stays on broad forms (slim fingers,
  ears and straps read in two tones), the outline boils quietly every other drawing, and inner ink
  marks only real folds and overlaps, fading on small distant figures.

## The sets: painted backgrounds

A set is painted the way a background painter on a series works, from a layout:

1. **Layout** — `npx vite-node tools/dump-set.ts` writes `art/sets/<set>_layout.json` from the game's
   own data: the camera at the casting spot, the moon, the ground (heights and painted masks), every
   tree and stone, the lanterns, the gate, the pool, the path, and the cutscene shots the gameplay
   painting cannot hold (`src/world/paintedShots.ts`).
2. **Passes** — `art/set_build.py` (Blender) composes the place exactly as the game lays it out and
   renders what a painter gathers before painting: each light on its own (moon, sky, lanterns), local
   colour, world position, normals and what every pixel is (sky, ground, trunk, leaf, stone, lantern,
   glass, gate, water). The tree and stone prototypes are cached in `art/build/sets/prototypes.blend`.
3. **Design** — `art/arcane_art/painter.py` decides the picture: the region's palette pressed onto the
   values; each kind of thing given a colour in shadow and in moonlight, with the moon pass only saying
   where the light falls; a pool of moonlight on the clearing; the worn path; foliage in clumps lit
   along their moon-side edges; mist banks fixed to the ground and thickest in the hollows; the four
   depth layers (dark foreground frame, play plane, midground lifting toward the air, quiet
   background); a painted sky with the moon, its halo, silvered clouds and stars fixed to directions;
   a lighter gap behind the gate, the view's destination.
4. **Paint** — the design is repainted with brush strokes, broad to fine (one colour per stroke,
   bristle streaks, laid along the forms, stopping at the edge of a thing), then leaf-cluster dabs
   along every canopy edge, grass tufts with moonlit tips, leaf litter, and an unsteady hand and paper
   tooth over everything.
5. **Stand it up** — `src/world/PaintedSet.ts` projects the painting from its own camera onto simple
   stand-ins (the ground the creatures walk on, decimated trees and stones, the gate and lanterns), so
   from that camera the wood is exactly the painting, creatures pass behind painted trunks, and small
   camera moves keep true parallax.

`npm run set -- edge` does it all; `npm run set:paint -- edge` repaints from the cached passes (about a
minute); add `--quick` for a two-layer preview, `--shots` (or `--shot <name>`) for cutscene shots.
Outputs land in `public/art/sets/<set>/` (painting, depth, camera, stand-ins, shots) and review images
in `art/review/sets/`.

### A painting for every shot

A series paints a background for every shot. The gameplay view has its painting; each cutscene camera
key that the gameplay painting cannot hold (lying on the ground looking up at the canopy, crouching by
Tuck, standing in the clearing before the Warden) gets its own, made by the same pipeline from that
key's camera. The runtime projects two paintings at once and, every frame, chooses and weighs the two
that best serve the camera; each surface takes them in proportion to how well each saw it. As a
cutscene camera moves from one key to the next it passes from one painting into the next. Clouds,
stars and mist are fixed to the world, not the frame, so every painting of a place agrees with the
others.

### Every region, in its own light

The Mirefen, the Lantern Deeps, the Unlit Throne and Dawn are painted from the same layout and passes
as the Edge, each with its own direction (`DIRECTIONS` in `art/set_paint.py`): the palette from the
art bible, how the sky reads (moon, a low sun, or veiled by a closed canopy), how much mist and how
low, how much colour night takes, and what the region adds by hand — standing water mirroring the low
sky and reeds at its edge in the Mirefen, small colonies of fungi glowing cold at the roots in the
Deeps, drifts of blossom and lantern-flowers at Dawn. In the game each region swaps in its painting,
its built props step aside, its living things stay, and the mist and the drawn figures take its light.
`python3 art/set_paint.py edge --regions` repaints them (`--region <key>` for one).

Cutscenes are painted in the light of their moment: a scene that turns (the Warden darkening the
Edge, the fen freed, the ending's dawn) paints its later keys in the new light, and the camera's
passage from key to key carries the change.

### Living layers

The painting is still; the set is not: crowns sway with gusts, cloud shadows drift across the floor and
trees, mist creeps and rolls, moon shafts shimmer where the canopy opens, lantern halos breathe and
gutter, fireflies drift, and the foreground layer hangs swaying fronds and branches into the corners.

## Props: drawn

Anything else built in three.js for a scene or a region (Tuck's stump and lantern-flowers,
butterflies, hanging lanterns, the set pieces) goes through `drawn()` (`src/world/render/DrawnProp.ts`):
its material becomes the cast's ink and paint (three flat bands, a moon rim, the same air) and the edge
pass inks it. What glows keeps its glow.

## Effects: drawn

Effects follow the effects-animation tradition rather than particle simulation. The shared particle
system draws motes as hard-edged discs with a pale core, sparks as four-pointed glints redrawn every
drawing, and smoke and dust as lobed cel puffs inside an ink line, held a drawing at a time (sparks on
ones, smoke on twos). The spells' own light (ribbons, wards, bolts, halos) is drawn as cel light
(`src/world/render/CelLightPass.ts`): slim shapes of light are cut into flat bands with a hard core,
broad flashes and beams stay soft fill, and the bloom lays the soft halo around the hard cores. Ember Lash
(`src/world/fx/emberLash.ts`) is the model: designed flame shapes in flat bands inside a dark ink
line, redrawn on twos so the fire boils like drawings; licks peeling off the lash; a starburst held for
three drawings on ones at the crack; tongues tossing off flame bits; smoke as cel-shaded puffs that
break apart instead of fading; a hard-edged scorch with coals winking out.

## What is next

- Redraw the remaining spells' own shapes (bolts, crystals, wards) as drawn effects, after Ember Lash;
  their particles are already drawn.
- Compose the region set pieces (the bower, the heartwood, the loom, the root throne) into their
  cutscene paintings instead of drawing them live.
