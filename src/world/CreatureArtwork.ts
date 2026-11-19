import * as THREE from 'three';
import { Illustration } from './Illustration.ts';
import { seededRandom } from './spatial.ts';
import type { CreatureKind } from './Creature.ts';

type Ink=CanvasRenderingContext2D;
type Fill=string|CanvasGradient;
export type CreaturePart='head'|'body'|'arm'|'leg'|'lantern';
export type PupilShape='slit'|'bar'|'pin'|'ring';

const TAU=Math.PI*2;
const ink=(ctx:Ink,d:string,fill:Fill,stroke?:string,width=2)=>{const shape=new Path2D(d);ctx.fillStyle=fill;ctx.fill(shape);if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke(shape);}};
const light=(ctx:Ink,top:string,bottom:string)=>{const g=ctx.createLinearGradient(110,30,390,490);g.addColorStop(0,top);g.addColorStop(1,bottom);return g;};
const ellipse=(ctx:Ink,x:number,y:number,rx:number,ry:number,color:Fill,angle=0)=>{ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,angle,0,TAU);ctx.fill();};
const line=(ctx:Ink,color:string,width:number,...points:number[])=>{
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(points[0],points[1]);
  for(let i=2;i+3<points.length;i+=4)ctx.quadraticCurveTo(points[i],points[i+1],points[i+2],points[i+3]);
  if((points.length-2)%4===2)ctx.lineTo(points[points.length-2],points[points.length-1]);
  ctx.stroke();
};
const radial=(ctx:Ink,x:number,y:number,r:number,stops:[number,string][])=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);for(const [at,c] of stops)g.addColorStop(at,c);return g;};

interface FormOptions {
  /** Moonlight catching the upper-left edge. */
  rim?:string;
  rimOffset?:[number,number];
  /** Strength of the form shadow falling away from the moon. */
  shade?:number;
  /** Surface texture painted inside the silhouette, before shading. */
  detail?:(ctx:Ink)=>void;
}

/**
 * One painted form: flat colour, then surface texture clipped to the silhouette, a core shadow
 * turning away from the moon, soft occlusion creeping in from the edges, a thin moonlit rim, and
 * finally the ink outline. Silhouettes are unchanged; only what happens inside them is richer.
 */
function form(ctx:Ink,d:string,fill:Fill,outline:string,width:number,options:FormOptions={}):Path2D {
  const shape=new Path2D(d);
  ctx.fillStyle=fill;ctx.fill(shape);
  ctx.save();ctx.clip(shape);
  options.detail?.(ctx);
  const core=ctx.createLinearGradient(140,40,400,480);
  core.addColorStop(0,'rgba(10,24,26,0)');core.addColorStop(.5,'rgba(8,20,22,.1)');core.addColorStop(1,`rgba(4,12,14,${options.shade??.46})`);
  ctx.fillStyle=core;ctx.fillRect(0,0,512,512);
  ctx.shadowColor='rgba(3,10,11,.9)';ctx.shadowBlur=26;ctx.strokeStyle='rgba(3,10,11,.5)';ctx.lineWidth=16;ctx.stroke(shape);
  ctx.restore();
  if(options.rim&&typeof document!=='undefined'){
    const [dx,dy]=options.rimOffset??[8,7];
    const canvas=document.createElement('canvas');canvas.width=ctx.canvas.width;canvas.height=ctx.canvas.height;
    const rim=canvas.getContext('2d')!;rim.setTransform(ctx.getTransform());
    rim.fillStyle=options.rim;rim.fill(shape);
    rim.globalCompositeOperation='destination-out';rim.translate(dx,dy);rim.fill(shape);
    ctx.save();ctx.resetTransform();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.5;ctx.drawImage(canvas,0,0);ctx.restore();
  }
  ctx.strokeStyle=outline;ctx.lineWidth=width;ctx.lineJoin='round';ctx.stroke(shape);
  return shape;
}

/** Scattered marks: mottled skin, lichen, grit. */
function speckle(ctx:Ink,r:()=>number,count:number,x0:number,y0:number,x1:number,y1:number,colors:string[],min:number,max:number){
  for(let i=0;i<count;i++){const s=min+r()*(max-min);ellipse(ctx,x0+r()*(x1-x0),y0+r()*(y1-y0),s,s*(.6+r()*.5),colors[i%colors.length],r()*TAU);}
}
/** Wavy grain running mostly one way: bark, sinew, cloth fibres. */
function grain(ctx:Ink,r:()=>number,count:number,x0:number,x1:number,y0:number,y1:number,color:string,width:number,wobble:number){
  ctx.strokeStyle=color;ctx.lineCap='round';
  for(let i=0;i<count;i++){
    const x=x0+r()*(x1-x0),top=y0+r()*(y1-y0)*.3,bottom=top+(y1-y0)*(.35+r()*.6);
    ctx.lineWidth=width*(.5+r());ctx.beginPath();ctx.moveTo(x,top);
    const steps=6;for(let k=1;k<=steps;k++){const y=top+(bottom-top)*k/steps;ctx.lineTo(x+Math.sin(k*1.7+i)*wobble*(r()-.2),y);}
    ctx.stroke();
  }
}
/** Hand-stitched seam. */
function stitches(ctx:Ink,points:number[],color:string,gap=13){
  ctx.strokeStyle=color;ctx.lineWidth=3;ctx.lineCap='round';
  for(let i=0;i+3<points.length;i+=2){
    const [x0,y0,x1,y1]=[points[i],points[i+1],points[i+2],points[i+3]],len=Math.hypot(x1-x0,y1-y0),n=Math.max(1,Math.floor(len/gap));
    const nx=-(y1-y0)/len*5,ny=(x1-x0)/len*5;
    for(let k=0;k<n;k++){const t=(k+.5)/n,x=x0+(x1-x0)*t,y=y0+(y1-y0)*t;ctx.beginPath();ctx.moveTo(x-nx,y-ny);ctx.lineTo(x+nx,y+ny);ctx.stroke();}
  }
}
/** Hairline fractures that branch once or twice. */
function crack(ctx:Ink,r:()=>number,x:number,y:number,angle:number,length:number,color:string,width:number,depth=2){
  let px=x,py=y;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(px,py);
  const steps=5;for(let i=0;i<steps;i++){angle+=(r()-.5)*.9;px+=Math.cos(angle)*length/steps;py+=Math.sin(angle)*length/steps;ctx.lineTo(px,py);}
  ctx.stroke();
  if(depth>0&&r()<.8)crack(ctx,r,x+(px-x)*.5,y+(py-y)*.5,angle+(r()<.5?-.9:.9),length*.45,color,width*.7,depth-1);
}
/** A glowing seam of the spirit's inner light. */
function emberVein(ctx:Ink,r:()=>number,x:number,y:number,angle:number,length:number,glow:string){
  const seed=Math.floor(r()*1e6);
  ctx.save();ctx.shadowColor=glow;ctx.shadowBlur=14;ctx.globalAlpha=.8;
  crack(ctx,seededRandom(seed),x,y,angle,length,glow,3.4,1);
  // The same fracture again, thinner and white-hot at its heart.
  ctx.globalAlpha=.7;ctx.shadowBlur=3;crack(ctx,seededRandom(seed),x,y,angle,length,'#fff2c8',1.1,1);
  ctx.restore();
}
/** A socket that falls away into darkness with a faint glow at the back. */
function socket(ctx:Ink,d:string,cx:number,cy:number,size:number,glow:string){
  const shape=new Path2D(d);
  ctx.fillStyle=radial(ctx,cx,cy,size,[[0,glow],[.18,'rgba(20,30,26,.95)'],[.6,'#06100f'],[1,'#020706']]);ctx.fill(shape);
  ctx.save();ctx.clip(shape);ctx.shadowColor='#000';ctx.shadowBlur=10;ctx.strokeStyle='rgba(0,0,0,.85)';ctx.lineWidth=8;ctx.stroke(shape);ctx.restore();
}
function withAlpha(hex:string,alpha:number):string{const c=new THREE.Color(hex);return `rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${alpha})`;}

