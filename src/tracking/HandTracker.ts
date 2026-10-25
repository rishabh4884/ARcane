import type { HandFrame } from './types.ts';

/** Must match the installed `@mediapipe/tasks-vision` version. */
const MEDIAPIPE_VERSION = '0.10.35';

/** Directory URLs must end with `/` or `new URL(file, dir)` drops the last path segment. */
const abs = (path: string): string => new URL(path, document.baseURI).href;

const WASM_ROOTS = [
  abs('mediapipe/wasm/'),
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm/`,
];
const MODEL_URLS = [
  abs('models/hand_landmarker.task'),
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
];
const LATE_RESULT_MS = 180;

type Delegate = 'GPU' | 'CPU' | 'main-thread' | 'loading';
interface WorkerReady { type: 'ready'; delegate: 'GPU' | 'CPU'; wasmRoot: string }
interface WorkerResult {
  type: 'result';
  timestamp: number;
  aspect: number;
  inferenceMs: number;
  landmarks: Array<Array<{ x: number; y: number; z: number }>>;
  handedness: Array<{ categoryName: string; score: number } | null>;
}
interface WorkerError { type: 'error'; message: string; fatal?: boolean }
type WorkerMessage = WorkerReady | WorkerResult | WorkerError;

export interface TrackerStats {
  /** Measured rate of completed MediaPipe inferences, not render FPS. */
  fps: number;
  /** Current camera-track rate reported by the browser. */
  cameraFps: number;
  /** User-selected camera cap (30 or 60). */
  requestedFps: 30 | 60;
  /** Raw detections before identity binding. */
  detectedHands: number;
  /** Wall-clock time for the latest inference (worker or compatibility fallback). */
  inferenceMs: number;
  /** Age of the captured video frame when its result was consumed. */
  resultAgeMs: number;
  /** Slow results are reported for diagnosis, not converted into missing hands. */
  lateResults: number;
  /** Captured-frame timestamp used by MediaPipe and the gesture engine. */
  timestamp: number;
  /** Selected MediaPipe delegate after initialization. */
  delegate: Delegate;
}

type FrameMetadata = { expectedDisplayTime: number; mediaTime: number };
type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: FrameMetadata) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/**
 * Direct MediaPipe video inference is the default, matching the original camera path.
 * The experimental worker can be compared explicitly with ?tracking=worker; it is not
 * enabled just because a browser supports workers. Neither path suppresses valid hands
 * solely because inference was slow.
 */
export class HandTracker {
  onFrame: (hands: HandFrame[], stats: TrackerStats) => void = () => {};

  private readonly video: VideoWithFrameCallback = document.createElement('video');
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private workerReady: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private running = false;
  private busy = false;
  private raf = 0;
  private videoFrameCallback = 0;
  private lastVideoTime = -1;
  private lastTimestamp = 0;
  private fps = 0;
  private inferenceMs = 0;
  private resultAgeMs = 0;
  private lateResults = 0;
  private delegate: TrackerStats['delegate'] = 'loading';
  private modelBuffer: Uint8Array | null = null;
  private landmarker: import('@mediapipe/tasks-vision').HandLandmarker | null = null;
  private requestedFps: 30 | 60;
  private frameRateApply: Promise<void> = Promise.resolve();

  constructor(requestedFps: 30 | 60 = 30) {
    this.requestedFps = requestedFps;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.lastVideoTime = -1;
    this.lastTimestamp = 0;
    this.lastDeliveredTimestamp = 0;
    this.fps = 0;
    this.inferenceMs = 0;
    this.resultAgeMs = 0;
    this.lateResults = 0;
    this.delegate = 'loading';
    await this.openCamera();
    try {
      await this.loadModel();
    } catch (error) {
      this.stopCamera();
      this.closeInference();
      throw error;
    }
    this.running = true;
    this.schedule();
  }

  /** Change the requested camera cap without tearing down MediaPipe or the active tracks. */
  setFrameRate(fps: 30 | 60): Promise<void> {
    this.requestedFps = fps;
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return Promise.resolve();
    this.frameRateApply = this.frameRateApply
      .catch(() => undefined)
      .then(() => track.applyConstraints({ frameRate: { ideal: fps, max: fps } }));
    return this.frameRateApply;
  }

  stop(): void {
    this.running = false;
    this.busy = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.videoFrameCallback) this.video.cancelVideoFrameCallback?.(this.videoFrameCallback);
    this.closeInference();
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
        width: { ideal: 480, max: 640 },
        height: { ideal: 360, max: 480 },
        frameRate: { ideal: this.requestedFps, max: this.requestedFps },
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
    let model: Uint8Array | null = null;
    let lastError: unknown;
    for (const url of MODEL_URLS) {
      try {
        model = await loadModelBuffer(url);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!model) {
      const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
      throw new Error(`Could not fetch the hand model (${detail}).`, { cause: lastError });
    }

    this.modelBuffer = model;
    if (new URLSearchParams(window.location.search).get('tracking') !== 'worker') {
      await this.initializeMainThread(model);
      return;
    }
    try {
      if (typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') {
        throw new Error('This browser cannot transfer camera frames to a worker.');
      }
      await this.initializeWorker(model);
    } catch (error) {
      if (!this.stream) throw error;
      console.warn('[arcane] worker inference unavailable; using main-thread fallback.', error);
      this.closeInference();
      await this.initializeMainThread(model);
    }
  }

  private async initializeWorker(model: Uint8Array): Promise<void> {
    const worker = new Worker(new URL('./hand-landmarker.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    this.workerReady = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.handleWorkerMessage(event.data);
    worker.onerror = (event) => {
      const error = new Error(event.message || 'The hand-tracking worker stopped unexpectedly.');
      this.readyReject?.(error);
      this.readyReject = null;
      if (this.worker === worker && this.running) {
        this.worker = null;
        worker.terminate();
        this.busy = false;
        void this.initializeMainThread(this.modelBuffer ?? model).then(() => this.schedule()).catch((fallbackError: unknown) => {
          console.error('[arcane] main-thread inference fallback failed', fallbackError);
          this.running = false;
        });
      }
    };
    const modelBuffer = model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength);
    worker.postMessage({ type: 'init', wasmRoots: WASM_ROOTS, modelBuffer }, [modelBuffer]);
    try {
      await this.workerReady;
    } finally {
      this.workerReady = null;
      this.readyResolve = null;
      this.readyReject = null;
    }
  }

  private async initializeMainThread(model: Uint8Array): Promise<void> {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const target = window as Window & { dbg?: unknown };
    if (typeof target.dbg !== 'function') target.dbg = (...args: unknown[]) => console.debug(...args);
    let lastError: unknown;
    for (const wasmRoot of WASM_ROOTS) {
      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          const vision = await FilesetResolver.forVisionTasks(wasmRoot);
          this.landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetBuffer: model, delegate },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          this.delegate = 'main-thread';
          return;
        } catch (error) {
          lastError = error;
          this.landmarker?.close();
          this.landmarker = null;
        }
      }
    }
    throw new Error(`Could not initialize main-thread hand tracking (${String(lastError)}).`, { cause: lastError });
  }

  private schedule(): void {
    if (!this.running || this.busy) return;
    if (this.video.requestVideoFrameCallback) {
      this.videoFrameCallback = this.video.requestVideoFrameCallback((_now, metadata) => {
        this.videoFrameCallback = 0;
        this.tick(metadata.expectedDisplayTime, metadata.mediaTime);
      });
    } else {
      this.raf = requestAnimationFrame((now) => {
        this.raf = 0;
        this.tick(now, this.video.currentTime);
      });
    }
  }

  private tick(captureTime: number, videoTime: number): void {
    if (!this.running || this.busy || (!this.worker && !this.landmarker) || this.video.readyState < 2) {
      this.schedule();
      return;
    }
    if (videoTime === this.lastVideoTime) {
      this.schedule();
      return;
    }
    this.lastVideoTime = videoTime;
    this.busy = true;
    const timestamp = Math.max(captureTime, this.lastTimestamp + 0.01);
    this.lastTimestamp = timestamp;
    const aspect = this.video.videoWidth / this.video.videoHeight || 4 / 3;

    if (this.landmarker) {
      const started = performance.now();
      try {
        const result = this.landmarker.detectForVideo(this.video, timestamp);
        this.deliverResult(
          timestamp,
          aspect,
          performance.now() - started,
          result.landmarks.map((hand) => hand.map(({ x, y, z }) => ({ x, y, z }))),
          result.handedness.map((categories) => categories[0]
            ? { categoryName: categories[0].categoryName, score: categories[0].score }
            : null),
        );
        this.schedule();
      } catch (error) {
        console.warn('[arcane] main-thread inference failed', error);
        this.busy = false;
        this.schedule();
      }
      return;
    }

    void createImageBitmap(this.video).then((frame) => {
      if (!this.running || !this.worker) {
        frame.close();
        this.busy = false;
        return;
      }
      this.worker.postMessage({
        type: 'frame',
        frame,
        timestamp,
        aspect,
      }, [frame]);
    }).catch((error: unknown) => {
      this.busy = false;
      console.warn('[arcane] could not transfer camera frame to worker', error);
      this.schedule();
    });
  }

  private handleWorkerMessage(message: WorkerMessage): void {
    if (message.type === 'ready') {
      this.delegate = message.delegate;
      this.readyResolve?.();
      return;
    }
    if (message.type === 'error') {
      if (message.fatal) {
        this.readyReject?.(new Error(`Could not initialize MediaPipe in a worker: ${message.message}`));
        return;
      }
      console.warn('[arcane] MediaPipe skipped a frame', message.message);
      this.busy = false;
      this.schedule();
      return;
    }

    this.deliverResult(
      message.timestamp,
      message.aspect,
      message.inferenceMs,
      message.landmarks,
      message.handedness,
    );
    this.schedule();
  }

  private deliverResult(
    timestamp: number,
    aspect: number,
    inferenceMs: number,
    detections: Array<Array<{ x: number; y: number; z: number }>>,
    handedness: Array<{ categoryName: string; score: number } | null>,
  ): void {
    this.busy = false;
    const ageMs = Math.max(0, performance.now() - timestamp);
    this.resultAgeMs = ageMs;
    if (ageMs > LATE_RESULT_MS) this.lateResults += 1;
    const elapsed = timestamp - this.lastDeliveredTimestamp;
    this.lastDeliveredTimestamp = timestamp;
    if (elapsed >= 1000) {
      this.fps = 0;
    } else if (elapsed > 0) {
      const sampleFps = 1000 / elapsed;
      this.fps = this.fps === 0 ? sampleFps : this.fps + (sampleFps - this.fps) * 0.18;
    }
    this.inferenceMs = inferenceMs;
    const hands: HandFrame[] = detections.flatMap((landmarks, index) => {
      if (landmarks.length !== 21) return [];
      const handed = handedness[index];
      return [{
        time: timestamp,
        aspect,
        confidence: handed?.score ?? 1,
        side: parseSide(handed?.categoryName),
        // Preserve the previous mirror coordinate system for gesture thresholds.
        landmarks: landmarks.map((point) => ({
          x: (1 - point.x) * aspect,
          y: point.y,
          z: point.z * aspect,
        })),
      }];
    });
    const track = this.stream?.getVideoTracks()[0];
    this.onFrame(hands, {
      fps: this.fps,
      cameraFps: track?.getSettings().frameRate ?? 0,
      requestedFps: this.requestedFps,
      detectedHands: detections.length,
      inferenceMs,
      resultAgeMs: ageMs,
      lateResults: this.lateResults,
      timestamp,
      delegate: this.delegate,
    });
  }

  private closeInference(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'close' });
      } catch {
        // terminate below is authoritative if the worker is already shutting down
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.landmarker?.close();
    this.landmarker = null;
    this.readyReject?.(new Error('Hand tracking stopped before initialization completed.'));
    this.readyReject = null;
    this.readyResolve = null;
  }

  private stopCamera(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.video.remove();
  }

  private lastDeliveredTimestamp = 0;
}

async function loadModelBuffer(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Model fetch failed (${response.status}) from ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** MediaPipe labels handedness assuming the camera image is already mirrored. */
function parseSide(label: string | undefined): HandFrame['side'] {
  const side = label?.toLowerCase();
  if (side === 'left') return 'right';
  if (side === 'right') return 'left';
  return undefined;
}
