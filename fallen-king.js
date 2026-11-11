(()=>{
'use strict';
const gate=document.getElementById('fallen-gate'),game=document.getElementById('fallen-game'),canvas=document.getElementById('fallen-canvas');
const dialog=document.getElementById('fallen-dialogue'),speaker=document.getElementById('fallen-speaker'),speech=document.getElementById('fallen-text');
const pause=document.getElementById('fallen-pause'),volume=document.getElementById('fallen-volume'),volumeValue=document.getElementById('fallen-volume-value');
const storageKey='eloscanner-fallen-king-admin-preview-v1',dirs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]},pressed=new Set(),solid=new Set(['T','H','w','F','D','X']);
let interior=null,mapOpen=false,world,player,dialogue=null,paused=false,last=0,stepClock=0,sceneTime=0,cam={x:0,z:0},visual={x:0,z:0},musicOn=false,audioCtx=null,musicTimer=null,musicStep=0;
const tile=(x,z)=>world?.tiles[z]?.[x]||'T';
const hash=(x,z,n=0)=>{let h=Math.imul(x+31,73856093)^Math.imul(z+47,19349663)^Math.imul(n+3,83492791);h^=h>>>13;return (h>>>0)/4294967295;};
function occupied(x,z){return world.npcs.some(n=>n.x===x&&n.y===z);}
function canWalk(x,z){return x>=0&&z>=0&&x<world.width&&z<world.height&&!solid.has(tile(x,z))&&!occupied(x,z);}
function save(){try{localStorage.setItem(storageKey,JSON.stringify({version:world.version,x:player.x,y:player.y,facing:player.facing}));return true}catch{return false;}}
function load(){try{const s=JSON.parse(localStorage.getItem(storageKey)||'null');if(s?.version===world.version&&Number.isInteger(s.x)&&Number.isInteger(s.y)&&canWalk(s.x,s.y))return s;}catch{}return world.spawn;}
function move(dir){if(paused||dialogue||mapOpen||interior)return;const [dx,dz]=dirs[dir];player.facing=dir;const x=player.x+dx,z=player.y+dz;if(canWalk(x,z)){player.x=x;player.y=z;save();}}
function talk(){if(paused||mapOpen)return;if(interior){leaveHouse();return;}if(dialogue){dialogue.i++;if(dialogue.i>=dialogue.npc.lines.length){dialogue=null;dialog.hidden=true;}else speech.textContent=dialogue.npc.lines[dialogue.i];return;}
const [dx,dz]=dirs[player.facing],tx=player.x+dx,tz=player.y+dz;if(tile(tx,tz)==='D'){enterHouse(tx,tz);return;}const npc=world.npcs.find(n=>n.x===tx&&n.y===tz);if(!npc)return;dialogue={npc,i:0};speaker.textContent=npc.name;speech.textContent=npc.lines[0];dialog.hidden=false;pressed.clear();}
const gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});
if(!gl){gate.textContent='This game needs a browser with WebGL enabled.';return;}
const vert='attribute vec3 p;attribute vec3 n;attribute vec3 c;uniform vec2 cam;uniform float aspect;uniform float zoom;varying vec3 col;void main(){vec3 q=p-vec3(cam.x,0.,cam.y);float sx=q.x;float sy=q.z*.93-q.y*.70;float depth=q.z*.92+q.y*.18;gl_Position=vec4(sx/(zoom*aspect),-sy/zoom,-depth/42.,1.);float light=.82+.18*max(dot(normalize(n),normalize(vec3(-.45,.9,.7))),0.);col=c*light;}';
const frag='precision mediump float;varying vec3 col;void main(){gl_FragColor=vec4(pow(col,vec3(.88)),1.);}';
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vert));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const posLoc=gl.getAttribLocation(program,'p'),normLoc=gl.getAttribLocation(program,'n'),colorLoc=gl.getAttribLocation(program,'c'),camLoc=gl.getUniformLocation(program,'cam'),aspectLoc=gl.getUniformLocation(program,'aspect'),zoomLoc=gl.getUniformLocation(program,'zoom');
const buffer=gl.createBuffer(),staticBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(posLoc);gl.enableVertexAttribArray(normLoc);gl.enableVertexAttribArray(colorLoc);
gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,36,0);gl.vertexAttribPointer(normLoc,3,gl.FLOAT,false,36,12);gl.vertexAttribPointer(colorLoc,3,gl.FLOAT,false,36,24);
gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.clearColor(.39,.56,.36,1);
let vertices=[],staticCount=0,staticReady=false;
function rgb(hex){const n=parseInt(hex.slice(1),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}
function tri(a,b,c,color){const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n)||1,k=rgb(color);for(const p of [a,b,c])vertices.push(...p,n[0]/l,n[1]/l,n[2]/l,...k);}
function quad(a,b,c,d,color){tri(a,b,c,color);tri(a,c,d,color);}
function box(x,y,z,w,h,d,color,roof){const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y1=y+h;quad([x0,y,z0],[x1,y,z0],[x1,y1,z0],[x0,y1,z0],color);quad([x1,y,z0],[x1,y,z1],[x1,y1,z1],[x1,y1,z0],color);quad([x1,y,z1],[x0,y,z1],[x0,y1,z1],[x1,y1,z1],roof||color);quad([x0,y,z1],[x0,y,z0],[x0,y1,z0],[x0,y1,z1],color);quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],roof||color);}
function cylinder(x,y,z,r0,r1,h,color,sides=12){for(let i=0;i<sides;i++){const a=i*2*Math.PI/sides,b=(i+1)*2*Math.PI/sides;const A=[x+Math.cos(a)*r0,y,z+Math.sin(a)*r0],B=[x+Math.cos(b)*r0,y,z+Math.sin(b)*r0],C=[x+Math.cos(b)*r1,y+h,z+Math.sin(b)*r1],D=[x+Math.cos(a)*r1,y+h,z+Math.sin(a)*r1];quad(A,B,C,D,color);tri([x,y+h,z],D,C,color);}}
function sphere(x,y,z,r,color,detail=9){for(let j=0;j<detail;j++){const v0=-Math.PI/2+j*Math.PI/detail,v1=-Math.PI/2+(j+1)*Math.PI/detail;for(let i=0;i<detail*2;i++){const a=i*Math.PI/detail,b=(i+1)*Math.PI/detail;const pt=(v,t)=>[x+r*Math.cos(v)*Math.cos(t),y+r*Math.sin(v),z+r*Math.cos(v)*Math.sin(t)];quad(pt(v0,a),pt(v0,b),pt(v1,b),pt(v1,a),color);}}}
function cone(x,y,z,r,h,color,sides=9){cylinder(x,y,z,r,0,h,color,sides);}
function roof(x,z,w,d,h,color){const e=.17,r=h+.94;quad([x-w/2-e,h,z-d/2-e],[x+w/2+e,h,z-d/2-e],[x+w/2+e,r,z],[x-w/2-e,r,z],color);quad([x-w/2-e,r,z],[x+w/2+e,r,z],[x+w/2+e,h,z+d/2+e],[x-w/2-e,h,z+d/2+e],color);tri([x-w/2-e,h,z-d/2-e],[x-w/2-e,r,z],[x-w/2-e,h,z+d/2+e],'#70505b');tri([x+w/2+e,h,z+d/2+e],[x+w/2+e,r,z],[x+w/2+e,h,z-d/2-e],'#70505b');}
function roofTiles(h){
 const x=h.x+h.w/2,z=h.y+h.h/2,w=h.w-.15,d=h.h-.15,H=2.5;
 const palette={red:['#bb6a63','#86434b'],blue:['#658ba0','#3b5c76'],orange:['#d18a58','#92573a'],purple:['#92749a','#604769'],navy:['#697e92','#384c63']}[h.roof]||['#bb6a63','#86434b'];
 const e=.17,half=d/2+e;
 // Tiles sit just above each sloping roof plane to avoid z-fighting.
 for(let side of [-1,1])for(let row=0;row<4;row++){
  const f=(row+.5)/4,zz=z+side*half*f,yy=H+.94*(1-f)+.028;
  for(let col=0;col<Math.ceil(w*2);col++){
   const xx=x-w/2+(col+.5)*w/Math.ceil(w*2);
   box(xx,yy,zz,w/Math.ceil(w*2)-.055,.025,.13,(row+col)%3===0?palette[1]:palette[0]);
  }
 }
 box(x,H+.94,z,w+.35,.085,.15,'#e5d2b3');
}

