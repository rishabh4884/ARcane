import * as THREE from 'three';
import { EYE_HEIGHT, SPAWN, terrainHeight } from './spatial.ts';

export function worldInputBlocked():boolean {
  return document.hidden||document.body.classList.contains('is-intro')
    ||document.querySelector<HTMLElement>('#spellbook')?.hidden===false;
}

/** A stationary casting spot: no movement keys, mouse-look, camera following or hidden shortcuts. */
export class CasterView {
  private readonly root=document.createElement('section');
  constructor(private readonly camera:THREE.PerspectiveCamera,canvas:HTMLCanvasElement){
    canvas.tabIndex=0;canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label','The Hushwood. Hold up your hands to aim and cast spells. Your casting position is fixed.');
    canvas.style.cursor='default';
    this.reset();
    this.root.className='caster-view';this.root.setAttribute('aria-label','Casting ground');
    const eyebrow=document.createElement('span');eyebrow.className='caster-eyebrow';eyebrow.textContent='THE LIVING WOOD';
    const title=document.createElement('span');title.className='caster-title';title.textContent='The Hushwood';
    const hint=document.createElement('p');hint.className='caster-hint';hint.textContent='Your hands are the wand. Aim at a spirit, form a sign, and hold.';
    this.root.append(eyebrow,title,hint);document.querySelector('#hud')?.append(this.root);
  }
  reset():void {
    this.camera.position.set(SPAWN.x,terrainHeight(SPAWN.x,SPAWN.z)+EYE_HEIGHT,SPAWN.z);
    this.camera.lookAt(0,1.2,-12);this.camera.updateMatrixWorld(true);
  }
  dispose():void{this.root.remove();}
}
