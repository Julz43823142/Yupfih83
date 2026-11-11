(()=>{
'use strict';
const gate=document.getElementById('fallen-gate'),game=document.getElementById('fallen-game'),canvas=document.getElementById('fallen-canvas');
const dialog=document.getElementById('fallen-dialogue'),speaker=document.getElementById('fallen-speaker'),speech=document.getElementById('fallen-text');
const pause=document.getElementById('fallen-pause'),volume=document.getElementById('fallen-volume'),volumeValue=document.getElementById('fallen-volume-value');
const storageKey='eloscanner-fallen-king-admin-preview-v1',dirs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]},pressed=new Set(),solid=new Set(['T','H','w','F','D','X']);
let interior=null,outdoorState=null,mapOpen=false,world,player,dialogue=null,paused=false,last=0,stepClock=0,sceneTime=0,cam={x:0,z:0},visual={x:0,z:0},musicOn=false,audioCtx=null,musicTimer=null,musicStep=0;
const tile=(x,z)=>world?.tiles[z]?.[x]||'T';
const hash=(x,z,n=0)=>{let h=Math.imul(x+31,73856093)^Math.imul(z+47,19349663)^Math.imul(n+3,83492791);h^=h>>>13;return (h>>>0)/4294967295;};
function occupied(x,z){return world.npcs.some(n=>n.x===x&&n.y===z);}
function canWalk(x,z){return x>=0&&z>=0&&x<world.width&&z<world.height&&!solid.has(tile(x,z))&&!occupied(x,z);}
function save(){try{const w=outdoorState?.world||world,p=outdoorState?.player||player;localStorage.setItem(storageKey,JSON.stringify({version:w.version,x:p.x,y:p.y,facing:p.facing}));return true}catch{return false;}}
function load(){try{const s=JSON.parse(localStorage.getItem(storageKey)||'null');if(s?.version===world.version&&Number.isInteger(s.x)&&Number.isInteger(s.y)&&canWalk(s.x,s.y))return s;}catch{}return world.spawn;}
function move(dir){if(paused||dialogue||mapOpen)return;const [dx,dz]=dirs[dir];player.facing=dir;const x=player.x+dx,z=player.y+dz;if(interior&&x===6&&z===8){leaveHouse();return;}if(canWalk(x,z)){player.x=x;player.y=z;if(!interior){save();collectCosmetic();}}}
function talk(){if(paused||mapOpen)return;if(interior){if(player.y>=7&&player.facing==='down')leaveHouse();return;}if(dialogue){dialogue.i++;if(dialogue.i>=dialogue.npc.lines.length){dialogue=null;dialog.hidden=true;}else speech.textContent=dialogue.npc.lines[dialogue.i];return;}
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
 if(h.name==='Town Hall'){box(x-w/2+.8,H+.1,z+.35,1.25,.72,1.35,'#b7a17d');box(x-w/2+.8,H+.87,z+.35,1.42,.12,1.48,'#50637a');}
 if(h.name==='The Inn'){box(x+w/2-.42,.2,face+.14,.21,1.9,.16,'#795c48');box(x+w/2-.84,.75,face+.19,.18,.85,.11,'#b28d6b');}
 if(h.name==='Village Library'){for(let i=0;i<3;i++)box(x-1.7+i*.28,1.94,face+.24,.09,.35,.08,'#6d8790');}
 if(h.name==='The Workshop'){box(x-1.8,.34,face+.25,.72,.30,.20,'#756351');}
 if(h.name==='The Bakery'){box(x-1.95,1.78,face+.20,.12,.44,.08,'#a68c6d');}
 // Consistent fascia ridge and roof tile rows; distinct height for stability.
 for(let i=-2;i<=2;i++){
  const tx=x+i*(w/6);
  box(tx,H+.055,z+d/2+.16,.10,.095,.14,'#e6ceaf');
 }
}
function drawBakeryInterior(){
 for(let z=0;z<10;z++)for(let x=0;x<12;x++){
  box(x+.5,-.20,z+.5,1,.16,1,(x+z)%2?'#ab7c55':'#b78a60');
  if(z===0||x===0||x===11){
   box(x+.5,0,z+.5,1,2.5,1,'#c7b38c');
   if((x+z)%3===0)box(x+.5,.45,z+.5,1,.11,1,'#95714f');
  }
 }
 for(let x=0;x<12;x++)box(x+.5,0,9.5,1,.40,1,'#c7b38c');
 box(6.5,.005,8.5,.85,.015,.85,'#d6bc8d');
 box(5.5,.1,3.5,5,.88,1.2,'#835538','#b48153');
 box(5.5,1.01,3.5,5.3,.16,1.35,'#e1c391');
 for(let i=0;i<4;i++){sphere(3.7+i*1.1,1.27,3.55,.27,'#d7a45e',9);box(3.7+i*1.1,1.50,3.58,.25,.025,.05,'#f5d99c');}
 box(9.5,.1,2.2,2.2,2.2,2.0,'#b17b5b');
 box(9.5,.27,3.28,1.35,1.38,.12,'#493b32');
 box(9.5,.32,3.38,.78,.35,.12,'#c86d3d');
 for(const wx of [2.2,7.5]){box(wx,1.05,.54,1.3,1.05,.11,'#694b39');box(wx,1.16,.64,1.06,.82,.08,'#8db9bd');}
 box(2.1,.65,5.0,1.1,.10,.5,'#77553d');
 box(5.7,.012,6.25,2.5,.018,1.3,'#8c6251');box(5.7,.034,6.25,2.15,.018,.95,'#c59c74');
}
function villageProps(){
 box(19.5,.05,22.5,.52,.95,.43,'#8d3d37');
 box(19.5,.94,22.5,.61,.13,.52,'#bd6452');
 box(19.5,.72,22.75,.33,.065,.05,'#e4c48d');
 box(19.5,.33,22.76,.27,.22,.05,'#d9bd93');
}
function tree(x,z){cylinder(x,0,z,.16,.13,1.35,'#77583b',7);cone(x,1.0,z,.77,1.35,'#377d4e',7);cone(x,1.65,z,.61,1.15,'#4b9459',7);cone(x,2.18,z,.41,.79,'#5c9d61',7);}
function pawnBody(x,z,color){
 const pale=color==='white',base=pale?'#e9ddc5':'#68768a',rim=pale?'#ad9b81':'#303d50',light=pale?'#fff2d9':'#a0aec0';
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
 const ink=color==='white'?'#786d64':'#394453';
 if(type==='P'){
  cylinder(x,1.0,z,.19,.19,.11,base,12);
  sphere(x,1.31,z,.30,base,12);
  sphere(x-.075,1.39,z+.19,.055,light,6);
 }
 if(type==='R'){
  // A squat stone keep: distinct dark masonry joints, arched front gate, battlements.
  cylinder(x,.96,z,.405,.405,.27,ink,12);
  cylinder(x,.98,z,.36,.36,.22,base,12);
  cylinder(x,1.18,z,.375,.365,.47,ink,12);
  cylinder(x,1.20,z,.33,.30,.42,base,12);
  cylinder(x,1.60,z,.46,.46,.15,ink,12);
  cylinder(x,1.61,z,.43,.43,.12,rim,12);
  cylinder(x,1.72,z,.37,.37,.14,ink,12);
  cylinder(x,1.73,z,.33,.33,.12,light,12);
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4;
   box(x+Math.cos(a)*.35,1.825,z+Math.sin(a)*.35,.205,.29,.205,ink);
   box(x+Math.cos(a)*.35,1.85,z+Math.sin(a)*.35,.16,.23,.16,i%2?rim:light);
  }
  // Dark doorway and lintel face the camera, so it reads as a castle.
  box(x,1.01,z+.393,.29,.43,.045,ink);
  box(x,1.03,z+.422,.22,.38,.055,ink);
  sphere(x,1.37,z+.414,.145,ink,8);
  sphere(x,1.37,z+.443,.11,ink,8);
  box(x,1.58,z+.347,.43,.045,.065,rim);
  for(let row=0;row<3;row++)for(let side of [-1,1])
   box(x+side*.22,1.24+row*.17,z+.287,.12,.027,.06,rim);
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
  // A true horse profile with readable light and dark materials.
  // Dark silhouette behind light planes gives the head visible 2.5D depth.
  cylinder(x,.94,z,.367,.317,.31,ink,12);
  cylinder(x,.96,z,.35,.30,.30,rim,12);
  box(x,1.15,z-.13,.565,.68,.465,ink);
  box(x,1.18,z-.13,.55,.66,.45,rim);
  box(x,1.23,z+.05,.47,.635,.465,ink);
  box(x,1.25,z+.05,.45,.62,.44,base);
  box(x,1.59,z+.12,.54,.49,.48,ink);
  box(x,1.61,z+.12,.52,.48,.46,base);
  box(x,1.65,z+.32,.47,.40,.47,ink);
  box(x,1.67,z+.32,.45,.38,.45,light);
  // Side cheek planes and a bold cheekbone define the direction of the head.
  box(x-.215,1.56,z+.42,.06,.24,.32,rim);
  box(x+.215,1.56,z+.42,.06,.24,.32,rim);
  // Projecting long muzzle with separate lower jaw and dark nose.
  box(x,1.50,z+.57,.42,.29,.46,ink);
  box(x,1.52,z+.57,.40,.27,.44,base);
  box(x,1.39,z+.76,.39,.145,.23,ink);
  box(x,1.41,z+.76,.37,.13,.21,rim);
  box(x,1.53,z+.81,.38,.13,.17,ink);
  box(x,1.55,z+.81,.36,.11,.15,light);
  for(const side of [-1,1]){
   cone(x+side*.19,1.88,z+.08,.14,.36,ink,9);
   cone(x+side*.19,1.90,z+.08,.105,.29,'#b8a58b',9);
   cone(x+side*.19,1.96,z+.10,.055,.18,light,8);
   // Eye sockets with pale sclera, small pupils, no oversized cartoon stare.
   sphere(x+side*.215,1.75,z+.475,.092,ink,9);
   sphere(x+side*.215,1.75,z+.537,.058,'#f4ebdc',9);
   sphere(x+side*.215,1.75,z+.586,.023,ink,7);
   sphere(x+side*.11,1.55,z+.896,.025,ink,7);
  }
  for(let i=0;i<5;i++){
   box(x,1.23+i*.13,z-.37,.36,.095,.13,i%2?ink:rim);
  }
  box(x,1.38,z+.53,.43,.045,.09,ink);
  // Visible bridge and nostril separation, without filling the entire face black.
  box(x,1.56,z+.813,.35,.025,.035,ink);
  box(x-.16,1.40,z+.77,.045,.17,.045,ink);
  box(x+.16,1.40,z+.77,.045,.17,.045,ink);
 }
 if(type==='Q'){
  cylinder(x,1.02,z,.33,.27,.43,base,16);
  cylinder(x,1.45,z,.31,.39,.24,'#b7a58f',16);
  cylinder(x,1.69,z,.37,.34,.16,rim,16);
  sphere(x,1.88,z,.28,base,14);
  cylinder(x,2.03,z,.32,.34,.14,'#6f577a',16);
  cylinder(x,2.17,z,.36,.34,.09,'#e2bc76',16);
  for(let i=0;i<7;i++){
   const a=i*Math.PI*2/7;
   cone(x+Math.cos(a)*.31,2.18,z+Math.sin(a)*.31,.105,.27,i%2?'#b690d1':'#f4d49a',8);
  }
  sphere(x,2.48,z,.13,'#f3d7a3',10);
  for(let i=0;i<5;i++)sphere(x+Math.cos(i*1.26)*.345,2.12,z+Math.sin(i*1.26)*.345,.045,'#674c7a',7);
 }
 if(type==='K'){
  // Royal silhouette: wide shoulders, narrow neck, face and gold collar.
  cylinder(x,.97,z,.407,.347,.37,ink,16);
  cylinder(x,.99,z,.39,.33,.36,base,16);
  cylinder(x,1.30,z,.36,.47,.235,ink,16);
  cylinder(x,1.32,z,.34,.45,.22,light,16);
  cylinder(x,1.52,z,.435,.325,.175,ink,16);
  cylinder(x,1.54,z,.42,.31,.16,rim,16);
  sphere(x,1.83,z,.312,ink,14);
  sphere(x,1.83,z+.022,.29,base,14);
  cylinder(x,1.55,z,.45,.45,.065,ink,16);
  cylinder(x,1.58,z,.41,.41,.055,light,16);
  if(aldric){
   // Aldric is still crownless; his cloak and contrasting royal collar identify him.
   cylinder(x,1.25,z,.465,.455,.14,ink,16);
   cylinder(x,1.27,z,.45,.44,.12,'#8c664e',16);
   box(x-.35,1.23,z+.15,.17,.60,.31,ink);
   box(x-.35,1.25,z+.17,.13,.55,.27,'#795d53');
   box(x+.35,1.23,z+.15,.17,.60,.31,ink);
   box(x+.35,1.25,z+.17,.13,.55,.27,'#795d53');
   cylinder(x,1.62,z,.36,.34,.10,ink,16);
   cylinder(x,1.64,z,.33,.31,.08,'#ead7aa',16);
   sphere(x,2.13,z,.115,'#e7d5b2',10);
  }else{
   cylinder(x,2.01,z,.36,.35,.19,ink,16);
   cylinder(x,2.03,z,.33,.32,.15,'#6c553c',16);
   cylinder(x,2.15,z,.40,.39,.13,ink,16);
   cylinder(x,2.17,z,.37,.36,.09,'#e6b75c',16);
   for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    cone(x+Math.cos(a)*.32,2.19,z+Math.sin(a)*.32,.125,.36,ink,8);
    cone(x+Math.cos(a)*.32,2.21,z+Math.sin(a)*.32,.09,.30,i%2?'#f6d886':'#b98942',8);
   }
   sphere(x,2.52,z,.11,'#f9e6aa',9);
  }
 }
}
// Chess-piece characters remain sculptural; their identities come from faces and trims.
const cosmeticCatalog={
 hat:[['none','No hat'],['cap','Traveler cap'],['top','Top hat'],['wizard','Scholar hat'],['beret','Beret'],['crown','Golden circlet'],['hood','Hood'],['feather','Feathered hat'],['helmet','Knight helmet'],['chef','Chef hat'],['straw','Straw hat'],['pirate','Tricorn']],
 face:[['none','Clean shaven'],['mustache','Mustache'],['handlebar','Handlebar mustache'],['beard','Full beard'],['goatee','Goatee'],['eyepatch','Eye patch'],['glasses','Glasses'],['monocle','Monocle'],['freckles','Freckles']],
 cloak:[['none','No cloak'],['red','Crimson cape'],['blue','Royal blue cape'],['green','Forest cape'],['purple','Violet cape'],['black','Midnight cape'],['gold','Golden cape']],
 trim:[['gold','Gold trim'],['silver','Silver trim'],['red','Red trim'],['blue','Blue trim'],['green','Green trim'],['purple','Purple trim']]
};
const cosmeticDefaults={hat:'none',face:'none',cloak:'none',trim:'gold'};
const cosmeticKey='fallen-king-cosmetics-v1';
let cosmetics={...cosmeticDefaults};
const foundKey='fallen-king-found-cosmetics-v1';
let foundCosmetics=new Set();
function loadFound(){try{const saved=JSON.parse(localStorage.getItem(foundKey)||'[]');if(Array.isArray(saved))foundCosmetics=new Set(saved.filter(id=>typeof id==='string'));}catch{}}
function collectCosmetic(){
 if(interior||!world?.collectibles)return;
 const item=world.collectibles.find(item=>item.x===player.x&&item.y===player.y);
 if(!item||foundCosmetics.has(item.slot+':'+item.id))return;
 foundCosmetics.add(item.slot+':'+item.id);staticReady=false;
 try{localStorage.setItem(foundKey,JSON.stringify([...foundCosmetics]));}catch{}
 const hint=document.getElementById('fallen-pickup-hint');hint.textContent='Found: '+item.name+' · Open Menu → Customize character';hint.hidden=false;
}

