/// <reference lib="webworker" />
import { DESIGN_REGISTRY } from '../characters/registry.ts';
import { Body } from './Body.ts';
import { serializeBaked, transferables } from './bakeData.ts';

/** Builds and bakes designs off the main thread, so the loading screen never stalls. */
self.onmessage = (e: MessageEvent<{ key: string }>) => {
  const { key } = e.data;
  try {
    const design = DESIGN_REGISTRY[key];
    const body = new Body();
    design.build(body);
    const data = serializeBaked(body.bake());
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ key, data }, transferables(data));
  } catch (error) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ key, error: String(error) });
  }
};
