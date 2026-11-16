# ARcane: improvement plan (v0.2)

Written after reviewing every module in `src/`, the test suite (234 tests, all passing) and the docs.
Rule for the whole plan: **keep what works.** The tracking → smoothing → features → poses → engine
pipeline stays the same. Each change tightens a stage that already exists, and every stage has to
pass typecheck, the full test suite and a production build before it is committed.

---

## 0. What the review found

### Recognition
| # | Finding | Effect in play |
|---|---------|----------------|
| R1 | Bow Draw resets the moment **either hand drops out for one frame** (`leftOn`/`rightOn` false → `BowRecognizer.reset()`). | A fast pull often blurs the pinching hand for 1–2 frames, and the shot disappears. |
| R2 | Bow aim is lost after **70 ms** without a strict `point` pose. Pointing at the camera foreshortens the index finger, so it is often read as `unknown`/`fist` for a few frames. | The draw cancels mid-pull. |
| R3 | While the bow is engaged, `absorbCast()` runs **every frame**, and it sets `lastFireAt`. After any cancel, `canBegin` (both engines `canFire`) stays false for 600 ms. | After one flicker the bow can't re-arm, and the re-armed start point is already pulled back. Releasing does nothing. **This is the main cause of "sometimes it just doesn't fire."** |
| R4 | The draw is measured only as **2D on-screen separation**. Aiming at the screen and pulling back toward your face is mostly a *depth* movement. | A natural archery draw reads as "too short" and cancels. |
| R5 | `MAX_START_GAP = 3` palm lengths. With hands shoulder-width apart at arm's length the gap is often 3–5. | The bow never arms. |
| R6 | Pinch uses one 3D threshold (0.28). MediaPipe depth is noisy on a sideways pinching hand. | Pinch flickers. |
| R7 | Skyfall (`impale`) is loosened (straightness 0.82, travel 1.05), so the **descending quarter of a Mend circle** qualifies as a downward strike. | Lightning fires halfway through drawing a circle (wrong spell mid-motion). |
| R8 | Before the bow pinch closes, the pointing aim hand can fire **Skyfall** as it dips, and an open draw hand held still can charge **Aegis**. | The wrong spell fires while setting up the bow, and its cooldown then blocks the bow. |
| R9 | A circle is rejected if **any** sample in the loop is not `point`, and a stroke counts `unknown` (motion-blur) frames as mismatches. | Fast circles and flicks miss. |
| R10 | Diagonal sweeps are labelled by whichever axis is barely larger. | Gale and Rise can swap on a diagonal stroke. |
| R11 | Aegis "stillness" allows 0.45 palm lengths of drift, even when open-hand sweeps are live. | Pausing before a Gale sweep can cast Aegis. |
| R12 | Hold-to-cast charges at the same rate whether the pose is crisp or borderline. | Clean signs feel slow, and borderline ones still cast. |

### Visuals
| # | Finding |
|---|---------|
| V1 | `ParticleSystem` is a **no-op stub**. Every `emit()` (cursor trails and others) does nothing. |
| V2 | **Arrow**: a cylinder and two cones. Its orientation is deliberately tilted sideways (`addScaledVector(side, 1.08)`), and it flies a sideways arc, so it reads as a skewed stick. |
| V3 | **Lightning "thick squashed shapes"**: bolt radius (0.052) and zig-zag jitter (±0.28) are fixed **world** units, but bolt length scales with target depth. For a close target the bolt is short, the jitter angles are extreme, and the 5-sided cylinders overlap at the joints, which gives fat, squashed lumps. The branches are hard-coded at y = 1–4 m, so on short bolts they float above or away from the main bolt. |
| V4 | Mend, Rise and Aegis are thin lines and flat shapes. There's no impact staging, screen feedback, camera response or sound. |
| V5 | A new canvas glow texture is created for every cast (`SpellGlint`). |
| V6 | Enemy projectiles are static meshes with no trail. Taking damage only changes a HUD dataset value. |

