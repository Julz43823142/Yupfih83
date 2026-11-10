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
 const model=createPawnDashModel(seed);const {random:roll,lane,collision,enemyCount,enemyX,enemyKind,difficulty,isBridge}=model;
 const size=()=>{
  const rect=canvas.getBoundingClientRect();
  const scale=Math.min(window.devicePixelRatio||1,(navigator.hardwareConcurrency||8)<=4?1.5:2);
  width=rect.width||640;height=rect.height||630;
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  ctx.setTransform(scale,0,0,scale,0,0);
 };
 const cellSize=()=>Math.min(width/9.45,height/9.2,104);
 // Project the squares onto one consistent oblique chessboard plane.
 // One step up always equals the exact opposite edge of the next row.
 const project=(x,row)=>{
  const u=cellSize(),distance=row-camera;
  return [width*.50+(x-4)*u,height*.69-distance*u*.83];
 };
 const quad=(x,row)=>{
  const [px,py]=project(x,row),u=cellSize(),v=0,d=u*.83;
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
  const q=quad(x,row),u=cellSize(),cx=project(x,row)[0],cy=project(x,row)[1];
  // One quiet, continuous world: grass, slate paths, sandstone courtyards and blue water.
  const dark=(x+row)%2===0;
  const base=type==='meadow'?(dark?'#80b68c':'#8ec29a'):
             type==='road'?(dark?'#6d7877':'#788481'):
             type==='court'?(dark?'#ac9c7d':'#b9a98b'):
             (dark?'#408ba2':'#4695ad');
  const border=type==='meadow'?'#609678':type==='road'?'#566765':
               type==='court'?'#8d826b':'#26718c';
  // Block sides give weight without creating false extra squares.
  polygon([q[3],q[2],[q[2][0],q[2][1]+u*.125],[q[3][0],q[3][1]+u*.125]],border);
  polygon(q,base);
  ctx.lineWidth=Math.max(1,u*.027);
  strokePolygon(q,border,ctx.lineWidth);
  if(type==='road'){
   // A complete road stripe: each cell shares one horizontal lane surface.
   ctx.fillStyle='#d9d4bd4b';
   ctx.fillRect(cx-u*.48,cy-u*.035,u*.96,u*.07);
   if(x===0||x===8){ctx.fillStyle='#e4d5b574';ctx.fillRect(cx+(x===0?-u*.44:u*.39),cy-u*.32,u*.055,u*.65)}
  }else if(type==='court'){
   // Carved square joints and a small royal emblem; no purple squares.
   ctx.strokeStyle='#eee1c084';ctx.lineWidth=Math.max(1,u*.016);
   ctx.strokeRect(cx-u*.31,cy-u*.28,u*.62,u*.54);
   if(x===4&&row%2===0){
    ctx.fillStyle='#e8d7a2';ctx.beginPath();ctx.arc(cx,cy,u*.08,0,Math.PI*2);ctx.fill();
   }
  }else if(type==='meadow'){
   if(roll(row*101+x*17)>.78){
    ctx.fillStyle='#add5a68b';ctx.beginPath();ctx.ellipse(cx-u*.23,cy+u*.10,u*.12,u*.035,-.2,0,Math.PI*2);ctx.fill();
   }
  }else if(isBridge(row,x)){
   // Exactly three adjoining sandstone bridge squares, safe to cross.
   polygon([[cx-u*.48,cy-u*.37],[cx+u*.48,cy-u*.37],[cx+u*.48,cy+u*.36],[cx-u*.48,cy+u*.36]],'#d9c39a');
   ctx.strokeStyle='#a69374';ctx.lineWidth=Math.max(1,u*.03);
   ctx.strokeRect(cx-u*.45,cy-u*.34,u*.9,u*.68);
   ctx.beginPath();ctx.moveTo(cx-u*.42,cy);ctx.lineTo(cx+u*.42,cy);ctx.stroke();
  }else{
   const wave=Math.sin(time*1.7+row*.38+x*.9)*u*.03;
   ctx.strokeStyle='#b5e7e5b1';ctx.lineWidth=Math.max(1.5,u*.025);
   ctx.beginPath();ctx.moveTo(cx-u*.32,cy+wave);ctx.quadraticCurveTo(cx,cy-u*.08+wave,cx+u*.32,cy+wave);ctx.stroke();
  }
 }
 // Strong, persistent position cue: the marked square is the player's collision square.
 // During a hop the moving piece can briefly be between two squares, but its landing
 // square stays illuminated. This makes precise navigation readable on phone screens.
 function playerSquare(){
  const q=quad(player.x,player.row),u=cellSize(),[px,py]=project(player.x,player.row);
  ctx.save();
  ctx.fillStyle='#fff2b056';polygon(q,'#ffed9e58');
  strokePolygon(q,'#fff8de',Math.max(3,u*.08));
  ctx.strokeStyle='#b87e3e';ctx.lineWidth=Math.max(1.5,u*.035);
  ctx.beginPath();ctx.ellipse(px,py+u*.14,u*.31,u*.16,0,0,Math.PI*2);ctx.stroke();
  ctx.restore();
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
 function pawnBase(px,py,u,dark,base,light){
  // All pieces stand on the same simple plinth, leaving plenty of free square visible.
  round(px-u*.24,py+u*.06,u*.48,u*.11,u*.025,dark);
  round(px-u*.205,py+u*.055,u*.41,u*.07,u*.025,base);
  polygon([[px-u*.17,py+u*.045],[px+u*.17,py+u*.045],
           [px+u*.105,py-u*.35],[px-u*.105,py-u*.35]],dark);
  const g=ctx.createLinearGradient(px-u*.2,0,px+u*.2,0);
  g.addColorStop(0,base);g.addColorStop(.45,light);g.addColorStop(1,base);
  polygon([[px-u*.145,py+u*.02],[px+u*.145,py+u*.02],
           [px+u*.087,py-u*.33],[px-u*.087,py-u*.33]],g);
  round(px-u*.15,py-u*.385,u*.30,u*.075,u*.025,dark);
 }
 function drawPawn(x,row,enemy=false,scale=1,ghost=false,jump=0){
  const [px,gy]=project(x,row),u=cellSize()*scale,py=gy+u*.23-jump*u*.34;
  ctx.save();
  if(ghost)ctx.globalAlpha=.48+.38*Math.abs(Math.sin(performance.now()/125));
  ctx.fillStyle='#183b365c';ctx.beginPath();ctx.ellipse(px,gy+u*.20,u*.26,u*.10,0,0,Math.PI*2);ctx.fill();
  const dark=enemy?'#653a44':'#7d633f',base=enemy?'#bb646c':'#e9d4a6',light=enemy?'#f2a1a3':'#fff6dc';
  pawnBase(px,py,u,dark,base,light);
  ctx.fillStyle=dark;ctx.beginPath();ctx.arc(px,py-u*.52,u*.19,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=light;ctx.beginPath();ctx.arc(px,py-u*.54,u*.167,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fffdf0';ctx.beginPath();ctx.ellipse(px-u*.06,py-u*.61,u*.055,u*.028,-.5,0,Math.PI*2);ctx.fill();
  if(!enemy){ctx.fillStyle='#c7a663';ctx.fillRect(px-u*.1,py-u*.38,u*.20,u*.028)}
  ctx.restore();
 }
 function drawEnemy(x,row,kind,scale=1){
  if(kind==='pawn'){drawPawn(x,row,true,scale);return}
  const [px,gy]=project(x,row),u=cellSize()*scale,py=gy+u*.22;
  const dark='#343d51',base='#647289',light='#aebfd0',trim='#e9b870';
  ctx.save();
  ctx.fillStyle='#142e3f65';ctx.beginPath();ctx.ellipse(px,gy+u*.22,u*.30,u*.105,0,0,Math.PI*2);ctx.fill();
  pawnBase(px,py,u,dark,base,light);
  if(kind==='rook'){
   round(px-u*.20,py-u*.64,u*.4,u*.29,u*.017,dark);
   round(px-u*.17,py-u*.60,u*.34,u*.19,u*.014,base);
   for(let k=0;k<3;k++)round(px-u*.21+k*u*.145,py-u*.72,u*.12,u*.14,u*.015,light);
   round(px-u*.22,py-u*.52,u*.44,u*.05,u*.015,trim);
  }else if(kind==='knight'){
   polygon([[px-u*.19,py-u*.34],[px-u*.11,py-u*.62],[px-u*.25,py-u*.73],
    [px-u*.08,py-u*.92],[px+u*.09,py-u*.88],[px+u*.24,py-u*.52],
    [px+u*.12,py-u*.36]],dark);
   polygon([[px-u*.14,py-u*.45],[px-u*.06,py-u*.64],[px-u*.18,py-u*.73],
    [px-u*.07,py-u*.84],[px+u*.055,py-u*.83],[px+u*.17,py-u*.48]],light);
   ctx.fillStyle=dark;ctx.beginPath();ctx.arc(px-u*.085,py-u*.75,u*.027,0,Math.PI*2);ctx.fill();
  }else if(kind==='bishop'){
   polygon([[px-u*.17,py-u*.42],[px-u*.13,py-u*.73],[px,py-u*.93],
    [px+u*.13,py-u*.73],[px+u*.17,py-u*.42]],dark);
   polygon([[px-u*.13,py-u*.45],[px-u*.10,py-u*.7],[px,py-u*.86],
    [px+u*.10,py-u*.7],[px+u*.13,py-u*.45]],light);
   ctx.strokeStyle=trim;ctx.lineWidth=Math.max(2,u*.032);
   ctx.beginPath();ctx.moveTo(px+u*.085,py-u*.78);ctx.lineTo(px-u*.075,py-u*.55);ctx.stroke();
  }else{ // queen, introduced after the first milestone
   polygon([[px-u*.18,py-u*.43],[px-u*.25,py-u*.84],[px-u*.12,py-u*.69],
    [px,py-u*.96],[px+u*.12,py-u*.69],[px+u*.25,py-u*.84],
    [px+u*.18,py-u*.43]],dark);
   polygon([[px-u*.15,py-u*.48],[px-u*.19,py-u*.77],[px-u*.10,py-u*.64],
    [px,py-u*.86],[px+u*.10,py-u*.64],[px+u*.19,py-u*.77],
    [px+u*.15,py-u*.48]],light);
   round(px-u*.21,py-u*.49,u*.42,u*.07,u*.018,trim);
   ctx.fillStyle=trim;ctx.beginPath();ctx.arc(px,py-u*.9,u*.055,0,Math.PI*2);ctx.fill();
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
  if(nr>highest){const gained=nr-highest;highest=nr;onScore(gained);if([100,500,750].includes(nr))onStatus('New level: '+(nr===100?'CHALLENGER':nr===500?'MASTER':'GRANDMASTER')+'! More chess pieces approach.')}
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
  playerSquare();
  for(let row=high;row>=low;row--){
   if(row%2===0){
    if(roll(row*13+199)>.16)tree(-1.1,row);
    if(roll(row*13+397)>.16)tree(9.1,row);
   }
   const type=lane(row);
   if(type==='road'||type==='court'){
    for(let k=0;k<enemyCount(row);k++){
     const x=enemyX(row,k,time);
     if(x>=-.65&&x<=8.65)drawEnemy(x,row,enemyKind(row,k),.92);
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
    drawPawn(x,r,false,.97,now<invincibleUntil,jump);
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
  const tier=difficulty(highest),badge=tier===0?'ROOKIE':tier===1?'CHALLENGER':tier===2?'MASTER':'GRANDMASTER';
  ctx.textAlign='left';ctx.font='bold 12px system-ui';ctx.fillStyle='#fff8df';
  ctx.fillText('♟ '+String.fromCharCode(97+player.x)+(player.row+1)+'  ·  '+badge,16,height*.07);
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
