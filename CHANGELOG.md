# Changelog

All notable changes to ARcane are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Removed

- The Gale spell, its wind effect, its gust through the grass, its sound, dock icon and the left-sweep Gale gesture. Six spells now ship by default; old saved bindings for Gale are ignored.

### Changed

- The frame is staged in depth like a painted 2D world: dark branches, grass and a fern hang into the corners right in front of the eye and sway slowly, the depth of field softens them and the far wood while the playing ground stays crisp, and the grass at the caster's feet sinks toward a dark, quiet band. The grade adds light from above, a slow projector flicker, a softer oval vignette and grain at film rate.
- The hush: every so often the whole wood holds its breath. Wind, grass, fog and fireflies slow almost to a stop, the crickets fall silent, every watching spirit freezes and stares, the frame dims, and the wood breathes out as it resumes.
- The Rise gnomes match the new look: thin, warm, half-transparent lines instead of heavy cartoon ink, feathered and softly shaded. Each gnome is seven continuous painted sheets skinned to one skeleton (no visible joints when knees and elbows bend), with a three-segment cap that flops and trails behind every turn and landing and a beard that swings a beat behind the jaw. Their boots stand in the ground mist.
- The spirits are repainted for a soft, painted 2D look instead of cut-outs: no ink outlines, dark quiet masses that belong to the fog, feathered edges, a thin backlight on edges facing the sky, very little interior detail, and limbs that melt into the body. Distance haze fades them toward the air and the ground mist swallows their feet.
- Each spirit is now a 2D bone rig: every painting is a single sheet skinned to one skeleton, so spines ripple and elbows, wrists and talons bend the paint itself. Joints move through damped springs (late arrival, slight overshoot, settle), fingers curl in a slow ripple, and a hit whips up through the body.
- Spirits pause. Every few seconds one lets its breath, sway and even its cloth run down and simply watches you, then breaks the stillness with one small sudden movement. Wind-ups draw back slowly, hold frozen, then tremble before the strike.
- The Antlered Hollow wears a floor-length shroud and a darker cape behind it, both flowing slowly in the shader, with dead moss drifting from its antlers; it glides rather than walks. The Wraith's robe flows and fades to vapour, and its lantern swings on its own.

### Added

