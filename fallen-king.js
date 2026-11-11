(()=>{
'use strict';
const gate=document.getElementById('fallen-gate'),game=document.getElementById('fallen-game'),canvas=document.getElementById('fallen-canvas'),ctx=canvas.getContext('2d');
const dialog=document.getElementById('fallen-dialogue'),speaker=document.getElementById('fallen-speaker'),speech=document.getElementById('fallen-text'),coords=document.getElementById('fallen-coords');
const TILE=64,VIEW_W=15,VIEW_H=10,storageKey='eloscanner-fallen-king-admin-preview-v1';
let world,player,dialogue=null,walkFrame=0,walkTimer=0,last=0,paused=false,musicOn=false,audioCtx=null,musicTimer=null;
const pressed=new Set(),dirs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const rand=(x,y)=>((x*92821+y*68917+x*y*31)>>>0)%101;
const solid=new Set(['T','H','w','F']);
const tile=(x,y)=>world?.tiles[y]?.[x]||'T';
function occupied(x,y,ignore){return world.npcs.some(n=>n!==ignore&&Math.round(n.x)===x&&Math.round(n.y)===y);}
function canWalk(x,y,ignore){return x>=0&&y>=0&&x<world.width&&y<world.height&&!solid.has(tile(x,y))&&!occupied(x,y,ignore);}
function save(){try{localStorage.setItem(storageKey,JSON.stringify({version:world.version,x:player.x,y:player.y,facing:player.facing}));return true}catch{return false}}
function load(){try{const s=JSON.parse(localStorage.getItem(storageKey)||'null');if(s?.version===world.version&&Number.isInteger(s.x)&&Number.isInteger(s.y)&&canWalk(s.x,s.y))return s}catch{}return world.spawn;}
function move(dir){if(dialogue||paused)return;const [dx,dy]=dirs[dir],x=player.x+dx,y=player.y+dy;player.facing=dir;if(canWalk(x,y)){player.x=x;player.y=y;walkFrame++;save();}coords.textContent='X '+player.x+' · Y '+player.y;}
function talk(){if(paused)return;if(dialogue){dialogue.i++;if(dialogue.i>=dialogue.npc.lines.length){dialogue=null;dialog.hidden=true;}else speech.textContent=dialogue.npc.lines[dialogue.i];return;}
const [dx,dy]=dirs[player.facing],tx=player.x+dx,ty=player.y+dy;const npc=world.npcs.find(n=>Math.round(n.x)===tx&&Math.round(n.y)===ty);if(!npc)return;dialogue={npc,i:0};speaker.textContent=npc.name;speech.textContent=npc.lines[0];dialog.hidden=false;}
function fill(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function poly(points,color){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fillStyle=color;ctx.fill();}
function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function tileDraw(t,x,y,wx,wy){
 const r=rand(wx,wy),S=TILE;
 fill(x,y,S,S,t==='p'?'#cbb99a':t==='s'?'#ad9f86':t==='w'?'#367c9b':'#81a76c');
 if(t==='p'||t==='s'){poly([[x+3,y+8],[x+29,y+5],[x+45,y+15],[x+12,y+19]],'#e1d0aa');poly([[x+25,y+40],[x+58,y+37],[x+55,y+48],[x+29,y+51]],'#a99579');}
 else if(t==='w'){for(let i=0;i<3;i++)ellipse(x+14+i*17,y+15+(r+i*9)%37,11,2,'#8bc7d1');}
 else if(t==='T'){fill(x,y,S,S,'#668f60');ellipse(x+32,y+45,22,9,'#3c6040');fill(x+27,y+23,10,29,'#72533a');ellipse(x+30,y+24,27,22,'#245e3d');ellipse(x+42,y+15,20,20,'#34794b');ellipse(x+17,y+18,18,17,'#3e8952');ellipse(x+26,y+8,10,5,'#68a86b');}
 else if(t==='H'||t==='D'){
   // Raised isometric walls, pitched roof and door/window recesses.
   ellipse(x+33,y+57,33,9,'#425a4c66');
   poly([[x+8,y+23],[x+35,y+16],[x+57,y+24],[x+57,y+56],[x+35,y+61],[x+8,y+54]],'#d5c39e');
   poly([[x+35,y+16],[x+57,y+24],[x+57,y+56],[x+35,y+61]],'#a78e70');
   poly([[x+4,y+24],[x+30,y+3],[x+60,y+24],[x+35,y+32]],'#75424d');
   poly([[x+30,y+3],[x+60,y+24],[x+54,y+27],[x+29,y+10]],'#a85b60');
   poly([[x+4,y+24],[x+30,y+3],[x+35,y+32],[x+9,y+35]],'#b66c65');
   if(t==='D'){poly([[x+20,y+42],[x+34,y+38],[x+34,y+60],[x+20,y+56]],'#62442f');ellipse(x+30,y+49,1.5,1.5,'#e8d18d');}
   else {poly([[x+18,y+40],[x+31,y+37],[x+31,y+49],[x+18,y+52]],'#467c8e');poly([[x+40,y+37],[x+51,y+39],[x+51,y+50],[x+40,y+48]],'#456d81');}
 }
 else if(t==='F'){ellipse(x+32,y+49,23,9,'#4c7477');poly([[x+15,y+48],[x+20,y+22],[x+44,y+22],[x+49,y+48]],'#b7c6ba');ellipse(x+32,y+22,12,5,'#d8e2cc');ellipse(x+32,y+21,8,4,'#5daac1');}
 else if(r<12){ellipse(x+16,y+30,4,3,r<5?'#f4dba1':'#eeb9c7');ellipse(x+44,y+46,3,2,'#e6e8a8');}
 else if(r<30){ellipse(x+12,y+16,7,3,'#689b5b');ellipse(x+49,y+42,8,3,'#639656');}
}
function piece(x,y,type,color,king=false,bob=0){
 const light=color==='white',base=light?'#e9dfcb':'#343e52',edge=light?'#9e907a':'#171d2d',shine=light?'#fffdf0':'#7f8a9e';
 const cx=x+TILE/2,foot=y+TILE*.87+bob;
 ellipse(cx+3,foot+3,19,6,'#1a302b66');
 // Turned chess-piece profile with layered bevels and specular highlights.
 ellipse(cx,foot-2,19,6,edge);ellipse(cx,foot-5,17,6,base);ellipse(cx-3,foot-7,11,2,shine);
 poly([[cx-13,foot-9],[cx-9,foot-25],[cx+9,foot-25],[cx+13,foot-9]],base);
 ellipse(cx,foot-25,11,4,edge);ellipse(cx,foot-27,10,4,shine);
 if(type==='P'){poly([[cx-7,foot-28],[cx-5,foot-39],[cx+5,foot-39],[cx+7,foot-28]],base);ellipse(cx,foot-42,10,11,edge);ellipse(cx-2,foot-44,8,9,base);ellipse(cx-5,foot-48,3,2,shine);}
 if(type==='R'){poly([[cx-12,foot-29],[cx-12,foot-48],[cx+12,foot-48],[cx+12,foot-29]],base);ellipse(cx,foot-48,13,4,edge);for(let i=-1;i<=1;i++){fill(cx+i*10-5,foot-55,9,10,base);fill(cx+i*10-5,foot-55,9,3,shine);}}
 if(type==='B'){poly([[cx-9,foot-28],[cx-6,foot-43],[cx,foot-54],[cx+6,foot-43],[cx+9,foot-28]],base);ellipse(cx,foot-42,8,12,edge);ellipse(cx-2,foot-43,6,10,base);poly([[cx+1,foot-51],[cx+5,foot-48],[cx-3,foot-36],[cx-5,foot-39]],edge);ellipse(cx,foot-55,3,3,shine);}
 if(type==='N'){poly([[cx-11,foot-28],[cx-11,foot-44],[cx-5,foot-53],[cx+4,foot-56],[cx+13,foot-47],[cx+14,foot-38],[cx+6,foot-37],[cx+10,foot-28]],edge);poly([[cx-8,foot-31],[cx-8,foot-44],[cx-2,foot-51],[cx+4,foot-52],[cx+10,foot-46],[cx+8,foot-41],[cx+1,foot-40],[cx+5,foot-31]],base);ellipse(cx+4,foot-47,2,2,edge);}
 if(type==='K'||type==='Q'){poly([[cx-9,foot-29],[cx-7,foot-47],[cx+7,foot-47],[cx+9,foot-29]],base);ellipse(cx,foot-47,10,4,edge);if(type==='K'){fill(cx-2,foot-63,4,18,shine);fill(cx-8,foot-58,16,4,shine);}else{for(let i=-2;i<=2;i++){poly([[cx+i*5,foot-48],[cx+i*6,foot-61+(Math.abs(i)*3)],[cx+i*5+4,foot-48]],shine);ellipse(cx+i*6,foot-60+Math.abs(i)*3,3,3,edge);}}}
 ellipse(cx,foot-29,12,3,edge);
}
function draw(){
 if(!world)return;
 const camX=Math.max(0,Math.min(world.width-VIEW_W,player.x-(VIEW_W-1)/2)),camY=Math.max(0,Math.min(world.height-VIEW_H,player.y-(VIEW_H-1)/2));
 const cx=Math.round(camX*TILE),cy=Math.round(camY*TILE);
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(canvas.width/(VIEW_W*TILE),canvas.height/(VIEW_H*TILE));
 const startX=Math.floor(camX),startY=Math.floor(camY);
 for(let y=startY;y<Math.min(world.height,startY+VIEW_H+2);y++)for(let x=startX;x<Math.min(world.width,startX+VIEW_W+2);x++)tileDraw(tile(x,y),x*TILE-cx,y*TILE-cy,x,y);
 // Layer chess pieces by their tile row.
 const actors=[...world.npcs.map(n=>({...n,player:false})),{...player,piece:'K',color:'white',player:true}].sort((a,b)=>a.y-b.y);
 for(const n of actors){const px=n.x*TILE-cx,py=n.y*TILE-cy;if(px>-TILE&&py>-TILE&&px<VIEW_W*TILE&&py<VIEW_H*TILE){piece(px,py,n.piece,n.color,n.player,n.player&&walkFrame%2?-2:0);if(!n.player&&Math.abs(n.x-player.x)+Math.abs(n.y-player.y)===1){fill(px+11,py-10,11,9,'#fff0c5');ctx.fillStyle='#3b4b43';ctx.font='bold 9px monospace';ctx.fillText('!',px+14,py-3);}}}
 ctx.restore();
}
function frame(time){if(!world)return;const dt=Math.min(time-last,100);last=time;walkTimer+=dt;if(!dialogue&&!paused&&walkTimer>=115){const direction=['up','down','left','right'].find(k=>pressed.has(k));if(direction)move(direction);walkTimer=0;}draw();requestAnimationFrame(frame);}
document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(k==='escape'){e.preventDefault();togglePause();return;}if(paused)return;const dir=({arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'})[k];if(dir){e.preventDefault();pressed.add(dir);if(!e.repeat){move(dir);walkTimer=0;}}else if(['e','enter',' '].includes(k)){e.preventDefault();if(!e.repeat)talk();}});
document.addEventListener('keyup',e=>{const k=e.key.toLowerCase(),dir=({arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'})[k];if(dir)pressed.delete(dir);});
window.addEventListener('blur',()=>pressed.clear());
for(const b of document.querySelectorAll('[data-dir]')){const dir=b.dataset.dir;b.addEventListener('pointerdown',e=>{if(paused)return;e.preventDefault();pressed.add(dir);move(dir);});for(const type of ['pointerup','pointercancel','pointerleave'])b.addEventListener(type,()=>pressed.delete(dir));}
document.querySelector('[data-action="talk"]').addEventListener('click',talk);
document.getElementById('fallen-save').addEventListener('click',()=>{const ok=save();document.getElementById('fallen-location').textContent=ok?'Position saved on this device':'Saving unavailable';});
document.getElementById('fallen-reset').addEventListener('click',()=>{player={...world.spawn,facing:'down'};save();dialogue=null;dialog.hidden=true;});
const pause=document.getElementById('fallen-pause');
function togglePause(force){if(!world)return;paused=typeof force==='boolean'?force:!paused;pause.hidden=!paused;pressed.clear();if(!paused)canvas.focus({preventScroll:true});}
document.getElementById('fallen-menu-button').addEventListener('click',()=>togglePause(true));
document.getElementById('fallen-continue').addEventListener('click',()=>togglePause(false));
document.getElementById('fallen-exit').addEventListener('click',()=>{save();window.location.assign('/minigames.html');});
document.getElementById('fallen-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}});
const volume=document.getElementById('fallen-volume'),volumeValue=document.getElementById('fallen-volume-value');
volume.addEventListener('input',()=>{volumeValue.textContent=volume.value+'%';});
function playMusicNote(){if(!musicOn||paused)return;try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),notes=[261.63,329.63,392,329.63,293.66,349.23,440,349.23];osc.type='sine';osc.frequency.value=notes[Math.floor(Date.now()/650)%notes.length];gain.gain.value=Number(volume.value)/100*.025;osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+.38);}catch{}}
document.getElementById('fallen-music-toggle').addEventListener('click',e=>{musicOn=!musicOn;e.currentTarget.textContent='Music: '+(musicOn?'On':'Off');e.currentTarget.setAttribute('aria-pressed',String(musicOn));if(musicOn){playMusicNote();musicTimer=setInterval(playMusicNote,650);}else{clearInterval(musicTimer);musicTimer=null;}});
(async()=>{try{const response=await fetch('/api/fallen-king/world',{credentials:'same-origin',cache:'no-store'});if(!response.ok){gate.textContent=response.status===401?'Log in with an administrator account to access this preview.':response.status===403?'This preview is available to EloScanner administrators only.':'The administrator preview is currently unavailable.';return;}
world=await response.json();if(!Array.isArray(world.tiles)||world.tiles.length!==world.height)throw Error('Invalid world');
player={...load(),facing:'down'};gate.hidden=true;game.hidden=false;coords.textContent='X '+player.x+' · Y '+player.y;canvas.focus({preventScroll:true});requestAnimationFrame(frame);
}catch{gate.textContent='Could not load the preview. Please retry later.';}})();
})();