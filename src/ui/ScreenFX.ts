import * as THREE from 'three';
import type { ScreenFeedback } from '../world/vfx.ts';

const css = (color: THREE.ColorRepresentation): string => `#${new THREE.Color(color).getHexString()}`;

/**
 * Full-screen feedback drawn in the DOM above the canvas: lightning flashes, healing and ward
 * glows, the red sting of a hit, and a steady ward vignette while Aegis holds. Pointer-transparent
 * and cheap; the 3D world never waits on it.
 */
export class ScreenFX {
  private readonly root = document.createElement('div');
  private readonly flashLayer = document.createElement('div');
  private readonly edgeLayer = document.createElement('div');
  private readonly hurtLayer = document.createElement('div');
  private readonly wardLayer = document.createElement('div');
  private ward = 0;

  constructor(container: HTMLElement) {
    this.root.className = 'screen-fx';
    this.root.setAttribute('aria-hidden', 'true');
    this.flashLayer.className = 'screen-fx-flash';
    this.edgeLayer.className = 'screen-fx-edge';
    this.hurtLayer.className = 'screen-fx-hurt';
    this.wardLayer.className = 'screen-fx-ward';
    this.root.append(this.wardLayer, this.edgeLayer, this.hurtLayer, this.flashLayer);
    container.append(this.root);
  }

  /** Bind to the world's ScreenFeedback interface (shake is handled by the camera). */
  feedback(shake: (amount: number) => void): ScreenFeedback {
    return {
      flash: (color, strength, mode = 'full') => (mode === 'edge' ? this.edge(color, strength) : this.flash(color, strength)),
      shake,
    };
  }

  flash(color: THREE.ColorRepresentation, strength: number): void {
    this.pulse(this.flashLayer, color, Math.min(0.75, strength), 420);
  }

  edge(color: THREE.ColorRepresentation, strength: number): void {
    this.pulse(this.edgeLayer, color, Math.min(0.9, strength * 2.6), 900);
  }

  hurt(strength = 1): void {
    this.pulse(this.hurtLayer, '#b3261e', Math.min(0.85, 0.45 + strength * 0.4), 650);
  }

  /** 0..1 strength of the ward vignette (Aegis shield remaining). */
  setWard(level: number, color: THREE.ColorRepresentation = '#c6d9ff'): void {
    const next = Math.round(Math.max(0, Math.min(1, level)) * 100) / 100;
    if (next === this.ward) return;
    this.ward = next;
    this.wardLayer.style.setProperty('--fx-color', css(color));
    this.wardLayer.style.opacity = String(next * 0.85);
  }

  dispose(): void {
    this.root.remove();
  }

  private pulse(layer: HTMLElement, color: THREE.ColorRepresentation, strength: number, ms: number): void {
    layer.style.setProperty('--fx-color', css(color));
    layer.style.transition = 'none';
    layer.style.opacity = String(strength);
    // Force the start state before animating back to transparent.
    void layer.offsetWidth;
    layer.style.transition = `opacity ${ms}ms cubic-bezier(.2,.7,.3,1)`;
    layer.style.opacity = '0';
  }
}
