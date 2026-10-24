# Changelog

All notable changes to ARcane are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Two-hand tracking: both hands are read at once, each with its own cursor, wisp, charge bar and debug skeleton, and each can cast its own spell at the same moment.
- Two-hand gestures: matching signs held together (Blood Pact, Eclipse, Twin Fangs, Crossfire, Wyrm’s Maw, Leviathan) and two-hand motions (Rift, Bind, Skywake, Cataclysm).
- A library of 31 gestures to choose from in the Spellbook, grouped by kind, with directional sweeps (Gale, Tempest, Phoenix Ascent), fist and finger strikes, and clockwise / counter-clockwise sigils. Each spell shows its gesture’s instructions.
- `SpellBook.activeGestures()`, `GestureEngine.setGestures()` and `HandsEngine.setGestures()`.

### Changed

- Landmark smoothing now applies a One Euro filter to all hand coordinates; the Smoothness control is live and fast movements remain responsive.
- Only gestures bound to a spell are live in the engine. Previously unassigned gestures could still fire silently, burning the cooldown and clearing the motion buffers.
- Open-palm holds (Aegis, Eclipse) only charge while the palm is still.
- When both hands show the same sign and a two-hand version is assigned, the two-hand gesture wins over the single-hand ones.

### Fixed

- Straight fingers angled horizontally from the palm no longer read as a closed fist during Cataclysm and other palm-down gestures. Borderline curl scores and collapsed finger joints report an unknown pose instead of charging a fist; deliberate clenched fists still cast normally.
- Pointing strikes (Skybolt, Impale and Wyrm Slash) follow the index fingertip rather than the palm, and use current-frame hand shapes instead of delayed smoothed poses. Finger extension now uses joint bends, so flexed fingers and shorter straight fingers are not classified by base-to-tip distance alone.
- A held sign with an assigned matching motion must stay still to charge, preventing Lance from consuming a developing Skybolt. Short strikes can retain one onset frame when the hand changes shape, with multi-frame confirmation and stricter straightness for pointing strokes to reject sigil arcs.
- Single-hand flicks and sweeps now measure the recent stroke rather than including an idle palm in their speed. Motion uses averaged raw palm positions while visual landmarks remain smoothed, and displacement is normalized without turning hand-size changes into sweeps.
- Stopped strokes, tracking jumps and wrong hand shapes no longer trigger single-hand sweeps. A fast upward stroke can complete Phoenix Ascent before the shorter Rise gesture consumes it.
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