function building(h){
 const x=h.x+h.w/2,z=h.y+h.h/2,w=h.w-.15,d=h.h-.15,H=2.5;
 const roofColors={red:'#a34f55',blue:'#456d8a',orange:'#b77445',purple:'#70537d',navy:'#4b586c'};
 const roofColor=roofColors[h.roof]||roofColors.red;
 // Solid structure; every accent is placed clearly in front of the facade,
 // rather than coplanar with the wall or another trim (prevents z-fighting).
 box(x,0,z,w,H,d,'#d9c9a6','#e7d6b2');
 roof(x,z,w,d,H,roofColor);roofTiles(h);
 const face=z+d/2, trim=face+.13, detail=face+.31;
 // One continuous stone foundation and a tidy timber fascia.
 box(x,.08,face+.10,w-.14,.17,.13,'#a58b70');
 box(x,H-.18,face+.12,w-.2,.17,.13,'#8f6a4b');
 box(x,H-.44,face+.17,w-.36,.09,.10,'#edd4a4');
 // Wall stones are deliberately separated, not intersecting corner posts.
 for(let side of [-1,1]){
  const sx=x+side*(w/2-.53);
  for(let row=0;row<3;row++){
   box(sx, .37+row*.56,trim+.025,.32,.11,.09,row%2?'#c7af8c':'#baa587');
  }
 }
 // Windows: recessed blue glass with a single contrasting wood frame.
 for(const wx of [x-1.30,x+1.30]){
  box(wx,1.37,face+.10,.91,.95,.13,'#7b5840');
  box(wx,1.40,face+.20,.70,.73,.10,'#608e9e');
  box(wx,1.40,face+.29,.08,.72,.06,'#f0dfb9');
  box(wx,1.40,face+.29,.70,.075,.06,'#f0dfb9');
  box(wx, .88,face+.16,1.05,.11,.22,'#dfc79f');
  // Flower boxes provide details without additional animation.
  box(wx,.76,face+.30,.91,.16,.29,'#93684b');
  for(let i=-1;i<=1;i++){
   sphere(wx+i*.23,.92,face+.38,.105,i===0?'#639353':'#82a65a',6);
  }
 }
 // One clearly layered door with lintel, brass handle and doorstep.
 box(x,.78,face+.11,1.18,1.58,.14,'#8b6748');
 box(x,.75,face+.23,.94,1.42,.10,'#60432f');
 box(x+.30,1.06,face+.31,.065,.065,.06,'#ebcd83');
 box(x,1.63,face+.18,1.34,.14,.17,'#e3ce9e');
 box(x,.04,face+.35,1.50,.12,.46,'#baa890');
 // Raised inn/bakery sign: raised away from the wall and from the frame.
 box(x,2.24,face+.22,1.82,.36,.12,'#77573f');
 box(x,2.24,face+.32,1.59,.22,.065,'#ebd09a');
 // Dormer and chimney with dark cap.
 box(x+w/2-.82,H+.22,z-.42,.51,.82,.49,'#bba486');
 box(x+w/2-.82,H+1.0,z-.42,.68,.15,.62,'#69504d');
 // Consistent fascia ridge and roof tile rows; distinct height for stability.
 for(let i=-2;i<=2;i++){
  const tx=x+i*(w/6);
  box(tx,H+.055,z+d/2+.16,.10,.095,.14,'#e6ceaf');
 }
}
function tree(x,z){cylinder(x,0,z,.16,.13,1.35,'#77583b',7);cone(x,1.0,z,.77,1.35,'#377d4e',7);cone(x,1.65,z,.61,1.15,'#4b9459',7);cone(x,2.18,z,.41,.79,'#5c9d61',7);}
function pawnBody(x,z,color){
 const pale=color==='white',base=pale?'#e9ddc5':'#35435a',rim=pale?'#ad9b81':'#202a3a',light=pale?'#fff2d9':'#687991';
 // Consistent turned-stone silhouette: foot, plinth, taper, neck, collar.
 cylinder(x,.055,z,.37,.37,.12,rim,12);
 cylinder(x,.18,z,.34,.29,.14,base,12);
 cylinder(x,.32,z,.27,.17,.52,base,12);
 cylinder(x,.84,z,.205,.24,.115,light,12);
 cylinder(x,.95,z,.23,.21,.09,rim,12);
 return {base,rim,light};
}
function piece(x,z,type,color,aldric=false){
 const {base,rim,light}=pawnBody(x,z,color);
 if(type==='P'){
  cylinder(x,1.0,z,.19,.19,.11,base,12);
  sphere(x,1.31,z,.30,base,12);
  sphere(x-.075,1.39,z+.19,.055,light,6);
 }
 if(type==='R'){
  cylinder(x,1.03,z,.28,.31,.58,base,12);
  cylinder(x,1.60,z,.39,.38,.13,rim,12);
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4;
   box(x+Math.cos(a)*.30,1.72,z+Math.sin(a)*.30,.16,.21,.16,light);
  }
  cylinder(x,1.75,z,.23,.23,.09,rim,10);
 }
 if(type==='B'){
  cylinder(x,1.00,z,.23,.31,.45,base,12);
  sphere(x,1.53,z,.31,base,12);
  cone(x,1.69,z,.21,.36,light,12);
  // A contrasting mitre slash identifies the bishop from overhead.
  box(x,1.68,z+.23,.065,.25,.08,rim);
  sphere(x,2.06,z,.072,light,8);
 }
 if(type==='N'){
  cylinder(x,1.03,z,.29,.28,.23,base,12);
  box(x,1.31,z,.43,.61,.36,base);
  sphere(x+.04,1.69,z-.09,.30,base,10);
  cone(x+.22,1.45,z-.27,.17,.30,base,9);
  sphere(x+.22,1.77,z-.33,.065,light,8);
  box(x-.20,1.70,z+.02,.09,.25,.12,rim);
 }
 if(type==='Q'){
  cylinder(x,1.02,z,.28,.32,.64,base,12);cylinder(x,1.66,z,.37,.37,.16,rim,12);
  cylinder(x,1.82,z,.29,.38,.26,light,12);
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;sphere(x+Math.cos(a)*.33,2.20,z+Math.sin(a)*.33,.115,light,7);}
  sphere(x,2.30,z,.14,rim,9);
 }
 if(type==='K'){
  cylinder(x,1.02,z,.29,.31,.60,base,12);
  cylinder(x,1.62,z,.37,.36,.15,rim,12);
  cylinder(x,1.78,z,.27,.24,.16,light,12);
  if(aldric){
   // Crownless king: tall regal collar and exposed rounded finial.
   // No crown points and no cross until the crown is recovered in the story.
   cylinder(x,1.95,z,.28,.26,.10,rim,12);
   sphere(x,2.13,z,.21,base,11);
   cylinder(x,1.59,z,.40,.39,.07,light,12);
  }else{
   cylinder(x,1.95,z,.30,.30,.14,rim,12);
   for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    sphere(x+Math.cos(a)*.28,2.18,z+Math.sin(a)*.28,.12,light,7);
   }
  }
 }
}
// Chess-piece characters remain sculptural; their identities come from faces and trims.
const characterLooks={
 pip:{accent:'#d39b5b',face:'bright',trim:'#f0d7a0'},
 baker:{accent:'#b76c4f',face:'cheerful',trim:'#f7e0a6'},
 guard:{accent:'#426d89',face:'stern',trim:'#c9c7ac'},
 scholar:{accent:'#806a9e',face:'thoughtful',trim:'#d4c4f0'},
 courier:{accent:'#bd8847',face:'alert',trim:'#e8c788'},
 gardener:{accent:'#638d57',face:'gentle',trim:'#b7d6a0'},
 aldric:{accent:'#af8a54',face:'determined',trim:'#f5dfab'}
};
function features(x,z,type,color,aldric=false,id=''){
 const look=characterLooks[id]||characterLooks[aldric?'aldric':'pip'];
 const pale=color==='white';
 // Light sclera and tiny warm-gray pupils, never giant black doll eyes.
 const sclera=pale?'#f6eee0':'#f3ede2',pupil='#554b45';
 // Position the face on the actual head or tower, including the knight.
 const eyeY=type==='P'?1.36:type==='N'?1.75:type==='R'?1.43:type==='B'?1.53:1.90;
 const eyeZ=type==='N'?.125:type==='P'?.283:type==='R'?.315:type==='B'?.275:.275;
 const eyeX=type==='N'?.04:0;
 for(const side of [-1,1]){
  const ex=x+eyeX+side*.108;
  sphere(ex,eyeY,z+eyeZ,.062,sclera,9);
  sphere(ex+side*.012,eyeY-.007,z+eyeZ+.050,.024,pupil,8);
  // Individual eyebrow angle and thickness, subtle rather than cartoonish.
  const browY=eyeY+(look.face==='stern'?.115:.100);
  box(ex,browY,z+eyeZ+.012,.118,.023,.038,
    look.face==='thoughtful'?'#b0a8a0':pale?'#a18e7a':'#d7c9b5');
 }
 // Small mouths with restrained expression; no exaggerated smiling pawns.
 const mouthY=eyeY-.16;
 if(look.face==='cheerful'){
  box(x+eyeX,mouthY,z+eyeZ+.052,.14,.022,.035,'#a47768');
  sphere(x+eyeX-.070,mouthY+.014,z+eyeZ+.055,.022,'#ad8070',6);
  sphere(x+eyeX+.070,mouthY+.014,z+eyeZ+.055,.022,'#ad8070',6);
 }else if(look.face==='stern'||look.face==='determined'){
  box(x+eyeX,mouthY,z+eyeZ+.046,.14,.025,.035,'#847365');
 }else if(look.face==='alert'){
  sphere(x+eyeX,mouthY,z+eyeZ+.052,.035,'#8b7567',8);
 }else{
  box(x+eyeX,mouthY,z+eyeZ+.046,.10,.018,.025,'#ad9180');
 }
 // Chess-inspired clothing details: coloured enamel bands, collars and badges.
 // No human arms, hands or hair; silhouettes stay recognisably chess pieces.
 cylinder(x,.69,z,.245,.245,.075,look.accent,12);
 cylinder(x,.77,z,.222,.222,.045,look.trim,12);
 box(x,.57,z+.241,.15,.19,.045,look.accent);
 if(id==='baker'){sphere(x,.60,z+.290,.052,'#e8cf92',8);}
 if(id==='guard'){box(x,1.10,z+.335,.15,.19,.045,look.accent);}
 if(id==='scholar'){sphere(x,1.06,z+.245,.075,look.trim,8);}
 if(id==='courier'){box(x,.50,z+.30,.19,.11,.055,look.trim);}
 if(id==='gardener'){sphere(x+.23,.94,z+.06,.085,'#a5c178',8);}
 if(aldric){cylinder(x,1.60,z,.39,.39,.065,look.accent,12);}
}

