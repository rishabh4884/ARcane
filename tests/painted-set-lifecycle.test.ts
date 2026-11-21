import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PaintedSet } from '../src/world/PaintedSet.ts';

const meta = { position: [0, 2, 17], lookAt: [0, 2, -12], fov: 64, aspect: 2, near: 0.1, far: 400 };
function harness() {
  const texture = () => { const t = new THREE.Texture(); vi.spyOn(t, 'dispose'); return t; };
  const gameplay = { name: 'edge', paint: texture(), depth: texture(), eye: new THREE.Vector3(...meta.position), vp: new THREE.Matrix4(), camera: { ...meta, name: 'edge' } };
  const set = Reflect.construct(PaintedSet, ['edge', gameplay]) as PaintedSet;
  const state = set as unknown as { manifest: {name:string;script:string}[]; shots: Map<string, unknown>; slots: {tPaintA:{value:THREE.Texture};tPaintB:{value:THREE.Texture}} };
  state.manifest = [{name:'intro-0', script:'intro'}, {name:'ending-0',script:'ending'}];
  const pending = new Map<string, {resolve: (t: THREE.Texture) => void; reject: (e: Error) => void}>();
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation((url) => new Promise((resolve, reject) => pending.set(url, {resolve, reject})));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => meta })));
  const finish = (shot: string) => {
    const paint = texture(), depth = texture();
    pending.get(`/art/sets/edge/shots/${shot}/paint.webp`)!.resolve(paint);
    pending.get(`/art/sets/edge/shots/${shot}/depth.png`)!.resolve(depth);
    return {paint, depth};
  };
  return {set,state,pending,finish,texture,gameplay};
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('painted shot ownership', () => {
  it('coalesces requests and disposes paintings that finish after a scene is released', async () => {
    const h = harness(), a = h.set.prepareShots('intro'), b = h.set.prepareShots('intro');
    expect(h.pending.size).toBe(2);
    h.set.releaseShots();
    const textures = h.finish('intro-0'); await Promise.all([a,b]);
    expect(h.state.shots.size).toBe(0);
    expect(textures.paint.dispose).toHaveBeenCalledOnce();
    expect(textures.depth.dispose).toHaveBeenCalledOnce();
    expect(h.state.slots.tPaintA.value).toBe(h.gameplay.paint);
    h.set.dispose();
  });
  it('does not let an earlier scene overwrite a newer scene', async () => {
    const h = harness(), intro = h.set.prepareShots('intro'), ending = h.set.prepareShots('ending');
    const old = h.finish('intro-0'), current = h.finish('ending-0');
    await Promise.all([intro, ending]);
    expect([...h.state.shots.keys()]).toEqual(['ending-0']);
    expect(old.paint.dispose).toHaveBeenCalledOnce();
    expect(current.paint.dispose).not.toHaveBeenCalled();
    h.set.dispose(); expect(current.paint.dispose).toHaveBeenCalledOnce();
  });
  it('frees a successful image when its companion depth fails', async () => {
    const h = harness(), loading = h.set.prepareShots('intro'), paint = h.texture();
    h.pending.get('/art/sets/edge/shots/intro-0/depth.png')!.reject(new Error('missing depth'));
    h.pending.get('/art/sets/edge/shots/intro-0/paint.webp')!.resolve(paint);
    await loading;
    expect(paint.dispose).toHaveBeenCalledOnce(); expect(h.state.shots.size).toBe(0);
    h.set.dispose();
  });
  it('frees a region image that finishes after the set is disposed', async () => {
    const h = harness(), loading = h.set.useRegion('dawn'), paint = h.texture();
    h.set.dispose();
    h.pending.get('/art/sets/edge/regions/dawn/paint.webp')!.resolve(paint);
    await loading;
    expect(paint.dispose).toHaveBeenCalledOnce();
    expect(h.gameplay.paint.dispose).toHaveBeenCalledOnce();
  });
});
