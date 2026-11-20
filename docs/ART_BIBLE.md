# Arcane — Art Bible

The standard every character, place, light and effect in Arcane is held to. It extends the owner's
visual brief (an illustrated, atmospheric dark-fantasy woodland with the environmental clarity of a
richly art-directed 3D world and the silhouette discipline of LIMBO, no anime) into concrete rules.
When a decision is not covered here, choose what serves the **north star** and the **light economy**.

**Medium:** a drawn, 2D animated series — drawn characters, painted sets, frame-by-frame animation
(see [2D_PRODUCTION.md](2D_PRODUCTION.md)). Everything here about story, light, emotion, composition,
colour, shape language, the cast, effects and animation applies as the brief for that drawing. Where a
section speaks of meshes, maps or 3D shading (the material table, the acceptance list's turntables), read
it as guidance for how the drawn and painted art should respond to light and hold up in close-up.

---

## 1. North star

> **An illustrated woodland myth you play inside.** It should feel like stepping into a finished
> animated feature: sculptural, tactile, deliberately composed, beautiful and quietly wrong.

Three tests apply to every asset and every shot:

1. **Silhouette first.** Filled solid black at gameplay distance, is it still unmistakably itself?
2. **Neutral light.** With bloom, fog and grade switched off, under plain studio light, does the form
   still hold up from the front, side, back, three-quarter view and in close-up?
3. **Belonging.** Does it sit in the scene, sharing the scene's light, contact shadow, scale and
   palette, or does it look pasted on?

## 2. The light economy (the visual idea the whole game hangs on)

The story is about stolen light; the picture should be too. Every bright thing on screen has a
reason, and its *kind* of brightness tells the player what it is.

| Light | Meaning | Look | Where |
|---|---|---|---|
| **Moonlight** | The neutral world. It organises every shot. | Cold silver-blue, directional, comes *through* openings | Canopy gaps, behind the treeline (backlight) |
| **Captive light** | Light the wood has had stolen | Warm amber, dimmed, flickering, always *inside* something (cage, lantern, ribcage, cocoon, heart) | Lantern Wraith, Lantern Widow, the King's heart, dead lanterns, Gorrik's crown |
| **Free light** | The player's magic and life coming back | Pale gold-white plus the spell's own hue, crisp, moves with purpose | The Kindler's hands, spells, fireflies, lantern-flowers once freed, dawn |
| **Decay light** | What grows in the dark | Cold teal bioluminescence, very restrained, never warm | The Deeps' fungi and glowworms, Fen wisps |

Rules:

- **Brightest value and highest saturation are reserved** for: the player's magic, the focal
  creature's eyes or captive light, and the region's landmark light. Nothing else competes.
- Captive light never lights the world generously; it glows *within* its container and spills only a
  little. Free light illuminates honestly and briefly.
- **Freeing a region changes where light lives**, not just how bright the frame is: captive lanterns
  open, fireflies drift free, flowers carry light, the sky warms. That is the emotional payoff.

## 3. Emotional range, kept distinct

| Emotion | When | Visual levers |
|---|---|---|
| **Wonder** | Discovering light, flowers, magic, a distant landmark | A warm accent in a cool field; negative space round it; slow reveal; particles that drift, never swarm |
| **Unease** | A silhouette moving in the mist | Low contrast between figure and fog; partial reveal; stillness then motion; eyeshine only |
| **Weight and danger** | A large creature enters | Low camera; the creature cuts the skyline; ground reacts (dust, leaves, shake); slow transfer of mass |
| **Warmth** | A small friendly inhabitant | Warm fill; soft rounded masses over clear structure; fidgeting, purposeful hands |
| **Relief** | The forest recovering | Warmer air, softer contrast, healthier colour, visible life; same places, transformed |

## 4. Composition and depth (LIMBO discipline in a 3D world)

The gameplay camera is fixed at the casting spot (eye height 1.85 m, looking into the clearing), so
**every region's gameplay view is composed like a painting**. Four layers:

| Layer | Distance | Value | Role |
|---|---|---|---|
| **Foreground frame** | 0–6 m | Darkest (near-black, still hued) | Frames the view: a leaning trunk, a root flare, a hanging branch, ferns at the corners. Never covers the combat lanes or the gesture-targeting area. |
| **Play plane** | 6–35 m | Mid values, highest local contrast and detail | The clearing floor and where creatures fight. Detail is concentrated here. |
| **Midground** | 35–70 m | Lifting toward the air colour | The treeline: big sculpted trunks, root systems, gaps where creatures emerge (dark negative space reads as mystery), and the region's **landmark**. |
| **Background** | 70 m+ | Lightest, lowest contrast, hue-shifted to the region's air | Layered tree masses softening into atmosphere, a distant landmark silhouette, sky. |

Rules:

- **Every view has a visual destination** (the landmark) and **quiet areas** where the eye rests.
- **Figures separate from the world** through value (dark creature against lit fog), hue, backlight
  or negative space — never through outlines.
- **Darkness with internal relationships**: shadows are deep teal-green, not black; a 10–20% value
  range must remain readable inside every dark area.
- **Fog has a job**: it creates distance, gathers in hollows and low ground, separates layers. It is
  never a uniform veil, and it never hides unfinished geometry.
- **Light shafts only where the canopy opens** and only one or two per view.

## 5. Colour system

Woodland colours with reserved accents. Each region has a **dominant** palette (most of the image), a
**supporting** palette (the living and made things), and a single **accent**. Hexes are targets
under the region's own light, not raw albedos.

| Region | Dominant (shadow and air) | Supporting | Accent | Air near → far |
|---|---|---|---|---|
| **The Hushed Edge** | `#0f1d1c` `#1b2b2a` `#243936` `#2d4a47` | moss `#5d6b3a`, lichen `#8c9a6a`, earth `#5a4a38`, birch `#b8b2a2` | lantern amber `#e8a548` | `#3a5552` → `#6f8c86` |
| **The Mirefen** | `#12201f` `#1d2e2d`, black water `#0a1514` | sick olive `#6b6b3e`, dead-wood bone `#c9c3b0`, reed ochre `#8a7a4a` | wisp cyan `#9ff0d4` (cold) | `#4a5e55` → `#7a8a7e` (heavy, low) |
| **The Lantern Deeps** | `#070d0f` `#0e1a1c` | wet bark `#3a2e24`, deep moss `#2e3f2a`, root `#4a3828` | biolum teal `#5fe0d0` + captive amber | `#12201f` → `#24383a` |
| **The Unlit Throne** | `#1a1820` `#26232e` | ash birch `#a9a4a0`, bone `#d6cdb8`, iron `#3a3a40`, black root `#0d0b0c` | stolen gold `#ffcf6a` (the King's heart, almost nowhere else) | `#3a3842` → `#6a6672` |
| **Dawn (the freed wood)** | `#2c4a3c` `#3d5a48` | fresh moss `#7f9a4a`, blossom `#e8a5b0`, warm earth `#7a5a3a`, birch `#e0d8c8` | sunlight `#ffd98a`, lit lantern-flowers `#ffe7a3` | `#c9c0a0` → `#e8dcc0` |

Characters and objects use **bone, faded cloth, bark, aged metal** and skin tones; magic hues are
reserved for spells and supernatural events (each spell keeps its identity colour from
`config/spells.ts`).

## 6. Shape language

Stylisation comes from **exaggerated anatomy, elegant curves, controlled proportion and expressive
silhouette** — never from simplified geometry. Primitive shapes are a blockout stage only.

**Forbidden in a finished asset:** capsule limbs, pill legs, tube fingers, spherical joints, cone
robes, uniform round cross-sections, hemispherical ends, visible stacks of intersecting primitives,
surface noise standing in for form.

**Required:**

- Limbs **taper unevenly**, swell at muscle bellies, pinch at joints and tendons; cross-sections are
  irregular (oval, squared, wedge) and change along the length.
- **Bony landmarks stay crisp**: brow ridges, cheekbones, jaw angles, knuckles, shins, hip points,
  spines and ribs. Claws, teeth, horns, antlers and hooves are sharp or faceted.
- **Blend tightly**: small blend radii where forms stay defined; soft blends only where flesh flows.
- **Hard-edged forms** where the material is hard: bark splits and plates, stone chips and facets,
  bone chips, metal is bevelled.
- **Controlled asymmetry with history**: a broken tine, a torn ear, a chipped tusk, a dropped
  shoulder, an uneven hem — chosen to improve the silhouette, never random.
- **Three levels of form**, effort spent in this order: primary (silhouette, proportion, posture,
  weight) → secondary (anatomy masses, clothing masses, wings, roots, antlers, gear) → tertiary
  (folds, seams, bark breaks, fungus, wear).

### Families

| Family | Members | Shape idea |
|---|---|---|
| **Bramble folk** | Bramble Goblin, Gorrik | Angular, triangular negative spaces, hunched S-curves, thorns *growing out of* the body |
| **Root folk** | Rootbound, Grael | Twisting load-bearing strands under tension, knots at joints, gaps you can see through |
| **The Hollow** | Antlered Hollow, Pale Herald, Hollow Stag, Warden / Unlit King | Tall verticals, skulls and branching antlers, long hanging cloth, stillness; bone white against the dark |
| **Lantern folk** | Lantern Wraith, Lantern Widow | Concealing outer shapes with captive light inside, seen through openings and translucent edges |
| **Fen and wing** | Gloom Moth, Moth Matron, Fenwyrm | Large composed wing shapes with tension and markings; serpentine S-curves |
| **Small friends** | Gnomes (Ember, Moss/Tuck), Bloomkin | Soft masses over clear structure; craftsmanship; warmth through behaviour, not mascot proportions |
| **The Kindler** | The player's hands | Real hands, light under the skin |

## 7. The cast

Every design keeps its role, skeleton names and combat behaviour. Each sheet gives the silhouette
idea, proportions, forms, materials, the history written into its asymmetry, and how it moves.

### Bramble Goblin — ordinary enemy (Edge onward)
- **Silhouette:** a compact question mark. Head thrust ahead of a short, compressed ribcage and pot
  belly; arms long enough that the knuckles pass the knees; huge swept-back ears; long gripping feet.
- **Proportion:** about 1.3 m hunched; head about a quarter of its height; hands about two thirds of
  the forearm's length.
- **Secondary:** a wiry body with every rib, knuckle and tendon showing; bramble growing out of it
  (thorn spurs at elbows, knuckles and down the spine, the bark-skin hardening around them); a
  scavenger's outfit — sacking hood pushed back, a kilt of sacking and leaves, rope belt hung with
  *stolen trinkets* (a dead lantern shard, a spoon, teeth), hand wraps.
- **Face:** overbite of crooked teeth, chipped tusk, long hooked warty nose, deep-set amber eyes with
  eyeshine (glow only toward light), heavy brow with one side cocked higher.
- **History:** torn left ear with brass rings; thorns heavier on the right arm; one shoulder higher.
- **Materials:** soft mottled olive-ochre skin warming at ears, nose and fingertips; hard dark thorn;
  coarse sacking; rope; tarnished brass.
- **Movement:** darting bursts and wary pauses; stops, looks, cocks its head; ears flick
  independently; fingers fidget. Attack: crouch with ears pinned back (anticipation), leap and rake,
  stumble on landing.

### Gorrik the Bramblechief — Edge sub-boss
- **Silhouette:** a trapezoid of mass — a back overgrown into a hump of bramble like a thorned
  mantle, a small head sunk low between enormous shoulders, forearms like logs, short bowed legs.
  Distinct from the goblins even in black.
- **Face:** scarred, one milky blind eye, a broken tusk, heavy jowls, ochre war paint; a crown of
  thorns with one stolen light.
- **Gear:** a club of thorned root with a caged stolen lantern bound at its head; bark pauldrons bound
  with rope; a hide mantle in designed masses; a belt of small skulls.
- **Movement:** slow, every step a transfer of weight; long wind-ups, the club's weight dragging him
  through the follow-through; the ground answers each blow.

### Rootbound — common enemy
- A humanoid grown from roots under tension: twisting load-bearing bundles, knots at the joints,
  **gaps through the torso** where you see the wood behind; feet that splay into root flares; one
  arm thicker where it carries more. A faint captive light deep in its chest knot.
- Moves with creaking deliberation; strands tighten before a blow and loosen after.

### Antlered Hollow — common enemy (later chapters)
- Tall and narrow (nine heads), a convincing deer skull, branching asymmetric antlers (one broken),
  a robe with real volume hanging from bony shoulders and folding around a skeletal frame, long
  bone fingers. Glides slowly, stops, tilts its skull.

### Lantern Wraith — common enemy
- A hooded cloak silhouette with a tattered hem that never quite touches the ground; **a separate
  internal light** (a lantern held in a ribcage) seen through rents and the hood opening; translucent
  cloth only at its thinnest edges. Thin dark hands. Its cloak trails with lag; it flares its light
  before throwing an ember.

### Mossling and Thornback — animals
- **Mossling:** a small, low badger-boar of moss and bark; convincing quadruped mass and gait first,
  moss in clumps where it would grow (back and shoulders), small fungi. Trots, sniffs, darts.
- **Thornback:** a heavier armadillo-boar with overlapping bark plates and thorn spines along the
  back, a ramming head; paws the ground before a charge, heavy trot.

### Gloom Moth and the Moth Matron
- **Gloom Moth:** large composed wings with membrane, veins and an eye-spot marking; furred thorax;
  feathered antennae; controlled translucency against light.
- **Moth Matron (Edge final boss):** regal and unsettling — an abdomen falling like a gown's train,
  four great wings whose markings read as watching faces, a crest of antennae like a crown, many thin
  arms cradling glowing cocoons of hoarded light. Readable while moving.

### Fenwyrm — Fen sub-boss
- A drowned serpent: a long sinuous S, a pike-like skull, mossy scales, a ragged fin crest, rising
  out of black water.

### Grael the Rootwarden — Fen final boss
- A walking guardian of roots and bark armour; mass carried in a huge torso, joints placed for
  balance, slow heavy transfers of weight; a small head with captive lights in its hollows; arms like
  trunks. Its scale shows in how it disturbs the ground and the trees around it.

### Hollow Stag — Deeps sub-boss
- A spectral stag: real deer anatomy (long skull, curved neck, ribcage, scapulae, cannon bones,
  backward hocks, split hooves) with hide in tatters and believably branching antlers, one broken.

### Lantern Widow — Deeps final boss
- Legs arranged radially from a compact body and an abdomen hung with lantern egg-sacs; a veiled,
  narrow upper body. The leg arrangement is recognisable at a glance; legs move articulated and
  coordinated (IK).

### Pale Herald — Throne sub-boss
- The King's bell-ringer: tall, narrow, ash-pale robes, a bone mask, bells hung from a crook.

### The Warden and the Unlit King — shared ancestry
- **Same skeleton and proportions**, a different relationship to light:
  - **Warden (before):** upright and open; a living green and gold cloak with leaves; a warm,
    living bark face; a crown of leaves; he **carries a lantern openly**.
  - **Unlit King (after):** stooped forward and closed; night-black robes with drifting motes; a
    carved deer-skull mask of dead bark, cracks leaking stolen light; a crown of caged lanterns gone
    dark; **the light is locked in his chest** behind a cage of roots.

### Gnomes — Ember and Moss (Tuck)
- Practical woodland craftspeople about three and a half heads tall; big capable hands, a broad
  nose, bushy brows, beards tucked into belts (never spiky); purposeful clothes with seams and
  patches: Tuck the stump-keeper wears a patched coat, an apron with a trowel and twine, a felt cap;
  the Ember gnome is a lamplighter with a soot-marked leather apron and a tinderbox. Charm comes from
  fidgeting with purpose and using their tools.

### Bloomkin — the freed wood's returning life
- Small, soft, hopeful plant-animals with coherent anatomy: petals growing as ears, a bud cap, leaf
  limbs; five colour variants of **one species** (same forms, different coats and caps).

### The Kindler's hands
- Real proportions: finger lengths, knuckles, a shaped palm with thenar and hypothenar pads, tendons,
  a convincing wrist and forearm. Magic shows as **light moving under the skin** along the veins.

## 8. Materials and shading

One stylised lighting model for characters and world, so the image belongs together. Broad,
readable light shapes with enough gradient to explain volume; highlights only where the material
earns them.

| Material | Diffuse | Highlight | Special |
|---|---|---|---|
| **Skin** | Soft wrap, warm terminator | Low and broad | Subsurface warmth at the terminator and thin parts (ears) |
| **Bark** | Hard terminator, directional grain | None | Cavities dark, ridges weathered pale, irregular breaks |
| **Cloth** | Medium wrap | None | Velvet sheen at grazing angles, deep fold occlusion, visible thickness at hems |
| **Bone** | Dry, slightly warm | Low and broad | Stains in hollows, polish on crests, chips |
| **Metal** | Dark | Sharp, mostly on edges | Tarnish in recesses |
| **Moss and fur** | Very soft wrap | None | Clustered volume, fuzzy sheen catching the backlight |
| **Wing membrane** | Thin | Small | Translucent against the moon, veins dark |
| **Chitin** | Hard | Medium | Plate edges |
| **Eyes** | — | Wet, sharp | Iris depth, eyeshine only toward light |
| **Water, wet stone** | — | Sharp | Reflections |

- **No** plastic gloss, rubbery cloth, shiny bark, indiscriminate rim light, or bright outlines.
- Surface detail follows **anatomy, growth, gravity and construction**; there is no single noise
  applied to every surface.
- Everything must read with **bloom and post-processing off**.

## 9. Lighting hierarchy

Each view, in order of authority:

1. **Environment light** that explains the world: sky and ground bounce, ambient occlusion.
2. **One dominant motivated source** that organises the shot: in gameplay, the moon low behind the
   treeline, so creatures read as silhouettes against lit fog.
3. **Secondary light that reveals form**: the Kindler's own hands, a soft warm fill from the camera's
   side, so the creatures' faces and bodies explain themselves; lanterns and canopy openings.
4. **Brief spell and impact light.**

Bloom only softens genuinely bright things. Volumetric light is local. No universal god rays, heavy
blur, chromatic aberration or strong vignette substituting for composition.

## 10. Effects language

Every spell has five readable stages: **anticipation → release → travel → impact → recovery**, and
each element behaves differently (not a recoloured burst).

| Spell | Element behaviour |
|---|---|
| Arcane Bow | A drawn arrow of light; a straight, fast travel; a sharp impact spark and the arrow sticking |
| Stormstrike | Instant branching arcs from the sky; a white afterimage; a scorched ground mark |
| Frostbind | Crystals that *grow* along the target; cold mist that sinks; a creak as it freezes |
| Mend | Soft rising motes and petals; warmth that settles rather than bursts |
| Rise | Soil heaves, roots part, gnomes clamber out with clods of dirt |
| Aegis | A ward of interlocking glyph-leaves that blooms open and shivers on hits |
| Ember Lash | Embers gather and swirl in the palm; a whip of flame lashes in an arc and cracks; flame tongues lick *upward* on impact; embers rise and smoke curls after |
| Thornsnare | Roots erupt from the ground and coil; dirt spray; thorns tighten |
| Moonblade | A thin crescent of cold light sweeping flat; a clean cut line left hanging in the air |
| Wisp Swarm | Soft flowing wisps that circle, then dive with ribbon trails |
| Sunflare | A slow-building sun in the hand, then a wave of warm light that pushes the dark back |
| Legendary spells | Each is a set piece with its own large-scale shape (a quake rippling the ground, a veil of moonlight, a tide, a bloom of flowers, a stag of light, falling stars, stillness, dawn) |

Particle counts stay bounded; light from effects is brief.

## 11. Animation

- **Weight**: a believable centre of gravity, planted feet, joint limits, weight transfer. Heavy
  creatures accelerate and recover slowly; light ones dart.
- **Performance**: strong key poses, anticipation, acceleration and deceleration, follow-through,
  overlapping action, holds. A character decides, acts and recovers.
- **Walking**: feet plant on the uneven ground (IK); hips and shoulders counter-rotate; turning
  steps the feet round rather than spinning the model.
- **Attention**: head and eyes lead, the body follows; saccades; a frightened creature holds itself
  differently from a confident one.
- **Idles express personality**: the goblin watches and shifts its balance; an ancient guardian
  barely moves; a gnome fidgets with purpose. No sine-wave bobbing, no synchronised breathing.
- **Secondary motion supports, never wobbles**: cloth settles after a turn, ears react after the
  head, heavy ornaments lag; nothing jiggles constantly.

## 12. Cutscenes

- Stage for silhouettes against lighter backgrounds; light faces and hands with motivated fill.
- Focal length by intent: establishing 50–60° field of view, medium 35–40°, close-ups 20–28°.
- Close-ups are where models fail: check hands, faces, wings, crowns and cloth in every cutscene.
- Captions sit in a lower-third safe zone on a soft gradient; never over critical action; no
  letterboxing over action.

## 13. Acceptance (what "finished" means for any asset)

Shown in the dev **lookdev mode**:

1. Neutral studio light, bloom and fog off.
2. Front, side, back and three-quarter turntable views.
3. Close enough to inspect face, hands, clothing and joints.
4. Performing its real movement and combat animations, deformations checked in those poses.
5. Inside its finished environment, at gameplay distance.
6. In a cinematic close-up.
7. As a solid black silhouette at gameplay distance, next to the rest of the cast.

If an asset fails any of these, it is not finished.
