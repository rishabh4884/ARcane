# Arcane — Visual Rewrite Plan (3D, superseded)

> **Superseded.** The direction is now a drawn, 2D animated series: see
> [2D_PRODUCTION.md](2D_PRODUCTION.md). This 3D plan and its Blender pipeline are paused; the pipeline
> remains useful as layout and turnaround reference for 2D artists.

How the look described in [ART_BIBLE.md](ART_BIBLE.md) gets built. Gameplay, gesture tracking,
combat, progression, story flow and UI are preserved; the visual system underneath them is
replaced.

---

## 1. Audit of what exists

| System | Today | Verdict |
|---|---|---|
| **Characters** | Built in the browser at load: SDF sculpt meshed with Surface Nets, verlet cloth, vertex colours, envelope skinning, baked in worker threads, cached in IndexedDB | **Replace.** The ceiling is too low: no UVs or texture maps, uniform triangle soup with no edge flow, weights that ignore anatomy, cloth without self-collision, every second of quality costs load time. Its *design work* (skeletons, proportions, the King's ideas) carries over. |
| **Character animation** (`Rig.ts`, per-design `animate`) | Procedural poses, springs, gaits | **Keep and upgrade.** Its interface (bone names, poses, attack timing) is what combat relies on. Add IK foot planting, helper bones, clips with easing, look-at with eyes, morph-driven faces. |
| **Character material** (`figureMaterial.ts`) | Custom shader, procedural noise per surface id, strong rim, own light uniforms | **Replace** with a textured stylised material that shares one lighting model with the world. |
| **Environment** (`ForestEnvironment`, `Illustration`, `storybook`, `paint`) | 2.5D: painted canvas cut-outs on billboards, a grass carpet, a few meshes | **Replace** with a fully 3D, composed world. Only five calls touch it from outside (`obstacles`, `intersect`, `update`, `dispose`, `setTint`), so it swaps cleanly. |
| **Regions** (`regions.ts`) | Region specs, set pieces, tints | **Keep the structure**, rebuild the set pieces with real assets per region kit. |
| **Atmosphere** (fog, mist, moon shafts, fog wisps) | Uniform fog, shafts everywhere | **Rework**: layered height and distance fog per region, mist only in hollows, shafts only under canopy gaps. |
| **Post** (`PostFX.ts`) | SMAA, bloom, grade, unsharp, chromatic aberration | **Rework**: AgX tone mapping, restrained high-threshold bloom, per-region grade, no chromatic aberration, light vignette. Must look right with post off. |
| **Spell effects** (`effects.ts`, `effects2.ts`, particles) | Mostly recoloured bursts | **Rebuild** per element with five stages. |
| **Cutscenes** (`Cutscene.ts`, `scripts.ts`) | Code-driven shots | **Keep the engine and story**, re-stage cameras, light and close-ups for the new assets. |

## 2. The decision: an offline asset pipeline in Blender

Blender 5.2 is installed on the development machine and runs headless with Python 3.13, numpy,
OpenVDB, Quadriflow, Cycles (Metal GPU), Rigify and glTF export. That makes the pipeline the brief
asks for possible without a human artist: **assets are authored by Python scripts in the repo, run
through Blender, and exported as glTF (GLB) files the game loads.**

Why this is a real step up from building in the browser:

- **No load-time ceiling.** Sculpts can be meshed at millimetre resolution, cloth simulated for
  hundreds of frames, maps baked with many samples — it costs build time, not the player's time.
- **Production-grade finishing**: clean retopology (edge loops at joints for deformation), UV layouts,
  baked tangent-space normal, ambient occlusion and curvature maps, painted albedo, roughness and
  material maps, Blender cloth with collision and self-collision, exact booleans for hard-surface
  gear, bone-heat skin weights, shape keys for faces, LOD meshes.
- **Reviewable**: the pipeline renders neutral-light turntables of every asset, so quality is
  judged before it reaches the game.
- **Reproducible**: `npm run art -- <asset>` rebuilds any asset from source; built GLBs are committed,
  so the game itself never needs Blender.

## 3. Pipeline (`art/`)

```
art/
  build.py               blender -b --factory-startup -P art/build.py -- <asset> [--review]
  arcane_art/
    sdf.py               the sculpting kernel (numpy): forms, operations, attributes
    mesh.py              field -> mesh (OpenVDB), cleanup
    topo.py              voxel remesh, Quadriflow retopology, decimation for LODs
    uv.py                unwrap and pack
    paint.py             painted colour: zones, gradients, curvature and occlusion driven wear
    bake.py              Cycles bakes high -> low: normal, AO, albedo, material/roughness, emission
    cloth.py             garment patterns, pinning, Blender cloth simulation, thickness, hems
    rig.py               skeleton spec -> armature, helper bones, skin weights, limits
    morphs.py            facial shape keys from sculpt variants
    review.py            neutral-light turntables and close-ups
    export.py            GLB export (skins, morphs, WebP textures, Draco)
  assets/                one script per asset: characters, trees, rocks, props, landmarks
  review/<asset>/        committed review renders
public/art/              committed GLBs and fx maps
```

### 3.1 Sculpting kernel (forms that are not primitives)

The blockout-to-sculpt stage, written as code. Beyond spheres and capsules:

- **Limb sweeps**: a spline with a cross-section that is a *superellipse* (oval → squared) whose two
  radii, squareness and twist vary along the length. Muscle bellies swell, tendons pinch, the shin is
  flat-fronted, the forearm is wedge-shaped near the wrist.
- **Planes and chamfers**: half-space cuts (sharp or slightly softened) to carve the planes of a face,
  a bevelled plate, a split in bark.
- **Wedges, prisms, bevelled boxes** for hard forms; **grooves** with a V profile for creases (eyelid
  folds, nasolabial folds, bark splits, seams); **domain warps** for organic irregularity.
- **Blend control per join**: tight blends where structure must stay defined, soft only where flesh
  flows.
- Each form carries **attributes** (material, colour zone, bone influence) blended across joins.

Meshed with OpenVDB at fine resolution (the *high* mesh), then retopologised to the *low* mesh the
game uses; detail comes back through the baked normal map.

### 3.2 Paint

Albedo is painted on the high mesh per vertex, then baked to texture. Recipes are authored per
character with intent: colour zones (by region of the body), warm flush at ears, nose, knuckles and
fingertips, cool shadow tint in cavities, pale wear on crests, dirt gathering low, markings and
patterns where the design calls for them. Material ids drive the roughness map and the runtime
lighting response.

### 3.3 Cloth

Garments are cut as patterns, pinned where they are sewn, simulated over a collision body, given real
thickness (solidify) with creased hems and seams, and torn where the design says. They are skinned
with weights transferred from the body and, where they hang free, to spring-driven cloth bones.

### 3.4 Rig

- The skeleton spec for each character keeps **the joint names the game's animation code already
  uses**, so every `animate()` keeps working.
- **Helper bones** the runtime drives: half-angle joints at elbows, knees, wrists, ankles and
  shoulders (they hold volume when limbs bend), forearm twist bones (no drinking-straw wrists),
  cloth chains.
- Weights by bone heat on a watertight proxy, transferred to the final mesh, limited to four
  influences, smoothed. Creature rigs follow creature anatomy (quadrupeds, serpents, wings, many
  legs).
- Faces get shape keys (blink, brow, snarl, mouth shapes) exported as morph targets.

## 4. Runtime

- **`ModelLibrary`**: loads and caches GLBs during warm-up (with Draco), exposes geometry, textures and
  morph targets.
- **`Character`**: a design either builds procedurally (the old way, during migration) or names a
  `model`. For a model, the runtime builds its own skeleton from the GLB's joint positions (with rest
  orientations matching the procedural convention) and remaps the skin weights by joint name, so the
  existing `animate()` drives it unchanged.
