import {paintChessPiece} from './pawn-piece-art.mjs';
import {createPawnSound} from './pawn-sound.mjs';
import {PIECE_ORDER,PIECE_LABELS,PAWN_SHOP,readPawnWallet,earnPawnCoins,buyPawnSkin,pawnCoinAt} from './pawn-shop.mjs';
import {createPawnDashModel} from './pawn-world-logic.mjs';
// Original EloScanner Pawn Dash: a chess-themed, perspective crossing game.
// No game sprites, levels or assets from third-party titles are used.
export function createPawnWorld({host,seed,onScore,onHit,onStatus,onPauseChange=()=>{}}){
 const sound=createPawnSound();
 const root=document.createElement('div');root.className='pawn-world pawn-world-immersive';
 const menuButton=document.createElement('button');menuButton.type='button';menuButton.className='pawn-world-menu-button';menuButton.textContent='☰ Menu';menuButton.setAttribute('aria-label','Open game menu');
 const overlay=document.createElement('div');overlay.className='pawn-world-overlay';overlay.hidden=true;
 const menuTitle=document.createElement('h2');menuTitle.textContent='Pawn Kingdom';
 const resume=document.createElement('button');resume.type='button';resume.textContent='Resume game';
 const shopButton=document.createElement('button');shopButton.type='button';shopButton.textContent='♛ Shop & skins';
 const shopPanel=document.createElement('section');shopPanel.className='pawn-shop-panel';shopPanel.hidden=true;
 const shopHeading=document.createElement('h3');shopHeading.textContent='Chess piece shop';
 const shopBalance=document.createElement('p');shopBalance.className='pawn-shop-balance';
 const shopCategories=document.createElement('div');shopCategories.className='pawn-shop-categories';
 const shopItems=document.createElement('div');shopItems.className='pawn-shop-items';
 const shopPreview=document.createElement('canvas');shopPreview.className='pawn-shop-preview';shopPreview.width=260;shopPreview.height=220;shopPreview.setAttribute('aria-label','Selected chess piece preview');
 const shopCategoryBack=document.createElement('button');shopCategoryBack.type='button';shopCategoryBack.textContent='← All pieces';
 let activeCategory=null;
 const shopBack=document.createElement('button');shopBack.type='button';shopBack.textContent='← Back to menu';
 const shopHelp=document.createElement('p');shopHelp.textContent='Collect golden coins while crossing. Cosmetic skins only · saved on this device.';
 shopPanel.append(shopHeading,shopBalance,shopHelp,shopCategories,shopCategoryBack,shopPreview,shopItems,shopBack);
 const exit=document.createElement('button');exit.type='button';exit.textContent='Exit to minigames';
 const soundButton=document.createElement('button');soundButton.type='button';soundButton.textContent='♫ Sound: on';soundButton.setAttribute('aria-label','Toggle Pawn Dash sound');
 soundButton.onclick=()=>{sound.setMuted(!sound.muted);soundButton.textContent=sound.muted?'♫ Sound: off':'♫ Sound: on';if(!sound.muted)sound.play('menu')};
 const menuHelp=document.createElement('p');menuHelp.textContent='Tap to hop · Swipe to steer · Collect 1 coin at a time · Explore 30 skins · Esc pauses';
 overlay.append(menuTitle,resume,shopButton,soundButton,exit,menuHelp,shopPanel);
 let wallet;
 try{wallet=readPawnWallet(localStorage.getItem('eloscanner-pawn-shop-v1'))}catch{wallet=readPawnWallet(null)}
 const persistWallet=()=>{try{localStorage.setItem('eloscanner-pawn-shop-v1',JSON.stringify(wallet))}catch{}};
 const selectedSkin=()=>PAWN_SHOP.find(s=>s.id===wallet.selected)||PAWN_SHOP[0];
 const collected=new Set();
 function previewSkin(item){
  const c=shopPreview.getContext('2d');c.clearRect(0,0,260,220);
  const g=c.createLinearGradient(0,0,260,220);g.addColorStop(0,'#233f53');g.addColorStop(1,'#0e2636');
  c.fillStyle=g;c.fillRect(0,0,260,220);
  c.fillStyle='#c2a57d';c.fillRect(27,174,206,13);
  c.fillStyle='#e4d0a5';c.fillRect(27,166,206,9);
  c.fillStyle='#fff3d733';c.beginPath();c.ellipse(130,170,65,16,0,0,Math.PI*2);c.fill();
  paintChessPiece(c,item.kind,item,130,157,118,{shadow:true});
  c.font='bold 15px system-ui';c.textAlign='center';c.fillStyle='#ffe3a2';c.fillText(item.name,130,205);
 }
 function refreshShop(){
  shopBalance.textContent='🪙 '+wallet.coins.toLocaleString('en-US')+' coins';
  shopCategories.replaceChildren();shopItems.replaceChildren();
  const viewing=activeCategory!==null;
  shopCategories.hidden=viewing;shopCategoryBack.hidden=!viewing;shopPreview.hidden=!viewing;shopItems.hidden=!viewing;
  shopHeading.textContent=viewing?PIECE_LABELS[activeCategory]+' skins':'Choose a chess piece';
  if(!viewing){
   for(const kind of PIECE_ORDER){
    const card=document.createElement('button');card.type='button';card.className='pawn-shop-category';
    const icon=document.createElement('span');icon.className='pawn-shop-category-symbol';
    icon.textContent=({pawn:'♟',bishop:'♝',knight:'♞',rook:'♜',queen:'♛',king:'♚'})[kind];
    const label=document.createElement('span');label.textContent=PIECE_LABELS[kind]+' · 5 skins';
    card.append(icon,label);
    card.onclick=()=>{sound.play('menu');activeCategory=kind;refreshShop()};
    shopCategories.append(card);
   }
   return;
  }
  const items=PAWN_SHOP.filter(item=>item.kind===activeCategory);
  previewSkin(items.find(x=>x.id===wallet.selected)||items[0]);
  for(const item of items){
   const row=document.createElement('div');row.className='pawn-shop-item';
   const swatch=document.createElement('span');swatch.className='pawn-shop-swatch';swatch.style.background=item.color;
   const copy=document.createElement('span');
   const heading=document.createElement('strong');heading.textContent=item.name;
   const price=document.createElement('small');
   const owned=wallet.owned.includes(item.id);
   price.textContent=wallet.selected===item.id?'Equipped':owned?'Unlocked':item.cost.toLocaleString('en-US')+' coins';
   copy.append(heading,price);
   const button=document.createElement('button');button.type='button';
   button.textContent=wallet.selected===item.id?'Equipped':owned?'Equip':'Unlock';
   button.disabled=wallet.selected===item.id||(!owned&&wallet.coins<item.cost);
   button.setAttribute('aria-label',(owned?'Equip ':'Unlock ')+item.name);
   row.onclick=()=>previewSkin(item);
   button.onclick=e=>{e.stopPropagation();const result=buyPawnSkin(wallet,item.id);if(result.ok){wallet=result.wallet;persistWallet();sound.play(owned?'equip':'buy');refreshShop();previewSkin(item)}};
   row.append(swatch,copy,button);shopItems.append(row);
  }
 }
 shopButton.onclick=()=>{sound.play('menu');activeCategory=null;shopPanel.hidden=false;menuTitle.hidden=true;resume.hidden=true;shopButton.hidden=true;soundButton.hidden=true;exit.hidden=true;menuHelp.hidden=true;refreshShop()};
 shopCategoryBack.onclick=()=>{sound.play('menu');activeCategory=null;refreshShop()};
 shopBack.onclick=()=>{sound.play('menu');shopPanel.hidden=true;menuTitle.hidden=false;resume.hidden=false;shopButton.hidden=false;soundButton.hidden=false;exit.hidden=false;menuHelp.hidden=false};
 const setMenu=open=>{sound.play('menu');if(!open&&shopPanel&&!shopPanel.hidden)shopBack.click();if(!open&&pausedAt){const delta=performance.now()-pausedAt;origin+=delta;invincibleUntil+=delta;if(hop)hop.since+=delta;pausedAt=0;}if(open&&!pausedAt)pausedAt=performance.now();overlay.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));onPauseChange(open);if(!open)canvas.focus({preventScroll:true})};
 menuButton.onclick=()=>setMenu(overlay.hidden);resume.onclick=()=>setMenu(false);exit.onclick=()=>{location.href='/minigames.html'};
 const canvas=document.createElement('canvas');canvas.className='pawn-world-canvas';canvas.tabIndex=0;
 canvas.setAttribute('aria-label','Pawn Dash in a chess club: tap to hop on a giant chessboard, collect coins and cross blue water channels on stone bridges');
 const controls=document.createElement('div');controls.className='pawn-world-controls';controls.setAttribute('aria-label','Pawn Dash movement controls');
 controls.innerHTML='<button type="button" data-direction="left" aria-label="Move left">◀</button><button type="button" data-direction="forward" aria-label="Move forward">▲</button><button type="button" data-direction="back" aria-label="Move backward">▼</button><button type="button" data-direction="right" aria-label="Move right">▶</button>';
 const hint=document.createElement('p');hint.className='pawn-world-hint';hint.textContent='Cross the chess-club board · Collect 1 coin · Menu → Shop';
 root.append(canvas,controls,hint,menuButton,overlay);host.append(root);document.body.classList.add('pawn-dash-active');
 const ctx=canvas.getContext('2d');let width=640,height=630,raf=0,dead=false,player={x:4,row:0},camera=0,highest=0,lastMove=0,invincibleUntil=0,origin=performance.now(),pointer=null,pausedAt=0,hop=null;
 const model=createPawnDashModel(seed);const {random:roll,lane,collision,enemyCount,enemyX,enemyKind,difficulty,isBridge}=model;
 const size=()=>{
  const rect=canvas.getBoundingClientRect();
  const scale=Math.min(window.devicePixelRatio||1,(navigator.hardwareConcurrency||8)<=4?1.5:2);
  width=rect.width||640;height=rect.height||630;
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  ctx.setTransform(scale,0,0,scale,0,0);
 };
 const cellSize=()=>Math.min(width/8.9,height/8.8,112);
 // Project the squares onto one consistent oblique chessboard plane.
 // One step up always equals the exact opposite edge of the next row.
 const project=(x,row)=>{
  const u=cellSize(),distance=row-camera;
  return [width*.50+(x-4)*u,height*.69-distance*u*.83];
 };
 const quad=(x,row)=>{
  const [px,py]=project(x,row),u=cellSize(),v=0,d=u*.83;
  return [[px-u*.5+v*.5,py-d*.5],[px+u*.5+v*.5,py-d*.5],
          [px+u*.5-v*.5,py+d*.5],[px-u*.5-v*.5,py+d*.5]];
 };

 // All decorations, hazards, bridges and colours are deterministic in world coordinates.
 function polygon(points,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();ctx.fill()}
 function strokePolygon(points,color,line=1){ctx.strokeStyle=color;ctx.lineWidth=line;ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();ctx.stroke()}
 function round(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
 function scenery(){
  // Chess-club hall, with oak parquet, dark timber walls, trophies and warm lamps.
  const wall=ctx.createLinearGradient(0,0,0,height);
  wall.addColorStop(0,'#17283a');wall.addColorStop(.5,'#30495a');wall.addColorStop(1,'#6e5543');
  ctx.fillStyle=wall;ctx.fillRect(0,0,width,height);
  const u=cellSize(),boardLeft=project(0,0)[0]-u*.5,boardRight=project(8,0)[0]+u*.5;
  ctx.fillStyle='#6c4b37';ctx.fillRect(0,height*.58,width,height*.42);
  for(let y=height*.6;y<height;y+=Math.max(12,u*.3)){
   ctx.strokeStyle='#ad7a513d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();
  }
  for(const side of [0,1]){
   const cx=side===0?Math.max(0,boardLeft*.5):Math.min(width,(boardRight+width)*.5);
   // Portraits, chess club insignia and wall sconces in the side margins.
   ctx.fillStyle='#c09a64';ctx.fillRect(cx-u*.39,height*.16,u*.78,u*.95);
   ctx.fillStyle='#172d3a';ctx.fillRect(cx-u*.33,height*.20,u*.66,u*.87);
   ctx.textAlign='center';ctx.fillStyle='#e7d4aa';ctx.font='bold '+Math.max(20,u*.43)+'px Georgia,serif';
   ctx.fillText(side?'♚':'♔',cx,height*.2+u*.53);
   const lamp=ctx.createRadialGradient(cx,height*.11,1,cx,height*.11,u*.9);
   lamp.addColorStop(0,'#ffe5aa5a');lamp.addColorStop(1,'#ffe5aa00');
   ctx.fillStyle=lamp;ctx.fillRect(cx-u,height*.11-u,u*2,u*2);
   ctx.fillStyle='#e8c17e';ctx.beginPath();ctx.arc(cx,height*.11,u*.1,0,Math.PI*2);ctx.fill();
  }
  // Solid carved oak rails frame the board without creating dead-looking forest gaps.
  for(const x of [boardLeft-u*.17,boardRight+u*.08]){
   ctx.fillStyle='#3c2926';ctx.fillRect(x,0,u*.12,height);
   ctx.fillStyle='#b78a5d';ctx.fillRect(x+u*.025,0,u*.035,height);
  }
 }
 function tile(x,row,type,time){
  const q=quad(x,row),u=cellSize(),cx=project(x,row)[0],cy=project(x,row)[1];
  // One quiet, continuous world: grass, slate paths, sandstone courtyards and blue water.
  const dark=(x+row)%2===0;
  const base=type==='meadow'?(dark?'#c4b18b':'#efe0b9'):
             type==='road'?(dark?'#5e6c69':'#7c8982'):
             type==='court'?(dark?'#bba780':'#ead6ad'):
             (dark?'#408ba2':'#4695ad');
  const border=type==='meadow'?'#a18d6b':type==='road'?'#465955':
               type==='court'?'#a08b66':'#26718c';
  // Block sides give weight without creating false extra squares.
  polygon([q[3],q[2],[q[2][0],q[2][1]+u*.125],[q[3][0],q[3][1]+u*.125]],border);
  polygon(q,base);
  ctx.lineWidth=Math.max(1,u*.027);
  strokePolygon(q,border,ctx.lineWidth);
  if(type==='road'){
   // A complete road stripe: each cell shares one horizontal lane surface.
   ctx.fillStyle='#d9d4bd4b';
   ctx.fillRect(cx-u*.48,cy-u*.035,u*.96,u*.07);
   if(x===0||x===8){ctx.fillStyle='#e4d5b574';ctx.fillRect(cx+(x===0?-u*.44:u*.39),cy-u*.32,u*.055,u*.65)}
  }else if(type==='court'){
   // Carved square joints and a small royal emblem; no purple squares.
   ctx.strokeStyle='#eee1c084';ctx.lineWidth=Math.max(1,u*.016);
   ctx.strokeRect(cx-u*.31,cy-u*.28,u*.62,u*.54);
   if(x===4&&row%2===0){
    ctx.fillStyle='#e8d7a2';ctx.beginPath();ctx.arc(cx,cy,u*.08,0,Math.PI*2);ctx.fill();
   }
  }else if(type==='meadow'){
   if(roll(row*101+x*17)>.78){
    ctx.fillStyle='#fff7df73';ctx.beginPath();ctx.ellipse(cx-u*.23,cy+u*.10,u*.12,u*.035,-.2,0,Math.PI*2);ctx.fill();
   }
  }else if(isBridge(row,x)){
   // Exactly three adjoining sandstone bridge squares, safe to cross.
   polygon([[cx-u*.48,cy-u*.37],[cx+u*.48,cy-u*.37],[cx+u*.48,cy+u*.36],[cx-u*.48,cy+u*.36]],'#d9c39a');
   ctx.strokeStyle='#a69374';ctx.lineWidth=Math.max(1,u*.03);
   ctx.strokeRect(cx-u*.45,cy-u*.34,u*.9,u*.68);
   ctx.beginPath();ctx.moveTo(cx-u*.42,cy);ctx.lineTo(cx+u*.42,cy);ctx.stroke();
  }else{
   const wave=Math.sin(time*1.7+row*.38+x*.9)*u*.03;
   ctx.strokeStyle='#b5e7e5b1';ctx.lineWidth=Math.max(1.5,u*.025);
   ctx.beginPath();ctx.moveTo(cx-u*.32,cy+wave);ctx.quadraticCurveTo(cx,cy-u*.08+wave,cx+u*.32,cy+wave);ctx.stroke();
  }
 }

 function drawRiver(row,time){
  const u=cellSize(),cy=project(4,row)[1],h=u*.83,left=project(0,row)[0]-u*.5,right=project(8,row)[0]+u*.5;
  // One unbroken river, not nine blue checkerboard squares.
  const water=ctx.createLinearGradient(0,cy-h*.5,0,cy+h*.5);
  water.addColorStop(0,'#1f6d88');water.addColorStop(.42,'#2f9db6');water.addColorStop(1,'#1b6889');
  ctx.fillStyle='#164c61';ctx.fillRect(left,cy-h*.5-4,right-left,h+8);
  ctx.fillStyle=water;ctx.fillRect(left,cy-h*.48,right-left,h*.96);
  ctx.save();ctx.beginPath();ctx.rect(left,cy-h*.48,right-left,h*.96);ctx.clip();
  const drift=(time*18)%u;
  for(let i=0;i<16;i++){
   const wx=left+(i-1)*u*.7+drift,wy=cy-h*.33+((i*29+row*13)%8)/8*h*.62;
   ctx.strokeStyle=i%3===0?'#d5fbf6a8':'#a3e1e08c';
   ctx.lineWidth=i%3===0?3:1.8;
   ctx.beginPath();ctx.moveTo(wx,wy);ctx.quadraticCurveTo(wx+u*.18,wy-u*.06,wx+u*.35,wy);ctx.stroke();
  }
  for(let i=0;i<10;i++){
   const x=left+((i*109+row*23)%(right-left)),y=cy-h*.35+((i*37+row*19)%70)/100*h;
   ctx.fillStyle='#efffe13d';ctx.beginPath();ctx.arc(x,y,Math.max(1.3,u*.025),0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
  // Stone bridges sit on top of the continuous water, aligned with the collision grid.
  for(let x=0;x<9;x++)if(isBridge(row,x)){
   const [cx,py]=project(x,row),w=u*.99,hh=h*.78;
   ctx.fillStyle='#746b5a';ctx.fillRect(cx-w*.5,py-hh*.46+u*.09,w,hh);
   ctx.fillStyle=(x+row)%2?'#d8c5a1':'#e8d6b2';ctx.fillRect(cx-w*.5,py-hh*.52,w,hh*.91);
   ctx.strokeStyle='#ad9472';ctx.lineWidth=Math.max(1,u*.02);ctx.strokeRect(cx-w*.49,py-hh*.51,w*.98,hh*.88);
   ctx.fillStyle='#fff5d24d';ctx.fillRect(cx-w*.48,py-hh*.45,w*.96,hh*.11);
  }
  ctx.fillStyle='#d4c39f';ctx.fillRect(left,cy-h*.52,right-left,Math.max(3,u*.05));
  ctx.fillStyle='#7e694d';ctx.fillRect(left,cy+h*.45,right-left,Math.max(3,u*.05));
 }
 function drawCoin(x,row,time){
  const [px,py]=project(x,row),u=cellSize(),bob=Math.sin(time*4+row)*u*.05,r=u*.15;
  ctx.fillStyle='#153a3990';ctx.beginPath();ctx.ellipse(px,py+u*.18,r*1.1,r*.38,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#956020';ctx.beginPath();ctx.arc(px,py-u*.26+bob,r*1.12,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ffdf67';ctx.beginPath();ctx.arc(px,py-u*.28+bob,r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#fff5bc';ctx.lineWidth=Math.max(1.5,u*.025);ctx.beginPath();ctx.arc(px,py-u*.28+bob,r*.68,0,Math.PI*2);ctx.stroke();
  ctx.font='bold '+Math.round(u*.18)+'px system-ui';ctx.textAlign='center';ctx.fillStyle='#9a6519';ctx.fillText('♟',px,py-u*.21+bob);
 }
 // Strong, persistent position cue: the marked square is the player's collision square.
 // During a hop the moving piece can briefly be between two squares, but its landing
 // square stays illuminated. This makes precise navigation readable on phone screens.
 function playerSquare(now){
  // The ring tracks the animated sprite's actual ground position, never its future tile.
  let x=player.x,row=player.row;
  if(hop){const p=Math.min(1,Math.max(0,(now-hop.since)/165));x=hop.from.x+(hop.to.x-hop.from.x)*p;row=hop.from.row+(hop.to.row-hop.from.row)*p}
  const [px,py]=project(x,row),u=cellSize();
  ctx.save();
  ctx.fillStyle='#163e3f66';ctx.beginPath();ctx.ellipse(px,py+u*.18,u*.29,u*.12,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#fff4cb9c';ctx.lineWidth=Math.max(1.5,u*.025);
  ctx.beginPath();ctx.ellipse(px,py+u*.18,u*.32,u*.135,0,0,Math.PI*2);ctx.stroke();
  ctx.restore();
 }
 function clubDecoration(x,row){
  // Deterministic side trophies, score clocks and chess-club benches.
  const [px,py]=project(x,row),u=cellSize(),v=roll(row*17+(x<0?97:131));
  ctx.fillStyle='#1e283b55';ctx.beginPath();ctx.ellipse(px,py+u*.16,u*.36,u*.13,0,0,Math.PI*2);ctx.fill();
  if(v>.55){
   round(px-u*.3,py-u*.15,u*.6,u*.21,u*.03,'#5e3e30');
   round(px-u*.27,py-u*.2,u*.54,u*.09,u*.02,'#c79d65');
   for(const dx of [-.22,.16])round(px+dx*u,py+u*.01,u*.07,u*.26,u*.02,'#63452e');
  }else{
   round(px-u*.22,py-u*.10,u*.44,u*.23,u*.025,'#75563d');
   round(px-u*.19,py-u*.16,u*.38,u*.09,u*.025,'#c6a371');
   ctx.textAlign='center';ctx.fillStyle='#fff2ca';ctx.font='bold '+Math.round(u*.28)+'px Georgia,serif';
   ctx.fillText(v>.25?'♜':'♞',px,py-u*.23);
  }
 }
 function pawnBase(px,py,u,dark,base,light){
  // All pieces stand on the same simple plinth, leaving plenty of free square visible.
  round(px-u*.24,py+u*.06,u*.48,u*.11,u*.025,dark);
  round(px-u*.205,py+u*.055,u*.41,u*.07,u*.025,base);
  polygon([[px-u*.17,py+u*.045],[px+u*.17,py+u*.045],
           [px+u*.105,py-u*.35],[px-u*.105,py-u*.35]],dark);
  const g=ctx.createLinearGradient(px-u*.2,0,px+u*.2,0);
  g.addColorStop(0,base);g.addColorStop(.45,light);g.addColorStop(1,base);
  polygon([[px-u*.145,py+u*.02],[px+u*.145,py+u*.02],
           [px+u*.087,py-u*.33],[px-u*.087,py-u*.33]],g);
  round(px-u*.15,py-u*.385,u*.30,u*.075,u*.025,dark);
 }
 function drawPawn(x,row,enemy=false,scale=1,ghost=false,jump=0){
  const [px,py]=project(x,row),u=cellSize()*scale;
  const skin=enemy?{color:'#bb6670',accent:'#ffd0c6',trim:'#f1bf7d'}:selectedSkin();
  ctx.save();if(ghost)ctx.globalAlpha=.48+.38*Math.abs(Math.sin(performance.now()/125));
  paintChessPiece(ctx,'pawn',skin,px,py+u*.21,u,{enemy,jump});ctx.restore();
 }
 function drawEnemy(x,row,kind,scale=1,isPlayer=false,jump=0){
  const [px,py]=project(x,row),u=cellSize()*scale;
  const skin=isPlayer?selectedSkin():{color:'#ba6473',accent:'#ffd0ca',trim:'#f5c47e'};
  paintChessPiece(ctx,kind,skin,px,py+u*.21,u,{enemy:!isPlayer,jump});
 }
 function safeRespawn(){
  let row=Math.max(0,highest-3);
  while(row>0&&lane(row)!=='meadow')row--;
  return {x:4,row};
 }
 function hit(reason='hit'){sound.play(reason);invincibleUntil=performance.now()+1500;player=safeRespawn();hop=null;onHit();}
 function move(dx,dy){
  const now=performance.now();
  if(dead||!overlay.hidden||now-lastMove<68)return;
  const nx=Math.max(0,Math.min(8,player.x+dx)),nr=Math.max(0,player.row+dy);
  if(nx===player.x&&nr===player.row)return;
  lastMove=now;sound.play('step');hop={from:{...player},to:{x:nx,row:nr},since:now};player={x:nx,row:nr};
  if(nr>highest){const gained=nr-highest;highest=nr;onScore(gained);if([100,500,750].includes(nr))onStatus('New level: '+(nr===100?'CHALLENGER':nr===500?'MASTER':'GRANDMASTER')+'! More chess pieces approach.')}
  if(collision(nx,nr,(now-origin)/1000))hit(lane(nr)==='river'?'water':'hit');
  else if(pawnCoinAt(model,nr,nx)&&!collected.has(nr+':'+nx)){
   collected.add(nr+':'+nx);wallet=earnPawnCoins(wallet,1);persistWallet();sound.play('coin');onStatus('🪙 +1 coin · '+wallet.coins+' saved on this device');
  }
 }
 const keys={ArrowUp:[0,1],KeyW:[0,1],ArrowDown:[0,-1],KeyS:[0,-1],ArrowLeft:[-1,0],KeyA:[-1,0],ArrowRight:[1,0],KeyD:[1,0]};
 function keydown(e){if(dead)return;if(e.code==='Escape'){e.preventDefault();setMenu(overlay.hidden);return}if(!overlay.hidden||!keys[e.code])return;if(e.target?.matches('input,textarea'))return;e.preventDefault();move(...keys[e.code]);}
 const dirs={left:[-1,0],right:[1,0],forward:[0,1],back:[0,-1]};
 // Pointerdown handles physical taps exactly once. Keyboard-generated clicks stay accessible.
 function controlPointer(e){
  const button=e.target.closest('[data-direction]');if(!button||!e.isPrimary)return;
  e.preventDefault();move(...dirs[button.dataset.direction]);
 }
 function controlClick(e){
  if(e.detail!==0)return;
  const button=e.target.closest('[data-direction]');if(button)move(...dirs[button.dataset.direction]);
 }
 function gestureStart(e){
  if(!e.isPrimary||!overlay.hidden)return;
  e.preventDefault();pointer={id:e.pointerId,x:e.clientX,y:e.clientY};
  try{canvas.setPointerCapture(e.pointerId)}catch{}
 }
 function gestureEnd(e){
  if(!pointer||pointer.id!==e.pointerId)return;
  e.preventDefault();
  const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;
  if(Math.max(Math.abs(dx),Math.abs(dy))<23){move(0,1);return}
  move(...(Math.abs(dx)>Math.abs(dy)?[Math.sign(dx),0]:[0,-Math.sign(dy)]));
 }
 function gestureCancel(){pointer=null}
 function preventZoom(e){e.preventDefault()}
 function frame(now){
  if(dead)return;
  if(!overlay.hidden){raf=requestAnimationFrame(frame);return}
  const time=(now-origin)/1000;
  camera+=(Math.max(0,player.row-3.3)-camera)*.14;
  ctx.clearRect(0,0,width,height);scenery();
  const u=cellSize(),low=Math.max(0,Math.floor(camera-height*.36/(u*.83))-3);
  const high=Math.max(10,Math.ceil(camera+height*.76/(u*.83))+3);
  for(let row=high;row>=low;row--){
   const type=lane(row);
   if(type==='river')drawRiver(row,time);
   else for(let x=0;x<9;x++)tile(x,row,type,time);
  }
  playerSquare(now);
  for(let row=high;row>=low;row--){
   if(row%2===0){
    clubDecoration(-.9,row);clubDecoration(8.9,row);
   }
   const type=lane(row);
   for(let x=0;x<9;x++)if(pawnCoinAt(model,row,x)&&!collected.has(row+':'+x))drawCoin(x,row,time);
   if(type==='road'||type==='court'){
    for(let k=0;k<enemyCount(row);k++){
     const x=enemyX(row,k,time);
     if(x>=-.65&&x<=8.65)drawEnemy(x,row,enemyKind(row,k),.92);
    }
   }
   if(row===player.row){
    let x=player.x,r=player.row,jump=0;
    if(hop){
     const progress=Math.min(1,(now-hop.since)/165);
     x=hop.from.x+(hop.to.x-hop.from.x)*progress;
     r=hop.from.row+(hop.to.row-hop.from.row)*progress;
     jump=Math.sin(progress*Math.PI);
     if(progress>=1)hop=null;
    }
    const skin=selectedSkin();
    if(skin.kind==='pawn')drawPawn(x,r,false,.97,now<invincibleUntil,jump);
    else{ctx.save();if(now<invincibleUntil)ctx.globalAlpha=.45+.4*Math.abs(Math.sin(now/125));drawEnemy(x,r,skin.kind,.95,true,jump);ctx.restore();}
   }
  }
  // HUD is intentionally detached from the camera and has a consistent hit-free area.
  const w=Math.min(204,width*.51),left=width-w-12;
  round(left,12,w,103,13,'#0c253be8');
  ctx.strokeStyle='#dfca92b5';ctx.lineWidth=1.4;ctx.strokeRect(left+5,17,w-10,93);
  ctx.textAlign='right';ctx.fillStyle='#ffe3ae';ctx.font='bold 13px system-ui';
  ctx.fillText('PAWN KINGDOM',width-24,37);
  ctx.fillStyle='#fff9e9';ctx.font='bold 23px system-ui';
  ctx.fillText(''+highest+'  SQUARES',width-24,68);
  const tier=difficulty(highest),badge=tier===0?'ROOKIE':tier===1?'CHALLENGER':tier===2?'MASTER':'GRANDMASTER';
  ctx.textAlign='right';ctx.font='bold 12px system-ui';ctx.fillStyle='#fff0c5';
  ctx.fillText('🪙 '+wallet.coins+'  ·  '+badge,width-24,91);
  if(collision(player.x,player.row,time)&&now>=invincibleUntil)hit(lane(player.row)==='river'?'water':'hit');
  if(!dead)raf=requestAnimationFrame(frame);
 }
 let hiddenAt=0,pausedForVisibility=false;
 function visibilityChanged(){
  if(dead)return;
  if(document.hidden){
   if(hiddenAt)return;
   hiddenAt=performance.now();pausedForVisibility=overlay.hidden;
   if(pausedForVisibility)onPauseChange(true);
   cancelAnimationFrame(raf);raf=0;
  }else if(hiddenAt){
   const elapsed=performance.now()-hiddenAt;
   origin+=elapsed;invincibleUntil+=elapsed;if(hop)hop.since+=elapsed;hiddenAt=0;
   if(pausedForVisibility)onPauseChange(false);
   pausedForVisibility=false;
   raf=requestAnimationFrame(frame);
  }
 }
 document.addEventListener('visibilitychange',visibilityChanged);
 window.addEventListener('keydown',keydown);
 controls.addEventListener('click',controlClick);
 controls.addEventListener('pointerdown',controlPointer);
 canvas.addEventListener('pointerdown',gestureStart,{passive:false});
 canvas.addEventListener('pointerup',gestureEnd,{passive:false});
 canvas.addEventListener('pointercancel',gestureCancel);
 root.addEventListener('dblclick',preventZoom,{passive:false});
 window.addEventListener('resize',size);
 size();raf=requestAnimationFrame(frame);
 return {
  destroy(){
   dead=true;cancelAnimationFrame(raf);sound.destroy();
   window.removeEventListener('keydown',keydown);window.removeEventListener('resize',size);
   document.removeEventListener('visibilitychange',visibilityChanged);
   controls.removeEventListener('click',controlClick);
   controls.removeEventListener('pointerdown',controlPointer);
   canvas.removeEventListener('pointerdown',gestureStart);
   canvas.removeEventListener('pointerup',gestureEnd);
   canvas.removeEventListener('pointercancel',gestureCancel);
   root.removeEventListener('dblclick',preventZoom);
   root.remove();document.body.classList.remove('pawn-dash-active');
  },
  getProgress:()=>highest
 };
}