function ground(x,z){
 const kind=tile(x,z),n=hash(x,z);
 const path=kind==='p'||kind==='s',water=kind==='w',forest=kind==='T';
 let col=kind==='p'?'#d1bb91':kind==='s'?'#cab99c':water?'#468ca9':forest?'#638f5a':kind==='f'?'#7bac69':kind==='g'?'#91b878':'#83ad70';
 box(x+.5,-.18,z+.5,1,.16,1,col);
 if(path){
  // Ordered cobbles and a readable path border. Very shallow geometry avoids heavy 3D.
  const edge='#9d9579',stone=kind==='s'?'#e0d1b3':'#e3cf9e';
  const left=tile(x-1,z),right=tile(x+1,z),up=tile(x,z-1),down=tile(x,z+1);
  if(!['p','s','D'].includes(left))box(x+.07,.009,z+.5,.105,.018,.90,edge);
  if(!['p','s','D'].includes(right))box(x+.93,.009,z+.5,.105,.018,.90,edge);
  if(!['p','s','D'].includes(up))box(x+.5,.009,z+.07,.90,.018,.105,edge);
  if(!['p','s','D'].includes(down))box(x+.5,.009,z+.93,.90,.018,.105,edge);
  for(let i=0;i<5;i++){
   const dx=.10+(i%3)*.31+hash(x,z,i)*.06,dz=.16+Math.floor(i/3)*.43+hash(z,x,i)*.14;
   box(x+dx,.011,z+dz,.19+hash(x,z,i+7)*.10,.018,.12,i%4===0?'#a99a7d':i%3===0?'#efe0ba':stone);
  }
  if(n<.24){box(x+.65,.023,z+.69,.25,.020,.13,'#9e8d6f');}
  if(n>.80){box(x+.31,.024,z+.25,.14,.020,.18,'#a68e6b');}
  // Hand-set irregular stones, darker earth and tiny cracks; all static.
  if(n>.37&&n<.66){
   const px=x+.17+hash(x,z,11)*.56,pz=z+.17+hash(x,z,12)*.56;
   box(px,.029,pz,.19,.013,.10,'#a18e73');
   box(px+.10,.032,pz+.055,.09,.013,.035,'#86775e');
  }
  if(n<.13){
   const px=x+.28+hash(x,z,13)*.40,pz=z+.30+hash(x,z,14)*.38;
   box(px,.027,pz,.22,.013,.14,'#907c60');
   box(px-.11,.031,pz+.06,.12,.013,.05,'#a38e70');
  }
  if(n>.91){
   box(x+.29,.027,z+.53,.07,.013,.23,'#988b74');
   box(x+.35,.030,z+.64,.17,.013,.05,'#988b74');
  }
 } else if(water){
  // Static lily pads, shoreline and small ripples.
  const shore='#b8c68b';
  if(tile(x-1,z)!=='w')box(x+.055,.016,z+.5,.10,.035,1,shore);
  if(tile(x+1,z)!=='w')box(x+.945,.016,z+.5,.10,.035,1,shore);
  if(tile(x,z-1)!=='w')box(x+.5,.016,z+.055,1,.035,.10,shore);
  if(tile(x,z+1)!=='w')box(x+.5,.016,z+.945,1,.035,.10,shore);
  for(let i=0;i<3;i++){
   box(x+.19+i*.25,.017,z+.32+hash(x,z,i)*.32,.15,.012,.038,i===1?'#b9e1dc':'#9ecacb');
  }
  if(n<.16){cylinder(x+.65,.025,z+.62,.13,.13,.025,'#69a979',7);sphere(x+.71,.08,z+.62,.055,'#ecc9d8',5);}
 }else if(!forest&&kind!=='H'&&kind!=='D'&&kind!=='F'){
  // Still grass: low-poly blades, small flowers and color variation.
  for(let i=0;i<3;i++){
   const px=x+.12+hash(x,z,i)*.72,pz=z+.13+hash(z,x,i)*.7;
   const ht=.11+hash(x,z,i+6)*.13;
   cone(px,.015,pz,.045,ht,i===0?'#609755':i===1?'#4e8e55':'#b3c97d',4);
  }
  if(n<.17){sphere(x+.25,.11,z+.32,.058,n<.08?'#f2d9a3':'#eee1c9',5);sphere(x+.38,.10,z+.43,.048,'#e6b2c4',5);}
  if(n>.88)box(x+.47,.008,z+.31,.28,.012,.08,'#72a264');
 }
}
function fountain(x,z){
 // One central ornamental fountain, rather than three identical objects.
 cylinder(x,0,z,.79,.79,.24,'#9ca9a3',12);
 cylinder(x,.25,z,.67,.64,.16,'#d7d4c0',12);
 cylinder(x,.41,z,.57,.56,.035,'#5dabc1',12);
 cylinder(x,.40,z,.25,.20,.77,'#c1bda9',12);
 cylinder(x,1.1,z,.44,.44,.16,'#e9dac0',12);
 cylinder(x,1.26,z,.32,.32,.025,'#76baca',12);
 cylinder(x,1.30,z,.13,.09,.52,'#d8d3bd',10);
 sphere(x,1.86,z,.15,'#f2e6c8',8);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;const px=x+Math.cos(a)*.49,pz=z+Math.sin(a)*.49;box(px,.48,pz,.11,.025,.07,'#b3e0dc');}
}
function draw(t){if(!world)return;const dpr=Math.min(window.devicePixelRatio||1,.85),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
const aspect=w/Math.max(h,1),zoom=aspect<1?5.6:5.0;vertices=[];
if(!staticReady){
 // Static terrain and buildings are generated and uploaded once, not each frame.
 for(let z=0;z<world.height;z++)for(let x=0;x<world.width;x++){
  ground(x,z);
  if(tile(x,z)==='T')tree(x+.5,z+.5);
  if(tile(x,z)==='F')fountain(x+.5,z+.5);
 }
 for(const h of world.houses||[])building(h);
 for(const s of world.showcase||[]){
  // Raised stone plinths make the display visible against the plaza.
  const sx=s.x+.5,sz=s.y+.5;
  box(sx,.14,sz,.91,.28,.91,'#776d66');
  box(sx,.33,sz,.84,.12,.84,'#d9c9ab');
  cylinder(sx,.40,sz,.45,.45,.13,'#b8a98c',12);
  piece(sx,sz,s.piece,s.color,false);
  features(sx,sz,s.piece,s.color,false,'showcase');
}
 staticCount=vertices.length/9;
 gl.bindBuffer(gl.ARRAY_BUFFER,staticBuffer);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
 staticReady=true;vertices=[];
}
for(const n of world.npcs){piece(n.x+.5,n.y+.5,n.piece,n.color,false);features(n.x+.5,n.y+.5,n.piece,n.color,false,n.id);}
piece(visual.x+.5,visual.z+.5,'K','white',true);features(visual.x+.5,visual.z+.5,'K','white',true,'aldric');
gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform2f(camLoc,cam.x+.5,cam.z+.5);gl.uniform1f(aspectLoc,aspect);gl.uniform1f(zoomLoc,zoom);
gl.bindBuffer(gl.ARRAY_BUFFER,staticBuffer);
 gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,36,0);gl.vertexAttribPointer(normLoc,3,gl.FLOAT,false,36,12);gl.vertexAttribPointer(colorLoc,3,gl.FLOAT,false,36,24);
 gl.drawArrays(gl.TRIANGLES,0,staticCount);
 gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
 gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,36,0);gl.vertexAttribPointer(normLoc,3,gl.FLOAT,false,36,12);gl.vertexAttribPointer(colorLoc,3,gl.FLOAT,false,36,24);
 gl.drawArrays(gl.TRIANGLES,0,vertices.length/9);
}
function frame(ms){if(!world)return;const dt=Math.min((ms-last)/1000||0,.05);last=ms;if(!paused){sceneTime+=dt;stepClock+=dt;const dir=['up','down','left','right'].find(k=>pressed.has(k));if(dir&&!dialogue&&stepClock>.19){move(dir);stepClock=0;}const speed=Math.min(1,dt*11);visual.x+=(player.x-visual.x)*speed;visual.z+=(player.y-visual.z)*speed;const follow=Math.min(1,dt*5);cam.x+=(visual.x-cam.x)*follow;cam.z+=(visual.z-cam.z)*follow;cam.x=Math.max(7,Math.min(world.width-8,cam.x));cam.z=Math.max(6,Math.min(world.height-7,cam.z));}updateDoorHint();draw(sceneTime);requestAnimationFrame(frame);}
function togglePause(force){if(!world)return;if(mapOpen)closeMap();if(interior)return;paused=typeof force==='boolean'?force:!paused;pause.hidden=!paused;pressed.clear();if(!paused)canvas.focus({preventScroll:true});}
document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(k==='escape'){e.preventDefault();if(mapOpen){closeMap();return;}if(interior){leaveHouse();return;}togglePause();return;}if(paused||mapOpen||interior)return;const dir=({arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'})[k];if(dir){e.preventDefault();pressed.add(dir);if(!e.repeat){move(dir);stepClock=0;}}else if(['e','enter',' '].includes(k)){e.preventDefault();if(!e.repeat)talk();}});
document.addEventListener('keyup',e=>{const k=e.key.toLowerCase(),dir=({arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'})[k];if(dir)pressed.delete(dir);});
window.addEventListener('blur',()=>pressed.clear());
for(const b of document.querySelectorAll('[data-dir]')){const dir=b.dataset.dir;b.addEventListener('pointerdown',e=>{if(paused||mapOpen||interior)return;e.preventDefault();pressed.add(dir);move(dir);});for(const event of ['pointerup','pointercancel','pointerleave'])b.addEventListener(event,()=>pressed.delete(dir));}
document.querySelector('[data-action="talk"]').addEventListener('click',talk);

const mapPanel=document.getElementById('fallen-map'),mapCanvas=document.getElementById('fallen-map-canvas');
function drawMap(){
 if(!world)return;const ctx=mapCanvas.getContext('2d'),scale=10;
 mapCanvas.width=world.width*scale;mapCanvas.height=world.height*scale;
 const colors={T:'#3b6947',w:'#3c8fb0',p:'#bfa878',s:'#d2bf99',H:'#b07c5a',D:'#d4b27a',F:'#88a9b2',f:'#81b668',g:'#8dbd73','.':'#76a65f'};
 for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){
  ctx.fillStyle=colors[tile(x,y)]||colors['.'];ctx.fillRect(x*scale,y*scale,scale,scale);
 }
 for(const h of world.houses||[]){ctx.fillStyle='#f3e1b9';ctx.font='bold 9px sans-serif';ctx.fillText(h.name.slice(0,12),(h.x-1)*scale,(h.y-1)*scale);}
 for(const s of world.showcase||[]){ctx.fillStyle='#f5d78b';ctx.fillRect(s.x*scale+3,s.y*scale+3,4,4);}
 ctx.fillStyle='#fff';ctx.beginPath();ctx.arc((player.x+.5)*scale,(player.y+.5)*scale,5,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#26364c';ctx.lineWidth=2;ctx.stroke();
}
function closeMap(){mapOpen=false;mapPanel.hidden=true;canvas.focus({preventScroll:true});}
function openMap(){if(!world||paused||interior)return;mapOpen=true;pressed.clear();drawMap();mapPanel.hidden=false;}
document.getElementById('fallen-map-button').addEventListener('click',openMap);
document.getElementById('fallen-map-close').addEventListener('click',closeMap);
const housePanel=document.getElementById('fallen-house');
function enterHouse(x,y){
 const h=(world.houses||[]).find(h=>x>=h.x&&x<h.x+h.w&&y>=h.y&&y<h.y+h.h);
 if(!h)return;
 if(h.name!=='The Bakery'){
  speaker.textContent=h.name;speech.textContent='The door is closed for now. The bakery on the north-west side of the square is open.';dialogue={npc:{lines:[speech.textContent]},i:0};dialog.hidden=false;pressed.clear();return;
 }
 interior=h;pressed.clear();housePanel.hidden=false;
 document.getElementById('fallen-house-name').textContent='The Bakery';
 document.getElementById('fallen-house-text').textContent='The smell of warm bread fills the bakery. A wooden counter, a brick oven and a sunlit window make this a cosy stop in Willowmere.';
}
function leaveHouse(){interior=null;housePanel.hidden=true;canvas.focus({preventScroll:true});}
function updateDoorHint(){
 const hint=document.getElementById('fallen-door-hint');if(!hint||!world)return;
 const [dx,dz]=dirs[player.facing],tx=player.x+dx,tz=player.y+dz;
 const h=tile(tx,tz)==='D'?(world.houses||[]).find(h=>tx>=h.x&&tx<h.x+h.w&&tz>=h.y&&tz<h.y+h.h):null;
 hint.hidden=!h||!!interior||mapOpen||paused||!!dialogue;
 if(h)hint.textContent=h.name==='The Bakery'?'E / Space · Enter the Bakery':'E / Space · Check '+h.name;
}
document.getElementById('fallen-house-exit').addEventListener('click',leaveHouse);
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