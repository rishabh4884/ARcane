import * as THREE from 'three';
import { DRAWN_LOOK } from '../world/authored.ts';
import { drawn } from '../world/render/DrawnProp.ts';
import type { Mood } from '../game/campaign.ts';
import { Character, type CharacterInput, type Design } from '../world/rig/Character.ts';
import type { CreaturePose } from '../world/rig/Rig.ts';
import { terrainHeight } from '../world/spatial.ts';
import { glowSprite, Trail } from '../world/vfx.ts';
import type { Stage, World } from '../world/World.ts';

/**
 * CUTSCENES
 * ─────────
 * Every cutscene is a short film played in the living wood itself: the same rigged characters,
 * the same light and fog, a camera moving on keyframes, and words timed to the action. No video:
 * everything is built and animated in code. A scene plays through by itself; the option to move on
 * appears only when it has finished.
 */

export type V3 = readonly [number, number, number];
export interface Line { at: number; until: number; text: string; speaker?: string; kind?: 'whisper' | 'voice' | 'caption' }
export interface CameraKey { t: number; p: V3; l: V3; fov?: number; ease?: 'inOut' | 'linear' | 'out' | 'in' }
export interface Script {
  id: string;
  duration: number;
  mood: Mood;
  /** The place it is staged in (see world/regions.ts). */
  region?: string;
  /** Mood to settle into while it plays (the ending turns to dawn). */
  toMood?: { mood: Mood; at: number; seconds: number };
  lines: Line[];
  title?: { at: number; until: number; name: string; subtitle: string };
  /** Fade from black at the start (default true) and to black at the end. */
  fadeIn?: number;
  fadeOut?: boolean;
  camera: CameraKey[];
  build(s: Shot): void;
  tick(s: Shot, t: number, dt: number): void;
}

interface ActorState { figure: Character; input: CharacterInput; hover: number }

const ease = (k: CameraKey['ease'], u: number): number =>
  k === 'linear' ? u : k === 'out' ? 1 - (1 - u) ** 2 : k === 'in' ? u * u : u * u * (3 - 2 * u);

/** The stage for one cutscene: its actors, props, lights and camera. */
export class Shot {
  readonly root = new THREE.Group();
  readonly actors = new Map<string, ActorState>();
  readonly trails: Trail[] = [];
  private readonly disposers: Array<() => void> = [];
  private readonly lookAt = new THREE.Vector3();
  t = 0;

  constructor(readonly stage: Stage) {
    this.root.name = 'Cutscene';
    stage.scene.add(this.root);
  }

  get camera(): THREE.PerspectiveCamera { return this.stage.camera; }

  ground(x: number, z: number): number { return terrainHeight(x, z); }
  at(x: number, z: number, lift = 0): THREE.Vector3 { return new THREE.Vector3(x, terrainHeight(x, z) + lift, z); }

  /** Place a character on the ground (or hovering) facing `yaw`. */
  actor(key: string, design: Design, x: number, z: number, yaw = 0, hover = 0, seed = Math.random()): Character {
    const figure = new Character(design, seed);
    figure.group.position.copy(this.at(x, z));
    figure.setYaw(yaw);
    this.root.add(figure.group);
    this.actors.set(key, {
      figure, hover,
      input: { pose: 'idle', progress: 0, attack: '', velocity: new THREE.Vector3(), faceYaw: yaw, look: this.camera.position, groundY: figure.group.position.y },
    });
    return figure;
  }

  get(key: string): Character { return this.actors.get(key)!.figure; }

  /** Set what a character is doing this frame. */
  act(key: string, pose: CreaturePose, progress = 0, attack = ''): void {
    const a = this.actors.get(key);
    if (!a) return;
    a.input.pose = pose;
    a.input.progress = progress;
    a.input.attack = attack;
  }

  face(key: string, yaw: number | null): void { const a = this.actors.get(key); if (a) a.input.faceYaw = yaw; }
  look(key: string, at: THREE.Vector3): void { const a = this.actors.get(key); if (a) a.input.look = at; }
  hover(key: string, height: number): void { const a = this.actors.get(key); if (a) a.hover = height; }

