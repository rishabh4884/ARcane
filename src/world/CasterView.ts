import * as THREE from 'three';
import { EYE_HEIGHT, SPAWN, terrainHeight } from './spatial.ts';

export function worldInputBlocked():boolean {
  const c=document.body.classList;
  return document.hidden||c.contains('is-intro')||c.contains('is-menu')||c.contains('is-paused')||c.contains('is-cutscene')
    ||document.querySelector<HTMLElement>('#spellbook')?.hidden===false;
}

/** A stationary casting spot: no movement keys, mouse-look, camera following or hidden shortcuts. */
export class CasterView {
  constructor(private readonly camera:THREE.PerspectiveCamera,canvas:HTMLCanvasElement){
    canvas.tabIndex=0;canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label','The Hushwood. Hold up your hands to aim and cast spells. Your casting position is fixed.');
    canvas.style.cursor='default';
    this.reset();
  }
  reset():void {
    this.camera.position.set(SPAWN.x,terrainHeight(SPAWN.x,SPAWN.z)+EYE_HEIGHT,SPAWN.z);
    this.camera.lookAt(0,1.2,-12);this.camera.updateMatrixWorld(true);
  }
  dispose():void{}
}
