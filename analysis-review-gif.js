// EloScanner Game Review -> animated GIF. Browser-only export; no game data leaves the page.
import {GIFEncoder,quantize,applyPalette} from '/vendor/gifenc/gifenc-1.0.3.mjs';

const COLORS={bg:'#071b2e',panel:'#0e2b43',edge:'#315b75',ink:'#f5fbff',muted:'#a9c5d8',cyan:'#00dff2',light:'#e8d7b6',dark:'#9b7856'};
const MARKS={Brilliant:['#00c6b9','!!'],Great:['#099fee','!'],Book:['#c78b55','▣'],Best:['#2bc92d','◆'],Excellent:['#a9e917','✦'],Good:['#49c52b','✓'],Inaccuracy:['#ffc522','?!'],Mistake:['#ff862c','?'],Miss:['#ef7676','×'],Blunder:['#f03d42','??']};
const PIECES={w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}};
const PIECE_CODES=['wK','wQ','wR','wB','wN','wP','bK','bQ','bR','bB','bN','bP'];

function clock(seconds){
 if(seconds==null||!Number.isFinite(Number(seconds)))return '—:—';
 const t=Math.max(0,Math.round(Number(seconds))),h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;
 return h?h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function label(ctx,str,x,y,size=16,color=COLORS.ink,weight=600){
 ctx.fillStyle=color;ctx.font=weight+' '+size+'px system-ui,Arial,sans-serif';ctx.fillText(String(str),x,y);
}
function roundRect(ctx,x,y,w,h,r,fill){
 ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();
}
async function loadPieces(){
 const entries=await Promise.all(PIECE_CODES.map(async key=>{
  try{
   const img=new Image();img.crossOrigin='anonymous';
   const load=new Promise((resolve,reject)=>{img.onload=()=>resolve(img);img.onerror=reject;});
   img.src='/vendor/pieces/cburnett/'+key+'.svg';
   const value=await load;return [key,value];
  }catch{return [key,null]}
 }));
 return Object.fromEntries(entries);
}
function arrow(ctx,x1,y1,x2,y2){
 const a=Math.atan2(y2-y1,x2-x1),head=14;
 ctx.save();ctx.strokeStyle='rgba(255,144,38,.88)';ctx.fillStyle='rgba(255,144,38,.92)';
 ctx.lineCap='round';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(x1,y1);
 const len=Math.hypot(x2-x1,y2-y1);
 ctx.lineTo(x2-Math.cos(a)*Math.min(head,len*.33),y2-Math.sin(a)*Math.min(head,len*.33));ctx.stroke();
 ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-Math.cos(a-.48)*head,y2-Math.sin(a-.48)*head);
 ctx.lineTo(x2-Math.cos(a+.48)*head,y2-Math.sin(a+.48)*head);ctx.closePath();ctx.fill();ctx.restore();
}
function drawFrame(ctx,state,step,assets,Chess){
 const {history,moves,categories,evaluations,players,clocks}=state;
 const W=720,H=520,B=504,S=63,X=16,Y=8,SIDE=532,SIDE_WIDTH=174;
 ctx.fillStyle=COLORS.bg;ctx.fillRect(0,0,W,H);
 // A near edge-to-edge board with no surrounding title or bottom caption.
 roundRect(ctx,0,0,W,H,8,COLORS.panel);
 label(ctx,'EloScanner',SIDE+11,28,17,COLORS.cyan,800);
 const ev=evaluations[step];
 let cp=Number(ev?.white||0);
 if(!Number.isFinite(cp))cp=0;
 const whitePct=Math.max(3,Math.min(97,50+50*(2/Math.PI)*Math.atan((cp/100)/2.2)));
 // Bar alongside the board, position-based (no additional engine pass).
 ctx.fillStyle='#131923';ctx.fillRect(4,Y,8,B);
 ctx.fillStyle='#f4f4f1';ctx.fillRect(4,Y+B*(1-whitePct/100),8,B*whitePct/100);
 ctx.strokeStyle='#557083';ctx.lineWidth=1;ctx.strokeRect(4.5,Y+.5,7,B);
 for(let rank=0;rank<8;rank++)for(let file=0;file<8;file++){
  ctx.fillStyle=(rank+file)%2?COLORS.dark:COLORS.light;
  ctx.fillRect(X+file*S,Y+rank*S,S,S);
 }
 const current=new Chess(history[step]);let last=null;
 if(step){
  try{last=new Chess(history[step-1]).move(moves[step-1])}catch{}
 }
 const sqxy=square=>[X+(square.charCodeAt(0)-97)*S,Y+(8-Number(square[1]))*S];
 if(last){
  for(const square of [last.from,last.to]){
   const [xx,yy]=sqxy(square);ctx.fillStyle='rgba(255,193,50,.23)';ctx.fillRect(xx,yy,S,S);
  }
 }
 for(let r=0;r<8;r++)for(let f=0;f<8;f++){
  const square=String.fromCharCode(97+f)+(8-r),piece=current.get(square);
  if(!piece)continue;
  const px=X+f*S,py=Y+r*S,img=assets[piece.color+piece.type.toUpperCase()];
  if(img){ctx.drawImage(img,px+3,py+3,S-6,S-6)}
  else{
   ctx.font='43px "DejaVu Sans","Segoe UI Symbol","Noto Sans Symbols 2",serif';
   ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.lineWidth=1.4;ctx.strokeStyle=piece.color==='w'?'#152337':'#f1eadc';
   ctx.fillStyle=piece.color==='w'?'#f8f8f2':'#14263c';
   const ch=PIECES[piece.color][piece.type];ctx.strokeText(ch,px+S/2,py+S/2+2);ctx.fillText(ch,px+S/2,py+S/2+2);
   ctx.textAlign='left';ctx.textBaseline='alphabetic';
  }
 }
 if(last){
  const [fx,fy]=sqxy(last.from),[tx,ty]=sqxy(last.to);
  arrow(ctx,fx+S/2,fy+S/2,tx+S/2,ty+S/2);
  const cat=categories[step-1];
  if(cat&&MARKS[cat.label]){
   const [color,symbol]=MARKS[cat.label];
   ctx.fillStyle=color;ctx.globalAlpha=.32;ctx.fillRect(tx,ty,S,S);ctx.globalAlpha=1;
   ctx.beginPath();ctx.arc(tx+10,ty+11,10,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 10px Arial,sans-serif';ctx.fillStyle='#fff';ctx.fillText(symbol,tx+10,ty+11);ctx.textAlign='left';ctx.textBaseline='alphabetic';
  }
 }
 ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;ctx.strokeRect(X+.5,Y+.5,B-1,B-1);
 const w=players?.white||{},b=players?.black||{};
 const cur=clocks?.[step]||{};
 // Wrap full player names at the available width; never truncate usernames.
 const playerName=(raw,x,y)=>{
  const name=String(raw||'Unknown player').trim()||'Unknown player';
  const maxWidth=SIDE_WIDTH-24, fontSize=15, lineHeight=19;
  ctx.textAlign='left';
  ctx.font='700 '+fontSize+'px system-ui,Arial,sans-serif';
  const lines=[];
  let part='';
  for(const char of name){
   if(part&&ctx.measureText(part+char).width>maxWidth){lines.push(part);part=char;}
   else part+=char;
  }
  if(part)lines.push(part);
  // Chess.com usernames are at most 25 characters, but support taller names safely.
  const chosenSize=lines.length>3?12:fontSize;
  if(chosenSize!==fontSize){
   lines.length=0;part='';
   ctx.font='700 '+chosenSize+'px system-ui,Arial,sans-serif';
   for(const char of name){
    if(part&&ctx.measureText(part+char).width>maxWidth){lines.push(part);part=char;}
    else part+=char;
   }
   if(part)lines.push(part);
  }
  lines.forEach((line,i)=>label(ctx,line,x,y+i*(chosenSize===12?16:lineHeight),chosenSize,COLORS.ink,700));
 };
 // Black's name remains at the top; both clocks face the center; White's name at bottom.
 const playerCard=(color,name,time,y,bottomPlayer=false)=>{
  roundRect(ctx,SIDE,y,SIDE_WIDTH,214,11,'#133750');
  const x=SIDE+12;
  ctx.strokeStyle='#315b75';ctx.lineWidth=1;
  if(!bottomPlayer){
   label(ctx,color,x,y+24,11,COLORS.muted,750);
   playerName(name,x,y+49);
   ctx.beginPath();ctx.moveTo(x,y+110);ctx.lineTo(SIDE+SIDE_WIDTH-12,y+110);ctx.stroke();
   label(ctx,'CLOCK',x,y+142,11,COLORS.muted,700);
   label(ctx,clock(time),x,y+185,26,COLORS.cyan,750);
  }else{
   label(ctx,'CLOCK',x,y+30,11,COLORS.muted,700);
   label(ctx,clock(time),x,y+76,26,COLORS.cyan,750);
   ctx.beginPath();ctx.moveTo(x,y+108);ctx.lineTo(SIDE+SIDE_WIDTH-12,y+108);ctx.stroke();
   label(ctx,color,x,y+131,11,COLORS.muted,750);
   playerName(name,x,y+153);
  }
 };
 playerCard('BLACK',b.name||'Black',cur.b,43);
 playerCard('WHITE',w.name||'White',cur.w,263,true);
}
export async function exportReviewGif({history,moves,categories,evaluations,players,clocks,Chess,onProgress}){
 if(!history?.length||!moves?.length||categories?.length!==moves.length||evaluations?.length!==history.length)throw Error('Finish Game Review before exporting.');
 if(moves.length>240)throw Error('This game is longer than 240 half-moves. GIF export supports games up to 120 full moves.');
 const canvas=document.createElement('canvas');canvas.width=720;canvas.height=520;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)throw Error('Canvas export is unavailable in this browser.');
 const assets=await loadPieces();
 const gif=GIFEncoder();
 const state={history,moves,categories,evaluations,players,clocks};
 for(let i=0;i<history.length;i++){
  drawFrame(ctx,state,i,assets,Chess);
  let rgba;
  try{rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data}
  catch{ // Remote SVGs must never prevent export; use bundled font glyphs instead.
   for(const key of Object.keys(assets))assets[key]=null;
   canvas.width=canvas.width; // reset origin-clean state if a remote image tainted the canvas
   drawFrame(ctx,state,i,assets,Chess);
   rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  }
  const palette=quantize(rgba,96,{format:'rgb565'});
  const indexed=applyPalette(rgba,palette,'rgb565');
  gif.writeFrame(indexed,canvas.width,canvas.height,{palette,delay:i===history.length-1?1600:i===0?1000:650,repeat:0});
  onProgress?.(i+1,history.length);
  // Allow progress text, cancel/navigation, and browser paint to run.
  if(i%3===2)await new Promise(resolve=>setTimeout(resolve,0));
 }
 gif.finish();
 return new Blob([gif.bytes()],{type:'image/gif'});
}
