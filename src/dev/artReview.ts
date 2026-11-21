import * as THREE from 'three';
import { SPELLS } from '../config/spells.ts';
import { Shot } from '../cutscene/Cutscene.ts';
import { SCRIPTS } from '../cutscene/scripts.ts';
import { createSpellAnimation, type SpellAnimation } from '../world/effects.ts';
import { lightAt } from '../world/paintedShots.ts';
import { terrainHeight } from '../world/spatial.ts';
import type { World } from '../world/World.ts';

/** Development-only camera and effect frame desk. No webcam or saved progress is involved.
 * /?review&scene=ending&t=35, or /?review&effect=frost&t=0.6
 * Background mode deliberately leaves the actors out so projection defects remain visible.
 */
export async function artReview(world: World): Promise<void> {
  document.querySelectorAll<HTMLElement>('.g-screen').forEach((screen) => { screen.hidden = true; });
  document.body.className = 'is-cutscene';
  const stage = world.beginCinematic();
  const shot = new Shot(stage);
  let effect: SpellAnimation | null = null;
  let request = 0;
  let mode = '';
  const params = new URLSearchParams(location.search);

  const panel = document.createElement('form');
  panel.setAttribute('aria-label', 'Art review');
  panel.style.cssText = 'position:fixed;inset:auto 12px 12px;z-index:1000;display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 16px;background:#102021;color:#e5e9db;border:1px solid #677e75;font:14px/1.5 system-ui;';
  panel.addEventListener('submit', (event) => event.preventDefault());
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Review subject');
  const sets = document.createElement('optgroup'); sets.label = 'Painted backgrounds';
  for (const script of Object.values(SCRIPTS)) sets.append(new Option(script.id, `scene:${script.id}`));
  const spells = document.createElement('optgroup'); spells.label = 'Spell drawings';
  for (const spell of SPELLS) spells.append(new Option(spell.name, `effect:${spell.effect}`));
  select.append(sets, spells);
  const time = document.createElement('input');
  time.type = 'range'; time.min = '0'; time.step = '0.01';
  time.setAttribute('aria-label', 'Frame time');
  time.style.cssText = 'flex:1;min-width:120px;accent-color:#d9c589';
  const label = document.createElement('output');
  label.style.cssText = 'font-variant-numeric:tabular-nums;min-width:70px';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const hide = document.createElement('button'); hide.type = 'button'; hide.textContent = 'Hide controls';
  hide.addEventListener('click', () => { panel.hidden = true; panel.style.display = 'none'; });
  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'h' && !['INPUT', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) {
      panel.hidden = !panel.hidden; panel.style.display = panel.hidden ? 'none' : 'flex';
    }
  });
  panel.append(select, time, label, status, hide);
  document.body.append(panel);

  const clear = () => { effect?.group.removeFromParent(); effect?.dispose(); effect = null; };
  const draw = () => {
    const at = Number(time.value);
    label.value = `${at.toFixed(2)} s`;
    const [kind, id] = select.value.split(':');
    if (kind === 'scene') {
      const script = SCRIPTS[id];
      shot.camera_(script.camera, at);
      stage.setMood(lightAt(script, at) as typeof script.mood, 0.01);
    } else {
      clear();
      const spell = SPELLS.find((s) => s.effect === id)!;
      const ground = terrainHeight(0, 5);
      const target = new THREE.Vector3(0, ground + 1, 5);
      effect = createSpellAnimation(spell.effect, new THREE.Vector3(0.5, stage.camera.position.y - 0.4, 16), target, new THREE.Color(spell.color), undefined, {
        groundY: ground, cameraQuaternion: stage.camera.quaternion, cameraPosition: stage.camera.position,
        depth: 12, hand: 'right', fov: stage.camera.fov,
      });
      stage.scene.add(effect.group);
      // Fixed steps preserve the same stage transitions as play, then hold the requested drawing.
      let elapsed = 0;
      while (elapsed < at) { const dt = Math.min(1 / 60, at - elapsed); effect.update(dt); elapsed += dt; }
      if (at === 0) effect.update(0);
    }
  };
  const choose = async (initial = false) => {
    const ticket = ++request;
    clear(); world.releasePaintedShots();
    const [kind, id] = select.value.split(':');
    mode = select.value;
    status.textContent = 'Loading paintings…'; time.disabled = true;
    if (kind === 'scene') {
      const script = SCRIPTS[id];
      world.setRegion(script.region ?? 'edge');
      time.max = String(script.duration);
      await world.preparePaintedShots(id);
    } else {
      world.setRegion('edge'); stage.setMood('edge', 0.01);
      stage.camera.position.set(0, terrainHeight(0, 17) + 1.85, 17);
      stage.camera.lookAt(0, 1.2, -12); stage.camera.fov = 64;
      stage.camera.updateProjectionMatrix(); stage.camera.updateMatrixWorld(true);
      time.max = '6';
    }
    if (ticket !== request) return;
    time.value = initial ? params.get('t') ?? '0.6' : '0.6';
    time.disabled = false;
    status.textContent = kind === 'scene' ? 'Background only · H hides controls' : 'Held spell drawing · H hides controls';
    draw();
  };
  select.addEventListener('change', () => { void choose(); });
  time.addEventListener('input', () => { if (select.value === mode) draw(); });
  const requested = params.has('effect') ? `effect:${params.get('effect')}` : `scene:${params.get('scene') ?? 'intro'}`;
  if (Array.from(select.options).some((option) => option.value === requested)) select.value = requested;
  await choose(true);
}
