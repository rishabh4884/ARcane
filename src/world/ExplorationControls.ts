import * as THREE from 'three';
import { EYE_HEIGHT, GUARDIAN, moveOnGround, SPAWN, terrainHeight, type Obstacle } from './spatial.ts';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE']);

export function worldInputBlocked(): boolean {
  return document.hidden || document.body.classList.contains('is-intro')
    || document.querySelector<HTMLElement>('#spellbook')?.hidden === false;
}

/** Deliberate drag-to-look leaves the mouse and both hands free for spell casting. */
export class ExplorationControls {
  private readonly events = new AbortController();
  private readonly keys = new Set<string>();
  private readonly velocity = new THREE.Vector3();
  private readonly rotation = new THREE.Euler(0, 0, 0, 'YXZ');
  private pointer: { id: number; x: number; y: number } | null = null;
  private yaw = 0;
  private pitch = 0.045;
  private hudTime = 0;
  private readonly root = document.createElement('section');
  private readonly location = document.createElement('span');
  private readonly heading = document.createElement('span');
  private readonly distance = document.createElement('span');
  private readonly help = document.createElement('div');
  private readonly reticle = document.createElement('span');
  private readonly movementPad = document.createElement('div');
  private disposed = false;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly canvas: HTMLCanvasElement, private readonly obstacles: readonly Obstacle[]) {
    this.reset();
    const signal = this.events.signal;
    canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Explorable forest. WASD or arrow keys to walk, drag to look, Q and E to turn, 1 to 7 to cast spells.');
    canvas.addEventListener('pointerdown', this.pointerDown, { signal });
    canvas.addEventListener('pointermove', this.pointerMove, { signal });
    canvas.addEventListener('pointerup', this.pointerEnd, { signal });
    canvas.addEventListener('pointercancel', this.pointerEnd, { signal });
    canvas.addEventListener('lostpointercapture', this.pointerEnd, { signal });
    window.addEventListener('keydown', this.keyDown, { signal });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), { signal });
    window.addEventListener('blur', this.clear, { signal });
    document.addEventListener('visibilitychange', this.clear, { signal });
    this.buildHud();
  }

  private buildHud(): void {
    this.root.className = 'exploration';
    this.root.setAttribute('aria-label', 'World exploration');
    const title = document.createElement('div'); title.className = 'exploration-location';
    const eyebrow = document.createElement('span'); eyebrow.className = 'exploration-eyebrow'; eyebrow.textContent = 'THE LIVING WOOD';
    this.location.className = 'exploration-name'; this.location.textContent = 'Verdant Reach';
    title.append(eyebrow, this.location);
    const compass = document.createElement('div'); compass.className = 'exploration-compass';
    this.heading.textContent = 'N · 000°'; this.distance.textContent = 'Guardian · 29 m';
    compass.append(this.heading, this.distance);
    const actions = document.createElement('div'); actions.className = 'exploration-actions';
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Return to glade';
    reset.addEventListener('click', () => this.reset(), { signal: this.events.signal });
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = 'Controls';
    toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'exploration-help');
    this.help.id = 'exploration-help'; this.help.className = 'exploration-help'; this.help.hidden = true;
    this.help.innerHTML = '<strong>A little room to wander.</strong><p><kbd>W A S D</kbd> / arrows · walk<br><kbd>Shift</kbd> · sprint<br>Drag the world · look around<br><kbd>Q</kbd> / <kbd>E</kbd> · turn<br><kbd>1–7</kbd> · try spells at the crosshair<br><kbd>R</kbd> · return to the glade</p><p>Use Guide to enable your camera and cast with your hands. On touch screens, hold a direction and drag the world to look.</p>';
    toggle.addEventListener('click', () => {
      this.help.hidden = !this.help.hidden;
      toggle.setAttribute('aria-expanded', String(!this.help.hidden));
    }, { signal: this.events.signal });
    actions.append(reset, toggle);
    const hint = document.createElement('p'); hint.className = 'exploration-hint';
    hint.innerHTML = '<span class="desktop-hint"><kbd>W A S D</kbd> wander <i>·</i> drag to look <i>·</i> <kbd>1–7</kbd> cast</span><span class="touch-hint">Hold arrows to walk · drag the forest to look</span>';
    this.reticle.className = 'world-reticle'; this.reticle.setAttribute('aria-hidden', 'true');
    this.movementPad.className = 'exploration-pad'; this.movementPad.setAttribute('aria-label', 'Walk');
    for (const [code, symbol, label] of [['KeyW', '↑', 'Walk forward'], ['KeyA', '←', 'Walk left'], ['KeyS', '↓', 'Walk backward'], ['KeyD', '→', 'Walk right']]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = symbol;
      button.dataset.direction = code; button.setAttribute('aria-label', label);
      button.addEventListener('pointerdown', (event) => {
        if (worldInputBlocked()) return;
        event.preventDefault(); button.setPointerCapture(event.pointerId); this.keys.add(code);
      }, { signal: this.events.signal });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => this.keys.delete(code), { signal: this.events.signal });
      this.movementPad.append(button);
    }
    this.root.append(title, compass, actions, hint, this.help, this.reticle, this.movementPad);
    document.querySelector('#hud')?.append(this.root);
  }

  private keyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (worldInputBlocked() || (target instanceof Element && target.closest('input, select, textarea, button, [contenteditable="true"]')) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (MOVE_KEYS.has(event.code)) { event.preventDefault(); this.keys.add(event.code); }
    if (event.code === 'KeyR' && !event.repeat) this.reset();
    if (event.code === 'Escape') this.clear();
  };

  private pointerDown = (event: PointerEvent): void => {
    if (worldInputBlocked() || event.button !== 0 || this.pointer) return;
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('is-looking');
  };
  private pointerMove = (event: PointerEvent): void => {
    if (!this.pointer || this.pointer.id !== event.pointerId) return;
    if (worldInputBlocked()) { this.clear(); return; }
    this.yaw -= (event.clientX - this.pointer.x) * 0.0032;
    this.pitch = THREE.MathUtils.clamp(this.pitch - (event.clientY - this.pointer.y) * 0.0027, -0.9, 1.05);
    this.pointer.x = event.clientX; this.pointer.y = event.clientY;
  };
  private pointerEnd = (event: PointerEvent): void => { if (this.pointer?.id === event.pointerId) this.clearPointer(); };
  private clearPointer(): void {
    const pointer = this.pointer; this.pointer = null;
    if (pointer && this.canvas.hasPointerCapture(pointer.id)) this.canvas.releasePointerCapture(pointer.id);
    this.canvas.classList.remove('is-looking');
  }
  private clear = (): void => { this.keys.clear(); this.velocity.set(0, 0, 0); this.clearPointer(); };

  reset(): void {
    this.clear();
    this.yaw = 0; this.pitch = 0.045;
    this.camera.position.set(SPAWN.x, terrainHeight(SPAWN.x, SPAWN.z) + EYE_HEIGHT, SPAWN.z);
    this.applyRotation();
  }

  private applyRotation(): void {
    this.rotation.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.rotation);
    this.camera.updateMatrixWorld(true);
  }

  update(dt: number): void {
    if (worldInputBlocked()) { this.clear(); return; }
    dt = Math.min(Math.max(dt, 0), 0.05);
    this.yaw += ((this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyE') ? 1 : 0)) * dt * 1.3;
    const x = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const z = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
    const length = Math.max(1, Math.hypot(x, z));
    const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 8.5 : 4.5;
    const tx = (x * Math.cos(this.yaw) + z * Math.sin(this.yaw)) / length * speed;
    const tz = (-x * Math.sin(this.yaw) + z * Math.cos(this.yaw)) / length * speed;
    const decay = Math.exp(-12 * dt);
    // Integrate exponential velocity exactly, rather than making distance FPS-dependent.
    const dx = tx * dt + (this.velocity.x - tx) * (1 - decay) / 12;
    const dz = tz * dt + (this.velocity.z - tz) * (1 - decay) / 12;
    this.velocity.x = tx + (this.velocity.x - tx) * decay;
    this.velocity.z = tz + (this.velocity.z - tz) * decay;
    moveOnGround(this.camera.position, dx, dz, this.obstacles);
    this.applyRotation();
    this.hudTime += dt;
    if (this.hudTime > 0.15) {
      this.hudTime = 0;
      const degrees = ((-this.yaw * 180 / Math.PI) % 360 + 360) % 360;
      const heading = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
      this.heading.textContent = `${heading} · ${String(Math.round(degrees) % 360).padStart(3, '0')}°`;
      const distance = Math.hypot(this.camera.position.x - GUARDIAN.x, this.camera.position.z - GUARDIAN.z);
      this.distance.textContent = `Guardian · ${Math.round(distance)} m`;
      this.location.textContent = Math.hypot(this.camera.position.x - 25, this.camera.position.z + 13) < 16 ? 'Stillwater Spring'
        : Math.hypot(this.camera.position.x + 25, this.camera.position.z + 30) < 13 ? 'The Old Gate' : distance < 16 ? 'Guardian’s Glade' : 'Verdant Reach';
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.clear(); this.events.abort(); this.root.remove();
  }
}
