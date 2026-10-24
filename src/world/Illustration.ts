import * as THREE from 'three';
import { seededRandom } from './spatial.ts';

type Ink = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function oval(ctx: Ink, x: number, y: number, rx: number, ry: number, color: string, angle = 0): void {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, TAU); ctx.fill();
}
function path(ctx: Ink, d: string, color: string | CanvasGradient, stroke?: string, width = 1): void {
  const shape = new Path2D(d); ctx.fillStyle = color; ctx.fill(shape);
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(shape); }
}
function gradient(ctx: Ink, x: number, y: number, radius: number, center: string, edge: string): CanvasGradient {
  const fill = ctx.createRadialGradient(x, y, 0, x, y, radius); fill.addColorStop(0, center); fill.addColorStop(1, edge); return fill;
}

/** Original, layered illustration assets, rendered once. No imported scenery or brush-noise filter. */
export class Illustration {
  private readonly textures: THREE.Texture[] = [];
  private readonly cache = new Map<string, THREE.Texture>();
  private disposed = false;

  texture(name: string, width: number, height: number, draw: (ctx: Ink) => void): THREE.Texture {
    const existing = this.cache.get(name); if (existing) return existing;
    // Keep the same cutout rig usable in non-DOM tests and server-side model inspection.
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!; draw(ctx);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;texture.name=name;
    texture.anisotropy = 2; this.textures.push(texture); this.cache.set(name, texture); return texture;
  }

