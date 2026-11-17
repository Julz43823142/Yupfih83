(()=>{
'use strict';
const $=id=>document.getElementById(id);
const KEY='fallen-king-chapter-one-v2'; // Preserve existing chapter saves.
const steps=[
 {scene:'castle',title:'THE KINGDOM OF ALDEMAR',speaker:'Narrator',text:'King Oliver had ruled over the kingdom of Aldemar for many years.'},
 {scene:'bedroom',title:'A PEACEFUL NIGHT',speaker:'Narrator',text:'King Oliver slept peacefully, unaware of the darkness that awaited him.'},
 {scene:'approach',title:'THE STOLEN CROWN',speaker:'Narrator',text:'Edwin sneaks in and reaches for Oliver’s crown.'},
 {scene:'arrest',title:'THE FALSE KING',speaker:'Narrator',text:'Edwin, now posing as the king, orders the guards to arrest Oliver and lock him away, claiming that Oliver is a trespasser.'},
 {scene:'prison',title:'THE KING IMPRISONED',speaker:'Narrator',text:'Oliver was locked away, while Edwin took the throne.'}
];
// Placeholder stages only. Actual questions, answers and hints are intentionally deferred.
const puzzles={cell:{},sluice:{},lantern:{},monster:{},exit:{},watchChest:{},merrick:{},lumber:{},ropes:{},bridge:{}};

const freshChapter=()=>({scene:'intro',flags:{},coins:[],step:0,position:null});
let engine=null,baseWorld=null,scene='intro',chapter=freshChapter(),activePuzzle=null,storyHandlersBound=false,exitPromptArmed=true;
const complete=id=>!!chapter.flags[id];
function persist(){try{chapter.coins=[];if(engine&&scene!=='intro')chapter.position={...engine.getPlayer()};chapter.scene=scene;localStorage.setItem(KEY,JSON.stringify(chapter));}catch{}}
function restored(){try{const v=window.FallenKingSlotSession?(window.FallenKingPendingSave?.chapter||null):JSON.parse(localStorage.getItem(KEY)||'null');if(v&&['intro','cell','sewer','forest','watchtower','village','ridge','hill','ruins','observatory','skyglassInterior','finished'].includes(v.scene)&&v.flags&&Array.isArray(v.coins)){v.coins=[];if(!Number.isInteger(v.step)||v.step<0)v.step=0;return v;}}catch{}return freshChapter();}
function createWorld(width,height,kind){const rows=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>x===0||y===0||x===width-1||y===height-1?'H':kind));return {width,height,tiles:rows.map(a=>a.join('')),npcs:[],houses:[],collectibles:[],showcase:[],spawn:{x:3,y:5},version:baseWorld.version,music:'default'};}
function updateTile(w,x,y,v){const r=w.tiles[y].split('');r[x]=v;w.tiles[y]=r.join('');}
function cellWorld(){const w=createWorld(25,16,'H');
 // A continuous castle complex: guard corridor to the north, two flanking cells, Oliver's cell in the middle.
 for(let y=1;y<=13;y++)for(let x=1;x<=23;x++)updateTile(w,x,y,'s');
 for(let x=1;x<=23;x++)updateTile(w,x,5,'H'); // Locked northern cell fronts (visible iron bars).
 for(let y=5;y<=13;y++)for(const x of [6,18])updateTile(w,x,y,'H'); // Thick stone walls with narrow peephole windows.
 for(let x=1;x<=23;x++)updateTile(w,x,14,'H'); // South exterior wall and barred window.
 for(let x=1;x<=23;x++)updateTile(w,x,0,'H');
 for(let y=1;y<=14;y++){updateTile(w,0,y,'H');updateTile(w,24,y,'H');}
 // Guard has a bed in the northern passage; no direct passage through the cell bars.
 w.spawn={x:12,y:9};w.music='prison';return w;}

const sewerRoute=[[3,25],[6,25],[18,25],[18,10],[32,10],[32,38],[49,38],[49,13],[64,13],[64,25],[76,25]];
function sewerWorld(){
 // Five-tile-wide stone passages in an expanded winding underground maze.
 const w=createWorld(84,53,'H'),radius=2;
 function hall(x0,z0,x1,z1){
  const dx=Math.sign(x1-x0),dz=Math.sign(z1-z0);
  for(let x=x0,z=z0;;x+=dx,z+=dz){
   for(let oz=-radius;oz<=radius;oz++)for(let ox=-radius;ox<=radius;ox++)
    if(x+ox>0&&x+ox<w.width-1&&z+oz>0&&z+oz<w.height-1)updateTile(w,x+ox,z+oz,'s');
   if(x===x1&&z===z1)break;
  }
 }
 for(let i=1;i<sewerRoute.length;i++)hall(...sewerRoute[i-1],...sewerRoute[i]);
 // One continuous water network branches off through every dead-end passage.
 const branches=[[[5,25],[5,39]],[[12,25],[12,17]],[[18,12],[23,12]],
 [[24,10],[24,4]],[[32,17],[41,17]],[[32,31],[23,31]],
 [[40,38],[40,46]],[[49,28],[56,28]],[[56,13],[56,5]],
 [[64,18],[73,18]],[[70,25],[70,36]],[[49,36],[56,36]]];
 for(const [start,end] of branches)hall(...start,...end);
 w.streamTiles=new Uint8Array(w.width*w.height);
 for(const route of [sewerRoute,...branches]){
  for(let i=1;i<route.length;i++){
   const [sx,sz]=route[i-1],[ex,ez]=route[i],dx=Math.sign(ex-sx),dz=Math.sign(ez-sz);
   const flow=dx>0?1:dx<0?2:dz>0?3:4;
   for(let x=sx,z=sz;;x+=dx,z+=dz){
    w.streamTiles[z*w.width+x]=flow;
    if(x===ex&&z===ez)break;
   }
  }
 }
 // Remove unrelated water pockets against walls; the only stream is the centre line.
 // Open corridors throughout: there are NO puzzles or blocked floodgates before the creature and the exit.
 // The sewer creatures have physical presence; Oliver can still interact from beside them.
 w.blockers=[[49,38],[23,31],[40,45],[41,45]];
 w.spawn={x:6,y:25};w.music='sewer';return w;
}
function forestWorld(){
 // The path is a guide, not a fence: soft grassy ground is freely walkable.
 // Only the outer rows of dense old trees and small tree clusters are solid.
 const w=createWorld(36,23,'.');
 for(let y=1;y<22;y++)for(let x=1;x<35;x++){
  const forestEdge=x<=2||x>=33||y<=1||y>=20;
  if(forestEdge)updateTile(w,x,y,'T');
 }
 const carve=(a,b,c,d)=>{let x=a,z=b;const dx=Math.sign(c-a),dz=Math.sign(d-b);while(true){for(const ox of [0,1])for(const oz of [0,1])updateTile(w,x+ox,z+oz,'p');if(x===c&&z===d)break;x+=dx;z+=dz;}};
 const route=[[2,10],[8,10],[8,6],[16,6],[16,12],[25,12],[25,8],[33,8]];
 for(let i=1;i<route.length;i++)carve(...route[i-1],...route[i]);
 // Widely separated trees create landmarks without trapping Oliver on the road.
 for(const [x,y] of [[6,4],[13,14],[20,4],[28,14]]){
  for(const [dx,dz] of [[0,0],[1,0],[0,1]])if(w.tiles[y+dz]?.[x+dx]==='.')updateTile(w,x+dx,y+dz,'T');
 }
 for(const [x,y] of [[5,13],[13,4],[19,15],[28,5]])for(let dz=0;dz<2;dz++)for(let dx=0;dx<2;dx++)
  if(w.tiles[y+dz]?.[x+dx]==='.')updateTile(w,x+dx,y+dz,'p');
 // The larger northern forest clearing gives the tower a distinct footprint.
 // No prototype or statue displays remain on the playable forest map.
 for(let y=2;y<=9;y++)for(let x=22;x<=31;x++)if(w.tiles[y]?.[x]==='T')updateTile(w,x,y,'.');
 // Solid watchtower footprint, moved north; its south-facing door is the only entrance.
 for(let y=3;y<=7;y++)for(let x=25;x<=29;x++)updateTile(w,x,y,'H');
 updateTile(w,27,7,'D');
 for(let y=8;y<=12;y++)for(let x=26;x<=28;x++)updateTile(w,x,y,'p');
 // Gate is farther east, spanning four path tiles with two-tile passage width.
 for(let y=2;y<=19;y++)for(let x=32;x<=33;x++)updateTile(w,x,y,'T');
 for(let y=7;y<=10;y++)for(let x=31;x<=33;x++)updateTile(w,x,y,'p');
 // Keep the old footpath walkable without placing any display pedestals.
 for(let x=11;x<=23;x++)for(let y=8;y<=12;y++)updateTile(w,x,y,'p');
 w.signs=[{x:9,y:13,text:'Willowmere Village East'}];
 w.blockerRects=[{x:9.5,z:13.5,w:2.2,d:.30},{x:30.2,z:12.9,w:.6,d:.5},...[[5.5,13.2],[10.5,9.8],[19.4,14.8],[29.3,11.0]].map(([x,z])=>({x,z,w:.28,d:.28})),...[[24.6,8.4],[30.5,8.4]].map(([x,z])=>({x,z,w:.36,d:.36}))];
 w.spawn={x:4,y:12};w.music='willowmere';
 w.npcs=[
  {id:'forest-traveller',name:'Travelling Bishop',x:13,y:7,piece:'B',color:'white',lines:['A king? In these muddy woods? You must be joking.','Take the eastern path if you are looking for Willowmere.']},
  {id:'forest-woodcutter',name:'Old Woodcutter',x:21,y:13,piece:'R',color:'black',lines:['King Oliver? I have seen the king in the castle, stranger.','Follow the lanterns. Willowmere is not far.']}
 ];
 w.npcs.push({id:'watch-keeper',name:'Gatekeeper Rowan',x:24,y:9,piece:'R',color:'white',lines:['The key is inside the watchtower. Enter through the door.']},{id:'watch-scout',name:'Watchpost Scout',x:30,y:11,piece:'P',color:'green',lines:['Ask Rowan about the gate.']});return w;}
