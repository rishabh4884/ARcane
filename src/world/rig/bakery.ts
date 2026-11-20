import workerUrl from './bake.worker.ts?worker&url';
import { DESIGN_REGISTRY } from '../characters/registry.ts';
import { deserializeBaked, type BakedData } from './bakeData.ts';
import { isBaked, seedBaked } from './Character.ts';

/**
 * THE BAKERY
 * ──────────
 * Sculpting, draping and baking every body is real work (seconds, for the larger ones), so it is
 * done in parallel worker threads behind the loading screen, and in a released build each result is
 * kept in IndexedDB: the next visit loads bodies instead of building them. The cache is keyed by the
 * worker's own hashed file name, which changes whenever any body's code does.
 */

const USE_CACHE = import.meta.env.PROD && typeof indexedDB !== 'undefined';
const VERSION = workerUrl;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('arcane-bodies', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('bodies');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

function dbGet(db: IDBDatabase, key: string): Promise<BakedData | null> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction('bodies').objectStore('bodies').get(`${VERSION}|${key}`);
      req.onsuccess = () => resolve((req.result as BakedData) ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

function dbPut(db: IDBDatabase, key: string, data: BakedData): void {
  try { db.transaction('bodies', 'readwrite').objectStore('bodies').put(data, `${VERSION}|${key}`); } catch { /* full or blocked: build next time */ }
}

/** Forget bodies baked by older builds. */
function dbPrune(db: IDBDatabase): void {
  try {
    const store = db.transaction('bodies', 'readwrite').objectStore('bodies');
    const req = store.getAllKeys();
    req.onsuccess = () => { for (const k of req.result) if (!String(k).startsWith(`${VERSION}|`)) store.delete(k); };
  } catch { /* ignore */ }
}

/**
 * Make sure every body is baked: from the cache when it can, otherwise in a pool of workers.
 * Falls back to baking on this thread (lazily, on first use) where workers are unavailable.
 */
export async function prepareBodies(onProgress: (fraction: number, label: string) => void): Promise<void> {
  const keys = Object.keys(DESIGN_REGISTRY).filter((k) => !isBaked(DESIGN_REGISTRY[k]));
  if (!keys.length) return;
  let done = 0;
  const finished = (key: string) => { done++; onProgress(done / keys.length, `Waking ${DESIGN_REGISTRY[key].name}…`); };
  const db = USE_CACHE ? await openDb() : null;
  const missing: string[] = [];
  if (db) {
    dbPrune(db);
    for (const key of keys) {
      const data = await dbGet(db, key);
      if (data) { seedBaked(DESIGN_REGISTRY[key], deserializeBaked(data)); finished(key); } else missing.push(key);
    }
  } else missing.push(...keys);
  if (!missing.length || typeof Worker === 'undefined') return;
  // Largest first, so the long bakes start while the small ones fill the other threads.
  const heavy = ['warden', 'king', 'hands', 'stag', 'gorrik', 'goblin', 'matron'];
  missing.sort((a, b) => (heavy.indexOf(a) < 0 ? 99 : heavy.indexOf(a)) - (heavy.indexOf(b) < 0 ? 99 : heavy.indexOf(b)));
  const threads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1, missing.length));
  await new Promise<void>((resolve) => {
    let next = 0, active = 0;
    const workers: Worker[] = [];
    const feed = (w: Worker) => {
      if (next >= missing.length) { w.terminate(); if (--active === 0) resolve(); return; }
      w.postMessage({ key: missing[next++] });
    };
    for (let i = 0; i < threads; i++) {
      let w: Worker;
      try { w = new Worker(workerUrl, { type: 'module' }); } catch { continue; }
      active++;
      workers.push(w);
      w.onmessage = (e: MessageEvent<{ key: string; data?: BakedData; error?: string }>) => {
        const { key, data, error } = e.data;
        if (data) {
          seedBaked(DESIGN_REGISTRY[key], deserializeBaked(data));
          if (db) dbPut(db, key, data);
        } else console.warn(`[arcane] could not bake ${key} in a worker`, error);
        finished(key);
        feed(w);
      };
      w.onerror = (err) => { console.warn('[arcane] bake worker failed', err); w.terminate(); if (--active === 0) resolve(); };
      feed(w);
    }
    if (!active) resolve();
  });
}
