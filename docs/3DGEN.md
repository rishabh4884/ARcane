# 3DGEN: building Arcane's 3D models in Blender

**Who this is for:** the agent (or artist) building Arcane's 3D models in Blender.
**What it covers:** everything needed to model, paint, shade, rig, animate and export every 3D asset for Arcane, so that the game can switch from 2D painted cards to real 3D without changing its look.
**Status:** handoff, 2026-11-17. Supersedes nothing; the 2D game stays as the fallback.

Read sections 1–3 before touching Blender. They are the **vision lock**. Anything that breaks them is wrong, however good it looks on its own.

---

## Contents

1. [Vision lock](#1-vision-lock)
2. [The game you are building for](#2-the-game-you-are-building-for)
3. [Forbidden](#3-forbidden)
4. [Workspace, files and naming](#4-workspace-files-and-naming)
5. [Palette lock](#5-palette-lock)
6. [Shading and colour painting](#6-shading-and-colour-painting)
7. [Modelling and topology](#7-modelling-and-topology)
8. [Rigging](#8-rigging)
9. [Face, eyes and expression](#9-face-eyes-and-expression)
10. [Animation](#10-animation)
11. [Asset specs: creatures](#11-asset-specs-creatures)
12. [Asset specs: gnomes](#12-asset-specs-gnomes)
13. [Asset specs: scenery](#13-asset-specs-scenery)
14. [Preview scene (look-dev in Blender)](#14-preview-scene-look-dev-in-blender)
15. [Export](#15-export)
16. [Validation and review](#16-validation-and-review)
17. [Execution order](#17-execution-order)
18. [What to hand back after each asset](#18-what-to-hand-back-after-each-asset)

---

## 1. Vision lock

Arcane is a dark fairy-tale action game, played with hand gestures through a webcam, set in **the Hushwood**: a moonlit, fog-filled storybook forest. Today every creature, tree, rock and the gate is a **flat painting** drawn in code and shown on cards in a 3D scene. Your job is to build those same things **in the round**, so the player feels they stepped *into* the illustration.

**The test for every asset:** placed next to a screenshot of today's game, does it look like the same artist made it, only in 3D?

### Must stay the same

| Locked | What that means for you |
| --- | --- |
| **Palette** | Every colour comes from section 5. Do not invent colours. Interpolating between two listed colours is fine. |
| **Silhouettes and proportions** | Each creature, seen from the front at the player's eye height, must overlap its 2D painting by **at least 80%** (section 16). Heights are exact (section 11). |
| **Light story** | Dark teal wood, cool moon from the upper left behind the player's view, warm lantern pools, fog. You don't light the game (the engine does), but your colours and forms must read correctly under that light (section 14). |
| **Painted surface** | Broad, soft colour masses and gentle gradients. **No** photo textures, brush-noise, grain or hard toon bands. |
| **Ink line** | Characters keep a thin dark outline (#152f32). The engine draws it; you prepare the mesh for it (section 7). |
| **Creepy motion** | Long stillness, slow drifts, sudden snaps, held pauses. Freer, full-body motion is wanted, but never constant, busy or bouncy (section 10). |

### Quality bar: smooth, painted 3D, never low-poly

- **Smooth silhouettes.** No visible polygon facets on any curve at the closest playable distance, which is about 2 m from a creature's face.
- **Sculpted, organic forms**: no primitive-assembled look (boxes plus cylinders).
- **Soft shading**: smooth normals everywhere except deliberate hard edges (claw tips, the gate's carved stone corners).
- **Stylised, not realistic**: shapes are simplified and exaggerated like the paintings. No pores, no scales, no micro-detail.
- **Grounded**: baked ambient occlusion in crevices, so every form sits in the world.

Mood words: *storybook, moonlit, hushed, uncanny, mossy, ancient, soft, watchful.*
Never: *cute-toy, plastic, glossy, gritty, realistic, chunky low-poly, cel-shaded anime, horror-gore.*

---

## 2. The game you are building for

You don't need to change any game code, but every asset must fit these facts.

| Fact | Value |
| --- | --- |
| Engine | Three.js r0.180, WebGL2, in the browser. Assets load as **glTF 2.0 binary (.glb)**. |
| Units and axes | **1 Blender unit = 1 metre.** Blender is Z-up; the glTF exporter converts to Y-up. |
| Facing | Every character **faces −Y in Blender**, which exports as **+Z in glTF**, the direction the engine treats as "forward". The engine rotates the root around the up axis to face the player. |
| Origin | Character origin at **ground level, between the feet**. Scenery origin at the base centre. |
| Camera | The player stands still at eye height **1.85 m**, 64° vertical field of view. Creatures spawn 3–38 m away and walk in to 2–3 m (the Wraith attacks from 12 m). So you are mostly seen **from the front, slightly from above for small things, and from below for tall things**. |
| Render | No tone mapping (colours display as authored), half-res bloom on bright things, a colour grade with vignette. Fog: exponential, colour #222b29, density 0.023. Background #10171a. |
| Lighting in game | Hemisphere sky #789591 / ground #192824. Moon directional #97aebc at low intensity from the upper left behind. Warm lantern points #eaba6e. Lightning briefly floods everything pale blue-white. |
| Device | Mid-range laptops (M1 MacBook Air class) running hand tracking on the same GPU, so the triangle and texture budgets in section 7 are hard limits. |
| Gameplay hooks | Attacks, hits, frost, arrows sticking in bodies, eye glow and dissolve-to-embers all attach to **named bones, sockets and hit shapes** (section 8). Missing names break the game. |

Current 2D sources, which are the **authoritative design reference** (read them, don't edit them):

- `src/world/CreatureArtwork.ts`: every creature part as vector paths with exact colours. Section 4.3 turns these into SVG backplates.
- `src/world/Creature.ts`: sizes, part pivots, face socket positions, eye colours, motion timing.
- `src/world/EncounterState.ts`: attack timing per creature, which locks animation lengths.
- `public/assets/summons/gnome-ember.svg`, `gnome-moss.svg`: the gnome artwork (import directly).
- `src/world/GnomeSummons.ts`: gnome size, pivots, crossbow muzzle, attack timing.
- `src/world/Illustration.ts`: trees and rocks. `src/world/ForestEnvironment.ts`: the gate, scenery sizes and layout.
- `src/world/LanternGrove.ts`: lantern post dimensions and materials.

---

## 3. Forbidden

Any of these means the asset is rejected:

1. Store-bought, downloaded or library models, textures, HDRIs, materials or rigs. **Everything is original**, made from Arcane's own artwork.
2. Copying or evoking another game's or film's characters, creatures or art (no Tolkien-style Balrogs, no famous goblin designs). The designs are Arcane's own paintings.
3. Photo-scanned or photographic textures, procedural noise textures (Musgrave, Voronoi grain), brush-stroke overlays, film grain or dirt maps.
4. Hard two- or three-step toon shading ramps, anime cel lines painted into textures.
5. Visible faceting, flat shading on curved forms, or under-segmented cylinders (section 7.3).
6. Metallic or glossy surfaces. Exceptions: bronze lantern parts (metallic 0.12, roughness 0.66) and the lantern glass.
7. Transparency, except the Wraith's robe hem fade and lantern glass.
8. Particle hair, fur systems or cloth simulation in the export. Hair and fur are **sculpted clumps**; cloth motion is **bones**.
9. Pure black anywhere. The darkest allowed value is #06120f (eye pits); general darkest is #10171a.
10. Baking procedural life (breathing, head drift, twitches, gaze) into the animation clips. The engine adds those (section 10.3).
11. Changing anything in `src/`, `tests/` or game docs other than adding the export files and manifest described here.

---

## 4. Workspace, files and naming

### 4.1 Tools

- **Blender 4.2 LTS** (the version the repo already uses). Eevee for previews.
- Python scripts for anything repeatable: export, validation, reference import, LOD generation. Run headless: `blender --background --factory-startup <file.blend> --python <script.py> -- <args>`.
- Optional, after export: `gltfpack` (meshoptimizer) for compression and `toktx` for KTX2 textures (section 15.3).

### 4.2 Folder layout

```
art/
  blender/                 # source .blend files (track with Git LFS: git lfs track "*.blend")
    creatures/goblin.blend, rootbound.blend, hollow.blend, wraith.blend
    gnomes/gnome.blend
    scenery/trees.blend, rocks.blend, gate.blend, lantern-post.blend
    lookdev/hushwood-preview.blend
  reference/
    svg/                   # backplates generated in 4.3
    renders/               # your turntables, contact sheets, silhouette overlays
scripts/blender/
  extract_reference_svgs.mjs
  export_asset.py
  validate_asset.py
  make_lods.py
public/assets/models/
  creatures/goblin.glb, rootbound.glb, hollow.glb, wraith.glb
  gnomes/gnome.glb
  scenery/tree-01.glb … tree-04.glb, tree-far-cards.glb, rocks.glb, gate.glb, lantern-post.glb
  manifest.json
  <asset>.anim.json        # per animated asset, section 10.6
```

### 4.3 Reference backplates (do this first)

The 2D creature parts are vector paths in `src/world/CreatureArtwork.ts`. Each call looks like `ink(ctx,'M 152 180 Q ...',light(ctx,'#82946c','#365d4d'),outline,5)`. Write `scripts/blender/extract_reference_svgs.mjs` (plain Node, no dependencies) to:

1. Read `CreatureArtwork.ts` as text.
2. For each creature (`goblin`, `root` = Rootbound, `hollow`, `wraith`) and part (`head`, `body`, `arm`, `leg`, plus `lantern`), collect every path string and its fill colours. For gradients, use the first colour as the top stop and the second as the bottom stop.
3. Write one 512×512 SVG per part to `art/reference/svg/<kind>-<part>.svg`, with a #152f32 stroke where the source has an outline.

Then assemble a **front-view reference sheet per creature** in Blender. Import the part SVGs as curves and place them with the rig layout from `Creature.ts` (section 11 gives the numbers). The gnome SVGs import directly. These sheets are your modelling backplates and your silhouette-check targets.

### 4.4 Naming

| Thing | Pattern | Example |
| --- | --- | --- |
| Objects | `<asset>_<part>` | `goblin_body`, `goblin_eye_L` |
| Materials | `M_<asset>_<purpose>` | `M_goblin_paint`, `M_goblin_eye_glow` |
| Bones (deform, exported) | lower_snake, side suffix `_L`/`_R` | `upperarm_L`, `claw_R_2_02` |
| Sockets | empty `socket_<name>` | `socket_eye_L` |
| Hit shapes | mesh `HIT_<region>` | `HIT_head`, `HIT_torso` |
| Animation actions | `<asset>@<clip>` | `goblin@windup` |
| Shape keys | lower_snake | `blink_L`, `squint` |

Left and right are the **character's** left and right.

---

## 5. Palette lock

All values are sRGB hex. Type them into Blender's colour picker **Hex** field, which is sRGB. Within one part, paint a soft gradient from the **light** value (upper and lit surfaces) to the **dark** value (lower and shadowed surfaces).

### 5.1 World

| Use | Hex |
| --- | --- |
| Ink / outline | #152f32 |
| Deepest ink (eye pits, mouth hollow) | #06120f, #07130f |
| Background night | #10171a |
| Fog | #222b29 |
| Moonlight | #97aebc |
| Sky hemisphere / ground bounce | #789591 / #192824 |
| Lantern light / halo | #eaba6e / #f5b25e |
| Lantern flame emissive | #f5a145 (core #f6cc83) |
| Ground: dark / moss / soil path | #234d37 / #456443 / #7c7d59 |

### 5.2 Creature palettes

**Bramble Goblin**

| Part | Light → dark | Accents |
| --- | --- | --- |
| Head and ears | #82946c → #365d4d | ear inner #536a54; brow highlight #ced8a2 at 30% |
| Face mask (inner face) | #738867 → #365648 | nose #91a07b → #49664f |
| Eye sockets / pupils | #173d36 / #06120f | glow **#d4ff6a** |
| Mouth line / fangs | #213e37 / #d5c99a | |
| Tunic | #9a7960 → #554c42 | shoulder flaps #415649, #405447; belt #344a3f; buckle #a79969 with #3a4e42 rim; lacing #baa17a |
| Arms (skin) | #758b67 → #3a5e4d | sleeve cuff #947657 → #5b5544 |
| Legs | #536052 → #293f3b | shin line #7d886a |

**Rootbound**

| Part | Light → dark | Accents |
| --- | --- | --- |
| Root crown and head | #8b9272 → #34554b | root highlight line #b4ad7c |
| Face hollow | #183b37 | eye pits #07130f; glow **#ffb347**; mouth #3d5b45 |
| Body (root cords) | #7c8467 → #2d5349 | inner hollow #234b41; cord ridges #536e52; leaf scales #577955 / #839063 |
| Arms (root limbs) | #879174 → #365d4c | highlight #b5b18b |
| Legs (root feet) | #687b60 → #244d44 | |

**The Antlered Hollow**

| Part | Light → dark | Accents |
| --- | --- | --- |
| Antlers | #172f32 (dark ink-wood) | |
| Face (bone mask) | #d2d2b1 → #7d9a89 | eye pits #173839, pupils #081b1b; glow **#e6f3ff**; nose ridge #698a7e; chin line #547b73 |
| Robe | #345653 → #102f33 | robe strips alternate #244941 / #1b3c3a |
| Arms | #355653 → #14383b | |
| Legs | #36574f → #15383a | |

**Lantern Wraith**

| Part | Light → dark | Accents |
| --- | --- | --- |
| Hood and head | #8ca3a5 → #3c6970 | face hollow #183940; eye pits #071518; glow **#7fe8ff** |
| Robe | #789697 → #365c66 | lit fold #9cacab; shadow fold #4e777c |
| Arms | #8fa5a2 → #406b72 | |
| Robe tail (in place of legs) | #759596 → #426b70 | |
| Lantern frame | #918b60 → #3d574d | bars #485a47 |
| Lantern glow | #fff2bb → #f2d38a → #bd9c55 → #5c6b4e (centre to edge) | |

**Expression colours (engine-driven, for reference):** anger glare #ff3d1f, frost #9fdcff, ember dissolve edge #ffb066.

### 5.3 Gnome palettes (from the SVGs)

| Part | Ember gnome | Moss gnome |
| --- | --- | --- |
| Cap | #ddaa70 → #a5553e → #573a37 (curled russet cap, tiny bell) | #a4b778 → #58734b → #293f39 (leaf-shaped cap) |
| Coat | #718a7a → #47685b → #2d4944 (forest teal, double stitched; stitching #9bac8a) | #bd8a55 → #8c5c3d → #513f37 (short, sturdy) |
| Skin | #efc08e → #b9765a | #f3c993 → #bd805f |
| Beard | #d29a67 → #a96849 → #593d37 | #fff1cc → #d8c39a → #85775f |
| Crossbow wood | #d7af72 → #68503b, amber rune glow | #d5a56a → #684a34, rune glow |
| Buckle | #fff0b3 → #bb7937 | #fff0aa → #b77b32 |
| Boots / trousers | #354442 boots, #634536 soles, #b27553 patches | #34463e boots, leaf-stitched trousers |
| Belt | #34443d | belt charm |
| Line colour | #293b37 | #243731 |
| Extras | small round spectacles | bright, curious face |

### 5.4 Scenery palettes

| Asset | Colours |
| --- | --- |
| Tree trunk | across the trunk: #153733 → #264d40 → #1a3f38 → #102d30; bark lines #082020 at 23%, moss lines #8ca573 at 18% |
| Tree canopy | top #547d60 (variant 3: #6d865f) → mid #315b4d → bottom #173b39; leaf flecks #587e55 / #a3ac76 |
| Branches | #173d3b, highlight #31564a |
| Roots / moss foot | roots #214b40; moss #365c45 / #6b8250 |
| Mossy rock | #8a9a83 → #4e7265 → #244f49; moss #6e8f69 / #9ca673 |
| Forgotten Gate | stone #8c9e86 → #496f61 → #234c48; joints #345b50; edge highlight #789477; ivy #355d46 |
| Lantern post | timber #564c3b (roughness 0.96); bronze #756344 (metallic 0.12, roughness 0.66); flame #f6cc83, emissive #f5a145 |
| Pond | deep #1f5257 → lit ripple #6b9e8c |

---

## 6. Shading and colour painting

### 6.1 Material model (what the engine expects)

The engine replaces your material with its own **Hushwood** shader, but reads these glTF inputs. Build exactly this in Blender:

- **One painted material per asset** (`M_<asset>_paint`): Principled BSDF with
  - Base Color = **Color Attribute `Col`** (vertex colour), optionally multiplied by one gradient texture (6.3)
  - Roughness **1.0**, Metallic **0.0**, Specular IOR Level **0**, Coat 0, Sheen 0, Subsurface 0
  - Normal: none, or one baked form normal map (6.4)
- **Emissive eye material** (`M_<asset>_eye_glow`): Base Color black, Emission = the creature's glow colour, strength 4.
- **Wraith extras**: `M_wraith_hem` (same as paint, Alpha from attribute `_MASK.g`, Blend Mode *Alpha Blend*) and `M_wraith_lantern_glass` (Emission #f6cc83 / #f5a145, alpha 0.28).
- **Mouth interior** (`M_<asset>_mouth`): flat #06120f, roughness 1.

### 6.2 Vertex colour painting

Colour lives mainly in **vertex colour**, so meshes must be dense enough to hold a smooth gradient. This is another reason they cannot be low-poly.

- Attribute **`Col`**, domain **Face Corner**, type **Byte Color**. Export it as the active colour (`COLOR_0`).
- Paint each part as a **soft gradient** from its light to its dark value (section 5): lighter on top and toward the upper left, darker below. This copies the paintings' built-in light (their gradients run from upper left to lower right).
- Add the accents (flaps, lacing, scales, folds) as **soft-edged shapes**, not crisp decals, except where the painting has a crisp line (the goblin's buckle rim, the lantern bars).
- **Multiply baked AO into `Col`** (6.5). Never let any value drop below #10171a, except eye pits and the mouth.

### 6.3 Optional gradient texture

When a part needs smoother detail than its vertices can hold (the Hollow's bone face, the Goblin's ears, robe folds), use **one** painted texture per asset:

- At most **1024×1024** for heroes, **512×512** for gnomes and scenery props.
- Painted in Blender Texture Paint with soft brushes only, no stencils or noise. sRGB PNG.
- Multiplied over `Col` in the material and exported as the base colour texture. Keep `Col` as the main colour.

### 6.4 Optional form normal map

You may bake **one** tangent-space normal map from the high-res sculpt, to carry *large* forms only: brow ridges, root twists, robe folds, antler knots.

- At most 1024×1024 for heroes, none for gnomes and small props.
- Before baking, smooth out all small detail on the sculpt (a Remesh or Smooth pass). If it reads as texture, it is too fine.

### 6.5 Ambient occlusion

- Bake AO from the high-res sculpt onto the game mesh: 32+ samples, distance about 0.3 m for creatures and 1.5 m for trees and the gate.
- Multiply it into `Col` at **35–50% strength** (stronger in deep crevices such as under the hood, between roots, inside ears).
- Bake contact darkening at the feet, the robe hem against the ground and tree roots.

### 6.6 Custom attributes (exported as glTF `_ATTRIBUTES`)

| Attribute | Type | Meaning |
| --- | --- | --- |
| `_MASK` (Face Corner, Float Color) | R = moon rim strength (1 at silhouette parts: ears, antlers, hood edge, shoulders; 0 on inner faces); G = alpha fade (Wraith hem only, 1 to 0 toward the tatters; 1 elsewhere); B = emissive mask (lantern glow, rune, eyes = 1); A = unused, 1 | Engine shading |
| `_OUTLINE` (Point, Float) | 0–1 outline thickness. 1 by default; taper toward 0.3 at fingertips, claw tips, ear tips, antler tips, robe tatters; 0 on eyes and mouth interior | Engine outline |

Enable **Export Attributes** on export so these survive (section 15).

---

## 7. Modelling and topology

### 7.1 Workflow per character

1. **Blockout** over the front reference sheet (4.3), matching heights exactly. Check the silhouette from the game camera (section 14) before sculpting.
2. **Sculpt** high-res (multires or dyntopo): forms, folds, root twists, antler branching. Stylised and smooth. Stop before micro-detail.
3. **Retopologise** to a clean, mostly-quad mesh with edge flow for deformation (7.2).
4. **Subdivide once** (Catmull-Clark, level 1) and apply. The result is LOD0 and must hit the budgets in 7.4. If it is over budget, retopologise lighter; never reduce by decimating LOD0.
5. **UV** (only for the parts that use a texture or normal map). One UV map, 4–8 px padding at 1024.
6. **Bake** AO (and the normal map if used) from the sculpt; paint `Col` (6.2).
7. **Make LODs** with `scripts/blender/make_lods.py`: LOD1 and LOD2 by Decimate (collapse, keep UV seams and vertex-colour borders), re-skinned through Data Transfer from LOD0 weights.

### 7.2 Topology rules

- Quads for deforming areas. Triangles are fine in rigid, flat places. No n-gons in the export.
- At least **3 edge loops** at every bending joint (elbow, knee, wrist, knuckle, neck, spine segment), plus loops around eyes and mouth.
- Eyes are **separate meshes** in socket cavities (section 9). The eyelids are part of the head mesh.
- **Closed, manifold shells** where possible (the engine's outline is an inflated shell, and open edges show gaps). Close cloth holes or give cloth thickness (≥ 1.5 cm).
- No interior faces, duplicate vertices, zero-area faces or loose geometry.
- Separate meshes only for: eyes, mouth interior, the Wraith lantern, the gnome crossbow, hit shapes. Everything else is one skinned mesh per character (draw-call budget).

### 7.3 Smoothness minimums at LOD0

| Form | Minimum around |
| --- | --- |
| Limbs, fingers, claws, roots, antler beams | 16 segments |
| Torso, head, robe, hood, tree trunk | 24 segments |
| Small round parts (buckle, bell, eyes) | 12 segments |

Shading: **Smooth** everywhere. Use **Smooth by Angle at 180°**, with marked sharp edges only at claw and antler tips, the gate's carved stone corners and lantern frame edges.

### 7.4 Triangle and texture budgets (hard limits)

| Asset | LOD0 | LOD1 | LOD2 | Textures |
| --- | --- | --- | --- | --- |
| Bramble Goblin | ≤ 30k | ≤ 12k | ≤ 4k | ≤ 1 × 1024 colour + ≤ 1 × 1024 normal |
| Rootbound | ≤ 40k | ≤ 15k | ≤ 5k | same |
| The Antlered Hollow | ≤ 40k | ≤ 15k | ≤ 5k | same |
| Lantern Wraith (incl. lantern) | ≤ 35k | ≤ 14k | ≤ 5k | same |
| Gnome (one body, both colourways) | ≤ 18k per body | ≤ 7k | ≤ 2.5k | ≤ 1 × 512 colour, no normal |
| Tree (each of 4) | trunk and branches ≤ 12k + ≤ 400 canopy cards | ≤ 5k + 150 | painted far card | ≤ 1 × 1024 canopy card atlas shared by all trees |
| Mossy rock (each of 5) | ≤ 3k | ≤ 1k | ≤ 300 | vertex colour only |
| Forgotten Gate | ≤ 20k | ≤ 7k | ≤ 2k | ≤ 1 × 1024 colour |
| Lantern post | ≤ 4k | ≤ 1.5k | ≤ 500 | vertex colour only |

Files: every creature GLB at most **4 MB** before compression, gnome at most 2.5 MB, each tree at most 2 MB. Bones at most **80** per character, at most **4 bone influences per vertex**.

---

## 8. Rigging

### 8.1 Two-layer rig

- Build a control rig (Rigify or custom) for animating, with IK/FK limbs, foot roll and spine controls.
- Export **only the deform skeleton**: clean names (8.2), no `DEF-`/`ORG-`/`MCH-` prefixes, no constraints. Bake the actions onto the deform bones at export (section 15).

### 8.2 Bone naming (deform skeleton)

```
root                         (at origin, on the ground; never animated except for the rise/sink offsets)
└─ hips
   ├─ spine_01 ─ spine_02 ─ spine_03
   │   ├─ neck_01 ─ neck_02 ─ head
   │   │     ├─ jaw
   │   │     ├─ eye_L, eye_R            (aim bones; the engine rotates them for gaze)
   │   │     └─ (extras per creature: ear_*, antler_*, crown_*, hood_*)
   │   ├─ clavicle_L ─ upperarm_L ─ forearm_L ─ hand_L ─ (fingers or claws)
   │   └─ clavicle_R ─ upperarm_R ─ forearm_R ─ hand_R ─ (fingers or claws)
   ├─ thigh_L ─ shin_L ─ foot_L ─ toe_L
   └─ thigh_R ─ shin_R ─ foot_R ─ toe_R
```

- Fingers and claws: `claw_<side>_<n>_<seg>`, n = 1 to 3 (or 4), seg = 01 to 03 (`claw_L_2_01`).
- **Spring (secondary) chains**, which the engine simulates as springy lag: prefix `spring_` (`spring_ear_L_01..03`, `spring_robe_F_01..04`). Put custom properties on the **first bone of each chain**: `stiffness` (0–1), `damping` (0–1), `gravity` (0–1). They export as glTF extras.
- The Wraith has no leg chain. It uses `robe_tail_01..04` (spring) instead (section 11.4).

### 8.3 Sockets (required)

Empties parented to bones, oriented so +Z (glTF) points outward from the surface:

| Socket | Parent | Use |
| --- | --- | --- |
| `socket_eye_L`, `socket_eye_R` | head | Eye glow halos, frost |
| `socket_jaw` | jaw | Mouth effects |
| `socket_chest` | spine_03 | Hit sparks, frost centre, spell impacts |
| `socket_head_top` | head | Health or target marker anchor |
| `socket_hand_R` | hand_R | Held items, strike effects |
| `socket_lantern` | lantern bone (Wraith) | Lantern light, **wisp projectile launch** (today launched 1.55 m above ground) |
| `socket_bolt_tip` | crossbow bone (gnome) | Bolt launch point |

### 8.4 Hit shapes (required)

Simple meshes named `HIT_<region>`: capsules (a cylinder with hemisphere caps, 12 segments) or boxes, **parented to the bone they follow**, no material, custom property `arcane_hit = 1`. The engine hides them and uses them for arrows, aim and spell hits.

- Required: `HIT_head`, `HIT_torso`, `HIT_arm_L`, `HIT_arm_R`, plus `HIT_leg_L`/`HIT_leg_R` (or `HIT_robe` for the Wraith).
- Size them to the visible body, **slightly generous** (+5–10%). Together they should cover about the same area as the creature's 2D painting, so aiming feels the same as today.

### 8.5 Skinning

- Weights normalised, at most 4 influences, no unweighted vertices.
- Smooth deformation at the bending extremes of every clip, with no candy-wrapper twisting. Use twist bones or extra loops if needed (they count toward the 80-bone limit).
- Rigid props (buckle, lantern, crossbow, bell) are weighted 100% to one bone.

---

## 9. Face, eyes and expression

The faces are the soul of the creatures. Today they glow, blink, dart, glare red on the wind-up and frost over. All of that stays.

- **Eyes:** separate low-dome meshes (`<asset>_eye_L/R`) using `M_<asset>_eye_glow`, sitting in dark eye pits (#06120f / #07130f) carved into the head. They are parented to the `eye_L/R` bones. The engine drives the glow colour, intensity and gaze, and bloom makes them shine. Eye size and spacing follow the painting (section 11).
- **Shape keys** on the head mesh (glTF morph targets):

| Key | What it does | Notes |
| --- | --- | --- |
| `blink_L`, `blink_R` | Lids close fully | Not on the Hollow: it never blinks; its eyes gutter out through emissive |
| `squint` | Lids narrow about 40% | Used through the wind-up (eyes narrow and glare) |
| `brow_down` | Brow presses down and in | Anger, wind-up |
| `snarl` | Upper lip and cheeks lift | Goblin and Rootbound only |

- **Jaw:** bone-driven. Model the mouth interior (`M_<asset>_mouth`). At rest the mouth is nearly shut. The engine opens it to about 75% through the wind-up and fully on the strike, so the full-open pose must look right: a dark gaping hollow with fangs for the Goblin, a jagged root maw for the Rootbound, a thin long slit for the Hollow, a soft dark oval for the Wraith.
- **Face proportions from the paintings (512 px head canvas):**

| Creature | Eye centres (px) | Eye size (px) | Mouth centre / size (px) |
| --- | --- | --- | --- |
| Goblin | (217, 244), (298, 243) | 40 | (256, 352) / 96 × 40 |
| Rootbound | (230, 279), (288, 279) | 40 | (262, 350) / 86 × 40 |
| Hollow | (229, 289), (286, 289) | 30 | (258, 402) / 34 × 48 |
| Wraith | (234, 277), (283, 277) | 36 | (260, 322) / 62 × 34 |

To convert to metres: head width = 1.2 × creature width (11), head height = the head value in section 11; x_m = (px/512 − 0.5) × head width; y_m from the top of the head = py/512 × head height.

---

## 10. Animation

### 10.1 Motion direction: freer, still eerie

The creatures should move with their **whole bodies** (spine, shoulders, hips, fingers and loose parts) instead of today's few hinged cards. But the **eerie timing is locked**. Freer means more joints and more variety, not more constant motion.

Ten rules every clip follows:

1. **Stillness is the default.** In idles the creature is nearly motionless at least 60% of the time and moves in short bursts.
2. **Slow, then snap.** Drifts ease over 1–3 s; snaps land in **2–3 frames at 30 fps** (50–100 ms) and settle within 3–5 frames. Nothing moves at a steady medium speed for long.
3. **Approaches stall.** The walk set includes a stop: halt, stand, start again (the engine adds the head turn to the player).
4. **Never in step, never on a loop.** Left and right limbs are offset; avoid mirrored or sine-perfect cycles. Idles are 3 different clips, each non-repeating within itself.
5. **The head leads, the body lags.** In turns and reactions the eyes and head go first, the torso follows 4–8 frames later, the hips last.
6. **Slightly wrong joints.** Small overextensions that read as uncanny: the Hollow's neck tilts up to about 35°, the Goblin's head turns a little past natural, fingers curl one joint at a time.
7. **Fight timing is fixed.** Clip lengths in 10.2 match the gameplay timers exactly (±1 frame). The telegraph must read through the whole wind-up.
8. **Secondary motion** goes on spring bones (8.2), which the engine simulates. Animate the **main** body; leave spring chains at rest in the clips.
9. **Feet stay planted** while they bear weight: no foot sliding (the engine adds ground IK on slopes).
10. **Readable from the front.** The camera is in front. Wind-ups coil toward the camera; strikes reach toward it.

### 10.2 Clip list and exact lengths (30 fps)

Durations come from `src/world/EncounterState.ts` and `Creature.ts`. All clips are **in place**: no root translation except the rise and death vertical offsets.

| Clip | Goblin | Rootbound | Hollow | Wraith | Loop | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `idle_a`, `idle_b`, `idle_c` | 6–10 s each | 6–10 s each | 8–12 s each | 6–10 s each | yes | Mostly still; one or two small bursts each; different weight shifts |
| `walk` (Wraith: `hover`) | stride for 1.08 m/s | stride for 0.36 m/s | stride for 0.62 m/s | glide for 0.46 m/s | yes | Store stride length in `.anim.json` |
| `walk_stop` | 0.6 s | 0.9 s | 1.0 s | 0.8 s | no | Walk → stand, weight settling |
| `windup` | **2.0 s** | **2.6 s** | **2.8 s** | **2.8 s** | no (holds last frame) | Full-body coil toward the camera; arms draw back, claws curl |
| `strike` | **0.42 s** | 0.42 s | 0.42 s | 0.42 s | no | Fast lunge or slam; contact at about 0.15 s; Wraith thrusts the lantern hand and the wisp launches |
| `recover` | **3.6 s** | **4.8 s** | **4.5 s** | **5.2 s** | no | Heavy, slow settle back to idle; not a loop; may include a twitch |
| `stagger_L`, `stagger_R` | **0.45 s** | 0.45 s | 0.45 s | 0.45 s | no | Hit from that side; recoil, then return |
| `rise` | **1.4 s** | 1.4 s | 1.4 s | 1.4 s | no | Climbs up out of the ground (root starts 0.35 m below and ends at 0); head comes up last |
| `death` | **1.6 s** | 1.6 s | 1.6 s | 1.6 s | no | Buckle and slump; the engine dissolves it into embers over the same time |

There is **no frozen clip**: the engine freezes the pose that is playing for 3.7 s when ice hits.

**Per-creature signature motion:**

| Creature | Moves like | Eerie signature to include |
| --- | --- | --- |
| Bramble Goblin | Low, quick scuttle with sudden crouches; claws flex as it goes | Freezes mid-step in `idle_b`, then snaps its head toward the camera |
| Rootbound | Heavy drag-step with creaking roots; the body leans before the feet follow | Long dead stillness, then a burst of writhing root-fingers (in `idle_c`) |
| The Antlered Hollow | Tall, stilted stride; long arms swing slowly | Stands motionless the longest; extreme slow head tilt in one idle; never blinks |
| Lantern Wraith | Hovers 0.15–0.3 m off the ground and glides, drifting sideways; robe trails | Stops dead in the air and stares; the lantern arm hangs still while the body sways |

### 10.3 Leave these to the engine (do not animate)

The engine layers these on top of your clips, using today's timing. Keep the relevant bones **calm** in your clips so they have room:

- Breathing (chest and jaw, slow)
- Head tilt drifts every 3.5–7.5 s and rare sharp jerks every 6–15 s
- Claw twitches every 1.8–6 s per arm
- Eye darts, blinks (every 2.4–6.9 s, one in four doubled), gaze locking on the player in the wind-up
- Look-at on eyes, head and spine
- Spring-chain motion (ears, robes, tendrils, hood, lantern)
- Foot planting on slopes

Head and neck in idles: keep within ±10° so look-at and tilt can add on top.

### 10.4 Curves and posing

- Bezier with long **ease-in** into a snap, then a short overshoot (1 frame) and fast settle.
- Use **moving holds**: a held pose drifts by 0.5–1° over a second so it is never mechanically frozen. True dead stops are fine at stall moments.
- Asymmetric timing between sides (offset by 3–9 frames).
- Contact poses read clearly from the front. Silhouettes stay readable in every key pose.

### 10.5 Actions and export

- One Blender **action per clip**, named `<asset>@<clip>`, pushed to its own **NLA track** with the same name.
- All clips start and end in a pose that blends into idle (except `death`). Frame 0 of each idle is the same rest-idle pose.

### 10.6 Sidecar: `<asset>.anim.json`

glTF cannot carry timeline markers, so write them here:

```json
{
  "asset": "goblin",
  "fps": 30,
  "clips": {
    "walk":   { "duration": 0.933, "loop": true,  "strideMetres": 1.01 },
    "windup": { "duration": 2.0,   "loop": false, "events": { "eyesLock": 0.1 } },
    "strike": { "duration": 0.42,  "loop": false, "events": { "contact": 0.15 } },
    "rise":   { "duration": 1.4,   "loop": false, "events": { "eyesOpen": 0.6 } },
    "death":  { "duration": 1.6,   "loop": false, "events": { "slump": 0.5 } }
  },
  "springChains": ["spring_ear_L_01", "spring_ear_R_01"]
}
```

Include every clip. For the Wraith add `"strike": { "events": { "launch": <s> } }`. For the gnome, see section 12.

---

## 11. Asset specs: creatures

Sizes in metres come from `Creature.ts` (`SIZES`). `width` is the body's painted width; the head is 1.2 × width wide.

### 11.1 Bramble Goblin: `goblin.glb`

- **Height 2.0 m**, width 1.8 m (head 1.10 m tall, body 1.28 m, legs 0.64 m). A hunched, wiry goblin with a big head.
- **Head:** huge drooping, leaf-shaped ears that sweep out and down nearly to the head's full width (in the painting they reach 18 px and 494 px of 512). A narrower inner face mask, a long nose ridge, deep-set slanted eye sockets, a wide thin mouth with **two small lower fangs** (#d5c99a). A faint highlight line across the brow.
- **Body:** a bark-brown tunic that widens to a ragged, notched hem; green shoulder flaps on both sides; a dark belt with a small square gold buckle; vertical lacing (6 short stitches) down the chest.
- **Arms:** long, thin, skin-green, with a brown sleeve cuff at the top. Hands end in **3–4 clawed fingers** splayed downward (the painting shows notched claw tips).
- **Legs:** short, dark, with a pale shin line; bare, splayed feet.
- **Spring bones:** `spring_ear_L/R_01..03` (stiffness 0.55), `spring_hem_F/B_01..02`.
- **Personality:** twitchy and quick. The fastest walker (1.08 m/s).

### 11.2 Rootbound: `rootbound.glb`

- **Height 3.8 m**, width 2.8 m (head 1.75 m, body 2.4 m, legs 1.0 m). A walking knot of roots.
- **Head:** a **crown of jagged root spikes** (7–9 tines of different lengths, sharply tapered, some forked) above a long face shield. The face is a **dark hollow** with two glowing amber eye pits and a jagged, zig-zag root mouth. A pale highlight line runs down one side of the face.
- **Body:** braided root cords that bulge and twist, with a dark hollow in the chest. **Rows of overlapping leaf scales** across the shoulders (about 17 scales in 4 rows, alternating #577955 / #839063); make them small separate pieces in the mesh. Two thick cords spiral up the sides.
- **Arms:** root limbs that split into 4–5 long, twisted root fingers.
- **Legs:** stubby trunks that splay into **root feet** (5–6 spreading root toes that grip the ground).
- **Spring bones:** `spring_crown_*` on the 3 longest crown tines (stiffness 0.8, they barely move), `spring_tendril_*` on 4–6 small hanging roots.
- **Personality:** heavy, slow (0.36 m/s), creaking.

### 11.3 The Antlered Hollow: `hollow.glb`

- **Height 5.3 m**, width 2.6 m (head 2.4 m including antlers, body 3.0 m, legs 1.5 m). The tallest and most unsettling.
- **Head:** a **long, pale, bone-like face**, narrow at the chin, like a deer skull worn as a mask. Small, close-set dark eye pits with faint pale-blue glow; a long nose ridge; a thin vertical chin line. **Two large branching antlers**, each a curving main beam with 3 tines that shorten toward the tip, dark ink-wood (#172f32). Antler spread about the head's full width.
- **Body:** a tall, dark, **tattered robe** cut into long jagged spikes at the shoulders and hem (the painting shows a star-burst of points). 7 vertical darker strips run down the robe.
- **Arms:** long, thin and dark, ending in long thin fingers.
- **Legs:** thin and dark, mostly hidden by the robe.
- **No blinking:** no `blink_*` keys.
- **Spring bones:** `spring_robe_*` on 6–8 robe strips (stiffness 0.35, long lag), `spring_sleeve_L/R_*`. Antlers are rigid on the head.
- **Personality:** stilted, slow (0.62 m/s), the longest stillness, extreme slow head tilts (neck allowed to about 35°).

### 11.4 Lantern Wraith: `wraith.glb`

- **Height 3.0 m**, width 2.05 m (head 1.15 m, body 2.5 m, tail 0.35 m). A hooded spirit carrying a lantern.
- **Head:** a rounded, slightly pointed **hood** (blue-grey), with a dark face hollow inside and two glowing cyan eyes. A soft dark oval mouth.
- **Body:** a flowing robe that flares outward and **ends in tattered points** (no feet). A lit fold on its left and a shadow fold on its right (#9cacab / #4e777c). The hem fades to transparent over the last 25–35 cm through `_MASK.g`.
- **Arms:** long sleeves, thin grey hands.
- **Lantern:** held in the **right hand**, hanging about 0.95 × body height below the shoulder. 0.58 m wide × 0.66 m tall, with a pointed cap and ring, a tapered cage with 3 vertical bars, and warm glowing glass (gradient #fff2bb → #bd9c55 at the edge). The lantern hangs from bone `lantern` (child of `hand_R`, a spring chain so it swings late). Add `socket_lantern` at the flame centre.
- **No leg chain.** Use `robe_tail_01..04` as springs. `root` sits on the ground; `hips` floats 0.15–0.3 m higher in `hover`.
- **Personality:** a slow glide (0.46 m/s), sideways drift. Attacks at range by thrusting the lantern; the wisp launches from `socket_lantern`.

---

## 12. Asset specs: gnomes: `gnome.glb`

The Rise spell summons two gnome rangers who tear out of the ground, run, shoot crossbows and sink back. They are **allies**: livelier than the enemies, but they keep a touch of the wood's strangeness (sudden freezes, quick listening head turns).

- **Size:** 2.58 m frame height in game today, feet to top of cap about **2.4 m**. They are scaled-up gnomes and must stay that size to read at range.
- **Source:** import `gnome-ember.svg` and `gnome-moss.svg` (512 × 768 px; feet touch at y = 705 px; 1.72 m × 2.58 m frame) as backplates. The parts are labelled in the SVG comments: boots and leggings, coat, arms with leather guards, face with spectacles (ember) or curious face (moss), cap, crossbow.
- **One skeleton, two bodies:** `gnome_ember_body` and `gnome_moss_body` share the rig, the animations and the crossbow mesh. Colourways follow section 5.3. Both meshes ship in one GLB; the engine shows one per gnome.
- **Proportions:** a big head with a full beard; a cap (ember: curled russet with a tiny bell; moss: leaf-shaped); a stout coat with a belt and square buckle; chunky boots; short, thick arms with leather guards.
- **Crossbow:** compact and handmade, held across the front, with a glowing amber rune (emissive through `_MASK.b`). Bone `crossbow` (child of `hand_R`), `socket_bolt_tip` at the muzzle (in the SVG at (441, 457) px, the gnomes face screen-right; in 3D, the muzzle points forward +Z).
- **Pivots from the art (px):** hips (210, 595) / (305, 595), waist (256, 650), shoulders (256, 420), neck (250, 430).
- **Spring bones:** cap tip (and the bell on the ember gnome), beard tip, coat tails.
- **Clips (30 fps):**

| Clip | Length | Notes |
| --- | --- | --- |
| `emerge` | **1.0 s** | The ground tears at 0.3 s; bursts out arms-first, falls back, lands. Root starts 2.7 m below. |
| `idle_a`, `idle_b` | 4–6 s | Mostly still; sudden freeze-and-listen, a quick snapping glance |
| `run` | loop for **6 m/s** | Brisk, bouncy; arms pump |
| `aim_shoot` | **0.95 s** | Raise and sight → **release at 0.28 s** → recoil → dip to reload |
| `sink` | **0.7 s** | Sinks back into the earth (root ends 2.7 m below) |

Sidecar events: `emerge.tear = 0.3`, `aim_shoot.release = 0.28`.

---

## 13. Asset specs: scenery

Scenery has **no outline**, no rig and no faces. It still follows the palette, smoothness, AO and painted rules.

### 13.1 Trees: `tree-01.glb` … `tree-04.glb`

Four variants of the same species, the Hushwood's tall, dark, slightly leaning trees.

- **Size:** authored at **25 m tall** (the engine scales each instance by 0.8–1.3). The canopy is about 0.5 × height wide.
- **Trunk:** an **asymmetric, tapering bole** with a gentle S-bend (alternate the lean per variant). **Broad buttress roots** flaring into 3 roots each side, and a continuous **mossy foot** (soft moss mounds, #365c45 / #6b8250). Vertical bark grooves are modelled as soft, wide undulations, never bark texture.
- **Branches:** about 13 main branches alternating sides up the trunk, each forking twice, tapering to thin tips. Model them along curves (tapered tubes, ≥ 8 segments at the base) for the first two levels.
- **Canopy:** about **26 scalloped foliage masses** stacked by height. Each mass is a soft ellipsoid (wider than tall) with a gently scalloped edge. Build them as **canopy cards**: clusters of alpha-tested quads with **normals transferred from a smooth ellipsoid proxy**, so each mass shades as one soft painted blob. Card texture: one shared 1024 atlas of painted leaf-clump shapes (scalloped edges, soft gradient #547d60 → #315b4d → #173b39, a few #587e55 / #a3ac76 edge leaves). Variant 3 uses the lighter top colour #6d865f.
- **LOD2 / far cards:** render each tree from the front under the preview light (section 14) into a **1024 × 2048 alpha card** (`tree-far-cards.glb` with one quad per variant). These replace the 48 far-ring trees and the LOD2 level. They must look like today's painted trees.
- **Collision** (the engine's job): note the trunk radius at 1 m height in `manifest.json`.

### 13.2 Mossy rocks: `rocks.glb`

- **5 variants**, 1.5–4.5 m wide, height about 0.65 × width. Low, rounded boulders (the painting: a broad dome with a lumpy shoulder).
- Sculpted soft lumps, no cracks or scan detail. **Moss on top** (colour mask from upward-facing normals, then hand-painted softness), stone on the sides, colours from 5.4. One object per variant in one GLB.

### 13.3 The Forgotten Gate: `gate.glb`

- **8 m × 8 m** freestanding ruined stone arch. Two thick legs (about 1.1 m wide at the base, slightly tapered) and a semicircular arch. The inner opening is about 3.4 m wide at the base.
- **Stone blocks:** 6 visible courses on each leg (joints #345b50), with soft-bevelled blocks (bevel 2–4 cm, then smoothed). A carved edge band follows the arch (highlight #789477).
- **Ivy:** about 60 leaf clusters draped along the top of the arch (#355d46), as modelled leaf cards with smooth-proxy normals, hanging slightly.
- Moss in the joints and at the base.

### 13.4 Lantern post: `lantern-post.glb`

Match `LanternGrove.ts` exactly (metres, before the instance scale):

- **Base:** a flared timber foot, radius 0.29 → 0.14, 0.27 tall.
- **Post:** a gently curving timber pole rising to 4.61 m, radius 0.15 → 0.055, with a slight lean.
- **Arm:** curves out from 4.12 m to (1.1, 4.08), radius 0.085 → 0.03.
- **Lantern** hangs at x = 0.92: a hook rod (0.37 long) at 3.87, a bronze pointed cap (radius 0.39, 0.29 tall) at 3.78, a glass box 0.48 × 0.68 × 0.41 at 3.30 with 4 bronze corner frames (0.025 square), and a flame bulb (radius 0.13) at 3.29.
- Materials: timber #564c3b, bronze #756344 (metallic 0.12, roughness 0.66), glass alpha 0.28, flame emissive. Add an empty `socket_flame` at (0.92, 3.29, 0) for the engine's light.
- Replace the primitive look with **hand-modelled forms**: wood grain as soft undulation, a curled iron finial, a riveted cap edge.

### 13.5 Ground dressing (lower priority)

- Path roots and stones: 6–8 small kit pieces (roots arching out of the soil, flat stones), ≤ 1.5k triangles each.
- Pond rim: a soft mossy lip and a few reeds around a 7.6 × 4.5 m ellipse.

---

## 14. Preview scene (look-dev in Blender)

Build `art/blender/lookdev/hushwood-preview.blend` once and **link** every asset into it for review. It approximates the game so you judge colour and form under the right light.

| Setting | Value |
| --- | --- |
| Render engine | Eevee (Next) |
| Colour management | View Transform **Standard** (not AgX or Filmic), Look None, Exposure 0, Gamma 1. The game is untonemapped. |
| World | Colour #10171a, strength 1 |
| Sky fill | Sun lamp straight down, colour #789591, strength 0.6 (stands in for the hemisphere); a weaker opposite fill from below, #192824, strength 0.2 |
| Moon | Sun lamp from the upper left, behind the subject relative to the camera (azimuth about 150°, elevation about 40°), #97aebc, strength 1.2, soft shadows (angle 3°) |
| Lantern | Point lamp #eaba6e, 300 W, radius 0.2, 3 m to the camera's right and 3.3 m up, 4 m in front of the subject |
| Fog | Compositor: Mist pass (start 2 m, depth 60 m), mixed over the image toward #222b29 with exponential falloff ≈ density 0.023 |
| Bloom | Compositor Glare (Fog Glow, threshold 0.8, size 7) on emissive only |
| Camera | 1.85 m high, 64° vertical FOV (35 mm sensor: about 27 mm focal length), aimed at the subject's chest |
| Distances to render | Creatures at 3 m, 8 m and 20 m. Trees and gate at 15 m and 40 m. |
| Background plate | A 2D-game screenshot behind, for side-by-side judgement (optional) |

Also add a **front orthographic silhouette camera** at eye height for the silhouette check (section 16).

---

## 15. Export

### 15.1 Script

Write `scripts/blender/export_asset.py`, run as `blender --background --factory-startup art/blender/<path>.blend --python scripts/blender/export_asset.py -- --asset goblin`. It must:

1. Run `validate_asset.py` first and stop on any failure.
2. Bake every NLA track to the deform skeleton (visual keying, every frame, 30 fps).
3. Apply all modifiers except Armature, apply transforms (scale 1, rotation 0), and set origins per section 2.
4. Export with the settings in 15.2, writing `public/assets/models/<group>/<asset>.glb`.
5. Write `<asset>.anim.json` (10.6) and update `manifest.json` (15.4).
6. Re-import the GLB into an empty scene and re-run the checks (round trip).

### 15.2 glTF exporter settings (Blender 4.2)

| Setting | Value |
| --- | --- |
| Format | glTF Binary (.glb) |
| Include | Selected objects (asset collection), Custom Properties **on**, Cameras and Lights off |
| Transform | **+Y Up on** |
| Mesh | Apply Modifiers on, UVs on, Normals on, Tangents **only if a normal map is used**, Vertex Colors **Active** (`Col`), **Attributes on** (for `_MASK`, `_OUTLINE`), Loose edges and points off |
| Material | Export; Images: Automatic (PNG) |
| Shape keys | on, Shape Key Normals on |
| Armature | Export Deformation Bones Only **on**, Flatten Bone Hierarchy off |
| Skinning | on, Include All Bone Influences **off** (4 max) |
| Animation | on; Mode **NLA Tracks**; Always Sample Animations on, 30 fps (Sampling Rate 1); Export Shape Key Animations on; Optimize Animation Size on; Force Keeping Channels off |
| Compression | off here (done in 15.3) |
| LODs | Export LOD0, LOD1 and LOD2 as sibling meshes named `<asset>_LOD0`, `_LOD1`, `_LOD2`, sharing one skeleton |

### 15.3 Compression (after validation)

```sh
gltfpack -i goblin.glb -o goblin.glb -cc -kn -km -ke -vpn
toktx --t2 --encode uastc --uastc_quality 2 --zcmp 18 goblin_color.ktx2 goblin_color.png
```

Keep **names, extras and morph targets** (`-kn -km -ke`). If `gltfpack` breaks the custom attributes, skip mesh compression for that asset and report it.

### 15.4 `manifest.json`

```json
{
  "version": 1,
  "assets": {
    "goblin": {
      "file": "creatures/goblin.glb",
      "anim": "creatures/goblin.anim.json",
      "heightMetres": 2.0,
      "triangles": { "lod0": 28410, "lod1": 11200, "lod2": 3890 },
      "bones": 61,
      "bytes": 2950000,
      "sockets": ["socket_eye_L", "socket_eye_R", "socket_jaw", "socket_chest", "socket_head_top", "socket_hand_R"],
      "hit": ["HIT_head", "HIT_torso", "HIT_arm_L", "HIT_arm_R", "HIT_leg_L", "HIT_leg_R"],
      "clips": ["idle_a", "idle_b", "idle_c", "walk", "walk_stop", "windup", "strike", "recover", "stagger_L", "stagger_R", "rise", "death"],
      "sourceBlend": "art/blender/creatures/goblin.blend",
      "exportedAt": "2026-11-17T00:00:00Z"
    }
  }
}
```

Scenery entries add `"trunkRadiusMetres"` (trees) or `"footprint"` (rocks, gate).

---

## 16. Validation and review

### 16.1 Automated: `scripts/blender/validate_asset.py`

It fails the export on any of these:

- [ ] Height within ±3% of spec; origin at ground between the feet; facing −Y (Blender).
- [ ] Triangle counts per LOD within budget; bones ≤ 80; influences ≤ 4; weights normalised; no unweighted vertices.
- [ ] No n-gons, loose geometry, zero-area faces, duplicate vertices or non-manifold edges (except intentional cloth edges, which must be listed).
- [ ] All required bones, sockets, hit shapes, shape keys, actions and NLA tracks are present with exact names.
- [ ] Clip durations within ±1 frame of section 10.2 or 12.
- [ ] `Col` exists and covers every face corner; no colour darker than #10171a outside the eye and mouth materials.
- [ ] Every colour in `Col` lies within 6 ΔE (CIEDE2000) of the palette gradients for its part. Report outliers.
- [ ] Materials: roughness 1, metallic 0 (bronze excepted), no extra textures beyond section 6.
- [ ] `_MASK` and `_OUTLINE` attributes exist.
- [ ] Smooth shading on; sharp edges only where listed.
- [ ] File size within budget.

Write the report to `art/reference/renders/<asset>/validation.json`.

### 16.2 Silhouette check (rough design lock)

1. Render the creature in `idle_a` frame 0 with the orthographic front camera as a white-on-black mask (eyes included, hit shapes hidden).
2. Render the creature's 2D reference sheet (4.3) as a mask at the same scale and alignment (feet on the same line, centred).
3. Compute overlap = shared area / combined area. **It must be ≥ 0.80.** Save both masks and a coloured overlay (green both, red only 3D, blue only 2D) to `art/reference/renders/<asset>/silhouette.png` and record the number.

### 16.3 Visual review renders

Under the preview scene (14):

- Turntable: front, ¾ left, side, ¾ back, back, at 3 m.
- Game-distance shots at 3, 8 and 20 m, with fog.
- A side-by-side with the 2D reference sheet.
- A **contact sheet** of key poses for every clip (5–8 frames per clip, timestamps labelled), plus wind-up and strike at 3 m from the camera.
- Expression sheet: neutral, blink, squint, brow down, snarl, jaw 75%, jaw 100%.
- If you can render video: a 10 s idle MP4 and each fight clip MP4. Motion is judged on video.

### 16.4 Review rubric (all must pass)

| Check | Pass when |
| --- | --- |
| Same artist | Side by side with the 2D art, it reads as the same design and palette |
| Not low-poly | No visible facets at 3 m, 1080p |
| Painted, not photographic | No texture noise; smooth soft gradients |
| Readable at range | Silhouette and eye glow read at 20 m in fog |
| Eerie motion | Idles are mostly still with sharp bursts; nothing loops visibly; head leads the body |
| Fight readability | The wind-up telegraph is clear from the front for its whole length |
| Technical | Validation report green, silhouette ≥ 0.80 |

---

## 17. Execution order

Work strictly in this order. **Stop at every ⛔ gate** and hand back for human sign-off before continuing.

### Step 0: Setup and references

1. Create the folder layout (4.2) and enable Git LFS for `*.blend`.
2. Write and run `extract_reference_svgs.mjs`; build the 4 creature reference sheets and import the 2 gnome SVGs.
3. Build the preview scene (14).
4. Write `validate_asset.py`, `export_asset.py` and `make_lods.py` skeletons.

**Done when:** reference sheets render correctly from the silhouette camera and the preview scene matches section 14.

### Step 1: Style lock (Goblin bust and swatches)

1. Sculpt the **Goblin head and shoulders only** to a finished level: ears, face mask, fangs, eyes in sockets.
2. Retopologise, subdivide, bake AO, paint `Col`, set up the material (6.1).
3. Render under the preview scene at 3 m and 8 m, next to the 2D head.
4. Render a palette swatch board from your `Col` values against section 5.

**⛔ Gate 1: style sign-off.** Do not continue until a human approves the bust as "same game, now in the round".

### Step 2: Goblin, complete

1. Full body: blockout → sculpt → retopo → subdivide → UV → bake → paint.
2. Rig: control rig plus deform skeleton (8.2), sockets (8.3), hit shapes (8.4), skinning (8.5), shape keys and jaw (9).
3. Animate every clip in 10.2 following the motion rules in 10.1.
4. LODs, sidecar, export, compression, manifest.
5. Validation, silhouette check, review renders (16).

**⛔ Gate 2: Goblin sign-off.** The Goblin becomes the template; write down anything you changed in this document's conventions and report it.

### Step 3: Rootbound

As Step 2. Pay extra attention to the root-crown silhouette, the leaf-scale pieces, the root fingers and toes, and the heavy drag-step.

### Step 4: Lantern Wraith

As Step 2, plus the lantern (spring), the hem alpha fade, the hover with no legs, and the launch event.

### Step 5: The Antlered Hollow

As Step 2. Antlers stay rigid and perfectly smooth; robe strips get springs. No blink keys. Longest stillness.

**⛔ Gate 3: all four creatures signed off together** (lined up side by side at 8 m in fog).

### Step 6: Gnomes

One rig, two bodies (12), crossbow, clips, sidecar, export, validation, silhouette check against both SVGs.

**⛔ Gate 4: gnome sign-off.**

### Step 7: Scenery

In this order: lantern post → rocks (5) → Forgotten Gate → trees (4 variants, canopy card atlas, LOD1) → far-tree cards → ground dressing (optional).

**⛔ Gate 5: scenery sign-off.** Three preview shots (path toward the gate, the clearing with lanterns, the far tree ring) side by side with game screenshots.

### Step 8: Final pack

1. Re-export everything with the final scripts and compression.
2. Complete `manifest.json`; total size of all GLBs ≤ 60 MB, creatures plus scenery needed for the first fight ≤ 25 MB.
3. Final validation report for every asset in one table.

**⛔ Gate 6: handoff to engine integration.**

---

## 18. What to hand back after each asset

Reply with:

1. **Files:** the GLB path(s), the `.anim.json`, the `.blend` path, the `manifest.json` diff.
2. **Numbers:** triangles per LOD, bones, file size before and after compression, silhouette overlap score.
3. **Validation report:** pass or fail per check; list every failure honestly, with the reason.
4. **Renders:** turntable, game-distance shots, side-by-side, clip contact sheet, expression sheet (and videos if available).
5. **Deviations:** anything that differs from this document, and why.
6. **Open questions** for the reviewer.

Never mark an asset done with a failing check. If something in this document is impossible or contradicts itself, stop and ask instead of guessing.
