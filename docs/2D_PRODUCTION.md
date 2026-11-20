# Arcane — 2D Animated Series Production Plan

> **Superseded in part (2026-11-21).** This plan assumed a team of artists. The look is now being
> made entirely in this repository: ink-and-paint characters from the sculpted models, brush-painted
> sets projected in the game, drawn effects. See [PAINTED_SETS.md](PAINTED_SETS.md). The standard
> below still holds.

**The standard:** Arcane should play like an episode of a beautifully produced 2D animated series
that answers the player's hands. Characters are drawn and act through poses, faces, hands and fluid
movement (frame-by-frame, replacement drawings where pose or perspective changes, 2D rigs only where
they keep the drawing's quality). Environments are painted animation sets that live: foliage, water,
mist, shadow and light move. Gameplay and cutscenes are composed like shots from the same show.
Mature, atmospheric woodland fantasy: grounded faces, distinctive creatures, detailed clothing, organic
anatomy, cinematic light. No mascots, anime eyes or chibi; no visible 3D, gloss, primitive-built bodies
or stiff paper-puppet motion.

This supersedes the 3D direction in [VISUAL_REWRITE.md](VISUAL_REWRITE.md). The world, story, light
economy, palettes, shape language and character sheets in [ART_BIBLE.md](ART_BIBLE.md) remain the
design brief: they describe *what* to draw.

---

## 1. What can be made here, and what cannot

**Cannot be made with the tools in this environment: the drawings.** There is no drawing or
image-generation tool here, and no artist. Everything I could produce myself would be authored in code
— vector paths placed by coordinates, procedurally painted textures, or 3D models rendered to look 2D —
and those are exactly the "simple shapes", primitive-built characters and visible-3D substitutes the
standard rules out. I will not present any of them as finished art.

**Can be made here, and is real work toward the standard: everything around the drawings.**

- A 2D animation runtime for gameplay: frame-by-frame playback with per-frame timing (animating on
  ones and twos), replacement drawings chosen by view angle, events on key frames (the frame a claw
  connects is the frame damage lands), depth staging and scale in the clearing, contact shadows, and
  hit, frost and death treatments applied to drawn frames.
- A painted-set compositor: layered backgrounds with real parallax, and living layers — foliage swaying
  through painted masks, water with drawn ripples and distortion, mist drifting, light shafts, lantern
  flicker, the region's grade.
- Cutscene playback for drawn shots: sequences, camera moves across painted layers, caption-safe framing.
- An asset pipeline: drop PNG sequences and layered backgrounds into folders; it validates names and
  frame counts, packs atlases, writes manifests, and reports exactly which drawings are still missing.
- Review tools ("dailies"): any character's states at gameplay scale and in close-up, onion skin, timing.
- 3D layout reference for artists from the existing Blender pipeline: turnarounds and camera layouts
  at the exact gameplay angle and scale. Standard practice in 2D production; never visible in the game.
- The combat, gestures, progression and story systems need no change; they drive whatever is drawn.

## 2. What has to be drawn and painted

Counts are drawings per view unless noted. "Views" are the angles a creature is seen from as it
approaches the casting spot: **front**, **three-quarter** (left and right; mirrored only where a
design's asymmetry allows), **side** (entering from the clearing's edges). Gameplay animation is drawn
mostly on twos (12 fps), strikes, hits and effects on ones (24 fps).

### 2.1 Gameplay states (every creature)

| State | Drawings per view | Notes |
|---|---|---|
| Idle (loop) | 16–24 | Personality: the goblin watches and shifts, the Hollow barely moves |
| Walk / approach (cycle) | 12–16 | Planted contacts; approaching the camera needs its own front cycle |
| Wind-up | 8–12 | The gameplay telegraph: must read in about 0.6–1.2 s |
| Strike | 6–10 | On ones; the impact frame is tagged for damage timing |
| Recover | 8–12 | |
| Stagger / hit | 6–8 | On ones |
| Death | 16–24 | Hands off to the dissolve effect |
| Emerge | 12–16 | Rising out of the ground or mist |
| Frozen | 1 held drawing | Frost is an overlay effect |

About **90–130 drawings per view**, three views: **~300–400 per common enemy**. Bosses add their own
attacks (wind-up, strike, recover for each, ~30–40 drawings apiece), phase changes and a death:
**~700–1,000 per boss**.

### 2.2 The cast

| Who | Role | Approx. drawings |
|---|---|---|
| Bramble Goblin, Rootbound, Antlered Hollow, Lantern Wraith, Mossling, Thornback, Gloom Moth | Common enemies | 7 × ~350 ≈ **2,500** |
| Gorrik, Moth Matron, Fenwyrm, Grael, Hollow Stag, Lantern Widow, Pale Herald, Unlit King | Bosses | 8 × ~850 ≈ **6,800** |
| Tuck and the Ember gnome | Summoned allies (emerge, run, idle, cheer) and story | ≈ **500** |
| Bloomkin | One species, five colour variants (one set of drawings, recoloured) | ≈ **150** |
| The Warden | Story only | in cutscenes |
| The Kindler's hands | Gesture key poses for the tutorial and cutscenes | ≈ **200** |

Each design first needs a **model sheet**: turnaround, expression sheet (story characters), hand
sheet, colour keys for each region's light.

### 2.3 Cutscenes

Fourteen scenes, about **6.6 minutes** in all (intro 29 s, Tuck 31 s, Matron 27 s, Matron's fall 21 s,
flowers 27 s, Grael 27 s, Grael's fall 23 s, the name 21 s, the Warden 31 s, the Widow 27 s, the Widow's
fall 21 s, the Kindler 31 s, the King 31 s, the ending 48 s), 32 spoken lines. Storyboard → layout → key
animation → in-betweens → clean-up → colour → compositing. In limited TV animation with holds and camera
moves that is roughly **3,000–5,000 drawings** and **40–60 background paintings** (many reused across shots).

### 2.4 Painted sets

- **Gameplay sets**, each a layered painting (sky, far wood, treeline with its landmark, the play
  ground, foreground frame; about 4K wide): the Hushed Edge, the Mirefen, the Lantern Deeps, the Unlit
  Throne, Dawn, and the named set pieces (the Empty Market, the war camp, the Matron's bower, the Drowned
  Chapel, the Bone Orchard, the Webs, the Bellfields, the throne itself) — about **13**, plus overpaint
  layers for each chapter's darkening (early, mid, late).
- **Living layers** painted separately so they can move: foliage masses, hanging moss, water surfaces
  and ripple sheets, mist banks, light shafts, lanterns lit and dark.

### 2.5 Effects

Twelve spells and eight legendary spells, each drawn in five beats (anticipation, release, travel,
impact, recovery): about **40–60 drawings each, ~1,000** in all, plus creature attack effects (embers,
the Wraith's fire, boss effects) **~400**. Shared particles (embers, motes, petals, sparks) are drawn
once and animated by the engine.

### 2.6 Total

On the order of **15,000–18,000 finished drawings and ~60 paintings.** These are estimates for
planning; the real figure depends on the line style, rendering complexity and how much is held.

## 3. Specs for the artists

- **Line and paint:** drawn line with painted, light-aware colour (not flat cel unless chosen as the
  style). Each character frame may come with an optional **light mask** (rim and form light from the
  moon behind) so the engine can light drawn frames from the scene.
- **Resolution:** gameplay frames drawn at roughly twice their largest on-screen size (common enemies
  about 1,000 px tall, bosses 2,000 px); cutscene close-ups at final 4K.
- **Format:** PNG sequences with alpha, sRGB. Backgrounds as layered PSD (or PNG layers plus a layer
  list).
- **Naming:** `art2d/characters/<who>/<view>/<state>/<who>_<view>_<state>_####.png`, e.g.
  `goblin/front/strike/goblin_front_strike_0004.png`. Timing (holds) and the impact frame go in a small
  sheet per state, or as `_x2` / `_hit` suffixes.
- **Pivot:** each character's feet on a common baseline marked in the turnaround.
- **Palette:** the region palettes and the light economy in the art bible (captive light amber, free
  light pale gold, moonlight silver-blue, decay teal).

## 4. How to get the drawings

1. **A 2D studio or freelance team** — the way to reach the standard. Roles: character designer, two
   background painters, key animators and in-betweeners (five or six), an effects animator, clean-up and
   colour, one art lead. Typical tools: Toon Boom Harmony or TVPaint for frame-by-frame, Spine or Moho
   only where a rig keeps the drawing intact, Photoshop, Procreate or Krita for paintings.
2. **Generative image and video tools, operated by an artist** — can speed up concept art and painted
   backgrounds a lot. Character animation is the hard part: frame-to-frame consistency, clean
   silhouettes, alpha and controllable timing still need an artist to direct, paint over and clean up.
   Worth considering for sets and concepts; not a substitute for animators on the characters.
3. **A mix** — painted sets and concepts assisted by tools; characters, faces, hands and effects drawn
   by animators.

Very roughly, a small team of the size above might deliver a **vertical slice in 4–6 weeks** and the
**full scope in 6–9 months**. Treat both as order-of-magnitude until a team scopes the style.

## 5. The vertical slice first

The same representative scene as before, drawn:

- **The Bramble Goblin** (an ordinary enemy), all gameplay states, three views.
- **Gorrik** (a boss), states and his four attacks.
- **Tuck** (a friend): summon states and the Tuck cutscene's acting.
- **The Hushed Edge** gameplay set with its living layers.
- **Ember Lash**, drawn in five beats.

That locks the style, the line, the light treatment and the pipeline before the rest is commissioned.

## 6. Engineering plan (in parallel, no art needed to start)

| | Work | Done when |
|---|---|---|
| E1 | 2D animation runtime behind the existing character interface | A placeholder-framed creature plays every state, changes view with angle, lands damage on its tagged frame |
| E2 | Painted-set compositor with living layers and region grades | A layered test set has swaying foliage, drifting mist, shafts, water, lantern flicker |
| E3 | Asset pipeline and coverage report | Dropping a folder of PNGs makes it playable; missing drawings are listed by name |
| E4 | Drawn-shot cutscene playback | A storyboard animatic of a scene plays with camera moves and captions |
| E5 | Dailies viewer and 3D layout reference | Artists can check timing at gameplay scale; turnarounds and shot layouts exported for them |

Until drawings arrive the game keeps its current visuals. Placeholders are clearly placeholders (frames
labelled with what is missing), never presented as finished.

## 7. What carries over

- The **art bible**: story, light economy, emotional range, composition (layers, value structure,
  negative space), region palettes, shape language, every character sheet, effects language,
  animation principles. It becomes the design brief for the artists.
- The **3D art pipeline** becomes reference tooling (turnarounds, layouts) and is otherwise paused.
- **All game systems**: gestures, combat, waves, bosses, progression, story flow, UI.
