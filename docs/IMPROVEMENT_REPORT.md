# ARcane v0.2: improvement report

Companion to [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md). Every stage in the plan has been built,
tested and pushed to `rishabh4884/ARcane` (`main`), each as one commit authored only by the repo
owner.

| Stage | Commit | What it delivered |
|---|---|---|
| 1. Recognition and Bow Draw | `599382a` | Reliable bow, strike/sigil arbitration, blur tolerance, faster crisp holds |
| 2. VFX engine and spells | `64989ea` | Particles, trails, bloom/grade, rebuilt spells, screen feedback, light pool, cooldown sweep |
| 3. Procedural audio | `d284654` | Ambience, spell/creature/feedback sounds, mute and volume |
| 4. Creature animation | `2d12c33` | Glowing blinking eyes, jaw, twitching claws, head tilts, dissolve death and rise |
| 5. World and atmosphere | `fefa86a` | Flowing fog, ground mist, wisps, moon/clouds/stars, moon shafts, watchers, lantern halos |
| 6. UX polish, docs, report | *(this commit)* | Refusal feedback, updated guides, changelog, this report |

Overall: about 40 files changed, roughly 3.9k lines added. Tests went from **234 to 253**, all passing.
Typecheck is clean and the production build succeeds.

---

## 1. Why Bow Draw failed "from time to time"

I reproduced each cause in a failing test before fixing it (`tests/recognition-v2.test.ts`).

1. **One dropped frame cancelled the shot.** When MediaPipe lost either hand for a single frame
   (common while the pinching hand rotates during a fast pull), `HandsEngine` passed `null`, and the
   recogniser reset immediately.
2. **The reset blocked re-arming.** While engaged, the engine called `absorbCast()` every frame,
   which set the cast-pause clock. After any reset, `canBegin` stayed false for 600 ms. When the bow
   finally re-armed, its start point was already pulled back, so the release measured almost no draw
   and fired nothing.
3. **Aim was dropped after 70 ms** of anything other than a strict `point`. Pointing at the lens
   foreshortens the index finger, and it is often read as `unknown` or `fist`.
4. **Only on-screen separation counted.** Aiming at the screen and drawing back toward your face is
   mostly a depth movement, so a natural draw read as too short.
5. **The hands had to start within 3 palm lengths** of each other (shoulder width is often 3–5).

**Fixes:** a 240 ms drop-out bridge; a 260 ms aim grace (only a clearly different shape counts as
losing aim); a depth channel from 3D palm-size change, relative to the aiming hand; a 6-palm start
gap; a two-channel pinch; peak draw at release; `GestureEngine.suspend()` so a cancelled draw spends
no cast pause; and *bow intent*, so setting up a shot can't fire Skyfall or charge Aegis.

## 2. Spells firing mid-motion of another spell

- **The biggest one:** with the default bindings, drawing a Mend circle fired **Skyfall once or
  twice** on the circle's downward arc. Pointing strikes now confirm over 150 ms while a sigil is live
  and are vetoed if the fingertip keeps curling. A deliberate Skyfall still casts.
- Diagonal sweeps no longer pick Gale vs Rise by a hair (1.15× axis dominance).
- Hovering an open hand before a Gale no longer raises Aegis (tighter stillness when an open sweep is
  live).
- Holds never rush when their shape also starts a live motion. A Lance vs Skybolt test caught exactly
  this regression during development.

## 3. Animation and visuals

- **Lightning "thick squashed shapes":** bolt radius and zig-zag jitter were fixed world-space
  sizes, while bolt length scaled with target depth. Close targets produced short bolts with extreme
  angles and overlapping 5-sided cylinders. Bolts are now flat camera-plane ribbons with mitred joints.
  Width is proportional to depth (constant on-screen thickness) and jitter is proportional to segment
  length. A unit test proves a near bolt is a scaled copy of a far one.
- **The arrow** was a tilted stick on a sideways arc. It is now a faceted energy arrow, launched from
  the bow hand on a gravity arc and aligned to its tangent, with a ribbon trail, spiralling motes, a
  launch flare and a full impact beat. Draw strength scales all of it.
- The particle system was a **no-op stub**. It is now a real GPU pool and drives every effect.
- Each cast used to add a point light, which recompiles lit shaders mid-fight. Effects now borrow
  from a fixed pool of three.

## 4. What I verified, and what still needs a real device

**Verified here:** typecheck; 253 unit tests (recognition regressions, bow robustness, particle
pooling and compaction, trails, bolt scale-invariance, creature expressions and dissolve, audio
safety without an AudioContext); production build; every changed module compiling through the Vite
dev server; and the three.js shader-chunk anchors used by the creature patch.

**Not verified here.** This session had no browser or GPU, and installing a GLSL validator was not
permitted. Every new shader was reviewed by hand for GLSL ES portability, and two classes of
undefined behaviour were removed: reversed-edge `smoothstep` and negative-base `pow`. Even so, no new
shader has been compiled on a real GPU yet. The look and the tuning values (bloom strength, fog
density, audio levels) also still need checking by eye and ear.

### Suggested play-test checklist
1. Open the dev server with the console open and look for any `THREE.WebGLProgram` shader errors.
   In development you can cast without a camera from the console:
   `arcane.skipIntro(); arcane.aim(0.5, 0.45); arcane.cast('spell-2')` (`spell-1` to `spell-7`).
2. Bow: pull sideways, pull straight back, start with your hands wide apart, and cancel then re-nock
   immediately.
3. Draw Mend circles starting at every clock position: no lightning. Then a deliberate Skyfall.
4. Check frame rate with tracking on (press `D`). If it's low, compare with `?post=0`.
5. Sound: `M` toggles mute; the ambience fades in after the first click.

### Easy knobs if anything feels off
| Feel | Where |
|---|---|
| Bow too strict or too loose | `MIN_DRAW`, `FULL_DRAW`, `DEPTH_PALMS`, `DROPOUT_MS`, `AIM_LOST_MS` in `src/gestures/BowRecognizer.ts` |
| Skyfall latency with Mend bound | `STRIKE_CONFIRM_MS`, `STRIKE_CURL` in `src/gestures/GestureEngine.ts` |
| Glow intensity | `UnrealBloomPass(…, 0.62, 0.5, 0.8)` in `src/world/PostFX.ts` |
| Vignette and grain | `uVignette`, `uGrain` in `src/world/PostFX.ts` |
| Fog and mist density | alpha factors in `src/world/VolumetricFog.ts` and `src/world/Atmosphere.ts` |
| Overall loudness | `sfx` and `ambience` gains in `src/audio/AudioEngine.ts` |
