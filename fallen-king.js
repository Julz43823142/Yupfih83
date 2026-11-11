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
function move(dir){if(paused||dialogue||mapOpen)return;const [dx,dz]=dirs[dir];player.facing=dir;const x=player.x+dx,z=player.y+dz;if(interior&&x===6&&z===8){leaveHouse();return;}if(canWalk(x,z)){player.x=x;player.y=z;if(!interior)save();}}
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
function villageProps(){box(19.5,.08,22.5,.44,.75,.42,'#735442');box(19.5,.88,22.5,.58,.18,.48,'#a34c43');box(19.5,1.03,22.5,.46,.06,.40,'#d4b58b');box(33.5,.05,20.5,.48,.55,.48,'#96714d');box(34.05,.05,20.55,.43,.37,.42,'#a9835b');cylinder(19.5,.04,12.5,.10,.09,1.65,'#70523b',8);box(19.5,1.35,12.5,1.3,.42,.15,'#b28a5d');}
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
  cylinder(x,1.60,z,.39,.38,.13,'#d1b98d',12);
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4;
   box(x+Math.cos(a)*.30,1.72,z+Math.sin(a)*.30,.16,.21,.16,i%2?'#bd9d71':light);
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
  cylinder(x,1.23,z,.27,.23,.38,base,12);box(x+.03,1.53,z+.08,.38,.52,.35,base);box(x+.07,1.65,z+.31,.32,.27,.39,light);box(x+.07,1.48,z+.46,.25,.13,.25,rim);cone(x-.08,1.91,z-.07,.12,.30,base,8);cone(x+.18,1.92,z-.06,.12,.27,base,8);for(let i=0;i<4;i++)box(x-.17,1.40+i*.15,z-.15,.11,.11,.13,rim);sphere(x+.07,1.44,z+.60,.07,'#c4a995',8);
 }
 if(type==='Q'){
  cylinder(x,1.02,z,.28,.32,.64,base,12);cylinder(x,1.66,z,.37,.37,.16,rim,12);
  cylinder(x,1.82,z,.29,.38,.26,'#e1b66d',12);
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;sphere(x+Math.cos(a)*.33,2.20,z+Math.sin(a)*.33,.115,i%2?'#f8d890':'#a884c3',7);}
  sphere(x,2.30,z,.14,'#e8ca8b',9);
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
   cylinder(x,1.95,z,.30,.30,.14,'#c59b54',12);
   for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    sphere(x+Math.cos(a)*.28,2.18,z+Math.sin(a)*.28,.12,i%2?'#e9be67':'#f8e3a5',7);
   }
  }
 }
}
// Chess-piece characters remain sculptural; their identities come from faces and trims.
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
 const eyeY=type==='P'?1.36:type==='N'?1.72:type==='R'?1.42:type==='B'?1.52:1.89;
 const eyeZ=type==='N'?.205:type==='P'?.278:type==='R'?.315:type==='B'?.276:.275;
 const eyeX=type==='N'?.10:0;
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
 if(look.outfit==='scarf'){cylinder(x,.88,z,.26,.26,.13,look.accent,12);box(x+.17,.62,z+.24,.13,.36,.11,look.trim);}
 else if(look.outfit==='apron'){box(x,.43,z+.245,.43,.55,.10,look.trim);box(x,.61,z+.311,.33,.06,.055,look.accent);sphere(x,.47,z+.325,.055,'#c99056',7);}
 else if(look.outfit==='uniform'){cylinder(x,.69,z,.29,.29,.15,look.accent,12);box(x,.65,z+.275,.26,.33,.08,look.trim);sphere(x,.83,z+.29,.075,'#e7ce7c',8);}
 else if(look.outfit==='coat'){cylinder(x,.39,z,.30,.245,.50,look.accent,12);box(x,.52,z+.268,.06,.46,.08,look.trim);sphere(x,.62,z+.313,.043,look.trim,7);}
 else if(look.outfit==='satchel'){box(x+.26,.47,z+.13,.26,.40,.24,look.accent);box(x+.21,.84,z+.23,.09,.36,.08,look.trim);}
 else if(look.outfit==='vest'){cylinder(x,.43,z,.28,.25,.42,look.accent,12);box(x,.60,z+.264,.12,.34,.075,look.trim);sphere(x+.19,.96,z+.05,.11,'#78aa67',8);}
 else if(look.outfit==='regal'){cylinder(x,.52,z,.34,.31,.39,look.accent,12);cylinder(x,.94,z,.29,.29,.09,look.trim,12);box(x,.69,z+.32,.19,.23,.07,'#e2c782');}
 else cylinder(x,.72,z,.24,.24,.07,look.trim,12);
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
  if(n>.91){box(x+.29,.027,z+.53,.07,.013,.23,'#988b74');box(x+.35,.030,z+.64,.17,.013,.05,'#988b74');}
  if(n>.74&&n<.81){cylinder(x+.42,.031,z+.58,.25,.23,.013,'#8d7e63',10);box(x+.41,.050,z+.57,.24,.009,.045,'#b1b6a5');}
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
function frame(ms){if(!world)return;const dt=Math.min((ms-last)/1000||0,.05);last=ms;if(!paused){sceneTime+=dt;stepClock+=dt;const dir=['up','down','left','right'].find(k=>pressed.has(k));if(dir&&!dialogue&&stepClock>.19){move(dir);stepClock=0;}const speed=Math.min(1,dt*11);visual.x+=(player.x-visual.x)*speed;visual.z+=(player.y-visual.z)*speed;const follow=Math.min(1,dt*5);cam.x+=(visual.x-cam.x)*follow;cam.z+=(visual.z-cam.z)*follow;if(interior){cam.x=5.5;cam.z=4.7;}else{cam.x=Math.max(7,Math.min(world.width-8,cam.x));cam.z=Math.max(6,Math.min(world.height-7,cam.z));}}updateDoorHint();draw(sceneTime);requestAnimationFrame(frame);}
function togglePause(force){if(!world)return;if(mapOpen)closeMap();paused=typeof force==='boolean'?force:!paused;pause.hidden=!paused;pressed.clear();if(!paused)canvas.focus({preventScroll:true});}
document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(k==='escape'){e.preventDefault();if(mapOpen){closeMap();return;}togglePause();return;}if(paused||mapOpen)return;const dir=({arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'})[k];if(dir){e.preventDefault();pressed.add(dir);if(!e.repeat){move(dir);stepClock=0;}}else if(['e','enter',' '].includes(k)){e.preventDefault();if(!e.repeat)talk();}});
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