function loadCosmetics(){try{const saved=JSON.parse(localStorage.getItem(cosmeticKey)||'{}');for(const slot of Object.keys(cosmeticCatalog))if(cosmeticCatalog[slot].some(([id])=>id===saved[slot]))cosmetics[slot]=saved[slot];}catch{}}
function saveCosmetics(){try{localStorage.setItem(cosmeticKey,JSON.stringify(cosmetics));}catch{}}
function cosmeticGeometry(x,z){
 const dark='#56463f',gold='#d9b36a',trim={gold:'#d9b36a',silver:'#b8c8d0',red:'#b75c58',blue:'#598aab',green:'#6c9b65',purple:'#a582b9'}[cosmetics.trim];
 // Back cape is drawn behind the shoulders and remains visible around both sides.
 if(cosmetics.cloak!=='none'){
  const cloth={red:'#a94442',blue:'#416f9d',green:'#4e7954',purple:'#76558c',black:'#3c414d',gold:'#bb9147'}[cosmetics.cloak];
  box(x,.50,z-.29,.76,.72,.18,dark);
  box(x,.52,z-.32,.69,.68,.14,cloth);
  for(const side of [-1,1])box(x+side*.34,.61,z+.04,.13,.56,.18,cloth);
  box(x,.99,z+.03,.57,.075,.14,trim);
 }
 if(cosmetics.trim!=='gold'){
  cylinder(x,.91,z,.255,.255,.075,trim,12);
  box(x,.70,z+.36,.22,.055,.06,trim);
 }
 const h=cosmetics.hat;
 if(h==='cap'||h==='beret'||h==='straw'){
  const c=h==='straw'?'#c8a66c':h==='beret'?'#925b75':'#52798a';
  cylinder(x,2.02,z,.31,.30,.14,dark,12);cylinder(x,2.045,z,.29,.28,.12,c,12);
  box(x,2.02,z+.29,.64,.065,.24,c);
 }else if(h==='top'){
  cylinder(x,2.02,z,.34,.34,.09,dark,12);cylinder(x,2.09,z,.26,.26,.42,'#4c4d54',12);cylinder(x,2.48,z,.27,.27,.06,trim,12);
 }else if(h==='wizard'||h==='feather'||h==='pirate'){
  cylinder(x,2.02,z,.40,.40,.08,dark,12);
  if(h==='wizard')cone(x,2.09,z,.29,.65,'#635785',12);
  else if(h==='pirate'){box(x,2.12,z,.74,.30,.25,'#4b4c53');box(x,2.26,z,.48,.07,.12,trim);}
  else{cylinder(x,2.09,z,.28,.28,.18,'#80604b',12);cone(x+.24,2.22,z,.06,.55,'#e3d6b1',8);}
 }else if(h==='crown'){
  cylinder(x,2.04,z,.34,.34,.11,dark,12);cylinder(x,2.07,z,.30,.30,.10,gold,12);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;cone(x+Math.cos(a)*.27,2.12,z+Math.sin(a)*.27,.075,.23,gold,8);}
 }else if(h==='hood'){sphere(x,1.88,z-.08,.37,'#53596b',12);box(x,1.91,z+.26,.42,.14,.09,dark);}
 else if(h==='helmet'){cylinder(x,1.95,z,.35,.32,.23,'#8d969b',12);box(x,2.19,z,.09,.25,.47,trim);box(x,1.91,z+.36,.11,.24,.07,dark);}
 else if(h==='chef'){cylinder(x,2.04,z,.29,.29,.16,'#f4e9d5',12);sphere(x,2.25,z,.34,'#f4e9d5',12);}
 const f=cosmetics.face;
 if(f==='mustache'||f==='handlebar'||f==='beard'||f==='goatee'){
  const w=f==='handlebar'?.37:.26;
  box(x,1.68,z+.316,w,.065,.08,dark);
  if(f==='beard')box(x,1.51,z+.32,.35,.26,.12,dark);
  if(f==='goatee')box(x,1.50,z+.32,.12,.23,.10,dark);
  if(f==='handlebar')for(const side of [-1,1])sphere(x+side*.21,1.72,z+.34,.06,dark,8);
 }else if(f==='eyepatch'){
  box(x-.11,1.84,z+.305,.15,.15,.09,dark);box(x,1.94,z+.30,.43,.035,.07,dark);
 }else if(f==='glasses'){
  for(const side of [-1,1]){box(x+side*.11,1.84,z+.33,.18,.14,.06,dark);box(x+side*.11,1.85,z+.37,.12,.09,.03,'#b4c7c8');}
  box(x,1.85,z+.35,.10,.03,.05,dark);
 }else if(f==='monocle'){cylinder(x-.11,1.79,z+.32,.10,.10,.045,gold,10);box(x-.19,1.64,z+.34,.02,.22,.03,gold);}
 else if(f==='freckles')for(const side of [-1,1])for(let i=0;i<3;i++)sphere(x+side*(.14+i*.025),1.70,z+.31,.017,'#a27967',6);
}
const wardrobePanel=document.getElementById('fallen-wardrobe');
const wardrobePreview=document.getElementById('fallen-wardrobe-preview');
const wardrobeContext=wardrobePreview.getContext('2d',{alpha:false});
function updateWardrobePreview(){
 if(wardrobePanel.hidden||!world)return;
 const w=canvas.width,h=canvas.height,aspect=w/Math.max(1,h);
 const zoom=interior?(aspect<1?6.3:5.5):(aspect<1?5.6:5.0);
 const unit=h/(2*zoom),px=w/2+(visual.x-cam.x)*unit;
 const py=h/2+(visual.z-cam.z)*.93*unit;
 const cropW=Math.max(1,unit*2.7),cropH=Math.max(1,unit*3.5);
 const sx=px-cropW/2,sy=py-unit*2.45;
 wardrobeContext.fillStyle='#c5b69a';
 wardrobeContext.fillRect(0,0,wardrobePreview.width,wardrobePreview.height);
 wardrobeContext.imageSmoothingEnabled=false;
 wardrobeContext.drawImage(canvas,sx,sy,cropW,cropH,0,0,wardrobePreview.width,wardrobePreview.height);
}
function setupWardrobe(){
 const grid=document.getElementById('fallen-wardrobe-grid');
 grid.replaceChildren();
 for(const [slot,items] of Object.entries(cosmeticCatalog)){
  const field=document.createElement('label');
  field.textContent={hat:'Hats & headwear',face:'Beards & accessories',cloak:'Capes & cloaks',trim:'Outfit accents'}[slot];
  const select=document.createElement('select');
  select.setAttribute('aria-label',field.textContent);
  for(const [id,name] of items){const option=document.createElement('option');option.value=id;option.textContent=name;select.append(option);}
  select.value=cosmetics[slot];
  select.addEventListener('change',()=>{cosmetics[slot]=select.value;saveCosmetics();draw(sceneTime);updateWardrobePreview();});
  field.append(select);grid.append(field);
 }
}
function openWardrobe(){
 if(!world)return;
 paused=true;pressed.clear();pause.hidden=true;wardrobePanel.hidden=false;
 draw(sceneTime);updateWardrobePreview();
}
function closeWardrobe(){
 wardrobePanel.hidden=true;pause.hidden=false;paused=true;
}
document.getElementById('fallen-wardrobe-open').addEventListener('click',openWardrobe);
document.getElementById('fallen-wardrobe-back').addEventListener('click',closeWardrobe);

