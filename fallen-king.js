(()=>{
'use strict';
const gate=document.getElementById('fallen-gate'),game=document.getElementById('fallen-game'),canvas=document.getElementById('fallen-canvas');
const dialog=document.getElementById('fallen-dialogue'),speaker=document.getElementById('fallen-speaker'),speech=document.getElementById('fallen-text');
const pause=document.getElementById('fallen-pause'),volume=document.getElementById('fallen-volume'),volumeValue=document.getElementById('fallen-volume-value');
const storageKey='eloscanner-fallen-king-admin-preview-v1',dirs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]},pressed=new Set(),solid=new Set(['T','H','w','F']);
let world,player,dialogue=null,paused=false,last=0,stepClock=0,sceneTime=0,cam={x:0,z:0},visual={x:0,z:0},musicOn=false,audioCtx=null,musicTimer=null,musicStep=0;
const tile=(x,z)=>world?.tiles[z]?.[x]||'T';
const hash=(x,z,n=0)=>{let h=Math.imul(x+31,73856093)^Math.imul(z+47,19349663)^Math.imul(n+3,83492791);h^=h>>>13;return (h>>>0)/4294967295;};
function occupied(x,z){return world.npcs.some(n=>n.x===x&&n.y===z);}
function canWalk(x,z){return x>=0&&z>=0&&x<world.width&&z<world.height&&!solid.has(tile(x,z))&&!occupied(x,z);}
function save(){try{localStorage.setItem(storageKey,JSON.stringify({version:world.version,x:player.x,y:player.y,facing:player.facing}));return true}catch{return false;}}
function load(){try{const s=JSON.parse(localStorage.getItem(storageKey)||'null');if(s?.version===world.version&&Number.isInteger(s.x)&&Number.isInteger(s.y)&&canWalk(s.x,s.y))return s;}catch{}return world.spawn;}
function move(dir){if(paused||dialogue)return;const [dx,dz]=dirs[dir];player.facing=dir;const x=player.x+dx,z=player.y+dz;if(canWalk(x,z)){player.x=x;player.y=z;save();}}
function talk(){if(paused)return;if(dialogue){dialogue.i++;if(dialogue.i>=dialogue.npc.lines.length){dialogue=null;dialog.hidden=true;}else speech.textContent=dialogue.npc.lines[dialogue.i];return;}
const [dx,dz]=dirs[player.facing],npc=world.npcs.find(n=>n.x===player.x+dx&&n.y===player.y+dz);if(!npc)return;dialogue={npc,i:0};speaker.textContent=npc.name;speech.textContent=npc.lines[0];dialog.hidden=false;pressed.clear();}
const gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});
if(!gl){gate.textContent='This game needs a browser with WebGL enabled.';return;}
const vert='attribute vec3 p;attribute vec3 n;attribute vec3 c;uniform vec2 cam;uniform float aspect;uniform float zoom;varying vec3 col;void main(){vec3 q=p-vec3(cam.x,0.,cam.y);float sx=q.x*.97-q.z*.17;float sy=q.x*.10+q.z*.87-q.y*.60;float depth=q.x*.10+q.z*.92+q.y*.22;gl_Position=vec4(sx/(zoom*aspect),-sy/zoom,-depth/42.,1.);float light=.82+.18*max(dot(normalize(n),normalize(vec3(-.45,.9,.7))),0.);col=c*light;}';
const frag='precision mediump float;varying vec3 col;void main(){gl_FragColor=vec4(pow(col,vec3(.88)),1.);}';
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vert));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const posLoc=gl.getAttribLocation(program,'p'),normLoc=gl.getAttribLocation(program,'n'),colorLoc=gl.getAttribLocation(program,'c'),camLoc=gl.getUniformLocation(program,'cam'),aspectLoc=gl.getUniformLocation(program,'aspect'),zoomLoc=gl.getUniformLocation(program,'zoom');
const buffer=gl.createBuffer(),staticBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(posLoc);gl.enableVertexAttribArray(normLoc);gl.enableVertexAttribArray(colorLoc);
gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,36,0);gl.vertexAttribPointer(normLoc,3,gl.FLOAT,false,36,12);gl.vertexAttribPointer(colorLoc,3,gl.FLOAT,false,36,24);
gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(.48,.64,.43,1);
let vertices=[],staticCount=0,staticReady=false;
function rgb(hex){const n=parseInt(hex.slice(1),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}
function tri(a,b,c,color){const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n)||1,k=rgb(color);for(const p of [a,b,c])vertices.push(...p,n[0]/l,n[1]/l,n[2]/l,...k);}
function quad(a,b,c,d,color){tri(a,b,c,color);tri(a,c,d,color);}
function box(x,y,z,w,h,d,color,roof){const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y1=y+h;quad([x0,y,z0],[x1,y,z0],[x1,y1,z0],[x0,y1,z0],color);quad([x1,y,z0],[x1,y,z1],[x1,y1,z1],[x1,y1,z0],color);quad([x1,y,z1],[x0,y,z1],[x0,y1,z1],[x1,y1,z1],roof||color);quad([x0,y,z1],[x0,y,z0],[x0,y1,z0],[x0,y1,z1],color);quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],roof||color);}
function cylinder(x,y,z,r0,r1,h,color,sides=12){for(let i=0;i<sides;i++){const a=i*2*Math.PI/sides,b=(i+1)*2*Math.PI/sides;const A=[x+Math.cos(a)*r0,y,z+Math.sin(a)*r0],B=[x+Math.cos(b)*r0,y,z+Math.sin(b)*r0],C=[x+Math.cos(b)*r1,y+h,z+Math.sin(b)*r1],D=[x+Math.cos(a)*r1,y+h,z+Math.sin(a)*r1];quad(A,B,C,D,color);tri([x,y+h,z],D,C,color);}}
function sphere(x,y,z,r,color,detail=9){for(let j=0;j<detail;j++){const v0=-Math.PI/2+j*Math.PI/detail,v1=-Math.PI/2+(j+1)*Math.PI/detail;for(let i=0;i<detail*2;i++){const a=i*Math.PI/detail,b=(i+1)*Math.PI/detail;const pt=(v,t)=>[x+r*Math.cos(v)*Math.cos(t),y+r*Math.sin(v),z+r*Math.cos(v)*Math.sin(t)];quad(pt(v0,a),pt(v0,b),pt(v1,b),pt(v1,a),color);}}}
function cone(x,y,z,r,h,color,sides=9){cylinder(x,y,z,r,0,h,color,sides);}
function roof(x,z,w,d,h,color){const e=.17,r=h+.94;quad([x-w/2-e,h,z-d/2-e],[x+w/2+e,h,z-d/2-e],[x+w/2+e,r,z],[x-w/2-e,r,z],color);quad([x-w/2-e,r,z],[x+w/2+e,r,z],[x+w/2+e,h,z+d/2+e],[x-w/2-e,h,z+d/2+e],color);tri([x-w/2-e,h,z-d/2-e],[x-w/2-e,r,z],[x-w/2-e,h,z+d/2+e],'#70505b');tri([x+w/2+e,h,z+d/2+e],[x+w/2+e,r,z],[x+w/2+e,h,z-d/2-e],'#70505b');}
function building(h){const x=h.x+h.w/2,z=h.y+h.h/2,w=h.w-.15,d=h.h-.15,H=2.5;box(x,0,z,w,H,d,'#d9c9a6','#e7d6b2');roof(x,z,w,d,H,({red:'#a34f55',blue:'#456d8a',orange:'#b77445',purple:'#70537d',navy:'#4b586c'})[h.roof]||'#a44c52');const front=z+d/2+.012;box(x,.7,front,.92,1.38,.065,'#593c30');box(x-.95,1.48,front,.67,.72,.075,'#638b98');box(x+.95,1.48,front,.67,.72,.075,'#638b98');box(x-.95,1.48,front+.045,.07,.8,.09,'#dfcda2');box(x+.95,1.48,front+.045,.07,.8,.09,'#dfcda2');box(x,2.42,front+.04,1.25,.12,.11,'#8d7453');cylinder(x+.33,1.25,front+.08,.055,.055,.07,'#e7cb80',8);box(x+w/2-.8,H+.22,z-.4,.5,.85,.5,'#c4aa86');}
function tree(x,z){cylinder(x,0,z,.16,.13,1.35,'#77583b',7);cone(x,1.0,z,.77,1.35,'#377d4e',7);cone(x,1.65,z,.61,1.15,'#4b9459',7);cone(x,2.18,z,.41,.79,'#5c9d61',7);}
function pawnBody(x,z,color){const pale=color==='white',base=pale?'#eee3cc':'#35445a',rim=pale?'#b7a48b':'#1a2638',light=pale?'#fff6e3':'#63738d';cylinder(x,.08,z,.34,.31,.13,rim);cylinder(x,.2,z,.31,.23,.13,base);cylinder(x,.34,z,.2,.13,.49,base);cylinder(x,.83,z,.21,.24,.12,light);return {base,rim,light};}
function piece(x,z,type,color,aldric=false,t=0){const y=0;const {base,rim,light}=pawnBody(x,z,color);
if(type==='P'){sphere(x,1.15+y,z,.30,base,11);sphere(x-.08,1.25+y,z,.10,light,7);}
if(type==='R'){cylinder(x,.94+y,z,.32,.33,.56,base);cylinder(x,1.5+y,z,.42,.42,.13,rim);for(let i=0;i<6;i++){const a=i*Math.PI/3;box(x+Math.cos(a)*.3,1.68+y,z+Math.sin(a)*.3,.18,.25,.18,light);}}
if(type==='B'){cylinder(x,.94+y,z,.22,.30,.42,base);sphere(x,1.47+y,z,.29,base,10);cone(x,1.59+y,z,.18,.42,light);sphere(x,2.02+y,z,.075,rim,7);}
if(type==='N'){cylinder(x,.9+y,z,.29,.27,.23,base);box(x,1.3+y,z,.43,.72,.42,base);sphere(x+.07,1.69+y,z-.1,.29,base,8);cone(x+.26,1.4+y,z-.19,.17,.34,base);sphere(x+.25,1.72+y,z-.31,.055,light,7);}
if(type==='K'){cylinder(x,.92+y,z,.25,.32,.59,base);cylinder(x,1.51+y,z,.36,.35,.15,rim);cylinder(x,1.67+y,z,.26,.23,.13,light);if(aldric){ // King Aldric's crown is missing: a smooth empty circlet, no cross.
 cylinder(x,1.8+y,z,.27,.27,.08,rim);sphere(x,1.93+y,z,.22,base,9);
 }else{cylinder(x,1.82+y,z,.29,.3,.16,light);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;sphere(x+Math.cos(a)*.25,2.08+y,z+Math.sin(a)*.25,.11,light,6);}}}
}
function ground(x,z){const kind=tile(x,z),n=hash(x,z);let col=kind==='p'?'#c7b79b':kind==='s'?'#c0b5a0':kind==='w'?'#3b8aa7':'#80a76a';if(kind==='f')col='#76a46b';if(kind==='g')col='#8cae75';box(x+.5,-.18,z+.5,1,.16,1,col);if(kind==='w'){for(let i=0;i<3;i++)box(x+.2+i*.23,.015,z+.5,.16,.008,.04,'#a0d5d7');}
if(kind==='.'||kind==='f'||kind==='g'){if(n<.38){const px=x+.16+hash(x,z,1)*.72,pz=z+.14+hash(z,x,2)*.7;cone(px,.01,pz,.055,.14,'#5b9652',4);}if(n<.10){sphere(x+.27,.12,z+.36,.065,'#f1d8a0',6);sphere(x+.38,.11,z+.42,.05,'#e5adc4',6);}}}
function draw(t){if(!world)return;const dpr=.72,w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
const aspect=w/Math.max(h,1),zoom=aspect<1?5.6:5.0;vertices=[];
if(!staticReady){
 // Static terrain and buildings are generated and uploaded once, not each frame.
 for(let z=0;z<world.height;z++)for(let x=0;x<world.width;x++){
  ground(x,z);
  if(tile(x,z)==='T')tree(x+.5,z+.5);
  if(tile(x,z)==='F'){cylinder(x+.5,0,z+.5,.4,.38,.65,'#9eafa6',9);cylinder(x+.5,.65,z+.5,.27,.22,.15,'#c6d9cb',9);sphere(x+.5,.78,z+.5,.18,'#67b2c6',7);}
 }
 for(const h of world.houses||[])building(h);
 staticCount=vertices.length/9;
 gl.bindBuffer(gl.ARRAY_BUFFER,staticBuffer);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
 staticReady=true;vertices=[];
}
for(const n of world.npcs){piece(n.x+.5,n.y+.5,n.piece,n.color,false,0);}
piece(visual.x+.5,visual.z+.5,'K','white',true,0);
gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform2f(camLoc,cam.x+.5,cam.z+.5);gl.uniform1f(aspectLoc,aspect);gl.uniform1f(zoomLoc,zoom);
gl.bindBuffer(gl.ARRAY_BUFFER,staticBuffer);
 gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,36,0);gl.vertexAttribPointer(normLoc,3,gl.FLOAT,false,36,12);gl.vertexAttribPointer(colorLoc,3,gl.FLOAT,false,36,24);
 gl.drawArrays(gl.TRIANGLES,0,staticCount);
 gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
 gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,36,0);gl.vertexAttribPointer(normLoc,3,gl.FLOAT,false,36,12);gl.vertexAttribPointer(colorLoc,3,gl.FLOAT,false,36,24);
 gl.drawArrays(gl.TRIANGLES,0,vertices.length/9);
}
function frame(ms){if(!world)return;const dt=Math.min((ms-last)/1000||0,.05);last=ms;if(!paused){sceneTime+=dt;stepClock+=dt;const dir=['up','down','left','right'].find(k=>pressed.has(k));if(dir&&!dialogue&&stepClock>.19){move(dir);stepClock=0;}const speed=Math.min(1,dt*11);visual.x+=(player.x-visual.x)*speed;visual.z+=(player.y-visual.z)*speed;const follow=Math.min(1,dt*5);cam.x+=(visual.x-cam.x)*follow;cam.z+=(visual.z-cam.z)*follow;cam.x=Math.max(7,Math.min(world.width-8,cam.x));cam.z=Math.max(6,Math.min(world.height-7,cam.z));}draw(sceneTime);requestAnimationFrame(frame);}
function togglePause(force){if(!world)return;paused=typeof force==='boolean'?force:!paused;pause.hidden=!paused;pressed.clear();if(!paused)canvas.focus({preventScroll:true});}
document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(k==='escape'){e.preventDefault();togglePause();return;}if(paused)return;const dir=({arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'})[k];if(dir){e.preventDefault();pressed.add(dir);if(!e.repeat){move(dir);stepClock=0;}}else if(['e','enter',' '].includes(k)){e.preventDefault();if(!e.repeat)talk();}});
document.addEventListener('keyup',e=>{const k=e.key.toLowerCase(),dir=({arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'})[k];if(dir)pressed.delete(dir);});
window.addEventListener('blur',()=>pressed.clear());
for(const b of document.querySelectorAll('[data-dir]')){const dir=b.dataset.dir;b.addEventListener('pointerdown',e=>{if(paused)return;e.preventDefault();pressed.add(dir);move(dir);});for(const event of ['pointerup','pointercancel','pointerleave'])b.addEventListener(event,()=>pressed.delete(dir));}
document.querySelector('[data-action="talk"]').addEventListener('click',talk);
document.getElementById('fallen-menu-button').addEventListener('click',()=>togglePause(true));document.getElementById('fallen-continue').addEventListener('click',()=>togglePause(false));
document.getElementById('fallen-exit').addEventListener('click',()=>{save();window.location.assign('/minigames.html');});
const fsButton=document.getElementById('fallen-fullscreen');fsButton.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}});document.addEventListener('fullscreenchange',()=>{fsButton.textContent=document.fullscreenElement?'Exit fullscreen':'Enter fullscreen';});
volume.addEventListener('input',()=>{volumeValue.textContent=volume.value+'%';});
const tunes={willowmere:{notes:[0,2,4,7,4,2,0,-1,0,4,7,9,7,4,2,-1],bass:[0,-5,-3,-5],root:261.626},default:{notes:[0,3,5,7,5,3,0,-2],bass:[0,-5],root:220}};
function musicTick(){if(!musicOn||paused)return;try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const tune=tunes[(world?.music||world?.town||'willowmere').toLowerCase()]||tunes.default;const i=musicStep++,when=audioCtx.currentTime+.02;function note(semi,duration,shape,level){const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type=shape;osc.frequency.value=tune.root*Math.pow(2,semi/12);gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,Number(volume.value)/100*level),when+.025);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);osc.connect(gain);gain.connect(audioCtx.destination);osc.start(when);osc.stop(when+duration+.02);}note(tune.notes[i%tune.notes.length],.34,'triangle',.07);if(i%4===0)note(tune.bass[(i/4)%tune.bass.length]-12,1.3,'sine',.045);}catch{}}
document.getElementById('fallen-music-toggle').addEventListener('click',e=>{musicOn=!musicOn;e.currentTarget.textContent='Music: '+(musicOn?'On':'Off');e.currentTarget.setAttribute('aria-pressed',String(musicOn));if(musicOn){musicTick();musicTimer=setInterval(musicTick,420);}else{clearInterval(musicTimer);musicTimer=null;}});
document.getElementById('fallen-save').addEventListener('click',save);document.getElementById('fallen-reset').addEventListener('click',()=>{player={...world.spawn,facing:'down'};visual={x:player.x,z:player.y};save();dialogue=null;dialog.hidden=true;});
(async()=>{try{const response=await fetch('/api/fallen-king/world',{credentials:'same-origin',cache:'no-store'});if(!response.ok){gate.textContent=response.status===401?'Log in as an administrator to access this preview.':response.status===403?'Only EloScanner administrators can play this preview.':'The administrator preview is unavailable.';return;}
world=await response.json();if(!Array.isArray(world.tiles)||world.tiles.length!==world.height)throw Error('Invalid world');
player={...load(),facing:'down'};visual={x:player.x,z:player.y};cam={x:player.x,z:player.y};gate.hidden=true;game.hidden=false;canvas.focus({preventScroll:true});requestAnimationFrame(frame);
}catch(e){console.error('Fallen King preview error',e);gate.textContent='Could not load the preview. Please retry later.';}})();
})();