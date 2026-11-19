(()=>{
'use strict';
const $=id=>document.getElementById(id), canvas=$('view'), gate=$('gate');
let engine,scene,camera,active=false,paused=true,dialogue=false;
const keys=new Set(),touch=new Set(),things=[],solid=[];
let crouch=0,bob=0,jumpHeight=0,jumpVelocity=0,lastTouch=null,storyFrame=0,readCount=0;
const V=(x,y,z)=>new BABYLON.Vector3(x,y,z);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const seed=(n)=>{let v=Math.sin(n*127.1+22.7)*43758.5453123;return v-Math.floor(v);};
const intro=[
 ['THE KINGDOM OF ALDEMAR','Oliver ruled the peaceful kingdom of Aldemar.'],
 ['A PEACEFUL NIGHT','One night the king slept, unaware of the betrayal.'],
 ['THE STOLEN CROWN','Edwin crept inside and stole the royal crown.'],
 ['THE FALSE KING','Edwin claimed the throne and called Oliver an intruder.'],
 ['THE KING IMPRISONED','Guards dragged the true king to a prison cell.']
];
async function auth(){
 try{
  const res=await fetch('/api/fallen-king/world',{credentials:'same-origin',cache:'no-store'});
  if(!res.ok){gate.textContent=res.status===401?'Sign in to access the admin preview.':res.status===403?'Only EloScanner administrators can access this preview.':'Administrator verification is currently unavailable.';return;}
  const d=await res.json();if(!Array.isArray(d.tiles)||!d.width)throw Error('Ongeldig administratorantwoord');
  if(!window.BABYLON){gate.textContent='The 3D engine could not load. Check your connection.';return;}
  createWorld();gate.hidden=true;$('game').hidden=false;engine.resize();requestAnimationFrame(()=>engine.resize());engine.runRenderLoop(frame);window.addEventListener('resize',()=>engine.resize());document.addEventListener('fullscreenchange',()=>requestAnimationFrame(()=>engine.resize()));
 }catch(e){console.error('Prison preview startup failed',e);gate.textContent='Could not start the prison: '+e.message;}
}
function texture(name,base,detail=1){
 const t=new BABYLON.DynamicTexture(name,{width:256,height:256},scene,false);
 const c=t.getContext();c.fillStyle=base;c.fillRect(0,0,256,256);
 let n=0;for(let y=0;y<256;y+=3)for(let x=0;x<256;x+=3){
   const r=seed(++n*17+name.length*13),value=Math.floor((r-.5)*42*detail);
   c.fillStyle=value>=0?'rgba(224,205,170,'+(value/170)+')':'rgba(9,14,19,'+(-value/115)+')';
   c.fillRect(x,y,3+seed(n)*3,3+seed(n+3)*3);
 }
 if(name.includes('stone')||name.includes('floor')){
  c.lineWidth=2;c.strokeStyle='rgba(15,17,21,.27)';
  for(let j=0;j<7;j++){c.beginPath();c.moveTo(seed(j+6)*256,seed(j+19)*256);c.lineTo(seed(j+8)*256,seed(j+20)*256);c.stroke();}
 }
 if(name.includes('wood')){
  for(let x=3;x<256;x+=11){c.strokeStyle='rgba(16,9,5,.16)';c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x+9,75,x-8,130,x+3,256);c.stroke();}
 }
 t.update();t.wrapU=BABYLON.Texture.WRAP_ADDRESSMODE;t.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;return t;
}
function mat(name,color,rough=1,metal=0,emissive=null){
 const m=new BABYLON.PBRMaterial(name,scene);m.albedoColor=BABYLON.Color3.FromHexString(color);m.roughness=rough;m.metallic=metal;
 if(emissive)m.emissiveColor=BABYLON.Color3.FromHexString(emissive);
 return m;
}
function box(name,x,y,z,w,h,d,m,collide=false){
 const o=BABYLON.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);o.position.set(x,y,z);o.material=m;o.receiveShadows=true;
 if(collide)solid.push({x,z,w,d});return o;
}
function cylinder(name,x,y,z,r,h,m,edges=16){
 const o=BABYLON.MeshBuilder.CreateCylinder(name,{diameter:r*2,height:h,tessellation:edges},scene);o.position.set(x,y,z);o.material=m;o.receiveShadows=true;return o;
}
function sphere(name,x,y,z,r,m){
 const o=BABYLON.MeshBuilder.CreateSphere(name,{diameter:r,segments:10},scene);o.position.set(x,y,z);o.material=m;return o;
}
function plane(name,x,y,z,w,h,m,rot=0){
 const o=BABYLON.MeshBuilder.CreatePlane(name,{width:w,height:h,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
 o.position.set(x,y,z);o.rotation.y=rot;o.material=m;return o;
}
function register(name,description,x,z,r=1.75,action=null){things.push({name,description,x,z,r,action});}
function createWorld(){
 engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:false,antialias:true});
 engine.setHardwareScalingLevel(Math.max(1,Math.min(1.6,(devicePixelRatio||1)/1.35)));
 scene=new BABYLON.Scene(engine);scene.clearColor=new BABYLON.Color4(.045,.056,.068,1);
 scene.fogMode=BABYLON.Scene.FOGMODE_EXP2;scene.fogDensity=.022;scene.fogColor=BABYLON.Color3.FromHexString('#151b20');
 scene.environmentIntensity=.42;
 camera=new BABYLON.UniversalCamera('Oliver camera',V(0,1.65,2.2),scene);
 camera.fov=1.17;camera.minZ=.045;camera.maxZ=80;camera.rotation.set(0,Math.PI,0);
 scene.activeCamera=camera;
 const hemi=new BABYLON.HemisphericLight('cold ambient',V(.2,1,.4),scene);
 hemi.intensity=.42;hemi.diffuse=BABYLON.Color3.FromHexString('#aebaca');hemi.groundColor=BABYLON.Color3.FromHexString('#343539');
 const fire=new BABYLON.PointLight('torch amber',V(1.4,3,-2.85),scene);fire.intensity=15;fire.range=10;fire.diffuse=BABYLON.Color3.FromHexString('#ffb36b');
 const moon=new BABYLON.PointLight('cold moonlight',V(-4.9,3.9,3.7),scene);moon.intensity=7.5;moon.range=9;moon.diffuse=BABYLON.Color3.FromHexString('#7995b5');
 const bounce=new BABYLON.PointLight('corridor spill',V(0,2.6,-6.2),scene);bounce.intensity=7;bounce.range=11;bounce.diffuse=BABYLON.Color3.FromHexString('#e0a86d');
 scene.onBeforeRenderObservable.add(()=>{fire.intensity=15+Math.sin(performance.now()*.009)*.8+Math.sin(performance.now()*.017)*.7;});
 const stone=mat('limestone','#a1a4a0'),darkStone=mat('stone seams','#74756d'),floorMat=mat('worn slate','#a3a09a'),brick=mat('hand dressed limestone','#97938c');
 const wood=mat('old oak','#8e6a4b'),woodDark=mat('weathered oak','#604734'),iron=mat('black wrought iron','#596068',.68,.7),rust=mat('rusty steel','#88644d',.87,.45);
 const linen=mat('dirty wool','#b0a48e'),straw=mat('dry straw','#c7a36b'),cloth=mat('washed blanket','#58636b'),water=mat('drain darkness','#17272a',.21,.08);
 const grime=mat('wall shadow grime','#565953'),paper=mat('old parchment','#d2bd8e'),candle=mat('flame','#ffa33a',.6,0,'#ed7c29');
 stone.albedoTexture=texture('limestone stone','#a1a09c');floorMat.albedoTexture=texture('floor flagstone','#8d8980');
 brick.albedoTexture=texture('stone block','#a19b92');wood.albedoTexture=texture('wood grain','#88715b');
 woodDark.albedoTexture=texture('dark wood grain','#675344');linen.albedoTexture=texture('linen worn','#ada28e');
 // Main royal prison cell. Geometry retains its proportions while surface detail comes from textured masonry.
 box('stone pavement',0,-.22,.2,12.5,.4,19,floorMat);
 box('vault ceiling',0,4.7,.2,12.5,.48,19,darkStone);
 box('rear stone wall',0,2.2,4.55,12.5,4.8,.6,stone);
 // Side openings look into real adjacent cells, never into painted fake windows.
 for(const side of [-1,1]){
  const x=side*6.05;
  box('cell side lower masonry',x,.48,-.1,.55,1.0,9.3,stone);
  box('cell side upper masonry',x,3.83,-.1,.55,1.75,9.3,stone);
  for(const z of [-3.6,3.1])box('side arch pier',x,2.15,z,.57,2.75,2.4,stone);
  for(let z=-2.12;z<=1.77;z+=.37)box('neighbor cell forged bars',x,2.18,z,.11,2.36,.08,iron);
  box('neighbor cell top rail',x,3.24,-.16,.12,.12,4.4,iron);
  box('neighbor cell bottom rail',x,1.12,-.16,.12,.12,4.4,iron);
  // The adjacent cell extends behind the bars and is illuminated separately.
  box('neighbor flagstone floor',side*8.48,-.17,-.16,4.8,.3,9.0,floorMat);
  box('neighbor back wall',side*10.73,2.2,-.16,.45,4.8,9.1,stone);
  box('neighbor end wall',side*8.43,2.2,4.30,4.8,4.8,.43,stone);
  box('neighbor rear wall',side*8.43,2.2,-4.6,4.8,4.8,.43,stone);
  box('neighbor ceiling',side*8.43,4.65,-.16,4.8,.3,9.1,darkStone);
  box('neighbor cot',side*8.58,.44,1.57,1.7,.31,2.8,woodDark);
  box('neighbor mattress',side*8.58,.69,1.57,1.46,.2,2.45,linen);
  box('neighbor blanket',side*8.58,.83,2.03,1.43,.06,1.25,cloth);
  const lit=new BABYLON.PointLight('dim neighboring cell',V(side*8.2,2.75,-1.5),scene);
  lit.intensity=3;lit.range=6;lit.diffuse=BABYLON.Color3.FromHexString('#caa478');
 }
 box('corridor far wall',0,2.25,-9.2,12.5,4.8,.65,stone);
 for(const side of [-1,1])box('corridor side enclosure',side*6.05,2.18,-6.84,.55,4.65,4.75,stone);
 // Cell front: substantial lintel, bottom plinth, two piers and individual forged bars.
 box('cell doorway top',0,4.04,-4.6,12.2,1.45,.62,stone);
 box('cell doorway footing',0,.24,-4.6,12.2,.48,.64,darkStone);
 for(let x=-6;x<=6.05;x+=.86){
  box('iron prison bar',x,2.2,-4.57,.085,3.5,.085,iron);
  sphere('rivet',x,2.89,-4.48,.13,rust);
 }
 for(let y of [1.12,3.27])box('forged crossbar',0,y,-4.49,12,.115,.13,iron);
 box('main gate frame left',-1.55,2.15,-4.42,.17,3.8,.18,rust);
 box('main gate frame right',1.55,2.15,-4.42,.17,3.8,.18,rust);
 box('gate lockbox',1.53,1.37,-4.26,.32,.35,.27,iron);
 cylinder('keyhole',1.53,1.36,-4.1,.037,.04,water);
 register('Locked cell gate','The iron gate is locked. Edwin ordered the guards never to let the real king leave.',0,-4.5,2.5);
 // Wall masonry: uneven relief stones and mortar courses create visual texture.
 for(const side of ['rear','left','right','far']){
  for(let row=0;row<12;row++)for(let col=0;col<26;col++){
   const offset=(row%2)*.24,j=col+row*29,noise=seed(j*3+side.length);
   if(noise<.12)continue;
   let p;
   if(side==='rear'||side==='far'){
    const x=-5.9+col*.47+offset,y=.14+row*.37;
    p=box('irregular masonry stone',x,y,side==='rear'?4.214:-8.848,.43+noise*.04,.345,.045+noise*.06,brick);
   }else{
    const z=-8.7+col*.51+offset,y=.14+row*.37;
    if(z> -2.4&&z<2.25&&y>.98&&y<3.35)continue;
    p=box('old stone edge',side==='left'?-5.742:5.742,y,z,.05+noise*.05,.34,.47,brick);
   }
   if(row%3===0&&noise>.91)p.material=darkStone;
  }
 }
 // Thick structural pilasters and overhead beams.
 for(const x of [-5.3,0,5.3]){
  box('ceiling ribs',x,4.36,-.15,.42,.42,9.6,darkStone);
  box('stone corbel',x,3.87,3.98,.85,.45,1.2,stone);
 }
 for(const z of [-3.55,.3,3.65]){
  for(const x of [-5.73,5.73]){
   box('wall pier',x,2.2,z,.55,4.43,.72,darkStone);
  }
 }
 // A continuous stone floor with subtle engraved mortar joints, rather than raised square blocks.
 const floorTex=new BABYLON.DynamicTexture('stone flagstone floor art',{width:1024,height:1024},scene,false);
 const fc=floorTex.getContext();fc.fillStyle='#8b8982';fc.fillRect(0,0,1024,1024);
 let fn=0;for(let y=0;y<1024;y+=4)for(let x=0;x<1024;x+=4){
  const q=seed(fn++*1.791);fc.fillStyle=q>.47?'rgba(203,193,170,.055)':'rgba(16,19,18,.045)';fc.fillRect(x,y,4,4);
 }
 for(let row=0;row<16;row++){const yy=row*64+8;
  for(let col=0;col<12;col++){const xx=col*88-((row%2)*44)+8;
   fc.strokeStyle='rgba(24,27,26,.28)';fc.lineWidth=3;fc.strokeRect(xx,yy,87,63);
   fc.strokeStyle='rgba(227,214,183,.07)';fc.lineWidth=1;fc.strokeRect(xx+3,yy+3,81,57);
  }
 }
 floorTex.update();floorMat.albedoTexture=floorTex;floorMat.albedoColor=BABYLON.Color3.FromHexString('#b0aca4');
 // Faint rounded wet marks and worn patches, not floating stone slabs.
 const dampMat=mat('worn floor stains','#565b59');dampMat.alpha=.23;
 for(let i=0;i<12;i++){
  const p=BABYLON.MeshBuilder.CreateDisc('subtle damp patch',{radius:.22+seed(i+9)*.49,tessellation:26,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  p.position.set(-5.3+seed(i*8+2)*10.6,.009,-3.7+seed(i*13+3)*7.4);p.rotation.x=Math.PI/2;p.scaling.y=.4+seed(i+2)*.65;p.material=dampMat;
 }
 // Darkened masonry wash near floor height, using thin blended planes.
 for(let i=0;i<10;i++){
  const p=BABYLON.MeshBuilder.CreateDisc('damp wall discoloration',{radius:.22+seed(i+2)*.42,tessellation:18,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  p.position.set(-5+seed(i*4+3)*10,.28+seed(i+11)*1.5,4.179);p.scaling.y=1.55;p.material=grime;
 }
 // Inmate sleeping cot: wooden frame, slats, mattress, blanket.
 const cot=box('prison bunk',-3.65,.56,1.4,2.55,.22,4.18,woodDark,true);
 for(const z of [-.35,3.15])for(const x of [-4.7,-2.6])box('bedpost',x,.5,z,.13,1.04,.14,wood);
 box('mattress',-3.65,.73,1.42,2.19,.25,3.65,linen);
 box('threadbare blanket',-3.66,.89,2.14,2.17,.075,1.75,cloth);
 box('pillow',-3.65,.89,-.05,1.46,.15,.64,linen);
 for(let i=0;i<8;i++)box('bed joinery',-4.55+i*.25,.4,1.35,.12,.12,3.95,wood);
 register('Prison cot','A thin mattress and a worn wool blanket. This is how they treat their king.',-3.65,1.4,2.2);
 // Hand-built latrine: rounded stone pedestal, dark ceramic bowl and curved rim.
 cylinder('worn stone toilet pedestal',3.72,.34,2.95,.73,.63,darkStone,28);
 cylinder('recessed lavatory cavity',3.72,.67,2.95,.50,.05,water,32);
 const rim=BABYLON.MeshBuilder.CreateTorus('rounded latrine rim',{diameter:1.25,thickness:.18,tessellation:32},scene);
 rim.position.set(3.72,.73,2.95);rim.material=stone;
 cylinder('drain collar',3.72,.42,2.95,.39,.14,iron,28);
 box('latrine waste pipe in wall',4.88,.47,3.22,.24,.73,.29,iron);
 solid.push({x:3.72,z:2.95,w:1.55,d:1.55});
 register('Old stone latrine','The filthy latrine smells of damp stone. An iron drain beneath it may hide a way out. Only the prison is playable in this preview.',3.65,2.95,2.15);
 // Crumbling grating as a story clue, but it does not transition to the sewers.
 box('loose floor grate surround',2.48,.035,1.16,1.4,.09,1.25,darkStone);
 box('drain well',2.48,.087,1.16,1.12,.025,1.02,water);
 for(let i=-2;i<=2;i++)box('steel grate slat',2.48+i*.2,.12,1.16,.065,.08,1.1,iron);
 for(let i=-2;i<=2;i++)box('cross brace',2.48,.128,1.16+i*.21,1.11,.046,.045,rust);
 register('Loose drain grate','Water echoes below the iron grate. Oliver may escape through here one day—but this preview contains only the prison.',2.48,1.16,2);
 // Wooden door recess and storeroom in corridor.
 box('corridor arch lintel',-4.45,3.42,-8.78,2.3,1.03,.18,darkStone);
 box('locked storeroom door',-4.45,1.68,-8.76,1.75,3.2,.14,woodDark);
 for(let i=-1;i<=1;i++)box('door boards',-4.45+i*.48,1.67,-8.64,.41,2.95,.055,wood);
 for(let y of [.58,2.55])box('door iron brace',-4.45,y,-8.57,1.85,.12,.13,iron);
 sphere('door handle',-3.76,1.43,-8.52,.14,rust);
 // A sleeping sentry, visible through the cell bars in the corridor.
 // Articulated round shapes and a recognizable helmet, not a block mannequin.
 const skin=mat('guard skin','#a98b70'),tunic=mat('guard uniform','#526272'),trim=mat('guard gold piping','#a58a5d');
 const gx=-1.7,gz=-6.85;
 box('guard bench frame',gx,.43,gz,2.65,.2,.92,woodDark,true);
 for(const bx of [gx-1.04,gx+1.04])for(const bz of [gz-.31,gz+.31])cylinder('bench wooden leg',bx,.25,bz,.085,.50,wood,10);
 const body=BABYLON.MeshBuilder.CreateCapsule('sleeping royal guard torso',{radius:.35,height:1.37,tessellation:12},scene);
 body.position.set(gx,.91,gz);body.rotation.z=Math.PI/2.1;body.material=tunic;
 const head=sphere('guard face',gx-1.0,.94,gz,.57,skin);
 const helmet=BABYLON.MeshBuilder.CreateSphere('guard steel helmet',{diameter:.65,segments:16,slice:.57},scene);
 helmet.position.set(gx-1.0,1.15,gz);helmet.material=iron;
 const crest=BABYLON.MeshBuilder.CreateTorus('helmet crest',{diameter:.41,thickness:.06,tessellation:20},scene);
 crest.position.set(gx-.99,1.32,gz);crest.rotation.y=Math.PI/2;crest.material=trim;
 for(const zShift of [-.28,.28]){
  const arm=cylinder('guard sleeping arm',gx-.22,.59,gz+zShift,.12,.95,tunic,12);arm.rotation.z=Math.PI/2;
  const boot=cylinder('guard boot',gx+.85,.54,gz+zShift,.14,.52,woodDark,12);boot.rotation.z=Math.PI/2;
 }
 sphere('guard nose',gx-1.29,.88,gz,.08,skin);
 register('Sleeping royal guard','The royal guard is asleep on his bench. He wears Edwin’s insignia. Best not wake him.',-1.55,-4.47,2.25);
 // Iron shackles on wall, chains suspended overhead.
 for(const [x,z] of [[-5.67,-.8],[5.67,-2.2],[-5.67,2.4]]){
  const alongX=Math.abs(x)>5.6;
  for(let y=2.85;y>1.56;y-=.21){
   const link=BABYLON.MeshBuilder.CreateTorus('hanging shackle chain',{diameter:.23,thickness:.038,tessellation:10},scene);
   link.position.set(x,y,z);link.rotation.x=y% .4>.2?Math.PI/2:0;link.material=iron;
  }
  cylinder('shackle collar',x,1.5,z,.18,.12,iron,10).rotation.z=Math.PI/2;
 }
 // Props: barrels, buckets, rope, lanterns, old scrolls.
 for(const [x,z] of [[4.7,-2.9],[-4.5,-6.7],[3.95,-7.3]]){
  const b=cylinder('oak storage barrel',x,.65,z,.42,1.3,woodDark,13);
  for(const y of [.2,.94,1.16])cylinder('barrel metal band',x,y,z,.435,.07,iron,16);
  cylinder('barrel lid',x,1.31,z,.4,.07,wood,13);
  solid.push({x,z,w:.98,d:.98});
 }
 cylinder('metal bucket',-1.5,.27,3.35,.31,.52,iron,13);
 cylinder('bucket inner dark',-1.5,.53,3.35,.24,.015,water);
 for(let i=0;i<13;i++){
  const x=-1.7+seed(i*9)*1.8,z=2.5+seed(i*8+11)*1.2;
  const s=box('scattered prison straw',x,.035,z,.02,.016,.27+seed(i+7)*.31,straw);s.rotation.y=seed(i+4)*6.28;
 }
 // King's sparse belongings and a readable letter.
 box('wall shelf',3.95,2.17,4.14,2.58,.13,.67,wood);
 for(let x of [2.94,4.86])box('shelf bracket',x,1.95,4.05,.12,.42,.5,iron);
 box('parchment note',3.96,2.26,3.99,.83,.032,.47,paper);
 cylinder('ink bottle',4.82,2.32,3.99,.08,.21,water,12);
 register('Edwin\'s letter','"Aldemar has no King Oliver anymore. No one will believe you." — E.',3.92,3.46,1.85);
 // Torch brackets cast warm light, with visibly glowing flame.
 function torch(x,y,z){
  box('torch wall bracket',x,y-.38,z,.14,.4,.42,iron);
  cylinder('torch wooden shaft',x,y-.13,z-.22,.075,.85,wood,10);
  const c=cylinder('torch ember bowl',x,y+.29,z-.22,.17,.13,iron,12);
  sphere('torch burning core',x,y+.5,z-.22,.33,candle);
 }
 torch(1.45,2.65,-4.01);torch(-4.2,2.63,-8.89);torch(4.95,2.65,-8.89);
 // View outside prison through barred rear window, moonlit glow.
 box('high stone window aperture',-2.45,3.45,4.22,1.85,1.12,.18,water);
 for(const x of [-2.95,-2.45,-1.95])box('window iron bars',x,3.48,4.085,.07,1.05,.12,iron);
 box('window stone sill',-2.45,2.82,4.0,2.18,.18,.58,stone);
 // Small rounded rubble replaces the floating white square debris.
 for(let i=0;i<15;i++){
  const x=-5.2+seed(i*43)*10.4,z=-3.7+seed(i*17)*7.7;
  if(Math.hypot(x+3.65,z-1.4)<1.9||Math.hypot(x-3.72,z-2.95)<1.5)continue;
  const p=sphere('rounded rubble stone',x,.08,z,.15+seed(i+3)*.16,darkStone);
  p.scaling.set(1,.46,.7);
 }
 // Merge thousands of static masonry and paving blocks into a few draw calls.
 // Visual detail remains, but the GPU sees far fewer separate meshes.
 for(const category of ['irregular masonry stone','old stone edge','offset flagstone']){
  const list=scene.meshes.filter(m=>m.name===category);
  const groups=new Map();
  for(const m of list){const name=m.material?.name||'default';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(m);}
  for(const pieces of groups.values()){
   for(let start=0;start<pieces.length;start+=240){
    const batch=pieces.slice(start,start+240);
    if(batch.length>1){try{BABYLON.Mesh.MergeMeshes(batch,true,true,undefined,false,true);}catch(e){console.warn('Static stone batching skipped',e);}}
   }
  }
 }
 // Simple moody postprocessing, no huge textures downloaded.
 try{
  const pipe=new BABYLON.DefaultRenderingPipeline('prison grading',true,scene,[camera]);
  pipe.fxaaEnabled=true;pipe.imageProcessingEnabled=true;
  pipe.imageProcessing.contrast=1.19;pipe.imageProcessing.exposure=1.02;
  pipe.bloomEnabled=true;pipe.bloomThreshold=.82;pipe.bloomWeight=.17;pipe.bloomKernel=35;
 }catch(e){console.warn('Postprocessing fallback',e);}
 scene.skipPointerMovePicking=true;
}
function candidates(){
 let best=null,dist=Infinity;
 const p=camera.position;
 for(const t of things){
  const d=Math.hypot(p.x-t.x,p.z-t.z);
  if(d>t.r||d>=dist)continue;
  const dx=t.x-p.x,dz=t.z-p.z;
  const forward=Math.atan2(dx,dz),angle=Math.abs(Math.atan2(Math.sin(forward-camera.rotation.y),Math.cos(forward-camera.rotation.y)));
  if(angle>1.32)continue;
  best=t;dist=d;
 }
 return best;
}
function showNote(t){
 dialogue=true;document.exitPointerLock?.();$('note').hidden=false;
 $('note-heading').textContent=t.name.toUpperCase();$('note-text').textContent=t.description;
 $('prompt').hidden=true;readCount++;if(readCount>=2)$('objective').textContent='Explore the cell. The escape comes in a future chapter.';
}
function interact(){if(!$('story').hidden||!$('start').hidden||!$('pause-menu').hidden)return;
 if(dialogue){dialogue=false;$('note').hidden=true;canvas.requestPointerLock?.();return;}
 const t=candidates();if(t)showNote(t);
}
function pause(open){
 if(!$('start').hidden||!$('story').hidden)return;
 paused=open;$('pause-menu').hidden=!open;$('pause-btn').textContent=open?'Resume':'Pause';
 if(open){keys.clear();touch.clear();document.exitPointerLock?.();}else{canvas.focus();canvas.requestPointerLock?.();}
}
function collides(x,z){
 if(x< -5.61||x>5.61||z< -4.19||z>4.12)return true;
 for(const s of solid)if(Math.abs(x-s.x)<s.w/2+.28&&Math.abs(z-s.z)<s.d/2+.28)return true;
 return false;
}
function frame(){
 const dt=Math.min(engine.getDeltaTime()/1000,.045);
 if(active&&!paused&&!dialogue){
  const walking=Number(keys.has('w')||keys.has('arrowup')||touch.has('w'))-Number(keys.has('s')||keys.has('arrowdown')||touch.has('s'));
  const strafing=Number(keys.has('d')||keys.has('arrowright')||touch.has('d'))-Number(keys.has('a')||keys.has('arrowleft')||touch.has('a'));
  const mag=Math.hypot(walking,strafing)||1,yaw=camera.rotation.y;
  const running=keys.has('shift')&&!keys.has('control');
  const speed=(running?3.65:2.4)*(keys.has('control') ? 0.57 : 1);
  const dx=(Math.sin(yaw)*walking+Math.cos(yaw)*strafing)*speed*dt/mag;
  const dz=(Math.cos(yaw)*walking-Math.sin(yaw)*strafing)*speed*dt/mag;
  if(!collides(camera.position.x+dx,camera.position.z))camera.position.x+=dx;
  if(!collides(camera.position.x,camera.position.z+dz))camera.position.z+=dz;
  crouch+=(Number(keys.has('control'))-crouch)*Math.min(1,dt*9);
  if(jumpHeight>0||jumpVelocity>0){jumpVelocity-=15.2*dt;jumpHeight=Math.max(0,jumpHeight+jumpVelocity*dt);if(jumpHeight===0)jumpVelocity=0;}
  if(walking||strafing)bob+=dt*(running?16:10);
  const sway=(walking||strafing)&&jumpHeight===0?Math.sin(bob)*.024:0;
  camera.position.y=1.66-.53*crouch+jumpHeight+sway;
  const t=candidates();$('prompt').hidden=!t;$('prompt').textContent=t?'[ E ] '+t.name:'';
 }
 scene.render();
}
function reset(){
 camera.position.set(0,1.66,2.2);camera.rotation.set(0,Math.PI,0);
 readCount=0;dialogue=false;paused=false;active=true;jumpHeight=0;jumpVelocity=0;crouch=0;keys.clear();touch.clear();
 $('note').hidden=true;$('pause-menu').hidden=true;$('prompt').hidden=true;
 $('objective').textContent='Explore the cell. Look for clues about your imprisonment.';
}
function storyShow(){
 const item=intro[storyFrame];$('story-image').src='/assets/fallen-king-intro/intro-'+(storyFrame+1)+'.png';
 $('story-counter').textContent='THE FALLEN KING · '+(storyFrame+1)+' / 5';
 $('story-title').textContent=item[0];$('story-caption').textContent=item[1];
 $('story-next').textContent=storyFrame===4?'Enter the prison':'Continue';
}
function finishIntro(){
 $('story').hidden=true;reset();
 showNote({name:'King Oliver',description:'Edwin stole my crown. No one believes I am the rightful king... I must investigate this prison cell.'});
}
$('begin').addEventListener('click',()=>{$('start').hidden=true;$('story').hidden=false;storyFrame=0;storyShow();});
$('story-next').addEventListener('click',()=>{storyFrame++;if(storyFrame>=5)finishIntro();else storyShow();});
$('story-skip').addEventListener('click',finishIntro);
$('resume').addEventListener('click',()=>pause(false));$('pause-btn').addEventListener('click',()=>pause(!paused));
$('restart').addEventListener('click',()=>{reset();pause(true);$('pause-menu').hidden=true;$('start').hidden=false;});
$('mobile-e').addEventListener('click',interact);
canvas.addEventListener('click',()=>{if(dialogue){interact();return;}if(active&&!paused)canvas.requestPointerLock?.();});
document.addEventListener('mousemove',e=>{
 if(document.pointerLockElement===canvas&&active&&!paused&&!dialogue){
  camera.rotation.y+=e.movementX*.0021;
  camera.rotation.x=clamp(camera.rotation.x+e.movementY*.0019,-1.17,1.17);
 }
});
document.addEventListener('keydown',e=>{
 const k=e.key.toLowerCase();
 if(['w','a','s','d','e','shift','control','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();
 if(k==='escape'){if(!dialogue&&!e.repeat)pause(!paused);return;}
 if(k==='e'||k==='enter'){if(!e.repeat)interact();return;}
 if(k===' '){if(!e.repeat&&active&&!paused&&!dialogue&&jumpHeight===0&&jumpVelocity===0&&crouch<.3){jumpVelocity=5.5;}return;}
 keys.add(k);
});
document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
document.addEventListener('blur',()=>keys.clear());
document.addEventListener('pointerlockchange',()=>{
 if(document.pointerLockElement!==canvas&&active&&!paused&&!dialogue&&$('start').hidden&&$('story').hidden){pause(true);}
});
document.querySelectorAll('[data-move]').forEach(btn=>{
 const key=btn.dataset.move;
 btn.addEventListener('pointerdown',e=>{e.preventDefault();touch.add(key);btn.setPointerCapture(e.pointerId);});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(type,()=>touch.delete(key));
});
canvas.addEventListener('touchstart',e=>{
 if(e.touches.length===1)lastTouch={x:e.touches[0].clientX,y:e.touches[0].clientY};
},{passive:true});
canvas.addEventListener('touchmove',e=>{
 if(lastTouch&&e.touches.length===1&&!paused){
  const t=e.touches[0];camera.rotation.y+=(t.clientX-lastTouch.x)*.006;
  camera.rotation.x=clamp(camera.rotation.x+(t.clientY-lastTouch.y)*.005,-1.17,1.17);
  lastTouch={x:t.clientX,y:t.clientY};
 }
},{passive:true});
canvas.addEventListener('touchend',()=>{lastTouch=null;});
auth();
})();