### Creatures
| # | Finding |
|---|---------|
| C1 | Arms are single rigid planes that only rotate. No hand or claw articulation. |
| C2 | Faces are painted into the texture. No blinking, eye glow, gaze or mouth movement. |
| C3 | Death is a squash plus fade. |

### World
| # | Finding |
|---|---------|
| W1 | Fog drift speed is `uTime*.012`, so the banks look static. The noise has only 2 octaves and no domain warp. There's no fog near the camera. |
| W2 | The sky is a flat two-tone gradient: no moon, clouds or stars. |
| W3 | No post-processing: no bloom on the additive spells or lanterns, and no vignette or grade. |
| W4 | No audio at all. |

---

## 1. Stage 1: Recognition accuracy and Bow Draw (commit 1)

**BowRecognizer**
- Bridge **hand dropouts up to 240 ms** while a draw is in progress (R1). Keep the attempt alive and report the last charge. Cancel only after the grace period. Firing still requires both hands to be visible.
- Aim stays valid through `unknown` and `fist` misreads. Only a clear `open`, `victory`, `horns` or `trident` held for more than 260 ms cancels (R2).
- **Depth-aware draw** (R4): rotation-robust 3D palm size per hand. The draw hand moving away from the camera is measured as `(s₀/s − 1) × 5.5` palm lengths, relative to the aim hand so leaning back doesn't count. Planar and depth pulls are combined with `hypot`.
- Use the peak draw over the last 200 ms at release, because the release flick slightly shortens the draw.
- Two-channel pinch (3D gap or a tight 2D gap) with wider hysteresis (R6). Start gap allowed up to 6 palm lengths (R5).

**HandsEngine**
- New `GestureEngine.suspend()`: clears trails and resets hold timers **without** starting a cooldown. Used while the bow is engaged and when it cancels (R3). The cooldown applies only when an arrow actually fires.
- **Bow intent** (R8): if Bow Draw is live and one hand points while the other's thumb–index gap is closing (< 0.6 palm), the pointing hand's strikes and sigils and the other hand's holds are suppressed.

