import { cp, mkdir, access, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const destination = resolve(root, 'public/mediapipe/wasm');
const model = resolve(root, 'public/models/hand_landmarker.task');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });

try {
  await access(model);
} catch {
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`Could not download hand model (${response.status}).`);
  await mkdir(dirname(model), { recursive: true });
  await writeFile(model, new Uint8Array(await response.arrayBuffer()));
}

console.log('Installed MediaPipe WASM and hand model assets.');