  tree(variant: number): THREE.Texture {
    return this.texture(`tree-${variant}`, 1024, 2048, (ctx) => {
      const r = seededRandom(8164 + variant * 17);
      const bend = variant % 2 ? -1 : 1;
      const stem = (t: number) => 505 + Math.sin(t * 2.8 + variant * 0.7) * 47 + bend * t * 28;
      // Branches are drawn into the illustration; their negative spaces matter as much as the ink.
      const branch = (x: number, y: number, angle: number, length: number, width: number, depth: number) => {
        const endX = x + Math.cos(angle) * length, endY = y + Math.sin(angle) * length;
        const midX = x + Math.cos(angle + 0.18) * length * 0.6, midY = y + Math.sin(angle + 0.18) * length * 0.6;
        ctx.strokeStyle = '#173d3b'; ctx.lineWidth = width; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(midX, midY, endX, endY); ctx.stroke();
        if (width > 7) {
          ctx.strokeStyle = '#31564a'; ctx.lineWidth = width * 0.18;
          ctx.beginPath(); ctx.moveTo(x - width * 0.2, y); ctx.quadraticCurveTo(midX - width * 0.15, midY, endX, endY); ctx.stroke();
        }
        if (depth > 0) {
          branch(endX, endY, angle - 0.32 + r() * 0.22, length * 0.66, width * 0.48, depth - 1);
          branch(x + (endX - x) * 0.7, y + (endY - y) * 0.7, angle + 0.6, length * 0.43, width * 0.32, depth - 1);
        }
      };
      for (let i = 0; i < 13; i++) {
        const y = 200 + i * 59 + r() * 45, side = i % 2 ? -1 : 1;
        branch(stem(y / 1900), y, side < 0 ? -2.8 + r() * 0.6 : -0.3 - r() * 0.5, 165 + r() * 200, 9 + (y / 1900) * 34, 2);
      }
      // Layered foliage masses with scalloped silhouettes; gradients belong to the artwork.
      const crowns: Array<{x:number;y:number;rx:number;ry:number}> = [];
      for (let i = 0; i < 26; i++) {
        const x = 180 + r() * 660, y = 110 + r() * 650;
        crowns.push({ x, y, rx: 95 + r() * 115, ry: 35 + r() * 58 });
      }
      crowns.sort((a,b) => a.y-b.y);
      for (const crown of crowns) {
        const {x,y,rx,ry} = crown;
        const fill = ctx.createLinearGradient(x, y - ry, x + rx * 0.3, y + ry);
        fill.addColorStop(0, variant === 2 ? '#6d865f' : '#547d60'); fill.addColorStop(0.4, '#315b4d'); fill.addColorStop(1, '#173b39');
        ctx.fillStyle = fill; ctx.beginPath();
        for (let j = 0; j <= 44; j++) {
          const a = j / 44 * TAU, scallop = 1 + Math.sin(a * 11 + x) * 0.055 + Math.sin(a * 17) * 0.04;
          const px = x + Math.cos(a) * rx * scallop, py = y + Math.sin(a) * ry * scallop;
          if (!j) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        } ctx.closePath(); ctx.fill();
        // A few small leaves at the edge, not a uniform polka-dot texture across the crown.
        for (let j = 0; j < 12; j++) {
          const a = r() * TAU, px = x + Math.cos(a) * rx * (0.7 + r() * 0.25), py = y + Math.sin(a) * ry;
          oval(ctx, px, py, 7 + r() * 6, 2.5, j % 3 ? '#587e55' : '#a3ac76', a * 0.3);
        }
      }
      // An asymmetric tapered bole, broad buttress roots and a continuous mossy foot.
      const trunk = ctx.createLinearGradient(390, 0, 610, 0);
      trunk.addColorStop(0, '#153733'); trunk.addColorStop(0.25, '#264d40'); trunk.addColorStop(0.56, '#1a3f38'); trunk.addColorStop(1, '#102d30');
      const top = stem(0), base = stem(1);
      path(ctx, `M ${top-10} 230 C ${top-35} 650 ${base-38} 1180 ${base-64} 1740 C ${base-83} 1860 352 1957 231 2008 C 365 1993 426 1957 ${base-15} 1910 C ${base+8} 1955 628 1981 785 2007 C 641 1950 ${base+66} 1850 ${base+60} 1760 C ${base+36} 1250 ${top+10} 690 ${top+10} 230 Z`, trunk);
      for (let i = 0; i < 5; i++) {
        const x = base - 46 + i * 10;
        ctx.strokeStyle = i % 3 ? 'rgba(8,32,32,0.23)' : 'rgba(140,165,115,0.18)'; ctx.lineWidth = 1.3 + r() * 2;
        ctx.beginPath(); ctx.moveTo(x, 1855); ctx.bezierCurveTo(x + (r() - 0.5) * 42, 1450, top + (i - 5) * 2, 790, top + (i - 5), 510); ctx.stroke();
      }
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        const x = base + side * 35, to = x + side * (95 + i * 40), y = 1995 - i * 13;
        ctx.strokeStyle = '#214b40'; ctx.lineWidth = 15 - i * 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, 1880); ctx.quadraticCurveTo(x + side * 30, y - 8, to, y); ctx.stroke();
      }
      for (let i = 0; i < 90; i++) {
        const a = r() * TAU, radius = r() * 130, x = base + Math.cos(a) * radius, y = 2000 + Math.sin(a) * radius * 0.16;
        oval(ctx, x, y, 6 + r() * 13, 2 + r() * 3, i % 3 ? '#365c45' : '#6b8250', r() * 0.5);
      }
    });
  }

  bank(variant: number): THREE.Texture {
    return this.texture(`bank-${variant}`, 1024, 512, (ctx) => {
      const r = seededRandom(9147 + variant * 191);
      // Broad interlocking masses cover the foot of every bank, rather than isolated grass tufts.
      for (let layer = 0; layer < 3; layer++) {
        const fill = ctx.createLinearGradient(0, 170, 0, 500);
        fill.addColorStop(0, variant === 2 ? '#708e62' : '#5c8a69'); fill.addColorStop(0.45, '#2d6356'); fill.addColorStop(1, '#173f3d');
        ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(0, 512);
        for (let x = -30; x < 1100; x += 20) {
          const y = 330 - layer * 38 + Math.sin(x * 0.012 + variant + layer) * 40 + Math.sin(x * 0.043) * 12;
          ctx.lineTo(x, y);
        } ctx.lineTo(1100, 512); ctx.closePath(); ctx.fill();
      }
      // Loose curled fern fronds rise out of each connected, mossy bank.
      for (let f = 0; f < 22; f++) {
        const bx = 20 + r() * 980, by = 400 + r() * 90, dir = r() < 0.5 ? -1 : 1;
        const height = 70 + r() * 170, bend = dir * (25 + r() * 65);
        ctx.strokeStyle = '#537e64'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + bend * 0.25, by - height * 0.65, bx + bend, by - height); ctx.stroke();
        for (let j = 1; j < 11; j++) {
          const t = j / 11, x = bx + bend * t * t, y = by - height * t;
          const size = Math.sin(t * Math.PI) * (13 + height * 0.09);
          for (const side of [-1, 1]) {
            ctx.fillStyle = j % 3 ? '#477a61' : '#77966b';
            ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.quadraticCurveTo(x + side * size, y + 5, x + side * size * 1.2, y - 10); ctx.quadraticCurveTo(x + side * size * 0.4, y - 8, x, y); ctx.fill();
          }
        }
      }
      for (let i = 0; i < 190; i++) {
        const x = r() * 1024, y = 300 + r() * 215;
        const colors = variant === 1 ? ['#79956d','#426f59','#b3a365','#547e5d'] : ['#70926a','#3d705d','#547f61','#284f48'];
        oval(ctx, x, y, 6 + r() * 13, 2 + r() * 5, colors[i%4], (r()-0.5)*1.8);
      }
      // Wildflowers grow in small colonies, not a random field of identical points.
      if (variant !== 0) for (let colony = 0; colony < 5; colony++) {
        const x = 90 + r() * 850, y = 310 + r() * 130;
        for (let j = 0; j < 8; j++) {
          const px = x + (r()-.5)*55, py = y+(r()-.5)*30;
          ctx.strokeStyle='#72936d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px,py+25);ctx.lineTo(px,py);ctx.stroke();
          const petal = variant===1?'#e8bb72':'#aeb4c6';
          for(let k=0;k<4;k++){const a=k/4*TAU;oval(ctx,px+Math.cos(a)*3,py+Math.sin(a)*3,3,2,petal,a);}
          oval(ctx,px,py,1.6,1.6,'#e7dba5');
        }
      }
      // Clear every card edge into organic foliage: never leave a rectangular green wall.
      ctx.globalCompositeOperation='destination-in';
      const sideFade=ctx.createLinearGradient(0,0,1024,0);
      sideFade.addColorStop(0,'rgba(0,0,0,0)');sideFade.addColorStop(.16,'#000');sideFade.addColorStop(.84,'#000');sideFade.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=sideFade;ctx.fillRect(0,0,1024,512);
      const footFade=ctx.createLinearGradient(0,0,0,512);footFade.addColorStop(0,'#000');footFade.addColorStop(.72,'#000');footFade.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=footFade;ctx.fillRect(0,0,1024,512);
      ctx.globalCompositeOperation='source-over';
    });
  }

  ground(): THREE.Texture {
    return this.texture('moss-carpet', 2048, 2048, (ctx) => {
      const r = seededRandom(83177);
      ctx.fillStyle = '#355f4e'; ctx.fillRect(0,0,2048,2048);
      for(let i=0;i<280;i++) {
        const x=r()*2048,y=r()*2048,radius=70+r()*180;
        ctx.fillStyle=gradient(ctx,x,y,radius,i%2?'rgba(113,141,77,0.4)':'rgba(14,67,59,0.55)','rgba(40,80,61,0)');
        ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
      }
      for(let i=0;i<10000;i++){
        const x=r()*2048,y=r()*2048,angle=r()*TAU;
        oval(ctx,x,y,3+r()*9,1+r()*3,['#4c7351','#466e51','#60845a','#315c49','#365c47'][i%5],angle);
      }
      for(let i=0;i<260;i++){
        const x=r()*2048,y=r()*2048;
        oval(ctx,x,y,6+r()*8,2+r()*4,'rgba(176,151,87,0.4)',r()*TAU);
      }
    });
  }

  rock(): THREE.Texture {
    return this.texture('mossy-rock', 512, 384, ctx => {
      const fill=ctx.createLinearGradient(170,70,270,350);fill.addColorStop(0,'#8a9a83');fill.addColorStop(0.45,'#4e7265');fill.addColorStop(1,'#244f49');
      path(ctx,'M 28 336 C 43 270 94 229 112 159 C 148 69 262 66 323 112 C 379 107 399 185 433 217 C 478 246 490 303 477 344 Q 251 379 28 336 Z',fill);
      const r=seededRandom(2391);
      for(let i=0;i<150;i++){const x=95+r()*290,y=120+r()*80;oval(ctx,x,y,5+r()*16,2+r()*4,i%3?'#6e8f69':'#9ca673',r()*.8);}
      path(ctx,'M 163 167 Q 205 145 236 181 Q 228 236 210 257','rgba(36,70,63,0.18)');
    });
  }

  dispose(): void { if(this.disposed)return;this.disposed=true;this.textures.forEach(texture=>texture.dispose());this.cache.clear(); }
}

/** A narrow 2.5D cutout is turned only around Y: walking creates genuine depth and parallax. */
export function billboardMaterial(map: THREE.Texture, time: {value:number}, motion: {value:number}, amount = 0.035): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({map,alphaTest:0.06,transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true});
  material.toneMapped=false;
  material.onBeforeCompile=(shader)=>{
    shader.uniforms.illustrationTime=time;shader.uniforms.illustrationMotion=motion;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float illustrationTime; uniform float illustrationMotion;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 anchor=instanceMatrix[3].xyz;
        transformed.x+=sin(illustrationTime*0.55+anchor.x*0.2+anchor.z*0.15)*${amount.toFixed(4)}*illustrationMotion*pow(max(0.0,uv.y),2.0);
      #endif`);
  };
  material.customProgramCacheKey=()=>`illustrated-breeze-${amount}`;
  return material;
}