  /** Walk (or glide) a character from one point to another between two times, facing its way. */
  travel(key: string, from: readonly [number, number], to: readonly [number, number], t0: number, t1: number, faceTravel = true): void {
    const a = this.actors.get(key);
    if (!a) return;
    const u = THREE.MathUtils.clamp((this.t - t0) / (t1 - t0), 0, 1);
    const x = from[0] + (to[0] - from[0]) * u, z = from[1] + (to[1] - from[1]) * u;
    a.figure.group.position.set(x, terrainHeight(x, z), z);
    const moving = this.t > t0 && this.t < t1;
    const speed = Math.hypot(to[0] - from[0], to[1] - from[1]) / (t1 - t0);
    if (moving) {
      a.input.velocity.set((to[0] - from[0]) / (t1 - t0), 0, (to[1] - from[1]) / (t1 - t0));
      if (faceTravel && speed > 0.05) a.input.faceYaw = Math.atan2(to[0] - from[0], to[1] - from[1]);
      if (a.input.pose === 'idle') a.input.pose = 'walk';
    } else a.input.velocity.set(0, 0, 0);
  }

  /** A small drifting light with a tail. */
  lumen(color: THREE.ColorRepresentation, size = 0.35): { sprite: THREE.Sprite; trail: Trail; place(p: THREE.Vector3): void } {
    const sprite = glowSprite(color, size, undefined, 1);
    const trail = new Trail(color, size * 0.25, 0.6, 32, 1);
    this.root.add(sprite, trail.mesh);
    this.trails.push(trail);
    return { sprite, trail, place: (p) => { sprite.position.copy(p); trail.push(p); } };
  }

  add<T extends THREE.Object3D>(object: T): T { this.root.add(object); return DRAWN_LOOK ? drawn(object) : object; }
  onDispose(fn: () => void): void { this.disposers.push(fn); }

