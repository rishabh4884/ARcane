import { FINGERS } from '../gestures/features.ts';
import type { EngineOutput, TrackedHand } from '../gestures/GestureEngine.ts';
import type { TrackerStats } from '../tracking/HandTracker.ts';
import { HAND_CONNECTIONS } from '../tracking/types.ts';
import { el } from './dom.ts';

const W = 240;
const H = 180;
const COLORS = { left: '#6ee7ff', right: '#b69cff' } as const;

/**
 * Developer view: both tracked skeletons and finger readouts. It draws numbers and lines,
 * never the camera image. Toggle with the D key or from the Spellbook panel.
 * Left hand is cyan, right hand is violet.
 */
export class DebugOverlay {
  private readonly canvas = el('canvas', { width: W * 2, height: H * 2, 'aria-hidden': 'true' });
  private readonly wrap = el('div', { class: 'debug', hidden: true }, this.canvas);
  private readonly ctx = this.canvas.getContext('2d')!;
  private visible = false;

  constructor(root: HTMLElement) {
    root.append(this.wrap);
    this.ctx.scale(2, 2);
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement)) {
        this.setVisible(!this.visible);
      }
    });
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.wrap.hidden = !v;
  }

  draw(out: EngineOutput, stats: TrackerStats): void {
    if (!this.visible) return;
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(14,11,31,0.78)';
    g.fillRect(0, 0, W, H);

    for (const hand of out.hands) this.drawSkeleton(hand, out.aspect);

    g.font = '11px ui-monospace, Menlo, monospace';
    g.fillStyle = '#ece6ff';
    const pose = (side: 'left' | 'right') => out.hands.find((h) => h.side === side)?.pose ?? '–';
    const cameraFps = stats.cameraFps > 0 ? stats.cameraFps.toFixed(0) : '—';
    g.fillText(`cam ${cameraFps}/${stats.requestedFps} · det ${stats.fps.toFixed(0)} · ${stats.inferenceMs.toFixed(0)}ms`, 8, 14);
    g.fillText(`raw ${stats.detectedHands} · live ${out.hands.length} · age ${stats.resultAgeMs.toFixed(0)}ms`, 8, 28);
    g.fillText(`${stats.delegate} · L ${pose('left')} · R ${pose('right')}`, 8, 42);

    for (const hand of out.hands) {
      const x0 = hand.side === 'left' ? 6 : 126;
      FINGERS.forEach((f, i) => {
        const y = H - 52 + i * 12;
        g.fillStyle = 'rgba(236,230,255,0.18)';
        g.fillRect(x0 + 14, y, 90, 7);
        g.fillStyle = hand.fingerStates[f] ? '#7dffb2' : '#9a92c4';
        g.fillRect(x0 + 14, y, 90 * hand.fingers[f], 7);
        g.fillStyle = COLORS[hand.side];
        g.fillText(f[0].toUpperCase(), x0, y + 7);
      });
    }
  }

  private drawSkeleton(hand: TrackedHand, aspect: number): void {
    if (!hand.landmarks) return;
    const g = this.ctx;
    const lm = hand.landmarks;
    const px = (p: { x: number; y: number }) => [(p.x / aspect) * W, p.y * H] as const;
    g.strokeStyle = COLORS[hand.side];
    g.lineWidth = 1.5;
    g.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const [x1, y1] = px(lm[a]);
      const [x2, y2] = px(lm[b]);
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    }
    g.stroke();
    g.fillStyle = '#ffd166';
    for (const p of lm) {
      const [x, y] = px(p);
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }
}