- **Stylised material**: one lighting model for characters and world, built on three.js's standard
  material with patched lighting: wrapped diffuse and a soft terminator, per-material response
  (skin, bark, cloth, bone, metal, moss/fur, membrane, chitin, eyes) from a material map, controlled
  highlights, subsurface warmth, cloth sheen, translucency, real shadows and the scene's lights.
- **Rig v2**: helper-bone drivers, two-bone IK with foot planting, stepping turns, look-at with eyes
  and saccades, morph drivers, per-creature timing so nothing moves in sync.
- **Environment v2** (`Woodland`): a terrain mesh with painted material blending (soil, leaf litter,
  moss, stone, roots); instanced assets from GLBs; each region a *kit* (assets, palette, light rig,
  fog) and a *composition* (hand-placed key assets and landmarks, rule-placed clusters with clear
  combat lanes and quiet areas); a foreground frame; background layers as impostors rendered from
  the real trees.
- **Light rig per region**: hemisphere ambient; the moon as a real shadow-casting directional light
  low behind the treeline; the caster's warm fill; up to four local lights (lanterns, canopy gaps);
  pooled spell lights.
- **Post v2**: AgX, restrained bloom, per-region grade, light vignette, no chromatic aberration.

## 5. Milestones

| | Milestone | Contents |
|---|---|---|
| **M0** | Plan and tools | This plan and the art bible; the pipeline end to end; lookdev mode |
| **M1** | **Representative scene: the Hushed Edge** | Bramble Goblin (ordinary enemy), Gorrik (large boss), Tuck (friendly); finished near trees and ground, midground treeline and landmark, background layers, foreground frame; the region's light rig; Ember Lash rebuilt in five stages |
| M2 | Common enemies | Rootbound, Lantern Wraith, Antlered Hollow, Mossling, Thornback, Gloom Moth |
| M3 | Bosses | Moth Matron, Fenwyrm, Grael, Hollow Stag, Lantern Widow, Pale Herald, Unlit King, Warden |
| M4 | Friends and story | Ember gnome, Bloomkin (five coats), the Kindler's hands |
| M5 | Regions | Mirefen, Lantern Deeps, Unlit Throne, Dawn — kits, compositions, light rigs |
| M6 | Effects | Every spell in five stages |
| M7 | Animation and cutscenes | Performance pass, every cutscene re-staged and checked in close-up |
| M8 | Performance and polish | Profiling with hand tracking on, LODs, budgets met |