const GLOW:Record<CreatureKind,string>={goblin:'#d4ff6a',root:'#ffb347',hollow:'#e6f3ff',wraith:'#7fe8ff'};
/** Heads carry the most detail and are seen closest, so they get the densest canvas. */
const RESOLUTION:Record<CreaturePart,number>={head:1024,body:768,arm:512,leg:512,lantern:512};

/** Original character illustration, split at joints for a responsive cut-paper animation rig. */
export class CreatureArtwork {
  private readonly art=new Illustration();
  part(kind:CreatureKind,part:CreaturePart):THREE.Texture {
    const size=RESOLUTION[part];
    return this.art.texture(`${kind}-${part}-v2`,size,size,ctx=>{
      ctx.scale(size/512,size/512);
      const r=seededRandom(kind.length*977+part.length*131+(part==='head'?7:0));
      const glow=GLOW[kind];
      const outline='#152f32';
      if(part==='lantern'){this.lantern(ctx,r);return;}
      if(kind==='goblin')this.goblin(ctx,part,r,outline,glow);
      else if(kind==='root')this.root(ctx,part,r,outline,glow);
      else if(kind==='hollow')this.hollow(ctx,part,r,outline,glow);
      else this.wraith(ctx,part,r,outline,glow);
    });
  }

  /* ───────────────────────────── Bramble Goblin ───────────────────────────── */
  private goblin(ctx:Ink,part:CreaturePart,r:()=>number,outline:string,glow:string){
    const rim='rgba(196,232,200,.9)';
    if(part==='head'){
      // Ears first, so the face overlaps them; veins run from the root of each ear to its tip.
      form(ctx,'M 152 180 Q 84 136 18 107 Q 62 254 164 278 L 348 278 Q 448 238 494 101 Q 421 135 358 181 Q 331 104 256 111 Q 178 108 152 180 Z',light(ctx,'#8a9c70','#33594a'),outline,5,{rim,detail:c=>{
        speckle(c,r,70,20,100,494,280,['rgba(40,62,46,.28)','rgba(150,170,110,.22)'],2,6);
        for(const side of [-1,1]){
          const bx=256+side*110,tip=256+side*225;
          for(let i=0;i<4;i++)line(c,'rgba(120,58,52,.32)',2.2-i*.3,bx,200+i*12,(bx+tip)/2,170+i*18-r()*20,tip-side*30*i,130+i*26);
        }
      }});
      ink(ctx,'M 64 150 Q 132 172 164 215 Q 116 228 64 150 Z',radial(ctx,120,190,70,[[0,'#3c4c3a'],[1,'#5a7258']]));
      ink(ctx,'M 447 148 Q 379 178 350 219 Q 401 219 447 148 Z',radial(ctx,392,190,70,[[0,'#3c4c3a'],[1,'#5a7258']]));
      form(ctx,'M 171 218 Q 171 145 253 146 Q 336 143 347 223 Q 354 333 321 383 Q 286 415 236 401 Q 169 371 166 282 Z',light(ctx,'#7c906c','#32503f'),outline,3,{rim,shade:.5,detail:c=>{
        speckle(c,r,90,166,145,354,410,['rgba(36,58,42,.3)','rgba(58,82,58,.25)','rgba(170,186,128,.18)'],1.5,5);
        // Warts with a wet highlight.
        for(const [x,y,s] of [[196,300,6],[318,312,5],[230,180,4],[300,372,4],[183,336,3]] as const){ellipse(c,x,y,s,s,'#5f7553');ellipse(c,x-s*.3,y-s*.35,s*.35,s*.3,'rgba(220,236,180,.55)');}
        // Forehead furrows and the heavy brow ridge.
        for(let i=0;i<3;i++)line(c,'rgba(24,44,36,.45)',2.4,198,186+i*11,256,174+i*10-r()*4,318,186+i*11);
        ink(c,'M 182 236 Q 214 206 250 228 Q 256 236 262 228 Q 300 206 334 236 Q 300 220 262 238 L 250 238 Q 214 220 182 236 Z','rgba(18,38,30,.55)');
        // Hollow cheeks and bags beneath the eyes.
        line(c,'rgba(22,44,36,.5)',3,196,262,218,272,240,262);line(c,'rgba(22,44,36,.5)',3,276,262,298,272,320,262);
        ellipse(c,196,330,22,40,'rgba(16,36,28,.22)',.2);ellipse(c,322,330,22,40,'rgba(16,36,28,.22)',-.2);
        // An old pale scar across one cheek.
        line(c,'rgba(196,186,150,.55)',3,292,286,306,306,322,318);stitches(c,[292,288,320,316],'rgba(60,44,36,.6)',9);
        // Bramble crown: thorned runners pressed into the scalp.
        for(const [x0,y0,x1,y1] of [[174,196,330,166],[196,168,342,198]] as const){
          line(c,'#2d241b',5,x0,y0,(x0+x1)/2,y0-18,x1,y1);
          for(let k=1;k<6;k++){const t=k/6,x=x0+(x1-x0)*t,y=y0+(y1-y0)*t-Math.sin(t*Math.PI)*12;ink(c,`M ${x-3} ${y} L ${x+2} ${y-9} L ${x+4} ${y+1} Z`,'#3a2d20');}
        }
      }});
      // Deep sockets with a faint inner glow, so the eyes sit inside the skull rather than on it.
      socket(ctx,'M 192 240 Q 218 212 242 233 L 242 255 Q 212 264 191 251 Z',217,244,34,withAlpha(glow,.35));
      socket(ctx,'M 272 233 Q 300 212 325 235 L 324 251 Q 298 262 272 252 Z',298,243,34,withAlpha(glow,.35));
      // A long, hooked nose with nostrils and a sheen on the bridge.
      form(ctx,'M 245 241 Q 259 218 267 248 L 289 310 Q 267 331 241 311 Z',light(ctx,'#98a880','#46634c'),'rgba(21,47,50,.7)',2,{shade:.35});
      ellipse(ctx,252,309,4,2.6,'#1d3029',.3);ellipse(ctx,276,309,4,2.6,'#1d3029',-.3);
      line(ctx,'rgba(230,240,200,.55)',2.5,256,238,262,262,270,290);
      // Mouth: a crooked slash with uneven needle teeth and two tusks.
      ink(ctx,'M 208 347 Q 254 363 306 341 Q 268 382 215 360 Z',radial(ctx,258,356,50,[[0,'#140c0a'],[1,'#22392f']]));
      for(let i=0;i<7;i++){const x=222+i*11,y=352-Math.sin(i/6*Math.PI)*4;ink(ctx,`M ${x} ${y} L ${x+3} ${y+6+r()*4} L ${x+6} ${y} Z`,'#cfc39a');}
      ink(ctx,'M 223 355 L 231 331 L 237 358 Z','#e0d4a6','#4b4433',1.5);ink(ctx,'M 289 352 L 299 328 L 301 350 Z','#e0d4a6','#4b4433',1.5);
      line(ctx,'rgba(206,218,162,.35)',2,195,197,226,175,242,184);
      line(ctx,'rgba(18,36,30,.6)',2.5,206,346,232,352,258,354);
    }else if(part==='body'){
      const d='M 167 48 Q 247 12 335 52 L 355 197 L 389 441 Q 322 465 283 443 L 260 464 L 237 444 Q 180 470 126 444 L 153 189 Z';
      form(ctx,d,light(ctx,'#a07e63','#4e463d'),outline,5,{rim:'rgba(236,214,180,.8)',detail:c=>{
        // Scuffed leather: grain, scratches, darker sweat stains, a stitched patch.
        speckle(c,r,160,120,20,400,470,['rgba(60,40,28,.18)','rgba(200,170,130,.12)'],1,3.5);
        for(let i=0;i<14;i++){const x=150+r()*220,y=90+r()*330;line(c,'rgba(226,196,150,.25)',1.4,x,y,x+10+r()*14,y+r()*8-4);}
        ellipse(c,200,240,48,80,'rgba(50,36,30,.18)',.3);
        ink(c,'M 178 362 L 232 356 L 238 412 L 182 418 Z','#7b6450','rgba(40,30,24,.6)',2);
        stitches(c,[178,362,232,356,238,412,182,418,178,362],'rgba(230,210,160,.6)',10);
        // Seams down the sides.
        stitches(c,[175,90,160,200,148,330,140,430],'rgba(36,28,22,.55)',14);stitches(c,[330,90,350,210,366,330,376,430],'rgba(36,28,22,.55)',14);
        // Ragged hem threads.
        for(let i=0;i<12;i++){const x=140+i*20+r()*8;line(c,'rgba(40,30,26,.5)',2,x,436,x+r()*6-3,452+r()*10);}
      }});
      // Mossy shoulder pads with tufts and a few hanging thorns.
      for(const d2 of ['M 169 52 L 243 145 L 185 177 L 143 104 Z','M 331 49 L 269 143 L 321 172 L 365 102 Z']){
        form(ctx,d2,light(ctx,'#567a5a','#2c4639'),'rgba(21,47,50,.8)',3,{shade:.35,detail:c=>{
          speckle(c,r,90,140,48,370,180,['rgba(120,160,96,.5)','rgba(30,52,40,.4)','rgba(170,190,120,.35)'],1.5,4.5);
        }});
      }
      // Leather belt with iron studs and a dangling bone charm.
      form(ctx,'M 149 288 Q 256 315 363 286 L 367 324 Q 252 354 144 329 Z',light(ctx,'#3d5446','#25362e'),'rgba(21,47,50,.9)',3,{shade:.3});
      for(let i=0;i<8;i++){const x=162+i*27,y=314+Math.sin(i/7*Math.PI)*12;ellipse(ctx,x,y,3.5,3.5,'#8d8a78');ellipse(ctx,x-1,y-1,1.3,1.3,'#e8e4cc');}
      form(ctx,'M 236 303 L 283 302 L 284 336 L 238 339 Z',light(ctx,'#c2b07a','#7a6a42'),'#3a4e42',3,{shade:.3});
      ink(ctx,'M 246 311 L 274 310 L 274 329 L 247 330 Z','rgba(58,48,30,.65)');
      line(ctx,'#5a4a36',2,318,330,320,350,318,372);
      ink(ctx,'M 308 372 Q 318 360 330 372 Q 332 386 319 392 Q 306 386 308 372 Z','#d8cda6','#4a4030',2);
      ellipse(ctx,314,376,2.6,3,'#1b1d18');ellipse(ctx,324,376,2.6,3,'#1b1d18');line(ctx,'#4a4030',1.4,315,386,323,386);
      // Front lacing.
      ctx.strokeStyle='#c9ad83';ctx.lineWidth=3;for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(250,175+i*18);ctx.lineTo(268,183+i*18);ctx.stroke();ctx.beginPath();ctx.moveTo(268,175+i*18);ctx.lineTo(250,183+i*18);ctx.stroke();}
    }else if(part==='arm'){
      form(ctx,'M 194 35 Q 238 19 272 46 Q 305 96 285 201 L 279 330 Q 327 363 309 408 L 289 457 L 268 435 L 256 476 L 237 453 L 220 475 L 208 444 Q 173 410 202 358 L 177 210 Q 166 117 194 35 Z',light(ctx,'#7d9270','#365a49'),outline,5,{rim,detail:c=>{
        speckle(c,r,60,170,30,310,470,['rgba(36,58,42,.3)','rgba(170,186,128,.16)'],1.5,4);
        grain(c,r,6,200,270,180,360,'rgba(30,50,40,.25)',2,6);
        line(c,'rgba(20,40,32,.55)',2.5,210,352,240,360,270,350);
        ink(c,'M 289 457 L 268 435 L 256 476 L 237 453 L 220 475 L 208 444 L 300 430 Z','rgba(214,204,168,.75)');
      }});
      form(ctx,'M 173 50 Q 227 19 288 49 L 291 176 Q 243 198 179 171 Z',light(ctx,'#9a7c5c','#58513f'),outline,3,{shade:.35,detail:c=>{
        stitches(c,[180,150,240,168,288,152],'rgba(40,30,22,.6)',11);speckle(c,r,40,170,40,290,180,['rgba(60,40,28,.2)'],1,3);
      }});
    }else{
      form(ctx,'M 186 25 Q 237 7 286 30 L 289 227 L 309 381 Q 368 418 349 463 Q 283 493 180 463 Q 175 412 207 382 L 179 218 Z',light(ctx,'#5a6857','#263b37'),outline,5,{rim,detail:c=>{
        // Rag wrappings around the shin and long toe claws.
        for(let i=0;i<4;i++){const y=230+i*34;ink(c,`M 170 ${y} L 300 ${y-14} L 304 ${y+6} L 172 ${y+20} Z`,i%2?'rgba(140,126,96,.55)':'rgba(110,100,78,.55)');}
        speckle(c,r,40,180,30,290,220,['rgba(30,46,40,.35)','rgba(140,150,110,.18)'],1.5,4);
        for(const x of [300,326,346])ink(c,`M ${x-10} 452 L ${x+12} 470 L ${x-2} 474 Z`,'#d8ccaa');
      }});
      line(ctx,'#7d886a',4,218,285,205,376,224,410);
    }
  }

  /* ───────────────────────────── Rootbound ───────────────────────────── */
  private root(ctx:Ink,part:CreaturePart,r:()=>number,outline:string,glow:string){
    const rim='rgba(255,226,170,.75)';
    const bark=(c:Ink,x0:number,x1:number,y0:number,y1:number,count:number)=>{
      grain(c,r,count,x0,x1,y0,y1,'rgba(30,46,36,.45)',3,9);grain(c,r,Math.round(count*.6),x0,x1,y0,y1,'rgba(190,190,140,.2)',1.6,7);
      for(let i=0;i<3;i++){const x=x0+r()*(x1-x0),y=y0+r()*(y1-y0),s=7+r()*7;ellipse(c,x,y,s,s*1.6,'rgba(28,40,30,.55)');ellipse(c,x,y,s*.55,s,'rgba(120,110,80,.4)');ellipse(c,x,y,s*.25,s*.5,'rgba(20,26,20,.7)');}
    };
    const moss=(c:Ink,x0:number,y0:number,x1:number,y1:number,n:number)=>speckle(c,r,n,x0,y0,x1,y1,['rgba(110,150,80,.75)','rgba(70,110,60,.7)','rgba(170,190,110,.6)'],2,5.5);
    if(part==='head'){
      form(ctx,'M 171 167 L 101 101 L 97 29 L 132 67 L 151 34 L 166 121 L 205 158 L 239 122 L 224 26 L 257 73 L 284 8 L 289 113 L 323 161 L 372 90 L 382 22 L 407 84 L 434 57 L 411 140 L 350 212 L 364 390 L 318 462 L 195 464 L 149 391 Z',light(ctx,'#939a78','#2f5045'),outline,5,{rim,detail:c=>{
        bark(c,140,370,40,470,26);
        moss(c,100,30,420,170,120);
        emberVein(c,r,172,300,1.4,90,glow);emberVein(c,r,340,250,1.9,110,glow);
        // A couple of shelf fungi growing out of the temple.
        for(const [x,y] of [[352,300],[340,322]] as const){ink(c,`M ${x-24} ${y} Q ${x} ${y-16} ${x+12} ${y} Q ${x-4} ${y+6} ${x-24} ${y} Z`,'#c9b48a','rgba(60,46,30,.7)',1.5);}
      }});
      // The face is a hollow in the wood, glowing faintly from deep inside.
      ink(ctx,'M 204 248 Q 257 209 310 248 L 323 369 Q 270 411 202 376 Z',radial(ctx,258,330,120,[[0,withAlpha(glow,.1)],[.4,'#14302c'],[1,'#0b1d1b']]));
      ctx.save();ctx.clip(new Path2D('M 204 248 Q 257 209 310 248 L 323 369 Q 270 411 202 376 Z'));ctx.shadowColor='#000';ctx.shadowBlur=18;ctx.strokeStyle='rgba(0,0,0,.8)';ctx.lineWidth=14;ctx.stroke(new Path2D('M 204 248 Q 257 209 310 248 L 323 369 Q 270 411 202 376 Z'));ctx.restore();
      socket(ctx,'M 210 275 Q 234 253 250 272 L 244 288 L 214 289 Z',230,279,30,withAlpha(glow,.4));
      socket(ctx,'M 267 274 Q 291 253 309 272 L 305 289 L 274 289 Z',288,279,30,withAlpha(glow,.4));
      // A splintered maw.
      ink(ctx,'M 230 342 L 252 331 L 272 343 L 291 329 L 304 351 L 277 369 L 245 359 L 218 365 Z',radial(ctx,262,350,46,[[0,'#120a06'],[1,'#2c3d30']]));
      for(let i=0;i<6;i++){const x=228+i*13;ink(ctx,`M ${x} ${343-Math.abs(i-2.5)*3} L ${x+4} ${355+r()*6} L ${x+8} ${343-Math.abs(i-2.5)*3} Z`,'#bba57a');}
      line(ctx,'#b4ad7c',3,180,217,193,290,166,353);
      // Dangling root-hairs from the brow.
      for(let i=0;i<5;i++){const x=214+i*22;line(ctx,'rgba(40,52,38,.8)',1.6,x,238,x+(r()-.5)*10,250+r()*14);}
    }else if(part==='body'){
      form(ctx,'M 188 32 Q 254 10 322 45 L 353 172 L 334 288 L 373 461 L 306 437 L 276 484 L 231 448 L 181 480 L 145 459 L 178 290 L 156 154 Z',light(ctx,'#858d6c','#29493f'),outline,5,{rim,detail:c=>{
        bark(c,150,370,20,480,40);
        emberVein(c,r,190,330,1.2,120,glow);emberVein(c,r,330,120,2.1,110,glow);emberVein(c,r,300,380,1.5,70,glow);
        moss(c,160,20,340,90,90);
      }});
      // The hollow in the trunk, and something small still watching from inside it.
      ink(ctx,'M 218 115 Q 250 72 293 131 L 298 301 Q 257 348 211 295 Z',radial(ctx,254,200,120,[[0,'#050c0b'],[.7,'#10241f'],[1,'#1f4239']]));
      for(const [x,y] of [[244,198],[262,196]] as const){ellipse(ctx,x,y,4,2.6,withAlpha(glow,.85));ellipse(ctx,x,y,1.4,1.4,'#fff4d0');}
      ellipse(ctx,250,252,2.6,1.6,withAlpha(glow,.5));ellipse(ctx,262,253,2.6,1.6,withAlpha(glow,.5));
      ctx.strokeStyle='#536e52';ctx.lineWidth=11;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(178,402);ctx.bezierCurveTo(247,350,163,222,211,84);ctx.stroke();ctx.beginPath();ctx.moveTo(337,419);ctx.bezierCurveTo(292,352,364,199,306,69);ctx.stroke();
      ctx.strokeStyle='rgba(190,200,150,.35)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(174,400);ctx.bezierCurveTo(243,348,159,222,207,86);ctx.stroke();
      // Leaf platelets across the shoulders, each with a midrib.
      for(let i=0;i<17;i++){const x=140+(i%5)*46,y=76+Math.floor(i/5)*21,a=(r()-.5)*.5;
        ellipse(ctx,x,y,27,9,radial(ctx,x-8,y-3,30,[[0,i%3?'#7a9b68':'#a4ad78'],[1,i%3?'#3f5f43':'#66704a']]),a);
        line(ctx,'rgba(30,48,34,.55)',1.4,x-22*Math.cos(a),y-22*Math.sin(a),x+22*Math.cos(a),y+22*Math.sin(a));}
    }else if(part==='arm'){
      form(ctx,'M 200 22 Q 263 10 289 59 L 267 199 L 298 346 L 335 412 L 310 446 L 287 409 L 282 486 L 257 477 L 253 420 L 225 476 L 205 453 L 225 385 L 188 240 L 174 147 Z',light(ctx,'#8e9878','#325848'),outline,5,{rim,detail:c=>{
        bark(c,180,300,20,420,16);moss(c,190,20,290,80,40);
        emberVein(c,r,230,180,1.4,80,glow);
      }});
      line(ctx,'#b5b18b',3,222,77,183,188,266,266);
    }else{
      form(ctx,'M 187 17 L 286 20 L 274 241 L 316 367 L 405 456 L 319 440 L 354 493 L 270 463 L 209 498 L 232 447 L 134 475 L 201 371 L 169 216 Z',light(ctx,'#6e8164','#21473f'),outline,5,{rim,detail:c=>{
        bark(c,160,320,10,480,20);moss(c,180,380,360,470,50);
      }});
    }
  }

  /* ───────────────────────────── Antlered Hollow ───────────────────────────── */
  private hollow(ctx:Ink,part:CreaturePart,r:()=>number,outline:string,glow:string){
    if(part==='head'){
      ctx.strokeStyle='#172f32';ctx.lineCap='round';
      const antler=(side:number)=>{
        ctx.strokeStyle='#172f32';ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(256+side*52,250);ctx.bezierCurveTo(256+side*117,178,256+side*108,98,256+side*181,25);ctx.stroke();
        for(let i=0;i<3;i++){ctx.lineWidth=9-i*2;ctx.beginPath();ctx.moveTo(256+side*(94+i*20),175-i*45);ctx.quadraticCurveTo(256+side*(75+i*13),111-i*29,256+side*(84+i*14),53-i*17);ctx.stroke();}
        // Pale velvet catching the moon along one edge of each beam.
        ctx.save();ctx.translate(-2,-2);ctx.strokeStyle='rgba(176,196,176,.5)';ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(256+side*52,250);ctx.bezierCurveTo(256+side*117,178,256+side*108,98,256+side*181,25);ctx.stroke();
        for(let i=0;i<3;i++){ctx.lineWidth=2.2-i*.4;ctx.beginPath();ctx.moveTo(256+side*(94+i*20),175-i*45);ctx.quadraticCurveTo(256+side*(75+i*13),111-i*29,256+side*(84+i*14),53-i*17);ctx.stroke();}
        ctx.restore();
        // Strands of dead moss hanging from the tines.
        for(let i=0;i<5;i++){const x=256+side*(90+i*18+r()*10),y=70+i*30+r()*20;
          ctx.strokeStyle=`rgba(${120+i*10},${140+i*6},110,.42)`;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+(r()-.5)*14,y+22,x+(r()-.5)*8,y+40+r()*40);ctx.stroke();}
      };antler(-1);antler(1);
      form(ctx,'M 215 222 Q 255 198 296 220 L 314 285 L 285 407 L 258 456 L 226 412 L 198 287 Z',light(ctx,'#dcdcbc','#76927f'),outline,4,{rim:'rgba(255,255,240,.9)',shade:.5,detail:c=>{
        // Weathered bone: blotches, a suture seam and hairline cracks.
        speckle(c,r,40,200,200,315,450,['rgba(110,120,90,.18)','rgba(80,70,50,.15)'],3,9);
        line(c,'rgba(70,80,70,.5)',1.6,226,232,240,246,256,236,272,248,286,234);
        crack(c,r,232,330,1.7,60,'rgba(40,52,48,.7)',1.6);crack(c,r,300,250,2.2,70,'rgba(40,52,48,.7)',1.4);crack(c,r,262,212,1.5,40,'rgba(40,52,48,.6)',1.2);
        ellipse(c,258,300,10,70,'rgba(30,40,36,.22)');
      }});
      // Sockets sunk deep into the bone, with stains weeping from them.
      for(const x of [229,286]){
        const g=ctx.createLinearGradient(x,295,x,370);g.addColorStop(0,'rgba(30,48,44,.55)');g.addColorStop(1,'rgba(30,48,44,0)');
        ink(ctx,`M ${x-6} 296 Q ${x-8} 330 ${x-3} 368 Q ${x+2} 340 ${x+6} 296 Z`,g);
      }
      socket(ctx,'M 212 280 Q 231 259 245 282 L 237 302 L 219 302 Z',229,289,24,withAlpha(glow,.25));
      socket(ctx,'M 270 283 Q 284 260 302 278 L 296 301 L 276 303 Z',286,289,24,withAlpha(glow,.25));
      ink(ctx,'M 255 300 L 244 365 L 260 377 L 270 362 Z',radial(ctx,258,345,30,[[0,'#0c1a18'],[1,'#4b6a60']]));
      // Teeth along the long jaw.
      for(let i=0;i<6;i++){const y=388+i*9,w=7-i*.6;ink(ctx,`M ${258-w} ${y} L ${258+w} ${y} L ${258+w*.6} ${y+7} L ${258-w*.6} ${y+7} Z`,'#c4c6a8','rgba(40,60,56,.7)',1);}
    }else if(part==='body'){
      form(ctx,'M 222 28 L 292 25 L 315 91 L 385 157 L 348 198 L 396 277 L 354 272 L 382 359 L 349 344 L 383 468 L 314 441 L 286 493 L 256 467 L 216 498 L 191 449 L 132 480 L 159 353 L 126 370 L 162 280 L 118 290 L 156 194 L 128 164 L 199 99 Z',light(ctx,'#395c58','#0e2b2f'),outline,5,{rim:'rgba(170,220,220,.7)',detail:c=>{
        grain(c,r,40,130,390,40,490,'rgba(8,24,26,.45)',2.2,5);grain(c,r,18,140,380,60,480,'rgba(110,160,150,.16)',1.4,4);
        // A ribcage pressing through the shroud.
        for(let i=0;i<5;i++){const y=150+i*26,w=58-i*5;line(c,'rgba(190,210,190,.16)',5-i*.5,256-w,y+12,256,y-6,256+w,y+12);}
        line(c,'rgba(190,210,190,.14)',6,256,130,258,200,256,270);
      }});
      for(let i=0;i<7;i++)ink(ctx,`M ${167+i*25} ${173+(i%2)*27} Q ${210+i*12} 290 ${183+i*18} 419 L ${162+i*24} 451 Q ${188+i*16} 312 ${167+i*25} ${173+(i%2)*27} Z`,i%2?'rgba(36,73,65,.85)':'rgba(27,60,58,.85)');
      // Frayed threads trailing from every tatter.
      for(const [x,y] of [[383,468],[286,493],[216,498],[132,480],[126,370],[118,290],[382,359],[396,277]] as const){
        for(let k=0;k<3;k++){ctx.strokeStyle='rgba(30,60,58,.75)';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+(r()-.5)*10,y+8,x+(r()-.5)*16,y+10+r()*12);ctx.stroke();}
      }
    }else if(part==='arm'){
      form(ctx,'M 211 18 L 270 20 L 288 119 L 268 245 L 289 378 L 320 436 L 300 459 L 276 423 L 280 491 L 261 489 L 247 426 L 234 484 L 218 475 L 225 397 L 191 247 L 193 116 Z',light(ctx,'#3a5d59','#10343a'),outline,4,{rim:'rgba(170,220,220,.7)',detail:c=>{
        grain(c,r,14,195,285,20,380,'rgba(8,24,26,.45)',2,4);
        // Bare knuckles and long pale finger-bones.
        ink(c,'M 300 459 L 276 423 L 280 491 L 261 489 L 247 426 L 234 484 L 218 475 L 225 410 L 320 436 Z','rgba(200,210,190,.55)');
        for(const [x,y] of [[262,250],[248,392],[268,400]] as const)ellipse(c,x,y,7,5,'rgba(190,210,190,.3)');
      }});
    }else{
      form(ctx,'M 210 12 L 278 14 L 274 194 L 250 337 L 280 438 L 324 470 L 298 492 L 207 479 L 211 381 L 188 234 Z',light(ctx,'#3a5b53','#12353a'),outline,4,{rim:'rgba(170,220,220,.7)',detail:c=>{
        grain(c,r,14,190,280,10,440,'rgba(8,24,26,.45)',2,4);
        ellipse(c,232,236,12,9,'rgba(190,210,190,.25)');
        ink(c,'M 207 470 L 324 462 L 298 492 L 207 479 Z','rgba(10,20,20,.6)');
      }});
    }
  }

  /* ───────────────────────────── Lantern Wraith ───────────────────────────── */
  private wraith(ctx:Ink,part:CreaturePart,r:()=>number,outline:string,glow:string){
    const rim='rgba(200,250,255,.85)';
    if(part==='head'){
      form(ctx,'M 162 233 Q 173 75 261 68 Q 354 102 365 254 L 347 395 L 292 455 L 207 438 L 155 373 Z',light(ctx,'#94abad','#365f67'),outline,5,{rim,detail:c=>{
        // Hood folds sweeping back from the brow.
        for(let i=0;i<6;i++){const x=184+i*29,o=(i-2.5);line(c,'rgba(30,60,66,.38)',4.5-Math.abs(o)*.5,x+o*6,96+Math.abs(o)*12,x-o*14,250,x+o*8,430);}
        for(let i=0;i<4;i++){const x=200+i*36,o=(i-1.5);line(c,'rgba(220,245,245,.2)',2,x+o*4,104,x-o*12,240,x+o*6,410);}
        // A deep cowl shadow framing the opening.
        ellipse(c,258,300,92,118,'rgba(16,40,46,.22)');
      }});
      // A face that is mostly absence: the hood opens into deep dark with a ghost of cheekbones.
      ink(ctx,'M 202 245 Q 249 181 307 245 L 318 332 Q 276 378 214 345 Z',radial(ctx,258,280,110,[[0,'#081a1f'],[.6,'#0e262c'],[1,'#1d4249']]));
      ctx.save();ctx.clip(new Path2D('M 202 245 Q 249 181 307 245 L 318 332 Q 276 378 214 345 Z'));ctx.shadowColor='#000';ctx.shadowBlur=20;ctx.strokeStyle='rgba(0,0,0,.85)';ctx.lineWidth=16;ctx.stroke(new Path2D('M 202 245 Q 249 181 307 245 L 318 332 Q 276 378 214 345 Z'));
      line(ctx,'rgba(160,230,240,.14)',4,218,300,236,318,250,322);line(ctx,'rgba(160,230,240,.14)',4,298,300,282,318,268,322);
      line(ctx,withAlpha(glow,.3),2,236,336,258,330,282,336);
      ctx.restore();
      socket(ctx,'M 218 273 Q 237 262 249 273 L 244 283 L 223 284 Z',234,277,26,withAlpha(glow,.45));
      socket(ctx,'M 267 273 Q 283 262 298 273 L 294 283 L 273 283 Z',283,277,26,withAlpha(glow,.45));
    }else if(part==='body'){
      form(ctx,'M 204 40 L 308 38 Q 335 164 356 253 L 405 438 L 351 409 L 331 478 L 292 448 L 272 500 L 242 466 L 207 497 L 196 454 L 146 485 L 158 420 L 112 446 Q 173 251 204 40 Z',light(ctx,'#7d9b9c','#2f5660'),outline,4,{rim,detail:c=>{
        // Long robe folds, and a faint line of runes stitched in light down the front.
        for(let i=0;i<9;i++){const x=180+i*18;line(c,i%2?'rgba(24,52,58,.32)':'rgba(220,245,245,.14)',i%2?5:3,x,60,x+(i-4)*8,250,x+(i-4)*22,470);}
        ctx.save();ctx.shadowColor=glow;ctx.shadowBlur=10;
        for(let i=0;i<6;i++){const y=120+i*44,x=256+Math.sin(i)*4;ctx.strokeStyle=withAlpha(glow,.55);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-7,y);ctx.lineTo(x,y-9);ctx.lineTo(x+7,y);ctx.lineTo(x,y+9);ctx.closePath();if(i%2)ctx.moveTo(x-9,y+14),ctx.lineTo(x+9,y+14);ctx.stroke();}
        ctx.restore();
        // The hem dissolves into vapour.
        const fade=c.createLinearGradient(0,380,0,500);fade.addColorStop(0,'rgba(140,220,230,0)');fade.addColorStop(1,'rgba(140,220,230,.35)');c.fillStyle=fade;c.fillRect(0,380,512,132);
      }});
      ink(ctx,'M 224 61 Q 174 280 180 420 L 211 454 Q 216 231 247 109 Z','rgba(170,190,188,.75)');ink(ctx,'M 279 63 Q 302 230 294 443 L 325 463 Q 351 276 302 82 Z','rgba(70,112,118,.8)');
      // Wisps trailing from the tattered hem.
      for(const [x,y] of [[405,438],[331,478],[272,500],[207,497],[146,485],[112,446]] as const){
        ctx.strokeStyle='rgba(150,230,240,.3)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+10,y+4,x-8,y+8,x+(r()-.5)*20,y+10);ctx.stroke();
      }
    }else if(part==='arm'){
      form(ctx,'M 198 23 Q 254 14 294 55 L 276 171 L 251 258 L 273 354 L 304 399 L 287 419 L 268 406 L 264 464 L 246 453 L 237 403 L 218 446 L 202 427 L 215 366 L 181 248 L 174 145 Z',light(ctx,'#97acaa','#3c6870'),outline,4,{rim,detail:c=>{
        for(let i=0;i<4;i++){const x=200+i*18;line(c,'rgba(24,52,58,.3)',3,x,40,x+4,150,x-6,250);}
        ink(c,'M 304 399 L 287 419 L 268 406 L 264 464 L 246 453 L 237 403 L 218 446 L 202 427 L 215 380 L 290 380 Z','rgba(210,240,240,.4)');
      }});
    }else{
      form(ctx,'M 182 24 L 292 22 Q 254 236 335 429 L 299 475 L 266 444 L 215 487 L 183 446 Q 207 218 182 24 Z',light(ctx,'#7b9a9b','#3d666b'),outline,4,{rim,detail:c=>{
        for(let i=0;i<5;i++){const x=196+i*20;line(c,i%2?'rgba(24,52,58,.3)':'rgba(220,245,245,.14)',3,x,30,x+i*4,250,x+i*14,460);}
        const fade=c.createLinearGradient(0,360,0,490);fade.addColorStop(0,'rgba(140,220,230,0)');fade.addColorStop(1,'rgba(140,220,230,.35)');c.fillStyle=fade;c.fillRect(0,360,512,152);
      }});
    }
  }

  private lantern(ctx:Ink,r:()=>number){
    const outline='#152f32';
    form(ctx,'M 204 95 Q 256 27 310 95 L 306 152 L 343 188 L 327 417 L 185 417 L 169 188 L 207 150 Z',light(ctx,'#9a9466','#344d45'),outline,5,{rim:'rgba(255,240,200,.8)',detail:c=>speckle(c,r,60,170,30,345,420,['rgba(40,30,20,.25)','rgba(200,180,120,.18)'],1,3)});
    // Hanging ring.
    ctx.strokeStyle=outline;ctx.lineWidth=7;ctx.beginPath();ctx.arc(256,52,22,Math.PI*.1,Math.PI*.9,true);ctx.stroke();
    ctx.strokeStyle='#b9a874';ctx.lineWidth=3;ctx.beginPath();ctx.arc(256,52,22,Math.PI*.1,Math.PI*.9,true);ctx.stroke();
    const glow=radial(ctx,256,300,150,[[0,'#fffbe0'],[.18,'#ffe7a3'],[.45,'#e9c06e'],[.75,'#a88848'],[1,'#4f5d44']]);
    ink(ctx,'M 192 194 L 320 194 L 308 395 L 204 395 Z',glow);
    // The flame itself, and soot climbing the glass.
    ink(ctx,'M 256 238 Q 282 290 270 330 Q 256 350 242 330 Q 230 290 256 238 Z','rgba(255,255,240,.9)');
    ink(ctx,'M 256 270 Q 268 300 262 322 Q 256 330 250 322 Q 244 300 256 270 Z','#fffdf4');
    const soot=ctx.createLinearGradient(0,194,0,250);soot.addColorStop(0,'rgba(40,36,26,.5)');soot.addColorStop(1,'rgba(40,36,26,0)');ink(ctx,'M 192 194 L 320 194 L 316 250 L 196 250 Z',soot);
    line(ctx,'rgba(255,255,255,.55)',4,214,210,212,300,218,380);
    ctx.strokeStyle='#485a47';ctx.lineWidth=10;for(const x of [206,254,306]){ctx.beginPath();ctx.moveTo(x,190);ctx.lineTo(x,405);ctx.stroke();}
    ctx.strokeStyle='#8f8a62';ctx.lineWidth=2.5;for(const x of [203,251,303]){ctx.beginPath();ctx.moveTo(x,190);ctx.lineTo(x,405);ctx.stroke();}
    for(const x of [190,256,322])for(const y of [176,410]){ellipse(ctx,x,y,4,4,'#3a4636');ellipse(ctx,x-1,y-1,1.6,1.6,'#e0d6a8');}
  }

  /**
   * One finger and its talon, drawn hanging from the knuckle (top of the frame) so the rig can
   * splay, hook and clench each one on its own.
   */
  claw(kind:CreatureKind):THREE.Texture {
    const palette:Record<CreatureKind,{skin:[string,string];nail:[string,string];hook:number}>={
      goblin:{skin:['#86a072','#3f5f4c'],nail:['#efe6c4','#8a7a58'],hook:1},
      root:{skin:['#97a07c','#36594a'],nail:['#d2b27a','#3a2c1c'],hook:.6},
      hollow:{skin:['#3c605a','#12363a'],nail:['#e2e5cf','#7e8a78'],hook:.35},
      wraith:{skin:['#aec2c0','#4a757c'],nail:['#f2fdfd','#7fb8c0'],hook:.8},
    };
    const {skin,nail,hook}=palette[kind];
    return this.art.texture(`creature-claw-${kind}`,64,192,ctx=>{
      const outline='#152f32';
      const finger=ctx.createLinearGradient(14,0,50,90);finger.addColorStop(0,skin[0]);finger.addColorStop(1,skin[1]);
      ink(ctx,'M 14 0 L 50 0 Q 52 46 46 92 Q 32 100 18 92 Q 12 46 14 0 Z',finger,outline,4);
      // Knuckle creases.
      line(ctx,'rgba(10,26,24,.55)',2,20,34,32,38,44,34);line(ctx,'rgba(10,26,24,.45)',2,21,66,32,70,43,66);
      line(ctx,'rgba(255,255,255,.25)',2,18,8,17,50,20,86);
      const talon=ctx.createLinearGradient(20,80,40,190);talon.addColorStop(0,nail[0]);talon.addColorStop(1,nail[1]);
      const tip=32+hook*20;
      ink(ctx,`M 17 84 Q 34 78 48 86 Q ${50+hook*4} 140 ${tip} 188 Q ${tip-4} 150 ${17+hook*4} 120 Q 14 100 17 84 Z`,talon,outline,3);
      line(ctx,'rgba(255,255,255,.45)',1.6,24,92,26+hook*6,130,tip-6,176);
      ellipse(ctx,32,86,13,5,'rgba(20,30,24,.45)');
    });
  }
  /** A curved streak of light left behind by a raking swing, brightest in the middle. */
  smear():THREE.Texture {
    return this.art.texture('creature-smear',256,256,ctx=>{
      const steps=48;
      for(let i=0;i<steps;i++){
        const t=i/(steps-1),a0=Math.PI/2-.95+t*1.9,a1=a0+1.9/steps+.01,fade=Math.sin(t*Math.PI)**1.4;
        const band=ctx.createRadialGradient(128,128,92,128,128,128);
        band.addColorStop(0,'rgba(255,255,255,0)');band.addColorStop(.55,`rgba(255,255,255,${.55*fade})`);band.addColorStop(.85,`rgba(255,255,255,${.95*fade})`);band.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=band;ctx.beginPath();ctx.moveTo(128,128);ctx.arc(128,128,128,a0,a1);ctx.closePath();ctx.fill();
      }
    });
  }
  /** Glowing iris: a bright pinpoint, a ring and fibres. White, so each creature tints it. */
  iris():THREE.Texture {
    return this.art.texture('creature-iris',128,128,ctx=>{
      ctx.fillStyle=radial(ctx,64,64,64,[[0,'rgba(255,255,255,1)'],[.22,'rgba(255,255,255,.9)'],[.5,'rgba(255,255,255,.42)'],[.62,'rgba(255,255,255,.7)'],[.7,'rgba(255,255,255,.25)'],[1,'rgba(255,255,255,0)']]);
      ctx.fillRect(0,0,128,128);
      ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1.4;
      for(let i=0;i<28;i++){const a=i/28*TAU+Math.sin(i*3.1)*.1;ctx.beginPath();ctx.moveTo(64+Math.cos(a)*12,64+Math.sin(a)*12);ctx.lineTo(64+Math.cos(a)*(36+(i%3)*4),64+Math.sin(a)*(36+(i%3)*4));ctx.stroke();}
    });
  }
  /** The dark pupil drawn over the iris. Its shape is the creature's character. */
  pupil(shape:PupilShape):THREE.Texture {
    return this.art.texture(`creature-pupil-${shape}`,128,128,ctx=>{
      const soft=(draw:()=>void)=>{ctx.save();ctx.shadowColor='rgba(0,0,0,.9)';ctx.shadowBlur=6;ctx.fillStyle='#ffffff';ctx.beginPath();draw();ctx.fill();ctx.restore();};
      if(shape==='slit')soft(()=>{ctx.moveTo(64,6);ctx.quadraticCurveTo(84,64,64,122);ctx.quadraticCurveTo(44,64,64,6);});
      else if(shape==='bar')soft(()=>{ctx.ellipse(64,64,54,16,0,0,TAU);});
      else if(shape==='pin')soft(()=>{ctx.arc(64,64,22,0,TAU);});
      else{soft(()=>{ctx.arc(64,64,40,0,TAU);});ctx.globalCompositeOperation='destination-out';ctx.fillStyle=radial(ctx,64,64,22,[[0,'rgba(0,0,0,1)'],[.7,'rgba(0,0,0,.8)'],[1,'rgba(0,0,0,0)']]);ctx.beginPath();ctx.arc(64,64,22,0,TAU);ctx.fill();}
    });
  }
  /** A soft, dark mouth hollow with a ring of needle teeth and a faint inner glow. */
  mouth(kind:CreatureKind='goblin'):THREE.Texture {
    return this.art.texture(`creature-mouth-${kind}`,256,128,ctx=>{
      ctx.save();ctx.translate(128,64);ctx.scale(1,0.5);
      const g=ctx.createRadialGradient(0,0,0,0,0,120);g.addColorStop(0,withAlpha(GLOW[kind],.35));g.addColorStop(.25,'rgba(10,6,6,0.98)');g.addColorStop(0.62,'rgba(6,14,12,0.92)');g.addColorStop(1,'rgba(6,14,12,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,124,0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.fillStyle='rgba(222,212,176,.85)';
      for(let i=0;i<11;i++){const x=40+i*17.6,top=64-Math.sqrt(Math.max(0,1-((x-128)/96)**2))*46;
        ctx.beginPath();ctx.moveTo(x-4,top);ctx.lineTo(x,top+10+(i%3)*4);ctx.lineTo(x+4,top);ctx.fill();
        const bottom=128-top;ctx.beginPath();ctx.moveTo(x-4,bottom);ctx.lineTo(x+1,bottom-8-(i%2)*4);ctx.lineTo(x+4,bottom);ctx.fill();}
    });
  }
  dispose():void{this.art.dispose();}
}
