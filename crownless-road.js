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
  // A real woodland rather than a mostly empty grid: clusters grow ONLY off
  // the old road, gate, tower entrance and scripted character positions.
  for(let z=3;z<19;z++)for(let x=4;x<31;x++){
   if((x*13+z*17)%23!==0||w.tiles[z][x]!=='.')continue;
   let clear=true;
   for(let dz=-2;dz<=2&&clear;dz++)for(let dx=-2;dx<=2;dx++)
    if(w.tiles[z+dz]?.[x+dx]==='p'||w.tiles[z+dz]?.[x+dx]==='D')clear=false;
   if(clear)fill(w,x,z,'T');
  }
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
  const houses=[[13,23,7,6],[30,19,8,7],[35,33,8,7],[17,8,8,6],[35,9,10,7]];
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
 attribute vec3 pos;attribute vec3 color;attribute vec3 normal;
 uniform vec3 camera;uniform vec2 angle;uniform float aspect;
 varying vec3 vcolor;varying vec3 vnormal;varying vec3 vworld;varying float depth;
 void main(){
  vec3 p=pos-camera;
  float sy=sin(angle.x),cy=cos(angle.x),sp=sin(angle.y),cp=cos(angle.y);
  vec3 q=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);
  vec3 r=vec3(q.x,cp*q.y+sp*q.z,-sp*q.y+cp*q.z);
  float distanceToCamera=-r.z;
  // True perspective with proper near-plane clipping; no clamped W distortion.
  gl_Position=vec4(r.x*1.55/aspect,r.y*1.55,distanceToCamera*1.001-0.10,distanceToCamera);
  depth=length(p.xz);vcolor=color;vnormal=normal;vworld=pos;
 }`));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
 precision highp float;
 varying vec3 vcolor;varying vec3 vnormal;varying vec3 vworld;varying float depth;
 uniform vec3 fogColor;uniform float fogRange;uniform vec3 camera;
 uniform vec3 lightPosition;uniform vec3 lightTint;uniform vec3 sunDirection;
 uniform float interior;uniform float time;
 float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
 float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),mix(hash21(i+vec2(0.,1.)),hash21(i+1.),f.x),f.y);
 }
 void main(){
  vec3 n=normalize(vnormal);
  vec3 sunlight=normalize(sunDirection);
  float diffuse=max(0.0,dot(n,sunlight));
  vec3 toLamp=lightPosition-vworld;
  float radius=length(toLamp);
  float lambert=max(0.0,dot(n,normalize(toLamp)));
  float falloff=1.0/(1.0+0.06*radius+0.075*radius*radius);
  float skylight=0.45+0.30*max(n.y,0.0);
  float warm=lambert*falloff*(interior>0.5?3.8:1.5);
  vec3 light=vec3(skylight)+vec3(.40,.34,.29)*diffuse+lightTint*warm;
  // Fine coherent material breakup replaces flat pixels without shimmering.
  float grain=(noise(vworld.xz*4.6+vworld.y*.17)-.5)*.065;
  float stone=noise(vworld.xz*.72+vworld.yy*.27);
  vec3 shaded=vcolor*max(vec3(.19),light)*(0.94+grain+stone*.09);
  // Slightly brighter in the direction of the light, subtle view-dependent sheen.
  vec3 view=normalize(camera-vworld);
  vec3 halfvec=normalize(normalize(toLamp)+view);
  shaded+=lightTint*pow(max(dot(n,halfvec),0.),32.)*falloff*.075;
  float fog=clamp((depth-(interior>.5?5.:13.))/fogRange,0.0,.88);
  fog=fog*fog*(3.0-2.0*fog);
  shaded=mix(shaded,fogColor,fog*.80);
  shaded=shaded/(shaded+vec3(.20)); // mild filmic highlight rolloff
  shaded=pow(max(shaded,vec3(0.)),vec3(.91));
  gl_FragColor=vec4(shaded,1.0);
 }`));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);
 for(const name of ['camera','angle','aspect','fogColor','fogRange','lightPosition','lightTint','sunDirection','interior','time'])u[name]=gl.getUniformLocation(program,name);
 buffer=gl.createBuffer();gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
 gl.clearDepth(1);gl.enable(gl.DITHER);

}
let vertices=[],count=0;
function triangle(a,b,c,col){
 const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
 const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
 const d=Math.hypot(...n)||1;
 for(const p of [a,b,c])vertices.push(...p,...col,-n[0]/d,-n[1]/d,-n[2]/d);
}
function quad(a,b,c,d,col){triangle(a,b,c,col);triangle(a,c,d,col)}
function box(x,y,z,w,h,d,hex){const c=toRGB(hex),a=x-w/2,b=x+w/2,t=y+h/2,bt=y-h/2,f=z-d/2,k=z+d/2;
 const sides=[[[a,bt,f],[b,bt,f],[b,t,f],[a,t,f],.87],[[b,bt,k],[a,bt,k],[a,t,k],[b,t,k],.76],[[a,bt,k],[a,bt,f],[a,t,f],[a,t,k],.67],[[b,bt,f],[b,bt,k],[b,t,k],[b,t,f],.76],[[a,t,f],[b,t,f],[b,t,k],[a,t,k],1.15]];
 for(const [v1,v2,v3,v4,s] of sides)quad(v1,v2,v3,v4,c.map(v=>Math.min(1,v*s)));
}
function cone(x,y,z,r,h,hex,n=7){const col=toRGB(hex);for(let i=0;i<n;i++){const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n,lit=.66+.3*Math.abs(Math.sin(a+1));triangle([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],[x,y+h,z],col.map(v=>v*lit));}}
// Smooth, irregular organic meshes replace geometric cone-stack trees.
function organicBall(x,y,z,rx,ry,rz,col,seed=0,segments=12,rings=7){
 const rgb=toRGB(col),v=(a,b)=>{const theta=(a/segments)*Math.PI*2,phi=(b/rings)*Math.PI;
  const sp=Math.sin(phi),cp=Math.cos(phi),ang=Math.sin(theta*3.0+seed)*.035+Math.sin(theta*7.0+phi*3.0+seed)*.028;
  const rr=1+ang;
  const nx=sp*Math.cos(theta),ny=cp,nz=sp*Math.sin(theta);
  return {p:[x+nx*rx*rr,y+ny*ry*rr,z+nz*rz*rr],n:[nx/Math.max(rx,.01),ny/Math.max(ry,.01),nz/Math.max(rz,.01)]};
 };
 const put=(a,b,c)=>{for(const q of [a,b,c]){const nn=q.n,d=Math.hypot(...nn)||1;vertices.push(...q.p,...rgb,nn[0]/d,nn[1]/d,nn[2]/d)}};
 for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){
  const a=v(i,j),b=v(i+1,j),c=v(i+1,j+1),d=v(i,j+1);
  put(a,b,c);put(a,c,d);
 }
}
function branchTube(ax,ay,az,bx,by,bz,r1,r2,col,sides=9){
 const c=toRGB(col),dx=bx-ax,dy=by-ay,dz=bz-az,len=Math.hypot(dx,dy,dz)||1;
 const ux=dx/len,uy=dy/len,uz=dz/len;
 let sx=-uz,sy=0,sz=ux;let sl=Math.hypot(sx,sz);
 if(sl<.1){sx=1;sz=0;sl=1;}
 sx/=sl;sz/=sl;
 const tx=uy*sz-uz*sy,ty=uz*sx-ux*sz,tz=ux*sy-uy*sx;
 for(let i=0;i<sides;i++){
  const a=i*Math.PI*2/sides,b=(i+1)*Math.PI*2/sides;
  const pt=(theta,top)=>{const cos=Math.cos(theta),sin=Math.sin(theta),rad=top?r2:r1;
   return [(top?bx:ax)+rad*(sx*cos+tx*sin),(top?by:ay)+rad*(sy*cos+ty*sin),(top?bz:az)+rad*(sz*cos+tz*sin)]};
  const p=pt(a,0),q=pt(b,0),r=pt(b,1),v=pt(a,1);
  quad(p,q,r,v,c.map(k=>k*(.81+.19*Math.cos(a+.3))));
 }
}
function organicRock(x,z,seed=0,scale=1){
 const stone=['#929487','#777b77','#a4a397','#7e8276'][seed%4],rx=.45*scale,rz=.53*scale;
 organicBall(x,.12*scale,z,rx,.34*scale,rz,stone,seed,11,5);
 organicBall(x+.12*scale,.15*scale,z-.08*scale,.24*scale,.20*scale,.30*scale,'#777f73',seed+3,9,5);
}
function shrub(x,z,seed=0,scale=1){
 const c=['#45654a','#526b4c','#6b815a','#536f58'][seed%4];
 for(let i=0;i<5;i++){
  const a=(i*2.4+seed)*2.3999,rad=.21+.11*(i%2);
  organicBall(x+Math.sin(a)*rad*scale,.26*scale+(.09*i%3)*scale,z+Math.cos(a)*rad*scale,.36*scale,.34*scale,.34*scale,c,seed+i,9,5);
 }
}
function tree(x,z,seed){
 const h=5.2+(seed%7)*.27,sc=.80+(seed%5)*.07;
 branchTube(x,0,z,x+.08,h*.72,z+.04,.24*sc,.12*sc,'#594a39',10);
 for(let j=0;j<7;j++){
  const a=seed*1.7+j*2.3999632,height=1.65+j*.43,spread=(1.38-j*.11)*sc;
  const bx=x+Math.cos(a)*spread,bz=z+Math.sin(a)*spread;
  branchTube(x,height,z,bx,height-.17,bz,.085*sc,.035*sc,'#574c38',7);
  organicBall(bx,height+.26,bz,.59*sc,.81*sc,.55*sc,j%3?'#365b45':'#527556',seed+j,11,7);
 }
 organicBall(x+.05,h-.25,z,.76*sc,1.16*sc,.72*sc,'#486a4e',seed,13,8);
}
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
  // Continuous overhead vaults: interior corridors are enclosed instead of
  // showing the sky through their ceilings. Merge contiguous tiles by row.
  for(let z=1;z<world.h-1;z++){
   let x=1;
   while(x<world.w-1){
    if(world.tiles[z][x]==='H'){x++;continue;}
    const x0=x;
    while(x<world.w-1&&world.tiles[z][x]!=='H')x++;
    const span=x-x0;
    if(span>0){
     box(x0+span/2,3.76,z+.5,span,.29,1,stage==='cell'?'#555453':stage==='sewer'?'#3e5451':'#6e6659');
     if(z%4===0)box(x0+span/2,3.48,z+.5,span,.19,.32,stage==='sewer'?'#637a73':'#8d8170');
    }
   }
  }
  // Heavy cross-braces and discreet overhead lamps.
  for(let z=2;z<world.h-2;z+=4)for(let x=2;x<world.w-2;x+=4)if(world.tiles[z][x]!=='H'&&hash(x,z)>.36){
   box(x+.5,3.4,z+.5,3.8,.32,.28,'#7e8178');
   // Pendant ceiling light; never a walk-through lamp post in the corridor.
   if(hash(x+3,z)>.48){box(x+.5,3.12,z+.5,.37,.34,.37,stage==='sewer'?'#8ac1ad':'#e1b781');box(x+.5,3.39,z+.5,.15,.27,.15,'#665c4e');}
  }
 }else{
  for(let i=0;i<26;i++){const x=(i*7)%world.w,z=(i*13)%world.h;if(world.tiles[z]?.[x]!=='.')continue;cone(x+.5,.04,z+.5,.65,.63,'#75806a',6)}
  if(stage==='forest')for(const [x,z] of [[7,9],[13,10],[19,10],[24,12],[30,9]])lantern(x,z,0);
  // Soft shrubs, clusters of organic rocks and wildflower crowns grow on
  // woodland margins; roads and all interactions stay physically clear.
  for(let z=2;z<world.h-2;z++)for(let x=2;x<world.w-2;x++){
   const tile=world.tiles[z][x],h=hash(x*3+5,z*7+11);
   if(tile==='T'&&h>.78)shrub(x+.5,z+.5,Math.floor(h*29),.62);
   else if(tile==='T'&&h<.14)organicRock(x+.50,z+.5,Math.floor(h*97),.45);
   else if(tile==='.'&&h>.935){
    // Ground-level flowers can be safely walked through.
    for(let j=0;j<4;j++)organicBall(x+.28+(j%2)*.26,.10,z+.30+Math.floor(j/2)*.29,.075,.11,.075,
     (j%3===0?'#d5b37e':j%3===1?'#9eaec2':'#e2b9ad'),j,7,4);
   }
  }
  // Layered treeline and distant ridges conceal the edge of the map.
  if(stage==='forest'||stage==='village'){
   for(let i=0;i<25;i++){
    const x=2+i*(world.w-4)/24,z=world.h-.6,high=2.4+hash(i,64)*3.7;
    cone(x,0,z,3.1,high,'#657963',9);
    if(i%2===0)cone(x,1,z-1.1,1.45,4.8,'#344f40',9);
   }
  }
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
  // Weathered castle masonry, oak cupboards and iron torch brackets.
  for(const z of [6,8,12,13]){
   for(let x=7;x<18;x+=1.55){
    box(x+.48,.11,z+.48,.93,.13,.15,'#817e73');
    if((Math.floor(x)+z)%3===0)box(x+.48,2.35,z+.48,.62,.17,.09,'#77776f');
   }
  }
  for(const [x,z] of [[8.3,6.1],[16.6,6.1]]){
   box(x,2.16,z,.22,.50,.20,'#40382d');
   box(x,2.55,z,.29,.16,.31,'#b99b66');
   cone(x,2.64,z,.15,.38,'#ebaa62',11);
   cone(x,2.78,z,.08,.22,'#f8db9a',9);
  }
  // Drawers and books fit against the rear wall rather than intersecting the route.
  box(9.1,.61,12.3,.82,1.2,.58,'#69533e');
  for(const y of [.38,.72,1.06]){
   box(9.1,y,12.63,.67,.035,.04,'#a68a69');
   box(9.1,y+.07,12.66,.16,.045,.05,'#d5b078');
  }
  for(let i=0;i<6;i++)box(9.1,1.33,12.3+.06*i,.86,.04,.035,'#7e6250');
  // Stone murder-holes, northern guard passage, and iron cell fronts.
  for(let x=7;x<18;x+=1.0)box(x+.5,1.66,5.47,.065,2.7,.10,'#333d40');
  box(12.5,3.35,5.55,11,.22,.24,'#a6a39a');
  box(11.5,.26,11.5,2,.45,1.35,'#79695a');box(11.5,.51,11.5,1.9,.13,1.25,'#b0a08a');
  box(15.5,.06,10.5,1.2,.09,1.05,'#353638');for(let i=0;i<5;i++)box(15.1+i*.2,.15,10.5,.04,.18,.95,'#9a9c91');
 }else if(stage==='sewer'){
  for(let i=0;i<110;i++){const x=3+(i*19)%78,z=3+(i*31)%47;if(world.tiles[z]?.[x]!=='p')continue;
   if(hash(x,z)>.45)box(x+.5,.035,z+.5,.7,.05,.46,'#386b6b');
  }
  // Moist courses of old brick and moss, attached to the solid masonry only.
  for(let z=2;z<world.h-2;z+=3)for(let x=2;x<world.w-2;x+=3){
   if(world.tiles[z]?.[x]!=='H')continue;
   if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>world.tiles[z+dz]?.[x+dx]==='p'))continue;
   box(x+.5,.45,z+.5,.89,.43,.88,'#465e53');
   if(hash(x+8,z)>.4)box(x+.5,1.86,z+.5,.78,.08,.84,'#738276');
  }
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
   const cx=x+w/2,cz=z+d/2,front=z+d+.08;
   box(cx,1.85,cz,w,3.7,d,'#c7b595');
   // Genuine sloped roof planes, not stepped rectangular blocks.
   const roofBase=3.72,roofPeak=5.62,lo=x-.55,hi=x+w+.55,frontZ=z+d+.46,backZ=z-.46;
   const left=[lo,roofBase,frontZ],right=[hi,roofBase,frontZ],tip=[cx,roofPeak,frontZ];
   const leftBack=[lo,roofBase,backZ],rightBack=[hi,roofBase,backZ],tipBack=[cx,roofPeak,backZ];
   triangle(left,right,tip,toRGB('#9b8067'));
   triangle(rightBack,leftBack,tipBack,toRGB('#847460'));
   quad(left,leftBack,tipBack,tip,toRGB('#7d4c44'));
   quad(tip,tipBack,rightBack,right,toRGB('#8a584a'));
   // Short ceramic shingle courses sit above the same sloped surface.
   for(let k=1;k<=7;k++){
    const t=k/8,sideX=(hi-lo)*.5*(1-t),yy=roofBase+(roofPeak-roofBase)*t+.018;
    branchTube(cx-sideX,yy,backZ,cx-sideX,yy,frontZ,.035,.035,'#a06a53',5);
    branchTube(cx+sideX,yy,backZ,cx+sideX,yy,frontZ,.035,.035,'#b4775d',5);
   }
   branchTube(cx,roofPeak,backZ,cx,roofPeak,frontZ,.11,.11,'#513d3b',8);
   for(const sx of [x+.24,x+w-.24]){
    box(sx,1.86,front,.21,3.72,.20,'#81664d');
    box(sx,3.19,front,.34,.14,.23,'#bca57d');
   }
   for(let yy=.61;yy<3.4;yy+=.60)box(cx,yy,front,w-.5,.075,.12,'#bba17d');
   box(cx,1.08,front+.10,1.29,2.11,.17,'#6c4935');
   box(cx,1.07,front+.23,1.03,1.90,.07,'#896548');
   box(cx+.37,1.19,front+.31,.075,.075,.10,'#e5c68a');
   for(const a of [x+1.5,x+w-1.5]){
    box(a,2.28,front+.11,1.24,1.07,.14,'#735640');
    box(a,2.28,front+.25,.93,.76,.09,'#8da5a4');
    box(a,2.28,front+.34,.075,.82,.04,'#d7c6aa');
    box(a,2.28,front+.34,.96,.075,.05,'#d7c6aa');
    box(a,1.73,front+.23,1.30,.14,.29,'#9d8261');
   }
   box(cx,3.58,front,.9,.16,.35,'#ddc69c');
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
 const arr=new Float32Array(vertices);count=arr.length/9;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.STATIC_DRAW);
 const pos=gl.getAttribLocation(program,'pos'),color=gl.getAttribLocation(program,'color'),normal=gl.getAttribLocation(program,'normal');
 gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,36,0);gl.enableVertexAttribArray(color);gl.vertexAttribPointer(color,3,gl.FLOAT,false,36,12);gl.enableVertexAttribArray(normal);gl.vertexAttribPointer(normal,3,gl.FLOAT,false,36,24);
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
 const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),scale=Math.min(devicePixelRatio||1,2.5);const pw=Math.floor(w*scale),ph=Math.floor(h*scale);
 if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;gl.viewport(0,0,pw,ph);}
 const sky=palette[stage].sky;gl.clearColor(...sky,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.uniform3f(u.camera,px,1.67-.72*crouch+jumpY,pz);
 gl.uniform2f(u.angle,yaw,pitch);gl.uniform1f(u.aspect,w/h);
 const night=stage==='cell'||stage==='sewer'||stage==='watchtower';
 const lamp=stage==='cell'?[13.5,2.65,7.5]:stage==='watchtower'?[8.5,2.7,5.5]:stage==='sewer'?[Math.round(px/9)*9,3.12,Math.round(pz/9)*9]:[px+8,5,pz-10];
 gl.uniform3fv(u.lightPosition,lamp);gl.uniform3fv(u.lightTint,night?[1.0,.67,.36]:[1.0,.68,.42]);
 gl.uniform3fv(u.sunDirection,night?[.28,.90,-.23]:[-.68,.78,.33]);
 gl.uniform1f(u.interior,night?1:0);gl.uniform1f(u.time,ms*.001);
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
const originalStory=[
 ['THE KINGDOM OF ALDEMAR','King Oliver had ruled over the kingdom of Aldemar for many years.'],
 ['A PEACEFUL NIGHT','King Oliver slept peacefully, unaware of the darkness that awaited him.'],
 ['THE STOLEN CROWN','Edwin sneaks in and reaches for Oliver’s crown.'],
 ['THE FALSE KING','Edwin, now posing as the king, orders the guards to arrest Oliver and lock him away, claiming that Oliver is a trespasser.'],
 ['THE KING IMPRISONED','Oliver was locked away, while Edwin took the throne.']
];
function showStoryFrame(){
 const [heading,line]=originalStory[storyFrame];
 $('story-scene').dataset.scene=String(storyFrame);
 $('story-image').src='/assets/fallen-king-intro/intro-'+(storyFrame+1)+'.png';
 $('story-heading').textContent=heading;
 $('story-line').textContent=line;
 $('story-progress').textContent='THE FALLEN KING · '+(storyFrame+1)+' / 5';
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