- Rise gnomes throw rocks instead of firing bolts. They are redrawn as a 15-part rig (thigh, boot and knee patch per leg; upper arm, forearm, palm and curling fingers per arm; torso, head and a floppy cap that lags the head) with the crossbow removed. Each throw is choreographed: stoop and reach with both hands, close them on a stone, stand with it at the chest, cock it behind the head while the other arm sights the target, whip it over, release and follow through. Stones fly a true ballistic arc with spin and a dust trail and shatter into chips and grit on a spirit, on scenery or on the ground.
- Jointed spirit arms: each painted arm is cut at shoulder, elbow and wrist with round cut-paper joints, and the hands end in separately rigged talons that splay, hook toward you and clench. Every spirit has its own attack choreography — the goblin cocks both claws beside its head and rakes twice a beat apart, the Rootbound hauls its fists overhead and hammers down, the Hollow spreads limp-wristed arms wide and folds them in to grab, the Wraith cups an ember beside its face and flings it (the ember now launches from that palm) while its lantern hangs plumb from the other hand. Power swells in the palms through the wind-up and raking swings leave a smear of light.
- A creepier walk: an uneven, limping step with one dragging leg, forearms that dangle a beat behind, a head that stays locked level on you while the body lurches, fingers that twitch one at a time, and the occasional dead stop mid-stride (the spirit's ground speed stops with it).
- Repainted woodland spirits, same silhouettes: every part now has a core shadow, edge occlusion and a moonlit rim, plus its own surface — the goblin's mottled, warted skin, bramble crown, scarred cheek, stitched leather and bone charm; the Rootbound's bark grain, knots, moss, shelf fungi, ember-lit cracks and something small watching from its trunk; the Hollow's cracked, stained skull, moss-hung antlers and a ribcage pressing through its shroud; the Wraith's deep cowl, robe folds, light-stitched runes and a lit lantern with soot and flame. Heads render at 1024px and bodies at 768px.
- Creepier eyes: deep glowing sockets, a fibrous iris, a species pupil (goblin slit, Rootbound goat bar, Hollow pinprick, Wraith ring) that blows wide as a spirit fixes on you to strike and shrinks to a pinprick when hit, a wet glint, eyes that track out of step, one eye that sometimes shivers, and a rare roll-back. Mouths gained needle teeth and a faint inner glow.
- Pooled GPU particle system, camera-facing ribbon trails and half-resolution bloom with a display-space grade (vignette, split tone, highlight shoulder, grain). Post-processing switches itself off on slow devices, or with `?post=0`.
- Rebuilt spell visuals: an energy Arcane Arrow on a gravity arc with trail, motes, launch and impact staging; branching, flickering lightning with scorch, crawl, sparks, screen flash and shake; shattering frost; spiral gale trails with leaves; rune-sigil Mend and Rise with a light pillar; an unfolding hex-lattice Aegis with a persistent ward vignette.
- Screen feedback layer: lightning flash, healing and ward edge glows, a red hurt vignette and camera shake when struck.
- Procedural WebAudio sound for everything: forest ambience (wind, drone, crickets, owl, whispers), every spell, creature wind-ups, hits and deaths, player damage and blocks, charge tones and the bow creak. A sound pill in the HUD, `M` to mute, and volume in the Spellbook.
- Living creature faces: glowing eyes that blink, dart, glare red on the wind-up and frost over, plus a breathing jaw that gapes on the strike. Claws sway, flex and twitch through a vertex-shader bend; heads tilt slowly and jerk rarely; torsos breathe. Spirits dissolve into embers when they fall and rise out of the ground when the wood awakens.
- Atmosphere: flowing domain-warped fog banks, creeping ground mist, drifting wisps, a moon with clouds and stars, moonlight shafts, flickering lantern halos, and pairs of watching eyes between distant trees.
- Hand markers show a charge ring that fills while a sign is held. Spell dock slots show a recovery sweep, a ready shimmer and a refusal shake.
- `GameEvents` bus, `GestureEngine.suspend()`, and `ProcessContext.suppressPointing` / `suppressHolds`.

- Selectable 30/60fps camera caps, capture-time timestamps and inference-age reporting. Direct MediaPipe inference remains the default; the experimental worker can be compared using `?tracking=worker`.
- Two-hand tracking: both hands are read at once, each with its own cursor, wisp, charge bar and debug skeleton, and each can cast its own spell at the same moment.
- Two-hand gestures: matching signs held together (Blood Pact, Eclipse, Twin Fangs, Crossfire, Wyrm’s Maw, Leviathan) and two-hand motions (Rift, Bind, Skywake, Cataclysm).
- A library of 31 gestures to choose from in the Spellbook, grouped by kind, with directional sweeps (Gale, Tempest, Phoenix Ascent), fist and finger strikes, and clockwise / counter-clockwise sigils. Each spell shows its gesture’s instructions.
- `SpellBook.activeGestures()`, `GestureEngine.setGestures()` and `HandsEngine.setGestures()`.

### Changed

- Arrows stick along their real flight direction at impact, and every shot leaves a glowing streak revealed along its whole (now visibly lobbed) path, lingering briefly after it lands.
- Gale redesigned as a real gust: streams of wind lines (some curling into eddies), tumbling leaves, dust skimming the floor, grass bowing as the wavefront passes, and a pressure burst at the target. Detection tolerates an edge-on palm and needs a slightly shorter stroke.
- Gale and Aegis no longer interfere: Aegis only starts charging after a short stillness commit while Gale is bound, and cannot start right after a sweep casts.
- Aegis redesigned in the forest's fantasy style: a golden rune circle unfolding before the caster, a pearly veil of flowing light, and six carved runes orbiting and pulsing (the hex-lattice force field is gone).
- Rise gnomes are now articulated cut-paper puppets (legs, coat, arms, crossbow, head) built from their own artwork. They tear the ground open and burst out arms-first, run with striding legs and pumping arms, raise and sight the crossbow, recoil, dip to reload, glance about at rest, and sink back into the earth when their time is up.
- Lightning sounds like lightning: a clipped double crack, a burst of electrical crackle, a sub boom and thunder that rolls away in uneven swells across the stereo field.
- A lightning strike lights its surroundings. Ground, trees, rocks, grass, fog, mist and nearby spirits brighten with the bolt and flicker with it, through a shared world-light uniform (most of the forest is unlit artwork that ordinary three.js lights cannot reach).
- During Bow Draw only the drawing hand's marker hides; the aiming hand keeps one marker, whose ring fills with the draw. Markers are fully opaque with a soft dark outline, so they read clearly over fog and spells.
- Rise: the gnomes climb out of the summoning circle exactly where it opens, hold a firing position between the caster and their target (they used to run past it), turn to face it, and shoot with a visible brace, recoil and settle. Bolts leave from the crossbow tip and fly slower and brighter.
- Skyfall casts from a short fingertip flick (0.72 palm-lengths, slower strokes accepted) and strikes the spirit in the column beneath the aim point, so pointing at or above an enemy is enough. A raise-then-drop U-turn is no longer mistaken for a sigil arc.
- Hand markers are now a small fine ring and soft dot (no crosshair or particle trail). The charge arc remains. Both markers hide while a bow draw is in progress.
- Arrows fly to the spirit's actual body rather than the edge of the aim-assist box, and stay stuck in it at a visible angle. They move and recoil with the spirit and fade when it dissolves; arrows that miss stick in the ground or trees for a few seconds.
- Bow Draw measures the pull in depth as well as on screen, bridges hand drop-outs (240 ms) and aim misreads (260 ms), arms with hands up to six palm-lengths apart, uses the recent peak draw at release, and no longer spends the cast pause when a draw is cancelled.
- Default pause between casts is 500 ms (was 600 ms). Crisp signs charge up to 1.2× faster when no live motion shares the shape.
- The renderer no longer tone-maps the illustrated scene; the post grade rolls off only the highlights.

- Landmark smoothing now applies a One Euro filter to all hand coordinates; the Smoothness control is live and fast movements remain responsive.
- Camera capture timestamps now flow through landmark, gesture and motion processing; cursor render easing is shortened so smoothing is not applied twice.
- Only gestures bound to a spell are live in the engine. Previously unassigned gestures could still fire silently, burning the cooldown and clearing the motion buffers.
- Open-palm holds (Aegis, Eclipse) only charge while the palm is still.
- When both hands show the same sign and a two-hand version is assigned, the two-hand gesture wins over the single-hand ones.

### Removed

- The Balrog boss model, its Mystic rig, the Blender export and inspection scripts, `Boss.ts` and its tests. The model was no longer loaded by the game.

### Fixed

- Bow Draw could fail intermittently: one dropped frame of either hand reset the draw, and the reset spent a 600 ms pause that blocked re-arming from the right place.
- Drawing a Mend circle with the default bindings fired Skyfall (sometimes twice) on its downward arc. Pointing strikes now confirm over 150 ms while a sigil is live.
- The aiming hand could fire Skyfall, or the other hand charge Aegis, while a bow shot was being set up.
- Diagonal sweeps could cast the wrong directional spell; a single motion-blurred frame could break a stroke or a sigil.
- Lightning rendered as thick, squashed shapes on close targets: its width and jitter were fixed world sizes. Both now scale with depth and bolt length.
- The arrow was drawn tilted sideways along a sideways arc.
- Spell lights were added and removed per cast, recompiling lit shaders mid-fight.

- Removed the 180 ms result-age cutoff that converted valid slow detections into missing hands. Slow results are now reported without silently dropping their landmarks, and worker inference is no longer enabled by default.
- Straight fingers angled horizontally from the palm no longer read as a closed fist during Cataclysm and other palm-down gestures. Borderline curl scores and collapsed finger joints report an unknown pose instead of charging a fist; deliberate clenched fists still cast normally.
- Pointing strikes (Skybolt, Impale and Wyrm Slash) follow the index fingertip rather than the palm, and use current-frame hand shapes instead of delayed smoothed poses. Finger extension now uses joint bends, so flexed fingers and shorter straight fingers are not classified by base-to-tip distance alone.
- A held sign with an assigned matching motion must stay still to charge, preventing Lance from consuming a developing Skybolt. Short strikes can retain one onset frame when the hand changes shape, with multi-frame confirmation and stricter straightness for pointing strokes to reject sigil arcs.
- Single-hand flicks and sweeps now measure the recent stroke rather than including an idle palm in their speed. Motion uses averaged raw palm positions while visual landmarks remain smoothed, and displacement is normalized without turning hand-size changes into sweeps.
- Circle paths are evaluated over elapsed stroke time instead of a fixed sample count, and two-hand motion now enforces time-normalized speed and directional consistency. Their decisions are covered by 24/30/60fps replay tests.
- Stopped strokes, tracking jumps and wrong hand shapes no longer trigger single-hand sweeps. A fast upward stroke can complete Phoenix Ascent before the shorter Rise gesture consumes it.
- Overlapping MediaPipe hypotheses for the same palm are collapsed; a newly appearing second track must persist across consecutive frames, and a dropped slot is no longer published as a live hand during the dropout grace period. The debug overlay now shows raw detections beside live tracks.
- Established hand identities now survive brief one-hand dropouts without repeated second-hand confirmation. Solo-hand continuity accounts for palm size, stale slots expire independently, and camera stalls cannot complete a held sign using unobserved time. The debug overlay also shows inference time.
- The app failed to start: `World` still used its single-wisp fields, which threw on the first frame and stopped `main.ts` before the Begin button was wired. `main.ts` also still used the single-hand engine.
- MediaPipe’s Left/Right labels were used backwards (it assumes a mirrored image). Hand slots could end up reversed, so Rift and Bind never fired. Two-hand pairing now follows the on-screen layout and the two-hand motions no longer depend on the labels at all.
- A fault in a frame handler can no longer stop the camera loop.
- The debug checkbox no longer uses `id="dbg"`, which browsers expose as `window.dbg`.

## [0.1.0] - Initial release

### Added

- Webcam hand tracking with MediaPipe Hand Landmarker, running entirely in the browser. The camera image is never displayed, stored or transmitted.
- One Euro landmark smoothing for steady, low-latency tracking.
- Gesture engine with three recognisers: held hand shapes (fist, victory, horns), directional swipes (swish, rise) and traced circles.
- Six placeholder spells, each bound to a gesture and each with its own particle effect.
- Spellbook panel to rebind gestures to spells and tune smoothness, hold time, cast pause and reach. Settings persist locally.
- Tracking debug view (press <kbd>D</kbd>) showing the skeleton and finger readouts.
- Keyboard shortcuts <kbd>1</kbd> to <kbd>6</kbd> to cast without a camera.
- Three.js twilight world with a wisp that follows your palm.
- Test suite built on synthetic hands, covering features, smoothing, motion detection, the full pipeline and the Spellbook.
- Documentation, contribution guidelines, CI and a presentation deck.