function watchtowerWorld(){
 // Dedicated large interior, invisible until Oliver enters through the exterior door.
 const w=createWorld(17,14,'s');
 for(let x=1;x<16;x++){updateTile(w,x,1,'H');updateTile(w,x,12,'H');}
 for(let y=1;y<=12;y++){updateTile(w,1,y,'H');updateTile(w,15,y,'H');}
 updateTile(w,8,12,'D');
 // The keeper is a solid, interactive rook; crates and the chest cannot be walked through.
 w.npcs=[{id:'watchtower-keeper',name:'Tower Keeper',x:5,y:6,piece:'R',color:'white',lines:['The barrier key is locked in that chest.','I cannot open it: I do not know the code. Perhaps you can solve the lock.']}];
 w.blockers=[[8,4],[3,6],[4,6],[13,6],[14,6],[3,10],[4,10],[5,10],[13,10],[14,10],[12,9],[13,9]];
 // Solid footprint of the large chest and long side crates, not just their centres.
 w.blockerRects=[{x:8.5,z:4.5,w:2.65,d:1.7},{x:3.7,z:6.0,w:1.4,d:2.2},
 {x:13.2,z:6.0,w:1.4,d:2.2},{x:3.9,z:10.0,w:3.5,d:1.5},
 {x:13.4,z:10.0,w:2.6,d:1.4}];
 w.spawn={x:8,y:10};w.music='willowmere';
 return w;
}
// Physical footprints of the substantial village scenery. Small grass blades
// remain walkable; pots, barrels, carts, torches, stalls and crates do not.
function villageDecorCollisions(w){
 const rect=(x,z,width,depth)=>({x,z,w:width,d:depth});
 const solid=[
  rect(31.3,28.9,2.15,1.28),rect(27.3,27.1,1.65,1.65),
  rect(37.3,28.6,1.55,.28),rect(34.6,28.8,.68,.68),
  ...[[23.5,24.4],[32.7,24.4],[30.7,33.2]].map(([x,z])=>rect(x,z,2.1,1.65)),
  ...[[20.4,25.8],[34.5,25.6],[24.1,35.0],[32.8,34.1]].map(([x,z])=>rect(x,z,1.20,.5)),
  ...[[19.8,32.0],[35.7,31.5],[22.2,22.4]].map(([x,z])=>rect(x,z,.70,.70)),
  ...[[14.5,27.4],[35.8,35.5],[39.0,24.7],[40.8,17.3],[41.3,17.7]].map(([x,z])=>rect(x,z,.65,.65)),
  ...[[21.2,29.8],[33.8,28.8],[29.2,20.7],[42.5,18],[49.3,18]].map(([x,z])=>rect(x,z,.28,.28)),
  ...[[41.8,21.4],[19.5,22.5],[41.7,18.2],[41.9,20.1]].map(([x,z])=>rect(x,z,.9,.52))
 ];
 // Keep existing engine/world blockers, and preserve the bridge centreline.
 w.blockerRects=[...(w.blockerRects||[]),...solid];
}
function villageWorld(){
 const w={...baseWorld,tiles:[...baseWorld.tiles],npcs:baseWorld.npcs.filter(n=>n.id!=='pip').map(n=>({...n,lines:[...n.lines]}))};
 for(let y=2;y<=37;y++)for(let x=45;x<=47;x++)updateTile(w,x,y,'w');
 for(let x=41;x<=49;x++)if(x<45||x>47)updateTile(w,x,19,'p');
 if(complete('bridge'))for(let x=45;x<=47;x++)updateTile(w,x,19,'p');
 // The visible eastbound road continues through the former forest border, not into a wall.
 for(let x=48;x<w.width;x++)for(const y of [18,19,20])updateTile(w,x,y,'p');
 w.spawn={x:26,y:29};
 // The six older statue display pieces are retired from Willowmere.
 w.showcase=[];
 // Remove each retired showcase pedestal AND its X collision tile.
 for(const p of baseWorld.showcase||[]){
  updateTile(w,p.x,p.y,'p');
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
   const x=p.x+dx,y=p.y+dz;
   if(w.tiles[y]?.[x]==='g'||w.tiles[y]?.[x]==='f')updateTile(w,x,y,'p');
  }
 }
 // Open a small natural access to the pond without clearing the entire woodland.
 for(const [x,y] of [[6,9],[7,9],[8,9],[9,9],[10,9],[7,10],[8,10],[9,10]])if(w.tiles[y]?.[x]==='T')updateTile(w,x,y,'.');
 // Decor collision matches the visible physical meshes, not arbitrary tiles.
 w.blockers=[];villageDecorCollisions(w);
 return w;
}
// Chapter Two: the woodland crossroads, ancient ruins and medieval Skyglass Abbey.
// Separate world layouts and quest flags preserve all Chapter One scenes and save slots.
// The woods beyond Willowmere are a free-roaming crossroads: north cave,
// south ruins, east Skyglass hill road, west back across the repaired bridge.
function carveRoad(w,route,radius=2){
 for(let i=1;i<route.length;i++){
  let [x,y]=route[i-1];const [tx,ty]=route[i];
  for(;;){
   for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
    const xx=x+dx,yy=y+dz;
    if(xx>0&&yy>0&&xx<w.width-1&&yy<w.height-1)updateTile(w,xx,yy,'p');
   }
   if(x===tx&&y===ty)break;
   x+=Math.sign(tx-x);y+=Math.sign(ty-y);
  }
 }
}
function ridgeWorld(){
 const w=createWorld(45,41,'.');
 // First a gentle forest walk, then the three-way fork.
 carveRoad(w,[[1,20],[7,20],[11,19],[16,19]],2);
 carveRoad(w,[[16,19],[16,13],[20,13],[20,4]],2);
 carveRoad(w,[[16,19],[15,26],[11,26],[11,39]],2);
 carveRoad(w,[[16,19],[23,19],[28,20],[35,20],[43,20]],2);
 for(let y=1;y<40;y++)for(let x=1;x<44;x++){
  if(w.tiles[y][x]==='.'&&(x<=2||x>=42||y<=2||y>=38||(x*17+y*11)%13===0))updateTile(w,x,y,'T');
 }
 // Forest gates stay navigable, including both sides of the road.
 for(let x=1;x<=6;x++)for(let y=18;y<=22;y++)updateTile(w,x,y,'p');
 for(let x=40;x<=44;x++)for(let y=18;y<=22;y++)updateTile(w,x,y,'p');
 for(let x=17;x<=23;x++)for(let y=1;y<=5;y++)updateTile(w,x,y,'p');
 for(let x=8;x<=14;x++)for(let y=36;y<=40;y++)updateTile(w,x,y,'p');
 // Impassable rubble at the cave mouth. A later story item may clear it.
 for(let y=3;y<=5;y++)for(let x=18;x<=22;x++)updateTile(w,x,y,'X');
 w.spawn={x:4,y:20};w.music='willowmere';
 w.npcs=[
  {id:'fork-traveller',name:'Mira the Pilgrim',x:9,y:23,piece:'B',color:'purple',lines:['The Willowmere bridge is open again? Wonderful!','At the fork, north lies a cave, south the old ruins, and east the road to Skyglass Abbey.']},
  {id:'fork-merchant',name:'Holloway',x:25,y:23,piece:'P',color:'green',lines:['The ruins below the forest are open to explorers.','They say the observatory above the hill holds a record Edwin wants destroyed.']},
  {id:'fork-cartographer',name:'Cartographer Elin',x:17,y:16,piece:'N',color:'blue',lines:['North: Hidden Cave. East: Skyglass Abbey. South: Old Ruins.','I tried exploring the northern path, but the stones are impossible to pass.']}
 ];
 w.blockerRects=[{x:17.5,z:21,w:.30,d:.30},{x:28.5,z:17.4,w:.6,d:.55}];
 return w;
}
function hillWorld(){
 const w=createWorld(46,36,'.');
 const trail=[[1,29],[9,29],[9,24],[18,24],[18,17],[29,17],[29,10],[38,10],[38,5],[43,5]];
 carveRoad(w,trail,2);
 for(let y=1;y<35;y++)for(let x=1;x<45;x++)
  if(w.tiles[y][x]==='.'&&(x<=2||x>=43||y<=2||y>=33||(x*7+y*13)%15===0))updateTile(w,x,y,'T');
 for(let x=1;x<=5;x++)for(let y=27;y<=32;y++)updateTile(w,x,y,'p');
 for(let x=40;x<=45;x++)for(let y=3;y<=8;y++)updateTile(w,x,y,'p');
 w.spawn={x:3,y:29};w.music='willowmere';
 w.npcs=[
  {id:'hill-hiker',name:'Pilgrim Corin',x:15,y:27,piece:'B',color:'white',lines:['The mountain path is steep, but Skyglass is worth the climb.','From the upper terrace you can see all the way to Willowmere.']},
  {id:'hill-keeper',name:'Lantern Keeper Ida',x:34,y:13,piece:'P',color:'orange',lines:['The ancient abbey stands beyond the last bend.','Follow the blue lanterns. The curators are expecting visitors again.']}
 ];
 w.blockerRects=[{x:24.5,z:22.5,w:.70,d:.70},...[[13,20],[23,26],[34,17]].map(([x,z])=>({x,z,w:1.0,d:.9}))];
 return w;
}
function ruinsWorld(){
 const w=createWorld(36,32,'.');
 for(let y=1;y<31;y++)for(let x=1;x<35;x++)if(x<=2||x>=33||y<=2||y>=29)updateTile(w,x,y,'T');
 carveRoad(w,[[18,2],[18,9],[17,17],[17,25]],3);
 for(let y=8;y<=26;y++)for(let x=7;x<=28;x++)if(w.tiles[y][x]==='.')updateTile(w,x,y,'s');
 for(let x=14;x<=22;x++)for(let y=1;y<=5;y++)updateTile(w,x,y,'p');
 // Fallen walls stand off the main aisle, with open gates on every side.
 for(let x=7;x<=12;x++)updateTile(w,x,12,'H');
 for(let x=23;x<=28;x++)updateTile(w,x,12,'H');
 for(let x=7;x<=12;x++)updateTile(w,x,24,'H');
 for(let x=23;x<=28;x++)updateTile(w,x,24,'H');
 w.spawn={x:18,y:4};w.music='willowmere';
 w.npcs=[
  {id:'ruins-scholar',name:'Scholar Vela',x:21,y:19,piece:'B',color:'green',lines:['This sanctuary predates the kingdom of Aldemar.','Look at the weathered engravings. Someone scratched a crown into the stone long ago.']},
  {id:'ruins-wanderer',name:'Wandering Knight',x:12,y:20,piece:'N',color:'white',lines:['Most travellers hurry to Skyglass. I prefer places that remember the past.','There may be more to these ruins than we can see today.']}
 ];
 w.blockerRects=[{x:18,z:18,w:3.0,d:3.2},...[[10,9],[14,8],[22,8],[26,9],[8,17],[28,17],[10,26],[26,26]].map(([x,z])=>({x,z,w:1.1,d:1.1})),{x:18,z:24,w:2.2,d:1.8},{x:10,z:17,w:1.5,d:1.3},{x:26,z:17,w:1.5,d:1.3},...[[8,12],[12,12],[24,12],[28,12],[8,24],[12,24],[24,24],[28,24],[10,17],[26,17],[7,13],[28,13],[7,21],[28,21]].map(([x,z])=>({x,z,w:.72,d:.72}))];
 return w;
}
function observatoryWorld(){
 // Outside view: a medieval stone abbey with an oak door, chapel, bell tower and scholarly courtyard.
 const w=createWorld(36,30,'.');
 for(let y=1;y<29;y++)for(let x=1;x<35;x++)if(x<=2||x>=33||y<=2||y>=27)updateTile(w,x,y,'T');
 carveRoad(w,[[17,28],[17,19],[17,16]],3);
 for(let y=5;y<=16;y++)for(let x=9;x<=25;x++)updateTile(w,x,y,'H');
 for(let x=15;x<=19;x++)for(let y=17;y<=19;y++)updateTile(w,x,y,'p');
 // Exterior door is visible and accessible through the front steps.
 updateTile(w,17,16,'D');
 w.spawn={x:17,y:25};w.music='willowmere';
 w.npcs=[{id:'skyglass-greeter',name:'Skyglass Caretaker',x:24,y:20,piece:'B',color:'white',lines:['Welcome to Skyglass Abbey. Its scholars have watched the heavens for generations.','Enter through the great oak door. The library and star hall are within.']}];
 return w;
}
function skyglassInteriorWorld(){
 const w=createWorld(60,52,'.');
 for(let y=1;y<51;y++)for(let x=1;x<59;x++)if(x<=2||x>=57||y<=2||y>=49)updateTile(w,x,y,'H');
 // Abbey interior: timber and stone scriptorium with a clear central aisle.
 for(let y=7;y<=45;y++)for(let x=8;x<=51;x++)
  if(((x-30)/24)**2+((y-27)/22)**2<1.1)updateTile(w,x,y,'p');
 for(let y=12;y<=40;y++)for(let x=14;x<=46;x++)
  if(((x-30)/18)**2+((y-27)/17)**2<1)updateTile(w,x,y,'s');
 for(let x=26;x<=34;x++)for(let y=41;y<=51;y++)updateTile(w,x,y,'p');
 for(let x=25;x<=35;x++)for(let y=7;y<=16;y++)updateTile(w,x,y,'s');
 w.spawn={x:30,y:46};w.music='willowmere';
 w.npcs=[
  {id:'skyglass-curator',name:'Abbess Sable',x:25,y:25,piece:'B',color:'white',lines:['Welcome to the Abbey of Skyglass, refuge of the royal chroniclers.','Edwin demanded every record of the royal seal. One royal ledger survived in the northern scriptorium.']},
  {id:'skyglass-mechanic',name:'Brother Orin',x:42,y:29,piece:'R',color:'orange',lines:['You opened the Willowmere bridge? We can finally receive supplies again.','The abbey scribes studied the heavens with ancient charts, not machines.']},
  {id:'skyglass-apprentice',name:'Novice Faye',x:17,y:35,piece:'P',color:'blue',lines:['The abbey library holds the oldest sky charts in Aldemar!','The royal ledger rests in the northern scriptorium.']},
  {id:'skyglass-archivist',name:'Scribe Noa',x:36,y:16,piece:'B',color:'purple',lines:['The old manuscripts record the stars, but the royal books reveal the throne.','Look for the forged mark in the coronation ledger.']}
 ];
 w.blockerRects=[{x:30,z:11.2,w:4.9,d:2.5},{x:30,z:29,w:2.1,d:1.6},...[[19,18],[41,18],[19,29],[41,29],[19,39],[41,39],[14,13],[14,21],[14,31],[14,39],[46,13],[46,21],[46,31],[46,39]].map(([x,z])=>({x,z,w:.88,d:.88}))];
 return w;
}
function setScene(next,position){scene=next;const w=next==='cell'?cellWorld():next==='sewer'?sewerWorld():next==='forest'?forestWorld():next==='watchtower'?watchtowerWorld():next==='ridge'?ridgeWorld():next==='hill'?hillWorld():next==='ruins'?ruinsWorld():next==='observatory'?observatoryWorld():next==='skyglassInterior'?skyglassInteriorWorld():villageWorld();const requested=position||({...w.spawn,facing:'down'});const safe=w.tiles[Math.round(requested.y)]?.[Math.round(requested.x)];const pos=safe&&!['H','w','T','F','X'].includes(safe)?requested:{...w.spawn,facing:'right'};engine.setWorld(w,pos);chapter.scene=scene;persist();updateObjective();$('fallen-story-hintcoins').textContent='Hint coins: 0';}
function teleport(destination){
 if(!engine||!['cell','sewer','forest','village','ridge','hill','ruins','observatory','skyglassInterior'].includes(destination))return;
 activePuzzle=null;exitPromptArmed=true;
 for(const id of ['fallen-story-intro','fallen-story-puzzle','fallen-story-chapter-confirm','fallen-pause','fallen-map','fallen-wardrobe']){const el=$(id);if(el)el.hidden=true;}
 setScene(destination,destination==='cell'?{x:12,y:9,facing:'right'}:destination==='sewer'?{x:6,y:25,facing:'right'}:destination==='forest'?{x:17,y:13,facing:'up'}:destination==='ridge'?{x:4,y:20,facing:'right'}:destination==='hill'?{x:3,y:29,facing:'right'}:destination==='ruins'?{x:18,y:4,facing:'down'}:destination==='observatory'?{x:17,y:25,facing:'up'}:destination==='skyglassInterior'?{x:30,y:46,facing:'up'}:{x:26,y:29,facing:'down'});
 engine.resumeGameplay?.();
 document.getElementById('fallen-canvas')?.focus({preventScroll:true});
}
function say(name,...lines){engine.say(name,lines);}
function objective(){
 if(scene==='cell')return complete('cell')?'The drain is open. Press E at the toilet to escape.':complete('inspectedToilet')?'Find the mechanism beneath the toilet. Press E to examine it.':'Find a way out of the prison cell.';
 if(scene==='sewer')return !complete('exit')?'Find the sewer exit.':'Escape into the forest (E).';
 if(scene==='forest')return complete('watchChest')?'Pass the open barrier into Willowmere.':'Enter the watchtower (E) and unlock the gate.';
 if(scene==='watchtower')return complete('watchChest')?'Leave the watchtower through the south door.':'Examine the chest inside the watchtower (E).';
 if(scene==='ridge')return 'Chapter Two: Follow the woodland crossroads to the cave, Skyglass Hill or old ruins.';
 if(scene==='hill')return 'Follow the winding hillside path to Skyglass Abbey.';
 if(scene==='ruins')return complete('ruinInscription')?'Explore the old sanctuary or return north to the forest fork.':'Explore the old ruins and examine the engraved altar (E).';
 if(scene==='observatory')return 'Skyglass Abbey: approach the great oak door and press E to enter.';
 if(scene==='skyglassInterior')return complete('skyglassLedger')?'The royal seal was forged. Explore the abbey scriptorium.':'Examine the royal ledger in the northern scriptorium (E).';
 if(!complete('bridge'))return 'Press E at the east bridge to repair it and reopen the road.';
 return 'Cross the repaired bridge and continue east to begin Chapter Two.';
}
function updateObjective(){const o=$('fallen-story-objective'),h=$('fallen-pause-title');if(o&&h&&o.parentNode!==h.parentNode){h.parentNode.insertBefore(o,h);o.style.cssText='display:block;position:static;margin:0 auto 12px;padding:10px;border:1px solid #a49270;border-radius:6px;background:#202632;color:#e8d7ae;text-align:center;font-size:14px';}if(o){o.textContent='Objective: '+objective();o.hidden=scene==='intro';}const d=$('fallen-story-interact');if(d)d.hidden=true;}
function start(api){
 engine=api;
 // The original village map stays the base world even on subsequent New Game starts.
 if(!baseWorld)baseWorld=api.getWorld();
 activePuzzle=null;
 for(const id of ['fallen-story-intro','fallen-story-puzzle','fallen-pause','fallen-map','fallen-wardrobe']){const el=$(id);if(el)el.hidden=true;}
 chapter=window.FallenKingSlotSession&&!window.FallenKingPendingSave?freshChapter():restored();
 if(!chapter.flags||typeof chapter.flags!=='object')chapter.flags={};
 if(!Array.isArray(chapter.coins))chapter.coins=[];
 if(chapter.scene==='intro'){
  // A completed or corrupted intro checkpoint must not strand a new game in the old cutscene.
  chapter.step=Number.isInteger(chapter.step)&&chapter.step>=0&&chapter.step<steps.length?chapter.step:0;
  scene='intro';showIntro();
 }else{
  setScene(chapter.scene==='finished'?'village':chapter.scene,chapter.position);
  $('fallen-story-intro').hidden=true;
 }
 // Bind only once. Previously every New Game registered another click and key handler,
 // so one key press could advance several intro panels and trap the cutscene.
 if(!storyHandlersBound){
  storyHandlersBound=true;
  document.querySelectorAll?.('[data-fallen-jump]')?.forEach(b=>b.addEventListener('click',()=>teleport(b.dataset.fallenJump)));
  document.addEventListener('keydown',onKey,true);
  $('fallen-story-next').addEventListener('click',nextIntro);
  $('fallen-story-skip')?.addEventListener('click',()=>{
   finishIntroduction();
  });
  $('fallen-story-art').addEventListener('click',nextIntro);
  $('fallen-story-puzzle-continue').addEventListener('click',continuePuzzle);
  $('fallen-story-puzzle-close').addEventListener('click',closePuzzle);
  $('fallen-story-chapter-yes')?.addEventListener('click',advanceChapterTwo);
  $('fallen-story-chapter-no')?.addEventListener('click',cancelChapterTwo);
  $('fallen-story-restart').addEventListener('click',()=>{if(confirm('Restart Chapter One from the introduction?')){localStorage.removeItem(KEY);location.reload();}});
 }
 updateObjective();
}
function finishIntroduction(){
 if(!engine)return;
 activePuzzle=null;
 chapter.step=steps.length;
 $('fallen-story-intro').hidden=true;
 $('fallen-story-puzzle').hidden=true;
 setScene('cell',{x:12,y:9,facing:'right'});
 engine.resumeGameplay?.();
 document.getElementById('fallen-canvas')?.focus?.({preventScroll:true});
}
function recoverHiddenIntro(){
 // If an interrupted load or hidden overlay leaves the cutscene state active,
 // enter the playable cell instead of trapping the player in intro input mode.
 if(scene!=='intro')return false;
 const overlay=$('fallen-story-intro');
 if(overlay&&!overlay.hidden){
  // A CSS-hidden or detached cinematic must not leave the engine in the
  // non-playable intro scene. The actual five-panel presentation is unchanged.
  const visuallyHidden=typeof overlay.getClientRects==='function'&&overlay.getClientRects().length===0;
  if(!visuallyHidden)return false;
 }
 finishIntroduction();
 return true;
}
function blockedInput(){recoverHiddenIntro();return scene==='intro'||!!activePuzzle||!$('fallen-story-chapter-confirm')?.hidden;}
function onKey(e){if(!blockedInput())return;const k=e.key.toLowerCase();if(!$('fallen-story-chapter-confirm')?.hidden){if(['enter','e',' '].includes(k)){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)advanceChapterTwo();}else if(k==='escape'){e.preventDefault();e.stopImmediatePropagation();cancelChapterTwo();}return;}if(['e','enter',' '].includes(k)){e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;if(scene==='intro')nextIntro();else if(activePuzzle)continuePuzzle();return;}if(k==='escape'&&scene==='intro'){e.preventDefault();e.stopImmediatePropagation();finishIntroduction();return;}if(k==='escape'&&activePuzzle){e.preventDefault();e.stopImmediatePropagation();closePuzzle();}if(scene==='intro'&&['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)){e.preventDefault();e.stopImmediatePropagation();}}
function showIntro(){
 scene='intro';
 $('fallen-story-intro').hidden=false;
 const step=steps[Math.min(chapter.step,steps.length-1)];
 const canvas=$('fallen-story-art');
 canvas.width=1672;canvas.height=941;
 $('fallen-story-intro').classList?.add('fallen-five-approved');
 $('fallen-story-intro').classList?.remove('fallen-five-missing-asset');
 for(const oldName of ['fallen-first-approved','fallen-second-approved','fallen-edwin-approved'])
  $('fallen-story-intro').classList?.remove(oldName);
 engine.setWorld(introWorld(step.scene),step.scene==='prison'?{x:12,y:7,facing:'down'}:{x:9,y:6,facing:'down'});
 $('fallen-story-intro-title').textContent=step.title;
 $('fallen-story-next').textContent=chapter.step===steps.length-1?'Begin escape →':'Continue →';
 drawIntroImage(step.scene);
 persist();
}
function nextIntro(){
 if(scene!=='intro')return;
 engine.enableSound();
 if(chapter.step===0)engine.soundCue();
 chapter.step++;
 if(chapter.step>=steps.length){
  finishIntroduction();
 }else showIntro();
}
function introWorld(kind){
 if(kind==='prison')return cellWorld();
 const w=createWorld(18,12,'s');
 w.music=['approach','arrest'].includes(kind)?'theft':'palace';
 return w;
}
// The five artist-approved original PNGs are used unchanged; each embeds its own English caption.
const introArtwork={};
function drawIntroImage(){
 const index=Math.max(0,Math.min(chapter.step,4));
 const path='/assets/fallen-king-intro/intro-'+(index+1)+'.png';
 const canvas=$('fallen-story-art'),c=canvas.getContext('2d');
 c.imageSmoothingEnabled=true;
 const img=introArtwork[path]||(introArtwork[path]=typeof Image==='undefined'?{complete:false,naturalWidth:0,src:''}:new Image());
 if(img.complete&&img.naturalWidth){
  c.clearRect(0,0,canvas.width,canvas.height);
  c.drawImage(img,0,0,canvas.width,canvas.height);
  return;
 }
 c.fillStyle='#243747';c.fillRect(0,0,canvas.width,canvas.height);
 if(!img.src&&typeof Image!=='undefined'){
  img.onload=()=>{if(scene==='intro'&&chapter.step===index)drawIntroImage();};
  img.onerror=()=>{
   if(scene!=='intro'||chapter.step!==index)return;
   c.fillStyle='#243747';c.fillRect(0,0,canvas.width,canvas.height);
   c.fillStyle='#fff0c6';c.font='bold 34px Georgia,serif';
   c.fillText('THE FALLEN KING',70,Math.round(canvas.height/2));
   // Never show duplicate narration beneath the approved original artwork.
   $('fallen-story-intro').classList?.add('fallen-five-missing-asset');
  };
  img.src=path;
 }
}
function renderIntroFrame(){/* Keep the dedicated comic artwork visible, not the top-down 3D world. */}
function isIntro(){return scene==='intro';}
function isPrisoner(){return scene==='cell'||scene==='sewer'||scene==='forest';}
function hasMap(){return !!chapter?.flags?.mapFound;}
function musicTheme(){if(scene==='intro')return ['theft','approach'].includes(steps[Math.min(chapter.step,steps.length-1)].scene)?'theft':steps[Math.min(chapter.step,steps.length-1)].scene==='prison'?'prison':'palace';return scene==='cell'?'prison':scene==='sewer'?'sewer':'willowmere';}
// Temporary narrative checkpoint; final logic puzzles will be authored after all levels are finished.
function openPuzzle(id){if(!Object.hasOwn(puzzles,id)||complete(id))return;activePuzzle=id;
 $('fallen-story-puzzle-name').textContent='PUZZLE';
 $('fallen-story-question').textContent='';
 $('fallen-story-feedback').textContent='';
 $('fallen-story-answers').replaceChildren();
 $('fallen-story-puzzle').hidden=false;
 $('fallen-story-puzzle-continue').hidden=false;
}
function closePuzzle(){activePuzzle=null;$('fallen-story-puzzle').hidden=true;document.getElementById('fallen-canvas').focus({preventScroll:true});}
function continuePuzzle(){if(!activePuzzle)return;const id=activePuzzle;chapter.flags[id]=true;closePuzzle();
 if(id==='exit')setScene('forest',{x:4,y:12,facing:'right'});
 else if(scene==='sewer')setScene('sewer',engine.getPlayer());
 else if(scene==='village')setScene('village',engine.getPlayer());
 else if(scene==='forest')setScene('forest',engine.getPlayer());
 else persist();
 const lines={cell:'The toilet drain is open. I can squeeze into the sewers.',sluice:'The first floodgate rises, revealing deeper tunnels.',lantern:'The second gate unlocks. The maze continues.',monster:'The strange creature finally has an answer.',watchChest:'Oh my god, thank you! I am opening the barrier now.',exit:'I climb the iron ladder and push the hatch open. Fresh woodland air!',merrick:'The bishop nods and lets Oliver pass.',lumber:'We have the timber needed for the bridge.',ropes:'The ropes are ready. Time to repair the bridge.',bridge:'The bridge is repaired. We can cross now.'};
 say('Oliver',lines[id]||'The way ahead is clear.');updateObjective();
}
// Movement never opens a puzzle. Controls and discoveries require an explicit E/Enter/Space action.
function beforeMove(x,y){
 if(scene==='cell')return x===16&&y===10;
 if(scene==='sewer')return x>=79&&y>=23&&y<=27;
 if(scene==='forest')return (!complete('watchChest')&&x===32&&y>=7&&y<=10)||(x>=34&&y>=7&&y<=10);
 if(scene==='village'&&x>=45&&x<=47&&y===19&&!complete('bridge'))return true;
 return false;
}
function advanceChapterTwo(){
 if(scene!=='village'||!complete('bridge'))return;
 $('fallen-story-chapter-confirm').hidden=true;
 chapter.flags.chapterEnd=true;
 setScene('ridge',{x:4,y:20,facing:'right'});
 engine.resumeGameplay?.();
 say('Oliver','Beyond the bridge, the old road climbs toward Skyglass Abbey. The search for my crown is not over.');
}
function cancelChapterTwo(){
 $('fallen-story-chapter-confirm').hidden=true;
 document.getElementById('fallen-canvas')?.focus?.({preventScroll:true});
}
const coinSpots={}; // Empty until the final coin locations are approved.
function afterMove(){const p=engine.getPlayer();
 // Crossing a world border is automatic. No E press or confirmation is needed.
 if(scene==='village'&&complete('bridge')&&p.x>=50&&p.y>=17&&p.y<=22){
  chapter.flags.chapterEnd=true;
  setScene('ridge',{x:4,y:20,facing:'right'});
  return;
 }
 if(scene==='ridge'){
  if(p.x<=2&&p.y>=17&&p.y<=23&&complete('bridge')){setScene('village',{x:48.5,y:19,facing:'left'});return;}
  if(p.x>=42&&p.y>=17&&p.y<=23){setScene('hill',{x:3,y:29,facing:'right'});return;}
  if(p.y>=38&&p.x>=8&&p.x<=14){setScene('ruins',{x:18,y:4,facing:'down'});return;}
 }
 if(scene==='hill'){
  if(p.x<=2&&p.y>=26&&p.y<=33){setScene('ridge',{x:39,y:20,facing:'left'});return;}
  if(p.x>=43&&p.y<=8){setScene('observatory',{x:17,y:25,facing:'up'});return;}
 }
 if(scene==='ruins'&&p.y<=2&&p.x>=14&&p.x<=22){setScene('ridge',{x:11,y:34,facing:'up'});return;}
 if(scene==='observatory'&&p.y>=27&&p.x>=13&&p.x<=21){setScene('hill',{x:40,y:6,facing:'left'});return;}
 persist();updateObjective();
}
function near(p,x,y,r=2){return Math.abs(p.x-x)+Math.abs(p.y-y)<=r;}
function talk(){if(!engine||blockedInput())return blockedInput();const p=engine.getPlayer(),{x,y}=p;
 if(scene==='cell'){
  if(near(p,16,10,2)){if(!complete('inspectedToilet')){chapter.flags.inspectedToilet=true;say('Oliver','An old toilet. A drain and a hidden mechanism: perhaps it leads below the castle.');}
   else if(!complete('cell'))openPuzzle('cell');
   else{setScene('sewer',{x:6,y:25,facing:'right'});say('Oliver','I have slid through the filthy pipe into the vast sewers. That explains the smell.');}
   persist();updateObjective();return true;}
  if(near(p,12,13,2)&&y>=11){
   say('Oliver','Moonlight reflects off the castle moat. The window is far too high to climb through.');
   return true;
  }
  if(near(p,9,7,2)){say('Oliver','Only a narrow iron cot and a worn blanket.');return true;}
  if(y<=7&&near(p,12,5,4)){say('Oliver','I think he is asleep. I should keep my voice down.');return true;}
  if(x<=8&&y>=6){say('Prisoner Mara','That guard snores every night. If you escape, do not forget us.');return true;}
  if(x>=17&&y>=6){say('Prisoner Tovin','I can hear water running beneath your cell.');return true;}
  say('Oliver','Cold stone. Iron bars. The way out must be hidden somewhere.');return true;
 }
 if(scene==='sewer'){
  if(near(p,3,25,3)){say('Oliver','That disgusting, rusted outlet pipe is where I came from. I am never going back in there.');return true;}
  // Floodgate checkpoints are removed entirely; this sewer is explored freely.
  if(near(p,23,31,2)){say('Strange Sewer Beast','GRRR.');return true;}
   if(near(p,40,45,2)){say('Oliver','Only rubbish remains.');return true;}
   if(near(p,49,38,3)&&!complete('monster')){
   if(!complete('monsterIntroduced')){chapter.flags.monsterIntroduced=true;persist();say('Sewer Creature','I have lived in these filthy drains for years. One strange puzzle has defeated me every night. Can you help me?');}
   else openPuzzle('monster');
   return true;
  }
  if(near(p,76,25,3)){
   if(!complete('exit')){openPuzzle('exit');return true;}
   say('Oliver','The iron ladder leads up through a hatch into the forest.');setScene('forest',{x:4,y:12,facing:'right'});say('Oliver','Fresh air! A forest path leads toward a village.');return true;
  }
  say('Oliver','The tunnels twist in every direction. Many passages end in solid stone.');return true;
 }
 if(scene==='forest'){
  if(near(p,9,13,2)){say('Wooden Sign','Willowmere Village → East. Follow the forest path to the watchtower and the gate.');return true;}
  if(near(p,27,7,2)&&y>=7&&y<=9){setScene('watchtower',{x:8,y:10,facing:'up'});say('Oliver','Inside the watchtower. The key chest must be somewhere in this room.');return true;}
   if(complete('watchChest')&&x>=33&&y>=7&&y<=11){
   setScene('village',{x:26,y:29,facing:'up'});
   say('Oliver','A village at last. Perhaps someone here will believe I am the king.');return true;
  }
  return false;
 }
 if(scene==='watchtower'){
  if(near(p,5,6,2)){say('Tower Keeper','The gate key is inside the locked chest. I do not know its code.','If you crack the code, you can raise the barrier outside.');return true;}
  if(near(p,8,4,3)&&!complete('watchChest')){if(!complete('watchAsked')){chapter.flags.watchAsked=true;persist();say('Oliver','The chest has a password lock. I should try to solve it.');}else openPuzzle('watchChest');return true;}
  if(near(p,8,12,2)){setScene('forest',{x:27,y:11,facing:'down'});return true;}
  return true;
 }
 if(scene==='ridge'){
  if(y<=9&&x>=16&&x<=24){say('Oliver','The cave entrance is buried under heavy stone. I cannot get inside right now.');return true;}
  if(near(p,17,20,3)){say('Woodland Signpost','NORTH: Hidden Cave','EAST: Skyglass Abbey via Hill Road','SOUTH: Old Ruins');return true;}
  return false;
 }
 if(scene==='hill'){
  if(near(p,39,6,3)){say('Oliver','The old stone towers of Skyglass Abbey rise beyond this ridge.');return true;}
  return false;
 }
 if(scene==='ruins'){
  if(near(p,18,24,3)){
   if(!complete('ruinInscription')){chapter.flags.ruinInscription=true;persist();say('Ancient Inscription','Before the first crown, the stars marked the rulers of Aldemar.','An unfamiliar symbol appears beside the carved royal seal.');}
   else say('Oliver','The symbol on this altar might connect to the manuscripts at Skyglass Abbey.');
   updateObjective();return true;
  }
  return false;
 }
 if(scene==='observatory'){
  if(near(p,17,16,3)){setScene('skyglassInterior',{x:30,y:46,facing:'up'});say('Oliver','The ancient oak doors creak open. The abbey hides a vast scriptorium and star hall.');return true;}
  return false;
 }
 if(scene==='skyglassInterior'){
  if(near(p,30,47,3)){setScene('observatory',{x:17,y:20,facing:'down'});say('Oliver','Back outside Skyglass Abbey.');return true;}
  if(near(p,30,11,5)){
   if(!complete('skyglassLedger')){chapter.flags.skyglassLedger=true;persist();say('Royal Ledger','A coronation register shows the royal seal replaced on the night Oliver was arrested.','The mark of Edwin is concealed beneath a false signature.');}
   else say('Oliver','Edwin forged the seal. I need to find someone who can expose his deception.');
   updateObjective();return true;
  }
  return false;
 }
 if(scene==='village'){
  if(near(p,17,19,2)&&!complete('lumber')){say('Baker Bea','The bridge needs strong timber. There is wood by the river if you want to help.');return true;}
  if(near(p,16,28,2)&&!complete('ropes')){say('Courier Nox','The ropes for the bridge are ready. Just press E by the bridge to rebuild it.');return true;}
  if(x>=41&&x<=48&&y>=17&&y<=22){
   if(!complete('bridge')){
    chapter.flags.lumber=true;chapter.flags.ropes=true;chapter.flags.bridge=true;
    setScene('village',p);
    say('Oliver','With the timber and rope at hand, the bridge is repaired! I can cross east now.');
   }else say('Oliver','The bridge is safe. Walk east along the road to continue my journey.');
   return true;
  }
  return false;
 }
 return false;}
function beforeHouse(){return false;}
function customScene(){return scene==='intro'||scene==='cell'||scene==='sewer'||scene==='forest'||scene==='watchtower'||scene==='ridge'||scene==='hill'||scene==='ruins'||scene==='observatory'||scene==='skyglassInterior';}

// Deliberate material pass: shared deterministic details on the ORIGINAL WebGL meshes.
// Keep small details in static geometry; do not trigger puzzles or alter collision tiles.
function drawMicroDetail(g,kind){
 const {box,cylinder,cone,sphere}=g;
 const h=(x,z,n=0)=>{const k=Math.sin(x*127.1+z*311.7+n*74.7)*43758.5453;return k-Math.floor(k)};
 function flagStone(x,z,y=0,color='#8c9088'){box(x,y+.014,z,.88,.028,.89,color);box(x-.30,y+.032,z-.3,.16,.018,.12,'#b0aea0');}
 function rivet(x,y,z){sphere(x,y,z,.047,'#d2bb86',6);}
 function candle(x,z,y=.55){cylinder(x,y,z,.075,.075,.20,'#e9d5b6',8);box(x,y+.11,z,.025,.04,.025,'#403a36');}
 function book(x,z,c){box(x,.76,z,.36,.16,.53,c);box(x+.025,.85,z,.32,.035,.49,'#eadab8');box(x-.18,.77,z,.05,.17,.58,'#e4b978');}
 if(kind==='bedroom'||kind==='approach'||kind==='theft'){
  for(let x=2;x<17;x++)for(let z=2;z<11;z++)if(h(x,z)<.61)flagStone(x+.5,z+.5,.02,h(x,z,1)>.5?'#aa967d':'#b4a38e');
  // Carved wardrobe, mirror, heraldic inlays, layered draperies and furniture joinery.
  for(const x of [2.2,4.0]){box(x,.78,3.2,.14,1.58,.15,'#6a4e40');box(x,1.25,3.29,.08,.85,.05,'#d1b179');rivet(x,1.77,3.34);}
  for(const x of [6.0,12.0]){box(x,1.73,1.16,.13,2.0,.18,'#e2c184');for(let j=0;j<5;j++)rivet(x,1.1+j*.35,1.33);}
  box(5.1,.83,8.7,1.25,.12,.80,'#6e4c42');for(const dx of [-.45,.45])cylinder(5.1+dx,.42,8.7,.07,.07,.80,'#bca17a',8);
  for(let i=0;i<4;i++){book(4.55+i*.28,8.55,['#7f3f54','#44677b','#566e57','#97694a'][i]);}
  for(const x of [2.3,15.5]){box(x,1.18,10.5,.8,2.3,.13,'#6c3d52');box(x,2.48,10.54,.98,.16,.16,'#d0ac72');for(let a=0;a<3;a++)rivet(x+(a-1)*.27,1.34,10.61);}
  for(const z of [2.3,7.4]){cylinder(1.7,.92,z,.26,.27,1.70,'#b49f7b',9);box(1.7,1.87,z,.7,.15,.70,'#e4cf9c');candle(1.7,z,2.0);}
  for(const [x,z] of [[12.1,8.6],[14.8,8.4]]){box(x,.25,z,.52,.48,.50,'#79604d');box(x,.53,z,.56,.09,.54,'#af9676');rivet(x,.58,z+.29);}
  for(let i=0;i<6;i++){const x=6.6+i*.95;box(x,.41,4.12,.09,.03,.15,'#d0bc89');}
 }
 if(kind==='throne'){
  for(let x=2;x<17;x++)for(let z=2;z<11;z++)if(h(x,z)<.83)flagStone(x+.5,z+.5,.0,h(x,z,1)>.55?'#c2af8b':'#ab9c81');
  for(const x of [3,15]){cylinder(x,.55,4.1,.27,.28,1.12,'#d3bc87',10);box(x,1.21,4.1,.8,.14,.8,'#e4ca92');candle(x,4.1,1.34);}
  for(const z of [2.5,5.4,8.3]){box(1.4,.75,z,.17,1.5,1.25,'#9d4752');box(1.51,1.50,z,.22,.13,1.38,'#e7be6f');}
  for(let z=2;z<10;z+=2)for(const x of [5.6,12.4]){cylinder(x,.66,z,.13,.17,1.33,'#af9c7a',8);box(x,1.4,z,.44,.10,.37,'#dbc58f');}
  for(const x of [7.4,10.6])for(let z=2;z<=5;z+=.8){box(x,.055,z,.17,.08,.55,'#eed6aa');}
 }
 if(kind==='prison'||kind==='cell'){
  const max=kind==='cell'?14:17;
  for(let x=1;x<max;x++)for(let z=3;z<=9;z++){const k=h(x,z);if(k<.43)flagStone(x+.5,z+.5,.0,k<.12?'#68736e':'#81837b');if(k>.91)box(x+.5,.07,z+.5,.09,.02,.31,'#4b6665');}
  // Irregular mortar, damp patches, drainage seams and thick iron anchors.
  for(let x=1;x<max;x+=2){for(const y of [.44,1.05,1.71,2.05]){box(x+.5,y,.94,.74,.036,.09,'#434e53');box(x+1.0,y+.22,.94,.06,.42,.09,'#4b595d');}}
  for(const x of [2.3,5.7,8.7,12.4]){box(x,.06,9.85,.70,.06,.18,'#455e5b');box(x,.09,9.88,.23,.025,.15,'#6e8d79');}
  for(const x of [3.0,6.8,10.9]){cylinder(x,.28,2.0,.14,.14,.50,'#424c54',8);box(x,.57,2.0,.31,.11,.32,'#a5a197');}
  for(let x=2;x<max;x+=3){box(x,2.50,1.63,.12,.23,2.1,'#5a6468');box(x,2.62,1.63,.20,.08,2.1,'#92968b');}
  for(const z of [4,7,9]){box(14.04,.7,z,.08,.92,.62,'#52605b');box(14.07,.35,z,.09,.08,.70,'#38564e');}
  if(kind==='cell'){
   for(const x of [3.4,4.5,5.6]){box(x,.08,4.8,.11,.08,.65,'#b2ad93');}
   for(let i=0;i<6;i++){const z=6.6+i*.20;box(11.08,.19,z,.07,.03,.11,'#555d59');}
   box(12.12,.77,7.0,.25,.13,.12,'#a9a9a4');rivet(12.14,.86,7.14);
   box(6.8,.11,8.8,.38,.17,.38,'#554a3d');box(6.8,.21,8.8,.32,.06,.29,'#81715b');
  }
 }
 if(kind==='sewer'){
  for(let x=1;x<35;x++)for(const z of [4.65,5.05,7.92,8.34])if(h(x,z)<.63){box(x+.5,.08,z,.82,.05,.30,h(x,z,2)>.5?'#4b7568':'#52796f');}
  // Water runoff, concentric grates, riveted pipe bands, growth in cracks.
  for(let x=2;x<35;x+=4){for(const z of [1.0,12.0]){cylinder(x,.79,z,.29,.30,.20,'#8e9283',10);cylinder(x,.79,z,.21,.21,.23,'#3f5151',10);for(let a=0;a<6;a++){const t=a*Math.PI/3;box(x+Math.cos(t)*.25,.79,z+Math.sin(t)*.25,.11,.06,.09,'#b5ad8c');}}}
  for(let x=4;x<35;x+=6){for(const z of [3.55,9.35]){box(x,.13,z,.52,.12,.40,'#788983');for(let i=0;i<4;i++)box(x-.18+i*.12,.20,z,.06,.025,.41,'#364d51');}}
  for(let x=2;x<35;x+=3){const a=h(x,4);if(a>.42){cone(x+.2,.33,4.48,.11,.46,'#426e55',7);cone(x+.5,.26,8.65,.08,.38,'#577b57',7);}if(a>.75){sphere(x+.7,.26,3.1,.13,'#608d84',7);sphere(x+.82,.31,3.14,.07,'#99b4a7',6);}}
  for(const x of [6,16,26])for(const z of [4.6,8.4]){box(x,1.20,z,.29,1.5,.22,'#5a6f68');box(x,1.92,z,.40,.11,.30,'#b3aa83');rivet(x,1.53,z+.19);}
  for(let x=2;x<35;x+=5){box(x,2.75,3.8,.13,.60,.13,'#54735e');cone(x,2.21,3.8,.20,.62,'#456a58',8);box(x,2.75,9.2,.14,.58,.13,'#54735e');}
 }
}
// Scene-specific floor materials: never reuse village grass, flowers or pond lilies indoors.
function backdrop(){if(scene==='cell')return [.004,.007,.012];if(scene==='sewer')return [.065,.10,.12];if(scene==='intro')return steps[Math.min(chapter.step,steps.length-1)].scene==='prison'?[.065,.10,.12]:[.18,.14,.16];return null;}
function sightOpaque(x,z){if(scene!=='cell'&&scene!=='sewer')return false;const w=engine.getWorld();
 if(scene==='sewer')return w.tiles[z]?.[x]==='H';if(x<0||z<0||x>=w.width||z>=w.height)return true;
 // Partition bars and the north gate block walking, but NOT the line of sight.
 if(z===5&&x>=1&&x<=23)return false;
 if((x===6||x===18)&&z>=9&&z<=10)return false; // Sight only through each narrow spy window.
 if(z===14&&x===12)return false; // The small south-facing opening.
 return w.tiles[z]?.[x]==='H';}
function fieldOfView(){if(!engine)return null;if(scene==='sewer')return {enabled:true,radius:10,isOpaque:sightOpaque};if(scene==='cell')return {enabled:true,radius:6,isOpaque:sightOpaque};return null;}
function drawGround(g,x,z){
 const w=engine.getWorld(),tile=w.tiles[z]?.[x]||'H',isPalace=scene==='intro'&&steps[Math.min(chapter.step,steps.length-1)].scene!=='prison';
 const base=isPalace?'#9d856d':scene==='sewer'?'#43575a':scene==='forest'?'#496b4f':'#696f6d';
 if(scene==='watchtower'){g.box(x+.5,-.20,z+.5,1,.18,1,'#72716c');g.box(x+.5,-.018,z+.5,.96,.028,.96,(x+z)%2?'#999287':'#aaa294');return;}
 if(scene==='ridge'||scene==='hill'||scene==='ruins'||scene==='observatory'||scene==='skyglassInterior'){
  const path=tile==='p'||tile==='s',woodland=scene==='ridge'||scene==='hill'||scene==='observatory',ruin=scene==='ruins';
  const base=path?(ruin?'#827762':woodland?'#7c7563':'#737d7b'):(ruin?'#465b45':woodland?'#375742':'#3e5457');
  // Single solid floor tile: no coplanar base/inlay to shimmer.
  const floorTone=scene==='skyglassInterior'?(path?(tile==='s'?'#b39c77':'#9d8566'):'#84725b'):path?(tile==='s'?(ruin?'#9c9276':'#b1aca0'):'#827c67'):(ruin?'#5a7557':woodland?'#47694e':'#536c69');
  g.box(x+.5,-.052,z+.5,1,.104,1,floorTone);
  // Bright, hand-laid path pebbles and pale flagstone joints. Inlaid below
  // ankle height so the player never clips through roadside decorations.
  if(path&&(scene==='ridge'||scene==='hill')){
   const pale=(x*5+z*11)%5===0?'#bbad91':'#988a73';
   if((x*7+z*3)%3===0)g.box(x+.27,.054,z+.33,.21,.008,.13,pale);
   if((x*11+z*13)%4===0)g.box(x+.72,.054,z+.64,.16,.008,.10,'#b7a889');
   if(tile==='p'&&(x*3+z*5)%7===0)g.box(x+.50,.055,z+.15,.61,.008,.055,'#c0ae8d');
  }else if(path&&scene==='ruins'){
   if((x*7+z*5)%4===0)g.box(x+.37,.055,z+.55,.30,.008,.19,'#c5b99a');
   if((x+z*3)%6===0)g.box(x+.76,.055,z+.24,.12,.008,.10,'#827862');
  }
  return;
 }
 if(scene==='forest'){const path=tile==='p'||tile==='s';g.box(x+.5,-.20,z+.5,1,.18,1,path?'#7e7661':'#37553e');if(path){g.box(x+.5,-.025,z+.5,.94,.025,.94,(x+z)%4===0?'#908267':'#746e5c');}else{g.box(x+.5,-.014,z+.5,.94,.02,.94,(x*3+z)%7===0?'#507451':'#466647');}return;}
 g.box(x+.5,-.20,z+.5,1,.19,1,base);
 if(scene==='sewer'&&tile==='w'){g.box(x+.5,-.045,z+.5,1,.055,1,'#355d68');return;}
 if(scene==='sewer'&&tile==='H'){g.box(x+.5,-.035,z+.5,1,.055,1,'#354447');return;}
 if(isPalace){g.box(x+.5,.006,z+.5,.94,.017,.94,(x+z)%4===0?'#b5a083':'#a8967c');return;}
 if(scene==='sewer'&&tile==='s'){
  const stream=w.streamTiles?.[z*w.width+x]||0;
  // Preserve the textured stone floor at scattered landmark tiles. Most of
  // the sewer uses inexpensive flagstones to avoid thousands of GLB copies.
  if((x*7+z*11)%9!==0||!window.FallenKingDetailPlus?.draw?.(g,'floor',x+.5,.005,z+.5,.99,.02,.99))
   g.box(x+.5,.005,z+.5,.96,.02,.96,'#596461');
  if(stream)g.box(x+.5,.025,z+.5,1.005,.017,1.005,'#426871');
  else if((x*7+z*3)%11===0)g.box(x+.5,.023,z+.5,.45,.009,.36,'#4c615d');
  if((x*17+z*11)%139===0&&!stream){
   g.box(x+.5,.032,z+.5,.70,.018,.61,'#364c51');
   for(let i=0;i<5;i++)g.box(x+.21+i*.15,.047,z+.5,.045,.015,.58,'#87948e');
  }
  return;
 }
 // Keep the original flat flagstone floor in the prison; cloning a full GLB
 // on every tile can exhaust browser memory before Oliver can move.
 if(scene!=='cell'&&scene!=='sewer'&&window.FallenKingDetailPlus?.draw(g,'floor',x+.5,.005,z+.5,.99,.02,.99))return;
 g.box(x+.5,.005,z+.5,.96,.02,.96,scene==='sewer'?'#6c7977':'#94958c');
}
// Small, fixed world ornaments: deterministic meshes, no new collision tiles.
function drawWildflowers(g,x,z,seed){
 const {box,cone,sphere}=g;
 for(let i=0;i<3;i++){
  const ox=((seed*13+i*7)%17)/35-.24,oz=((seed*5+i*11)%19)/39-.24;
  const h=.16+.055*((seed+i)%3),px=x+ox,pz=z+oz;
  box(px,h/2,pz,.018,h,.018,'#54794e');
  sphere(px,h+.03,pz,.060,['#e8c783','#d4b4d6','#f0e2ba','#aac9d8'][(seed+i)%4],7);
 }
}
function drawWaypost(g,x,z,labelColor='#b69b6e'){
 const {box,cone}=g;
 box(x,.68,z,.15,1.36,.16,'#694e36');
 cone(x,1.45,z,.20,.30,'#a48f69',8);
 box(x,1.16,z,.85,.28,.13,'#83613e');
 box(x,1.17,z+.072,.64,.085,.025,labelColor);
 box(x,.30,z,.45,.08,.37,'#695d45');
}
// Compact 3x5 wooden sign glyphs. They face the player and stay legible
// without adding UI overlays or changes to the approved introduction.
const signGlyphs={
 A:['010','101','111','101','101'],E:['111','100','110','100','111'],
 G:['011','100','101','101','011'],I:['111','010','010','010','111'],
 L:['100','100','100','100','111'],M:['101','111','111','101','101'],
 O:['111','101','101','101','111'],R:['110','101','110','101','101'],
 S:['011','100','010','001','110'],T:['111','010','010','010','010'],
 V:['101','101','101','101','010'],W:['101','101','111','111','101']
};
function drawSignLetters(g,x,z,text,y){
 const scale=.046,step=scale*4,start=x-(text.length*step-scale)/2;
 for(let i=0;i<text.length;i++){
  const glyph=signGlyphs[text[i]];if(!glyph)continue;
  for(let row=0;row<5;row++)for(let col=0;col<3;col++){
   if(glyph[row][col]==='1')g.box(start+i*step+col*scale,y-row*scale,z,scale*.85,scale*.83,.027,'#463626');
  }
 }
}
function drawVillageDetails(g){
 const {box,cylinder,cone,sphere}=g;
 // Flower troughs, herb pots and a public waste basket along market edges.
 for(const [x,z] of [[20.4,25.8],[34.5,25.6],[24.1,35.0],[32.8,34.1]]){
  box(x,.23,z,1.20,.40,.46,'#775338');
  box(x,.47,z,1.11,.09,.39,'#bb9667');
  box(x,.59,z,1.01,.06,.30,'#3e6041');
  for(let i=0;i<5;i++){const px=x-.43+i*.21;sphere(px,.74,z,.095,i%2?'#edca87':'#d49bb0',8);}
 }
 for(const [x,z] of [[19.8,32.0],[35.7,31.5],[22.2,22.4]]){
  cylinder(x,.28,z,.32,.27,.55,'#aa9072',10);
  cylinder(x,.56,z,.35,.35,.075,'#ceb296',10);
  for(let i=0;i<4;i++)cone(x+Math.cos(i*1.57)*.12,.80,z+Math.sin(i*1.57)*.12,.15,.43,'#587856',7);
 }
 const tx=34.6,tz=28.8;
 cylinder(tx,.39,tz,.32,.29,.73,'#665344',12);
 cylinder(tx,.80,tz,.37,.37,.11,'#b29565',12);
 cylinder(tx,.92,tz,.21,.21,.05,'#342c2a',12);
 for(let i=0;i<7;i++){const a=i*2*Math.PI/7;box(tx+Math.cos(a)*.28,.40,tz+Math.sin(a)*.28,.045,.49,.055,'#ae946e');}
 // Notice board and its wax-sealed notices, safely off the main square.
 box(37.3,1.19,28.6,1.55,1.12,.16,'#725139');
 box(37.3,1.19,28.72,1.35,.88,.04,'#c6b18b');
 for(const [x,y] of [[36.9,1.35],[37.48,1.42],[37.16,.95]]){
  box(x,y,28.75,.34,.32,.026,'#e9d8ae');
  sphere(x+.10,y-.09,28.78,.038,'#a7463f',7);
 }
 for(const x of [36.6,38.0])box(x,.55,28.55,.12,1.1,.15,'#6f5945');
 // Low-profile weeds and flowers never block walking or sight lines.
 for(let i=0;i<36;i++){
  const x=10+((i*23)%30)+.30,z=7+((i*17)%28)+.3;
  if((x>16&&x<34&&z>19&&z<35)||(x>40&&z>16&&z<24))continue;
  drawWildflowers(g,x,z,i);
 }
}
// Second art pass: decorative meshes only; gameplay and collision tiles are unchanged.
function drawForestMicroDetails(g,world){
 const {box,cylinder,cone,sphere}=g;
 // Ferns and tiny mushrooms occupy open grass away from the main paths.
 for(let i=0;i<42;i++){
  const x=3+((i*17)%28),z=2+((i*11)%17);
  if(world.tiles[z]?.[x]!=='.'||(x>=24&&x<=30&&z<=10))continue;
  const px=x+.48,pz=z+.46;
  if(i%3===0){
   cylinder(px,.065,pz,.045,.050,.13,'#e6dfb4',7);
   sphere(px,.19,pz,.13,'#ae6659',9);
   for(const [dx,dz] of [[-.07,0],[.07,0],[0,.06]])sphere(px+dx,.305,pz+dz,.029,'#f2dec8',6);
  }else{
   for(let n=0;n<4;n++){
    const a=n*Math.PI/2+i*.7;
    cone(px+Math.cos(a)*.095,.17,pz+Math.sin(a)*.095,.09,.34,n%2?'#577e51':'#6a915f',6);
   }
  }
 }
 // Fallen logs, moss and pale lichen at the forest's outer edges.
 for(const [x,z] of [[5.6,17.4],[15.6,18.2],[21.8,2.5],[31.2,16.5]]){
  cylinder(x,.22,z,.28,.32,.72,'#634f3a',9);
  cylinder(x,.60,z,.24,.24,.06,'#ad9069',9);
  for(let k=0;k<3;k++)sphere(x-.13+k*.13,.67,z+.08,.057,'#6b835b',7);
 }
 // A little stone trail marker near the village approach.
 for(const [x,z] of [[29.6,14.7],[11.7,4.0]]){
  box(x,.18,z,.60,.35,.52,'#777e72');
  box(x,.48,z,.48,.29,.42,'#94988b');
  box(x,.67,z,.56,.09,.46,'#b6b9a6');
 }
}
function drawVillageSecondPass(g){
 const {box,cylinder,cone,sphere}=g;
 // A covered handcart with wooden wheels, crates and striped linen canopy.
 const x=31.3,z=28.9;
 box(x,.47,z,2.0,.16,1.05,'#936f4c');
 box(x,.62,z,1.85,.12,.95,'#ba9566');
 for(const wx of [x-.65,x+.65])for(const wz of [z-.59,z+.59]){
  cylinder(wx,.35,wz,.23,.23,.12,'#4b4941',10);
  cylinder(wx,.35,wz,.11,.11,.13,'#bba077',10);
 }
 for(const dx of [-.78,.78])for(const dz of [-.43,.43])box(x+dx,1.26,z+dz,.09,1.32,.09,'#75553b');
 box(x,2.00,z,2.25,.17,1.45,'#b65a4a');
 // The painted bands sit above the canvas, not inside its top face.
 for(let i=0;i<6;i++)box(x-1+i*.40,2.184,z,.20,.018,1.38,'#eee0b7');
 for(const [dx,dz] of [[-.51,-.10],[.23,.22],[.51,-.18]]){
  box(x+dx,.83,z+dz,.43,.35,.34,'#95714c');
  box(x+dx,.99,z+dz,.47,.05,.38,'#ceb18a');
 }
 // Barrel cluster, small signboards, puddles and stone edging around the streets.
 for(const [bx,bz] of [[14.5,27.4],[35.8,35.5],[39.0,24.7]]){
  cylinder(bx,.33,bz,.27,.30,.64,'#846043',10);
  for(const y of [.14,.52])cylinder(bx,y,bz,.302,.302,.045,'#5a6464',10);
  box(bx+.44,.27,bz,.45,.54,.43,'#a48158');
  box(bx+.44,.55,bz,.50,.06,.47,'#c6a579');
 }
 for(const [px,pz] of [[16.3,30.4],[35.3,20.3],[40.5,34.5]]){
  box(px,.013,pz,.82,.015,.49,'#637b77');
  box(px+.1,.022,pz,.34,.005,.04,'#a8c7bb');
 }
 for(const [sx,sz] of [[19.3,34.6],[36.8,23.8],[25.0,16.6]]){
  box(sx,.17,sz,1.30,.31,.24,'#9e9b8c');
  box(sx,.33,sz,1.36,.05,.26,'#c2b8a4');
 }
 // Hanging strings of cloth pennants give market stalls stronger silhouettes.
 for(const [px,pz] of [[23.5,24.4],[32.7,24.4],[30.7,33.2]]){
  box(px,2.24,pz,.045,.045,2.6,'#756954');
  for(let i=0;i<5;i++)cone(px,2.12,pz-1.1+i*.54,.10,.21,i%2?'#ead9ad':'#b15d55',4);
 }
 // A painted emblem and a dated stone foundation beside the common well.
 box(27.3,.75,26.34,.58,.43,.045,'#a68962');
 box(27.3,.78,26.38,.40,.055,.028,'#e5d1a0');
 for(const dx of [-.17,.17])sphere(27.3+dx,.89,26.40,.045,'#5f6a66',7);
}

/* Small environmental storytelling details throughout playable areas.
   Cosmetic static meshes only: no changes to collision, triggers, quests or the finished intro. */
function drawEverydayDetails(g){
 const {box,cylinder,cone,sphere}=g;
 const hash=(x,z,n=0)=>{const v=Math.sin(x*71.3+z*149.7+n*39.1)*43758.5453;return v-Math.floor(v)};
 if(scene==='cell'){
  // Hairline mortar cracks and pale salt deposits on the rear wall.
  for(let i=0;i<20;i++){
   const x=1.65+(i*1.13)%21.3,y=.72+(i*7%11)*.13;
   box(x,y,15.045,.27,.022,.031,'#485953');
   box(x+.10,y-.11,15.05,.022,.23,.032,'#596965');
  }
  for(const [x,z] of [[2.6,13.7],[9.6,14.6],[15.8,13.8],[21.7,14.1]]){
   box(x,.018,z,.48,.022,.33,'#63776b');
   for(let i=0;i<3;i)sphere(x-.13+i*.13,.041,z+.09,.045,'#819287',6);
  }
  // Hinges and latch plates read as real hardware on the cell front.
  for(const x of [6.12,7.13,10.94,13.02,17.85,18.88]){
   box(x,1.55,5.34,.10,.36,.10,'#526369');
   for(const y of [1.43,1.69])sphere(x,y,5.41,.029,'#a0a49a',6);
  }
  // Small discarded pebbles in corners, kept below foot height.
  for(let i=0;i<15;i++){
   const x=1.5+(i*13%22),z=i%2?14.52:6.14;
   sphere(x,.075,z,.055+.02*(i%3),'#8a8b7d',7);
  }
 }else if(scene==='sewer'){
  const w=engine?.getWorld?.();
  if(!w)return;
  // Mineral streaks and tiny rust spots appear on existing solid-wall tiles only.
  for(let z=2;z<w.height-2;z+=3)for(let x=2;x<w.width-2;x+=3){
   if(w.tiles[z]?.[x]!=='H')continue;
   const nearWalk=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>w.tiles[z+dz]?.[x+dx]==='s');
   if(!nearWalk||hash(x,z)<.38)continue;
   const px=x+.50,pz=z+.50;
   box(px,1.05,pz+.48,.055,.62,.028,'#405953');
   box(px+.12,.61,pz+.48,.04,.28,.028,'#745e49');
   sphere(px-.14,.14,pz+.33,.085,'#75847a',7);
  }
  // Flush surface scum and floating debris: no new obstacles in the water.
  for(let z=2;z<w.height-2;z+=5)for(let x=2;x<w.width-2;x+=5){
   if(w.tiles[z]?.[x]!=='w')continue;
   box(x+.38,.049,z+.53,.22,.009,.07,'#66877e');
   box(x+.72,.050,z+.40,.12,.008,.035,'#94a79a');
  }
 }else if(scene==='forest'){
  const w=engine?.getWorld?.();
  if(!w)return;
  // Fallen leaves, seedpods and fern shoots only on natural ground.
  for(let i=0;i<100;i++){
   const x=2+(i*17%30),z=2+(i*23%18);
   if(w.tiles[z]?.[x]!=='.')continue;
   const px=x+.18+hash(x,z)*.61,pz=z+.20+hash(z,x)*.60;
   box(px,.028,pz,.12,.012,.060,['#9a855b','#b39a67','#806c4a','#6f8059'][i%4]);
   if(i%7===0){cone(px+.15,.12,pz-.10,.09,.22,'#537951',6);sphere(px+.15,.25,pz-.10,.04,'#7e9a69',6);}
  }
  // Small bracket fungi cling to tree-root edges rather than the road.
  for(let i=0;i<16;i++){
   const x=2+(i*11%31),z=2+(i*7%18);
   if(w.tiles[z]?.[x]!=='T')continue;
   sphere(x+.77,.16,z+.26,.105,'#c3ad82',7);
   sphere(x+.77,.19,z+.26,.073,'#eee1bc',7);
  }
 }else if(scene==='watchtower'){
  // Ink, folded records and wax seals on the guard's writing table.
  box(12.40,.87,9.86,.43,.018,.28,'#e7d2a5');
  box(12.54,.886,9.81,.15,.008,.025,'#78624c');
  sphere(12.48,.91,9.99,.043,'#9f4942',7);
  cylinder(12.04,.92,9.58,.075,.075,.12,'#494d4c',9);
  // Wall joint variation, small rivets and repaired floor seams.
  for(const z of [1.87,12.14])for(let i=0;i<13;i++){
   const x=2.2+i*1.03;
   box(x,1.05+(i%3)*.39,z,.38,.026,.034,'#95998f');
   box(x+.18,1.18+(i%3)*.39,z,.026,.18,.035,'#676d6a');
  }
  for(const [x,z] of [[3.2,10.8],[13.8,10.9],[3.1,3.5]]){
   box(x,.035,z,.39,.017,.26,'#77766b');
   sphere(x+.15,.064,z-.08,.055,'#aea38b',6);
  }
 }else if(scene==='village'){
  // Wear marks, loose cobbles, chalk traces and fallen leaves along paved square.
  for(let i=0;i<62;i++){
   const x=17+(i*13%22)+.25,z=19+(i*17%17)+.26;
   if((x>25&&x<29&&z>25&&z<29)||(x>29&&x<34&&z>27&&z<31))continue;
   const px=x+(hash(i,2)-.5)*.20,pz=z+(hash(i,7)-.5)*.20;
   box(px,.024,pz,.15,.009,.10,i%3===0?'#c6bea8':'#8d9488');
   if(i%5===0)box(px+.12,.035,pz-.11,.09,.008,.04,'#687b64');
  }
  // A few papers and rope loops at the edges of market stalls.
  for(const [x,z] of [[22.95,24.4],[32.12,24.4],[30.2,33.2]]){
   box(x,1.02,z,.31,.018,.24,'#e8d7ad');
   box(x+.08,1.037,z-.04,.15,.006,.025,'#816d51');
   cylinder(x-.38,.13,z+.78,.17,.17,.045,'#a79171',10);
  }
  // Window boxes and tiny shutters on existing perimeter buildings.
  for(const [x,z] of [[12.3,9.2],[20.4,11.5],[38.4,10.8]]){
   box(x,1.3,z,.62,.16,.25,'#815c43');
   box(x,1.40,z,.53,.06,.19,'#4e704a');
   for(let i=0;i<3;i)sphere(x-.19+i*.18,1.49,z,.07,'#d4a0a1',6);
  }
 }
}

function drawProps(g){
 const {box,cylinder,cone,sphere,piece,oliver,features,recliningKing,recliningPiece,tri}=g;
 if(scene!=='intro'&&scene!=='cell')drawEverydayDetails(g);
 const drawOliver=(x,z)=>oliver?oliver(x,z):piece(x,z,'K','white',true);
 const dp=window.FallenKingDetailPlus,model=(id,x,y,z,w,h,d,rot=0)=>
  scene!=='cell'&&(scene!=='sewer'||id!=='wall'||(Math.round(x)+3*Math.round(z))%9===0)&&!!dp?.draw?.(g,id,x,y,z,w,h,d,rot);
 const rock='#687076',iron='#253945',wood='#785943',ivory='#e7ddc8';
 const brass='#d6b46b',royal='#a3474f',azure='#517488',moss='#416c65';
 function wall(x,z,w=1,h=1.8){const dungeon=scene==='cell'||scene==='sewer'||scene==='intro'&&steps[Math.min(chapter.step,steps.length-1)].scene==='prison';if(dungeon&&model('wall',x,0,z,w,h,.86))return;box(x,h/2,z,w,h,.86,rock);box(x,h-.08,z,w,.15,.92,'#ada79a');box(x,h*.53,z,w,.08,.93,'#495960');}
 function rails(a,b,z){/* Genuine forged-iron bars, not Kenney's brown timber dungeon gates. */box((a+b)/2,1.98,z,b-a,.17,.19,'#303b40');box((a+b)/2,.14,z,b-a,.15,.19,'#27353a');for(let x=a+.20;x<b-.12;x+=.46){cylinder(x,.99,z,.052,.055,1.86,iron,10);sphere(x,1.95,z,.070,'#78878a',8);box(x,.20,z,.17,.10,.20,'#455257');}for(let x=a+.16;x<b;x+=1.85)box(x,1.03,z,.15,.11,.24,'#809195');}
 function bed(x,z){/* Narrow prison cot: low iron legs, a pale mattress, a pillow and faded blue blanket. */for(const dx of [-1.35,1.35])for(const dz of [-.63,.63])cylinder(x+dx,.20,z+dz,.065,.065,.39,'#46535a',8);box(x,.31,z,2.95,.10,1.48,'#566166');box(x,.42,z,2.83,.15,1.37,'#c4bea9');box(x-.94,.53,z,.70,.13,1.12,'#e2ddc9');box(x+.55,.52,z,1.54,.09,1.28,'#6d8294');box(x+.52,.58,z+.56,1.5,.06,.10,'#8e9da1');}
 function royalBed(x,z){
  // Low, open royal bed; no canopy, tall pillars or curtains hiding Oliver's face.
  if(!model('bed',x,0,z,3.85,.62,2.32))bed(x,z);
  box(x-1.84,.28,z,.17,.55,2.22,'#765142');
  box(x-1.81,.83,z,.13,.22,2.08,'#a67858');
  box(x-1.80,.93,z,.16,.035,1.93,'#d2b277');

   // The pillow is removed so Oliver's head remains visible.
  box(x+.66,.67,z,1.61,.10,1.76,'#824e6b'); // Blanket covers feet, NOT the king's face.
  box(x+.65,.77,z-.73,1.58,.03,.10,'#d9bb84');
  box(x+.65,.77,z+.73,1.58,.03,.10,'#d9bb84');
 }
 function toilet(x,z){if(dp?.toilet?.(g,x,z))return;box(x,.36,z-.3,.9,.7,.65,'#aeb4ae');cylinder(x,.57,z+.18,.5,.5,.22,ivory,12);cylinder(x,.7,z+.18,.35,.35,.06,'#becbca',12);cylinder(x,.73,z+.18,.21,.21,.06,'#416477',12);box(x,.87,z-.53,.77,.14,.15,ivory);box(x+.33,.77,z-.59,.10,.18,.12,'#ad9f78');}
 function torch(x,z){box(x,.84,z,.22,.36,.2,wood);cone(x,1.16,z,.15,.38,'#e5a94d',8);sphere(x,1.34,z,.12,'#ffe0a0',8);}
 function banner(x,z,c=royal){box(x,1.85,z,.65,1.48,.07,c);box(x,2.60,z,.77,.10,.13,brass);box(x,1.05,z,.70,.12,.13,brass);box(x,2.05,z+.06,.16,.18,.08,brass);}
 function tapestry(x,z){box(x,1.85,z,1.10,1.45,.09,'#784157');box(x,2.60,z,1.2,.10,.18,brass);for(let i=0;i<3;i++)box(x+(i-1)*.25,1.55,z+.065,.09,.58,.07,brass);}
 function pipe(x,z,length=3){cylinder(x,1.4,z,.24,.24,length,'#697e7a',10);cylinder(x,1.4,z,.28,.28,.12,'#b3a97e',10);}
 function arch(x,z){for(const dx of [-1.7,1.7]){box(x+dx,1.3,z,.37,2.6,.44,'#8a9991');box(x+dx,2.35,z,.49,.19,.52,'#a7ad9d');}box(x,2.68,z,3.8,.40,.5,'#6d7d7b');box(x,2.93,z,3.1,.12,.57,'#4a655f');}
 function king(x,z){drawOliver(x,z);}
 function edwin(x,z,wearingCrown=false){
  // Edwin is an unmistakable BLUE pawn; the stolen crown is a separate attachment.
  piece(x,z,'P','blue',false);
  box(x,.61,z+.31,.35,.40,.09,'#2f66a5');
  box(x+.13,.72,z+.36,.12,.16,.05,'#91c2ec');
  if(wearingCrown)dp?.crown?.(g,x,1.53,z,.82);
 }
 if(scene==='intro'&&steps[Math.min(chapter.step,steps.length-1)].scene!=='prison'){
  const kind=steps[Math.min(chapter.step,steps.length-1)].scene;
  for(let x=0;x<18;x++){wall(x+.5,.5,1,2.9);wall(x+.5,11.5,1,1.2);if(x%3===0)box(x+.5,2.95,.62,.30,.25,1.3,'#c0ae87');}
  for(let z=1;z<11;z++){wall(.5,z+.5,1,2.4);wall(17.5,z+.5,1,2.4);}
  for(let x=2;x<18;x+=4)box(x,.05,6,.06,.10,9,'#beaa8a');
  if(kind!=='prison'){for(const x of [3,7,11,15]){box(x,1.25,.95,.88,2.5,.4,'#b5a48b');tapestry(x,1.19);}/* Oversized royal chamber pillars removed. */for(let z=2;z<11;z+=3)banner(17.04,z+.5,royal);}
  if(['bedroom','approach','theft','confrontation','arrest'].includes(kind)){
    // Inlaid burgundy carpet with gold borders instead of an enormous untextured brown rectangle.
    box(9,.025,5.4,10.2,.046,5.60,'#654452');
    for(const z of [2.75,8.05])box(9,.052,z,10.1,.012,.09,'#dfb875');
    for(const x of [4.1,13.9])box(x,.053,5.4,.085,.012,5.35,'#dfb875');
    for(let i=0;i<9;i++){const x=5.5+i*.88;box(x,.06,3.2,.30,.014,.11,'#b48667');box(x,.06,7.7,.30,.014,.11,'#b48667');}
    royalBed(9,5);
    box(3.8,1.0,3.2,1.4,2,.22,'#704751');box(3.8,1.03,3.36,1.2,1.6,.07,'#d4b26b');
    // The royal crown is kept on an obvious velvet-topped pedestal beside Oliver's bed.
    if(!model('table',13.8,0,5.1,1.70,1.03,1.33))box(13.8,.47,5.1,1.65,.94,1.25,wood);
    box(13.8,1.04,5.1,1.28,.14,.92,'#87364d');
    if(['bedroom','approach'].includes(kind))dp?.crown?.(g,13.8,1.14,5.1,1.0);
    for(const x of [3.3,15.7]){box(x,1.28,1.33,1.45,2.30,.18,'#6f3d55');box(x,2.52,1.42,1.62,.14,.22,'#c7a265');}
    for(const x of [5.3,12.7]){box(x,1.55,11.25,1.45,1.36,.12,'#496c88');box(x,1.54,11.1,.12,1.38,.18,'#c6aa72');}
    // A rear-wall bookcase reads clearly from the overhead camera.
    box(4.1,1.50,1.72,2.1,2.85,.46,'#635343');
    for(const y of [.53,1.15,1.77,2.39])box(4.1,y,2.0,2.0,.12,.52,'#ab8863');
    for(let i=0;i<15;i++){
     const x=3.27+(i%5)*.39,y=.68+Math.floor(i/5)*.62;
     box(x,y,1.97,.21,.42,.27,['#775d56','#5d7480','#a58c65','#755e79'][i%4]);
    }
    // The confusing striped block below-left of the bed was removed.
    box(9,.11,8.7,7.3,.15,2.1,'#9c6a56');box(9,.19,8.7,6.7,.05,1.7,'#b89975');
    for(const x of [2.5,16])torch(x,2.9);
    // The real chess-piece mesh is reclined on the pillow, not replaced by a different drawing.
    if(['bedroom','approach','theft'].includes(kind)){if(recliningKing)recliningKing(9,5);else drawOliver(8.0,5);}else drawOliver(8.9,7.0);
    box(9.6,.68,5,.72,.035,1.26,'#8e5470');
    if(kind==='approach')edwin(15.1,8.7);
    if(kind==='theft'){edwin(13.0,7.4);dp?.crown?.(g,12.55,1.65,7.0,.88);}
    if(kind==='confrontation')edwin(12.7,7.0,true);
    if(kind==='arrest'){edwin(13.7,7.0,true);for(const x of [6.5,11]){piece(x,8.8,'R','white',false);features(x,8.8,'R','white',false,'guard');}}
  }else if(kind==='throne'){
    box(9,.62,3.8,3.4,1.24,1.4,'#916b54');box(9,1.42,3.7,2,1.6,.47,'#a44b53');
    // Edwin wears the crown and royal disguise; Oliver remains unmistakably crownless.
    edwin(9,5.3,true);
    drawOliver(8.5,9);
    piece(5.2,7.5,'R','white',false);piece(12.8,7.5,'R','white',false);torch(3,3);torch(15,3);
    for(const x of [3.3,14.7]){tapestry(x,1.22);cylinder(x,.73,3.7,.42,.42,1.46,'#d2c2a0',12);}
  }else{
    for(let x=1;x<17;x++)wall(x+.5,2,1,1.8);
    // Dungeon establishing shot: real cell block and narrow corridor beyond the gate.
    for(const x of [4,8,12]){box(x,2.1,2.8,.88,2.8,.7,'#343f45');rails(x-.36,x+.36,3.25);}
    for(const x of [3,7,11,15]){box(x,2.7,1.4,.35,.28,5.2,'#4c5256');}
    rails(3,15,6);bed(5,8.5);toilet(12,8.5);king(9,8.9,true);torch(15,3);
  }
  return;
 }
 if(scene==='cell'||scene==='intro'&&steps[Math.min(chapter.step,steps.length-1)].scene==='prison'){
  // Single coherent cell block: corridor north, Mara's cell west, Tovin's cell east, Oliver in the middle.
  // Avoid a solid northern wall: the front of each cell is ironwork with visible corridor behind it.
  for(let x=0;x<25;x++){
   wall(x+.5,.5,1,2.65); // North exterior stone wall beyond the corridor.
   if(x>=11&&x<=13)wall(x+.5,15.48,1,.55); // A real opening: low stone sill, no tall wall hiding the window.
   else wall(x+.5,15.48,1,2.35); // Solid southern stone, never bars.
  }
  for(let z=1;z<15;z++){wall(.50,z+.5,1,2.4);wall(24.5,z+.5,1,2.4);}
  // Northern guard corridor: long unobstructed flagstone walkway with arch pilasters.
  for(const x of [2.5,7,12.5,18,23]){box(x,.01,3.3,.24,.18,3.2,'#657478');box(x,2.48,1.3,.42,.24,3.3,'#8b9691');}
  for(const x of [6.5,18.5]){box(x,0,5.3,.68,2.56,.72,'#8c9390');box(x,2.49,5.3,.81,.19,.81,'#b1b3a6');}
  // The cell fronts are entirely barred. The gate is centred at x=12, on the north boundary z=5.
  rails(1.2,6.15,5.18);
  rails(7.15,17.85,5.18);
  rails(18.85,23.8,5.18);
  for(const x of [10.95,13.0]){box(x,.27,5.22,.18,.53,.32,'#77878b');box(x,1.83,5.22,.20,.43,.26,'#77878b');}
  box(12.0,1.04,5.33,.22,.43,.18,'#b2a37f');sphere(12.0,1.34,5.45,.062,'#283e43',8);
  // Solid stone partitions left and right. One narrow barred peephole at eye level.
  for(const x of [6.5,18.5]){
   for(let z=5.8;z<13.8;z+=.90){
    if(z>9.0&&z<10.8){
     box(x,.53,z+.44,.80,1.06,.92,'#798282');
     box(x,2.05,z+.44,.80,.58,.92,'#87908c');
     for(const zz of [z+.23,z+.63])cylinder(x,1.28,zz,.055,.056,.90,'#3f5057',9);
     box(x,1.34,z+.44,.035,.46,.52,'#9aadb8');box(x,1.75,z+.44,.93,.07,.78,'#b6c1ba');for(const zz of [z+.25,z+.65])box(x,1.82,zz,.93,.075,.07,'#344951');
     box(x,1.05,z+.44,.90,.12,.95,'#b0b0a4');
     box(x,1.71,z+.44,.90,.12,.95,'#b0b0a4');
    }else{
     if(!model('wall',x,0,z+.43,.80,2.36,.89))box(x,1.18,z+.43,.82,2.36,.9,'#707b7e');
    }
   }
   box(x,2.35,9.7,.88,.20,8.3,'#89918b');
  }
  // Structural posts sit BEHIND the bars and mark the cell corners.
  for(const x of [6.5,18.5])for(const z of [5.3,13.55]){
   cylinder(x,.05,z,.21,.23,2.35,'#777f7f',11);
   cylinder(x,2.37,z,.28,.28,.16,'#a2a79b',11);
  }
  // Comfortable visual breathing room: each of the three cells has a distinguishable occupant or object.
  bed(9.4,7.0);toilet(16.4,10.5);
  cylinder(16.4,.025,10.5,.65,.65,.07,'#626e73',12);
  // Sleeping guard's cot belongs to the corridor, not Oliver's prison cell.
  box(12.2,.18,2.43,3.6,.18,1.14,'#536066');
  box(12.2,.35,2.43,3.32,.12,1.02,'#807c73');
  box(13.35,.48,2.45,.53,.13,.85,'#9b998d');
  if(scene==='intro'){
   // The guard is still AWAKE when Oliver is imprisoned.
   piece(12.1,2.38,'R','black',false);
  }else{
   // A real rook chess piece lies horizontally across the cot, with a visible turret silhouette.
   recliningPiece(12.18,2.43,'R','black');
   // Shut eyes toward the camera while the rook sleeps.
   for(const ex of [12.72,13.04])box(ex,.90,2.89,.16,.028,.035,'#d5c6ae');
  }
  box(11.1,.61,2.7,.34,.19,.43,'#48566d');
  // Mara and Tovin: recognisable chess-piece silhouettes, one in each neighbouring cell.
  piece(3.5,9.2,'P','white',false);features(3.5,9.2,'P','white',false,'scholar');
  box(3.5,.46,9.47,.53,.39,.13,'#697e91');
  piece(21.0,9.1,'P','black',false);features(21.0,9.1,'P','black',false,'scholar');
  box(21.0,.45,9.38,.56,.39,.14,'#746e75');
  box(2.45,.25,11.55,1.65,.35,.90,'#778089');box(20.7,.16,11.8,1.4,.28,.75,'#555e63');
  // A SMALL, unmistakeable window cut into the solid southern stone wall.
  // There are no wall-length iron bars across the bottom of Oliver's cell.
  for(let x=7;x<=17;x+=.96){
   if(Math.abs(x-12.5)<1.20)continue;
   if(!model('wall',x,0,14.38,.97,2.25,.68))box(x,1.1,14.38,.97,2.2,.68,'#818a8c');
  }
  // Stone jambs and a brighter blue inset make it immediately recognisable as a window, not a third door.
  box(12.5,.59,13.79,2.10,.06,.37,'#b4aea0');
  // Dark recess with a blue sky, distant castle towers and one bright moon.
  box(12.5,1.27,14.35,1.90,.92,.12,'#1c3041');box(12.5,2.09,14.20,2.15,.13,.48,'#a6aba2');
  box(12.5,1.11,14.25,1.80,.25,.04,'#345367');
  sphere(12.98,1.56,14.20,.15,'#e7dfc3',12);
  for(const x of [11.85,12.38])box(x,1.13,14.20,.27,.38,.05,'#2a414b');
  // Heavy dressed-stone lintel, jambs and deep sill make the opening readable from above.
  for(const x of [11.49,13.51])box(x,1.27,14.25,.23,1.21,.48,'#a7aca4');
  box(12.5,1.95,14.23,2.30,.23,.52,'#b4b6a9');
  box(12.5,.63,14.16,2.22,.18,.62,'#b3b0a0');
  box(12.5,.70,13.94,1.73,.055,.31,'#d5c5aa');
  // Cool moonlight pool on the floor, carefully flat and separate from the warm candle.
  for(const [x,z] of [[12.4,12.6],[12.9,12.1],[11.8,12.9]])box(x,.021,z,.44,.012,.69,'#7c9c9f');
  if(scene==='intro'){drawOliver(12.5,9.4);for(const x of [11.4,13.9]){piece(x,7.0,'R','white',false);features(x,7.0,'R','white',false,'guard');}}
  // One readable torch and a small iron pail; never wooden crates or random gate props.
  box(15.3,.85,6.0,.25,.17,.22,'#68767a');torch(15.3,6.0);
  // Remove the previously unreadable circular prop from the lower-left corner.
 }else if(scene==='sewer'){
  const world=engine.getWorld(),wet='#536a6c',ironDark='#42555b';
  // Walls are only modelled along the actual winding walkways; dead ends are visibly solid stone.
  for(let z=1;z<world.height-1;z++)for(let x=1;x<world.width-1;x++){
   if(world.tiles[z][x]!=='H')continue;
   // Seal all visible solid tiles, including inside corners. Sparse GLB wall
   // meshes left walkable-looking holes along the edges of the corridors.
   let exposed=false;
   for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)
    if((dx||dz)&&world.tiles[z+dz]?.[x+dx]==='s')exposed=true;
   if(!exposed)continue;
   box(x+.5,0,z+.5,1.04,2.85,1.04,(x+z)%4===0?'#4c6061':'#536467');
   box(x+.5,2.82,z+.5,1.08,.16,1.08,'#818c87');
   if((x*7+z*5)%13===0){box(x+.5,.13,z+.5,.48,.14,.3,'#577b70');model('stones',x+.5,.01,z+.5,.49,.28,.44);}
   // Damp runs down individual stone joints instead of noisy random block decorations.
   if((x*13+z*17)%23===0){box(x+.28,1.19,z+.02,.075,1.22,.06,'#38534f');box(x+.26,.47,z+.04,.15,.30,.07,'#4c6c61');}
  }
  // Twenty deliberately different hairline crack silhouettes. Drawn just
  // outside the stone face; no altered wall geometry or collision.
  const crackPatterns=[
   [[-.34,.76],[-.18,.58],[-.25,.35],[.04,.17]],
   [[-.2,.89],[.02,.72],[-.08,.59],[.26,.43]],
   [[.29,.81],[.05,.64],[.15,.40],[-.10,.25]],
   [[-.31,.42],[-.08,.56],[.12,.48],[.30,.63]],
   [[-.25,.85],[-.11,.68],[.05,.72],[.13,.50],[.32,.40]],
   [[.33,.80],[.11,.70],[-.02,.50],[-.25,.55]],
   [[-.34,.60],[-.10,.59],[.01,.32],[.25,.31]],
   [[.12,.91],[.02,.72],[.28,.61],[.09,.42]],
   [[-.19,.20],[-.02,.42],[-.13,.59],[.16,.78]],
   [[.33,.31],[.11,.40],[.21,.60],[-.09,.75]],
   [[-.30,.88],[-.07,.79],[-.18,.65],[.05,.55],[.18,.34]],
   [[.05,.22],[.24,.36],[.08,.54],[-.22,.62]],
   [[-.29,.27],[-.11,.46],[.06,.39],[.22,.58],[.06,.74]],
   [[.22,.90],[.03,.76],[-.12,.77],[-.26,.56]],
   [[-.35,.66],[-.09,.52],[-.22,.38],[.06,.31],[.25,.16]],
   [[.31,.72],[.17,.55],[-.01,.61],[-.16,.43],[-.33,.40]],
   [[-.15,.91],[-.30,.73],[-.10,.66],[.09,.48],[.28,.45]],
   [[.31,.24],[.14,.38],[-.04,.36],[-.22,.55],[-.07,.81]],
   [[-.32,.79],[-.13,.78],[.12,.61],[.01,.40],[.27,.33]],
   [[.27,.89],[.09,.72],[.25,.52],[-.03,.34],[-.23,.22]]
  ];
  function crackLine(a,b,face,axis,edge,color){
   if(!tri)return;
   const width=.013,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1;
   const ox=-dy/length*width,oy=dx/length*width;
   const pt=(p,sign)=>axis==='z'?[face+p[0]+ox*sign,p[1]+oy*sign,edge]:
                              [edge,p[1]+oy*sign,face+p[0]+ox*sign];
   tri(pt(a,1),pt(b,1),pt(b,-1),color);
   tri(pt(a,1),pt(b,-1),pt(a,-1),color);
  }
  for(let z=1;z<world.height-1;z++)for(let x=1;x<world.width-1;x++){
   if(world.tiles[z][x]!=='H'||(x*11+z*13)%4!==0)continue;
   const front=world.tiles[z+1]?.[x]==='s',back=world.tiles[z-1]?.[x]==='s';
   const right=world.tiles[z]?.[x+1]==='s',left=world.tiles[z]?.[x-1]==='s';
   if(!front&&!back&&!left&&!right)continue;
   const pattern=crackPatterns[(x*17+z*31)%20],axis=front||back?'z':'x';
   const face=(axis==='z'?x:z)+.5,edge=axis==='z'?z+(front?1.027:-.027):x+(right?1.027:-.027);
   const ybase=.38+((x*3+z*7)%7)*.22;
   const variant=(x*7+z*3)%3,color=variant===0?'#2e4545':variant===1?'#374b49':'#354b4f';
   for(let k=1;k<pattern.length;k++){
    const a=[pattern[k-1][0],ybase+pattern[k-1][1]*.68];
    const b=[pattern[k][0],ybase+pattern[k][1]*.68];
    crackLine(a,b,face,axis,edge,color);
   }
   if((x+z)%5===0){
    const p=pattern[1],junction=[p[0],ybase+p[1]*.68];
    crackLine(junction,[p[0]+.13,junction[1]-.19],face,axis,edge,'#415957');
   }
  }
  // Drain rims help distinguish real water tiles from walkable stone.
  for(let z=2;z<world.height-2;z++)for(let x=2;x<world.width-2;x++){
   if(world.tiles[z][x]!=='w')continue;
   if(world.tiles[z][x-1]==='s'||world.tiles[z][x+1]==='s')
    box(x+.5,.03,z+.5,.18,.065,.92,'#7b8780');
  }
  // The foul outlet pipe at the western spawn: a recognisable circular bore and iron rim.
  const pipeX=3.55,pipeY=.95,pipeZ=25.5;
  for(let i=0;i<16;i++){
   const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
   const vertex=(r,t)=>[pipeX,pipeY+Math.sin(t)*r,pipeZ+Math.cos(t)*r];
   if(tri){
    tri(vertex(.61,a),vertex(.61,b),vertex(.43,b),'#8b9184');
    tri(vertex(.61,a),vertex(.43,b),vertex(.43,a),'#8b9184');
    tri(vertex(.42,a),vertex(.42,b),[pipeX-.05,pipeY,pipeZ],'#172d34');
   }
  }
  for(const x of [3.55,4.0])cylinder(x,.06,25.5,.54,.54,.08,'#6c7978',14);
  // Dirt, sediment and DetailPlus rubble in little wall recesses, away from the walkable strip.
  for(const [x,z] of [[9,22],[19,7],[27,13],[35,35],[52,10],[67,28],[42,43],[24,35]]){
   model('stones',x,.01,z,.75,.23,.62);
   box(x,.01,z+.25,.52,.012,.18,'#344e43');
  }
  // Thin drainage pipes with collars, rusty runs and visibly cracked, dirty walls.
  for(let z=2;z<world.height-2;z++)for(let x=2;x<world.width-2;x++){
   if(world.tiles[z][x]!=='H'||![[x-1,z],[x+1,z],[x,z-1],[x,z+1]].some(([a,b])=>world.tiles[b]?.[a]==='s'))continue;
   if((x*7+z*11)%9===0){
    const front=world.tiles[z+1]?.[x]==='s';
    box(x+.5,.95,z+(front?.96:.5),.075,1.60,.045,'#334a46');
    box(x+.58,.47,z+(front?.99:.5),.10,.54,.052,'#263d37');
    for(let n=0;n<3;n++)box(x+.23+n*.25,.21,z+(front?.99:.5),.20,.065,.05,'#465d4d');
   }
   if((x*5+z*3)%11===0){
    const front=world.tiles[z+1]?.[x]==='s';
    const zz=z+(front?1.035:.5);
    box(x+.26,.73,zz,.035,.78,.04,'#2e4545');
    box(x+.39,.49,zz,.28,.035,.04,'#283b3d');
    box(x+.53,.29,zz,.035,.38,.04,'#2e4545');
   }
   if((x*11+z*19)%16===0){
    box(x+.5,1.40,z+.5,.68,.24,.08,'#374f4e');
    box(x+.5,.92,z+.5,.46,.18,.082,'#405b50');
   }
  }
  for(const [px,pz] of [[10,25],[18,15],[33,29],[49,20],[64,23],[72,25]]){
   // Slim floor pipes run along passage edges, leaving the walkway open.
   box(px+.5,.075,pz+.91,1.6,.09,.11,'#71817c');
   for(const dx of [-.5,.25])box(px+dx,.085,pz+.91,.12,.14,.16,'#a18e70');
  }
  for(const [x,z] of [[13,27],[23,8],[37,39],[54,16],[70,27]]){
   model('barrel',x,.01,z,.44,.59,.44);
   box(x+.17,.02,z-.20,.33,.025,.47,'#526559');
  }
  // No large gold wheels and no lamps in this dark sewer.
  // The long-lost sewer creature has a distinct silhouette, luminous eyes and a ring of tendrils.
  model('stones',49.4,.15,38.4,1.50,1.38,1.29);model('stones',49.38,1.13,38.4,1.02,.82,.93);
  for(const x of [49.12,49.70]){sphere(x,1.43,38.84,.13,'#e6c178',10);sphere(x,1.44,38.96,.045,'#26353e',8);}
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;cone(49.4+Math.cos(a)*.64,.24,38.4+Math.sin(a)*.64,.14,.63,'#4f7771',7);}
  for(const [x,z] of [[48.7,37.9],[50.2,38.1]])model('stones',x,0,z,.48,.28,.38);
   for(const [x,z,s] of [[23.4,31.5,.43],[23.08,31.34,.28],[23.74,31.44,.30]])sphere(x,.60,z,s,'#526b61',11);
   for(const x of [23.24,23.58])sphere(x,1,31.9,.10,'#e7b675',9);
   for(let i=0;i<5;i++)cone(23.4+(i-2)*.19,.86,31.15,.13,.48,'#41584d',7);
   for(const [x,z,w] of [[40.3,45.3,1.25],[41,45.7,.95],[39.7,45.9,.80]]){model('stones',x,.02,z,w,.56,w*.86);box(x,.20,z+.25,w*.7,.13,w*.35,'#675c4a');}model('barrel',40.8,.04,45.9,.47,.42,.43);
  // The end of the sewer has a real iron LADDER to an overhead hatch: no arch or altar.
  box(76.5,2.97,25.5,2.00,.17,1.26,'#8a9695');
  box(76.5,2.76,25.5,1.52,.12,.92,'#1a3034');
  for(const x of [76.05,76.95])cylinder(x,.15,25.4,.069,.069,2.72,'#657e83',10);
  for(let y=.35;y<=2.75;y+=.30){
   box(76.5,y,25.48,.99,.064,.12,'#b0a68d');
   box(76.5,y+.045,25.48,.88,.025,.11,'#d2c5a6');
  }
  box(76.5,.08,25.5,2.15,.15,1.50,'#637373');
  for(const x of [69,73])model('stones',x,0,27.75,.55,.31,.58);
 }else if(scene==='watchtower'){drawWatchtowerInterior(g);return;}
 if(scene==='ridge'||scene==='hill'||scene==='ruins'||scene==='observatory'||scene==='skyglassInterior'){
  const w=engine.getWorld(),isTree=(x,z)=>w.tiles[z]?.[x]==='T';
  // Trees are placed only on solid forest tiles. Foliage uses existing meshes
  // rather than nearly coplanar overlays, so no animated z-fighting is introduced.
  for(let z=1;z<w.height-1;z++)for(let x=1;x<w.width-1;x++)
   if(scene!=='skyglassInterior'&&isTree(x,z)&&((x<=3||z<=3||x>=w.width-4||z>=w.height-4)||(x*3+z*5)%3!==0))g.tree?.(x+.5,z+.5);
  const rock=(x,z,scale=1)=>{box(x,.12*scale,z,.74*scale,.24*scale,.64*scale,'#737f79');box(x,.29*scale,z,.50*scale,.10*scale,.47*scale,'#9ca59a');};
  // The previous blank green world edge is now an actual scenic barrier.
  // Keep the connected gates open at map transitions.
  const gate=(x,z)=>scene==='ridge'&&((x<=1&&z>=17&&z<=23)||(x>=w.width-2&&z>=17&&z<=23)||(z>=w.height-2&&x>=8&&x<=14))
   ||scene==='hill'&&((x<=1&&z>=26&&z<=33)||(x>=w.width-2&&z<=8))
   ||scene==='ruins'&&z<=1&&x>=14&&x<=22
   ||scene==='observatory'&&z>=w.height-2&&x>=13&&x<=21
   ||scene==='skyglassInterior'&&z>=w.height-2&&x>=25&&x<=35;
  if(scene!=='skyglassInterior')for(let z=0;z<w.height;z++)for(let x=0;x<w.width;x++){
   if(x!==0&&x!==w.width-1&&z!==0&&z!==w.height-1)continue;
   if(gate(x,z))continue;
   const wx=x+.5,wz=z+.5,k=(x*7+z*13)%4;
   // Tall, dark foliage and irregular rocks hide the abrupt tile edge.
   if(k!==0)g.tree?.(wx,wz);
   else{
    box(wx,.14,wz,.94,.28,.89,scene==='hill'?'#696c63':'#515e51');
    cone(wx,.34,wz,.52,1.10,scene==='hill'?'#8e8b76':'#526c53',8);
   }
  }
  const lamp=(x,z,blue=false)=>{
   cylinder(x,.06,z,.085,.09,1.2,'#735e48',9);
   box(x,1.31,z,.24,.18,.24,'#b59c69');
   sphere(x,1.48,z,.14,blue?'#93d5e1':'#efc581',9);
   cone(x,1.68,z,.20,.24,'#4f5e61',9);
  };
  // Chapter Two detail pass: small, repeatable scenery exclusively on
  // non-walkable ground, with open exits and clear character pathways.
  // These props are static and use shallow separated surfaces to prevent shimmer.
  if(scene!=='skyglassInterior'){
   const grass=(x,z,i)=>{
    for(let k=0;k<3;k++)cone(x+(k-1)*.16,.035,z+(k%2)*.13,.09,.28+(i%3)*.035,k%2?'#6f8755':'#567553',6);
   };
   const mushroom=(x,z,i)=>{
    cylinder(x,.04,z,.052,.052,.18,'#d6c5a9',7);
    cone(x,.23,z,.18,.13,i%2?'#a96d51':'#b99a72',8);
    for(const dx of [-.055,.055])sphere(x+dx,.31,z+.08,.018,'#eddbb1',6);
   };
   const flowers=(x,z,i)=>{
    cylinder(x,.05,z,.035,.035,.23,'#597953',6);
    for(let petal=0;petal<4;petal++){
     const a=petal*Math.PI/2;
     sphere(x+Math.cos(a)*.095,.34,z+Math.sin(a)*.095,.065,i%3===0?'#e1c49a':i%3===1?'#a6b9d4':'#d9b6c6',7);
    }
    sphere(x,.345,z,.065,'#e8c66c',7);
   };
   for(let i=0;i<90;i++){
    const x=2+((i*17+Math.floor(i/7)*7)%(w.width-4));
    const z=2+((i*13+Math.floor(i/11)*9)%(w.height-4));
    const tile=w.tiles[z]?.[x],groundOnly=tile==='.'||tile==='T';
    if(!groundOnly)continue;
    const xx=x+.48+(i%3-1)*.09,zz=z+.46+(i%5-2)*.08;
    if(i%7===0)mushroom(xx,zz,i);
    else if(i%4===0)flowers(xx,zz,i);
    else grass(xx,zz,i);
   }
  }
  // Second environmental detail pass: deliberate visual storytelling without
  // editing collision tiles or putting high props on the paths.
  const twig=(x,z,a=0)=>{
   box(x,.045,z,.48,.06,.09,'#68553d');
   box(x+.15,.075,z+.12,.28,.04,.07,'#856744');
   sphere(x-.22,.14,z+.09,.10,a%2?'#a3a078':'#637855',7);
  };
  const fern=(x,z)=>{
   cylinder(x,.04,z,.042,.042,.31,'#59734e',6);
   for(let j=0;j<5;j++){
    const theta=j*Math.PI*2/5;
    cone(x+Math.cos(theta)*.23,.11,z+Math.sin(theta)*.23,.16,.39,j%2?'#6e915f':'#53774c',7);
   }
  };
  const butterflyRest=(x,z,i)=>{
   box(x,.23,z,.04,.20,.05,'#574b43');
   sphere(x-.12,.39,z,.12,i%2?'#cda36b':'#a6b1cf',8);
   sphere(x+.12,.39,z,.12,i%2?'#e3c588':'#ccb5cc',8);
  };
  if(scene!=='skyglassInterior'){
   for(let i=0;i<85;i++){
    const x=3+((i*23+Math.floor(i/8)*5)%(w.width-6));
    const z=3+((i*29+Math.floor(i/9)*3)%(w.height-6));
    if(!['.','T'].includes(w.tiles[z]?.[x]))continue;
    const px=x+.42,pz=z+.43;
    if(i%9===0)butterflyRest(px,pz,i);
    else if(i%3===0)twig(px,pz,i);
    else fern(px,pz);
   }
  }
  // Fine environmental finish: grounded, deterministic nature detail on non-road tiles.
  // Keeps navigable routes, NPC positions and teleport thresholds untouched.
  const decorativeTile=(x,z)=>['.','T'].includes(w.tiles[Math.floor(z)]?.[Math.floor(x)]);
  const fallenBranch=(x,z)=>{box(x,.07,z,.68,.11,.12,'#665039');box(x+.27,.11,z-.12,.27,.07,.10,'#896745');};
  const wildBerry=(x,z,i)=>{
   for(const dx of [-.23,0,.23]){
    cone(x+dx,.03,z,.19,.43,'#52734e',7);
    sphere(x+dx,.39,z+.06,.085,i%2?'#b26d69':'#a387b7',8);
   }
  };
  const leafPile=(x,z,i)=>{
   for(let j=0;j<5;j++){
    const theta=j*1.25;
    box(x+Math.cos(theta)*.18,.07+j*.013,z+Math.sin(theta)*.16,.22,.055,.16,j%3===0?'#a58d59':j%3===1?'#826d4d':'#6b8359');
   }
  };
  if(scene!=='skyglassInterior')for(let i=0;i<74;i++){
   const x=3+((i*31+Math.floor(i/9)*7)%(w.width-6));
   const z=3+((i*17+Math.floor(i/6)*11)%(w.height-6));
   if(!decorativeTile(x,z))continue;
   const px=x+.5,pz=z+.5;
   if(i%6===0)fallenBranch(px,pz);
   else if(i%3===0)wildBerry(px,pz,i);
   else leafPile(px,pz,i);
  }
  if(scene==='ridge'){
   // Three named directions meet at an unmistakable central signpost.
   for(const [x,z] of [[6,16],[12,15],[23,11],[13,29],[26,26],[33,16],[37,24]])rock(x+.5,z+.5,.78);
   for(const [x,z] of [[6.5,21.9],[16.5,11],[10.4,29.5],[30.5,22]])lamp(x,z);
   cylinder(17.5,.08,21,.18,.20,2.5,'#73583b',10);
   box(17.5,2.22,21,1.55,.26,.20,'#c5a275');
   box(17.5,1.86,21,1.85,.24,.20,'#ae855b');
   box(17.5,1.50,21,1.55,.23,.20,'#c4a075');
   for(const [x,z] of [[14,20],[19,24],[24,18]]){cylinder(x,.04,z,.27,.27,.22,'#695b46',9);cone(x,.28,z,.31,.35,'#476c52',9);}
   // Travelers' abandoned woodland campsite, harmless fireflies and dry wood.
   for(const [x,z] of [[8,27],[28,29],[35,13]]){
    box(x,.13,z,1.1,.26,.69,'#775b42');
    box(x,.29,z,.92,.07,.49,'#aa8761');
    for(const dx of [-.48,.48])cylinder(x+dx,.07,z,.07,.07,.52,'#594738',7);
    for(const k of [-1,1])mushroomMarker(x+k*.55,z+.75,k);
   }
   function mushroomMarker(x,z,k){cylinder(x,.04,z,.06,.06,.20,'#d4be9c',7);cone(x,.25,z,.17,.12,k>0?'#a87c58':'#bd9174',7);}
   for(const [x,z] of [[5,14],[23,28],[37,11]]){
    cylinder(x,.07,z,.20,.20,.32,'#765a43',8);
    cone(x,.43,z,.30,.20,'#ad8053',8);
    for(const dx of [-.12,.12])box(x+dx,.46,z,.10,.045,.14,'#d8bb84');
   }
   // Story props along the branching woods: broken lanterns, old cairns and
   // a fox's abandoned den, all placed outside the main road.
   for(const [x,z] of [[7,12],[31,10],[36,32]]){
    cylinder(x,.07,z,.43,.43,.12,'#70776a',10);
    cylinder(x,.21,z,.32,.32,.13,'#909688',10);
    cylinder(x,.35,z,.21,.21,.13,'#b0aa91',9);
    sphere(x,.57,z,.10,'#cabd9b',8);
   }
   for(const [x,z] of [[4,31],[29,7]]){
    box(x,.19,z,1.7,.38,.86,'#755e45');
    box(x,.43,z,1.36,.10,.62,'#a8885f');
    for(let j=0;j<3;j++)fern(x-.48+j*.44,z+.54);
   }
   for(const [x,z] of [[38,12],[6,32],[30,32]]){
    cylinder(x,.06,z,.21,.21,.32,'#69543e',10);
    sphere(x,.52,z,.27,'#526d48',9);
    sphere(x+.19,.64,z+.08,.18,'#6b8052',9);
   }
   // Old woodland history: boundary cairns, weathered bridge stakes and berry thickets.
   for(const [x,z] of [[5,27],[13,10],[27,30],[36,14]]){
    cylinder(x,.08,z,.29,.29,.25,'#77796b',10);
    cylinder(x,.38,z,.23,.23,.26,'#a7a18a',10);
    cone(x,.69,z,.19,.26,'#817e69',8);
   }
   for(const [x,z] of [[7,29],[28,8],[38,30]]){
    for(let j=0;j<3;j++){cylinder(x+j*.41,.04,z,.10,.11,.58,'#785b41',8);sphere(x+j*.41,.70,z,.12,'#a48b68',8);}
   }
   // Old hunter's shrine and braided roots tucked well away from the roads.
   for(const [x,z] of [[8,8],[36,27]]){
    box(x,.16,z,1.28,.32,.98,'#777260');
    box(x,.39,z,1.12,.13,.82,'#b3a78b');
    cylinder(x,.48,z,.21,.21,1.13,'#88705a',10);
    box(x,1.71,z,.94,.16,.33,'#b49e73');
    box(x,1.22,z,.29,1.07,.21,'#a78d67');
    for(const dx of [-.43,.43])cone(x+dx,.11,z+.53,.26,.67,'#547b59',9);
   }
   for(const [x,z] of [[4,8],[34,10],[28,35]]){
    for(let j=0;j<4;j++){
     box(x+j*.23,.09,z+(j%2)*.24,.43,.12,.15,j%2?'#786a4d':'#685840');
     sphere(x+j*.21,.18,z+.42,.14,j%2?'#768652':'#b19963',8);
    }
   }
   // The blocked cave is deliberately outside the walking path.
   box(20.5,.42,2.8,6.8,.84,1.7,'#525e5f');
   for(const [x,z,scale] of [[18.1,5,.9],[19.5,5,1.15],[21,4.9,1],[22.4,5,.85],[20,3.8,1.3]]){
    rock(x,z,scale);
    cone(x,.25,z,.40*scale,.65*scale,'#61716c',7);
   }
   box(20.5,1.12,3.34,3.5,.22,.32,'#343c44');
   box(20.5,1.45,3.32,3.0,.20,.24,'#738a86');
  }else if(scene==='hill'){
   for(const [x,z] of [[7,32],[15,20],[24,16],[35,11],[40,4]])lamp(x+.5,z+.5,true);
   for(const [x,z,sc] of [[4,23,1.1],[15,31,1.4],[22,21,1],[33,18,1.7],[40,14,1.1]])rock(x,z,sc);
   // Raised-looking terrain details remain decorative and do not change walk physics.
   for(const [x,z] of [[11,20],[20,12],[31,7]]){
    box(x,.09,z,2.8,.18,.95,'#7c8276');
    box(x,.20,z,2.5,.04,.74,'#acaa94');
   }
   for(const [x,z] of [[10,27],[18,19],[29,12],[38,6]]){box(x,.09,z,.80,.18,.65,'#9f9981');box(x,.21,z,.64,.05,.51,'#c0b49a');}
   // Fern-covered slopes, stacked cairns, mountain lanterns and tiny shrines.
   for(const [x,z] of [[4.7,19],[15,13],[25,28],[37,17]]){
    cylinder(x,.06,z,.26,.26,.17,'#73776d',10);
    cylinder(x,.24,z,.18,.18,.15,'#a6a18a',10);
    sphere(x,.47,z,.16,'#c4b396',8);
   }
   for(const [x,z] of [[13,33],[20,30],[36,22]]){
    cylinder(x,.06,z,.33,.33,.56,'#7f8274',10);
    box(x,.69,z,.74,.16,.60,'#b9aa87');
    cone(x,1.11,z,.36,.48,'#71856e',9);
   }
   for(const [x,z] of [[5,25],[16,10],[31,24]]){
    box(x,.16,z,1.2,.31,.83,'#695943');
    box(x,.37,z,1.0,.08,.66,'#a98b62');
    for(const dx of [-.35,.35])sphere(x+dx,.51,z,.13,'#72906a',8);
   }
   // Mountain guide markers, carved milestone stones and herb-filled crevices.
   for(const [x,z] of [[6,26],[15,29],[27,14],[37,8]]){
    cylinder(x,.10,z,.29,.29,.75,'#867e69',12);
    box(x,.88,z,.75,.16,.48,'#c3ae89');
    box(x,.98,z,.38,.07,.51,'#6e785d');
    for(let j=0;j<2;j++)fern(x-.42+j*.84,z+.53);
   }
   for(const [x,z] of [[13,12],[20,33],[36,25]]){
    box(x,.20,z,1.6,.39,.9,'#696b62');
    box(x,.52,z,1.19,.17,.77,'#9b9a87');
    for(let j=0;j<4;j++)cone(x-.51+j*.32,.65,z+.18,.13,.35,'#567a54',7);
   }
   // Pilgrims left votive stones and weathered trail lanterns on the upper slope.
   for(const [x,z] of [[5,10],[19,31],[34,23]]){
    cylinder(x,.08,z,.34,.34,.35,'#807d6c',10);
    box(x,.49,z,.67,.16,.61,'#b9ad8d');
    cone(x,.73,z,.31,.39,'#777a68',9);
    for(let j=0;j<3;j++)leafPile(x-.65+j*.37,z+.72,j);
   }
   for(const [x,z] of [[7,20],[23,12],[37,28]]){
    box(x,.10,z,1.10,.18,.72,'#756f5e');
    box(x,.24,z,.80,.07,.61,'#a59e88');
    for(const dx of [-.32,.32])cone(x+dx,.32,z+.40,.17,.41,'#66835c',8);
   }
   // Pilgrim trail: carved waymarkers, a mountain rest bench and alpine sprigs.
   for(const [x,z] of [[5,5],[16,32],[40,19]]){
    box(x,.28,z,.60,.56,.45,'#817d6f');
    box(x,.66,z,.76,.18,.57,'#b9aa8a');
    for(const dx of [-.18,.18])box(x+dx,.79,z+.31,.085,.11,.06,'#5e695b');
    for(let j=0;j<3;j++)cone(x-.46+j*.38,.08,z+.64,.17,.43,'#6c8661',7);
   }
   for(const [x,z] of [[11,32],[37,25]]){
    for(const dx of [-.72,.72])box(x+dx,.27,z,.17,.54,.38,'#806146');
    box(x,.57,z,1.77,.16,.49,'#a17d58');
    box(x,.70,z,1.55,.10,.39,'#be996b');
   }
   // Weathered pilgrim walls, cliff steps and wind-carved overlooks.
   for(const [x,z] of [[12,20],[23,26],[32,16]]){
    for(let i=0;i<5;i++)box(x+i*.58,.10,z,.57,.21,.62,i%2?'#7f8275':'#a69e87');
    for(let i=0;i<4;i++)box(x+i*.58+.26,.34,z,.53,.20,.55,'#847b69');
   }
   for(const [x,z] of [[14.3,19.6],[23.7,20.1],[34.8,8.6]]){
    cylinder(x,.07,z,.24,.24,.56,'#817760',9);
    box(x,.65,z,.80,.20,.59,'#b4a486');
    cone(x,.94,z,.25,.37,'#6c7d61',8);
   }
   for(const [x,z] of [[6,15],[11,14],[18,10],[24,8],[32,27],[39,18]]){
    rock(x,z,1.45);
    for(let i=0;i<3;i++)cone(x-.65+i*.44,.06,z+.56,.21,.42,'#607d59',7);
   }
   for(const [x,z] of [[5,7],[12,6],[24,30],[34,29]]){
    cylinder(x,.03,z,.18,.18,1.5,'#65533c',9);
    cone(x,1.48,z,.66,1.25,'#4b7554',9);
   }
  }else if(scene==='ruins'){
   // An open ancient sanctuary with broken arches, fallen capitals and an altar.
   for(const [x,z] of [[8,12],[12,12],[24,12],[28,12],[8,24],[12,24],[24,24],[28,24]]){
    box(x,.68,z,.70,1.36,.73,'#8b958d');
    box(x,1.445,z,.83,.08,.84,'#c0bdb0');
   }
   for(const [x,z] of [[10,17],[26,17]]){
    cylinder(x,.07,z,.55,.52,1.36,'#849187',12);
    cylinder(x,1.47,z,.66,.66,.18,'#bbb8aa',12);
   }
   for(const [x,z] of [[6,18],[28,20],[15,28],[23,28]])rock(x,z,1.2);
   // Relics from an ancient pilgrimage: broken sacrificial bowls, carved
   // weathering, toppled ceremonial slabs and winding ivy.
   for(const [x,z] of [[5,9],[30,11],[6,28],[29,28]]){
    box(x,.20,z,1.48,.38,1.03,'#777a70');
    box(x,.47,z,1.27,.13,.89,'#a6a391');
    for(let j=0;j<3;j++)box(x-.40+j*.38,.55,z+.36,.13,.08,.12,'#545d53');
    fern(x+.81,z+.12);
   }
   for(const [x,z] of [[11,19],[25,19],[18,29]]){
    cylinder(x,.07,z,.33,.33,.31,'#92775e',10);
    cylinder(x,.37,z,.36,.36,.10,'#c0a080',10);
    box(x+.38,.10,z+.31,.44,.18,.35,'#a68b70');
   }
   // Excavation details: broken urns, scattered stones, worn steles and ivy.
   for(const [x,z] of [[5.5,11],[29.5,10],[5.5,25],[29.5,26]]){
    cylinder(x,.07,z,.34,.33,.34,'#936f54',10);
    cylinder(x,.43,z,.27,.27,.12,'#c7a27a',10);
    sphere(x,.58,z,.18,'#ad8668',9);
   }
   for(const [x,z] of [[12,6],[23,6],[4,16],[31,18],[13,29],[23,29]]){
    box(x,.11,z,.84,.22,.62,'#767b70');
    box(x+.14,.26,z-.08,.43,.08,.28,'#a5a296');
    for(let k=0;k<3;k++)cone(x-.22+k*.22,.06,z+.32,.12,.37,'#618262',7);
   }
   for(const [x,z] of [[9,15],[27,23],[19,28]]){
    cylinder(x,.06,z,.34,.34,.21,'#777464',12);
    cylinder(x,.27,z,.22,.22,.37,'#a8a18b',12);
    cone(x,.66,z,.28,.26,'#617a60',10);
   }
   // Excavated fragments: fallen stone rings and small grave offerings.
   for(const [x,z] of [[6,7],[29,7],[4,22],[31,23],[7,28],[28,28]]){
    cylinder(x,.08,z,.37,.37,.19,'#827a68',10);
    cylinder(x,.30,z,.26,.26,.09,'#a79d84',10);
    for(const dx of [-.28,.28])sphere(x+dx,.45,z,.13,'#b19a73',8);
   }
   for(const [x,z] of [[13,6],[24,6],[6,27],[29,26]]){
    box(x,.13,z,.94,.25,.63,'#6c716a');
    box(x,.33,z,.66,.12,.48,'#9d9e89');
    wildBerry(x+.68,z+.34,2);
   }
   // Additional ancient workmanship: engraved steles, votive urns and
   // broken keystones outside the sanctuary's north-south aisle.
   for(const [x,z] of [[6,10],[30,12],[6,26],[30,27]]){
    box(x,.57,z,.83,1.14,.56,'#797e73');
    box(x,1.21,z,.96,.14,.67,'#aba996');
    for(const dx of [-.19,.19])box(x+dx,.81,z+.29,.065,.38,.055,'#b6b199');
    box(x,.53,z+.30,.56,.065,.055,'#b6b199');
    for(let i=0;i<2;i++)cone(x-.31+i*.62,.06,z+.47,.20,.47,'#587658',7);
   }
   for(const [x,z] of [[5,14],[31,15],[8,28],[27,28]]){
    cylinder(x,.08,z,.26,.26,.24,'#866c58',10);
    cylinder(x,.33,z,.30,.30,.10,'#bc9773',10);
    box(x+.43,.09,z+.18,.34,.18,.39,'#9e8470');
   }
   // Horse of the Lost Crown: central weathered equestrian monument on a
   // proper collision plinth, with an open approach around both flanks.
   const hx=18,hz=18;
   box(hx,.14,hz,3.20,.28,3.38,'#74766c');
   box(hx,.47,hz,2.96,.17,3.12,'#b2a991');
   box(hx,.70,hz,2.42,.29,2.58,'#8b897b');
   for(const dx of [-.52,.52])for(const dz of [-.65,.65]){
    cylinder(hx+dx,1.04,hz+dz,.23,.26,1.22,'#a8a69a',10);
    box(hx+dx,1.02,hz+dz+.10,.52,.18,.59,'#666e68');
   }
   box(hx,2.18,hz,1.65,.94,2.20,'#9a9d93');
   sphere(hx,3.12,hz+.69,.59,'#b2b1a3',12);
   box(hx,3.24,hz+1.04,.74,1.25,.67,'#a4a597');
   box(hx,4.01,hz+1.33,.72,.62,.79,'#bcb9a9');
   box(hx,3.79,hz+1.70,.56,.24,.54,'#a9ab9e');
   for(const dx of [-.25,.25]){
    cone(hx+dx,4.35,hz+1.25,.13,.44,'#969b8f',8);
    sphere(hx+dx,4.02,hz+1.73,.065,'#444d4b',7);
   }
   for(let k=0;k<5;k++)cone(hx-.70+k*.08,3.09+k*.15,hz+.72,.12,.36,'#747f77',7);
   box(hx,2.86,hz-1.13,.35,.83,.39,'#858e85');
   for(const dx of [-1.19,1.19])for(const dz of [-1.23,1.23])
    sphere(hx+dx,.63,hz+dz,.13,'#637b60',8);
   // Stonehenge-like sanctuary: eight monoliths around a ritual clearing.
   // Horizontal lintels are solidly above uprights, never coplanar.
   for(const [x,z] of [[10,9],[14,8],[22,8],[26,9],[8,17],[28,17],[10,26],[26,26]]){
    box(x,1.20,z,1.12,2.40,.89,'#85877d');
    box(x,2.53,z,1.30,.20,1.03,'#b5b2a0');
    box(x-.09,.18,z+.17,.88,.34,.67,'#71786f');
    for(let k=0;k<3;k++)sphere(x-.42+k*.36,.25,z+.49,.17,'#668369',8);
   }
   for(const [ax,bx,z] of [[10,14,8.5],[22,26,8.5],[8,10,17],[26,28,17],[10,14,26],[22,26,26]]){
    const span=Math.abs(bx-ax);
    box((ax+bx)/2,2.61,z,span+1.25,.47,1.12,'#a19e92');
    box((ax+bx)/2,2.92,z,span+.92,.08,.82,'#bbb6a4');
   }
   // A partially fallen monumental arch lies off the central north-south aisle.
   for(const [x,z] of [[6.6,16],[29.3,16]]){
    box(x,.27,z,1.65,.54,1.23,'#777c70');
    box(x,.65,z,.98,.22,1.01,'#a5a590');
   }
   // The stone altar has its inscription on a raised top, not intersecting a slab.
   box(18,.25,24,2.1,.5,1.8,'#686e6c');
   box(18,.55,24,2.35,.10,1.95,'#aaa99b');
   box(18,.725,24,1.55,.06,1.13,'#cfbd92');
   for(const x of [17.5,18,18.5])box(x,.79,24,.10,.025,.45,'#6b7a75');
   // Moss, broken pottery, ivy and garden beds soften the empty grey masonry.
   for(const [x,z] of [[8,12],[12,12],[24,12],[28,12],[8,24],[12,24],[24,24],[28,24]]){
    for(let i=0;i<3;i++){
     const off=i*.11-.12;
     cone(x+off,.79,z+.42,.15,.29,'#638464',7);
     sphere(x+off,1.02,z+.43,.12,i===1?'#a0a65f':'#658b6c',7);
    }
   }
   for(const [x,z] of [[9,10],[26,11],[9,26],[26,26],[6,20],[29,20]]){
    box(x,.09,z,.92,.18,.70,'#806d56');
    box(x,.235,z,.71,.035,.50,'#9e8a71');
    for(let i=0;i<3;i++)sphere(x-.25+i*.24,.38,z,.19,i%2?'#587c52':'#7e9968',8);
   }
   for(const [x,z] of [[13,14],[22,15],[14,27],[23,27]]){
    cylinder(x,.05,z,.18,.18,.25,'#947a62',9);
    cylinder(x,.33,z,.26,.26,.09,'#c2a185',9);
    sphere(x,.47,z,.13,'#c4a273',8);
   }
   for(const [x,z] of [[7,14],[28,15],[7,23],[28,23]]){
    box(x,.11,z,1.18,.22,.70,'#776c58');
    box(x,.33,z,.88,.055,.51,'#aaa18b');
   }
   for(const [x,z] of [[14,9],[22,9],[14,25],[22,25]]){cylinder(x,.04,z,.25,.25,.57,'#8c977f',10);sphere(x,.77,z,.27,'#6a876c',9);}
   // Partially collapsed arcade; centre remains an open traversable aisle.
   for(const z of [13,21])for(const x of [7,28]){
    box(x,.60,z,.67,1.2,.75,'#7a8580');
    box(x,1.30,z,.88,.08,.85,'#aaa99c');
   }
  }else if(scene==='observatory'){
   // Monastery life: bundled firewood, courtyard planters and abbey birds.
   for(const [x,z] of [[4.5,18.5],[30.3,20.1]]){
    for(let j=0;j<5;j++){
     cylinder(x+j*.19,.10,z+(j%2)*.18,.12,.12,.70,'#76523a',8);
     sphere(x+j*.19,.84,z+(j%2)*.18,.13,'#a4815c',8);
    }
    box(x+.39,.29,z+.20,1.33,.10,.06,'#b49362');
   }
   for(const [x,z] of [[4.5,10.5],[30.4,10.8],[5.0,26.0],[30.2,26.1]]){
    cylinder(x,.12,z,.36,.36,.33,'#8c846d',10);
    cylinder(x,.48,z,.38,.38,.11,'#b1a286',10);
    for(const dx of [-.22,0,.22])cone(x+dx,.63,z,.16,.35,dx?'#68855a':'#7f9764',8);
   }
   for(const [x,z] of [[4.2,14],[30.5,14]]){
    sphere(x,.57,z,.17,'#9c9485',8);
    cone(x,.33,z,.15,.34,'#6e6e62',8);
    sphere(x-.08,.72,z+.11,.038,'#242d2e',6);
   }
   // Courtyard supplies and monastery garden: barrels, herbs, a stone well.
   for(const [x,z] of [[6,19],[7,19.3],[27,25],[29,25]]){
    cylinder(x,.08,z,.30,.30,.57,'#805b40',10);
    cylinder(x,.68,z,.32,.32,.08,'#b29165',10);
    for(const yy of [.23,.50])cylinder(x,yy,z,.33,.33,.065,'#6e706b',10);
   }
   for(const [x,z] of [[5,13],[29,12],[5,24],[29,24]]){
    box(x,.07,z,1.2,.15,.90,'#77674f');
    box(x,.23,z,1.02,.18,.73,'#755c3f');
    for(const dx of [-.34,0,.34])for(const dz of [-.23,.23]){
     cone(x+dx,.43,z+dz,.16,.47,'#64865a',7);
     sphere(x+dx,.87,z+dz,.09,'#927e9d',7);
    }
   }
   cylinder(5.6,.10,21.5,.69,.69,.68,'#8b8b7c',12);
   cylinder(5.6,.81,21.5,.76,.76,.14,'#c2b79b',12);
   cylinder(5.6,.96,21.5,.49,.49,.06,'#344e52',12);
   for(const xx of [5.0,6.2])cylinder(xx,.97,21.5,.10,.10,1.08,'#7b6544',9);
   box(5.6,2.06,21.5,1.65,.22,.50,'#785c42');
   // Abbey courtyard: tidy firewood stacks, herbal baskets and votive markers.
   for(const [x,z] of [[4.5,16.2],[30.2,19.4]]){
    box(x,.11,z,1.13,.22,.80,'#6c513a');
    for(let j=0;j<5;j++)cylinder(x-.38+j*.19,.30,z,.11,.12,.52,'#96734f',8);
    box(x,.65,z,1.15,.08,.67,'#b08a5c');
   }
   for(const [x,z] of [[5.6,12.4],[29.6,22.3]]){
    cylinder(x,.07,z,.45,.45,.28,'#806b4e',10);
    cylinder(x,.34,z,.48,.48,.08,'#ab906c',10);
    for(let j=0;j<4;j++)cone(x-.31+j*.21,.42,z,.13,.28,'#64865e',7);
   }
   for(const [x,z] of [[4.3,9],[30.8,9]]){
    box(x,.40,z,.82,.80,.68,'#969080');
    box(x,.86,z,.68,.12,.57,'#b9ab8c');
    box(x,1.01,z,.11,.27,.09,'#cbb178');
   }
   // Cloister cloaks, herb-drying racks and a narrow stone sanctuary marker.
   for(const [x,z] of [[4.5,15],[30.1,17]]){
    for(const dx of [-.78,.78])cylinder(x+dx,.07,z,.10,.10,1.55,'#6e503b',8);
    box(x,1.66,z,1.86,.12,.17,'#9f8061');
    for(const dx of [-.50,0,.50]){
     cone(x+dx,.70,z,.16,.61,'#8c9362',8);
     sphere(x+dx,1.37,z,.10,'#b3a36f',8);
    }
   }
   for(const [x,z] of [[5,8],[30,8]]){
    box(x,.49,z,.89,.98,.74,'#8e8d80');
    box(x,1.04,z,1.03,.18,.83,'#c3b89b');
    box(x,1.26,z,.14,.44,.15,'#b9a071');
    box(x,1.39,z,.51,.11,.15,'#b9a071');
   }
   // Skyglass Abbey: rough limestone nave, steep slate roofs, oak doors,
   // cloister arches and a narrow square belfry, not a modern glass dome.
   box(17,.10,10.7,16.1,4.75,10.9,'#a79c81');
   for(const x of [10.0,12.0,14.0,16.0,18.0,20.0,22.0,24.0]){
    box(x,4.91,10.7,1.92,.23,11.10,'#665e5b');
    box(x,5.23,10.7,1.87,.28,10.65,'#494f52');
   }
   // Stepped medieval roof ridge with a copper finial.
   box(17,5.66,10.7,16.7,.28,3.5,'#4a5354');
   box(17,5.98,10.7,16.0,.13,1.35,'#68706e');
   for(const x of [11.4,22.6]){
    // Narrow lancet windows have pale leaded-glass highlights, no flush faces.
    box(x,2.41,16.32,.81,2.55,.20,'#36484b');
    box(x,2.42,16.57,.54,2.28,.10,'#beae7a');
    box(x,2.41,16.70,.09,2.12,.10,'#6f6660');
    box(x,2.41,16.82,.68,.12,.08,'#6f6660');
   }
   // The stone bell tower rises at the rear-left of the nave.
   box(10.2,.09,7.1,4.2,8.8,4.3,'#918e82');
   box(10.2,9.02,7.1,4.8,.35,4.9,'#c1b59a');
   for(const x of [9.35,11.05]){
    box(x,7.18,9.35,.58,1.63,.14,'#303e41');
    box(x,7.19,9.51,.37,1.34,.09,'#baa17c');
   }
   box(10.2,9.51,7.1,3.75,.35,3.80,'#51565a');
   cone(10.2,9.90,7.1,2.50,3.18,'#586366',12);
   sphere(10.2,13.14,7.1,.20,'#b99b57',10);
   // A smaller attached chapter-house wing balances the tower.
   box(24.2,.12,10.1,4.3,3.5,7.9,'#8f9588');
   box(24.2,3.75,10.1,4.8,.31,8.4,'#555d59');
   box(24.2,4.12,10.1,3.2,.22,6.5,'#737771');
   // Door on the south facade. Collision tile D is E-interactable.
   box(17,1.49,16.55,2.7,2.89,.25,'#55473a');
   box(17,1.48,16.86,2.28,2.64,.13,'#7e5938');
   for(const x of [16.45,17.0,17.55])box(x,1.50,16.97,.075,2.41,.08,'#4e3c30');
   sphere(17.78,1.64,17.05,.10,'#d3b36e',8);
   for(const x of [15.08,18.92]){
    cylinder(x,.06,16.96,.28,.28,3.75,'#b6b19c',12);
    cylinder(x,3.95,16.96,.40,.40,.14,'#d2c6a9',12);
   }
   box(17,4.16,17.15,5.3,.26,.40,'#8c7d68');
   // A tiny carved cross high above the entrance.
   box(17,4.65,17.23,.19,.66,.14,'#d0b98d');
   box(17,4.82,17.31,.63,.17,.12,'#d0b98d');
   // Medieval armillary sphere outside the right wing, with concentric
   // offset brass rings and a large central celestial orb.
   cylinder(28,.06,21.4,.78,.78,.47,'#8b826e',14);
   cylinder(28,.57,21.4,.28,.28,1.25,'#9a8a60',12);
   sphere(28,2.40,21.4,.85,'#ad945d',16);
   sphere(28,2.41,21.4,.48,'#536b72',14);
   for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    sphere(28+Math.cos(a)*1.10,2.40+Math.sin(a)*1.10,21.4,.075,'#d0b273',7);
    sphere(28+Math.cos(a)*.77,2.40,21.4+Math.sin(a)*.77,.065,'#c7a36c',7);
   }
   // An early sighting tube on a sturdy oak tripod (not a modern telescope).
   for(const [x,z] of [[6.4,23.3],[7.3,23.3],[6.85,24.1]]){
    cylinder(x,.09,z,.12,.13,1.42,'#76583b',8);
   }
   cylinder(6.85,1.43,23.57,.34,.34,.27,'#af8958',12);
   box(6.85,1.82,23.57,1.90,.34,.54,'#98774f');
   box(6.85,2.03,23.57,1.72,.26,.40,'#c09e65');
   sphere(7.78,1.97,23.57,.22,'#485a5d',12);
   // Low courtyard walls and ancient hedges soften the grounds.
   for(const [x,z] of [[5.0,18],[29.9,16.5],[8,23.2],[25,23.2]]){
    rock(x,z,.95);lamp(x+.7,z+.5);
   }
   for(const [x,z] of [[4,12],[30,12],[5,25],[29,25]]){
    cone(x,.03,z,.72,1.35,'#466b49',10);
    sphere(x,1.21,z,.59,'#65805d',10);
   }
  }else{
   // Cutaway grand star hall: back and side walls frame the vast playable
   // interior without obscuring the camera-facing southern entrance.
   for(let x=8;x<=52;x+=2){
    box(x,.10,7,2.02,.20,1.15,'#7d8986');
    box(x,1.35,7,2.02,2.46,.82,'#879d9c');
    box(x,2.75,7,2.02,.34,1.10,'#d4c6a8');
   }
   for(const x of [8,52])for(let z=9;z<=43;z+=2){
    box(x,.13,z,.92,.26,2.03,'#7f8d8c');
    box(x,1.30,z,.70,2.35,2.03,'#748f92');
    box(x,2.73,z,.98,.28,2.05,'#c9bca6');
   }
   for(const x of [14,46])for(const z of [13,21,31,39]){
    cylinder(x,.05,z,.48,.48,3.1,'#a6a99f',12);
    cylinder(x,3.20,z,.64,.64,.19,'#d7cbac',12);
    box(x,3.46,z,.96,.15,1.05,'#6a8c91');
   }
   // Interior life: incense braziers, illuminated manuscripts and prayer niches.
   for(const [x,z] of [[12,22],[47,22],[12,35],[47,35]]){
    cylinder(x,.08,z,.43,.43,.20,'#5c5954',12);
    cylinder(x,.31,z,.32,.32,.19,'#a38759',12);
    sphere(x,.61,z,.16,'#edc47d',9);
    cone(x,.56,z,.24,.36,'#986c43',10);
   }
   for(const [x,z] of [[21,13],[39,13],[21,38],[39,38]]){
    box(x,.12,z,.88,.24,1.15,'#72523b');
    box(x,.29,z,.93,.10,1.20,'#b48c5c');
    box(x,.40,z,.65,.055,.83,'#e4c99d');
    for(let j=0;j<3;j++)box(x-.18+j*.18,.46,z,.055,.025,.53,'#886e4a');
   }
   for(const [x,z] of [[14,27],[46,27]]){
    cylinder(x,.07,z,.38,.38,.76,'#8b8578',12);
    box(x,.88,z,.89,.12,.72,'#c5b391');
    sphere(x,1.12,z,.28,'#957a52',11);
   }
   // Small medieval lived-in details: scroll trays, desks, glass inkpots,
   // candle holders and a checker-pattern mosaic beside the central aisle.
   for(const [x,z] of [[17,12],[42,12],[17,42],[42,42]]){
    box(x,.17,z,1.35,.31,.82,'#634831');
    box(x,.37,z,1.25,.085,.75,'#af8960');
    box(x-.24,.50,z,.34,.08,.20,'#dac49a');
    box(x+.28,.53,z,.14,.17,.14,'#36484d');
    sphere(x+.28,.72,z,.09,'#a3a58b',8);
   }
   for(const [x,z] of [[22,23],[38,23],[22,35],[38,35]]){
    cylinder(x,.12,z,.16,.16,.61,'#806044',9);
    box(x,.77,z,.68,.12,.44,'#b39867');
    cone(x,.93,z,.12,.28,'#d9ae60',9);
    sphere(x,1.20,z,.085,'#f3d291',8);
   }
   for(let x=24;x<=36;x+=2)for(const z of [18,40]){
    box(x,.025,z,1.76,.07,1.72,(x/2)%2?'#9f9a83':'#726b60');
    box(x,.105,z,1.52,.04,1.40,'#c7b99a');
   }
   // Scriptorium bookcases, oak lecterns, candles, pennants and a tiled chapel.
   // All furniture remains beside the walking aisle.
   for(const x of [10,49])for(const z of [13,18,25,33,39]){
    box(x,.18,z,1.45,.36,2.20,'#543c2c');
    box(x,1.42,z,1.16,2.08,1.92,'#6c4c32');
    for(let shelf=0;shelf<3;shelf++){
     box(x,1.00+shelf*.78,z,1.22,.09,2.04,'#ae855a');
     for(let book=0;book<5;book++)box(x-.35+book*.17,1.18+shelf*.78,z+.51,.11,.33,.45,book%2?'#7c6541':'#8a4e40');
    }
   }
   for(const [x,z] of [[17,16],[42,16],[17,38],[42,38]]){
    box(x,.32,z,1.80,.57,1.05,'#75543a');
    box(x,.67,z,1.97,.13,1.22,'#b89666');
    box(x,.75,z,.90,.04,.65,'#d6bc8a');
    cylinder(x+.67,.80,z,.08,.08,.53,'#afa17f',8);
    sphere(x+.67,1.36,z,.11,'#edc477',8);
   }
   for(const x of [23,37]){
    cylinder(x,.10,45,.38,.38,2.0,'#8b8168',12);
    box(x,2.13,45,.99,.22,.77,'#c1a77b');
    cone(x,2.38,45,.38,.65,'#6a765e',10);
   }
   for(const [x,z] of [[13,10],[46,10],[13,42],[46,42]]){
    box(x,2.2,z,.12,2.0,.46,'#8f473e');
    box(x,2.5,z,.85,.25,.39,'#d9bd79');
   }
   // A broad ornamental runner leading from the doorway to the brass lens.
   for(let z=36;z<=44;z+=2)box(30,-.002,z,3.45,.013,1.70,'#77575e');
   // Manuscript gilding, votive shelves, oak benches and warm lantern niches.
   for(const [x,z] of [[15,15],[44,15],[15,39],[44,39]]){
    box(x,.18,z,1.35,.36,.83,'#6d4a34');
    box(x,.42,z,1.46,.13,.91,'#b18c62');
    for(const dx of [-.48,.48])box(x+dx,.88,z,.18,.90,.18,'#8d7155');
    box(x,.52,z,.66,.055,.48,'#d5b888');
   }
   for(const [x,z] of [[24,10],[36,10],[24,44],[36,44]]){
    box(x,.12,z,.86,.24,.91,'#77614a');
    box(x,.32,z,.70,.11,.73,'#b69b75');
    cylinder(x,.42,z,.10,.10,.38,'#c9b58c',8);
    sphere(x,.86,z,.13,'#ebc884',8);
   }
   // Monastic reading stations and side-chapel reliquaries in the western
   // and eastern galleries, carefully off the main crossing.
   for(const [x,z] of [[16,25],[44,25],[16,32],[44,32]]){
    box(x,.36,z,1.32,.72,.89,'#735239');
    box(x,.78,z,1.44,.16,1.02,'#b18b5d');
    box(x-.19,.91,z,.58,.06,.50,'#e4cfa9');
    box(x+.27,1.04,z,.12,.23,.13,'#8d8067');
    sphere(x+.27,1.34,z,.09,'#f1d38b',8);
   }
   for(const [x,z] of [[12,27],[48,27]]){
    cylinder(x,.12,z,.44,.44,.50,'#8e8570',10);
    box(x,.70,z,.98,.13,.92,'#c8b695');
    box(x,1.08,z,.55,.63,.42,'#9b815a');
    box(x,1.47,z,.64,.12,.49,'#d5bc8f');
   }
   // Skyglass Abbey's great library and scriptorium. Old observatory machinery
   // was removed entirely; the quest ledger remains at (30,11).
   // Massive sandstone columns frame an unobstructed central nave.
   for(const [x,z] of [[19,18],[41,18],[19,29],[41,29],[19,39],[41,39]]){
    cylinder(x,.08,z,.43,.43,2.8,'#988c76',12);
    cylinder(x,2.98,z,.61,.61,.22,'#c6b494',12);
    box(x,3.23,z,1.20,.20,1.20,'#776f5f');
    for(const [dx,dz] of [[-.29,0],[.29,0],[0,-.29],[0,.29]]){
     cone(x+dx,.04,z+dz,.16,.43,'#73846b',7);
    }
   }
   // Raised altar, a stone codex lectern and the royal manuscript in the north.
   box(30,.19,11.2,5.1,.38,2.55,'#777264');
   box(30,.59,11.2,4.65,.14,2.21,'#b9aa8d');
   for(const x of [28.1,31.9]){
    cylinder(x,.58,11.1,.13,.13,.65,'#8a744c',9);
    sphere(x,1.28,11.1,.13,'#efca85',9);
   }
   box(30,.85,11.3,2.70,.35,1.10,'#76573e');
   box(30,1.22,11.3,2.48,.09,1.22,'#bb9364');
   box(29.55,1.33,11.34,.96,.055,.75,'#e0c99f');
   box(30.53,1.33,11.34,.96,.055,.75,'#ddc59a');
   box(30.02,1.405,11.35,.07,.045,.80,'#98734b');
   // A worn votive mosaic replaces the modern telescope platform.
   for(let a=0;a<20;a++){
    const theta=a*Math.PI/10;
    const x=30+Math.cos(theta)*3.0,z=29+Math.sin(theta)*3.0;
    box(x,.054,z,.56,.10,.52,a%2?'#a39176':'#7e7865');
   }
   box(30,.12,29,2.18,.24,1.62,'#806a50');
   box(30,.29,29,1.95,.10,1.43,'#c3ad83');
   for(const x of [29.22,30.78]){
    cylinder(x,.35,29,.14,.14,.59,'#7c664b',9);
    sphere(x,1.00,29,.13,'#f0ca83',9);
   }
   // Antique prayer desks and low manuscript cabinets along the galleries.
   for(const [x,z] of [[23,15],[37,15],[23,33],[37,33],[24,43],[36,43]]){
    box(x,.20,z,1.55,.40,.92,'#6d4e36');
    box(x,.47,z,1.74,.13,1.09,'#b39265');
    box(x,.57,z,.91,.07,.64,'#d5bd93');
    for(const dx of [-.32,.32])box(x+dx,.64,z,.18,.07,.47,'#8b6d4b');
   }
   // Hanging cloth banners, candle stands and a large ancient floor cross.
   for(const [x,z] of [[12,17],[47,17],[12,31],[47,31]]){
    box(x,2.28,z,.17,1.20,.68,'#6f3941');
    box(x,1.62,z,.19,.13,.67,'#cbb27e');
   }
   for(const [x,z] of [[26,22],[34,22],[26,36],[34,36]]){
    cylinder(x,.10,z,.15,.15,.76,'#8d7b56',9);
    cylinder(x,.89,z,.33,.33,.09,'#c2a779',10);
    for(const dx of [-.18,.18]){
     cylinder(x+dx,.95,z,.058,.058,.27,'#efe0b1',7);
     sphere(x+dx,1.26,z,.08,'#f0c57e',8);
    }
   }
   box(30,.042,37.5,.46,.08,4.2,'#927c65');
   box(30,.087,37.5,.30,.02,3.84,'#cfb991');
   box(30,.105,37.5,2.20,.02,.28,'#cfb991');
   // South exit remains unobstructed so pressing E near the door works.
  }
  return;
 }
 if(scene==='forest'){
  const world=engine.getWorld();
  // A forest road with substantial canopies and mossy stones, not random blocks in walkable areas.
  for(let z=1;z<world.height-1;z++)for(let x=1;x<world.width-1;x++){
   if(world.tiles[z][x]==='T'){
    if(g.tree&&((x<=2||x>=33||z<=1||z>=20)?(x+z)%2===0:(x+z)%3===0))g.tree(x+.5,z+.5);
    if((x*3+z*5)%19===0)model('stones',x+.5,.01,z+.5,.64,.27,.55);
   }
  }
  // The torches are stationed on grass OUTSIDE the walking path.
  for(const [x,z] of [[5.5,13.2],[10.5,9.8],[19.4,14.8],[29.3,11.0]]){
   cylinder(x,.05,z,.11,.13,.69,'#665e48',9);
   cone(x,.79,z,.20,.29,'#ddae66',9);sphere(x,.97,z,.095,'#f5d18f',8);
  }
  drawForestMicroDetails(g,world);
  // Scattered woodland groundcover and small ruins in the enlarged north clearing.
  for(let i=0;i<55;i++){
   const x=3+((i*19)%29)+.32,z=2+((i*13)%18)+.3;
   const tile=world.tiles[Math.floor(z)]?.[Math.floor(x)];
   if(tile==='.'&&!(x>24&&x<31&&z<9))drawWildflowers(g,x,z,i);
  }
  for(const [x,z] of [[7.0,14.6],[16.4,3.5],[22.5,17.1],[30.0,17.2]]){
   box(x,.10,z,.72,.18,.62,'#777e72');
   box(x+.19,.24,z-.12,.40,.13,.31,'#9ba095');
   for(let i=0;i<3;i++)cone(x-.20+i*.22,.24,z+.27,.11,.32,'#587558',7);
  }
  // Clear, readable two-line direction sign. Letters are real 3D pixels
  // on its face, not a separate dialogue box or decorative pseudo-text.
  box(9.5,0,13.5,.18,1.30,.20,'#644a34');
  box(9.5,1.22,13.5,2.80,.90,.16,'#8b6545');
  box(9.5,1.26,13.61,2.62,.77,.045,'#dfc795');
  drawSignLetters(g,9.5,13.66,'WILLOWMERE',1.97);
  drawSignLetters(g,9.5,13.66,'VILLAGE EAST',1.56);
  drawWaypost(g,30.2,12.9,'#d8c3a1');
  // Watchtower forecourt: paving, flags, lanterns and stored supplies.
  for(const x of [26.5,27.5,28.5])for(const z of [8.5,9.5])
   box(x,.035,z,.90,.055,.92,(x+z)%2?'#a29c8f':'#bbb3a2');
  for(const x of [24.6,30.5]){
   cylinder(x,.72,8.4,.11,.12,1.42,'#725b45',9);
   box(x,1.50,8.4,.32,.45,.30,'#5e6565');
   sphere(x,1.51,8.4,.14,'#f1c987',9);
   cone(x,1.82,8.4,.25,.27,'#424e56',8);
  }
  for(const x of [24.1,30.6])for(let i=0;i<2;i++)model('barrel',x,0,9.9+i*.68,.49,.57,.48);
  for(const x of [26.2,28.8]){
   cylinder(x,5.12,8.44,.052,.052,1.10,'#5b5e59',8);
   box(x+.24,5.41,8.43,.47,.44,.04,'#9b4547');
   box(x+.22,5.35,8.47,.40,.07,.026,'#dcc59d');
  }
  model('barrel',12.4,0,8.35,.52,.61,.52);
  model('stones',21.5,0,11.0,.84,.31,.71);
  // North watchtower: same 5x5 footprint, but a tall fortified silhouette.
  // Solid opaque walls, a crenellated parapet, narrow arrow slits and a real door.
  const towerX=27.5,towerZ=5.5;
  box(towerX,.09,towerZ,5.55,.18,5.55,'#77756f');
  for(const [x,z,w,d] of [[towerX,3.1,5.3,.42],[towerX,7.9,5.3,.42],[25.1,towerZ,.42,5.3],[29.9,towerZ,.42,5.3]]){
   // The south wall has an actual doorway rather than an open facade.
   if(z===7.9){
    box(26.0,2.45,z,2.20,4.9,d,'#787e80');
    box(29.0,2.45,z,2.20,4.9,d,'#787e80');
    box(towerX,4.30,z,1.15,1.30,d,'#787e80');
   }else box(x,2.45,z,w,4.9,d,'#787e80');
  }
  // Heavy stone courses and dressed corner quoins.
  for(let h=.65;h<4.9;h+=.68){
   for(const z of [3.12,7.88])for(const x of [25.75,26.85,28.15,29.25])
    box(x,h,z,.95,.075,.045,'#a3a6a0');
   for(const x of [25.12,29.88])for(const z of [3.9,5.2,6.5,7.3])
    box(x,h,z,.045,.075,.78,'#a3a6a0');
  }
  for(const x of [25.2,29.8])for(const z of [3.2,7.8])
   box(x,2.5,z,.54,5.0,.54,'#969994');
  // Dark arrow slits give the tall facade a recognisable guard-tower appearance.
  for(const x of [26.25,28.75]){
   box(x,3.15,8.14,.12,.85,.035,'#202a30');
   box(x,3.0,8.16,.38,.10,.04,'#202a30');
  }
  box(towerX,1.15,8.15,1.28,2.30,.16,'#654937');
  for(const x of [27.05,27.40,27.75,28.05])box(x,1.16,8.24,.045,2.18,.03,'#967554');
  box(27.91,1.06,8.29,.09,.11,.06,'#e4c17b');
  box(towerX,4.99,towerZ,5.65,.22,5.65,'#555d61');
  // Separate parapet cap from the wall cornice.
  box(towerX,5.26,towerZ,5.92,.20,5.92,'#8f9490');
  // Battlements, raised corner turrets and a dark peaked watch roof.
  for(const x of [25.15,26.3,27.5,28.7,29.85])for(const z of [2.65,8.35])
   box(x,5.72,z,.60,.92,.52,'#9da19c');
  for(const z of [3.8,5.5,7.2])for(const x of [24.65,30.35])
   box(x,5.72,z,.52,.92,.66,'#9da19c');
  // Corner caps sit above the battlement rather than intersecting the crenellations.
  for(const x of [25.15,29.85])for(const z of [3.15,7.85]){
   cylinder(x,6.65,z,.34,.34,.50,'#737d80',10);
   cone(x,7.15,z,.45,.62,'#454f58',10);
  }
  // Remove an overlapping roof-cap slab; retain the original peaked silhouette.
  cone(towerX,6.52,towerZ,2.42,1.63,'#47515a',4);
  // Red-and-white striped hinged road barrier, four tiles across.
  for(const z of [7.0,11.15]){
   box(32.45,1.05,z,.43,2.1,.44,'#a6a9a6');
   box(32.45,1.98,z,.55,.20,.56,'#e5e5de');
   sphere(32.45,2.16,z,.14,'#d14b42',10);
  }
  if(!complete('watchChest')){
   for(let i=0;i<8;i++)box(32.45,1.45,7.25+i*.5,.34,.36,.50,i%2===0?'#d53935':'#f7f3e9');
   box(32.45,1.45,9.0,.48,.13,3.95,'#424b50');
  }else{
   // Raised barrier after solving the chest; road is visually unobstructed.
   for(let i=0;i<8;i++)box(32.45,2.45+i*.42,7.15,.34,.42,.40,i%2===0?'#d53935':'#f7f3e9');
  }
  // Oliver's crowned statue is intentionally not instantiated here.
  // Its reusable mesh is retained in drawCrownedOliverForFuture().

 }
}
// Retained for future scenes only: approved Oliver mesh plus his gold crown.
// Do not call this function from the forest: all eleven displays were removed.
function drawCrownedOliverForFuture(g,x,z){
 const {oliver,cylinder,cone}=g;
 if(!oliver)return;
 oliver(x,z);
 cylinder(x,2.08,z,.305,.305,.12,'#c6a05c',14);
 for(let i=0;i<7;i++){
  const angle=i*Math.PI*2/7;
  cone(x+Math.cos(angle)*.27,2.15,z+Math.sin(angle)*.27,.085,.23,'#e4c475',8);
 }
}
// The interior is drawn only after an E interaction at the tower door.
function drawWatchtowerInterior(g){
 const {box,cylinder,sphere}=g;
 const stone='#777b7b',trim='#ada89b';
 for(let x=1;x<16;x++){box(x+.5,1.65,1.5,1,3.3,.7,stone);box(x+.5,1.65,12.5,1,3.3,.7,stone);}
 for(let z=1;z<=12;z++){box(1.5,1.65,z+.5,.7,3.3,1,stone);box(15.5,1.65,z+.5,.7,3.3,1,stone);}
 box(8.5,.06,6.5,12.8,.12,9.8,'#807e75');
 for(let x=3;x<14;x+=3){box(x+.5,.025,6.5,.06,.04,9.4,trim);}
 box(8.5,2.95,2.4,11.7,.15,.2,trim);
 box(8.5,.62,4.5,2.5,1.2,1.6,'#71533d');
 box(8.5,1.28,4.5,2.65,.13,1.7,'#c5a36b');
 box(8.5,1.01,5.38,.38,.20,.12,'#d9b978');
 for(const x of [3.7,13.2]){box(x,.56,6.0,1.4,1.12,2.2,'#604b39');box(x,1.15,6,1.5,.12,2.3,'#9b805c');}
 for(const x of [4,13]){cylinder(x,.08,9.4,.14,.14,1.8,'#635344',10);sphere(x,1.94,9.4,.17,'#e8b971',10);}
 box(8.5,1.25,12.19,1.3,2.5,.14,'#644b36');
 box(8.9,1.1,12.29,.08,.08,.06,'#e1c17d');
 // Banners, timber roof beams and a small guard's writing desk.
 for(const x of [4.1,8.5,12.9]){
  box(x,3.21,6.5,.22,.30,9.45,'#6a5b49');
  box(x,3.30,6.5,.12,.10,9.5,'#b09367');
 }
 for(const x of [2.15,14.85]){
  box(x,2.28,4.1,.08,1.10,.65,'#8d4248');
  box(x,1.82,4.1,.095,.12,.65,'#c9ae7b');
 }
 box(12.6,.72,9.8,1.65,.12,.84,'#9d7955');
 for(const x of [12.02,13.18])box(x,.38,9.8,.14,.68,.65,'#66513d');
 box(12.46,.83,9.66,.48,.06,.35,'#e7d6ac');
 cylinder(12.93,.87,9.51,.08,.08,.12,'#ae8962',9);
  // Worked stone, rug, wall lamps and orderly storage make the interior feel inhabited.
 box(8.5,.125,8.3,3.1,.025,2.3,'#6c4b44');
 box(8.5,.14,8.3,2.75,.01,1.95,'#af8867');
 for(const x of [2.7,14.2]){box(x,1.77,8.8,.12,.56,.30,'#63513f');sphere(x,2.12,8.8,.14,'#f0bf79',9);}
 for(const x of [3,13.7]){box(x,.35,3.0,1.2,.70,.68,'#625345');box(x,.75,3,1.28,.08,.76,'#aa8b65');}
 for(let i=0;i<5;i++){box(3.2+i*.47,.12,10.7,.35,.24,.27,'#907a58');box(3.2+i*.47,.27,10.7,.32,.05,.28,'#c4a67e');}
 for(let i=0;i<8;i++)box(2.0+i*1.75,2.45,1.87,.035,.035,.12,'#b9b8a7');
}
function woodBridgeTile(x,z){return scene==='village'&&complete('bridge')&&x>=43&&x<=49&&z>=18&&z<=20;}
function drawVillageProps(g){
 if(scene!=='village')return;
 const {box,cylinder,cone,sphere}=g,done=complete('bridge');
 window.FallenKingDetailPlus?.draw?.(g,'barrel',41.3,0,17.7,.65,.68,.65);
 window.FallenKingDetailPlus?.draw?.(g,'chest',41.8,0,21.4,.92,.58,.68);
 // DetailPlus: an inhabited medieval market square, with readable stalls, barrels and civic stonework.
 drawVillageDetails(g);
 drawVillageSecondPass(g);
 const mdl=(id,x,y,z,w,h,d)=>window.FallenKingDetailPlus?.draw?.(g,id,x,y,z,w,h,d);
 for(const [x,z,canopy] of [[23.5,24.4,'#9e4e53'],[32.7,24.4,'#4b7882'],[30.7,33.2,'#bc9363']]){
  for(const ox of [-.80,.80])for(const oz of [-.55,.55])cylinder(x+ox,.06,z+oz,.065,.07,1.44,'#80644d',8);
  box(x,.89,z,2.05,.13,1.60,'#947155');
  box(x,1.62,z,2.25,.16,1.87,canopy);
  // Canvas trim hangs just beyond the awning edge instead of intersecting its surface.
  for(const ox of [-.83,-.4,.03,.46,.83])box(x+ox,1.53,z+.977,.24,.10,.055,ox<0?'#d9c494':'#e2d0a8');
  mdl('barrel',x-1.23,0,z,.55,.58,.55);
  mdl('chest',x+.55,.96,z,.49,.38,.46);
 }
 // Cobblestone well, benches and warm light in the village's public square.
 cylinder(27.3,.1,27.1,.86,.85,.30,'#777f76',12);
 cylinder(27.3,.38,27.1,.73,.73,.24,'#c4b8a0',12);
 cylinder(27.3,.62,27.1,.58,.58,.08,'#405963',12);
 for(const x of [26.4,28.2]){box(x,.67,27.1,.14,1.32,.14,'#856b4a');cone(x,1.43,27.1,.23,.20,'#c3a377',8);}
 box(27.3,1.52,27.1,2.25,.15,.2,'#9b7951');
 for(const [x,z] of [[21.2,29.8],[33.8,28.8],[29.2,20.7]]){cylinder(x,.08,z,.14,.14,.87,'#74624f',8);cone(x,1.02,z,.18,.31,'#e3b75c',9);sphere(x,1.27,z,.11,'#ffdf9e',9);}
 for(const [x,z] of [[24.2,30.2],[31.2,29.8],[27.2,22.7]])mdl('stones',x,.02,z,.68,.33,.60);
 
 // Detailed riverside and bridgework: carved posts, reeds, stones and construction supplies.
 const rocks=[[42,17],[43,22],[44,16],[49,17],[49,22]];
 for(const [x,z] of rocks){box(x+.5,.12,z+.5,.49,.24,.45,'#828980');box(x+.64,.27,z+.55,.27,.06,.24,'#afb3a5');for(let i=0;i<3;i++)cone(x+.2+i*.2,.28,z+.9,.075,.46+i*.07,'#547d57',6);}
 for(const x of [43,49])for(const z of [17.3,21.6]){box(x,.37,z,.57,.74,.48,'#aaa997');box(x,1.13,z,.67,.13,.54,'#d0c8ab');box(x,1.28,z,.11,.30,.15,'#6e857d');}
 for(let x=40;x<=44;x++)for(let z=17;z<=22;z++)if((x+z)%3===0){box(x+.5,.055,z+.5,.63,.11,.55,'#aea189');box(x+.5,.177,z+.5,.41,.020,.27,'#d0bea0');}
 for(const [x,z] of [[41.7,18.2],[41.9,20.1]]){box(x,.13,z,1.3,.25,.32,'#916c4b');box(x,.40,z,1.3,.095,.32,'#bc9267');}
 for(const [x,z] of [[40.8,17.3],[41.3,17.7]]){cylinder(x,.26,z,.28,.27,.53,'#8f8160',9);cylinder(x,.57,z,.31,.31,.08,'#b8a07a',9);}
 for(const x of [42.5,49.3]){cylinder(x,.47,18,.17,.18,.94,'#705642',9);cone(x,.98,18,.20,.38,'#edb55c',8);sphere(x,1.21,18,.12,'#ffe2a5',8);}
  // Wooden bridge across the eastern stream; timber and rope appear only after the repairs.
 for(const x of [44.5,48.5])for(const z of [18.7,20.3]){
  cylinder(x,.28,z,.20,.22,.55,'#695442',10);
  cone(x,.66,z,.18,.20,'#d0b47f',8);
 }
 for(const z of [18.1,20.8])for(let x=43;x<=49;x+=2){
  box(x,.10,z,1.1,.20,.24,'#83745b');
  box(x,.315,z,.86,.055,.29,'#bba27a');
 }
 // Fasteners and rope brackets are visible even before bridge repair.
 for(const z of [18.05,20.95])for(const x of [43.6,44,48.7,49.1]){box(x,.23,z,.21,.46,.21,'#75593e');box(x,.51,z,.25,.12,.25,'#ae8b62');}
  if(done){
  for(let x=44.2;x<=48.8;x+=.5)for(const z of [18.4,20.6]){box(x,.35,z,.10,.08,.15,'#5b544c');box(x,.44,z,.055,.03,.07,'#dbc18a');}
  // Full wooden deck at ground height: Oliver's feet are not swallowed by
  // raised planks and no stone road can show through the finished span.
  for(let x=43.75;x<=49.25;x+=.48){
   box(x,-.050,19.5,.46,.058,2.85,Math.round(x*10)%2?'#b38c61':'#c19b70');
   box(x,.014,19.5,.055,.014,2.66,'#e1c28e');
  }
  for(const z of [18.08,20.92]){
   box(46.3,.52,z,4.9,.10,.14,'#b8a078');
   for(const x of [44.1,45.2,46.3,47.4,48.5])cylinder(x,.47,z,.08,.08,.76,'#6f523b',8);
  }
 }else{
  for(const x of [45.5,46.3,47]){box(x,.07,19.3+(x%2)*.5,.32,.12,.73,'#745f4e');box(x,.14,19.3+(x%2)*.5,.16,.07,.41,'#9c7f65');}
  for(const x of [44.5,48.2]){box(x,.5,18.2,.06,.75,.10,'#bcab83');box(x,.5,20.8,.06,.75,.10,'#bcab83');}
  // Two ends of a collapsed bridge, with snapped boards projecting over the water.
  for(const x of [43.9,44.4,48.25,48.8]){const z=19.5;
   box(x,.20,z,.51,.24,1.95,'#8f6947');
   box(x,.35,z+.55,.28,.08,.15,'#c8a274');
  }
  for(const x of [45.1,47.4]){box(x,.02,19.8,.48,.10,.90,'#665341');box(x,.12,19.8,.15,.20,.24,'#493d34');}
 }
}
function drawEffects(g,t){
 if(scene==='intro'||scene==='cell'){
  const {sphere,cone}=g;
  // Torchlight flickers and dust drifts through the prison and royal chambers.
  const kind=scene==='intro'?steps[Math.min(chapter.step,steps.length-1)].scene:'cell';
  const palace=kind!=='prison'&&kind!=='cell',lights=palace?[[2.5,2.9],[16,2.9]]:[[15.3,6.0]];
  if(palace)lights.push([1.7,2.3],[1.7,7.4]);
   for(const [x,z] of lights){const wobble=Math.sin(t*9+x)*.047,glow=.11+Math.sin(t*4+x)*.025;
   const y=x===1.7?2.30:1.35;sphere(x,y+wobble,z,glow,'#f5d5a2',7);cone(x,y-.26+wobble,z,.10,.19,'#e7ad5b',7);
  }
  if(scene==='cell'){
   // Three clear, floating Z glyphs above the sleeping rook; no UI image overlay.
   const {tri}=g;
   if(tri)for(let i=0;i<3;i++){
    const x=12.05+i*.37,y=1.30+i*.24+.07*Math.sin(t*2+i),z=2.88;
    const p=(dx,dy)=>[x+dx,y+dy,z],color=i===2?'#d8e0d2':'#b4c8c9';
    function stroke(ax,ay,bx,by){
     const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1,nx=-dy/len*.042,ny=dx/len*.042;
     tri(p(ax+nx,ay+ny),p(bx+nx,by+ny),p(bx-nx,by-ny),color);
     tri(p(ax+nx,ay+ny),p(bx-nx,by-ny),p(ax-nx,ay-ny),color);
    }
    stroke(0,.22,.23,.22);stroke(.23,.22,0,0);stroke(0,0,.23,0);
   }
  }
  const bound=scene==='cell'?13:16;
  for(let i=0;i<9;i++){const x=2+((i*2.17+t*.11)%bound),z=3+((i*1.43)%6),y=.5+((i*.49+t*.09)%1.7);
   sphere(x,y,z,.018+(i%3)*.007,palace?'#f2deb4':'#889a9d',5);
  }
  return;
 }
 // Fixed-position sine waves: smooth periodic motion without spawning, teleporting or vanishing glints.
 const {box,sphere,tri}=g;
 const flow=(x,z,offset=0)=>Math.sin(x*.92-z*.43-t*1.25+offset);
 if(scene==='village'){
  for(let x=45.15;x<47.85;x+=.38)for(const z of (complete('bridge')?[17.25,21.8]:[17.25,19.5,21.8])){
   const w=flow(x,z),h=.05+.014*w;
   box(x,h,z,.29,.012,.045,'#8fbfbd');
  }
  for(const x of [42.5,49.3])sphere(x,1.30+Math.sin(t*7+x)*.025,18,.15,'#efd19a',7);
  return;
 }
 if(scene==='ridge'||scene==='hill'||scene==='ruins'||scene==='observatory'||scene==='skyglassInterior'){
  if(scene!=='skyglassInterior')for(let i=0;i<8;i++){const x=7+i*2.1,z=8+i*3.8;sphere(x,1.2+.12*Math.sin(t+i),z,.055,'#e6cc87',7);}
  // The former five perfectly circling glints in the Abbey were distracting.
  return;
 }
 if(scene==='forest'){
  // A handful of drifting butterfly silhouettes with smooth, looping wing motion.
  for(let i=0;i<1;i++){
   const x=12+.27*Math.sin(t*.55+i),z=13.5+Math.sin(i*1.7)*2.2;
   const y=.65+.13*Math.sin(t*1.4+i);
   const wings=.11+.035*Math.sin(t*9+i);
   sphere(x-wings,y,z,.075,i%2?'#d9b8d8':'#f2d389',6);
   sphere(x+wings,y,z,.075,i%2?'#d9b8d8':'#f2d389',6);
   box(x,y,z,.022,.14,.035,'#585b46');
  }
  // Stationary fireflies brighten and dim smoothly along the woodland path.
  for(let i=0;i<12;i++){
   const x=4+i*2.47,z=7.4+Math.sin(i*1.88)*2.4;
   const y=.86+.22*Math.sin(t*1.65+i*.87);
   sphere(x,y,z,.036+.014*(.5+.5*Math.sin(t*2+i)),'#d6c78e',7);
  }
  return;
 }
 if(scene!=='sewer')return;
 // One continuous centre-line stream following all bends of sewerRoute.
 const world=engine.getWorld(),stream=world.streamTiles;
 if(!stream)return;
 for(let z=1;z<world.height-1;z++)for(let x=1;x<world.width-1;x++){
  const direction=stream[z*world.width+x];if(!direction)continue;
  const vertical=direction>=3;
  for(const shift of [.24,.55,.83]){
   const phase=Math.sin((vertical?z:x)*.74-t*1.7+shift*5.7);
   const y=.052+.011*phase,edge=.12+.10*(.5+.5*phase);
   const px=x+.5,pz=z+.5;
   const a=vertical?[px-edge,y,pz+shift-.5]:[px+shift-.5,y,pz-edge];
   const b=vertical?[px+edge,y,pz+shift-.5]:[px+shift-.5,y,pz+edge];
   const c=[b[0],y+.005,b[2]+(vertical?.025:0)];
   if(tri)tri(a,b,c,'#719a9b');
   else box(px,y,pz,vertical?edge*2:.02,.008,vertical?.02:edge*2,'#719a9b');
  }
 }

}
function drawFollowers(g){/* Pip is reserved for the second village, not Willowmere. */}
// Snapshot is captured on explicit Save, not every movement step.
function exportSave(){
 if(engine&&scene!=='intro')chapter.position={...engine.getPlayer()};
 chapter.scene=scene;
 return {chapter:JSON.parse(JSON.stringify(chapter))};
}
window.FallenKingStory={exportSave,start,blockedInput,beforeMove,afterMove,talk,beforeHouse,customScene,hasMap,drawGround,backdrop,fieldOfView,drawProps,drawVillageProps,drawEffects,drawFollowers,woodBridgeTile,renderIntroFrame,isIntro,isPrisoner,musicTheme};
})();