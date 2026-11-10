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
 canvas.setAttribute('aria-label','Pawn Dash: arrow keys or WASD to hop between chess-themed roads');
 const controls=document.createElement('div');controls.className='pawn-world-controls';
 controls.innerHTML='<button type="button" data-direction="left" aria-label="Left">◀</button><button type="button" data-direction="forward" aria-label="Forward">▲</button><button type="button" data-direction="back" aria-label="Backward">▼</button><button type="button" data-direction="right" aria-label="Right">▶</button>';
 const hint=document.createElement('p');hint.className='pawn-world-hint';hint.textContent='Arrow keys / WASD · Swipe or tap arrows · Dodge moving chess pieces · Collect golden crowns';
 root.append(canvas,controls,hint,menuButton,overlay);host.append(root);document.body.classList.add('pawn-dash-active');
 const ctx=canvas.getContext('2d');let width=640,height=630,raf=0,dead=false,player={x:4,row:0},camera=0,highest=0,lastMove=0,invincibleUntil=0,origin=performance.now(),touch=null;
 let hash=2166136261;for(const c of String(seed))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const roll=n=>{let x=(hash^Math.imul(n+19,2654435761))>>>0;x^=x>>>16;x=Math.imul(x,2246822507);x^=x>>>13;x=Math.imul(x,3266489909);x^=x>>>16;return x/4294967296};
 const lane=row=>row<=1||row%6===0?'grass':row%7===0?'river':row%5===0?'castle':'road';
 const size=()=>{const rect=canvas.getBoundingClientRect(),scale=Math.min(devicePixelRatio||1,2);width=rect.width||640;height=rect.height||630;canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);ctx.setTransform(scale,0,0,scale,0,0)};
 const cellSize=()=>Math.min(width/10.3,height/10.7);
 const project=(x,row)=>{const tile=cellSize(),dy=row-camera;return [width*.50+(x-4)*(width/10.3),height*.74-dy*tile]};
 function polygon(points,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();ctx.fill()}
 // Rectangular ground tiles: columns and rows are axis-aligned, never diamonds.
 function tile(x,row,type){
  const [px,py]=project(x,row),w=cellSize(),h=cellSize();
  const left=px-w*.5,top=py-h*.5;
  ctx.fillStyle='#12253d';ctx.fillRect(left+1,top+4,w-2,h-1);
  const base=type==='grass'?(row+x)%2?'#3d996c':'#46aa78':type==='castle'?'#77659c':type==='river'?'#2f8fba':(row+x)%2?'#4b6286':'#536b90';
  ctx.fillStyle=base;ctx.fillRect(left+1,top+1,w-2,h-4);
  ctx.fillStyle='#ffffff1a';ctx.fillRect(left+2,top+2,w-4,Math.max(2,h*.1));
  ctx.fillStyle='#102943aa';ctx.fillRect(left+1,top+h-5,w-2,4);
  if(type==='road'){ctx.fillStyle='#f6d9a557';ctx.fillRect(left+w*.38,top+h*.45,w*.24,Math.max(2,h*.09))}
  if(type==='river'){ctx.fillStyle='#9eeeff65';ctx.fillRect(left+5,top+h*.35,w*.4,2);ctx.fillRect(left+w*.52,top+h*.74,w*.26,2)}
  if(type==='grass'&&roll(row*17+x*11)>.84){ctx.fillStyle='#b5f3b8a8';ctx.fillRect(left+w*.2,top+h*.35,Math.max(2,w*.06),Math.max(3,h*.2))}
  if(type==='castle'){ctx.strokeStyle='#d8c6f588';ctx.lineWidth=1.5;ctx.strokeRect(left+4,top+4,w-8,h-10)}
 }
 function scenery(t){
  // Distant medieval kingdom, clouds, mountains and trees on both road edges.
  const horizon=height*.27;
  ctx.fillStyle='#e9c7a9';ctx.beginPath();ctx.arc(width*.78,horizon*.42,Math.max(18,width*.029),0,Math.PI*2);ctx.fill();
  for(let i=0;i<7;i++){
   const cx=((i*0.21+roll(i+4)*.12)*width)%width,cy=horizon*.4+roll(i+31)*horizon*.44;
   ctx.fillStyle='#ffffff20';ctx.beginPath();ctx.ellipse(cx,cy,width*.055,height*.011,0,0,Math.PI*2);ctx.fill();
  }
  const m1=[[0,horizon+height*.09],[width*.11,horizon*.48],[width*.23,horizon+height*.06],[width*.37,horizon*.6],[width*.53,horizon+height*.10],[width*.71,horizon*.47],[width*.87,horizon+height*.08],[width,horizon*.63],[width,height*.58],[0,height*.58]];
  polygon(m1,'#294967');polygon(m1.slice(0,8).map(([x,y])=>[x,y+height*.07]).concat([[width,height*.6],[0,height*.6]]),'#24425e');
  const wallY=height*.42;
  ctx.fillStyle='#203b55';ctx.fillRect(width*.025,wallY,width*.14,height*.22);ctx.fillRect(width*.82,wallY,width*.15,height*.22);
  for(const x of [width*.05,width*.13,width*.85,width*.94]){ctx.fillRect(x,wallY-height*.08,width*.027,height*.105);ctx.fillStyle='#aec5ce';ctx.fillRect(x+width*.007,wallY-height*.06,width*.012,height*.023);ctx.fillStyle='#203b55'}
  // Two tree-lined shoulders track the rows and advance with the camera.
  const low=Math.max(0,Math.floor(camera)-3),high=Math.floor(camera)+Math.ceil(height/cellSize()) +3;
  for(let row=low;row<=high;row+=2){
   for(const side of [-1,1]){
    if(roll(row*13+side*199)<.27)continue;
    const x=side<0?-1.3:9.3,[px,py]=project(x,row),s=Math.min(cellSize()*.9,45);
    if(py<height*.14||py>height+60)continue;
    ctx.fillStyle='#263e40';ctx.fillRect(px-s*.08,py-s*.5,s*.16,s*.65);
    ctx.fillStyle=roll(row*5)>.5?'#26754e':'#338665';
    polygon([[px-s*.47,py-s*.22],[px,py-s*1.36],[px+s*.47,py-s*.22]],ctx.fillStyle);
    polygon([[px-s*.38,py-s*.57],[px,py-s*1.54],[px+s*.38,py-s*.57]],'#45a276');
   }
  }
 }
 function piece(x,row,kind,colour='#ffc86b',heightScale=1){const [px,py]=project(x,row),s=cellSize()*heightScale;
  ctx.fillStyle='#10233bb0';ctx.beginPath();ctx.ellipse(px,py+s*.12,s*.39,s*.15,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#152740';ctx.beginPath();ctx.ellipse(px,py-s*.2,s*.29,s*.13,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=colour;ctx.beginPath();ctx.moveTo(px-s*.29,py-s*.23);ctx.lineTo(px+s*.29,py-s*.23);ctx.lineTo(px+s*.16,py-s*.68);ctx.lineTo(px-s*.16,py-s*.68);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.arc(px,py-s*.77,s*.18,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff2c7';ctx.font='bold '+Math.round(s*.34)+'px system-ui';ctx.textAlign='center';ctx.fillText(kind,px,py-s*.45);
  ctx.strokeStyle='#ffffff77';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px-s*.12,py-s*.63);ctx.lineTo(px-s*.2,py-s*.30);ctx.stroke();
 }
 function hazard(row,t){const speed=(.5+roll(row*5)*1.6)*(roll(row*7)>.5?1:-1);return ((roll(row*11)*9+speed*t) % 13+13)%13-2;}
 function collision(t){if(performance.now()<invincibleUntil)return false;const type=lane(player.row);
  if(type==='road'||type==='castle'){for(let k=0;k<(type==='castle'?1:2);k++)if(Math.abs(hazard(player.row*3+k,t)-player.x)<.57)return true}
  if(type==='river'&&roll(player.row*4+player.x)>.64)return true;
  return false;
 }
 function hit(){invincibleUntil=performance.now()+1100;player={x:4,row:Math.max(0,highest-3)};onHit();}
 function move(dx,dy){if(dead||!overlay.hidden||performance.now()-lastMove<85)return;lastMove=performance.now();const nx=Math.max(0,Math.min(8,player.x+dx)),nr=Math.max(0,player.row+dy);if(nx===player.x&&nr===player.row)return;player={x:nx,row:nr};if(nr>highest){const gained=nr-highest;highest=nr;onScore(gained);if(nr%9===0)onStatus('Crown milestone! '+nr+' lanes crossed.');}if(collision((performance.now()-origin)/1000))hit();}
 const keys={ArrowUp:[0,1],KeyW:[0,1],ArrowDown:[0,-1],KeyS:[0,-1],ArrowLeft:[-1,0],KeyA:[-1,0],ArrowRight:[1,0],KeyD:[1,0]};
 function keydown(e){if(dead)return;if(e.code==='Escape'){e.preventDefault();setMenu(overlay.hidden);return}if(!overlay.hidden||!keys[e.code])return;if(e.target?.matches('input,textarea'))return;e.preventDefault();move(...keys[e.code]);}
 function click(e){const button=e.target.closest('[data-direction]');if(!button)return;const dirs={left:[-1,0],right:[1,0],forward:[0,1],back:[0,-1]};move(...dirs[button.dataset.direction]);canvas.focus({preventScroll:true})}
 function touchstart(e){if(e.touches.length===1)touch={x:e.touches[0].clientX,y:e.touches[0].clientY};}
 function touchend(e){if(!touch||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;move(...(Math.abs(dx)>Math.abs(dy)?[Math.sign(dx),0]:[0,-Math.sign(dy)]));}
 function frame(now){if(dead)return;if(!overlay.hidden){origin+=16;raf=requestAnimationFrame(frame);return}const t=(now-origin)/1000;camera+=(Math.max(0,player.row-4)-camera)*.13;
  ctx.clearRect(0,0,width,height);const sky=ctx.createLinearGradient(0,0,0,height);sky.addColorStop(0,'#12243d');sky.addColorStop(1,'#224969');ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
  scenery(t);
  // Opaque compact HUD avoids unreadable text over the scenery.
  const hudLeft=Math.max(8,width-250);ctx.fillStyle='#091e32ee';ctx.fillRect(hudLeft,9,width-hudLeft-8,76);
  ctx.textAlign='right';ctx.fillStyle='#f3fbff';ctx.font='bold 17px system-ui';ctx.fillText('PAWN KINGDOM',width-18,30);
  ctx.font='bold 15px system-ui';ctx.fillText('LANES '+highest,width-18,51);
  ctx.font='12px system-ui';ctx.fillText('KEEP HOPPING · DODGE PIECES',width-18,70);
  const low=Math.max(0,Math.floor(camera)-3),high=Math.floor(camera)+Math.ceil(height/cellSize()*.75)+4;
  for(let row=high;row>=low;row--){const type=lane(row);for(let x=0;x<9;x++){tile(x,row,type);if(type==='grass'&&roll(row*25+x*4)>.91)piece(x,row,'♜','#65cd98',.43);if(type==='river'&&roll(row*4+x)>.64){const [px,py]=project(x,row);ctx.fillStyle='#122b51';ctx.beginPath();ctx.arc(px,py,cellSize()*.13,0,Math.PI*2);ctx.fill();}}}
  for(let row=high;row>=low;row--){const type=lane(row);if(type==='road'||type==='castle')for(let k=0;k<(type==='castle'?1:2);k++){const x=hazard(row*3+k,t);if(x>=-.2&&x<=8.2)piece(x,row,k?'♞':'♜',k?'#ed8da9':'#f4b973',.85)}}
  if(now<invincibleUntil){ctx.globalAlpha=.48+.45*Math.abs(Math.sin(now/100));}
  piece(player.x,player.row,'♟','#f7df78',1.05);ctx.globalAlpha=1;
  if(collision(t))hit();raf=requestAnimationFrame(frame);
 }
 window.addEventListener('keydown',keydown);controls.addEventListener('click',click);canvas.addEventListener('touchstart',touchstart,{passive:true});canvas.addEventListener('touchend',touchend,{passive:true});window.addEventListener('resize',size);size();raf=requestAnimationFrame(frame);
 return {destroy(){dead=true;cancelAnimationFrame(raf);window.removeEventListener('keydown',keydown);window.removeEventListener('resize',size);root.remove();document.body.classList.remove('pawn-dash-active')},getProgress:()=>highest};
}
