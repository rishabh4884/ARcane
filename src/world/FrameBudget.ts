/** Adaptive resolution only; world scale, movement and simulation never depend on pixels. */
export class FrameBudget {
  private elapsed=0;
  private frames=0;
  private settled=0;
  constructor(public ratio:number,private readonly ceiling:number){}
  sample(dt:number):number|null {
    if(!Number.isFinite(dt)||dt<=0)return null;
    this.elapsed+=Math.min(dt,1);this.frames++;
    if(this.elapsed<2.5||this.frames<8)return null;
    const average=this.elapsed/this.frames;this.elapsed=0;this.frames=0;
    const before=this.ratio;
    if(average>0.055){this.ratio=Math.max(0.55,this.ratio*0.8);this.settled=0;}
    else if(average<0.022){this.settled++;if(this.settled>=3){this.ratio=Math.min(this.ceiling,this.ratio+0.1);this.settled=0;}}
    else this.settled=0;
    return Math.abs(before-this.ratio)>0.01?this.ratio:null;
  }
}
