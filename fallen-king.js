(()=>{
'use strict';
const gate=document.getElementById('fallen-gate'),game=document.getElementById('fallen-game'),canvas=document.getElementById('fallen-canvas'),ctx=canvas.getContext('2d');
const dialog=document.getElementById('fallen-dialogue'),speaker=document.getElementById('fallen-speaker'),speech=document.getElementById('fallen-text'),coords=document.getElementById('fallen-coords');
const TILE=32,VIEW_W=30,VIEW_H=20,storageKey='eloscanner-fallen-king-admin-preview-v1';
let world,player,dialogue=null,walkFrame=0,walkTimer=0,last=0;
const pressed=new Set(),dirs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const rand=(x,y)=>((x*92821+y*68917+x*y*31)>>>0)%101;
const solid=new Set(['T','H','w','F']);
const tile=(x,y)=>world?.tiles[y]?.[x]||'T';
function occupied(x,y,ignore){return world.npcs.some(n=>n!==ignore&&Math.round(n.x)===x&&Math.round(n.y)===y);}
function canWalk(x,y,ignore){return x>=0&&y>=0&&x<world.width&&y<world.height&&!solid.has(tile(x,y))&&!occupied(x,y,ignore);}
function save(){try{localStorage.setItem(storageKey,JSON.stringify({version:world.version,x:player.x,y:player.y,facing:player.facing}));return true}catch{return false}}
function load(){try{const s=JSON.parse(localStorage.getItem(storageKey)||'null');if(s?.version===world.version&&Number.isInteger(s.x)&&Number.isInteger(s.y)&&canWalk(s.x,s.y))return s}catch{}return world.spawn;}
function move(dir){if(dialogue)return;const [dx,dy]=dirs[dir],x=player.x+dx,y=player.y+dy;player.facing=dir;if(canWalk(x,y)){player.x=x;player.y=y;walkFrame++;save();}coords.textContent='X '+player.x+' · Y '+player.y;}
function talk(){if(dialogue){dialogue.i++;if(dialogue.i>=dialogue.npc.lines.length){dialogue=null;dialog.hidden=true;}else speech.textContent=dialogue.npc.lines[dialogue.i];return;}
const [dx,dy]=dirs[player.facing],tx=player.x+dx,ty=player.y+dy;const npc=world.npcs.find(n=>Math.round(n.x)===tx&&Math.round(n.y)===ty);if(!npc)return;dialogue={npc,i:0};speaker.textContent=npc.name;speech.textContent=npc.lines[0];dialog.hidden=false;}
function fill(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function tileDraw(t,x,y,wx,wy){
 const r=rand(wx,wy);
 fill(x,y,TILE,TILE,t==='p'?'#c2ab7d':t==='s'?'#b7a580':t==='w'?'#3984a5':'#6f9b57');
 if(t==='p'||t==='s'){fill(x+2,y+2,13,1,'#d5bf90');fill(x+19,y+19,10,1,'#9e8b67');}
 else if(t==='w'){fill(x+4,y+10,22,2,'#78c4d0');fill(x+12,y+23,15,2,'#5da7c1');}
 else if(t==='T'){fill(x,y,TILE,TILE,'#486e45');fill(x+11,y+19,10,11,'#5b3e2c');fill(x+3,y+3,26,20,'#1c5b41');fill(x+7,y+1,18,20,'#317b4e');fill(x+11,y+5,8,5,'#58a365');}
 else if(t==='H'||t==='D'){fill(x,y,TILE,TILE,'#a5a2a0');fill(x+2,y+2,28,28,'#bcab88');fill(x+2,y+2,28,10,'#9d4854');fill(x+5,y+4,22,5,'#cb6472');if(t==='D'){fill(x+10,y+13,12,19,'#62432e');fill(x+18,y+22,2,2,'#e8ca77');}else{fill(x+10,y+15,12,9,'#395f7c');fill(x+11,y+16,10,7,'#8bd0d3');}}
 else if(t==='F'){fill(x+8,y+6,16,19,'#a5c9d0');fill(x+11,y+8,10,14,'#64a9b6');fill(x+15,y+1,3,9,'#e1e6b7');}
 else {if(r<12){fill(x+6,y+13,2,5,'#467846');fill(x+4,y+11,6,4,r<5?'#f2e4a3':'#f5b4c6');}else if(r<30){fill(x+3,y+9,3,2,'#86b76a');fill(x+19,y+20,5,2,'#538d4c');}}
}
function piece(x,y,type,color,king=false,bob=0){
 // All NPCs and the player are literal chess pieces, not humanoid avatars.
 const light=color==='white',base=light?'#f4e8d1':'#343d53',edge=light?'#c7b899':'#131e32',shine=light?'#fff9e8':'#6c7895';
 const yy=Math.round(y+bob);
 fill(x+5,yy+26,22,4,'#20382999');fill(x+7,yy+23,18,5,edge);fill(x+5,yy+26,22,3,base);
 fill(x+10,yy+12,12,12,base);fill(x+9,yy+22,14,3,shine);
 if(type==='P'){fill(x+11,yy+5,10,10,edge);fill(x+12,yy+5,8,8,base);}
 if(type==='R'){fill(x+9,yy+5,14,13,base);fill(x+7,yy+3,5,6,edge);fill(x+13,yy+3,5,6,edge);fill(x+20,yy+3,5,6,edge);}
 if(type==='B'){fill(x+12,yy+2,8,15,edge);fill(x+13,yy+4,6,11,base);fill(x+15,yy+6,2,6,shine);}
 if(type==='N'){fill(x+9,yy+4,13,14,edge);fill(x+12,yy+4,12,9,base);fill(x+19,yy+12,7,4,base);fill(x+17,yy+7,2,2,edge);}
 if(type==='K'){fill(x+10,yy+8,12,11,base);fill(x+14,yy+2,4,9,edge);fill(x+11,yy+5,10,3,edge);fill(x+15,yy+1,2,11,shine);if(king){fill(x+9,yy+14,14,3,shine);}}
 fill(x+9,yy+24,14,2,edge);
}
function draw(){
 if(!world)return;
 const camX=Math.max(0,Math.min(world.width-VIEW_W,player.x-VIEW_W/2)),camY=Math.max(0,Math.min(world.height-VIEW_H,player.y-VIEW_H/2));
 const cx=Math.round(camX*TILE),cy=Math.round(camY*TILE);
 ctx.clearRect(0,0,canvas.width,canvas.height);
 const startX=Math.floor(camX),startY=Math.floor(camY);
 for(let y=startY;y<Math.min(world.height,startY+VIEW_H+2);y++)for(let x=startX;x<Math.min(world.width,startX+VIEW_W+2);x++)tileDraw(tile(x,y),x*TILE-cx,y*TILE-cy,x,y);
 // Layer chess pieces by their tile row.
 const actors=[...world.npcs.map(n=>({...n,player:false})),{...player,piece:'K',color:'white',player:true}].sort((a,b)=>a.y-b.y);
 for(const n of actors){const px=n.x*TILE-cx,py=n.y*TILE-cy;if(px>-TILE&&py>-TILE&&px<canvas.width&&py<canvas.height){piece(px,py,n.piece,n.color,n.player,n.player&&walkFrame%2?-2:0);if(!n.player&&Math.abs(n.x-player.x)+Math.abs(n.y-player.y)===1){fill(px+11,py-10,11,9,'#fff0c5');ctx.fillStyle='#3b4b43';ctx.font='bold 9px monospace';ctx.fillText('!',px+14,py-3);}}}
 ctx.fillStyle='#09251edb';ctx.fillRect(10,10,230,30);ctx.fillStyle='#fff1cf';ctx.font='bold 14px sans-serif';ctx.fillText('WILLOWMERE VILLAGE',22,30);
}
function frame(time){if(!world)return;const dt=Math.min(time-last,100);last=time;walkTimer+=dt;if(!dialogue&&walkTimer>=115){const direction=['up','down','left','right'].find(k=>pressed.has(k));if(direction)move(direction);walkTimer=0;}draw();requestAnimationFrame(frame);}
document.addEventListener('keydown',e=>{const k=e.key.toLowerCase(),dir=({arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'})[k];if(dir){e.preventDefault();pressed.add(dir);if(!e.repeat){move(dir);walkTimer=0;}}else if(['e','enter',' '].includes(k)){e.preventDefault();if(!e.repeat)talk();}});
document.addEventListener('keyup',e=>{const k=e.key.toLowerCase(),dir=({arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'})[k];if(dir)pressed.delete(dir);});
window.addEventListener('blur',()=>pressed.clear());
for(const b of document.querySelectorAll('[data-dir]')){const dir=b.dataset.dir;b.addEventListener('pointerdown',e=>{e.preventDefault();pressed.add(dir);move(dir);});for(const type of ['pointerup','pointercancel','pointerleave'])b.addEventListener(type,()=>pressed.delete(dir));}
document.querySelector('[data-action="talk"]').addEventListener('click',talk);
document.getElementById('fallen-save').addEventListener('click',()=>{const ok=save();document.getElementById('fallen-location').textContent=ok?'Position saved on this device':'Saving unavailable';});
document.getElementById('fallen-reset').addEventListener('click',()=>{player={...world.spawn,facing:'down'};save();dialogue=null;dialog.hidden=true;});
(async()=>{try{const response=await fetch('/api/fallen-king/world',{credentials:'same-origin',cache:'no-store'});if(!response.ok){gate.textContent=response.status===401?'Log in with an administrator account to access this preview.':response.status===403?'This preview is available to EloScanner administrators only.':'The administrator preview is currently unavailable.';return;}
world=await response.json();if(!Array.isArray(world.tiles)||world.tiles.length!==world.height)throw Error('Invalid world');
player={...load(),facing:'down'};gate.hidden=true;game.hidden=false;coords.textContent='X '+player.x+' · Y '+player.y;canvas.focus({preventScroll:true});requestAnimationFrame(frame);
}catch{gate.textContent='Could not load the preview. Please retry later.';}})();
})();