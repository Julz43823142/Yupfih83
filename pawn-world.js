// Original EloScanner Pawn Dash: an isometric, endless chess-world crossing game.
// No game sprites, levels or assets from third-party titles are used.
export function createPawnWorld({host,seed,onScore,onHit,onStatus,onPauseChange=()=>{}}){
 const root=document.createElement('div');root.className='pawn-world pawn-world-immersive';
 const menuButton=document.createElement('button');menuButton.type='button';menuButton.className='pawn-world-menu-button';menuButton.textContent='☰ Menu';menuButton.setAttribute('aria-label','Open game menu');
 const overlay=document.createElement('div');overlay.className='pawn-world-overlay';overlay.hidden=true;
 const menuTitle=document.createElement('h2');menuTitle.textContent='Pawn Kingdom';
 const resume=document.createElement('button');resume.type='button';resume.textContent='Resume game';
 const exit=document.createElement('button');exit.type='button';exit.textContent='Exit to minigames';
 const menuHelp=document.createElement('p');menuHelp.textContent='Escape pauses or resumes · Arrow keys / WASD move';
 overlay.append(menuTitle,resume,exit,menuHelp);
 const setMenu=open=>{overlay.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));onPauseChange(open);if(!open)canvas.focus({preventScroll:true})};
 menuButton.onclick=()=>setMenu(overlay.hidden);resume.onclick=()=>setMenu(false);exit.onclick=()=>{location.href='/minigames.html'};
 const canvas=document.createElement('canvas');canvas.className='pawn-world-canvas';canvas.tabIndex=0;
 canvas.setAttribute('aria-label','Pawn Dash: move your ivory chess pawn over the checkerboard lanes and avoid the crimson pawns');
 const controls=document.createElement('div');controls.className='pawn-world-controls';controls.setAttribute('aria-label','Pawn Dash movement controls');
 controls.innerHTML='<button type="button" data-direction="left" aria-label="Move left">◀</button><button type="button" data-direction="forward" aria-label="Move forward">▲</button><button type="button" data-direction="back" aria-label="Move backward">▼</button><button type="button" data-direction="right" aria-label="Move right">▶</button>';
 const hint=document.createElement('p');hint.className='pawn-world-hint';hint.textContent='Arrow keys / WASD · Swipe or tap arrows · Dodge crimson pawns · Cross the board';
 root.append(canvas,controls,hint,menuButton,overlay);host.append(root);document.body.classList.add('pawn-dash-active');
 const ctx=canvas.getContext('2d');let width=640,height=630,raf=0,dead=false,player={x:4,row:0},camera=0,highest=0,lastMove=0,invincibleUntil=0,origin=performance.now(),touch=null;
 let hash=2166136261;for(const c of String(seed))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const roll=n=>{let x=(hash^Math.imul(n+19,2654435761))>>>0;x^=x>>>16;x=Math.imul(x,2246822507);x^=x>>>13;x=Math.imul(x,3266489909);x^=x>>>16;return x/4294967296};
 const lane=row=>row<=1||row%6===0?'grass':row%7===0?'river':row%5===0?'castle':'road';
 const size=()=>{const rect=canvas.getBoundingClientRect(),scale=Math.min(devicePixelRatio||1,(navigator.hardwareConcurrency||8)<=4?1.5:2);width=rect.width||640;height=rect.height||630;canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);ctx.setTransform(scale,0,0,scale,0,0)};
 const cellSize=()=>Math.min(width/10.3,height/10.7);
 const project=(x,row)=>{const tile=cellSize(),dy=row-camera;return [width*.50+(x-4)*tile,height*.74-dy*tile]};

 // Every decoration belongs to an absolute world row. The camera never re-rolls scenery.
 const round=(x,y,w,h,r,fill)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()};
 function tile(x,row,type,t){
  const [px,py]=project(x,row),u=cellSize(),left=px-u/2,top=py-u/2;
  const dark=(x+row)%2===0;
  const palette=type==='grass'?(dark?['#367658','#448d68']:['#448d68','#55a17b']):
                type==='road'?(dark?['#607285','#7a8da0']:['#718397','#899aad']):
                type==='castle'?(dark?['#726b83','#8c859a']:['#858097','#a29caf']):
                (dark?['#327998','#3896b4']:['#3c88a9','#4da5c0']);
  ctx.fillStyle='#132d38';ctx.fillRect(left,top+u*.07,u+.7,u);
  ctx.fillStyle=palette[0];ctx.fillRect(left,top,u+.7,u*.91);
  ctx.fillStyle=palette[1];ctx.fillRect(left+u*.05,top+u*.055,u*.9,u*.78);
  ctx.fillStyle='#e7f2e71a';ctx.fillRect(left+u*.07,top+u*.055,u*.86,u*.035);
  if(type==='road'||type==='castle'){
   // Alternating chess-board squares, with subtle etched diagonal marks.
   ctx.strokeStyle='#ffffff2b';ctx.lineWidth=1;ctx.strokeRect(left+u*.12,top+u*.14,u*.76,u*.61);
   if(type==='road'&&row%2===0){ctx.fillStyle='#f7dfad70';ctx.fillRect(left+u*.44,top+u*.38,u*.12,u*.12)}
  }else if(type==='river'){
   ctx.strokeStyle='#a9eef7b0';ctx.lineWidth=Math.max(1,u*.024);
   const wave=Math.sin(t*1.7+row+x)*u*.06;
   ctx.beginPath();ctx.moveTo(left+u*.12,top+u*.28+wave);ctx.quadraticCurveTo(left+u*.52,top+u*.16+wave,left+u*.88,top+u*.28+wave);ctx.stroke();
   ctx.beginPath();ctx.moveTo(left+u*.2,top+u*.66-wave);ctx.lineTo(left+u*.68,top+u*.66-wave);ctx.stroke();
   if(isRiverGap(row,x)) {
    round(left+u*.13,top+u*.14,u*.74,u*.64,u*.11,'#102a40');
    ctx.strokeStyle='#75d8ef';ctx.lineWidth=Math.max(2,u*.035);ctx.strokeRect(left+u*.17,top+u*.18,u*.66,u*.55);
   }
  }else{
   if(roll(row*127+x*43)>.75){ctx.fillStyle='#bce5a54d';ctx.fillRect(left+u*.22,top+u*.39,u*.075,u*.11);ctx.fillRect(left+u*.68,top+u*.62,u*.065,u*.09)}
  }
 }
 function polygon(points,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();ctx.fill()}
 function scenery(){
  // Stationary horizon: no screen-space jitter when the player changes direction.
  const sky=ctx.createLinearGradient(0,0,0,height);
  sky.addColorStop(0,'#132b48');sky.addColorStop(.42,'#2e607a');sky.addColorStop(1,'#17374a');
  ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
  const sunX=width*.78,sunY=height*.15,sr=Math.min(width,height)*.04;
  ctx.fillStyle='#f8d6a2';ctx.beginPath();ctx.arc(sunX,sunY,sr,0,Math.PI*2);ctx.fill();
  polygon([[0,height*.45],[width*.16,height*.26],[width*.3,height*.42],[width*.48,height*.2],[width*.65,height*.43],[width*.83,height*.29],[width,height*.42],[width,height],[0,height]],'#24475b');
  polygon([[0,height*.53],[width*.2,height*.38],[width*.39,height*.53],[width*.61,height*.32],[width*.82,height*.51],[width,height*.38],[width,height],[0,height]],'#1b3b50');
  const y=height*.38;ctx.fillStyle='#1a3549';
  for(const fx of [.04,.89]){const bx=width*fx;ctx.fillRect(bx,y,width*.08,height*.17);ctx.fillRect(bx-width*.015,y-height*.03,width*.11,height*.04);ctx.fillRect(bx+width*.022,y-height*.1,width*.035,height*.1);ctx.fillStyle='#bed2d2';ctx.fillRect(bx+width*.032,y-height*.035,width*.015,height*.027);ctx.fillStyle='#1a3549'}
 }
 function tree(x,row){
  const [px,py]=project(x,row),u=cellSize(),v=roll(row*31+Math.round(x)*719);
  const s=u*(.72+v*.27),base=py+s*.34;
  ctx.fillStyle='#10283870';ctx.beginPath();ctx.ellipse(px,base,s*.47,s*.12,0,0,Math.PI*2);ctx.fill();
  round(px-s*.095,py-s*.73,s*.19,s*.91,s*.05,'#604a47');
  polygon([[px-s*.48,py-s*.26],[px,py-s*1.52],[px+s*.48,py-s*.26]],v>.45?'#286e62':'#2f7b63');
  polygon([[px-s*.4,py-s*.67],[px,py-s*1.77],[px+s*.4,py-s*.67]],'#3e9980');
  polygon([[px-s*.28,py-s*.97],[px,py-s*1.83],[px+s*.28,py-s*.97]],'#69b58b');
  ctx.strokeStyle='#b7dec18f';ctx.lineWidth=Math.max(1,s*.028);ctx.beginPath();ctx.moveTo(px-s*.2,py-s*.91);ctx.lineTo(px,py-s*1.55);ctx.stroke();
 }
 function drawPawn(x,row,enemy=false,scale=1,ghost=false){
  const [px,py]=project(x,row),u=cellSize()*scale;
  ctx.save();if(ghost)ctx.globalAlpha=.43+.18*Math.sin(performance.now()/90);
  ctx.fillStyle='#112a3b99';ctx.beginPath();ctx.ellipse(px,py+u*.29,u*.38,u*.13,0,0,Math.PI*2);ctx.fill();
  const outline=enemy?'#522b40':'#94703e',main=enemy?'#c65e79':'#fff0c5',light=enemy?'#ffafae':'#ffffff',low=enemy?'#873e5b':'#d3ae73';
  // Distinctive sculpted chess pawn: spherical head, narrow neck, flared pedestal.
  ctx.fillStyle=outline;ctx.beginPath();ctx.moveTo(px-u*.31,py+u*.19);ctx.lineTo(px+u*.31,py+u*.19);ctx.lineTo(px+u*.18,py-u*.07);ctx.lineTo(px+u*.12,py-u*.33);ctx.lineTo(px-u*.12,py-u*.33);ctx.lineTo(px-u*.18,py-u*.07);ctx.closePath();ctx.fill();
  const body=ctx.createLinearGradient(px-u*.28,0,px+u*.28,0);body.addColorStop(0,low);body.addColorStop(.38,main);body.addColorStop(1,low);
  ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(px-u*.27,py+u*.14);ctx.lineTo(px+u*.27,py+u*.14);ctx.lineTo(px+u*.15,py-u*.08);ctx.lineTo(px+u*.115,py-u*.32);ctx.lineTo(px-u*.115,py-u*.32);ctx.lineTo(px-u*.15,py-u*.08);ctx.closePath();ctx.fill();
  round(px-u*.34,py+u*.09,u*.68,u*.15,u*.035,outline);
  round(px-u*.295,py+u*.095,u*.59,u*.085,u*.03,main);
  round(px-u*.18,py-u*.41,u*.36,u*.105,u*.035,low);
  ctx.fillStyle=outline;ctx.beginPath();ctx.arc(px,py-u*.52,u*.225,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=main;ctx.beginPath();ctx.arc(px,py-u*.55,u*.20,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=light;ctx.beginPath();ctx.ellipse(px-u*.065,py-u*.63,u*.075,u*.042,-.5,0,Math.PI*2);ctx.fill();
  ctx.restore();
 }
 function hazard(row,k,t){
  const speed=(.55+roll(row*17+k*71)*1.35)*(roll(row*23+k*17)>.5?1:-1);
  return ((roll(row*41+k*13)*9+speed*t)%14+14)%14-2.5;
 }
 const isRiverGap=(row,x)=>roll(row*29+x*41)>.70;
 function collision(t){
  if(performance.now()<invincibleUntil)return false;
  const type=lane(player.row);
  if(type==='road'||type==='castle'){
   for(let k=0;k<(type==='castle'?1:2);k++)if(Math.abs(hazard(player.row,k,t)-player.x)<.55)return true;
  }
  if(type==='river'&&isRiverGap(player.row,player.x))return true;
  return false;
 }
 function hit(){invincibleUntil=performance.now()+1100;player={x:4,row:Math.max(0,highest-3)};onHit();}
 function move(dx,dy){if(dead||!overlay.hidden||performance.now()-lastMove<85)return;lastMove=performance.now();const nx=Math.max(0,Math.min(8,player.x+dx)),nr=Math.max(0,player.row+dy);if(nx===player.x&&nr===player.row)return;player={x:nx,row:nr};if(nr>highest){const gained=nr-highest;highest=nr;onScore(gained);if(nr%9===0)onStatus('Crown milestone! '+nr+' lanes crossed.');}if(collision((performance.now()-origin)/1000))hit();}
 const keys={ArrowUp:[0,1],KeyW:[0,1],ArrowDown:[0,-1],KeyS:[0,-1],ArrowLeft:[-1,0],KeyA:[-1,0],ArrowRight:[1,0],KeyD:[1,0]};
 function keydown(e){if(dead)return;if(e.code==='Escape'){e.preventDefault();setMenu(overlay.hidden);return}if(!overlay.hidden||!keys[e.code])return;if(e.target?.matches('input,textarea'))return;e.preventDefault();move(...keys[e.code]);}
 function click(e){if(e.detail===0){const button=e.target.closest('[data-direction]');if(!button)return;const dirs={left:[-1,0],right:[1,0],forward:[0,1],back:[0,-1]};move(...dirs[button.dataset.direction]);canvas.focus({preventScroll:true})}}
 function pointerMove(e){const button=e.target.closest('[data-direction]');if(!button)return;e.preventDefault();const dirs={left:[-1,0],right:[1,0],forward:[0,1],back:[0,-1]};move(...dirs[button.dataset.direction]);}
 function touchstart(e){if(e.touches.length===1)touch={x:e.touches[0].clientX,y:e.touches[0].clientY};}
 function touchend(e){if(!touch||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;move(...(Math.abs(dx)>Math.abs(dy)?[Math.sign(dx),0]:[0,-Math.sign(dy)]));}
 function frame(now){
  if(dead)return;
  if(!overlay.hidden){origin+=16;raf=requestAnimationFrame(frame);return}
  const t=(now-origin)/1000;
  camera+=(Math.max(0,player.row-4)-camera)*.11;
  ctx.clearRect(0,0,width,height);scenery();
  const low=Math.max(0,Math.floor(camera)-3),high=Math.max(10,Math.floor(camera)+Math.ceil(height/cellSize()*.78)+5);
  // Depth order: ground first, then rooted trees and actors. Nothing can cover or replace scenery.
  for(let row=high;row>=low;row--){
   const type=lane(row);
   for(let x=0;x<9;x++)tile(x,row,type,t);
  }
  for(let row=high;row>=low;row--){
   if(row%2===0){
    if(roll(row*13+199)>.20)tree(-1.15,row);
    if(roll(row*13+397)>.20)tree(9.15,row);
   }
  }
  for(let row=high;row>=low;row--){
   const type=lane(row);
   if(type==='road'||type==='castle')for(let k=0;k<(type==='castle'?1:2);k++){
    const x=hazard(row,k,t);if(x>=-.5&&x<=8.5)drawPawn(x,row,true,.98);
   }
  }
  drawPawn(player.x,player.row,false,1.12,now<invincibleUntil);
  // Compact, legible scoreplate in the upper right.
  const w=Math.min(216,width*.55),left=width-w-12;
  round(left,12,w,78,12,'#10263de8');
  ctx.strokeStyle='#d6b77d9e';ctx.lineWidth=1.5;ctx.strokeRect(left+5,17,w-10,68);
  ctx.fillStyle='#ffe8b4';ctx.textAlign='right';ctx.font='bold 14px system-ui';ctx.fillText('PAWN KINGDOM',width-24,37);
  ctx.fillStyle='#f6fcff';ctx.font='bold 21px system-ui';ctx.fillText('LANES  '+highest,width-24,65);
  if(collision(t))hit();
  raf=requestAnimationFrame(frame);
 }
 let hiddenAt=0,pausedForVisibility=false;
 function visibilityChanged(){
  if(dead)return;
  if(document.hidden){
   if(hiddenAt)return;
   hiddenAt=performance.now();pausedForVisibility=overlay.hidden;
   if(pausedForVisibility)onPauseChange(true);
   cancelAnimationFrame(raf);raf=0;
  }else if(hiddenAt){
   const elapsed=performance.now()-hiddenAt;
   origin+=elapsed;invincibleUntil+=elapsed;hiddenAt=0;
   if(pausedForVisibility)onPauseChange(false);
   pausedForVisibility=false;
   raf=requestAnimationFrame(frame);
  }
 }
 document.addEventListener('visibilitychange',visibilityChanged);
 window.addEventListener('keydown',keydown);controls.addEventListener('click',click);controls.addEventListener('pointerdown',pointerMove);canvas.addEventListener('touchstart',touchstart,{passive:true});canvas.addEventListener('touchend',touchend,{passive:true});window.addEventListener('resize',size);size();raf=requestAnimationFrame(frame);
 return {destroy(){dead=true;cancelAnimationFrame(raf);window.removeEventListener('keydown',keydown);window.removeEventListener('resize',size);document.removeEventListener('visibilitychange',visibilityChanged);controls.removeEventListener('click',click);controls.removeEventListener('pointerdown',pointerMove);canvas.removeEventListener('touchstart',touchstart);canvas.removeEventListener('touchend',touchend);root.remove();document.body.classList.remove('pawn-dash-active')},getProgress:()=>highest};
}
