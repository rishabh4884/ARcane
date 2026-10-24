import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

type InitMessage = {
  type: 'init';
  wasmRoots: string[];
  modelBuffer: ArrayBuffer;
};

type FrameMessage = {
  type: 'frame';
  frame: ImageBitmap;
  timestamp: number;
  aspect: number;
};

type IncomingMessage = InitMessage | FrameMessage | { type: 'close' };

interface WorkerScope {
  onmessage: ((event: MessageEvent<IncomingMessage>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
  dbg?: (...args: unknown[]) => void;
}

const scope = globalThis as unknown as WorkerScope;
let landmarker: HandLandmarker | null = null;

scope.onmessage = async ({ data }) => {
  if (data.type === 'close') {
    landmarker?.close();
    landmarker = null;
    scope.close();
    return;
  }

  if (data.type === 'init') {
    await initialize(data);
    return;
  }

  if (data.type === 'frame') {
    if (!landmarker) {
      data.frame.close();
      scope.postMessage({ type: 'error', message: 'Hand model is not ready.' });
      return;
    }
    const started = performance.now();
    try {
      const result = landmarker.detectForVideo(data.frame, data.timestamp);
      scope.postMessage({
        type: 'result',
        timestamp: data.timestamp,
        aspect: data.aspect,
        inferenceMs: performance.now() - started,
        landmarks: result.landmarks.map((hand) => hand.map(({ x, y, z }) => ({ x, y, z }))),
        handedness: result.handedness.map((categories) => categories[0]
          ? { categoryName: categories[0].categoryName, score: categories[0].score }
          : null),
      });
    } catch (error) {
      scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      data.frame.close();
    }
  }
};

async function initialize({ wasmRoots, modelBuffer }: InitMessage): Promise<void> {
  scope.dbg ??= (...args) => console.debug(...args);
  let lastError: unknown;
  for (const wasmRoot of wasmRoots) {
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        // Module workers cannot call importScripts. MediaPipe 0.10.35 has a dedicated
        // module-WASM loader path for this use case.
        const vision = await FilesetResolver.forVisionTasks(wasmRoot, true);
        const canvas = typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(1, 1)
          : undefined;
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetBuffer: new Uint8Array(modelBuffer), delegate },
          ...(canvas ? { canvas } : {}),
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        scope.postMessage({ type: 'ready', delegate, wasmRoot });
        return;
      } catch (error) {
        lastError = error;
        landmarker?.close();
        landmarker = null;
      }
    }
  }
  scope.postMessage({
    type: 'error',
    fatal: true,
    message: lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown worker error'),
  });
}
