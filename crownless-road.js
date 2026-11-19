(()=>{
'use strict';
// The Fallen King 2.0: original first-person renderer. No third-party runtime,
// no installs, and a separate save from The Fallen King.
const $=id=>document.getElementById(id),gate=$('gate'),canvas=$('view');
let gl,program,buffer,u={},stage='cell',world,px=12.5,pz=9.5,yaw=0,pitch=0,last=0,paused=false,muted=false,dialogue=null,dialogIndex=0,nearby=null,frames=0;
const keys=new Set(),touch=new Set(),state={watchKey:false,bridge:false,metMerrick:false,timber:false,ropes:false};
let ac=null,lastFoot=0,jumpY=0,jumpSpeed=0,crouch=0,menuOpen=false,storyFrame=0;
const label={cell:'The Prison',sewer:'The Underground Sewers',forest:'The Willowmere Woods',watchtower:'The Old Watchtower',village:'Willowmere Village'};
const objective={cell:'Find the loose grate in your cell and escape.',sewer:'Follow the winding waterways to the iron ladder.',forest:'Follow the old road. Seek the watchtower key to pass the east gate.',watchtower:'Examine the locked chest and take the barrier key.',village:'Speak to Merrick, collect timber and rope, then repair Willowmere bridge.'};
const palette={
 cell:{sky:[.065,.088,.118],fog:[.12,.17,.19],ground:'#444641',wall:'#5c6061',path:'#71685d',leaf:'#555f59',trunk:'#443d35',light:'#eab777'},
 sewer:{sky:[.038,.076,.083],fog:[.09,.18,.19],ground:'#283a3a',wall:'#4e5b59',path:'#606a63',leaf:'#4d6454',trunk:'#423f37',light:'#87c9b3'},
 forest:{sky:[.86,.49,.33],fog:[.84,.48,.36],ground:'#546746',wall:'#59624f',path:'#a18a6b',leaf:'#425f47',trunk:'#67513d',light:'#f3c17e'},
 watchtower:{sky:[.12,.15,.19],fog:[.23,.21,.20],ground:'#5d574e',wall:'#817666',path:'#8a7966',leaf:'#55704d',trunk:'#66503d',light:'#f6bd72'},
 village:{sky:[.93,.59,.37],fog:[.88,.58,.45],ground:'#6d7957',wall:'#8c8873',path:'#b5a084',leaf:'#4f7050',trunk:'#735440',light:'#f8ca84'}
};
const toRGB=hex=>[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)/255);
function create(w,h,fill){return {w,h,tiles:Array.from({length:h},(_,z)=>Array.from({length:w},(_,x)=>x===0||z===0||x===w-1||z===h-1?'H':fill)),features:[],npcs:[],solids:[],spawn:[3.5,5.5]};}
function fill(w,x,z,c){if(x>0&&z>0&&x<w.w-1&&z<w.h-1)w.tiles[z][x]=c;}
function road(w,route,r=1){for(let n=1;n<route.length;n++){let [x,z]=route[n-1], [tx,tz]=route[n];while(true){for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)fill(w,x+dx,z+dz,'p');if(x===tx&&z===tz)break;x+=Math.sign(tx-x);z+=Math.sign(tz-z);}}}
function buildStage(name){
 let w;
 if(name==='cell'){
  w=create(25,16,'H');for(let z=1;z<=13;z++)for(let x=1;x<=23;x++)fill(w,x,z,'s');
  for(let x=1;x<=23;x++)fill(w,x,5,'H');
  for(let z=5;z<=13;z++)for(const x of [6,18])fill(w,x,z,'H');
  // The two neighbouring cells are visible through iron-barred side windows.
  // Oliver's cell has a cot, a loose drain, and sleeping prisoners next door.
  w.solids.push({x:11.5,z:11.5,w:2.25,d:1.55},{x:15.5,z:10.5,w:1.0,d:1.0});
  w.spawn=[12.5,9.5];w.features=[{x:15.5,z:10.5,type:'drain',name:'Loose prison grate',text:['The toilet drain is open. I can squeeze into the sewers.'],next:'sewer'}];
  w.npcs=[{x:10.5,z:3.5,name:'Royal Guard',lines:['Edwin is king now. Those were the orders.','No one leaves this cell block.']},
   {x:3.2,z:10.5,name:'Sleeping Prisoner',sleeping:true,lines:['The prisoner sleeps fitfully beneath a threadbare blanket.']},
   {x:21.5,z:10.5,name:'Exhausted Prisoner',sleeping:true,lines:['A prisoner sleeps beyond the iron bars.']}];
 }else if(name==='sewer'){
  w=create(84,53,'H');const route=[[3,25],[6,25],[18,25],[18,10],[32,10],[32,38],[49,38],[49,13],[64,13],[64,25],[76,25]];
  road(w,route,2);
  for(const b of [[[5,25],[5,39]],[[12,25],[12,17]],[[18,12],[23,12]],[[24,10],[24,4]],[[32,17],[41,17]],[[32,31],[23,31]],[[40,38],[40,46]],[[49,28],[56,28]],[[56,13],[56,5]],[[64,18],[73,18]],[[70,25],[70,36]],[[49,36],[56,36]]])road(w,b,2);
  w.spawn=[6.5,25.5];w.features=[{x:76.5,z:25.5,type:'ladder',name:'Iron escape ladder',text:['I climb the iron ladder and push the hatch open. Fresh woodland air!'],next:'forest'}];
  w.npcs=[{x:49.5,z:37.5,name:'A Voice in the Darkness',lines:['You are not the first to wander into these tunnels.','Follow the water. The ladder is close.']}];
 }else if(name==='forest'){
  w=create(36,23,'.');for(let z=1;z<22;z++)for(let x=1;x<35;x++)if(x<=2||x>=33||z<=1||z>=20)fill(w,x,z,'T');
  road(w,[[2,10],[8,10],[8,6],[16,6],[16,12],[25,12],[25,8],[33,8]],1);
  for(const [x,z] of [[6,4],[13,14],[20,4],[28,14]])for(const [dx,dz] of [[0,0],[1,0],[0,1]])if(w.tiles[z+dz]?.[x+dx]==='.')fill(w,x+dx,z+dz,'T');
  for(let z=3;z<=7;z++)for(let x=25;x<=29;x++)fill(w,x,z,'H');
  fill(w,27,7,'D');for(let z=8;z<=11;z++)for(let x=26;x<=28;x++)fill(w,x,z,'p');
  for(let z=7;z<=10;z++)for(let x=31;x<=34;x++)fill(w,x,z,'p');
  w.spawn=[4.5,12.5];
  w.solids.push({x:9.5,z:13.5,w:2.6,d:.45},...[ [7,9],[13,10],[19,10],[24,12],[30,9] ].map(([x,z])=>({x,z,w:.26,d:.26})));
  w.features=[{x:27.5,z:8.5,type:'door',name:'Watchtower door',text:['The old watchtower stands above the forest road.'],next:'watchtower'},
   {x:33.0,z:8.5,type:'gate',name:'Eastern forest gate',text:['The barrier opens. Willowmere is just beyond the trees.'],next:'village',locked:()=>!state.watchKey,lockText:'The gate is locked. The key is inside the watchtower.'}];
  w.npcs=[{x:13.5,z:7.5,name:'Travelling Bishop',lines:['A king? In these muddy woods? You must be joking.','Take the eastern path if you are looking for Willowmere.']},{x:21.5,z:13.5,name:'Old Woodcutter',lines:['King Oliver? I have seen the king in the castle, stranger.','Follow the lanterns. Willowmere is not far.']},{x:24.5,z:9.5,name:'Gatekeeper Rowan',lines:['The key is inside the watchtower. Enter through the door.']}];
 }else if(name==='watchtower'){
  w=create(17,14,'s');for(let x=1;x<16;x++){fill(w,x,1,'H');fill(w,x,12,'H');}for(let z=1;z<13;z++){fill(w,1,z,'H');fill(w,15,z,'H');}
  fill(w,8,12,'D');w.spawn=[8.5,10.5];
  w.solids.push({x:8.5,z:4.5,w:2.54,d:1.8},...[ [4,8],[13,6],[4,10] ].map(([x,z])=>({x,z,w:1.5,d:1.5})));
  w.features=[{x:8.5,z:4.5,type:'chest',name:'Locked barrier chest',text:['The old lock yields. Inside lies the barrier key.'],action:()=>{state.watchKey=true;objective.forest='The barrier key is yours. Return to the eastern forest gate.'}},
   {x:8.5,z:11.5,type:'door',name:'Watchtower exit',text:['I step outside into the pine-scented air.'],next:'forest'}];
  w.npcs=[{x:5.5,z:6.5,name:'Tower Keeper',lines:['The barrier key is locked in that chest.','I cannot open it. Perhaps you can solve the old lock.']}];
 }else{
  w=create(61,43,'.');for(let z=1;z<42;z++)for(let x=1;x<60;x++)if(z<=2||z>=40||x<=2||x>=58)fill(w,x,z,'T');
  road(w,[[4,30],[15,30],[25,29],[36,29],[44,23],[44,19],[56,19]],2);
  road(w,[[25,29],[25,21],[21,15],[21,7]],2);road(w,[[36,29],[35,35]],2);
  const houses=[[13,23,7,6],[30,19,8,7],[43,30,8,7],[17,8,8,6],[40,9,10,7]];
  for(const [hx,hz,ww,hh] of houses)for(let z=hz;z<hz+hh;z++)for(let x=hx;x<hx+ww;x++)fill(w,x,z,'H');
  w.houses=houses;w.spawn=[26.5,30.5];
  // River has a real physical barrier. Only the completed bridge can cross it.
  for(let z=3;z<40;z++)for(let x=46;x<=48;x++)if(w.tiles[z][x]!=='H')fill(w,x,z,'w');
  w.solids.push(...[ [45.1,19.5],[49.9,19.5] ].map(([x,z])=>({x,z,w:.55,d:1.6})));
  w.npcs=[{x:21.5,z:28.5,name:'Merrick the Bishop',lines:['You claim to be Oliver? The king is already in the castle.','If you truly wish to help Willowmere, find timber and ropes for our bridge.'],action:()=>{state.metMerrick=true}},
   {x:33.5,z:31.5,name:'Willowmere Carpenter',lines:['The bridge needs timber. The woodcutters have some spare beams.']},
   {x:38.5,z:25.5,name:'Village Merchant',lines:['Ropes and nails are ready. We only need the king to give the order.']}];
  w.features=[
   {x:12.5,z:32.5,type:'timber',name:'Woodcutters’ timber',text:['These fallen timbers will support a new bridge.'],action:()=>{state.timber=true}},
   {x:40.5,z:27.5,type:'ropes',name:'Merchant’s rope',text:['This rope is strong enough to secure the bridge beams.'],action:()=>{state.ropes=true}},
   {x:46.5,z:19.5,type:'bridge',name:'Broken Willowmere bridge',text:['The timber and ropes are ready. I repair the bridge across the river.','Beyond the crossing, an old road leads farther into Aldemar.'],action:()=>{state.bridge=true;objective.village='The bridge is repaired. Chapter One of this first-person preview is complete.';buildGeometry()},locked:()=>!state.metMerrick||!state.timber||!state.ropes,lockText:'Speak with Merrick, then collect the timber and ropes before repairing the bridge.'}
  ];
 }
 return w;
}
function beginScene(name,spawn){stage=name;world=buildStage(name);[px,pz]=spawn||world.spawn;yaw=name==='cell'?0:-1.3;pitch=0;jumpY=0;jumpSpeed=0;crouch=0;nearby=null;dialogue=null;$('caption').hidden=true;buildGeometry();$('area').textContent=label[name];$('objective').textContent=objective[name];try{sessionStorage.setItem('crownless-stage',name)}catch{}}
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
function setupGL(){
 gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'})||canvas.getContext('experimental-webgl');
 if(!gl)throw Error('WebGL is unavailable');
 program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,`
 attribute vec3 pos;attribute vec3 color;uniform vec3 camera;uniform vec2 angle;uniform float aspect;
 varying vec3 vcolor;varying float depth;
 void main(){
 vec3 p=pos-camera;
 float sy=sin(angle.x),cy=cos(angle.x),sp=sin(angle.y),cp=cos(angle.y);
 vec3 q=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);
 vec3 r=vec3(q.x,cp*q.y+sp*q.z,-sp*q.y+cp*q.z);
 float nearZ=max(.045,-r.z);
 gl_Position=vec4(r.x*1.5/aspect,r.y*1.5,-r.z*1.001-.10,nearZ);
 depth=length(p.xz);
 vcolor=color;
 }`));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
 precision mediump float;varying vec3 vcolor;varying float depth;uniform vec3 fogColor;uniform float fogRange;
 void main(){float fog=clamp((depth-8.)/fogRange,0.,.96);gl_FragColor=vec4(mix(vcolor,fogColor,fog*fog*(3.-2.*fog)),1.);}`));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);u.camera=gl.getUniformLocation(program,'camera');u.angle=gl.getUniformLocation(program,'angle');u.aspect=gl.getUniformLocation(program,'aspect');u.fogColor=gl.getUniformLocation(program,'fogColor');u.fogRange=gl.getUniformLocation(program,'fogRange');
 buffer=gl.createBuffer();gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
}
let vertices=[],count=0;
function triangle(a,b,c,col){for(const p of [a,b,c])vertices.push(...p,...col)}
function quad(a,b,c,d,col){triangle(a,b,c,col);triangle(a,c,d,col)}
function box(x,y,z,w,h,d,hex){const c=toRGB(hex),a=x-w/2,b=x+w/2,t=y+h/2,bt=y-h/2,f=z-d/2,k=z+d/2;
 const sides=[[[a,bt,f],[b,bt,f],[b,t,f],[a,t,f],.87],[[b,bt,k],[a,bt,k],[a,t,k],[b,t,k],.76],[[a,bt,k],[a,bt,f],[a,t,f],[a,t,k],.67],[[b,bt,f],[b,bt,k],[b,t,k],[b,t,f],.76],[[a,t,f],[b,t,f],[b,t,k],[a,t,k],1.15]];
 for(const [v1,v2,v3,v4,s] of sides)quad(v1,v2,v3,v4,c.map(v=>Math.min(1,v*s)));
}
function cone(x,y,z,r,h,hex,n=7){const col=toRGB(hex);for(let i=0;i<n;i++){const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n,lit=.66+.3*Math.abs(Math.sin(a+1));triangle([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],[x,y+h,z],col.map(v=>v*lit));}}
function tree(x,z,seed){const size=2.9+(seed%5)*.35;box(x,1.3,z,.25,2.6,.30,'#66503e');cone(x,1.7,z,1.25,size*.65,'#304b3c');cone(x,2.6,z,1.01,size*.65,'#3e684e');cone(x,3.45,z,.77,size*.64,'#587d56');}
function lantern(x,z,seed){box(x,.8,z,.12,1.6,.12,'#554838');box(x,1.66,z,.28,.28,.28,'#edb877');cone(x,1.88,z,.20,.23,'#594e43');}
function hash(x,z){let v=Math.sin(x*127.1+z*311.7)*43758.5453;return v-Math.floor(v)}
function buildGeometry(){
 vertices=[];const P=palette[stage],inside=['cell','sewer','watchtower'].includes(stage),isSewer=stage==='sewer';
 for(let z=0;z<world.h;z++)for(let x=0;x<world.w;x++){
  const tile=world.tiles[z][x],rand=hash(x,z),path=tile==='p'||tile==='s',wall=tile==='H'||tile==='D',wood=tile==='T';
  if(wall){
   if(stage==='village'&&world.houses?.some(([a,b,w,h])=>x>=a&&x<a+w&&z>=b&&z<b+h))continue;
   if(!inside&&rand<.2){box(x+.5,.04,z+.5,1,.14,1,'#57644d');continue;}
   if(inside){
    if(stage==='cell'&&(x===6||x===18)&&(z===9||z===10)){
     // Genuine openings in both flanking walls, with iron bars and dressed stone frames.
     box(x+.5,.25,z+.5,1,.50,1,'#5e6264');box(x+.5,3.14,z+.5,1,.80,1,'#83817c');
     for(const v of [.20,.5,.80])box(x+v,1.69,z+.5,.075,2.46,.10,'#333d42');
     box(x+.5,2.92,z+.5,1,.12,.15,'#90928b');
     continue;
    }
    if([[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dz])=>['H','D',undefined].includes(world.tiles[z+dz]?.[x+dx])))continue;
    box(x+.5,1.8,z+.5,1,3.6,1,rand>.7?'#676b67':P.wall);
    if(rand>.89)box(x+.5,3.5,z+.5,.78,.15,.78,'#96918a');
   }else{box(x+.5,.45,z+.5,1,.9,1,P.wall);if(rand>.85)cone(x+.5,.9,z+.5,.55,.8,'#657553');}
   continue;
  }
  let ground=path?P.path:P.ground;
  if(!path&&rand>.84)ground=inside?'#51554d':'#637451';
  box(x+.5,-.11,z+.5,1,.22,1,ground);
  if(path&&rand>.55)box(x+.28,.011,z+.46,.22,.012,.17,inside?'#8a8679':'#d1b18b');
  if(!inside&&wood){tree(x+.5,z+.5,Math.floor(rand*9));continue;}
  if(!inside&&!path&&rand>.80){cone(x+.32,.015,z+.4,.13,.28,rand>.9?'#81916a':'#75895e',5);cone(x+.69,.015,z+.52,.11,.24,'#47674a',5);}
  // Do not place randomly raised rubble in the walkable corridor.
  if(isSewer&&path&&((x*5+z*3)%7===0))box(x+.5,.018,z+.5,.65,.015,.25,'#4a7a78');
 }
 if(inside){
  // Open-topped 3D ceiling arches make the interiors read as castle/sewer.
  for(let z=2;z<world.h-2;z+=4)for(let x=2;x<world.w-2;x+=4)if(world.tiles[z][x]!=='H'&&hash(x,z)>.36){
   box(x+.5,3.4,z+.5,3.8,.32,.28,'#7e8178');
   if(hash(x+3,z)>.48)lantern(x+.5,z+.5,0);
  }
 }else{
  for(let i=0;i<26;i++){const x=(i*7)%world.w,z=(i*13)%world.h;if(world.tiles[z]?.[x]!=='.')continue;cone(x+.5,.04,z+.5,.65,.63,'#75806a',6)}
  if(stage==='forest')for(const [x,z] of [[7,9],[13,10],[19,10],[24,12],[30,9]])lantern(x,z,0);
 }
 if(stage==='cell'){
  // Oliver can inspect both barred cells from his own prison chamber.
  for(const x of [6.5,18.5])for(let z=9;z<=10;z++)for(const off of [-.26,.26])
   box(x+off,1.60,z+.5,.065,2.35,.08,'#29373d');
  // Narrow beds in the left and right neighbour cells; the prisoners sleep on them.
  for(const x of [3.5,21.5]){
   box(x,.32,10.5,1.9,.5,1.0,'#725947');
   box(x,.61,10.5,1.8,.13,.95,'#9a8b72');
   box(x-.5,.73,10.5,.55,.15,.85,'#c7b5a0');
   box(x+.30,.70,10.5,.97,.13,.84,'#6e8187');
  }
  // Stone murder-holes, northern guard passage, and iron cell fronts.
  for(let x=7;x<18;x+=1.0)box(x+.5,1.66,5.47,.065,2.7,.10,'#333d40');
  box(12.5,3.35,5.55,11,.22,.24,'#a6a39a');
  box(11.5,.26,11.5,2,.45,1.35,'#79695a');box(11.5,.51,11.5,1.9,.13,1.25,'#b0a08a');
  box(15.5,.06,10.5,1.2,.09,1.05,'#353638');for(let i=0;i<5;i++)box(15.1+i*.2,.15,10.5,.04,.18,.95,'#9a9c91');
 }else if(stage==='sewer'){
  for(let i=0;i<110;i++){const x=3+(i*19)%78,z=3+(i*31)%47;if(world.tiles[z]?.[x]!=='p')continue;
   if(hash(x,z)>.45)box(x+.5,.035,z+.5,.7,.05,.46,'#386b6b');}
 }else if(stage==='forest'){
  box(27.5,2.1,5.5,5,4.2,4,'#9a9078');
  cone(27.5,4.18,5.5,3.9,2.8,'#735547',4);
  box(27.5,1.4,7.65,1.4,2.7,.17,'#564433');box(27.5,1.3,7.78,.9,1.65,.12,'#927657');
  box(9.5,1.24,13.5,2.4,.72,.13,'#a17c53');
 }else if(stage==='watchtower'){
  for(const [x,z] of [[4,8],[13,6],[4,10]])box(x,.55,z,1.4,1.1,1.4,'#66513c');
  box(8.5,.65,4.5,2.4,1.3,1.65,'#6a4832');box(8.5,1.4,4.5,2.54,.22,1.74,'#ae8250');
 }else if(stage==='village'){
  for(const [x,z,w,d] of world.houses){
   box(x+w/2,1.85,z+d/2,w,3.7,d,'#c5ad86');
   cone(x+w/2,3.67,z+d/2,Math.max(w,d)*.72,2.5,'#66544d',4);
   box(x+w/2,1.06,z+d+.05,1.3,2.12,.22,'#775339');
   for(const a of [x+1.5,x+w-1.5])box(a,2.28,z+d+.14,.95,.9,.24,'#7198a0');
  }
  for(let z=4;z<39;z++){box(47.5,-.015,z+.5,2,.04,1,'#4e8391');if(z%4===0)box(47.5,.018,z+.5,1.8,.015,.35,'#86a4a2');}
  if(state.bridge){for(let z=18;z<=21;z++)box(47.5,.12,z+.5,4.5,.26,.78,'#9b8058');}
  else for(const x of [45.1,49.9])box(x,.3,19.5,.6,.6,1.5,'#7d6652');
 }
 for(const npc of world.npcs){
  if(npc.sleeping){
   box(npc.x,.77,npc.z,.45,.21,.50,'#a69583');
   box(npc.x+.34,.82,npc.z,.71,.26,.63,'#657c7a');
   box(npc.x-.32,.85,npc.z,.30,.26,.32,'#e2c3a0');
   continue;
  }
  const cleric=npc.name.includes('Bishop'),keeper=npc.name.includes('Keeper')||npc.name.includes('Guard');
  const coat=cleric?'#c9c0a8':keeper?'#756d64':'#6d897d';
  box(npc.x,.72,npc.z,.58,1.25,.44,coat);
  cone(npc.x,1.28,npc.z,.37,.65,cleric?'#d6be8d':'#596b64',9);
  box(npc.x,1.65,npc.z,.42,.36,.36,'#d9ba9a');
  box(npc.x,1.96,npc.z,.49,.17,.45,keeper?'#676c6d':'#7c5c49');
  for(const dx of [-.29,.29])box(npc.x+dx,1.12,npc.z,.14,.67,.17,coat);
  for(const dx of [-.13,.13])box(npc.x+dx,1.72,npc.z+.185,.05,.045,.02,'#46403a');
 }
 for(const f of world.features){
  if(f.type==='ladder'){for(let i=0;i<7;i++)box(f.x, i*.39+.18,f.z,.75,.065,.10,'#b5a085');}
  if(f.type==='chest')box(f.x,.67,f.z,2.3,1.3,1.6,'#9a6845');
  if(f.type==='gate'){box(f.x,.95,f.z,.22,1.9,2.4,'#8b6b46');}
  if(f.type==='drain')box(f.x,.04,f.z,1.1,.08,1.1,'#454f50');
  if(f.type==='bridge'&&!state.bridge)box(f.x,.27,f.z,.9,.55,2.8,'#625744');
  if(f.type==='timber'&&!state.timber)for(let i=0;i<4;i++)box(f.x,.19+i*.19,f.z+(i%2)*.24,1.68,.18,.31,'#806246');
  if(f.type==='ropes'&&!state.ropes){box(f.x,.22,f.z,.81,.44,.74,'#8b7152');for(let i=0;i<3;i++)box(f.x,.48+i*.10,f.z,.68,.08,.63,'#baa075');}
 }
 const arr=new Float32Array(vertices);count=arr.length/6;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.STATIC_DRAW);
 const pos=gl.getAttribLocation(program,'pos'),color=gl.getAttribLocation(program,'color');
 gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(color);gl.vertexAttribPointer(color,3,gl.FLOAT,false,24,12);
 gl.uniform3fv(u.fogColor,palette[stage].fog);gl.uniform1f(u.fogRange,stage==='sewer'?18:stage==='cell'?13:stage==='watchtower'?18:42);
}
function canStep(x,z){
 const r=.19;
 for(const dx of [-r,r])for(const dz of [-r,r]){
  const tx=Math.floor(x+dx),tz=Math.floor(z+dz),tile=world.tiles[tz]?.[tx];
  if(!tile||tile==='H'||tile==='T'||tile==='D')return false;
  if(tile==='w'&&!(state.bridge&&stage==='village'&&tz>=18&&tz<=21))return false;
 }
 for(const solid of world.solids||[])
  if(Math.abs(x-solid.x)<solid.w/2+r&&Math.abs(z-solid.z)<solid.d/2+r)return false;
 for(const npc of world.npcs)if(!npc.sleeping&&Math.hypot(x-npc.x,z-npc.z)<.48)return false;
 return true;
}
function talk(name,lines,after){dialogue={name,lines,after};dialogIndex=0;paused=true;showLine();}
function showLine(){if(!dialogue)return;$('caption').hidden=false;$('speaker').textContent=dialogue.name;$('message').textContent=dialogue.lines[dialogIndex];}
function advance(){if(!dialogue)return;if(++dialogIndex<dialogue.lines.length){showLine();return;}const cb=dialogue.after;dialogue=null;paused=menuOpen;$('caption').hidden=true;cb?.();canvas.focus();}
function use(){if(dialogue){advance();return;}if($('intro').hidden===false)return;if(!nearby)return;const a=nearby;
 if(a.lines){talk(a.name,a.lines,a.action);return;}
 if(a.locked?.()){talk('Oliver',[a.lockText]);return;}
 if(a.type==='chest'&&state.watchKey){talk('Oliver',['The chest is empty. I already have the key.']);return;}
 if(a.type==='timber'&&state.timber||a.type==='ropes'&&state.ropes){talk('Oliver',['I already collected this.']);return;}
 talk('Oliver',a.text,()=>{a.action?.();if(stage==='village'&&!state.bridge){objective.village=state.timber&&state.ropes?'Both supplies ready. Return to Willowmere bridge.':state.timber?'Timber collected. Find the merchant’s rope.':state.ropes?'Rope collected. Find the woodcutters’ timber.':objective.village;}$('objective').textContent=objective[stage];if(a.next){const from=stage;beginScene(a.next,from==='watchtower'?[27.5,9.5]:undefined);}});
}
function findNearby(){
 let best=null,dist=2.35;
 for(const item of [...world.features,...world.npcs]){const d=Math.hypot(px-item.x,pz-item.z);if(d<dist){dist=d;best=item;}}
 nearby=best;$('hint').hidden=!best||!!dialogue;$('hint').textContent=best?'[ E ] '+best.name:'';
}
function sound(freq=190,len=.09){if(muted)return;try{ac=ac||new (window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.0001,ac.currentTime);g.gain.exponentialRampToValueAtTime(.012,ac.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+len);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+len+.02)}catch{}}
function render(ms){requestAnimationFrame(render);if(!gl||!world)return;let dt=Math.min(.06,(ms-last)/1000||.016);last=ms;
 if(!paused&&$('intro').hidden){
  const targetCrouch=(keys.has('control')||keys.has('c'))?1:0;
  crouch+=(targetCrouch-crouch)*Math.min(1,dt*11);
  if(jumpY>0||jumpSpeed>0){jumpSpeed-=13.8*dt;jumpY=Math.max(0,jumpY+jumpSpeed*dt);if(jumpY===0)jumpSpeed=0;}
  const run=(keys.has('shift')&&!targetCrouch)?4.6:2.65;
  const speed=run*(1-.52*crouch);
  const walk=(keys.has('w')||keys.has('arrowup')||touch.has('w')?1:0)-(keys.has('s')||keys.has('arrowdown')||touch.has('s')?1:0);
  const strafe=(keys.has('d')||keys.has('arrowright')||touch.has('d')?1:0)-(keys.has('a')||keys.has('arrowleft')||touch.has('a')?1:0);
  const norm=Math.hypot(walk,strafe)||1;const dx=(Math.sin(yaw)*walk+Math.cos(yaw)*strafe)*speed*dt/norm,dz=(-Math.cos(yaw)*walk+Math.sin(yaw)*strafe)*speed*dt/norm;
  if(canStep(px+dx,pz))px+=dx;if(canStep(px,pz+dz))pz+=dz;
  if(Math.abs(dx)+Math.abs(dz)>.002&&ms-lastFoot>440){lastFoot=ms;sound(stage==='sewer'?105:145,.07);}
  if(keys.has('q'))yaw-=dt*1.65;if(keys.has('e-look'))yaw+=dt*1.65;
  findNearby();
 }
 const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),scale=Math.min(devicePixelRatio||1,1.5);const pw=Math.floor(w*scale),ph=Math.floor(h*scale);
 if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;gl.viewport(0,0,pw,ph);}
 const sky=palette[stage].sky;gl.clearColor(...sky,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.uniform3f(u.camera,px,1.67-.72*crouch+jumpY,pz);gl.uniform2f(u.angle,yaw,pitch);gl.uniform1f(u.aspect,w/h);
 gl.drawArrays(gl.TRIANGLES,0,count);
}
async function init(){
 try{
  // The same server-side role gate as The Fallen King. The browser never
  // trusts a local admin flag, a query parameter or a forged account object.
  const res=await fetch('/api/fallen-king/world',{credentials:'same-origin',cache:'no-store'});
  if(!res.ok){gate.textContent=res.status===401?'Sign in as an administrator to play this preview.':res.status===403?'Only EloScanner administrators can play this preview.':'Administrator authentication is unavailable.';return;}
  const data=await res.json();if(!Array.isArray(data.tiles)||!data.width)throw Error('Invalid admin world');
  setupGL();gate.hidden=true;$('game').hidden=false;beginScene('cell');requestAnimationFrame(render);
 }catch(e){console.error('Crownless Road startup failed',e);gate.textContent='The first-person preview could not start: '+e.message;}
}
function finishStoryIntro(){
 $('story-art').hidden=true;paused=false;
 talk('Oliver',['Edwin took my crown. They believe I am an impostor.','I must escape the prison and find my way back to Aldemar.']);
 canvas.focus();canvas.requestPointerLock?.();
}
function showStoryFrame(){
 $('story-image').src='/assets/fallen-king-intro/intro-'+(storyFrame+1)+'.png';
 $('story-progress').textContent='The Fallen King · '+(storyFrame+1)+' / 5';
 $('story-next').textContent=storyFrame===4?'Enter prison':'Continue';
}
$('begin').addEventListener('click',()=>{$('intro').hidden=true;paused=true;storyFrame=0;showStoryFrame();$('story-art').hidden=false;});
$('story-next').addEventListener('click',()=>{if(++storyFrame>=5)finishStoryIntro();else showStoryFrame();});
$('story-skip').addEventListener('click',finishStoryIntro);
function setPause(open){
 if(!$('intro').hidden||!$('story-art').hidden)return;
 menuOpen=open;$('pause-menu').hidden=!open;paused=open||!!dialogue;
 $('pause').textContent=open?'Resume':'Pause';
 if(open){keys.clear();touch.clear();document.exitPointerLock?.();}
 else if(!dialogue){canvas.focus();canvas.requestPointerLock?.();}
}
$('resume').addEventListener('click',()=>setPause(false));
function restartStory(){
 state.watchKey=false;state.bridge=false;state.metMerrick=false;state.timber=false;state.ropes=false;
 objective.forest='Follow the old road. Seek the watchtower key to pass the east gate.';
 objective.village='Speak to Merrick, collect timber and rope, then repair Willowmere bridge.';
 menuOpen=false;$('pause-menu').hidden=true;$('story-art').hidden=true;
 beginScene('cell');$('intro').hidden=false;paused=false;keys.clear();touch.clear();document.exitPointerLock?.();
}
$('restart').addEventListener('click',restartStory);
$('pause-restart').addEventListener('click',restartStory);
function toggleSound(){muted=!muted;for(const id of ['mute','pause-sound'])$(id).textContent='Sound: '+(muted?'Off':'On');}
$('mute').addEventListener('click',toggleSound);$('pause-sound').addEventListener('click',toggleSound);
$('pause').addEventListener('click',()=>setPause(!menuOpen));
canvas.addEventListener('click',()=>{if(menuOpen||!$('story-art').hidden)return;if(!dialogue)canvas.requestPointerLock?.();else advance();});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&!paused){yaw+=e.movementX*.0024;pitch=Math.max(-1.16,Math.min(1.16,pitch-e.movementY*.0022));}});
document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright','shift',' ','control','c'].includes(k))e.preventDefault();
 if(k==='escape'){if(!e.repeat)setPause(!menuOpen);return;}
 if(menuOpen||!$('story-art').hidden||!$('intro').hidden)return;
 if(k==='e'||k==='enter'){if(!e.repeat)use();return;}
 if(k===' '){if(!e.repeat&&!paused&&jumpY===0&&jumpSpeed===0&&crouch<.3){jumpSpeed=5.1;sound(240,.12);}return;}
 keys.add(k);});document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&!menuOpen&&$('intro').hidden&&$('story-art').hidden&&!dialogue)setPause(true);});
for(const btn of document.querySelectorAll('[data-key]')){const k=btn.dataset.key;btn.addEventListener('pointerdown',e=>{e.preventDefault();touch.add(k)});for(const ev of ['pointerup','pointercancel','pointerleave'])btn.addEventListener(ev,()=>touch.delete(k));}
$('mobile-action').addEventListener('click',use);
let x0=null;canvas.addEventListener('touchstart',e=>{if(e.touches.length===1)x0={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});canvas.addEventListener('touchmove',e=>{if(x0&&e.touches.length===1){const x=e.touches[0].clientX,y=e.touches[0].clientY;yaw+=(x-x0.x)*.006;pitch=Math.max(-1.16,Math.min(1.16,pitch-(y-x0.y)*.006));x0={x,y};}},{passive:true});canvas.addEventListener('touchend',()=>{x0=null;});
init();
})();