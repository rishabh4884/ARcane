import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandFrame, HandSide } from './types.ts';

/** Must match the installed `@mediapipe/tasks-vision` version — JS and WASM are not interchangeable. */
const MEDIAPIPE_VERSION = '0.10.35';

/** Directory URLs must end with `/` or `new URL(file, dir)` drops the last path segment. */
const abs = (path: string): string => new URL(path, document.baseURI).href;

/** Local copies (see `npm run setup:assets`) are tried first, then a version-matched CDN. */
const SOURCES = [
  { wasm: abs('mediapipe/wasm/'), model: abs('models/hand_landmarker.task') },
  {
    wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm/`,
    model: abs('models/hand_landmarker.task'),
  },
  {
    wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm/`,
    model:
      'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
];

async function loadModelBuffer(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model fetch failed (${res.status}) from ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * MediaPipe's WASM glue calls a global `dbg()`. Browsers expose any `<input id="dbg">`
 * as `window.dbg`, which is an element — not a function — and the model load crashes.
 */
function ensureMediaPipeDbg(): void {
  const w = window as Window & { dbg?: unknown };
  if (typeof w.dbg !== 'function') {
    w.dbg = (...args: unknown[]) => console.debug(...args);
  }
}

export interface TrackerStats {
  /** Smoothed detection rate, frames per second. */
  fps: number;
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

/**
 * Opens the webcam and turns it into a stream of HandFrames.
 *
 * The camera image is NEVER drawn anywhere: the <video> element is kept invisible and
 * off-screen purely so the browser decodes frames for MediaPipe to read. Nothing is
 * recorded, stored or uploaded; only 21 numeric landmarks leave this class.
 */
export class HandTracker {
  onFrame: (hands: HandFrame[], stats: TrackerStats) => void = () => {};

  private readonly video: VideoWithFrameCallback = document.createElement('video');
  private stream: MediaStream | null = null;
  private landmarker: HandLandmarker | null = null;
  private running = false;
  private lastVideoTime = -1;
  private lastTimestamp = 0;
  private fps = 0;

  async start(): Promise<void> {
    if (this.running) return;
    await this.openCamera();
    try {
      await this.loadModel();
    } catch (err) {
      this.stopCamera();
      throw err;
    }
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    this.landmarker?.close();
    this.landmarker = null;
    this.stopCamera();
  }

  private async openCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new DOMException('Camera access needs a secure (https) page.', 'SecurityError');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 60, min: 24 },
      },
    });
    const v = this.video;
    v.srcObject = this.stream;
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('aria-hidden', 'true');
    Object.assign(v.style, {
      position: 'fixed',
      width: '2px',
      height: '2px',
      opacity: '0',
      pointerEvents: 'none',
      left: '0',
      top: '0',
    });
    document.body.appendChild(v);
    await v.play();
  }

  private async loadModel(): Promise<void> {
    ensureMediaPipeDbg();
    let lastError: unknown;
    for (const source of SOURCES) {
      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          const vision = await FilesetResolver.forVisionTasks(source.wasm);
          const modelAssetBuffer = await loadModelBuffer(source.model);
          this.landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetBuffer, delegate },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          return;
        } catch (err) {
          lastError = err;
          console.warn(`[arcane] hand model failed (${delegate} @ ${source.wasm})`, err);
        }
      }
    }
    const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
    throw new Error(`Could not load the hand-tracking model (${detail}).`, { cause: lastError });
  }

  private schedule(): void {
    if (!this.running) return;
    if (this.video.requestVideoFrameCallback) this.video.requestVideoFrameCallback(this.tick);
    else requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    if (!this.running || !this.landmarker) return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      // MediaPipe requires strictly increasing timestamps.
      const now = Math.max(performance.now(), this.lastTimestamp + 1);
      const result = this.landmarker.detectForVideo(v, now);
      const dt = now - this.lastTimestamp;
      this.lastTimestamp = now;
      if (dt > 0 && dt < 500) this.fps += (1000 / dt - this.fps) * 0.1;

      const aspect = v.videoWidth / v.videoHeight || 4 / 3;
      const hands: HandFrame[] = [];
      const n = result.landmarks?.length ?? 0;
      for (let i = 0; i < n; i++) {
        const raw = result.landmarks[i];
        if (!raw || raw.length !== 21) continue;
        const handed = result.handedness?.[i]?.[0];
        hands.push({
          time: now,
          aspect,
          confidence: handed?.score ?? 1,
          side: parseSide(handed?.categoryName),
          // Mirror x so the world behaves like a mirror, then put x/y/z on one scale.
          landmarks: raw.map((p) => ({ x: (1 - p.x) * aspect, y: p.y, z: p.z * aspect })),
        });
      }
      this.onFrame(hands, { fps: this.fps });
    }
    this.schedule();
  };

  private stopCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.video.remove();
  }
}

/**
 * MediaPipe labels handedness on the assumption that the image is already mirrored (a selfie
 * view). We hand it the raw, un-mirrored camera frame, so its "Left" is the player's RIGHT
 * hand and vice versa. Swap here so `side` always means the player's own hand, as seen in
 * the mirrored world. (MediaPipe docs: "if it is not the case, please swap the handedness".)
 */
function parseSide(label: string | undefined): HandSide | undefined {
  const s = label?.toLowerCase();
  if (s === 'left') return 'right';
  if (s === 'right') return 'left';
  return undefined;
}
