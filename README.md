<div align="center">

# ARcane

### Cast spells with your bare hands.

Make a fist. Draw a circle in the air. Sweep your palm across the sky.
**ARcane reads your hands through your webcam and answers with magic in another world.**

No controller. No headset. No install. Just you, a browser and a little nerve.

[![CI](https://github.com/OWNER/arcane/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/arcane/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-b69cff.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-6ee7ff.svg)
![Runs in your browser](https://img.shields.io/badge/runs-in%20your%20browser-7dffb2.svg)

</div>

---

## Your hands are the spellbook

Most games put a plastic rectangle between you and the magic. ARcane takes it away.

Hold one hand, or both, up to your webcam and a wisp of light appears in a twilight world, following your palm. Shape a sign, trace a rune, sweep an arc: the world hears the gesture and answers with a spell.

- **It feels physical.** Spells are things you *do*, not buttons you press.
- **It is steady.** Hand tracking is smoothed so your wisp glides instead of jittering, and your casts land when you mean them to, not when your hand twitches.
- **It is yours to shape.** Rebind any gesture to any spell, and tune the feel, from inside the game.
- **It is private.** Your camera is used to read your hand and nothing else. The picture is never shown, saved or sent anywhere. Read the [privacy note](docs/PRIVACY.md).

## The six spells

| Spell | Gesture | How to cast it |
| --- | --- | --- |
| **Spell 1** | ✊ Closed fist | Squeeze your hand shut and hold for a heartbeat. |
| **Spell 2** | ✌️ Victory sign | Index and middle fingers up in a V, the others folded. |
| **Spell 3** | 🤘 Horns | Index and little finger up, the middle two folded. |
| **Spell 4** | 👋 Swish | Open hand, one quick sideways sweep. |
| **Spell 5** | ☝️ Circle | Point with one finger and trace a full circle. |
| **Spell 6** | 🙌 Rise | Open hand, scoop upward like lifting something off the floor. |

Hold a shape and its spell slot fills with light; when the bar is full, the spell is released. Every spell can be rebound in the **Spellbook** panel to any of more than thirty gestures, including two-hand signs and motions, and the full guide, with tips for each sign, lives in [docs/GESTURES.md](docs/GESTURES.md).

## Start casting

You need **Node.js 18.18 or newer** and a webcam.

```bash
git clone https://github.com/OWNER/arcane.git
cd arcane
npm install
npm run dev
```

Open the address Vite prints (usually <http://localhost:5173>), press **Begin casting** and allow the camera.

For the best results:

1. Sit about an arm's length from the screen.
2. Light your hand from the front, not from behind.
3. Use one hand or both, palms toward the camera.
4. Open the **Spellbook** and press <kbd>D</kbd> if you want to watch how ARcane sees your hand.

No camera handy? Keys <kbd>1</kbd> to <kbd>6</kbd> cast the six spells directly.

> `npm install` also fetches the hand-tracking model so ARcane works offline. If that step cannot reach the network, the game quietly falls back to a CDN at runtime.

## How it works

```
 webcam ──▶ hand landmarks ──▶ smoothing ──▶ finger & motion analysis ──▶ gesture ──▶ spell ──▶ world
 (hidden)    MediaPipe, 21       One Euro      poses, swipes, circles      "fist"     "Spell 1"   Three.js
             points, on-device   filter        with hysteresis & holds
```

1. **See.** [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) finds 21 points on your hand, entirely in your browser. The video itself is never drawn.
2. **Steady.** A [One Euro filter](https://gery.casiez.net/1euro/) smooths each point: rock-steady when you hold still, instantly responsive when you move fast.
3. **Understand.** Finger angles and reach decide which fingers are up. Hysteresis stops borderline fingers flickering. Palm and fingertip paths, measured in palm lengths so distance from the camera does not matter, reveal swishes, rises and circles.
4. **Cast.** The recognised gesture is looked up in your Spellbook, and the world paints the spell.

The longer tour is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Make it yours

Gestures and spells are plain data, so changing them takes minutes, not days.

```ts
// src/config/spells.ts
{ id: 'spell-1', name: 'Spell 1', color: '#ff6f3c', effect: 'burst', defaultGesture: 'fist' }
```

Rename a spell, recolour it, give it another effect, or point it at a different gesture, and the dev server updates instantly. [docs/CUSTOMIZING.md](docs/CUSTOMIZING.md) shows how to add brand-new gestures and spells.

## Built with

| | |
| --- | --- |
| [TypeScript](https://www.typescriptlang.org/) | Strict mode end to end |
| [Vite](https://vitejs.dev/) | Instant dev server, lean production build |
| [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) | On-device hand tracking |
| [Three.js](https://threejs.org/) | The virtual world and its spell particles |
| [Vitest](https://vitest.dev/) | Unit and pipeline tests on synthetic hands |
| ESLint, Prettier, GitHub Actions | Quality gates on every change |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck, then build for production into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run format` | Format the code with Prettier |
| `npm run setup:assets` | (Re)fetch the offline hand-tracking files |

## Roadmap

ARcane is in early access. The hand-reading engine is the foundation; the worlds and spells grow on top of it.

- [x] **0.1** Gesture engine, six gestures, rebindable Spellbook, placeholder world and spell effects
- [ ] **0.2** The first real world and real spell effects
- [x] **0.3** Two-handed gestures (spell combos still to come)
- [ ] **0.4** Duels: cast against a friend across the internet
- [ ] **Later** A gesture recorder to teach ARcane your own signs, phone and tablet polish, a plugin API for community worlds

Have an idea? [Open an issue](https://github.com/OWNER/arcane/issues/new/choose).

## Join the circle

Contributions of every size are welcome: a better gesture, a prettier spell, a bug fix, a clearer sentence. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and please read our [Code of Conduct](CODE_OF_CONDUCT.md). Found a security problem? See [SECURITY.md](SECURITY.md).

There is also a ready-made pitch deck in [`presentation/`](presentation/) if you want to introduce ARcane to a room.

## License

[MIT](LICENSE). Cast freely.
