# Gesture guide

ARcane recognises more than thirty gestures with one or both hands. Six are bound to spells by default, and you can rebind them any time in the **Spellbook** panel.

There are two kinds of gesture:

- **Shapes** are held for a moment (about a third of a second). The spell slot fills with light while you hold; when it is full, the spell is released. Pass through a shape quickly and nothing happens, which is what keeps stray movements from casting.
- **Motions** fire the instant the movement is clear: a quick sweep or a drawn circle.

After any cast there is a short pause (500 ms by default) so one flourish never casts twice. While a sign charges, the ring around your hand marker fills and a soft tone rises; when a spell is still recovering, its dock slot shows a sweep and shakes if you try it.

## Using both hands

ARcane tracks **up to two hands at once**. It works just as well with one hand: show a second hand only when you want to use it. Each tracked hand is read independently, so your left hand can hold a fist while your right makes a victory sign, and both spells can cast at the same moment. Each hand has its own crosshair marker and charge bar.

On top of that there are **two-hand gestures** that need both hands in view: matching signs held together, and motions made with both hands. When both hands are showing the same sign and a two-hand version of it is assigned, the two-hand version takes over, so a double fist casts the Blood Pact once rather than two fists and a pact.

## The gesture library

Only six gestures are assigned out of the box. The Spellbook dropdown offers the whole library, grouped by kind; anything not assigned to a spell is switched off, so it can never trigger by accident. If two assigned gestures overlap (for example Tempest and Swish), the stricter one wins.

**Hand signs** (hold for about a third of a second): Closed fist, Victory sign, Horns, Trident (three fingers up), Lance (point), Aegis (open palm, held still for 0.7 s).

**Open-hand sweeps**: Swish (either way), Tempest (to your right), Rise (scoop up), Phoenix Ascent (a much faster flick up), Bury (press down).

**Fist and finger strikes**: Sunder (fist down), Ember Uppercut (fist up), Wrath (fist sideways), Wyrm Slash (pointing finger sideways), Skybolt (pointing finger up), Impale (pointing finger down).

**Sigils** (point and draw a circle): Sunwise (clockwise), Moonwise (counter-clockwise), Circle (either way).

**Two-hand signs** (hold): Blood Pact (both fists), Eclipse (both open palms, still), Twin Fangs (two victory signs), Crossfire (two pointing fingers), Wyrm’s Maw (two horns), Leviathan (two tridents).

**Two-hand motions**: Bow Draw (point with one hand, pinch and pull back with the other, then release), Rift (pull open hands apart), Bind (draw them together), Skywake (lift both), Cataclysm (slam both down).

For **Bow Draw**, keep the pointing hand on the target. Pinch thumb and index finger on the other hand, pull that hand away from the pointer, then release after the charge bar fills. Either hand can aim.