The representative scene sets the standard; every later milestone is held to it.

## 6. Performance budget

Measured on the development machine (Apple M5, 8-core GPU, 16 GB, the desktop app's Chromium pane)
with hand tracking running, at the default adaptive pixel ratio. Targets for the gameplay view:

| | Budget |
|---|---|
| Frame rate | 60 fps sustained in a full wave; never below 45 |
| Draw calls | ≤ 250 |
| Triangles | ≤ 2 M visible |
| Character meshes | enemies ≤ 25 k triangles, bosses ≤ 60 k, LOD1 at half beyond 25 m |
| Textures per character | three maps at 1K (bosses 2K), WebP |
| Shadows | one 2048 map from the moon, characters and near props only |
| Local lights | ≤ 4 + 3 pooled spell lights |
| Particles | ≤ 4 k live |
| First load | assets streamed per region; return visits from cache |

## 7. What code cannot do, stated plainly

The pipeline delivers designed silhouettes and anatomy, clean topology, UVs, baked maps, painted
colour, simulated garments, proper rigs and skin weights, facial shape keys, keyed and procedural
animation, and a fully modelled, composed world. It is still code authoring forms, judged through
renders. Where a human specialist would raise the result further:

- **Hero faces in extreme close-up** (Tuck, the Warden, the King, the Kindler's hands): a sculptor's
  hand-sculpted nuance in ZBrush or Blender sculpt mode would exceed scripted sculpting.
- **Hand-painted texture brushwork**: the albedo is designed procedural paint, not an artist's brush.
- **Acting**: subtle keyed facial performance and lip sync for cutscene close-ups, and motion-capture
  quality locomotion, are beyond scripted animation; key poses and procedural layers get close at
  gameplay distance but not in long close-ups.
- **Foliage atlases** are generated, not painted.

None of these blocks the rewrite; they are the places to bring in an artist if the game ever wants to
go further than this pipeline can.

## 8. Running it

```bash
npm run art -- goblin            # build one asset into public/art/
npm run art -- goblin --review   # also render neutral-light review images into art/review/goblin/
npm run art -- all
```

Requires Blender at `/Applications/Blender.app` (or `BLENDER=/path/to/blender`).