**GestureEngine / motion**
- **Circle guard** (R7): while a sigil is live, pointing strikes are rejected if the fingertip path has turned more than 150° in the preceding 650 ms (arc-length resampled, so jitter doesn't count).
- `unknown` frames count as neutral in stroke and circle checks, with limits (R9).
- Single-direction sweeps need the main axis to be at least 1.15× the other axis (R10).
- Open-palm holds use a tighter stillness band (0.3) when an open-hand sweep is live (R11).
- **Confidence-weighted charge** (R12): crisp poses charge up to 1.2× faster and borderline poses at 0.85×.
- Default cast pause 600 → 500 ms. Trails are still cleared after every cast, so return strokes can't repeat a cast.

**Tests** for each fix: depth draw, dropout bridging, aim flicker, re-arm after cancel, no Skyfall during a circle, no Skyfall or Aegis while setting up the bow.

## 2. Stage 2: VFX engine and spell overhaul (commit 2)
- **Real GPU particle system**: pooled ring buffer, one draw call, soft additive sprites, gravity, drag, size and alpha over life, plus spark/streak and smoke styles. Shared by the cursor wisps, spells, impacts, deaths and enemies.
- **Ribbon trail** class: camera-facing, tapered, soft-edged, fading strips.
- **Arcane Arrow** rebuilt: faceted energy head, bright core shaft, light fletching, halo. A fast flight with a gravity arc, aligned to its tangent. A ribbon trail with spiralling motes. A launch rune flash at the bow hand. On impact: a flash, shock ring, spark burst and shatter shards. Draw % scales all of it.
- **Lightning** rebuilt: camera-plane ribbon bolt with **width proportional to view depth** (constant on-screen thickness) and **fractal midpoint displacement proportional to segment length**, so it never squashes. Branches grow from the main bolt. 2–3 re-strike flickers, a ground scorch, an electric crawl, sparks and embers, plus a screen flash and a small camera shake.
- **Frost**: mist, glints and a shatter burst as the thorns fade.
- **Gale**: swirling ribbon trails, a vortex and leaf debris.
- **Mend**: rotating rune sigil (shader), rising spiral motes and a soft screen glow.
- **Rise**: ground rune circle, light pillar, earth dust and motes.
- **Aegis**: fresnel hex-ward shader with unfold and ripple, and a persistent ward vignette while the shield holds.
- **Enemy projectiles and strikes**: trailed ember wisps. Player hits get a red vignette and camera shake. Blocked hits get a ward ripple.
- **Cursor wisps**: soft ring with a **charge arc that fills as you hold**, plus a live particle trail.
- **Post-processing**: half-resolution bloom and a vignette/grade pass. Turned off automatically if the frame budget drops to minimum. Shared cached glow textures.

## 3. Stage 3: Procedural audio (commit 3)
Everything is synthesised with WebAudio, so there are no asset downloads and it still works offline.
- Ambient bed: wind (filtered noise with an LFO), a low drone, crickets, an occasional owl and distant whispers.
- Spells: bow creak (follows draw progress), twang and whoosh, thunk. Lightning crack plus delayed thunder. Frost shimmer and crunch. Gale whoosh panned in the sweep direction. Mend bell chord. Rise rumble and arpeggio. Aegis hum swell and glass ring.
- Feedback: a charge tone that rises with hold progress, a "ready" tick, and a soft "recovering" blip.
- Enemies: wind-up growl or hiss, strike whoosh, hit, death dissolve swell, wraith projectile whistle, player hurt, ward block.
- Stereo panning from screen position, a convolver reverb, and a master compressor.
- Volume slider and mute in the Spellbook, persisted. A mute toggle in the HUD.

## 4. Stage 4: Creature animation (commit 4)
- Arm planes subdivided, with a **vertex-shader bend** so the lower arm and claws curl, reach and twitch. Each arm has its own irregular idle motion with sparse, sharp "twitch" envelopes. They reach forward during the wind-up and snap on the strike. The motion stays deliberately small.
- **Expressions**: the painted eyes become dark sockets with **glowing eyes** in each creature's colour. They blink at random, dart (saccades), flare and redden on the wind-up, frost over when frozen, and flicker on a hit. A **mouth/jaw** overlay breathes slightly and opens on the wind-up and strike.
- Slow, uncanny head tilts and rare head jerks, plus torso breathing.
- **Dissolve death** (noise-threshold discard with a glowing edge and rising spirit motes) and a dissolve-in when the wood awakens.

## 5. Stage 5: World and atmosphere (commit 5)
- **Fog**: 3-octave, domain-warped, visibly flowing banks (wind direction plus curl). A **ground-mist layer near the camera** that creeps around the clearing and the creatures' feet. Drifting foreground wisps for parallax. Stronger lantern scattering.
- **Sky**: a moon with a halo, drifting thin clouds, sparse stars through the canopy gap.
- **Moonlight shafts** (animated god rays) in the clearing.
- **Watchers**: pairs of distant eyes in the dark between trees that blink and vanish (creepy, on-theme).
- A tuned colour grade, a vignette and a small amount of film grain. Stronger lantern flicker and halos.

## 6. Stage 6: UX polish, docs, report (commit 6)
- Cooldown sweep on spell dock slots, driven by encounter cooldowns.
- Docs: GESTURES (bow tips, depth draw), ARCHITECTURE (VFX, audio, events), CHANGELOG.
- A final report (`docs/IMPROVEMENT_REPORT.md`).

## Commit and push policy
Each stage is one commit, authored only by the repo owner's git identity, with no co-author or AI
trailers. Each stage is pushed to `origin/main` only after typecheck, tests and the build pass.