- **Pull any natural way.** Sideways on screen counts, and so does drawing straight back toward your face (the camera sees that hand get smaller). Both together count most.
- **Your hands can start far apart** (up to about six palm-lengths, shoulder width at arm's length).
- **Small hiccups are forgiven.** If the tracker loses a hand for a moment during a fast pull, or briefly misreads your pointing finger, the draw carries on. A hand that stays gone for about a quarter of a second, or a pointing hand that clearly opens, cancels the shot instead of firing it.
- **A cancelled draw costs nothing:** you can pinch and pull again immediately.
- **Your aim markers step aside** while you draw, so they never sit over the target, and they return after the shot. Arrows that hit a spirit stay stuck in its body, glowing faintly, until it falls.
- **Nocking is safe.** While one hand points and the other brings thumb to index, the pointing hand cannot fire Skyfall or a sigil and the other hand cannot charge a sign.
- A short pull still cancels. The shot uses your strongest draw from the last moment before release, so the small forward flick as you let go does not weaken it.

## How to perform every gesture

Keep your palms facing the camera unless the gesture says otherwise. A **hold** means: make the shape cleanly, keep it in view, and wait for its charge to complete. A **stroke** means one committed movement—do not slowly wave back and forth.

### Hand signs — hold one hand still

| Gesture | How to do it |
| --- | --- |
| Closed fist | Curl all four fingers into your palm. Keep the knuckles facing the camera and hold without opening the hand. |
| Victory sign | Raise only the index and middle fingers in a clear V. Fold the ring finger and pinky down. |
| Horns | Raise the index finger and pinky. Tuck the middle and ring fingers down firmly. |
| Trident | Raise index, middle, and ring fingers together. Keep the pinky folded down. |
| Lance | Raise only the index finger, pointing up toward the top of the screen. Fold the other fingers. |
| Aegis | Show all four fingers in an open, flat palm. Hold the palm as still as possible for a little longer than other signs. |

### Open-hand sweeps — use one open palm

Start with an open palm, pause for a beat so it is recognised, then make one straight, quick stroke of roughly two to three hand-widths.

| Gesture | How to do it |
| --- | --- |
| Phoenix Ascent | Start low and flick the open palm sharply upward. This is the fastest and longest upward stroke. |
| Rise | Start low and scoop the open palm upward in a confident, smooth movement. |
| Tempest | Sweep your open palm horizontally to the **right side of your screen**. |
| Swish | Sweep your open palm sideways in either direction. Use this when you do not need a left- or right-specific cast. |
| Bury | Start higher in the frame and press the open palm straight down. |

### Fist and finger strikes — make the shape first, then move

| Gesture | How to do it |
| --- | --- |
| Sunder | Make a tight fist, then drive it down in one short, heavy stroke. |
| Ember Uppercut | Make a tight fist, start low, and thrust it up decisively. |
| Wrath | Make a tight fist and swing it sideways in one clean stroke. |
| Wyrm Slash | Point with one index finger and cut sideways across the screen. |
| Skybolt | Point with one index finger and thrust straight upward. |
| Skyfall | Point at or above an enemy and flick your index finger down. A short flick is enough, with no need to raise your hand first. Lightning strikes the spirit beneath your aim. |

Pointing strikes follow your **index fingertip**, so a clear wrist flick can work without a large palm sweep. Keep the other three fingers flexed and make the fingertip path reasonably straight; rounded paths are reserved for sigils. When a sigil is also assigned (Mend is by default), a pointing strike waits about 150 ms to confirm your fingertip is not still curling into a circle, so drawing Mend never fires Skyfall halfway round. If Lance and a pointing strike are both assigned, hold still for Lance and move for the strike. A hold that already cast still applies the normal pause between casts.

### Sigils — point, then draw

Raise just your index finger. Pause briefly in the pointing pose, then draw one large, round circle in the air. Keep the circle facing the camera and avoid reversing halfway through.

| Gesture | How to do it |
| --- | --- |
| Sunwise Sigil | Draw one clockwise circle as you see it on your screen. |
| Moonwise Sigil | Draw one counter-clockwise circle as you see it on your screen. |
| Circle | Draw one full circle in either direction. |

### Two-hand signs — match the shape on both hands and hold

Bring both hands fully into frame, leave a clear gap between them, and make the same shape on both hands at once. If a two-hand sign is assigned, it takes priority over the matching single-hand signs.

| Gesture | How to do it |
| --- | --- |
| Blood Pact | Make a tight fist with each hand and hold both fists up. |
| Eclipse | Show two open, flat palms and keep both hands still. |
| Twin Fangs | Make a victory sign with both hands. |
| Crossfire | Point with one index finger on each hand. |
| Wyrm’s Maw | Make the Horns sign with both hands. |
| Leviathan | Make the Trident sign with both hands. |

### Two-hand motions — begin open and move together

Start with both open palms visible, roughly shoulder-width apart. Keep both hands moving for the entire stroke; a movement made with only one hand will be ignored.

| Gesture | How to do it |
| --- | --- |
| Rift | Pull both hands outward, away from each other. |
| Bind | Start wide, then draw both hands inward toward the centre. Stop before your hands overlap. |
| Skywake | Begin with both hands low and lift both open palms straight up together. |
| Cataclysm | Begin with both hands high and drive both open palms straight down together. |

The Spellbook shows each gesture’s short instruction under the spell it is assigned to. Tips that apply to many of them:

- **Shapes** need the fingers clearly up or clearly folded. Fold the middle and ring fingers all the way for Horns; tuck ring and little finger in firmly for a Fist.
- **Sweeps** need to be decisive: roughly two and a half hand-widths in one quick, fairly straight stroke. A lazy drift is ignored on purpose. Start with your hand low in the frame for Rise. A sweep must clearly lead along one direction: a 45° diagonal is ambiguous and casts neither Swish nor Rise.
- **Sigils**: draw a rounder, slightly larger circle than feels natural, and pause a beat in the pointing pose first.
- **Open-palm holds** (Aegis, Eclipse) only charge while the palm is still, so sweeping an open hand never charges them on the way. While an open-hand sweep is also assigned (Rise is by default), "still" is stricter and Aegis waits for about a third of a second of stillness before it starts filling, so the pause before a sweep never raises it. After a sweep casts, an open-palm hold cannot start for about a second (or until you change hand shape), so stopping open after a sweep never casts Aegis. Hold the palm still for about a second to cast Aegis on purpose.
- **Sweeps** tolerate your palm turning edge-on mid-stroke (it often reads as three fingers).
- **Clean signs charge faster.** A crisp, unambiguous hand shape charges up to 20% quicker than a borderline one (unless the same shape also starts an assigned motion, where holds never rush).
- **Motion blur is tolerated.** A single blurred frame inside a stroke or a circle no longer breaks it.
- **Two-hand motions** work with either hand leading; you do not need to match “left” and “right” to the screen.

## Getting reliable detection

| Do | Because |
| --- | --- |
| Sit about an arm's length away | The hand should fill a good part of the frame without leaving it |
| Light your hand from the front | Backlight turns your hand into a silhouette and hides finger joints |
| Keep your palm toward the camera | Fingers pointing straight at the lens are hardest to read |
| Use a plain, uncluttered background | Fewer false hands |
| Keep your hands apart from each other and from your face | Overlapping hands are the hardest thing for the tracker; two-hand gestures need both clearly visible |

Sleeves, rings and nail polish do not matter. Very fast motion can blur frames; ARcane bridges brief dropouts, but a sweep that is too fast for the camera may need a second try.

## Seeing what ARcane sees

Press <kbd>D</kbd> (or tick **Show tracking view** in the Spellbook) to show both tracked skeletons (left hand cyan, right hand violet), your frame rate, each hand’s detected pose and a bar for each finger. A bar that is green and long means "extended"; short and grey means "curled". It draws only numbers and lines, never the camera image.

## Tuning the feel

Open the Spellbook and adjust:

- **Smoothness**: higher is steadier but slightly slower to follow; lower is snappier but jitterier.
- **Hold time**: how long a shape must be held before it casts.
- **Pause between casts**: the quiet time after a cast.
- **Reach**: how far your hand must travel to cross the screen. Raise it if you do not want to move much.

**Restore defaults** resets both the bindings and the feel.
