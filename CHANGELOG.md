# Changelog

All notable changes to ARcane are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The supplied Balrog sculpt is exported as a textured, upright GLB with a hand-painted-style garnet hide, ember-red wings, antique-gold torso marks and bone-toned horns, plus an ember plinth, drifting cinders, gently flexing wing tips and spell-color flashes. Camera tracking stays independent if the model fails to load.
- Selectable 30/60fps camera caps, capture-time timestamps and inference-age reporting. Direct MediaPipe inference remains the default; the experimental worker can be compared using `?tracking=worker`.
- Two-hand tracking: both hands are read at once, each with its own cursor, wisp, charge bar and debug skeleton, and each can cast its own spell at the same moment.
- Two-hand gestures: matching signs held together (Blood Pact, Eclipse, Twin Fangs, Crossfire, Wyrm’s Maw, Leviathan) and two-hand motions (Rift, Bind, Skywake, Cataclysm).
- A library of 31 gestures to choose from in the Spellbook, grouped by kind, with directional sweeps (Gale, Tempest, Phoenix Ascent), fist and finger strikes, and clockwise / counter-clockwise sigils. Each spell shows its gesture’s instructions.
- `SpellBook.activeGestures()`, `GestureEngine.setGestures()` and `HandsEngine.setGestures()`.

### Changed

- Landmark smoothing now applies a One Euro filter to all hand coordinates; the Smoothness control is live and fast movements remain responsive.
- Camera capture timestamps now flow through landmark, gesture and motion processing; cursor render easing is shortened so smoothing is not applied twice.
- Only gestures bound to a spell are live in the engine. Previously unassigned gestures could still fire silently, burning the cooldown and clearing the motion buffers.
- Open-palm holds (Aegis, Eclipse) only charge while the palm is still.
- When both hands show the same sign and a two-hand version is assigned, the two-hand gesture wins over the single-hand ones.

### Fixed

- Removed the 180 ms result-age cutoff that converted valid slow detections into missing hands. Slow results are now reported without silently dropping their landmarks, and worker inference is no longer enabled by default.
- Straight fingers angled horizontally from the palm no longer read as a closed fist during Cataclysm and other palm-down gestures. Borderline curl scores and collapsed finger joints report an unknown pose instead of charging a fist; deliberate clenched fists still cast normally.
- Pointing strikes (Skybolt, Impale and Wyrm Slash) follow the index fingertip rather than the palm, and use current-frame hand shapes instead of delayed smoothed poses. Finger extension now uses joint bends, so flexed fingers and shorter straight fingers are not classified by base-to-tip distance alone.
- A held sign with an assigned matching motion must stay still to charge, preventing Lance from consuming a developing Skybolt. Short strikes can retain one onset frame when the hand changes shape, with multi-frame confirmation and stricter straightness for pointing strokes to reject sigil arcs.
- Single-hand flicks and sweeps now measure the recent stroke rather than including an idle palm in their speed. Motion uses averaged raw palm positions while visual landmarks remain smoothed, and displacement is normalized without turning hand-size changes into sweeps.
- Circle paths are evaluated over elapsed stroke time instead of a fixed sample count, and two-hand motion now enforces time-normalized speed and directional consistency. Their decisions are covered by 24/30/60fps replay tests.
- Stopped strokes, tracking jumps and wrong hand shapes no longer trigger single-hand sweeps. A fast upward stroke can complete Phoenix Ascent before the shorter Rise gesture consumes it.
- Overlapping MediaPipe hypotheses for the same palm are collapsed; a newly appearing second track must persist across consecutive frames, and a dropped slot is no longer published as a live hand during the dropout grace period. The debug overlay now shows raw detections beside live tracks.
- Established hand identities now survive brief one-hand dropouts without repeated second-hand confirmation. Solo-hand continuity accounts for palm size, stale slots expire independently, and camera stalls cannot complete a held sign using unobserved time. The debug overlay also shows inference time.
- Corrected the Balrog export's swapped height/depth axes rather than compensating with a runtime tilt. Perspective-aware framing keeps the full wingspan and plinth clear of screen edges and the spell dock.
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
