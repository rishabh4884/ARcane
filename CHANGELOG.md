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

- Only gestures bound to a spell are live in the engine. Previously unassigned gestures could still fire silently, burning the cooldown and clearing the motion buffers.
- Open-palm holds (Aegis, Eclipse) only charge while the palm is still.
- When both hands show the same sign and a two-hand version is assigned, the two-hand gesture wins over the single-hand ones.

### Fixed

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
