import * as THREE from 'three';

export interface EnemyReadout { id:number; position:THREE.Vector3; height:number; name:string; health:number; maximum:number; state:string; progress:number }
interface Bar { root:HTMLDivElement; fill:HTMLSpanElement; lag:HTMLSpanElement; label:HTMLSpanElement; value:HTMLSpanElement; health:number; displayed:number; x:number; y:number; deadAge:number }
interface FloatingDamage { element:HTMLSpanElement; point:THREE.Vector3; age:number }

/** Persistent individual health, delayed damage trails, hit feedback and readable attack intent. */
export class EnemyIndicators {
  private readonly root=document.createElement('div');
  private readonly bars=new Map<number,Bar>();
  private readonly numbers:FloatingDamage[]=[];
  private readonly projected=new THREE.Vector3();
  private disposed=false;
  constructor(){this.root.className='enemy-indicators';this.root.setAttribute('aria-label','Enemy vitality and attack warnings');document.querySelector('#hud')?.append(this.root);}
  reset():void{for(const bar of this.bars.values())bar.root.remove();this.bars.clear();for(const number of this.numbers)number.element.remove();this.numbers.length=0;}
  hit(id:number,point:THREE.Vector3,damage:number,effect:string):void {
    const element=document.createElement('span');element.className='enemy-damage';element.textContent=`−${damage}`;element.dataset.effect=effect;this.root.append(element);
    this.numbers.push({element,point:point.clone(),age:0});const bar=this.bars.get(id);if(bar){bar.root.dataset.hit='true';bar.deadAge=0;}
  }
  update(dt:number,camera:THREE.Camera,enemies:readonly EnemyReadout[],paused:boolean,reducedMotion:boolean):void {
    const width=window.innerWidth,height=window.innerHeight;
    for(const enemy of enemies){
      let bar=this.bars.get(enemy.id);
      if(!bar){
        const root=document.createElement('div');root.className='enemy-vital';root.setAttribute('role','meter');root.setAttribute('aria-valuemin','0');root.setAttribute('aria-valuemax',String(enemy.maximum));
        const label=document.createElement('span');label.className='enemy-vital-name';const value=document.createElement('span');value.className='enemy-vital-value';
        const track=document.createElement('div');track.className='enemy-vital-track';const lag=document.createElement('span');lag.className='enemy-vital-lag';const fill=document.createElement('span');fill.className='enemy-vital-fill';track.append(lag,fill);root.append(label,value,track);this.root.append(root);
        bar={root,fill,lag,label,value,health:enemy.maximum,displayed:enemy.maximum,x:0,y:0,deadAge:0};this.bars.set(enemy.id,bar);
      }
      this.projected.copy(enemy.position);this.projected.y+=enemy.height+0.16;this.projected.project(camera);
      const visible=this.projected.z>=-1&&this.projected.z<=1&&Math.abs(this.projected.x)<1.1&&Math.abs(this.projected.y)<1.12;
      if(!paused){bar.displayed=THREE.MathUtils.lerp(bar.displayed,enemy.health,1-Math.exp(-dt*3));if(enemy.health<=0)bar.deadAge+=dt;}
      bar.root.hidden=!visible||bar.deadAge>1.3;bar.x=(this.projected.x*.5+.5)*width;bar.y=(-this.projected.y*.5+.5)*height;
      bar.fill.style.transform=`scaleX(${Math.max(0,enemy.health/enemy.maximum)})`;bar.lag.style.transform=`scaleX(${Math.max(0,bar.displayed/enemy.maximum)})`;
      bar.label.textContent=enemy.name;bar.value.textContent=enemy.state==='windup'?'Preparing attack…':enemy.state==='frozen'?'Frozen':enemy.health<=0?'Defeated':`${enemy.health} / ${enemy.maximum}`;
      bar.root.dataset.state=enemy.state;bar.root.setAttribute('aria-valuenow',String(enemy.health));bar.root.setAttribute('aria-label',`${enemy.name}, ${enemy.health} of ${enemy.maximum} vitality`);bar.health=enemy.health;
      if(bar.root.dataset.hit&&Math.abs(bar.displayed-enemy.health)<1)delete bar.root.dataset.hit;
    }
    // Fan overlapping labels upward while keeping their X anchors on their own spirit.
    const mobile=width<700,barWidth=mobile?78:108,rowHeight=mobile?42:40;
    const placed:Bar[]=[];
    const visibleBars=[...this.bars.values()].filter(bar=>!bar.root.hidden).sort((a,b)=>b.y-a.y);
    for(const bar of visibleBars){
      bar.x=Math.max(barWidth*.5+4,Math.min(width-barWidth*.5-4,bar.x));
      for(let pass=0;pass<12;pass++){
        const collision=placed.find(other=>Math.abs(other.x-bar.x)<barWidth+6&&Math.abs(other.y-bar.y)<rowHeight);
        if(!collision)break;bar.y=collision.y-rowHeight;
      }
      bar.y=Math.max(120,bar.y);bar.root.style.transform=`translate(${Math.round(bar.x)}px,${Math.round(bar.y)}px) translate(-50%,-100%)`;placed.push(bar);
    }
    for(let i=this.numbers.length-1;i>=0;i--){const number=this.numbers[i];if(!paused)number.age+=dt;
      this.projected.copy(number.point);this.projected.y+=0.3+(reducedMotion?0:number.age*0.65);this.projected.project(camera);
      number.element.style.transform=`translate(${Math.round((this.projected.x*.5+.5)*width)}px,${Math.round((-this.projected.y*.5+.5)*height)}px)`;number.element.style.opacity=String(Math.max(0,1-Math.max(0,number.age-.55)*1.5));
      if(number.age>1.25){number.element.remove();this.numbers.splice(i,1);}
    }
  }
  dispose():void{if(this.disposed)return;this.disposed=true;this.reset();this.root.remove();}
}