const characterLooks={
 pip:{accent:'#cc8f4b',trim:'#f4cf83',face:'curious',outfit:'scarf'},
 baker:{accent:'#b75f4c',trim:'#fff1c9',face:'smile',outfit:'apron'},
 guard:{accent:'#4d728a',trim:'#d6c79d',face:'stern',outfit:'uniform'},
 scholar:{accent:'#765b9b',trim:'#cbb7e6',face:'calm',outfit:'coat'},
 courier:{accent:'#a87a44',trim:'#d9b67c',face:'alert',outfit:'satchel'},
 gardener:{accent:'#578e63',trim:'#a8d4a0',face:'sleepy',outfit:'vest'},
 aldric:{accent:'#b59b63',trim:'#eee0bd',face:'serious',outfit:'regal'},
 showcase:{accent:'#c5b29b',trim:'#e8dbca',face:'calm',outfit:'plain'}
};
function features(x,z,type,color,aldric=false,id=''){
 const look=characterLooks[id]||characterLooks.showcase,pale=color==='white';
 const eyeY=type==='P'?1.36:type==='N'?1.75:type==='R'?1.53:type==='B'?1.52:1.83;
 const eyeZ=type==='N'?.52:type==='P'?.278:type==='R'?.315:type==='B'?.276:.29;
 const eyeX=0;
 if(type==='N')return; // The horse's own anatomically placed eyes are modelled with its head.
 for(const side of [-1,1]){
  const ex=x+eyeX+side*.108;
  sphere(ex,eyeY,z+eyeZ,.064,pale?'#fff6e8':'#f7eee1',9);
  sphere(ex+side*(look.face==='curious'?.018:0),eyeY-.005,z+eyeZ+.056,.023,'#64544a',8);
  box(ex,eyeY+(look.face==='sleepy'?.073:.109),z+eyeZ+.018,.105,.018,.035,pale?'#ae9783':'#c7b5a4');
 }
 const mouthY=eyeY-.16,mouthZ=z+eyeZ+.047;
 if(look.face==='smile')box(x+eyeX,mouthY,mouthZ,.11,.018,.035,'#ae7d68');
 else if(look.face==='alert')sphere(x+eyeX,mouthY,mouthZ,.032,'#987c6c',7);
 else if(look.face==='stern'||look.face==='serious')box(x+eyeX,mouthY,mouthZ,.14,.021,.030,'#806b5f');
 else box(x+eyeX,mouthY,mouthZ,.09,.014,.025,'#ad9585');
 if(look.outfit==='scarf'){cylinder(x,.88,z,.26,.26,.13,look.accent,12);box(x+.17,.62,z+.24,.13,.36,.11,look.trim);sphere(x-.20,1.42,z+.12,.045,'#b78e69',8);}
 else if(look.outfit==='apron'){box(x,.43,z+.245,.43,.55,.10,look.trim);box(x,.61,z+.311,.33,.06,.055,look.accent);sphere(x,.47,z+.325,.055,'#c99056',7);box(x,1.59,z,.42,.13,.38,'#f3e9d5');}
 else if(look.outfit==='uniform'){cylinder(x,.69,z,.29,.29,.15,look.accent,12);box(x,.65,z+.275,.26,.33,.08,look.trim);sphere(x,.83,z+.29,.075,'#e7ce7c',8);box(x-.26,.93,z+.10,.13,.12,.22,'#cfb785');box(x+.26,.93,z+.10,.13,.12,.22,'#cfb785');}
 else if(look.outfit==='coat'){cylinder(x,.39,z,.30,.245,.50,look.accent,12);box(x,.52,z+.268,.06,.46,.08,look.trim);sphere(x,.62,z+.313,.043,look.trim,7);box(x+.18,.56,z+.20,.12,.34,.12,'#473b67');}
 else if(look.outfit==='satchel'){box(x+.26,.47,z+.13,.26,.40,.24,look.accent);box(x+.21,.84,z+.23,.09,.36,.08,look.trim);box(x-.13,1.74,z+.42,.19,.10,.05,'#574c4a');}
 else if(look.outfit==='vest'){cylinder(x,.43,z,.28,.25,.42,look.accent,12);box(x,.60,z+.264,.12,.34,.075,look.trim);sphere(x+.19,.96,z+.05,.11,'#78aa67',8);box(x-.16,.94,z+.14,.10,.12,.07,'#476f42');}
 else if(look.outfit==='regal'){cylinder(x,.50,z,.417,.387,.45,pale?'#786d64':'#20252c',16);cylinder(x,.52,z,.40,.37,.43,look.accent,16);cylinder(x,.94,z,.36,.35,.10,look.trim,16);box(x,.69,z+.36,.24,.25,.08,'#e2c782');box(x-.31,.58,z+.16,.12,.66,.22,'#765348');box(x+.31,.58,z+.16,.12,.66,.22,'#765348');}
 else cylinder(x,.72,z,.24,.24,.07,look.trim,12);
 // Identity-specific accessories: hats, hair, facial hair and outerwear.
 if(id==='baker'){
  cylinder(x,1.69,z,.29,.29,.10,'#f0e3c7',12);
  sphere(x,1.82,z,.25,'#f5e8cf',10);
  box(x-.10,1.18,z+.295,.15,.055,.055,'#805d4d');
  box(x+.10,1.18,z+.295,.15,.055,.055,'#805d4d');
 }else if(id==='guard'){
  cylinder(x,1.64,z,.32,.28,.20,'#456477',12);
  box(x,1.83,z+.04,.43,.08,.32,'#d1b880');
  box(x-.16,1.20,z+.30,.13,.08,.06,'#675b55');
  box(x+.16,1.20,z+.30,.13,.08,.06,'#675b55');
 }else if(id==='scholar'){
  cylinder(x,1.72,z,.34,.28,.13,'#5d527b',12);
  box(x,1.85,z,.76,.08,.50,'#695a8b');
  box(x-.12,1.52,z+.33,.18,.035,.055,'#5e4b49');
  box(x+.12,1.52,z+.33,.18,.035,.055,'#5e4b49');
 }else if(id==='courier'){
  box(x-.13,1.64,z+.30,.20,.095,.055,'#6b4c3c');
  box(x+.13,1.64,z+.30,.20,.095,.055,'#6b4c3c');
  cylinder(x,1.68,z,.33,.32,.08,'#b38a58',12);
  box(x+.29,.52,z+.23,.09,.24,.12,'#e5c18c');
 }else if(id==='gardener'){
  cylinder(x,1.65,z,.35,.29,.10,'#688454',12);
  box(x,1.78,z,.76,.065,.49,'#b7a178');
  box(x-.10,1.22,z+.29,.17,.085,.055,'#75664c');
  box(x+.10,1.22,z+.29,.17,.085,.055,'#75664c');
 }else if(id==='pip'){
  box(x-.18,1.55,z+.14,.13,.11,.08,'#8c6b4c');
  box(x+.18,1.55,z+.14,.13,.11,.08,'#8c6b4c');
 }else if(id==='aldric'){
  box(x,1.51,z+.33,.31,.075,.06,'#8b6b56');
  box(x-.15,1.69,z+.23,.09,.12,.08,'#c4aa7d');
  box(x+.15,1.69,z+.23,.09,.12,.08,'#c4aa7d');
 }
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
  if(n<.12)box(x+.46,.008,z+.58,.30,.006,.23,'#bca584');
  if(n>.90)box(x+.28,.008,z+.33,.22,.006,.16,'#b4a080');
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
const aspect=w/Math.max(h,1),zoom=interior?(aspect<1?6.3:5.5):(aspect<1?5.6:5.0);vertices=[];
if(!staticReady){
 // Static geometry is regenerated on entering and leaving a room.
 if(interior){drawBakeryInterior();}else{
 for(let z=0;z<world.height;z++)for(let x=0;x<world.width;x++){
  ground(x,z);
  if(tile(x,z)==='T')tree(x+.5,z+.5);
  if(tile(x,z)==='F')fountain(x+.5,z+.5);
 }
 for(const h of world.houses||[])building(h);
 villageProps();
 for(const item of world.collectibles||[]){
  // Small gold-trimmed treasure cases: walkable, discoverable, and never obstacles.
  if(foundCosmetics.has(item.slot+':'+item.id))continue;
  const x=item.x+.5,z=item.y+.5;
  box(x,.04,z,.38,.20,.31,'#6d4933');
  box(x,.25,z,.40,.09,.34,'#d1ac65');
  box(x,.12,z+.18,.09,.08,.035,'#f5dc8b');
 }
 for(const s of world.showcase||[]){
  // Raised stone plinths make the display visible against the plaza.
  const sx=s.x+.5,sz=s.y+.5;
  box(sx,.14,sz,.91,.28,.91,'#776d66');
  box(sx,.33,sz,.84,.12,.84,'#d9c9ab');
  cylinder(sx,.40,sz,.45,.45,.13,'#b8a98c',12);
  piece(sx,sz,s.piece,s.color,false);
  features(sx,sz,s.piece,s.color,false,'showcase');
}
 }
 staticCount=vertices.length/9;
 gl.bindBuffer(gl.ARRAY_BUFFER,staticBuffer);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
 staticReady=true;vertices=[];
}
for(const n of world.npcs){piece(n.x+.5,n.y+.5,n.piece,n.color,false);features(n.x+.5,n.y+.5,n.piece,n.color,false,n.id);}
piece(visual.x+.5,visual.z+.5,'K','white',true);features(visual.x+.5,visual.z+.5,'K','white',true,'aldric');cosmeticGeometry(visual.x+.5,visual.z+.5);
gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform2f(camLoc,cam.x+.5,cam.z+.5);gl.uniform1f(aspectLoc,aspect);gl.uniform1f(zoomLoc,zoom);
gl.bindBuffer(gl.ARRAY_BUFFER,staticBuffer);
 gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,36,0);gl.vertexAttribPointer(normLoc,3,gl.FLOAT,false,36,12);gl.vertexAttribPointer(colorLoc,3,gl.FLOAT,false,36,24);
 gl.drawArrays(gl.TRIANGLES,0,staticCount);
 gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
 gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,36,0);gl.vertexAttribPointer(normLoc,3,gl.FLOAT,false,36,12);gl.vertexAttribPointer(colorLoc,3,gl.FLOAT,false,36,24);
 gl.drawArrays(gl.TRIANGLES,0,vertices.length/9);
}
function frame(ms){if(!world)return;const dt=Math.min((ms-last)/1000||0,.05);last=ms;if(!paused){sceneTime+=dt;stepClock+=dt;const dir=['up','down','left','right'].find(k=>pressed.has(k));if(dir&&!dialogue&&stepClock>.19){move(dir);stepClock=0;}const speed=Math.min(1,dt*11);visual.x+=(player.x-visual.x)*speed;visual.z+=(player.y-visual.z)*speed;const follow=Math.min(1,dt*5);cam.x+=(visual.x-cam.x)*follow;cam.z+=(visual.z-cam.z)*follow;if(interior){cam.x=5.5;cam.z=4.7;}else{cam.x=Math.max(7,Math.min(world.width-8,cam.x));cam.z=Math.max(6,Math.min(world.height-7,cam.z));}}updateDoorHint();draw(sceneTime);if(!wardrobePanel.hidden)updateWardrobePreview();requestAnimationFrame(frame);}
function togglePause(force){if(!world)return;if(!wardrobePanel.hidden){closeWardrobe();return;}if(mapOpen)closeMap();paused=typeof force==='boolean'?force:!paused;pause.hidden=!paused;pressed.clear();if(!paused)canvas.focus({preventScroll:true});}
document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(k==='escape'){e.preventDefault();if(!wardrobePanel.hidden){closeWardrobe();return;}if(mapOpen){closeMap();return;}togglePause();return;}if(paused||mapOpen)return;const dir=({arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'})[k];if(dir){e.preventDefault();pressed.add(dir);if(!e.repeat){move(dir);stepClock=0;}}else if(['e','enter',' '].includes(k)){e.preventDefault();if(!e.repeat)talk();}});
document.addEventListener('keyup',e=>{const k=e.key.toLowerCase(),dir=({arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'})[k];if(dir)pressed.delete(dir);});
window.addEventListener('blur',()=>pressed.clear());
for(const b of document.querySelectorAll('[data-dir]')){const dir=b.dataset.dir;b.addEventListener('pointerdown',e=>{if(paused||mapOpen)return;e.preventDefault();pressed.add(dir);move(dir);});for(const event of ['pointerup','pointercancel','pointerleave'])b.addEventListener(event,()=>pressed.delete(dir));}
document.querySelector('[data-action="talk"]').addEventListener('click',talk);

const mapPanel=document.getElementById('fallen-map'),mapCanvas=document.getElementById('fallen-map-canvas');
function drawMap(){
 if(!world)return;const ctx=mapCanvas.getContext('2d'),scale=10;
 mapCanvas.width=world.width*scale;mapCanvas.height=world.height*scale;
 const colors={T:'#3b6947',w:'#3c8fb0',p:'#bfa878',s:'#d2bf99',H:'#b07c5a',D:'#d4b27a',F:'#88a9b2',f:'#81b668',g:'#8dbd73','.':'#76a65f'};
 for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){
  ctx.fillStyle=colors[tile(x,y)]||colors['.'];ctx.fillRect(x*scale,y*scale,scale,scale);
 }
 for(const h of world.houses||[]){const dx=h.x+Math.floor(h.w/2),dy=h.y+h.h;ctx.fillStyle='#f8edce';ctx.fillRect(dx*scale-2,dy*scale-2,5,5);ctx.fillStyle='#142a35';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#f8e6bd';ctx.strokeText(h.name,(h.x+h.w/2)*scale,(h.y-1.2)*scale);ctx.fillText(h.name,(h.x+h.w/2)*scale,(h.y-1.2)*scale);}ctx.textAlign='left';
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
 if(h.name!=='The Bakery'){speaker.textContent=h.name;speech.textContent='This door is locked for now. The bakery is open.';dialogue={npc:{lines:[speech.textContent]},i:0};dialog.hidden=false;pressed.clear();return;}
 outdoorState={world,player:{...player},cam:{...cam}};interior=h;
 const width=12,height=10,rows=Array.from({length:height},(_,z)=>Array.from({length:width},(_,x)=>x===0||z===0||x===width-1||z===height-1?'H':'.'));
 for(let z=3;z<=4;z++)for(let x=3;x<=8;x++)rows[z][x]='X';
 for(let z=1;z<=3;z++)for(let x=9;x<=10;x++)rows[z][x]='X';
 rows[5][2]='X';rows[8][6]='D';
 world={width,height,tiles:rows.map(r=>r.join('')),houses:[],npcs:[],showcase:[],version:outdoorState.world.version};
 player={x:6,y:7,facing:'up'};visual={x:6,z:7};cam={x:5.5,z:4.7};staticReady=false;pressed.clear();
 const label=document.getElementById('fallen-interior-label');label.hidden=false;label.textContent='The Bakery · Walk around · Exit through the south door';
 canvas.focus({preventScroll:true});
}
function leaveHouse(){
 if(!interior||!outdoorState)return;
 world=outdoorState.world;player=outdoorState.player;cam=outdoorState.cam;visual={x:player.x,z:player.y};
 interior=null;outdoorState=null;staticReady=false;pressed.clear();
 document.getElementById('fallen-interior-label').hidden=true;canvas.focus({preventScroll:true});
}
function updateDoorHint(){
 const hint=document.getElementById('fallen-door-hint');if(!hint||!world)return;
 if(interior){hint.hidden=!(player.y>=7&&!paused);if(!hint.hidden)hint.textContent='Walk south to the door · Leave Bakery';return;}
 const [dx,dz]=dirs[player.facing],tx=player.x+dx,tz=player.y+dz;
 const h=tile(tx,tz)==='D'?(world.houses||[]).find(h=>tx>=h.x&&tx<h.x+h.w&&tz>=h.y&&tz<h.y+h.h):null;
 hint.hidden=!h||mapOpen||paused||!!dialogue;
 if(h)hint.textContent=h.name==='The Bakery'?'E / Space · Enter the Bakery':'E / Space · Check '+h.name;
 const pickup=document.getElementById('fallen-pickup-hint');if(pickup&&!pickup.hidden&&(!world.collectibles||!world.collectibles.some(item=>item.x===player.x&&item.y===player.y)))pickup.hidden=true;
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
world=await response.json();if(!Array.isArray(world.tiles)||world.tiles.length!==world.height)throw Error('Invalid world');loadCosmetics();loadFound();setupWardrobe();
player={...load(),facing:'down'};visual={x:player.x,z:player.y};cam={x:player.x,z:player.y};gate.hidden=true;game.hidden=false;canvas.focus({preventScroll:true});requestAnimationFrame(frame);
}catch(e){console.error('Fallen King preview error',e);gate.textContent='Could not load the preview. Please retry later.';}})();
})();