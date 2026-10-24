import * as THREE from 'three';
import { Illustration } from './Illustration.ts';
import type { CreatureKind } from './Creature.ts';

type Ink=CanvasRenderingContext2D;
const ink=(ctx:Ink,d:string,fill:string|CanvasGradient,stroke?:string,width=2)=>{const shape=new Path2D(d);ctx.fillStyle=fill;ctx.fill(shape);if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke(shape);}};
const light=(ctx:Ink,top:string,bottom:string)=>{const g=ctx.createLinearGradient(110,30,390,490);g.addColorStop(0,top);g.addColorStop(1,bottom);return g;};
const ellipse=(ctx:Ink,x:number,y:number,rx:number,ry:number,color:string)=>{ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();};

/** Original character illustration, split at joints for a responsive cut-paper animation rig. */
export class CreatureArtwork {
  private readonly art=new Illustration();
  part(kind:CreatureKind,part:'head'|'body'|'arm'|'leg'|'lantern'):THREE.Texture {
    return this.art.texture(`${kind}-${part}`,512,512,ctx=>{
      const outline='#152f32';
      if(part==='lantern'){
        ink(ctx,'M 204 95 Q 256 27 310 95 L 306 152 L 343 188 L 327 417 L 185 417 L 169 188 L 207 150 Z',light(ctx,'#918b60','#3d574d'),outline,5);
        const glow=ctx.createRadialGradient(256,290,0,256,290,150);glow.addColorStop(0,'#fff2bb');glow.addColorStop(.25,'#f2d38a');glow.addColorStop(.7,'#bd9c55');glow.addColorStop(1,'#5c6b4e');
        ink(ctx,'M 192 194 L 320 194 L 308 395 L 204 395 Z',glow);
        ctx.strokeStyle='#485a47';ctx.lineWidth=10;for(const x of [206,254,306]){ctx.beginPath();ctx.moveTo(x,190);ctx.lineTo(x,405);ctx.stroke();}return;
      }
      if(kind==='goblin'){
        if(part==='head'){
          ink(ctx,'M 152 180 Q 84 136 18 107 Q 62 254 164 278 L 348 278 Q 448 238 494 101 Q 421 135 358 181 Q 331 104 256 111 Q 178 108 152 180 Z',light(ctx,'#82946c','#365d4d'),outline,5);
          ink(ctx,'M 171 218 Q 171 145 253 146 Q 336 143 347 223 Q 354 333 321 383 Q 286 415 236 401 Q 169 371 166 282 Z',light(ctx,'#738867','#365648'),outline,3);
          ink(ctx,'M 64 150 Q 132 172 164 215 Q 116 228 64 150 Z','#536a54');ink(ctx,'M 447 148 Q 379 178 350 219 Q 401 219 447 148 Z','#536a54');
          ink(ctx,'M 192 240 Q 218 212 242 233 L 242 255 Q 212 264 191 251 Z','#173d36');ink(ctx,'M 272 233 Q 300 212 325 235 L 324 251 Q 298 262 272 252 Z','#173d36');
          ink(ctx,'M 199 242 Q 216 233 235 243 Q 220 253 202 250 Z','#e5d79e');ink(ctx,'M 279 242 Q 298 231 318 241 L 315 249 Q 298 254 279 249 Z','#e5d79e');
          ink(ctx,'M 245 241 Q 259 218 267 248 L 289 310 Q 267 331 241 311 Z',light(ctx,'#91a07b','#49664f'));
          ink(ctx,'M 208 347 Q 254 363 306 341 Q 268 382 215 360 Z','#213e37');
          ink(ctx,'M 223 355 L 231 331 L 237 358 Z','#d5c99a');ink(ctx,'M 289 352 L 299 328 L 301 350 Z','#d5c99a');
          ctx.strokeStyle='rgba(206,218,162,.3)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(195,197);ctx.quadraticCurveTo(226,175,242,184);ctx.stroke();
        }else if(part==='body'){
          ink(ctx,'M 167 48 Q 247 12 335 52 L 355 197 L 389 441 Q 322 465 283 443 L 260 464 L 237 444 Q 180 470 126 444 L 153 189 Z',light(ctx,'#9a7960','#554c42'),outline,5);
          ink(ctx,'M 169 52 L 243 145 L 185 177 L 143 104 Z','#415649');ink(ctx,'M 331 49 L 269 143 L 321 172 L 365 102 Z','#405447');
          ink(ctx,'M 149 288 Q 256 315 363 286 L 367 324 Q 252 354 144 329 Z','#344a3f');ink(ctx,'M 236 303 L 283 302 L 284 336 L 238 339 Z','#a79969','#3a4e42',3);
          ctx.strokeStyle='#baa17a';ctx.lineWidth=3;for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(254,175+i*18);ctx.lineTo(264,181+i*18);ctx.stroke();}
        }else if(part==='arm'){
          ink(ctx,'M 194 35 Q 238 19 272 46 Q 305 96 285 201 L 279 330 Q 327 363 309 408 L 289 457 L 268 435 L 256 476 L 237 453 L 220 475 L 208 444 Q 173 410 202 358 L 177 210 Q 166 117 194 35 Z',light(ctx,'#758b67','#3a5e4d'),outline,5);
          ink(ctx,'M 173 50 Q 227 19 288 49 L 291 176 Q 243 198 179 171 Z',light(ctx,'#947657','#5b5544'),outline,3);
        }else{
          ink(ctx,'M 186 25 Q 237 7 286 30 L 289 227 L 309 381 Q 368 418 349 463 Q 283 493 180 463 Q 175 412 207 382 L 179 218 Z',light(ctx,'#536052','#293f3b'),outline,5);
          ctx.strokeStyle='#7d886a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(218,285);ctx.quadraticCurveTo(205,376,224,410);ctx.stroke();
        }
      }else if(kind==='root'){
        if(part==='head'){
          ink(ctx,'M 171 167 L 101 101 L 97 29 L 132 67 L 151 34 L 166 121 L 205 158 L 239 122 L 224 26 L 257 73 L 284 8 L 289 113 L 323 161 L 372 90 L 382 22 L 407 84 L 434 57 L 411 140 L 350 212 L 364 390 L 318 462 L 195 464 L 149 391 Z',light(ctx,'#8b9272','#34554b'),outline,5);
          ink(ctx,'M 204 248 Q 257 209 310 248 L 323 369 Q 270 411 202 376 Z','#183b37');
          ink(ctx,'M 210 275 Q 234 253 250 272 L 244 288 L 214 289 Z','#d9cc8d');ink(ctx,'M 267 274 Q 291 253 309 272 L 305 289 L 274 289 Z','#d9cc8d');
          ink(ctx,'M 230 342 L 252 331 L 272 343 L 291 329 L 304 351 L 277 369 L 245 359 L 218 365 Z','#3d5b45');
          ctx.strokeStyle='#b4ad7c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(180,217);ctx.bezierCurveTo(193,290,166,353,189,399);ctx.stroke();
        }else if(part==='body'){
          ink(ctx,'M 188 32 Q 254 10 322 45 L 353 172 L 334 288 L 373 461 L 306 437 L 276 484 L 231 448 L 181 480 L 145 459 L 178 290 L 156 154 Z',light(ctx,'#7c8467','#2d5349'),outline,5);
          ink(ctx,'M 218 115 Q 250 72 293 131 L 298 301 Q 257 348 211 295 Z','#234b41');
          ctx.strokeStyle='#536e52';ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(178,402);ctx.bezierCurveTo(247,350,163,222,211,84);ctx.stroke();ctx.beginPath();ctx.moveTo(337,419);ctx.bezierCurveTo(292,352,364,199,306,69);ctx.stroke();
          for(let i=0;i<17;i++){const x=140+(i%5)*46,y=76+Math.floor(i/5)*21;ellipse(ctx,x,y,27,9,i%3?'#577955':'#839063');}
        }else if(part==='arm'){
          ink(ctx,'M 200 22 Q 263 10 289 59 L 267 199 L 298 346 L 335 412 L 310 446 L 287 409 L 282 486 L 257 477 L 253 420 L 225 476 L 205 453 L 225 385 L 188 240 L 174 147 Z',light(ctx,'#879174','#365d4c'),outline,5);
          ctx.strokeStyle='#b5b18b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(222,77);ctx.bezierCurveTo(183,188,266,266,247,351);ctx.stroke();
        }else{
          ink(ctx,'M 187 17 L 286 20 L 274 241 L 316 367 L 405 456 L 319 440 L 354 493 L 270 463 L 209 498 L 232 447 L 134 475 L 201 371 L 169 216 Z',light(ctx,'#687b60','#244d44'),outline,5);
        }
      }else if(kind==='hollow'){
        if(part==='head'){
          ctx.strokeStyle='#172f32';ctx.lineCap='round';
          const antler=(side:number)=>{
            ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(256+side*52,250);ctx.bezierCurveTo(256+side*117,178,256+side*108,98,256+side*181,25);ctx.stroke();
            for(let i=0;i<3;i++){ctx.lineWidth=9-i*2;ctx.beginPath();ctx.moveTo(256+side*(94+i*20),175-i*45);ctx.quadraticCurveTo(256+side*(75+i*13),111-i*29,256+side*(84+i*14),53-i*17);ctx.stroke();}
          };antler(-1);antler(1);
          ink(ctx,'M 215 222 Q 255 198 296 220 L 314 285 L 285 407 L 258 456 L 226 412 L 198 287 Z',light(ctx,'#d2d2b1','#7d9a89'),outline,4);
          ink(ctx,'M 212 280 Q 231 259 245 282 L 237 302 L 219 302 Z','#173839');ink(ctx,'M 270 283 Q 284 260 302 278 L 296 301 L 276 303 Z','#173839');
          ellipse(ctx,232,287,4,4,'#eedfa4');ellipse(ctx,284,287,4,4,'#eedfa4');
          ink(ctx,'M 255 300 L 244 365 L 260 377 L 270 362 Z','#698a7e');
          ctx.strokeStyle='#547b73';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(258,392);ctx.lineTo(258,425);ctx.stroke();
        }else if(part==='body'){
          ink(ctx,'M 222 28 L 292 25 L 315 91 L 385 157 L 348 198 L 396 277 L 354 272 L 382 359 L 349 344 L 383 468 L 314 441 L 286 493 L 256 467 L 216 498 L 191 449 L 132 480 L 159 353 L 126 370 L 162 280 L 118 290 L 156 194 L 128 164 L 199 99 Z',light(ctx,'#345653','#102f33'),outline,5);
          for(let i=0;i<7;i++)ink(ctx,`M ${167+i*25} ${173+(i%2)*27} Q ${210+i*12} 290 ${183+i*18} 419 L ${162+i*24} 451 Q ${188+i*16} 312 ${167+i*25} ${173+(i%2)*27} Z`,i%2?'#244941':'#1b3c3a');
        }else if(part==='arm'){
          ink(ctx,'M 211 18 L 270 20 L 288 119 L 268 245 L 289 378 L 320 436 L 300 459 L 276 423 L 280 491 L 261 489 L 247 426 L 234 484 L 218 475 L 225 397 L 191 247 L 193 116 Z',light(ctx,'#355653','#14383b'),outline,4);
        }else{
          ink(ctx,'M 210 12 L 278 14 L 274 194 L 250 337 L 280 438 L 324 470 L 298 492 L 207 479 L 211 381 L 188 234 Z',light(ctx,'#36574f','#15383a'),outline,4);
        }
      }else{
        if(part==='head'){
          ink(ctx,'M 162 233 Q 173 75 261 68 Q 354 102 365 254 L 347 395 L 292 455 L 207 438 L 155 373 Z',light(ctx,'#8ca3a5','#3c6970'),outline,5);
          ink(ctx,'M 202 245 Q 249 181 307 245 L 318 332 Q 276 378 214 345 Z','#183940');
          ink(ctx,'M 218 273 Q 237 262 249 273 L 244 283 L 223 284 Z','#e8dca4');ink(ctx,'M 267 273 Q 283 262 298 273 L 294 283 L 273 283 Z','#e8dca4');
        }else if(part==='body'){
          ink(ctx,'M 204 40 L 308 38 Q 335 164 356 253 L 405 438 L 351 409 L 331 478 L 292 448 L 272 500 L 242 466 L 207 497 L 196 454 L 146 485 L 158 420 L 112 446 Q 173 251 204 40 Z',light(ctx,'#789697','#365c66'),outline,4);
          ink(ctx,'M 224 61 Q 174 280 180 420 L 211 454 Q 216 231 247 109 Z','#9cacab');ink(ctx,'M 279 63 Q 302 230 294 443 L 325 463 Q 351 276 302 82 Z','#4e777c');
        }else if(part==='arm'){
          ink(ctx,'M 198 23 Q 254 14 294 55 L 276 171 L 251 258 L 273 354 L 304 399 L 287 419 L 268 406 L 264 464 L 246 453 L 237 403 L 218 446 L 202 427 L 215 366 L 181 248 L 174 145 Z',light(ctx,'#8fa5a2','#406b72'),outline,4);
        }else{
          ink(ctx,'M 182 24 L 292 22 Q 254 236 335 429 L 299 475 L 266 444 L 215 487 L 183 446 Q 207 218 182 24 Z',light(ctx,'#759596','#426b70'),outline,4);
        }
      }
    });
  }
  dispose():void{this.art.dispose();}
}
