// Original EloScanner Pawn Dash: an isometric, endless chess-world crossing game.
// No game sprites, levels or assets from third-party titles are used.
export function createPawnWorld({host,seed,onScore,onHit,onStatus}){
 const root=document.createElement('div');root.className='pawn-world';
 const canvas=document.createElement('canvas');canvas.className='pawn-world-canvas';canvas.tabIndex=0;
 canvas.setAttribute('aria-label','Pawn Dash: arrow keys or WASD to hop between chess-themed roads');
 const controls=document.createElement('div');controls.className='pawn-world-controls';
 controls.innerHTML='<button type="button" data-direction="left" aria-label="Left">◀</button><button type="button" data-direction="forward" aria-label="Forward">▲</button><button type="button" data-direction="back" aria-label="Backward">▼</button><button type="button" data-direction="right" aria-label="Right">▶</button>';
 const hint=document.createElement('p');hint.className='pawn-world-hint';hint.textContent='Arrow keys / WASD · Swipe or tap arrows · Dodge moving chess pieces · Collect golden crowns';
 root.append(canvas,controls,hint);host.append(root);
 const ctx=canvas.getContext('2d');let width=640,height=630,raf=0,dead=false,player={x:4,row:0},camera=0,highest=0,lastMove=0,invincibleUntil=0,origin=performance.now(),touch=null;
 let hash=2166136261;for(const c of String(seed))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const roll=n=>{let x=(hash^Math.imul(n+19,2654435761))>>>0;x^=x>>>16;x=Math.imul(x,2246822507);x^=x>>>13;x=Math.imul(x,3266489909);x^=x>>>16;return x/4294967296};
 const lane=row=>row<=1||row%6===0?'grass':row%7===0?'river':row%5===0?'castle':'road';
 const size=()=>{const rect=canvas.getBoundingClientRect(),scale=Math.min(devicePixelRatio||1,2);width=rect.width||640;height=rect.height||630;canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);ctx.setTransform(scale,0,0,scale,0,0)};
 const cellSize=()=>Math.min(width/11.8,height/11.2);
 const project=(x,row)=>{const tile=cellSize(),dy=row-camera;return [width*.50+(x-4)*tile+dy*tile*.17,height*.74-dy*tile*.75+(x-4)*tile*.19]};
 function polygon(points,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();ctx.fill()}
 function tile(x,row,type){const [px,py]=project(x,row),s=cellSize(),h=s*.36,w=s*.55;
  const top=[[px,py-h],[px+w,py],[px,py+h],[px-w,py]];
  polygon(top,type==='grass'?'#3b875d':type==='castle'?'#7d719b':type==='river'?'#3181ad':(row+x)%2?'#465b83':'#526894');
  polygon([[px-w,py],[px,py+h],[px,py+h+8],[px-w,py+8]],'#1b3451');
  polygon([[px,py+h],[px+w,py],[px+w,py+8],[px,py+h+8]],'#233a59');
  if(type==='road'&&x%3===0){ctx.fillStyle='#d3c6a3';ctx.fillRect(px-3,py-3,6,6)}
  if(type==='river'){ctx.strokeStyle='#83d6ee';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px-w*.5,py);ctx.lineTo(px,py+h*.5);ctx.stroke()}
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
 function move(dx,dy){if(dead||performance.now()-lastMove<85)return;lastMove=performance.now();const nx=Math.max(0,Math.min(8,player.x+dx)),nr=Math.max(0,player.row+dy);if(nx===player.x&&nr===player.row)return;player={x:nx,row:nr};if(nr>highest){const gained=nr-highest;highest=nr;onScore(gained);if(nr%9===0)onStatus('Crown milestone! '+nr+' lanes crossed.');}if(collision((performance.now()-origin)/1000))hit();}
 const keys={ArrowUp:[0,1],KeyW:[0,1],ArrowDown:[0,-1],KeyS:[0,-1],ArrowLeft:[-1,0],KeyA:[-1,0],ArrowRight:[1,0],KeyD:[1,0]};
 function keydown(e){if(dead||!keys[e.code])return;if(e.target?.matches('input,textarea'))return;e.preventDefault();move(...keys[e.code]);}
 function click(e){const button=e.target.closest('[data-direction]');if(!button)return;const dirs={left:[-1,0],right:[1,0],forward:[0,1],back:[0,-1]};move(...dirs[button.dataset.direction]);canvas.focus({preventScroll:true})}
 function touchstart(e){if(e.touches.length===1)touch={x:e.touches[0].clientX,y:e.touches[0].clientY};}
 function touchend(e){if(!touch||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;move(...(Math.abs(dx)>Math.abs(dy)?[Math.sign(dx),0]:[0,-Math.sign(dy)]));}
 function frame(now){if(dead)return;const t=(now-origin)/1000;camera+=(Math.max(0,player.row-4)-camera)*.13;
  ctx.clearRect(0,0,width,height);const sky=ctx.createLinearGradient(0,0,0,height);sky.addColorStop(0,'#12243d');sky.addColorStop(1,'#224969');ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#b3dafa';ctx.font='bold 17px system-ui';ctx.textAlign='left';ctx.fillText('PAWN KINGDOM',18,28);ctx.font='13px system-ui';ctx.fillText('LANES '+highest+'  ·  KEEP HOPPING',18,49);
  const low=Math.max(0,Math.floor(camera)-3),high=Math.floor(camera)+12;
  for(let row=high;row>=low;row--){const type=lane(row);for(let x=0;x<9;x++){tile(x,row,type);if(type==='grass'&&roll(row*25+x*4)>.91)piece(x,row,'♜','#65cd98',.43);if(type==='river'&&roll(row*4+x)>.64){const [px,py]=project(x,row);ctx.fillStyle='#122b51';ctx.beginPath();ctx.arc(px,py,cellSize()*.13,0,Math.PI*2);ctx.fill();}}}
  for(let row=high;row>=low;row--){const type=lane(row);if(type==='road'||type==='castle')for(let k=0;k<(type==='castle'?1:2);k++){const x=hazard(row*3+k,t);if(x>=-.2&&x<=8.2)piece(x,row,k?'♞':'♜',k?'#ed8da9':'#f4b973',.85)}}
  if(now<invincibleUntil){ctx.globalAlpha=.48+.45*Math.abs(Math.sin(now/100));}
  piece(player.x,player.row,'♟','#f7df78',1.05);ctx.globalAlpha=1;
  if(collision(t))hit();raf=requestAnimationFrame(frame);
 }
 window.addEventListener('keydown',keydown);controls.addEventListener('click',click);canvas.addEventListener('touchstart',touchstart,{passive:true});canvas.addEventListener('touchend',touchend,{passive:true});window.addEventListener('resize',size);size();raf=requestAnimationFrame(frame);
 return {destroy(){dead=true;cancelAnimationFrame(raf);window.removeEventListener('keydown',keydown);window.removeEventListener('resize',size);root.remove()},getProgress:()=>highest};
}
