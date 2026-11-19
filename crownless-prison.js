(()=>{
'use strict';
const $=id=>document.getElementById(id), canvas=$('view'), gate=$('gate');
let engine,scene,camera,guardRoot,active=false,paused=true,dialogue=false;
const keys=new Set(),touch=new Set(),things=[],solid=[],actors=[];
let crouch=0,bob=0,jumpHeight=0,jumpVelocity=0,lastTouch=null,storyFrame=0,readCount=0,sleepIndicator=null,ignorePointerExit=false;
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
  const d=await res.json();if(!Array.isArray(d.tiles)||!d.width)throw Error('Invalid administrator response');
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
// Revolved profiles and hand-shaped metalwork replace box-only hero props.
function sculpt(name,x,y,z,profile,material,segments=28){
 const mesh=BABYLON.MeshBuilder.CreateLathe(name,{shape:profile.map(p=>V(p[0],p[1],0)),tessellation:segments,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
 mesh.position.set(x,y,z);mesh.material=material;mesh.receiveShadows=true;return mesh;
}
function arch(name,cx,cy,z,w,h,material,r=.08){
 const path=[];for(let i=0;i<=24;i++){const t=Math.PI-i*Math.PI/24;path.push(V(cx+Math.cos(t)*w,cy+Math.sin(t)*h,z));}
 const o=BABYLON.MeshBuilder.CreateTube(name,{path,radius:r,tessellation:10,cap:BABYLON.Mesh.CAP_ALL},scene);
 o.material=material;return o;
}
function register(name,description,x,z,r=1.75,action=null){things.push({name,description,x,z,r,action});}
function createWorld(){
 engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:false,antialias:true});
 engine.setHardwareScalingLevel(Math.max(1,Math.min(1.6,(devicePixelRatio||1)/1.35)));
 scene=new BABYLON.Scene(engine);scene.clearColor=new BABYLON.Color4(.045,.056,.068,1);
 scene.fogMode=BABYLON.Scene.FOGMODE_EXP2;scene.fogDensity=.018;scene.fogColor=BABYLON.Color3.FromHexString('#232a2e');
 scene.environmentIntensity=.62;scene.imageProcessingConfiguration.toneMappingEnabled=true;scene.imageProcessingConfiguration.toneMappingType=BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
 camera=new BABYLON.UniversalCamera('Oliver camera',V(0,1.65,2.2),scene);
 camera.fov=1.10;camera.minZ=.045;camera.maxZ=85;camera.rotation.set(0,Math.PI,0);
 scene.activeCamera=camera;
 const hemi=new BABYLON.HemisphericLight('cold ambient',V(.2,1,.4),scene);
 hemi.intensity=.63;hemi.diffuse=BABYLON.Color3.FromHexString('#aebaca');hemi.groundColor=BABYLON.Color3.FromHexString('#343539');
 const fire=new BABYLON.PointLight('torch amber',V(4.0,3.1,3.7),scene);fire.intensity=10;fire.range=10;fire.diffuse=BABYLON.Color3.FromHexString('#ffb36b');
 const moon=new BABYLON.PointLight('cold moonlight',V(-4.9,3.9,3.7),scene);moon.intensity=7.5;moon.range=9;moon.diffuse=BABYLON.Color3.FromHexString('#7995b5');
 const bounce=new BABYLON.PointLight('corridor spill',V(0,2.6,-6.2),scene);bounce.intensity=7;bounce.range=11;bounce.diffuse=BABYLON.Color3.FromHexString('#e0a86d');
 scene.onBeforeRenderObservable.add(()=>{fire.intensity=10+Math.sin(performance.now()*.009)*.8+Math.sin(performance.now()*.017)*.7;});
 const stone=mat('limestone','#a1a4a0'),darkStone=mat('stone seams','#74756d'),floorMat=mat('worn slate','#a3a09a'),brick=mat('hand dressed limestone','#97938c');
 const wood=mat('old oak','#8e6a4b'),woodDark=mat('weathered oak','#604734'),iron=mat('black wrought iron','#596068',.68,.7),rust=mat('rusty steel','#88644d',.87,.45);
 const linen=mat('dirty wool','#b0a48e'),straw=mat('dry straw','#c7a36b'),cloth=mat('washed blanket','#58636b'),water=mat('drain darkness','#17272a',.21,.08);
 const grime=mat('wall shadow grime','#565953'),paper=mat('old parchment','#d2bd8e'),candle=mat('flame','#ffa33a',.6,0,'#ed7c29');
 stone.albedoTexture=texture('limestone stone','#a1a09c');darkStone.albedoTexture=texture('old shadowed stone','#62605b');floorMat.albedoTexture=texture('floor flagstone','#8d8980');
 brick.albedoTexture=texture('stone block','#a19b92');wood.albedoTexture=texture('wood grain','#88715b');
 woodDark.albedoTexture=texture('dark wood grain','#675344');linen.albedoTexture=texture('linen worn','#ada28e');
 // Main royal prison cell. Geometry retains its proportions while surface detail comes from textured masonry.
 box('stone pavement',0,-.22,0,12.5,.4,9.2,floorMat);
 box('vault ceiling',0,4.7,0,12.5,.48,9.2,darkStone);
 box('rear stone wall',0,2.2,4.55,12.5,4.8,.6,stone);
 // Side openings look into real adjacent cells, never into painted fake windows.
 for(const side of [-1,1]){
  const x=side*6.05;
  box('cell side lower masonry',x,.48,-.1,.55,1.0,9.3,stone);
  box('cell side upper masonry',x,3.83,-.1,.55,1.75,9.3,stone);
  for(const z of [-3.6,3.1]){
   sculpt('carved round stone pier',x,.15,z,[[.40,0],[.48,.16],[.35,.30],[.34,2.5],[.43,2.70],[.49,2.79]],stone,24);
  }
  for(let z=-2.12;z<=1.77;z+=.37)box('neighbor cell forged bars',x,2.18,z,.11,2.36,.08,iron);
  box('neighbor cell top rail',x,3.24,-.16,.12,.12,4.4,iron);
  box('neighbor cell bottom rail',x,1.12,-.16,.12,.12,4.4,iron);
  // The adjacent cell extends behind the bars and is illuminated separately.
  box('neighbor flagstone floor',side*8.48,-.17,-.04,4.8,.3,8.75,floorMat);
  box('neighbor back wall',side*10.73,2.2,-.16,.45,4.8,9.1,stone);
  box('neighbor end wall',side*8.43,2.2,4.30,4.8,4.8,.43,stone);
  // Each adjoining cell has its own barred doorway facing the main hall.
  box('neighbor entrance lintel',side*8.43,4.06,-4.6,4.8,1.06,.43,stone);
  box('neighbor entrance sill',side*8.43,.22,-4.6,4.8,.44,.43,darkStone);
  for(let index=0;index<10;index++){
   const bx=side*(6.25+index*.47);
   box('neighbor entrance prison bars',bx,2.18,-4.6,.075,3.5,.09,iron);
  }
  for(const y of [1.2,3.14])box('neighbor cell gate bracing',side*8.43,y,-4.5,4.66,.10,.16,iron);
  for(const bx of [side*6.06,side*10.66])box('neighbor entrance dressed stone',bx,2.18,-4.54,.35,3.70,.35,darkStone);
  box('neighbor swinging gate edge',side*8.6,2.1,-4.43,.18,3.5,.22,rust);
  box('neighbor iron lock',side*7.8,1.5,-4.3,.3,.33,.25,iron);
  box('neighbor ceiling',side*8.43,4.65,-.16,4.8,.3,9.1,darkStone);
  // Solid posts and bars are structural: the player cannot walk through them.
  solid.push({x:side*5.79,z:-3.6,w:.38,d:2.1},{x:side*5.79,z:3.1,w:.38,d:2.1});
  box('neighbor cot',side*8.58,.44,1.57,1.7,.31,2.8,woodDark);
  box('neighbor mattress',side*8.58,.69,1.57,1.46,.2,2.45,linen);
  box('neighbor blanket',side*8.58,.83,2.03,1.43,.06,1.25,cloth);
  // Imprisoned Aldemar chess piece, a silent PAWN in the left-hand cell.
  if(side===-1){
   const pawnMaterial=mat('prisoner weathered ivory','#9c9888',.91,.03);
   const pawnCollar=mat('prisoner worn metal','#716958',.85,.17);
   const px=-8.65,pz=-.85;
   const pawnMeshesStart=scene.meshes.length;
   cylinder('left cell pawn foot',px,.17,pz,.52,.24,pawnCollar,28);
   cylinder('left cell pawn beveled base',px,.35,pz,.43,.22,pawnMaterial,28);
   cylinder('left cell pawn body',px,.88,pz,.28,.97,pawnMaterial,30);
   cylinder('left cell pawn neck',px,1.36,pz,.23,.18,pawnCollar,26);
   sculpt('pawn sculpted ivory silhouette',px,.30,pz,[[.39,0],[.41,.13],[.29,.28],[.23,.67],[.31,1.03],[.23,1.19]],pawnMaterial,32);
   sphere('left prisoner pawn head',px,1.84,pz,.81,pawnMaterial);
   const eyeShade=mat('pawn face charcoal','#302e2c',1,0);
   const warmCheek=mat('pawn face blush','#87776b',1,0);
   for(const shift of [-.16,.16]){
    sphere('pawn expressive dark eye',px+.37,1.94,pz+shift,.105,eyeShade);
    const brow=box('pawn thoughtful eyebrow',px+.365,2.065,pz+shift,.045,.035,.17,warmCheek);
    brow.rotation.x=shift*1.2;
   }
   // A worried, exhausted prisoner: downturned corners, no cheerful grin.
   const smile=BABYLON.Curve3.CreateQuadraticBezier(V(px+.39,1.73,pz-.14),V(px+.423,1.78,pz),V(px+.39,1.73,pz+.14),9);
   const lips=BABYLON.MeshBuilder.CreateTube('pawn weary neutral mouth',{path:smile.getPoints(),radius:.012,tessellation:8},scene);
   lips.material=eyeShade;
   const cuffs=BABYLON.MeshBuilder.CreateTorus('left prisoner rusted neck ring',{diameter:.46,thickness:.05,tessellation:26},scene);
   cuffs.position.set(px,1.42,pz);cuffs.material=iron;
   box('left cell pawn dark chalk mark',px,2.35,4.13,.9,.12,.05,darkStone);
   const captive=new BABYLON.TransformNode('wandering prisoner root',scene);captive.position.set(px,0,pz);
   for(const m of scene.meshes.slice(pawnMeshesStart))if(m.name!=='left cell pawn dark chalk mark')m.setParent(captive);
   actors.push({root:captive,x:px,z:pz,range:.62,speed:.44,phase:1.3});
   register('Prisoner in the left cell','A lonely pawn from Aldemar sits in the next cell. They have been imprisoned since Edwin seized the throne.',-5.65,-.9,1.75);
  }
  const lit=new BABYLON.PointLight('dim neighboring cell',V(side*8.2,2.75,-1.5),scene);
  lit.intensity=3;lit.range=6;lit.diffuse=BABYLON.Color3.FromHexString('#caa478');
 }
 // Horizontal cross-gallery: the player sees cells stretching LEFT and RIGHT,
 // not an endless tunnel straight ahead. Only the near wing can be entered later.
 const hallInset=mat('distant doorway shadow','#3a3b3a'),heraldicBlue=mat('Aldemar banner navy','#394956',.92);
 const fadedGold=mat('faded royal embroidery','#ac8257',.82,.09);
 const softLeather=mat('aged prison leather','#655143',.9);
 box('horizontal gallery continuous flagstone floor',0,-.22,-8.1,79,.4,7.0,floorMat);
 box('horizontal gallery ceiling',0,4.7,-8.1,79,.42,7.0,darkStone);
 box('hall far wall textured stone',0,2.2,-11.73,79,4.8,.55,stone);
 for(const side of [-1,1]){
  box('horizontal gallery end wall',side*39.6,2.2,-8.10,.55,4.8,7.2,stone);
  // Cells on the near side of the hall appear behind heavy barred doorways.
  // A real brick surround is built for every bay, leaving a dark recess behind.
  for(let bay=0;bay<6;bay++){
   const x=side*(14.3+bay*4.4);
   box('near cell entrance dark recess',x,1.97,-4.66,3.12,3.4,.22,hallInset);
   box('near cell entrance lintel',x,3.94,-4.60,3.72,.95,.50,stone);
   box('near cell entrance sill',x,.22,-4.60,3.72,.42,.5,darkStone);
   for(const edge of [-1,1])box('near cell entrance stone jamb',x+edge*1.7,2.03,-4.61,.32,3.88,.55,darkStone);
   for(let j=0;j<7;j++)box('near cell gate iron rod',x-1.34+j*.45,2.06,-4.42,.07,3.43,.10,iron);
   for(const y of [1.24,3.16])box('near cell gate horizontal brace',x,y,-4.35,3.28,.10,.12,rust);
   box('near cell gate padlock',x+.68,1.59,-4.26,.26,.34,.18,rust);
  }
  // Cell doors on the far side of the gallery face Oliver's cell.
  for(let bay=0;bay<8;bay++){
   const x=side*(4.5+bay*4.45);
   box('far cell dark doorway',x,1.91,-11.39,3.05,3.37,.06,hallInset);
   box('far cell upper arch',x,3.9,-11.34,3.7,.76,.48,darkStone);
   for(const edge of [-1,1])box('far cell stone column',x+edge*1.69,2.05,-11.34,.31,3.96,.43,stone);
   for(let j=0;j<7;j++)box('far cell steel grille rod',x-1.30+j*.435,2.04,-11.19,.064,3.30,.11,iron);
   for(const y of [1.1,3.15])box('far cell steel crossbar',x,y,-11.1,3.19,.10,.12,rust);
   box('far cell iron keyplate',x+.76,1.50,-11.05,.24,.35,.14,iron);
   // A few restrained chess-piece silhouettes visible behind the grilles.
   if(bay%3===1){
    const pawnMat=bay%2?brick:darkStone;
    const distant=new BABYLON.TransformNode('distant animated inmate '+side+' '+bay,scene);
    distant.position.set(x,0,-11.60);
    const shell=sculpt('distant carved pawn silhouette',0,0,0,[[.29,.08],[.38,.18],[.31,.29],[.24,.45],[.18,.88],[.27,1.09],[.19,1.20]],pawnMat,16);
    shell.parent=distant;
    const head=sphere('distant prisoner head',0,1.54,0,.60,pawnMat);head.parent=distant;
    actors.push({root:distant,x,z:-11.60,range:.28,speed:.18+bay*.013,phase:bay+side});
   }
  }
 }
 // Columns, roof cross-beams and ceiling gas lamps repeat into the distance.
 for(let i=-9;i<=9;i++){
  const x=i*4.15;
  box('cross-gallery ceiling rib',x,4.40,-8.10,.40,.40,6.85,darkStone);
  box('cross-gallery far wall buttress',x,2.17,-11.18,.48,4.1,.43,darkStone);
  if(i%2===0){
   cylinder('cross-gallery lamp chain',x,3.90,-8.15,.055,.83,iron,10);
   sphere('cross-gallery amber lantern',x,3.34,-8.15,.29,candle);
   for(let j=0;j<4;j++){
    const theta=j*Math.PI/2;
    box('cross-gallery lantern cage',x+Math.cos(theta)*.20,3.32,-8.15+Math.sin(theta)*.20,.035,.52,.035,iron);
   }
  }
  if(i%4===0){
   const l=new BABYLON.PointLight('warm horizontal hall pool '+i,V(x,3.3,-8.15),scene);
   l.intensity=4.1;l.range=9.5;l.diffuse=BABYLON.Color3.FromHexString('#d7a374');
  }
 }
 // A royal banner in each wing acts as a visual landmark.
 for(const sign of [-1,1]){
  const x=sign*18.9;
  box('Aldemar pennant supporting rod',x,3.82,-11.04,1.32,.08,.21,iron);
  box('Aldemar historic cloth',x,2.93,-11.03,.98,1.48,.085,heraldicBlue);
  for(const edge of [-.44,.44])box('Aldemar banner frayed golden seam',x+edge,2.93,-10.97,.045,1.35,.025,fadedGold);
  const seal=BABYLON.MeshBuilder.CreateTorus('Aldemar faded heraldic seal',{diameter:.42,thickness:.055,tessellation:20},scene);
  seal.position.set(x,2.98,-10.91);seal.material=fadedGold;
 }
 // Two doors close the ends of the horizontal prison wing.
 for(const side of [-1,1]){
  const x=side*39.2;
  box('cross-gallery heavy end door',x,1.66,-8.1,.18,3.2,2.25,woodDark);
  for(const z of [-8.90,-8.5,-8.10,-7.7,-7.3])box('end door aged oak boards',x-side*.13,1.65,z,.045,3.0,.35,wood);
  for(const y of [.88,2.55])box('end door iron braces',x-side*.20,y,-8.10,.065,.12,2.20,iron);
 }
 // Deep navy-black drainage seams are flush to the floor, not raised shimmering meshes.
 for(const z of [-5.04,-10.9]){
  box('horizontal gallery drainage channel',0,-.006,z,77,.012,.042,water);
 }
 // Small, hand-made belongings add readable environmental storytelling.
 cylinder('prison rough water jug',4.64,.22,-.10,.26,.42,softLeather,18);
 cylinder('jug neck',4.64,.48,-.10,.11,.17,woodDark,16);
 const jugHandle=BABYLON.MeshBuilder.CreateTorus('water jug handle',{diameter:.28,thickness:.06,tessellation:16},scene);
 jugHandle.position.set(4.89,.30,-.10);jugHandle.rotation.y=Math.PI/2;jugHandle.material=softLeather;
 const bag=BABYLON.MeshBuilder.CreateSphere('worn satchel',{diameter:.66,segments:12},scene);
 bag.position.set(4.79,.26,.45);bag.scaling.set(1,.61,.48);bag.material=softLeather;
 const strap=BABYLON.MeshBuilder.CreateTorus('satchel strap',{diameter:.69,thickness:.04,tessellation:24},scene);
 strap.position.set(4.79,.45,.45);strap.rotation.x=Math.PI/2;strap.material=woodDark;
 // Sculpted stone arch and forged curved lintel give the central gate a clear silhouette.
 arch('carved Gothic doorway arch',0,3.30,-4.22,1.62,.70,stone,.155);
 arch('arched wrought iron reinforcing',0,3.25,-4.12,1.40,.57,iron,.052);
 for(const x of [-1.63,1.63]){
  sculpt('turned weathered door pilaster',x,.20,-4.40,[[.23,0],[.28,.12],[.20,.25],[.18,3.35],[.26,3.55]],darkStone,20);
 }
 // Cell front: substantial lintel, bottom plinth, two piers and individual forged bars.
 box('cell doorway top',0,4.04,-4.6,12.2,1.45,.62,stone);
 box('cell doorway footing',0,.24,-4.6,12.2,.48,.64,darkStone);
 for(let x=-6;x<=6.05;x+=.86){
  if(Math.abs(x)<1.58)continue; // preserve the central gate's visual silhouette
  box('iron prison bar',x,2.2,-4.57,.085,3.5,.085,iron);
  sphere('rivet',x,2.89,-4.48,.13,rust);
 }
 for(let y of [1.12,3.27])for(const side of [-1,1])
  box('forged crossbar',side*3.82,y,-4.49,4.36,.115,.13,iron);
 box('main gate frame left',-1.55,2.15,-4.42,.17,3.8,.18,rust);
 box('main gate frame right',1.55,2.15,-4.42,.17,3.8,.18,rust);
 // A readable heavy central gate: dark backing, two forged leaves, cross braces and lock.
 box('gate recessed dark iron backing',0,2.15,-4.405,3.08,3.42,.035,water);
 for(let i=0;i<11;i++)cylinder('hand forged round gate spindle',-1.32+i*.264,2.18,-4.15,.051,3.28,iron,12);
 for(const leaf of [-1,1]){
  for(let i=0;i<5;i++){
   const x=leaf*(.20+i*.265);
   box('gate heavy vertical iron slat',x,2.16,-4.33,.155,3.24,.10,iron);
  }
  for(const y of [1.17,2.16,3.14])box('gate leaf forged brace',leaf*.76,y,-4.245,1.36,.115,.12,rust);
 }
 box('gate locking crossbolt',.53,1.46,-4.17,1.64,.12,.18,iron);
 box('gate bolt handle',-.28,1.52,-4.06,.12,.23,.14,rust);
 // Architectural frame, riveted hinges and a heavy double-leaf gate.
 for(const x of [-1.58,1.58]){
  box('decorative gate stone post',x,2.13,-4.34,.33,3.82,.46,darkStone);
  for(const y of [1.12,2.15,3.25]){
   cylinder('gate forged hinge pin',x,y,-4.18,.11,.21,rust,12);
  }
 }
 box('gate central ornamental seam',0,2.18,-4.28,.065,3.5,.12,rust);
 for(const x of [-.95,.95])for(const y of [1.2,2.98])sphere('gate iron rivet',x,y,-4.21,.13,rust);
 box('gate lockbox',1.53,1.37,-4.11,.32,.35,.27,iron);
 cylinder('keyhole',1.53,1.36,-4.1,.037,.04,water);
 register('Locked cell gate','The iron gate is locked. Edwin ordered the guards never to let the real king leave.',0,-4.5,2.5);
 // Clean masonry lives only on actual walls. Previously, raised blocks extended
 // through the neighboring-cell openings and out into the corridor, appearing airborne.
 // Shallow recessed mortar lines provide depth without unstable overlapping geometry.
 const mortar=mat('deep recessed masonry mortar','#44433e',1);
 function masonryFace(axis,constant,start,end,y0,y1,outerSign=1){
  const course=.52,blockLength=1.10;
  for(let row=0; y0+(row+.5)*course<y1; row++){
   const y=y0+(row+.5)*course;
   const shift=(row%2)*blockLength/2;
   for(let p=start-shift;p<end;p+=blockLength){
    const a=Math.max(p,start),b=Math.min(p+blockLength,end);
    if(b-a<.12)continue;
    const midpoint=(a+b)/2;
    const seam=.025;
    if(axis==='z'){
     box('setback stone course',midpoint,y,constant+outerSign*.012,b-a-seam,course-.022,.018,brick);
     box('mortar bed',midpoint,y-course/2,constant+outerSign*.016,b-a,.014,.018,mortar);
    }else{
     box('setback stone course',constant+outerSign*.012,y,midpoint,.018,course-.022,b-a-seam,brick);
     box('mortar bed',constant+outerSign*.016,y-course/2,midpoint,.018,.014,b-a,mortar);
    }
   }
  }
 }
 // Back wall has an actual window; keep its opening clear of decorative relief.
 masonryFace('z',4.215,-5.92,-3.65,.12,4.31,-1);
 masonryFace('z',4.215,-1.22,5.92,.12,4.31,-1);
 masonryFace('z',4.215,-3.65,-1.22,.12,2.76,-1);
 masonryFace('z',4.215,-3.65,-1.22,4.09,4.31,-1);
 // Side masonry is continuous below/above each neighboring-cell opening.
 for(const x of [-5.75,5.75]){
  for(const [a,b] of [[-4.48,-2.4],[2.25,4.48]])masonryFace('x',x,a,b,.13,4.26,x<0?1:-1);
  masonryFace('x',x,-2.4,2.25,.13,.91,x<0?1:-1);
  masonryFace('x',x,-2.4,2.25,3.37,4.26,x<0?1:-1);
 }
 // The massive corridor far wall is flat: restrained recessed seams, not protruding bricks.
 for(let x=-38;x<39;x+=4.4){
  box('far wall vertical mortar recess',x,2.18,-11.43,.026,4.23,.016,mortar);
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
 // No translucent floor discs: they rendered as pale circular artefacts on some GPUs.
 // Stone wear remains baked into the textured masonry; no opaque white decals.
 // Inmate sleeping cot: wooden frame, slats, mattress, blanket.
 const cot=box('prison bunk',-3.65,.56,1.4,2.55,.22,4.18,woodDark,true);
 for(const z of [-.35,3.15])for(const x of [-4.7,-2.6])box('bedpost',x,.5,z,.13,1.04,.14,wood);
 box('mattress',-3.65,.73,1.42,2.19,.25,3.65,linen);
 box('threadbare blanket',-3.66,.89,2.14,2.17,.075,1.75,cloth);
 box('pillow',-3.65,.89,-.05,1.46,.15,.64,linen);
 for(let i=0;i<8;i++)box('bed joinery',-4.55+i*.25,.4,1.35,.12,.12,3.95,wood);
 register('Prison cot','A thin mattress and a worn wool blanket. This is how they treat their king.',-3.65,1.4,2.2);
 // Hand-built latrine: rounded stone pedestal, dark ceramic bowl and curved rim.
 sculpt('carved latrine pedestal',3.72,0,2.95,[[.52,.03],[.67,.10],[.74,.33],[.66,.54],[.72,.65]],darkStone,28);
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
 // The long gallery replaces the obsolete storeroom at the old corridor endpoint.
 // Extra guards' equipment in the corridor gives the scene a lived-in history.
 cylinder('discarded steel helmet',2.6,.15,-7.9,.27,.24,iron,16);
 box('guard duty ledger',2.1,.06,-7.4,.52,.075,.34,paper);
 box('guard dropped torch',-3.4,.10,-7.7,.09,.11,.85,wood);
 // Aldemar's guards are chess pieces. A dozing ROOK lies on the wooden guard bench.
 // All shapes are authored directly using Babylon meshes: no AI or generated-image assets.
 const rookStone=mat('rook armour ceramic','#6b7780',.83,.12);
 const rookShade=mat('rook inset slate','#36454f',.89,.08);
 const rookTrim=mat('rook brass trim','#aa8960',.53,.62);
 const gx=-1.45,gz=-6.56;
 box('sentry bench',gx,.40,gz,2.52,.15,1.07,woodDark,true);
 for(const bx of [gx-1.0,gx+1.0])for(const bz of [gz-.35,gz+.35]){
  cylinder('rounded bench leg',bx,.22,bz,.084,.43,wood,12);
 }
 // A reclining rook chess piece: turned pedestal, narrow stem, crenellated turret crown.
 guardRoot=new BABYLON.TransformNode('sleeping chess rook pivot',scene);
 guardRoot.position.set(gx,.76,gz);guardRoot.rotation.z=-Math.PI/2;
 const stack=(name,y,radius,height,material,edges=32)=>{
  const mesh=BABYLON.MeshBuilder.CreateCylinder(name,{diameter:radius*2,height,tessellation:edges},scene);
  mesh.parent=guardRoot;mesh.position.y=y;mesh.material=material;return mesh;
 };
 // Sculpted single-piece central body, following a chess-rook silhouette.
 const rookBody=sculpt('turned rook tower body',0,0,0,[[.43,0],[.44,.10],[.36,.22],[.29,.42],[.22,.70],[.31,.96],[.34,1.24],[.39,1.42],[.40,1.53]],rookStone,32);
 rookBody.parent=guardRoot;
 stack('rook foot outer lip',0,.44,.16,rookShade);
 stack('rook foot bevel',.14,.39,.15,rookTrim);
 stack('rook sturdy pedestal',.29,.32,.25,rookStone);
 stack('rook waist',.58,.22,.38,rookStone);
 stack('rook middle collar',.80,.29,.10,rookTrim);
 stack('rook tower shoulder',1.04,.33,.42,rookStone);
 stack('rook upper band',1.28,.36,.15,rookTrim);
 stack('rook parapet',1.47,.40,.24,rookStone);
 stack('rook hollow dark top',1.61,.30,.04,rookShade);
 for(let i=0;i<6;i++){
  const theta=i*Math.PI/3;
  const battlement=BABYLON.MeshBuilder.CreateBox('rook tower crenellation',{width:.21,height:.24,depth:.20},scene);
  battlement.material=rookStone;battlement.parent=guardRoot;
  battlement.position.set(Math.cos(theta)*.29,1.72,Math.sin(theta)*.29);
  battlement.rotation.y=-theta;
 }
 // Natural sleeping expression: two softly curved eyelids and a relaxed straight mouth.
 // Avoid exaggerated angled slits or raised eyebrows.
 const faceShade=mat('rook face ink','#24282a',1,0);
 for(const side of [-1,1]){
  const center=side*.145;
  const lidCurve=BABYLON.Curve3.CreateQuadraticBezier(
   V(center-.081,1.065,.357),V(center,1.041,.373),V(center+.081,1.065,.357),9);
  const lid=BABYLON.MeshBuilder.CreateTube('rook relaxed closed eyelid',
   {path:lidCurve.getPoints(),radius:.009,tessellation:8},scene);
  lid.parent=guardRoot;lid.material=faceShade;
 }
 const rookMouth=box('rook resting neutral mouth',0,.91,.366,.115,.012,.018,faceShade);
 rookMouth.parent=guardRoot;
 const insignia=BABYLON.MeshBuilder.CreateTorus('rook royal insignia',{diameter:.35,thickness:.045,tessellation:24},scene);
 insignia.parent=guardRoot;insignia.position.set(0,1.04,-.34);insignia.material=rookTrim;
 // ZZZ floats above the chess rook and always faces the first-person camera.
 const sleepTex=new BABYLON.DynamicTexture('sleeping rook ZZZ texture',{width:256,height:128},scene,true);
 sleepTex.hasAlpha=true;
 const sc=sleepTex.getContext();sc.clearRect(0,0,256,128);
 sc.font='bold 78px Georgia';sc.textAlign='center';sc.lineWidth=6;sc.strokeStyle='rgba(8,13,19,.8)';
 sc.strokeText('Z z z',128,92);sc.fillStyle='#edd4aa';sc.fillText('Z z z',128,92);sleepTex.update();
 const sleepMat=new BABYLON.StandardMaterial('floating ZZZ',scene);
 sleepMat.diffuseTexture=sleepTex;sleepMat.opacityTexture=sleepTex;
 sleepMat.useAlphaFromDiffuseTexture=true;sleepMat.backFaceCulling=false;
 sleepMat.disableLighting=true;sleepMat.emissiveColor=BABYLON.Color3.FromHexString('#d5b78c');
 sleepIndicator=BABYLON.MeshBuilder.CreatePlane('rook sleep ZZZ billboard',{width:1.35,height:.67,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
 sleepIndicator.position.set(gx-.62,2.16,gz);sleepIndicator.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;sleepIndicator.material=sleepMat;
 register('Sleeping rook guard','A rook guard is fast asleep. His tower-shaped helmet bears Edwin’s mark. Do not wake him.',-1.3,-4.46,2.35);
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
  sculpt('curved stave oak barrel',x,0,z,[[.31,.02],[.41,.12],[.43,.40],[.48,.67],[.44,.94],[.36,1.24]],woodDark,24);
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
 // Fix: wall-mounted torches stay clear of the cell doorway and gate collision.
 function torch(x,y,z){
  box('torch wall bracket',x,y-.35,z,.15,.28,.30,iron);
  const shaft=cylinder('carved wooden torch handle',x,y-.12,z-.18,.065,.74,wood,16);shaft.rotation.z=-.15;
  sculpt('forged torch bowl',x,y+.23,z-.18,[[.17,0],[.20,.07],[.11,.18]],iron,16);
  sculpt('sculpted tapered flame',x,y+.35,z-.18,[[.08,0],[.15,.12],[.11,.24],[.07,.40],[0,.51]],candle,16);
 }
 torch(4.0,2.8,3.97);torch(-4.2,2.75,-10.98);torch(4.95,2.75,-10.98);
 // View outside prison through barred rear window, moonlit glow.
 box('high stone window aperture',-2.45,3.45,4.22,1.85,1.12,.18,water);
 for(const x of [-2.95,-2.45,-1.95])box('window iron bars',x,3.48,4.085,.07,1.05,.12,iron);
 box('window stone sill',-2.45,2.82,4.0,2.18,.18,.58,stone);
 // Remove all floating pebble spheres; add restrained, dark worn masonry fragments instead.
 const rubbleMat=mat('aged small debris','#52514a');
 for(let i=0;i<9;i++){
  const x=-5.1+seed(i*43)*10.0,z=-3.6+seed(i*17)*7.1;
  if(Math.hypot(x+3.65,z-1.4)<2||Math.hypot(x-3.72,z-2.95)<1.75)continue;
  const o=BABYLON.MeshBuilder.CreatePolyhedron('tiny dark floor chip',{type:2,size:.08+seed(i+3)*.07},scene);
  o.position.set(x,.07,z);o.rotation.y=seed(i+6)*6.28;o.material=rubbleMat;
 }
 // Merge thousands of static masonry and paving blocks into a few draw calls.
 // Visual detail remains, but the GPU sees far fewer separate meshes.
 for(const category of ['setback stone course','mortar bed','repeated barred hall cell','near cell gate iron rod','far cell steel grille rod','cross-gallery ceiling rib']){
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
 if(open){
  keys.clear();touch.clear();ignorePointerExit=true;
  if(document.pointerLockElement===canvas)document.exitPointerLock?.();
 }else{
  ignorePointerExit=false;canvas.focus();
  // Returning from Escape is a keyboard user gesture: restore mouse capture immediately.
  try{const result=canvas.requestPointerLock?.();if(result?.catch)result.catch(()=>{});}catch(e){console.info('Click the game to recapture mouse',e);}
 }
}
function onCot(x,z){return x> -4.94&&x< -2.37&&z> -.72&&z<3.49;}
function collides(x,z){
 if(x< -5.20||x>5.20||z< -3.93||z>4.02)return true;
 const playerRadius=.31;
 for(const s of solid){
  if(Math.abs(x-s.x)<s.w/2+playerRadius&&Math.abs(z-s.z)<s.d/2+playerRadius){
   // Landing on the sleeping cot is permitted once the player jumps high enough.
   if(s.x===-3.65&&s.z===1.4&&jumpHeight>.77)continue;
   return true;
  }
 }
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
  if(jumpHeight>0||jumpVelocity>0){
   jumpVelocity-=15.2*dt;
   const nextHeight=jumpHeight+jumpVelocity*dt;
   const bedSurface=onCot(camera.position.x,camera.position.z)?.96:0;
   if(nextHeight<=bedSurface&&jumpVelocity<=0){jumpHeight=bedSurface;jumpVelocity=0;}
   else jumpHeight=Math.max(0,nextHeight);
  }
  if(walking||strafing)bob+=dt*(running?16:10);
  const sway=(walking||strafing)&&jumpHeight===0?Math.sin(bob)*.024:0;
  camera.position.y=1.66-.53*crouch+jumpHeight+sway;
  const t=candidates();$('prompt').hidden=!t;$('prompt').textContent=t?'[ E ] '+t.name:'';
 }
 const time=performance.now()*.001;
 if(sleepIndicator)sleepIndicator.position.y=2.16+Math.sin(time*1.3)*.09;
 guardRoot.scaling.y=1+Math.sin(time*1.7)*.012;
 if(active&&!paused&&!dialogue)for(const a of actors){
  const t=time*a.speed+a.phase;
  a.root.position.x=a.x+Math.sin(t)*a.range;
  a.root.position.z=a.z+Math.sin(t*.64)*.12;
  a.root.rotation.y=Math.cos(t)>0?-.15:.15;
  a.root.position.y=Math.sin(t*2)*.016;
 }
 scene.render();
}
function reset(){
 camera.position.set(0,1.66,2.2);camera.rotation.set(0,Math.PI,0);
 readCount=0;dialogue=false;paused=false;active=true;ignorePointerExit=false;jumpHeight=0;jumpVelocity=0;crouch=0;keys.clear();touch.clear();
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
 if(k===' '){if(!e.repeat&&active&&!paused&&!dialogue&&jumpVelocity===0&&crouch<.3&&(jumpHeight===0||onCot(camera.position.x,camera.position.z))){jumpVelocity=5.5;}return;}
 keys.add(k);
});
document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
document.addEventListener('blur',()=>keys.clear());
document.addEventListener('pointerlockchange',()=>{
 if(document.pointerLockElement!==canvas&&!ignorePointerExit&&active&&!paused&&!dialogue&&$('start').hidden&&$('story').hidden){pause(true);}
 if(document.pointerLockElement===canvas)ignorePointerExit=false;
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