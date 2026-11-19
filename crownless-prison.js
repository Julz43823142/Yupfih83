(()=>{
'use strict';
const $=id=>document.getElementById(id), canvas=$('view'), gate=$('gate');
let engine,scene,camera,active=false,paused=true,dialogue=false;
const keys=new Set(),touch=new Set(),things=[],solid=[];
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
function register(name,description,x,z,r=1.75,action=null){things.push({name,description,x,z,r,action});}
function createWorld(){
 engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:false,antialias:true});
 engine.setHardwareScalingLevel(Math.max(1,Math.min(1.6,(devicePixelRatio||1)/1.35)));
 scene=new BABYLON.Scene(engine);scene.clearColor=new BABYLON.Color4(.045,.056,.068,1);
 scene.fogMode=BABYLON.Scene.FOGMODE_EXP2;scene.fogDensity=.029;scene.fogColor=BABYLON.Color3.FromHexString('#151b20');
 scene.environmentIntensity=.42;
 camera=new BABYLON.UniversalCamera('Oliver camera',V(0,1.65,2.2),scene);
 camera.fov=1.10;camera.minZ=.045;camera.maxZ=85;camera.rotation.set(0,Math.PI,0);
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
  for(const z of [-3.6,3.1]){
   box('side arch pier',x,2.15,z,.57,2.75,2.4,darkStone);
   // Soft carved edge instead of a white featureless column.
   for(const y of [.86,3.43])box('pier stone cap',x,y,z,.64,.12,2.46,stone);
  }
  for(let z=-2.12;z<=1.77;z+=.37)box('neighbor cell forged bars',x,2.18,z,.11,2.36,.08,iron);
  box('neighbor cell top rail',x,3.24,-.16,.12,.12,4.4,iron);
  box('neighbor cell bottom rail',x,1.12,-.16,.12,.12,4.4,iron);
  // The adjacent cell extends behind the bars and is illuminated separately.
  box('neighbor flagstone floor',side*8.48,-.17,-.16,4.8,.3,9.0,floorMat);
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
   cylinder('left cell pawn foot',px,.17,pz,.52,.24,pawnCollar,28);
   cylinder('left cell pawn beveled base',px,.35,pz,.43,.22,pawnMaterial,28);
   cylinder('left cell pawn body',px,.88,pz,.28,.97,pawnMaterial,30);
   cylinder('left cell pawn neck',px,1.36,pz,.23,.18,pawnCollar,26);
   sphere('left prisoner pawn head',px,1.84,pz,.81,pawnMaterial);
   const cuffs=BABYLON.MeshBuilder.CreateTorus('left prisoner rusted neck ring',{diameter:.46,thickness:.05,tessellation:26},scene);
   cuffs.position.set(px,1.42,pz);cuffs.material=iron;
   box('left cell pawn dark chalk mark',px,2.35,4.13,.9,.12,.05,darkStone);
   register('Prisoner in the left cell','A lonely pawn from Aldemar sits in the next cell. They have been imprisoned since Edwin seized the throne.',-5.65,-.9,1.75);
  }
  const lit=new BABYLON.PointLight('dim neighboring cell',V(side*8.2,2.75,-1.5),scene);
  lit.intensity=3;lit.range=6;lit.diffuse=BABYLON.Color3.FromHexString('#caa478');
 }
 // A long central prison hallway with visible cells fading into atmospheric haze.
 const hallEnd=-38, hallLength=33.5, hallCenter=-21.15;
 box('long prison corridor flagstone floor',0,-.22,hallCenter,24.0,.4,hallLength,floorMat);
 box('long prison hall vaulted ceiling',0,4.7,hallCenter,24.0,.48,hallLength,darkStone);
 box('distant prison end wall',0,2.2,-38.18,24.0,4.8,.48,stone);
 const hallLeft=mat('hall rough stone','#96938a'),hallInset=mat('hall door shadow','#31393a');
 hallLeft.albedoTexture=stone.albedoTexture;
 // The corridor continues well beyond Oliver's cell; paired cells line its sides.
 for(const side of [-1,1]){
  box('outer prison hall wall',side*12.15,2.25,-22.2,.55,4.85,31.8,hallLeft);
  box('hall side upper vault edge',side*7.55,4.38,-22.1,8.7,.38,31.8,darkStone);
  // Keep the near entrances open to the adjoining cells.
  for(let bay=0;bay<5;bay++){
   const z=-11.5-bay*5.65;
   for(const [x,w] of [[side*7.7,3.0]]){
    box('hall cell door shadow',x,1.83,z,.06,3.3,3.28,hallInset);
    // A real barred gate framed in textured stone, not a flat wall.
    for(let j=0;j<7;j++){
     const bz=z-1.26+j*.42;
     box('repeated barred hall cell',x,2.13,bz,.11,3.23,.085,iron);
    }
    box('repeated hall gate upper rail',x,3.35,z,.13,.14,3.22,rust);
    box('repeated hall gate lower rail',x,1.1,z,.13,.14,3.22,rust);
    for(const zz of [z-1.65,z+1.65])box('distant cell stone doorway jamb',x,2.08,zz,.44,4.03,.39,stone);
    cylinder('old cell padlock',x,1.42,z+.90,.15,.23,rust,12);
   }
   box('hall buttress left',side*11.66,2.2,z-2.45,.52,4.43,.62,darkStone);
  }
 }
 for(let i=0;i<8;i++){
  const z=-8.6-i*3.8;
  box('prison corridor roof beam',0,4.4,z,23.1,.39,.46,darkStone);
 }
 // Repeated lanterns create a warm vanishing point without too many lights.
 for(let i=0;i<7;i++){
  const z=-10-i*3.7;
  cylinder('hall lantern iron hook',0,3.75,z,.06,.68,iron,8);
  sphere('hall lantern glazed housing',0,3.35,z,.27,mat('lantern amber glass '+i,'#b67b42',.4,.05,'#4b2407'));
  for(let a=0;a<4;a++){
   const angle=a*Math.PI/2;
   box('hall lantern framing',Math.cos(angle)*.17,3.3,z+Math.sin(angle)*.17,.04,.47,.04,iron);
  }
  if(i===0||i===3||i===6){
   const light=new BABYLON.PointLight('hall gas lamp '+i,V(0,3.2,z),scene);
   light.intensity=i===0?4:2.4;light.range=10;light.diffuse=BABYLON.Color3.FromHexString('#c89967');
  }
 }
 // Quiet narrative details, rendered as ordinary Babylon geometry.
 const heraldicBlue=mat('Aldemar banner navy','#394956',.92);
 const fadedGold=mat('faded royal embroidery','#ac8257',.82,.09);
 const softLeather=mat('aged prison leather','#655143',.9);
 for(const side of [-1,1]){
  for(let i=0;i<4;i++){
   const z=-10.2-i*7.1;
   // Hanging royal banners, made from slender flat meshes with visible trim.
   box('stone banner iron rod',side*11.84,3.60,z,.24,.07,1.23,iron);
   box('Aldemar hanging cloth',side*11.73,2.73,z,.09,1.58,.95,heraldicBlue);
   box('Aldemar banner gold edging',side*11.675,2.78,z-.43,.025,1.44,.045,fadedGold);
   box('Aldemar banner gold edging',side*11.675,2.78,z+.43,.025,1.44,.045,fadedGold);
   const medallion=BABYLON.MeshBuilder.CreateTorus('Aldemar royal seal on banner',{diameter:.38,thickness:.06,tessellation:18},scene);
   medallion.position.set(side*11.65,2.98,z);medallion.rotation.y=Math.PI/2;medallion.material=fadedGold;
  }
  // Distant inmate silhouettes: chess pawns and a bishop behind the cell bars.
  for(const [n,z] of [[0,-12],[1,-23.2],[2,-29.1]]){
   const px=side*9.0;
   const pieceMat=n===2?darkStone:brick;
   cylinder('distant chess pawn base',px,.19,z,.37,.23,pieceMat,18);
   cylinder('distant chess pawn column',px,.76,z,.24,.96,pieceMat,18);
   sphere('distant prisoner pawn crown',px,1.51,z,n===2?.76:.63,pieceMat);
   if(n===2){
    const spire=BABYLON.MeshBuilder.CreateCylinder('distant bishop chapel peak',{diameterTop:0,diameterBottom:.35,height:.44,tessellation:18},scene);
    spire.position.set(px,2.12,z);spire.material=pieceMat;
   }
  }
 }
 // The corner of Oliver's cell has a hook, a wooden cup and a leather satchel.
 cylinder('prison rough water jug',4.64,.22,-.10,.26,.42,softLeather,18);
 cylinder('jug neck',4.64,.48,-.10,.11,.17,woodDark,16);
 const jugHandle=BABYLON.MeshBuilder.CreateTorus('water jug handle',{diameter:.28,thickness:.06,tessellation:16},scene);
 jugHandle.position.set(4.89,.30,-.10);jugHandle.rotation.y=Math.PI/2;jugHandle.material=softLeather;
 const bag=BABYLON.MeshBuilder.CreateSphere('worn satchel',{diameter:.66,segments:12},scene);
 bag.position.set(4.79,.26,.45);bag.scaling.set(1,.61,.48);bag.material=softLeather;
 const strap=BABYLON.MeshBuilder.CreateTorus('satchel strap',{diameter:.69,thickness:.04,tessellation:24},scene);
 strap.position.set(4.79,.45,.45);strap.rotation.x=Math.PI/2;strap.material=woodDark;
 // Deep perspective: paired narrow floor drainage channels along the gallery.
 for(const side of [-1,1]){
  box('hall drainage groove',side*5.45,-.007,-20.5,.055,.014,31.0,water);
  for(let k=0;k<13;k++){
   box('drainage joint',side*5.45,.006,-6.5-k*2.35,.23,.021,.065,iron);
  }
 }
 // Door at the far end of the hall, inset between stone piers.
 box('distant prison hall exit',0,1.57,-37.82,2.15,3.1,.13,woodDark);
 for(const xx of [-.87,-.44,0,.44,.87])box('far door oak planks',xx,1.54,-37.7,.39,3.0,.06,wood);
 for(const yy of [.8,2.45])box('distant exit iron straps',0,yy,-37.62,2.1,.10,.13,iron);
 box('distant exit stone arch',0,3.43,-37.58,2.55,.48,.4,darkStone);
 
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
 // Wall masonry: uneven relief stones and mortar courses create visual texture.
 for(const side of ['rear','left','right','far']){
  for(let row=0;row<12;row++)for(let col=0;col<26;col++){
   const offset=(row%2)*.24,j=col+row*29,noise=seed(j*3+side.length);
   if(noise<.12)continue;
   let p;
   if(side==='rear'||side==='far'){
    const x=-5.9+col*.47+offset,y=.14+row*.37;
    if(side==='far')continue; // the original short-hall end was replaced by a long corridor
    p=box('irregular masonry stone',x,y,4.214,.43+noise*.04,.345,.045+noise*.06,brick);
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
 const guardRoot=new BABYLON.TransformNode('sleeping chess rook pivot',scene);
 guardRoot.position.set(gx,.76,gz);guardRoot.rotation.z=-Math.PI/2;
 const stack=(name,y,radius,height,material,edges=32)=>{
  const mesh=BABYLON.MeshBuilder.CreateCylinder(name,{diameter:radius*2,height,tessellation:edges},scene);
  mesh.parent=guardRoot;mesh.position.y=y;mesh.material=material;return mesh;
 };
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
 if(x< -5.61||x>5.61||z< -4.19||z>4.12)return true;
 const playerRadius=.24;
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
 if(sleepIndicator){const time=performance.now()*.001;sleepIndicator.position.y=2.16+Math.sin(time*1.3)*.09;}
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