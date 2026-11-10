import {createPawnDashModel} from './pawn-world-logic.mjs';
// Original EloScanner Pawn Dash: a chess-themed, perspective crossing game.
// No game sprites, levels or assets from third-party titles are used.
export function createPawnWorld({host,seed,onScore,onHit,onStatus,onPauseChange=()=>{}}){
 const root=document.createElement('div');root.className='pawn-world pawn-world-immersive';
 const menuButton=document.createElement('button');menuButton.type='button';menuButton.className='pawn-world-menu-button';menuButton.textContent='☰ Menu';menuButton.setAttribute('aria-label','Open game menu');
 const overlay=document.createElement('div');overlay.className='pawn-world-overlay';overlay.hidden=true;
 const menuTitle=document.createElement('h2');menuTitle.textContent='Pawn Kingdom';
 const resume=document.createElement('button');resume.type='button';resume.textContent='Resume game';
 const exit=document.createElement('button');exit.type='button';exit.textContent='Exit to minigames';
 const menuHelp=document.createElement('p');menuHelp.textContent='Tap the board to hop forward · Swipe or use arrow buttons to steer · Cross rivers on cream-coloured bridges · Esc pauses';
 overlay.append(menuTitle,resume,exit,menuHelp);
 const setMenu=open=>{if(!open&&pausedAt){const delta=performance.now()-pausedAt;origin+=delta;invincibleUntil+=delta;if(hop)hop.since+=delta;pausedAt=0;}if(open&&!pausedAt)pausedAt=performance.now();overlay.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));onPauseChange(open);if(!open)canvas.focus({preventScroll:true})};
 menuButton.onclick=()=>setMenu(overlay.hidden);resume.onclick=()=>setMenu(false);exit.onclick=()=>{location.href='/minigames.html'};
 const canvas=document.createElement('canvas');canvas.className='pawn-world-canvas';canvas.tabIndex=0;
 canvas.setAttribute('aria-label','Pawn Dash: tap to hop forward, swipe to steer your ivory chess pawn across squares; avoid red pawns and cross the river on stone bridges');
 const controls=document.createElement('div');controls.className='pawn-world-controls';controls.setAttribute('aria-label','Pawn Dash movement controls');
 controls.innerHTML='<button type="button" data-direction="left" aria-label="Move left">◀</button><button type="button" data-direction="forward" aria-label="Move forward">▲</button><button type="button" data-direction="back" aria-label="Move backward">▼</button><button type="button" data-direction="right" aria-label="Move right">▶</button>';
 const hint=document.createElement('p');hint.className='pawn-world-hint';hint.textContent='Tap to hop · Swipe to steer · Avoid red pawns · Cross on stone bridges';
 root.append(canvas,controls,hint,menuButton,overlay);host.append(root);document.body.classList.add('pawn-dash-active');
 const ctx=canvas.getContext('2d');let width=640,height=630,raf=0,dead=false,player={x:4,row:0},camera=0,highest=0,lastMove=0,invincibleUntil=0,origin=performance.now(),pointer=null,pausedAt=0,hop=null;
 const model=createPawnDashModel(seed);const {random:roll,lane,collision,enemyCount,enemyX,isBridge}=model;
 const size=()=>{
  const rect=canvas.getBoundingClientRect();
  const scale=Math.min(window.devicePixelRatio||1,(navigator.hardwareConcurrency||8)<=4?1.5:2);
  width=rect.width||640;height=rect.height||630;
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  ctx.setTransform(scale,0,0,scale,0,0);
 };
 const cellSize=()=>Math.min(width/10.7,height/9.25,112);
 // Project the squares onto one consistent oblique chessboard plane.
 // One step up always equals the exact opposite edge of the next row.
 const project=(x,row)=>{
  const u=cellSize(),distance=row-camera;
  return [width*.50+(x-4)*u+distance*u*.16,height*.69-distance*u*.79];
 };
 const quad=(x,row)=>{
  const [px,py]=project(x,row),u=cellSize(),v=u*.16,d=u*.79;
  return [[px-u*.5+v*.5,py-d*.5],[px+u*.5+v*.5,py-d*.5],
          [px+u*.5-v*.5,py+d*.5],[px-u*.5-v*.5,py+d*.5]];
 };

 // All decorations, hazards, bridges and colours are deterministic in world coordinates.
 function polygon(points,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();ctx.fill()}
 function strokePolygon(points,color,line=1){ctx.strokeStyle=color;ctx.lineWidth=line;ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();ctx.stroke()}
 function round(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
 function scenery(){
  const sky=ctx.createLinearGradient(0,0,0,height);
  sky.addColorStop(0,'#162b46');sky.addColorStop(.52,'#447b8b');sky.addColorStop(1,'#18364c');
  ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
  const sun=ctx.createRadialGradient(width*.79,height*.19,2,width*.79,height*.19,height*.26);
  sun.addColorStop(0,'#ffdcac66');sun.addColorStop(1,'#ffdcac00');
  ctx.fillStyle=sun;ctx.fillRect(0,0,width,height*.7);
  ctx.fillStyle='#ffe1b1';ctx.beginPath();ctx.arc(width*.79,height*.17,Math.min(width,height)*.035,0,Math.PI*2);ctx.fill();
  polygon([[0,height*.49],[width*.09,height*.36],[width*.22,height*.47],[width*.4,height*.24],[width*.56,height*.46],[width*.73,height*.31],[width*.89,height*.45],[width,height*.29],[width,height],[0,height]],'#365e72');
  polygon([[0,height*.57],[width*.15,height*.44],[width*.3,height*.56],[width*.52,height*.39],[width*.67,height*.56],[width*.84,height*.43],[width,height*.53],[width,height],[0,height]],'#284b5b');
  // Distant rook towers are scenery, not hazards.
  ctx.fillStyle='#1e3c50';
  for(const at of [.06,.91]){
   const x=width*at,y=height*.38,w=Math.min(width*.065,44);
   ctx.fillRect(x,y,w,height*.24);ctx.fillRect(x-w*.17,y-w*.32,w*1.34,w*.38);
   for(let k=0;k<3;k++)ctx.fillRect(x+k*w*.36,y-w*.65,w*.25,w*.43);
   ctx.fillStyle='#c9a972';ctx.fillRect(x+w*.42,y+w*.4,w*.17,w*.27);
   ctx.fillStyle='#1e3c50';
  }
  // The world floats in front of a quiet wooded valley.
  ctx.fillStyle='#214c47';ctx.fillRect(0,height*.82,width,height*.18);
 }
 function tile(x,row,type,time){
  const points=quad(x,row),u=cellSize(),dark=(x+row)%2===0;
  const pal={
   meadow:dark?['#568d79','#79b193']:['#83b998','#aed3a9'],
   road:dark?['#455b70','#60788b']:['#677d91','#849aab'],
   court:dark?['#716580','#867990']:['#887e9b','#a89fba'],
   river:dark?['#23718d','#3489a6']:['#307f9a','#419cb8']
  }[type];
  const edge=points.slice(2).map(([px,py])=>[px,py+u*.14]);
  polygon([points[3],points[2],edge[0],edge[1]],type==='meadow'?'#3d6654':'#203a53');
  polygon(points,pal[0]);
  const cx=(points[0][0]+points[2][0])/2,cy=(points[0][1]+points[2][1])/2;
  ctx.save();ctx.translate(cx,cy);
  ctx.fillStyle=pal[1];
  polygon([[-u*.41,-u*.29],[u*.44,-u*.29],[u*.39,u*.26],[-u*.44,u*.26]],pal[1]);
  ctx.restore();
  strokePolygon(points,'#163b4755',1.2);
  if(type==='meadow'){
   // Tiny embossed crown marks read as decoration, never as obstacles.
   if(roll(row*101+x*17)>.72){
    ctx.fillStyle='#d8eab65c';ctx.beginPath();ctx.arc(cx,cy,u*.09,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#285b4a77';ctx.fillRect(cx-u*.016,cy-u*.12,u*.032,u*.19);
   }
  }
  if(type==='road'||type==='court'){
   ctx.strokeStyle=type==='court'?'#e8c98a8c':'#d3e2da55';
   ctx.lineWidth=Math.max(1,u*.018);
   ctx.beginPath();ctx.moveTo(points[0][0]+u*.14,points[0][1]+u*.12);
   ctx.lineTo(points[1][0]-u*.14,points[1][1]+u*.12);ctx.stroke();
   if(x===4&&row%2===0){
    round(cx-u*.12,cy-u*.025,u*.24,u*.05,u*.016,'#f8e1a78e');
   }
  }
  if(type==='river'){
   if(isBridge(row,x)){
    // A thick, clearly walkable stone bridge replaces random invisible water gaps.
    polygon([[cx-u*.39,cy-u*.28],[cx+u*.39,cy-u*.28],
             [cx+u*.37,cy+u*.30],[cx-u*.37,cy+u*.30]],'#d6c4a0');
    ctx.strokeStyle='#f7e8c7';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(cx-u*.32,cy-u*.12);ctx.lineTo(cx+u*.31,cy-u*.12);ctx.stroke();
    ctx.strokeStyle='#8b8274';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(cx-u*.32,cy+u*.13);ctx.lineTo(cx+u*.32,cy+u*.13);ctx.stroke();
   }else{
    ctx.strokeStyle='#9cdef080';ctx.lineWidth=Math.max(1.5,u*.025);
    const wave=Math.sin(time*1.4+x*2+row)*u*.027;
    ctx.beginPath();ctx.moveTo(cx-u*.29,cy-u*.06+wave);
    ctx.quadraticCurveTo(cx,cy-u*.14+wave,cx+u*.29,cy-u*.06+wave);ctx.stroke();
    // Waves mark deadly water: only cream bridge stones are safe.
    ctx.fillStyle='#153c5777';ctx.beginPath();ctx.arc(cx,cy+u*.11,u*.055,0,Math.PI*2);ctx.fill();
   }
  }
 }
 function tree(x,row){
  const [px,py]=project(x,row),u=cellSize(),v=roll(row*17+(x<0?97:131));
  const s=u*(1.0+v*.27);
  ctx.fillStyle='#0d314078';ctx.beginPath();ctx.ellipse(px,py+s*.21,s*.46,s*.13,0,0,Math.PI*2);ctx.fill();
  round(px-s*.13,py-s*.72,s*.26,s*.9,s*.065,'#71554a');
  polygon([[px-s*.55,py-s*.3],[px,py-s*1.3],[px+s*.55,py-s*.3]],'#255d56');
  polygon([[px-s*.47,py-s*.65],[px,py-s*1.72],[px+s*.47,py-s*.65]],v>.5?'#347e69':'#367c60');
  polygon([[px-s*.33,py-s*1.03],[px,py-s*1.98],[px+s*.33,py-s*1.03]],'#65af81');
  ctx.strokeStyle='#a1d6a67a';ctx.lineWidth=Math.max(1,u*.023);
  ctx.beginPath();ctx.moveTo(px-s*.21,py-s*1.04);ctx.lineTo(px,py-s*1.61);ctx.stroke();
 }
 function drawPawn(x,row,enemy=false,scale=1,ghost=false,jump=0){
  const [px,groundY]=project(x,row);
  const u=cellSize()*scale,py=groundY+u*.18-jump*u*.27;
  ctx.save();if(ghost)ctx.globalAlpha=.42+.42*Math.abs(Math.sin(performance.now()/125));
  ctx.fillStyle='#102a3d77';ctx.beginPath();ctx.ellipse(px,groundY+u*.24,u*.45*(1-jump*.23),u*.14,0,0,Math.PI*2);ctx.fill();
  const dark=enemy?'#612e48':'#806039',base=enemy?'#ad4e70':'#ebd7a5',mid=enemy?'#dd7694':'#fff1cc',high=enemy?'#ffc4c9':'#fffdf0';
  // Chunky sculpted pawn: thick plinth, tapering collar and large spherical head.
  round(px-u*.34,py+u*.045,u*.68,u*.18,u*.055,dark);
  round(px-u*.30,py+u*.04,u*.60,u*.11,u*.035,base);
  polygon([[px-u*.235,py+u*.045],[px+u*.235,py+u*.045],
           [px+u*.135,py-u*.42],[px-u*.135,py-u*.42]],dark);
  const light=ctx.createLinearGradient(px-u*.3,0,px+u*.3,0);
  light.addColorStop(0,base);light.addColorStop(.45,mid);light.addColorStop(1,base);
  polygon([[px-u*.2,py+u*.005],[px+u*.2,py+u*.005],
           [px+u*.105,py-u*.38],[px-u*.105,py-u*.38]],light);
  round(px-u*.20,py-u*.46,u*.40,u*.12,u*.05,dark);
  round(px-u*.165,py-u*.46,u*.33,u*.08,u*.04,base);
  ctx.fillStyle=dark;ctx.beginPath();ctx.arc(px,py-u*.66,u*.26,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=mid;ctx.beginPath();ctx.arc(px,py-u*.685,u*.23,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=high;ctx.beginPath();ctx.ellipse(px-u*.075,py-u*.765,u*.085,u*.057,-.5,0,Math.PI*2);ctx.fill();
  if(!enemy){
   ctx.fillStyle='#d0a75b';ctx.fillRect(px-u*.135,py-u*.46,u*.27,u*.035);
   ctx.strokeStyle='#fffbddaa';ctx.lineWidth=Math.max(1.5,u*.02);
   ctx.beginPath();ctx.moveTo(px-u*.115,py-u*.32);ctx.lineTo(px-u*.165,py-u*.05);ctx.stroke();
  }else{
   ctx.fillStyle='#ffe1d8';ctx.beginPath();ctx.arc(px-u*.065,py-u*.655,u*.03,0,Math.PI*2);ctx.fill();
   ctx.beginPath();ctx.arc(px+u*.065,py-u*.655,u*.03,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
 }
 function safeRespawn(){
  let row=Math.max(0,highest-3);
  while(row>0&&lane(row)!=='meadow')row--;
  return {x:4,row};
 }
 function hit(){invincibleUntil=performance.now()+1500;player=safeRespawn();hop=null;onHit();}
 function move(dx,dy){
  const now=performance.now();
  if(dead||!overlay.hidden||now-lastMove<68)return;
  const nx=Math.max(0,Math.min(8,player.x+dx)),nr=Math.max(0,player.row+dy);
  if(nx===player.x&&nr===player.row)return;
  lastMove=now;hop={from:{...player},to:{x:nx,row:nr},since:now};player={x:nx,row:nr};
  if(nr>highest){const gained=nr-highest;highest=nr;onScore(gained);if(nr%10===0)onStatus('Milestone! '+nr+' squares crossed.')}
  if(collision(nx,nr,(now-origin)/1000))hit();
 }
 const keys={ArrowUp:[0,1],KeyW:[0,1],ArrowDown:[0,-1],KeyS:[0,-1],ArrowLeft:[-1,0],KeyA:[-1,0],ArrowRight:[1,0],KeyD:[1,0]};
 function keydown(e){if(dead)return;if(e.code==='Escape'){e.preventDefault();setMenu(overlay.hidden);return}if(!overlay.hidden||!keys[e.code])return;if(e.target?.matches('input,textarea'))return;e.preventDefault();move(...keys[e.code]);}
 const dirs={left:[-1,0],right:[1,0],forward:[0,1],back:[0,-1]};
 // Pointerdown handles physical taps exactly once. Keyboard-generated clicks stay accessible.
 function controlPointer(e){
  const button=e.target.closest('[data-direction]');if(!button||!e.isPrimary)return;
  e.preventDefault();move(...dirs[button.dataset.direction]);
 }
 function controlClick(e){
  if(e.detail!==0)return;
  const button=e.target.closest('[data-direction]');if(button)move(...dirs[button.dataset.direction]);
 }
 function gestureStart(e){
  if(!e.isPrimary||!overlay.hidden)return;
  e.preventDefault();pointer={id:e.pointerId,x:e.clientX,y:e.clientY};
  try{canvas.setPointerCapture(e.pointerId)}catch{}
 }
 function gestureEnd(e){
  if(!pointer||pointer.id!==e.pointerId)return;
  e.preventDefault();
  const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;
  if(Math.max(Math.abs(dx),Math.abs(dy))<23){move(0,1);return}
  move(...(Math.abs(dx)>Math.abs(dy)?[Math.sign(dx),0]:[0,-Math.sign(dy)]));
 }
 function gestureCancel(){pointer=null}
 function preventZoom(e){e.preventDefault()}
 function frame(now){
  if(dead)return;
  if(!overlay.hidden){raf=requestAnimationFrame(frame);return}
  const time=(now-origin)/1000;
  camera+=(Math.max(0,player.row-3.3)-camera)*.14;
  ctx.clearRect(0,0,width,height);scenery();
  const u=cellSize(),low=Math.max(0,Math.floor(camera-height*.36/(u*.79))-3);
  const high=Math.max(10,Math.ceil(camera+height*.76/(u*.79))+3);
  for(let row=high;row>=low;row--){
   const type=lane(row);
   for(let x=0;x<9;x++)tile(x,row,type,time);
  }
  for(let row=high;row>=low;row--){
   if(row%2===0){
    if(roll(row*13+199)>.16)tree(-1.1,row);
    if(roll(row*13+397)>.16)tree(9.1,row);
   }
   const type=lane(row);
   if(type==='road'||type==='court'){
    for(let k=0;k<enemyCount(row);k++){
     const x=enemyX(row,k,time);
     if(x>=-.65&&x<=8.65)drawPawn(x,row,true,type==='court'?1.08:1.02);
    }
   }
   if(row===player.row){
    let x=player.x,r=player.row,jump=0;
    if(hop){
     const progress=Math.min(1,(now-hop.since)/165);
     x=hop.from.x+(hop.to.x-hop.from.x)*progress;
     r=hop.from.row+(hop.to.row-hop.from.row)*progress;
     jump=Math.sin(progress*Math.PI);
     if(progress>=1)hop=null;
    }
    drawPawn(x,r,false,1.31,now<invincibleUntil,jump);
   }
  }
  // HUD is intentionally detached from the camera and has a consistent hit-free area.
  const w=Math.min(204,width*.51),left=width-w-12;
  round(left,12,w,79,13,'#0c253be8');
  ctx.strokeStyle='#dfca92b5';ctx.lineWidth=1.4;ctx.strokeRect(left+5,17,w-10,69);
  ctx.textAlign='right';ctx.fillStyle='#ffe3ae';ctx.font='bold 13px system-ui';
  ctx.fillText('PAWN KINGDOM',width-24,37);
  ctx.fillStyle='#fff9e9';ctx.font='bold 23px system-ui';
  ctx.fillText(''+highest+'  SQUARES',width-24,68);
  if(collision(player.x,player.row,time)&&now>=invincibleUntil)hit();
  if(!dead)raf=requestAnimationFrame(frame);
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
   origin+=elapsed;invincibleUntil+=elapsed;if(hop)hop.since+=elapsed;hiddenAt=0;
   if(pausedForVisibility)onPauseChange(false);
   pausedForVisibility=false;
   raf=requestAnimationFrame(frame);
  }
 }
 document.addEventListener('visibilitychange',visibilityChanged);
 window.addEventListener('keydown',keydown);
 controls.addEventListener('click',controlClick);
 controls.addEventListener('pointerdown',controlPointer);
 canvas.addEventListener('pointerdown',gestureStart,{passive:false});
 canvas.addEventListener('pointerup',gestureEnd,{passive:false});
 canvas.addEventListener('pointercancel',gestureCancel);
 root.addEventListener('dblclick',preventZoom,{passive:false});
 window.addEventListener('resize',size);
 size();raf=requestAnimationFrame(frame);
 return {
  destroy(){
   dead=true;cancelAnimationFrame(raf);
   window.removeEventListener('keydown',keydown);window.removeEventListener('resize',size);
   document.removeEventListener('visibilitychange',visibilityChanged);
   controls.removeEventListener('click',controlClick);
   controls.removeEventListener('pointerdown',controlPointer);
   canvas.removeEventListener('pointerdown',gestureStart);
   canvas.removeEventListener('pointerup',gestureEnd);
   canvas.removeEventListener('pointercancel',gestureCancel);
   root.removeEventListener('dblclick',preventZoom);
   root.remove();document.body.classList.remove('pawn-dash-active');
  },
  getProgress:()=>highest
 };
}