  /** Interpolate the camera through its keys. */
  camera_(keys: readonly CameraKey[], t: number): void {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[Math.min(keys.length - 1, i + 1)];
    const u = b.t > a.t ? ease(b.ease, THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1)) : 1;
    const cam = this.camera;
    cam.position.set(a.p[0] + (b.p[0] - a.p[0]) * u, a.p[1] + (b.p[1] - a.p[1]) * u, a.p[2] + (b.p[2] - a.p[2]) * u);
    this.lookAt.set(a.l[0] + (b.l[0] - a.l[0]) * u, a.l[1] + (b.l[1] - a.l[1]) * u, a.l[2] + (b.l[2] - a.l[2]) * u);
    const fov = (a.fov ?? 50) + ((b.fov ?? a.fov ?? 50) - (a.fov ?? 50)) * u;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.lookAt(this.lookAt);
    cam.updateMatrixWorld(true);
  }

  update(dt: number): void {
    for (const a of this.actors.values()) {
      const p = a.figure.group.position;
      a.input.groundY = terrainHeight(p.x, p.z) + a.hover;
      a.figure.update(dt, a.input);
      a.figure.lift.position.y += a.hover;
    }
    for (const t of this.trails) t.update(dt, this.camera.position);
  }

  dispose(): void {
    for (const fn of this.disposers) fn();
    for (const a of this.actors.values()) a.figure.dispose();
    for (const t of this.trails) t.dispose();
    this.root.traverse((o) => {
      // Figures share their baked bodies with the rest of the game; only props are freed here.
      if (o instanceof THREE.SkinnedMesh) return;
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        if (!(o instanceof THREE.Sprite)) o.geometry?.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
    this.root.removeFromParent();
  }
}

/** Plays scripts over the world, with letterbox, words, titles and a Continue that waits for the end. */
export class CutscenePlayer {
  private readonly el = document.createElement('section');
  private readonly lines = document.createElement('div');
  private readonly title = document.createElement('div');
  private readonly fade = document.createElement('div');
  private readonly next = document.createElement('button');
  private readonly progress = document.createElement('span');
  private playing = false;

  constructor(private readonly world: World, private readonly onUi?: (kind: 'select' | 'story') => void) {
    this.el.className = 'cutscene';
    this.el.hidden = true;
    this.el.setAttribute('aria-live', 'polite');
    const top = document.createElement('div'); top.className = 'cut-bar cut-bar--top';
    const bottom = document.createElement('div'); bottom.className = 'cut-bar cut-bar--bottom';
    this.lines.className = 'cut-lines';
    this.title.className = 'cut-title';
    this.fade.className = 'cut-fade';
    this.next.className = 'cut-next button-primary';
    this.next.type = 'button';
    this.next.textContent = 'Continue';
    this.next.hidden = true;
    this.progress.className = 'cut-progress';
    bottom.append(this.progress);
    this.el.append(top, bottom, this.lines, this.title, this.fade, this.next);
    document.body.append(this.el);
  }

  get active(): boolean { return this.playing; }

  play(script: Script): Promise<void> {
    if (this.playing) return Promise.resolve();
    this.playing = true;
    document.body.classList.add('is-cutscene');
    this.el.hidden = false;
    this.el.dataset.scene = script.id;
    this.next.hidden = true;
    this.lines.replaceChildren();
    this.title.replaceChildren();
    this.onUi?.('story');
    // The scene's own painted backgrounds start loading at once; the opening fade covers them.
    const backgrounds = Promise.race([this.world.preparePaintedShots(script.id), new Promise<void>((r) => window.setTimeout(r, 4000))]);
    const stage = this.world.beginCinematic();
    stage.setMood(script.mood, 0.01);
    this.world.setRegion(script.region ?? 'edge');
    const shot = new Shot(stage);
    script.build(shot);
    const fadeIn = script.fadeIn ?? 1.4;
    let last = performance.now();
    let raf = 0;
    let shownLines = new Set<number>();
    let titleShown = false;
    let ended = false;
    return new Promise((resolve) => {
      const finish = () => {
        cancelAnimationFrame(raf);
        this.next.hidden = true;
        this.fade.style.opacity = '1';
        window.setTimeout(() => {
          shot.dispose();
          this.world.releasePaintedShots();
          this.world.endCinematic();
          this.el.hidden = true;
          this.fade.style.opacity = '0';
          document.body.classList.remove('is-cutscene');
          this.playing = false;
          resolve();
        }, 650);
      };
      this.next.onclick = () => { this.onUi?.('select'); finish(); };
      const loop = () => {
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        // After the end the scene keeps breathing (actors idle, camera holds) until you move on.
        shot.t = Math.min(shot.t + dt, script.duration + 30);
        const t = Math.min(shot.t, script.duration);
        script.tick(shot, t, dt);
        shot.camera_(script.camera, t);
        shot.update(dt);
        if (script.toMood && t >= script.toMood.at && !shownLines.has(-1)) { shownLines.add(-1); stage.setMood(script.toMood.mood, script.toMood.seconds); }
        // Words.
        script.lines.forEach((line, i) => {
          if (t >= line.at && t < line.until && !shownLines.has(i)) {
            shownLines.add(i);
            const p = document.createElement('p');
            p.className = `cut-line cut-line--${line.kind ?? 'voice'}`;
            if (line.speaker) { const s = document.createElement('span'); s.className = 'cut-speaker'; s.textContent = line.speaker; p.append(s); }
            p.append(document.createTextNode(line.text));
            p.dataset.until = String(line.until);
            this.lines.replaceChildren(p);
          }
        });
        for (const p of Array.from(this.lines.children) as HTMLElement[]) if (t >= Number(p.dataset.until)) p.classList.add('leaving');
        if (script.title) {
          if (!titleShown && t >= script.title.at) {
            titleShown = true;
            const name = document.createElement('h2'); name.textContent = script.title.name;
            const sub = document.createElement('p'); sub.textContent = script.title.subtitle;
            this.title.replaceChildren(name, sub);
            this.title.classList.add('shown');
          }
          if (t >= script.title.until) this.title.classList.remove('shown');
        }
        const fadeOut = script.fadeOut ? Math.min(1, Math.max(0, (t - (script.duration - 1.2)) / 1.2)) : 0;
        this.fade.style.opacity = String(Math.max(Math.max(0, 1 - t / fadeIn), fadeOut));
        this.progress.style.transform = `scaleX(${t / script.duration})`;
        if (!ended && shot.t >= script.duration) {
          ended = true;
          this.next.hidden = false;
          this.next.focus({ preventScroll: true });
        }
        raf = requestAnimationFrame(loop);
      };
      // Held in black until the scene's backgrounds are in.
      this.fade.style.opacity = '1';
      void backgrounds.then(() => { last = performance.now(); loop(); });
    });
  }
}
