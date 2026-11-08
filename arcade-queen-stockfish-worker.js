// Stockfish-assisted Queen Chase: restrict the root search to queen-only,
// non-capturing escapes. Stockfish requires both kings in its internal FEN;
// these are virtual engine-only kings and do not appear on the arcade board.
// If no synthetic legal position is available, the UI uses the queen escape
// algorithm rather than presenting an illegal Stockfish move.
import {Chess} from '/vendor/chess/chess-1.4.0.mjs';
import {square,cell,moves,threatened,xy} from '/arcade-rules.mjs';
let engine=null,timeout=null,active=null;
function stop(){
 if(timeout)clearTimeout(timeout);timeout=null;
 if(engine){try{engine.terminate()}catch{}engine=null}active=null;
}
function validVirtualKings(pieces,q){
 const occupied=new Set(Object.keys(pieces).map(Number)),whitePriority=[60,61,59,56,63,52,53,51,44,45,43,48],blackPriority=[1,9,6,14,17,22,8,15,2,5,10,13,24,31];
 const base={...pieces,[q]:{type:'Q',side:'enemy'}};
 for(const w of whitePriority){
  if(occupied.has(w)||threatened(w,base,'enemy'))continue;
  for(const b of blackPriority){
   if(occupied.has(b)||w===b||threatened(b,base,'player'))continue;
   const [wx,wy]=xy(w),[bx,by]=xy(b);
   if(Math.abs(wx-bx)<=1&&Math.abs(wy-by)<=1)continue;
   return {w,b};
  }
 }
 return null;
}
function makeFen(pieces,q){
 const virtual=validVirtualKings(pieces,q);
 if(!virtual)return null;
 const array=Array(64).fill('');
 for(const [k,p] of Object.entries(pieces)){
  const symbol=p.type.toUpperCase();
  array[Number(k)]=p.side==='player'?symbol:symbol.toLowerCase();
 }
 array[q]='q';array[virtual.w]='K';array[virtual.b]='k';
 const rows=[];
 for(let y=0;y<8;y++){
  let row='',blanks=0;
  for(let x=0;x<8;x++){
   const p=array[y*8+x];
   if(!p)blanks++;
   else{if(blanks){row+=blanks;blanks=0}row+=p}
  }
  if(blanks)row+=blanks;
  rows.push(row);
 }
 return rows.join('/')+' b - - 0 1';
}
self.onmessage=e=>{
 if(e.data?.action==='stop'){stop();return}
 stop();
 const {token,pieces,queen}=e.data||{};
 if(!Number.isInteger(queen)||queen<0||queen>63||!pieces||typeof pieces!=='object')return;
 active=token;
 const fen=makeFen(pieces,queen);
 if(!fen){self.postMessage({token,error:'No synthetic legal position'});return}
 let chess;
 try{chess=new Chess(fen)}catch{self.postMessage({token,error:'Invalid virtual position'});return}
 const from=square(queen);
 const allowed=moves('Q',queen,pieces,{side:'enemy'})
  .filter(i=>!pieces[i]&&!threatened(i,pieces,'player'))
  .map(square);
 const legal=chess.moves({verbose:true})
  .filter(m=>m.from===from&&allowed.includes(m.to)).map(m=>m.from+m.to);
 if(!legal.length){self.postMessage({token,error:'Queen trapped'});return}
 try{
  const sf=new Worker('/vendor/stockfish/stockfish-19-lite-single.js');
  engine=sf;
  let started=false;
  sf.onmessage=event=>{
   if(active!==token)return;
   for(const row of String(event.data).split('\n')){
    if(row.includes('uciok'))sf.postMessage('isready');
    if(row.includes('readyok')&&!started){
     started=true;
     sf.postMessage('setoption name Threads value 1');
     sf.postMessage('setoption name Hash value 16');
     sf.postMessage('setoption name UCI_LimitStrength value false');
     sf.postMessage('setoption name Skill Level value 20');
     sf.postMessage('position fen '+fen);
     sf.postMessage('go movetime 1200 depth 22 searchmoves '+legal.join(' '));
    }
    if(row.startsWith('bestmove ')){
     const uci=row.split(/\s+/)[1];
     const to=uci&&legal.includes(uci)?cell(uci.slice(2,4)):-1;
     self.postMessage({token,to});
     stop();return;
    }
   }
  };
  sf.onerror=()=>{self.postMessage({token,error:'Stockfish unavailable'});stop()};
  sf.postMessage('uci');
  timeout=setTimeout(()=>{self.postMessage({token,error:'Stockfish timed out'});stop()},16000);
 }catch{self.postMessage({token,error:'Stockfish unavailable'});stop()}
};
