import {paintChessPiece} from './pawn-piece-art.mjs';
import {createPawnSound} from './pawn-sound.mjs?v=20261111-turk11';
import {PIECE_ORDER,PIECE_LABELS,PAWN_SHOP,readPawnWallet,earnPawnCoins,buyPawnSkin,pawnCoinAt} from './pawn-shop.mjs';
import {createPawnDashModel} from './pawn-world-logic.mjs';
// Original EloScanner Pawn Dash: a chess-themed, perspective crossing game.
// No game sprites, levels or assets from third-party titles are used.
export function createPawnWorld({host,seed,onScore,onHit,onRetry=()=>{},onStatus,onPauseChange=()=>{}}){
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
 const soundButton=document.createElement('button');soundButton.type='button';soundButton.textContent='♫ Sound & music';soundButton.setAttribute('aria-label','Open sound and music settings');
 const audioPanel=document.createElement('section');audioPanel.className='pawn-audio-panel';audioPanel.hidden=true;
 const audioHeading=document.createElement('h3');audioHeading.textContent='Sound & music';audioPanel.append(audioHeading);
 const audioKey='eloscanner-pawn-audio-v1';
 let audioSettings={master:.75,music:.32,effects:.75,musicOn:true,muted:false};
 try{const v=JSON.parse(localStorage.getItem(audioKey));if(v&&typeof v==='object')for(const k of Object.keys(audioSettings))if(k in v)audioSettings[k]=v[k]}catch{}
 const saveAudio=()=>{try{localStorage.setItem(audioKey,JSON.stringify(audioSettings))}catch{}};
 for(const kind of ['master','music','effects']){
  const v=Number(audioSettings[kind]);audioSettings[kind]=Number.isFinite(v)?Math.max(0,Math.min(1,v)):.5;
  sound.setVolume(kind,audioSettings[kind]);
 }
 sound.setMusicOn(audioSettings.musicOn!==false);sound.setMuted(audioSettings.muted===true);
 const addToggle=(label,key,callback)=>{
  const button=document.createElement('button');button.type='button';button.className='pawn-audio-toggle';
  const refresh=()=>{button.textContent=label+': '+(audioSettings[key]?'On':'Off');button.setAttribute('aria-pressed',String(!!audioSettings[key]))};
  button.onclick=()=>{audioSettings[key]=!audioSettings[key];callback(audioSettings[key]);saveAudio();refresh();sound.play('menu')};
  refresh();audioPanel.append(button);
 };
 addToggle('Music','musicOn',v=>sound.setMusicOn(v));
 addToggle('Mute all','muted',v=>sound.setMuted(v));
 for(const [kind,label] of [['master','Overall volume'],['music','Music volume'],['effects','Sound effects volume']]){
  const wrap=document.createElement('label');wrap.className='pawn-audio-slider';
  const name=document.createElement('span');name.textContent=label;
  const out=document.createElement('output');out.textContent=Math.round(audioSettings[kind]*100)+'%';
  const input=document.createElement('input');input.type='range';input.min='0';input.max='100';input.step='1';
  input.value=String(Math.round(audioSettings[kind]*100));input.setAttribute('aria-label',label);
  input.oninput=()=>{audioSettings[kind]=Number(input.value)/100;sound.setVolume(kind,audioSettings[kind]);out.textContent=input.value+'%';saveAudio()};
  wrap.append(name,out,input);audioPanel.append(wrap);
 }
 const audioBack=document.createElement('button');audioBack.type='button';audioBack.textContent='← Back to menu';audioPanel.append(audioBack);
 soundButton.onclick=()=>{sound.unlock();sound.play('menu');audioPanel.hidden=false;menuTitle.hidden=true;resume.hidden=true;shopButton.hidden=true;soundButton.hidden=true;exit.hidden=true;menuHelp.hidden=true};
 audioBack.onclick=()=>{sound.play('menu');audioPanel.hidden=true;if(dead){gameOverPanel.hidden=false;return}menuTitle.hidden=false;resume.hidden=false;shopButton.hidden=false;soundButton.hidden=false;exit.hidden=false;menuHelp.hidden=false};
 const menuHelp=document.createElement('p');menuHelp.textContent='Tap to hop · Swipe to steer · Collect 1 coin at a time · Explore 30 skins · Esc pauses';
 const gameOverPanel=document.createElement('section');gameOverPanel.className='pawn-game-over';gameOverPanel.hidden=true;
 const gameOverTitle=document.createElement('h2');gameOverTitle.textContent='GAME OVER';
 const gameOverMessage=document.createElement('p');gameOverMessage.textContent='You died! One life, one run.';
 const gameOverScore=document.createElement('p');gameOverScore.className='pawn-game-over-score';
 const retryButton=document.createElement('button');retryButton.type='button';retryButton.textContent='Retry';
 const skinsButton=document.createElement('button');skinsButton.type='button';skinsButton.textContent='Skins';
 const musicButton=document.createElement('button');musicButton.type='button';musicButton.textContent='Music';
 const gameOverExit=document.createElement('button');gameOverExit.type='button';gameOverExit.textContent='Exit to minigames';
 gameOverPanel.append(gameOverTitle,gameOverMessage,gameOverScore,retryButton,skinsButton,musicButton,gameOverExit);
 overlay.append(menuTitle,resume,shopButton,soundButton,exit,menuHelp,shopPanel,audioPanel,gameOverPanel);
 let wallet;
 let runCoins=0; // Only physical coin pickups increase this run's earnings.
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
  shopBalance.textContent='🪙 '+wallet.coins.toLocaleString('en-US')+' saved coins · +'+runCoins+' this run';
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
 shopBack.onclick=()=>{sound.play('menu');shopPanel.hidden=true;if(dead){gameOverPanel.hidden=false;return}menuTitle.hidden=false;resume.hidden=false;shopButton.hidden=false;soundButton.hidden=false;exit.hidden=false;menuHelp.hidden=false};
 const setMenu=open=>{sound.play('menu');if(!open&&!audioPanel.hidden)audioBack.click();if(!open&&shopPanel&&!shopPanel.hidden)shopBack.click();if(!open&&pausedAt){const delta=performance.now()-pausedAt;origin+=delta;invincibleUntil+=delta;if(hop)hop.since+=delta;pausedAt=0;}if(open&&!pausedAt)pausedAt=performance.now();overlay.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));onPauseChange(open);if(!open)canvas.focus({preventScroll:true})};
 menuButton.onclick=()=>{if(!dead){sound.unlock();setMenu(overlay.hidden)}};resume.onclick=()=>setMenu(false);exit.onclick=()=>{location.href='/minigames.html'};
 retryButton.onclick=()=>onRetry();
 skinsButton.onclick=()=>{gameOverPanel.hidden=true;shopButton.click()};
 musicButton.onclick=()=>{gameOverPanel.hidden=true;soundButton.click()};
 gameOverExit.onclick=()=>{location.href='/minigames.html'};
 function showGameOver(finalScore){
  dead=true;cancelAnimationFrame(raf);raf=0;
  gameOverScore.textContent='Final score: '+finalScore;
  menuTitle.hidden=true;resume.hidden=true;shopButton.hidden=true;soundButton.hidden=true;exit.hidden=true;menuHelp.hidden=true;
  shopPanel.hidden=true;audioPanel.hidden=true;gameOverPanel.hidden=false;
  overlay.hidden=false;menuButton.hidden=true;controls.hidden=true;
 }
 const canvas=document.createElement('canvas');canvas.className='pawn-world-canvas';canvas.tabIndex=0;
 canvas.setAttribute('aria-label','Pawn Dash in a chess club: tap to hop on a giant chessboard, collect coins and cross clockwork chasms on wooden drawbridges');
 const controls=document.createElement('div');controls.className='pawn-world-controls';controls.setAttribute('aria-label','Pawn Dash movement controls');
 controls.innerHTML='<button type="button" data-direction="left" aria-label="Move left">◀</button><button type="button" data-direction="forward" aria-label="Move forward">▲</button><button type="button" data-direction="back" aria-label="Move backward">▼</button><button type="button" data-direction="right" aria-label="Move right">▶</button>';
 const hint=document.createElement('p');hint.className='pawn-world-hint';hint.textContent='Cross the walnut board · Dodge clockwork gaps · Collect 1 coin · Menu → Shop';
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
 const isPhone=()=>width<=680 || (width<=900&&height>width*1.18);
 const cellSize=()=>isPhone()?Math.min(width/9.1,height/9.6,112):Math.min(width/11.9,height/8.8,112);
 const rowStep=()=>isPhone()?Math.max(cellSize()*1.35,height/10.5):cellSize()*.83;
 // Project the squares onto one consistent oblique chessboard plane.
 // One step up always equals the exact opposite edge of the next row.
 const project=(x,row)=>{
  const u=cellSize(),distance=row-camera;
  return [width*.50+(x-4)*u,height*(isPhone()?.72:.69)-distance*rowStep()];
 };
 const quad=(x,row)=>{
  const [px,py]=project(x,row),u=cellSize(),v=0,d=rowStep();
  return [[px-u*.5+v*.5,py-d*.5],[px+u*.5+v*.5,py-d*.5],
          [px+u*.5-v*.5,py+d*.5],[px-u*.5-v*.5,py+d*.5]];
 };

 // All decorations, hazards, bridges and colours are deterministic in world coordinates.
 function polygon(points,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();ctx.fill()}
 function strokePolygon(points,color,line=1){ctx.strokeStyle=color;ctx.lineWidth=line;ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();ctx.stroke()}
 function round(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
 function scenery(){
  // Bounded walnut board on a dark chess-club tabletop, never infinite checks.
  const u=cellSize(),left=project(0,0)[0]-u*.5,right=project(8,0)[0]+u*.5;
  const table=ctx.createLinearGradient(0,0,width,height);
  table.addColorStop(0,'#17191a');table.addColorStop(.55,'#30261f');table.addColorStop(1,'#171719');
  ctx.fillStyle=table;ctx.fillRect(0,0,width,height);
  for(let i=0;i<28;i++){const y=(i*73)%height;ctx.strokeStyle='#c3a27c0b';ctx.lineWidth=i%4===0?2:1;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y+2);ctx.stroke()}
  if(isPhone())return; // Mobile is an edge-to-edge chessboard without side rails.
  for(const edge of [left,right]){
   const x=edge===left?edge-u*.64:edge;
   const wood=ctx.createLinearGradient(x,0,x+u*.64,0);
   wood.addColorStop(0,'#27180f');wood.addColorStop(.3,'#805333');wood.addColorStop(.65,'#ad8051');wood.addColorStop(1,'#29180f');
   ctx.fillStyle='#08080988';ctx.fillRect(x-5,0,u*.64+10,height);
   ctx.fillStyle=wood;ctx.fillRect(x,0,u*.64,height);
   ctx.fillStyle='#e0b47888';ctx.fillRect(x+u*.04,0,Math.max(1,u*.023),height);
   ctx.fillStyle='#23150f';ctx.fillRect(x+u*.60,0,Math.max(2,u*.04),height);
   for(let i=0;i<Math.ceil(height/115);i++){ctx.fillStyle='#d7a96a';ctx.beginPath();ctx.arc(x+u*.32,i*115+28,Math.max(2,u*.035),0,Math.PI*2);ctx.fill()}
  }
 }
 function gear(cx,cy,r,time,reverse=false){
  ctx.save();ctx.translate(cx,cy);ctx.rotate(time*(reverse?-.7:.7));
  ctx.strokeStyle='#d2a05c';ctx.lineWidth=r*.22;ctx.beginPath();ctx.arc(0,0,r*.7,0,Math.PI*2);ctx.stroke();
  for(let i=0;i<12;i++){ctx.rotate(Math.PI/6);ctx.fillStyle='#b78345';ctx.fillRect(-r*.14,-r*.96,r*.28,r*.30)}
  ctx.fillStyle='#392a21';ctx.beginPath();ctx.arc(0,0,r*.23,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#e3bd80';ctx.beginPath();ctx.arc(0,0,r*.1,0,Math.PI*2);ctx.fill();ctx.restore();
 }
 function turkCabinet(time){
  if(isPhone())return;
  // Historically inspired by von Kempelen's seated, turbaned chess automaton and
  // its maple cabinet; a tiny concealed chess master nods behind a loose panel.
  const u=cellSize(),left=project(0,0)[0]-u*.5,available=left-u*.64;
  if(available<u*.9)return;
  const cx=available*.5,scale=Math.min(available/(u*2.2),1.85);
  ctx.save();ctx.translate(cx,height*.54);ctx.scale(scale,scale);
  const wood=ctx.createLinearGradient(-u*.8,0,u*.8,0);
  wood.addColorStop(0,'#281a13');wood.addColorStop(.35,'#906039');wood.addColorStop(.68,'#6c452c');wood.addColorStop(1,'#241811');
  // Large cabinet and chessboard: period silhouette, original vector illustration.
  round(-u*.83,-u*.28,u*1.66,u*1.52,u*.06,wood);
  round(-u*.75,-u*.18,u*1.5,u*1.30,u*.035,'#3c2a20');
  ctx.strokeStyle='#cda36a';ctx.lineWidth=u*.035;ctx.strokeRect(-u*.74,-u*.17,u*1.48,u*1.27);
  round(-u*.92,-u*.35,u*1.84,u*.13,u*.025,'#b88c52');
  for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#4c3425':'#ddbd86';ctx.fillRect(-u*.67+i*u*.165,-u*.42,u*.165,u*.07)}
  // Seated automaton: rich burgundy robe, shoulder ornaments and turban.
  ctx.fillStyle='#512d39';ctx.beginPath();ctx.moveTo(-u*.60,-u*.32);ctx.lineTo(-u*.48,-u*1.45);ctx.quadraticCurveTo(0,-u*1.8,u*.49,-u*1.44);ctx.lineTo(u*.59,-u*.32);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#d6b078';ctx.lineWidth=u*.06;ctx.beginPath();ctx.moveTo(-u*.45,-u*1.27);ctx.lineTo(-u*.26,-u*.43);ctx.moveTo(u*.43,-u*1.25);ctx.lineTo(u*.24,-u*.43);ctx.stroke();
  ctx.fillStyle='#ad815d';ctx.beginPath();ctx.ellipse(0,-u*1.66,u*.29,u*.35,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#251b1a';ctx.beginPath();ctx.ellipse(0,-u*1.54,u*.24,u*.12,0,0,Math.PI);ctx.fill();
  ctx.fillStyle='#30221e';ctx.beginPath();ctx.ellipse(-u*.12,-u*1.70,u*.035,u*.027,0,0,Math.PI*2);ctx.ellipse(u*.12,-u*1.70,u*.035,u*.027,0,0,Math.PI*2);ctx.fill();
  // Layered ivory turban with central brass jewel.
  for(let i=0;i<4;i++){ctx.fillStyle=i%2?'#c8ad7e':'#eee0ba';ctx.beginPath();ctx.ellipse((i-1.5)*u*.055,-u*(2.00+i*.015),u*(.33-i*.018),u*.13,-.13,0,Math.PI*2);ctx.fill()}
  ctx.fillStyle='#dfb45e';ctx.beginPath();ctx.arc(0,-u*2.11,u*.09,0,Math.PI*2);ctx.fill();
  // Right arm reaches toward the miniature chessboard.
  ctx.strokeStyle='#5c3540';ctx.lineWidth=u*.18;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(u*.36,-u*1.32);ctx.lineTo(u*.56,-u*.83);ctx.lineTo(u*.22,-u*.43);ctx.stroke();
  ctx.fillStyle='#c89c72';ctx.beginPath();ctx.arc(u*.22,-u*.43,u*.10,0,Math.PI*2);ctx.fill();
  // Open gear bay; an off-center door exposes a hidden human operator.
  round(-u*.64,u*.03,u*.68,u*.91,u*.03,'#171a1c');
  gear(-u*.30,u*.36,u*.22,time);gear(-u*.17,u*.69,u*.15,time,true);
  round(u*.06,u*.03,u*.57,u*.91,u*.025,'#6c4a31');
  ctx.strokeStyle='#d0a36a';ctx.lineWidth=u*.028;ctx.strokeRect(u*.11,u*.08,u*.47,u*.81);
  // Secret chess player: faint spectacles, eyes and a hand on a tiny lever.
  ctx.fillStyle='#241c1a';ctx.beginPath();ctx.arc(u*.32,u*.38,u*.18,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#d3a37e';ctx.beginPath();ctx.ellipse(u*.32,u*.39,u*.12,u*.14,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#e6c18b';ctx.lineWidth=u*.018;for(const xx of [.27,.38]){ctx.beginPath();ctx.arc(xx*u,u*.37,u*.042,0,Math.PI*2);ctx.stroke()}
  ctx.strokeStyle='#d5b27b';ctx.lineWidth=u*.035;ctx.beginPath();ctx.moveTo(u*.39,u*.52);ctx.lineTo(u*.51,u*.76);ctx.stroke();
  ctx.restore();
 }
 function pieceFactory(time){
  if(isPhone())return;
  const u=cellSize(),right=project(8,0)[0]+u*.5,avail=width-right-u*.64;
  if(avail<u*.9)return;
  const cx=right+u*.64+avail*.5,scale=Math.min(avail/(u*2.1),1.8);
  ctx.save();ctx.translate(cx,height*.54);ctx.scale(scale,scale);
  // The enemy-piece press: pistons, conveyor, hot-pink enamel vats.
  round(-u*.81,-u*1.76,u*1.62,u*2.76,u*.06,'#262b30');
  round(-u*.72,-u*1.65,u*1.44,u*2.48,u*.05,'#56443a');
  for(let i=0;i<3;i++)round(-u*.67+i*u*.48,-u*1.57,u*.09,u*2.31,u*.015,'#bd8b58');
  round(-u*.58,-u*1.27,u*1.16,u*.22,u*.04,'#a76d4f');
  for(let i=0;i<3;i++){const px=(i-1)*u*.34;round(px-u*.055,-u*1.67,u*.11,u*.59,u*.02,'#b7bbc1');round(px-u*.16,-u*1.17+Math.sin(time*2.8+i*1.8)*u*.13,u*.32,u*.20,u*.02,'#8d6671')}
  round(-u*.62,-u*.69,u*1.24,u*.54,u*.07,'#211b20');
  round(-u*.53,-u*.58,u*1.06,u*.32,u*.03,'#b34e70');
  for(let i=0;i<3;i++){const x=(i-1)*u*.34;ctx.fillStyle='#f2b4c4';ctx.beginPath();ctx.arc(x,-u*.43,u*.11,0,Math.PI*2);ctx.fill()}
  gear(-u*.45,u*.34,u*.21,time);gear(u*.38,u*.34,u*.19,time,true);
  round(-u*.71,u*.67,u*1.42,u*.22,u*.03,'#1a2226');
  // Smokestacks release layered, drifting steam above the working press.
  for(let stack=0;stack<2;stack++){
   const sx=(stack? .43:-.43)*u;
   round(sx-u*.105,-u*2.14,u*.21,u*.65,u*.025,'#333a3d');
   round(sx-u*.14,-u*2.16,u*.28,u*.12,u*.025,'#b08a64');
   for(let puff=0;puff<5;puff++){
    const t=(time*.21+puff*.19+stack*.33)%1;
    ctx.globalAlpha=(1-t)*.38;
    ctx.fillStyle='#d5cfc0';ctx.beginPath();
    ctx.ellipse(sx+Math.sin(time*.8+puff+stack)*u*.10+t*u*.13,
     -u*(2.17+t*.91),u*(.13+t*.22),u*(.09+t*.17),0,0,Math.PI*2);ctx.fill();
   }
   ctx.globalAlpha=1;
  }
  // Full recognizable chess pieces travel smoothly through the factory.
  // Clip to the conveyor's exit gates: they enter/leave offstage, never pop in place.
  ctx.save();ctx.beginPath();ctx.rect(-u*.77,u*.40,u*1.54,u*.33);ctx.clip();
  const skins={color:'#cf6689',accent:'#ffd0df',trim:'#f4b8c4'};
  const kinds=['pawn','rook','bishop','queen','knight','king'];
  for(let i=0;i<7;i++){
   const progress=(time*.18+i/6)%1;
   const x=(-.98+progress*2.0)*u;
   paintChessPiece(ctx,kinds[i%kinds.length],skins,x,u*.59,u*.38,{enemy:true});
  }
  ctx.restore();
  ctx.restore();
 }
 function tile(x,row,type,time){
  const q=quad(x,row),u=cellSize(),cx=project(x,row)[0],cy=project(x,row)[1];
  // Low-glare honey-oak and dark walnut chess squares.
  const dark=(x+row)%2===0;
  const base=dark?'#68432e':'#b18b5c';
  const border=dark?'#4b3023':'#8a6947';
  // Block sides give weight without creating false extra squares.
  polygon([q[3],q[2],[q[2][0],q[2][1]+u*.125],[q[3][0],q[3][1]+u*.125]],border);
  polygon(q,base);
  ctx.save();ctx.beginPath();ctx.moveTo(...q[0]);for(let i=1;i<q.length;i++)ctx.lineTo(...q[i]);ctx.closePath();ctx.clip();
  for(let k=0;k<5;k++){
   const offset=(roll(row*43+x*97+k*31)-.5)*u*.72;
   ctx.strokeStyle=k%2?'#f6d8a018':'#26140e20';ctx.lineWidth=Math.max(.7,u*.011);
   ctx.beginPath();ctx.moveTo(cx-u*.48,cy+offset);ctx.bezierCurveTo(cx-u*.14,cy+offset-u*.045,cx+u*.15,cy+offset+u*.04,cx+u*.48,cy+offset);ctx.stroke();
  }
  const glow=ctx.createLinearGradient(cx-u*.5,cy-u*.35,cx+u*.5,cy+u*.35);
  glow.addColorStop(0,'#fff1c416');glow.addColorStop(.5,'#00000000');glow.addColorStop(1,'#160c0d27');
  ctx.fillStyle=glow;ctx.fillRect(cx-u*.5,cy-u*.42,u,u*.84);ctx.restore();
  ctx.lineWidth=Math.max(1,u*.027);
  strokePolygon(q,border,ctx.lineWidth);
  if(type==='road'){
   // A complete road stripe: each cell shares one horizontal lane surface.
   ctx.fillStyle=dark?'#e8c18b20':'#422a1a1e';
   ctx.fillRect(cx-u*.48,cy-u*.035,u*.96,u*.07);
   if(x===0||x===8){ctx.fillStyle='#b9976a55';ctx.fillRect(cx+(x===0?-u*.44:u*.39),cy-u*.32,u*.055,u*.65)}
  }else if(type==='court'){
   // Carved square joints and a small royal emblem; no purple squares.
   ctx.strokeStyle=dark?'#d9b37d60':'#63452c55';ctx.lineWidth=Math.max(1,u*.016);
   ctx.strokeRect(cx-u*.31,cy-u*.28,u*.62,u*.54);
   if(x===4&&row%2===0){
    ctx.fillStyle='#c5a06c';ctx.beginPath();ctx.arc(cx,cy,u*.08,0,Math.PI*2);ctx.fill();
   }
  }else if(type==='meadow'){
   if(roll(row*101+x*17)>.78){
    ctx.fillStyle='#dfb98126';ctx.beginPath();ctx.ellipse(cx-u*.23,cy+u*.10,u*.12,u*.035,-.2,0,Math.PI*2);ctx.fill();
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
  // A collapsed board rank: animated brass clockwork below, not water.
  const u=cellSize(),cy=project(4,row)[1],h=rowStep(),left=project(0,row)[0]-u*.5,right=project(8,row)[0]+u*.5;
  const gap=ctx.createLinearGradient(0,cy-h*.5,0,cy+h*.5);
  gap.addColorStop(0,'#100f11');gap.addColorStop(.45,'#31251c');gap.addColorStop(1,'#090c10');
  ctx.fillStyle=gap;ctx.fillRect(left,cy-h*.52,right-left,h*1.04);
  ctx.save();ctx.beginPath();ctx.rect(left,cy-h*.48,right-left,h*.96);ctx.clip();
  for(let k=0;k<12;k++){
   const x=left+(k+.5)*u*.76,y=cy+Math.sin(k*3.1)*h*.11,radius=u*(k%2?.24:.31);
   ctx.save();ctx.translate(x,y);ctx.rotate(time*(k%2?-.4:.35)+k);
   ctx.strokeStyle='#9c7546';ctx.lineWidth=Math.max(2,u*.065);
   ctx.beginPath();ctx.arc(0,0,radius*.66,0,Math.PI*2);ctx.stroke();
   for(let tooth=0;tooth<8;tooth++){ctx.rotate(Math.PI/4);ctx.fillStyle='#a17a4b';ctx.fillRect(-u*.052,-radius,u*.104,u*.11)}
   ctx.fillStyle='#251b16';ctx.beginPath();ctx.arc(0,0,radius*.21,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  ctx.restore();
  // Three contiguous wooden drawbridge squares match the collision model.
  for(let x=0;x<9;x++)if(isBridge(row,x)){
   const [px,py]=project(x,row),w=u*.98,hh=h*.82;
   ctx.fillStyle='#29190f';ctx.fillRect(px-w*.5,py-hh*.48+u*.08,w,hh);
   ctx.fillStyle=(x+row)%2?'#a57b4f':'#755035';ctx.fillRect(px-w*.5,py-hh*.5,w,hh*.88);
   ctx.strokeStyle='#d4ae75';ctx.lineWidth=Math.max(1.5,u*.022);ctx.strokeRect(px-w*.48,py-hh*.48,w*.96,hh*.84);
   for(let j=0;j<3;j++){ctx.strokeStyle='#e5c18a40';ctx.beginPath();ctx.moveTo(px-w*.4,py-hh*.3+j*hh*.2);ctx.lineTo(px+w*.4,py-hh*.3+j*hh*.2);ctx.stroke()}
   ctx.fillStyle='#d9b36c';for(const dx of [-.38,.38]){ctx.beginPath();ctx.arc(px+dx*w,py,u*.023,0,Math.PI*2);ctx.fill()}
  }
  ctx.fillStyle='#b18a53';ctx.fillRect(left,cy-h*.52,right-left,Math.max(2,u*.038));
  ctx.fillStyle='#5a3824';ctx.fillRect(left,cy+h*.45,right-left,Math.max(2,u*.048));
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
  if(hop){const t=Math.min(1,Math.max(0,(now-hop.since)/165)),p=t*t*(3-2*t);x=hop.from.x+(hop.to.x-hop.from.x)*p;row=hop.from.row+(hop.to.row-hop.from.row)*p}
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
 function hit(reason='hit'){if(dead)return;sound.play(reason);dead=true;hop=null;onHit();}
 function move(dx,dy){
  const now=performance.now();
  if(dead||!overlay.hidden||now-lastMove<105)return;
  const nx=Math.max(0,Math.min(8,player.x+dx)),nr=Math.max(0,player.row+dy);
  if(nx===player.x&&nr===player.row)return;
  sound.unlock();lastMove=now;sound.play('step');hop={from:{...player},to:{x:nx,row:nr},since:now};player={x:nx,row:nr};
  if(nr>highest){const gained=nr-highest;highest=nr;onScore(gained);if([100,500,750].includes(nr))onStatus('New level: '+(nr===100?'CHALLENGER':nr===500?'MASTER':'GRANDMASTER')+'! More chess pieces approach.')}
  if(collision(nx,nr,(now-origin)/1000))hit('hit');
  else if(pawnCoinAt(model,nr,nx)&&!collected.has(nr+':'+nx)){
   collected.add(nr+':'+nx);wallet=earnPawnCoins(wallet,1);runCoins++;persistWallet();sound.play('coin');onStatus('🪙 +1 coin · '+wallet.coins+' saved on this device');
  }
 }
 const keys={ArrowUp:[0,1],KeyW:[0,1],ArrowDown:[0,-1],KeyS:[0,-1],ArrowLeft:[-1,0],KeyA:[-1,0],ArrowRight:[1,0],KeyD:[1,0]};
 function keydown(e){if(dead)return;if(e.code==='Escape'){e.preventDefault();sound.unlock();setMenu(overlay.hidden);return}if(!overlay.hidden||!keys[e.code])return;if(e.target?.matches('input,textarea'))return;e.preventDefault();move(...keys[e.code]);}
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
  sound.unlock();
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
  ctx.clearRect(0,0,width,height);scenery();turkCabinet(time);pieceFactory(time);
  const u=cellSize(),low=Math.max(0,Math.floor(camera-height*.36/rowStep())-3);
  const high=Math.max(10,Math.ceil(camera+height*.76/rowStep())+3);
  for(let row=high;row>=low;row--){
   const type=lane(row);
   if(type==='river')drawRiver(row,time);
   else for(let x=0;x<9;x++)tile(x,row,type,time);
  }
  playerSquare(now);
  for(let row=high;row>=low;row--){
   const type=lane(row);
   for(let x=0;x<9;x++)if(pawnCoinAt(model,row,x)&&!collected.has(row+':'+x))drawCoin(x,row,time);
   if(type==='road'||type==='court'){
    for(let k=0;k<enemyCount(row);k++){
     const x=enemyX(row,k,time);
     if(x>=-.65&&x<=8.65)drawEnemy(x,row,enemyKind(row,k),.92);
    }
   }

  }
  // Render the player once after all hazards, with lateral hops interpolated
  // on the same world coordinates as its ground shadow.
  let x=player.x,r=player.row,jump=0;
  if(hop){
   const progress=Math.min(1,Math.max(0,(now-hop.since)/165));
   const eased=progress*progress*(3-2*progress);
   x=hop.from.x+(hop.to.x-hop.from.x)*eased;
   r=hop.from.row+(hop.to.row-hop.from.row)*eased;
   jump=Math.sin(progress*Math.PI);
   if(progress>=1)hop=null;
  }
  const skin=selectedSkin();
  if(skin.kind==='pawn')drawPawn(x,r,false,.86,now<invincibleUntil,jump);
  else{ctx.save();if(now<invincibleUntil)ctx.globalAlpha=.45+.4*Math.abs(Math.sin(now/125));drawEnemy(x,r,skin.kind,.84,true,jump);ctx.restore();}
  // HUD is intentionally detached from the camera and has a consistent hit-free area.
  const w=Math.min(isPhone()?136:204,width*(isPhone()?.37:.51)),left=width-w-(isPhone()?7:12);
  const compact=isPhone(),hh=compact?67:103,offset=compact?12:24;
  round(left,compact?7:12,w,hh,compact?9:13,'#0c253be8');
  ctx.strokeStyle='#dfca92b5';ctx.lineWidth=1.2;ctx.strokeRect(left+4,compact?11:17,w-8,hh-10);
  ctx.textAlign='right';ctx.fillStyle='#ffe3ae';ctx.font='bold '+(compact?9:13)+'px system-ui';
  ctx.fillText(compact?'KINGDOM':'PAWN KINGDOM',width-offset,compact?25:37);
  ctx.fillStyle='#fff9e9';ctx.font='bold '+(compact?17:23)+'px system-ui';
  ctx.fillText(''+highest+(compact?'':'  SQUARES'),width-offset,compact?47:68);
  const tier=difficulty(highest),badge=tier===0?'ROOKIE':tier===1?'CHALLENGER':tier===2?'MASTER':'GRANDMASTER';
  ctx.textAlign='right';ctx.font='bold '+(compact?9:12)+'px system-ui';ctx.fillStyle='#fff0c5';
  ctx.fillText('🪙 '+wallet.coins+' (+'+runCoins+')',width-offset,compact?64:91);
  if(collision(player.x,player.row,time)&&now>=invincibleUntil)hit('hit');
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
  showGameOver,
  getProgress:()=>highest
 };
}
