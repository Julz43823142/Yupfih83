// LARS speculative search while the human is on move.
// MultiPV 3 predicts the opponent's top three moves; each continuation is
// independently searched for a reply. Results are keyed to the original FEN.
import {Chess} from '/vendor/chess/chess-1.4.0.mjs';
let engine=null, timer=null, generation=0;
function cleanup(){if(timer)clearTimeout(timer);timer=null;if(engine){engine.terminate();engine=null}}
function search(fen,ms,multi=1){
 return new Promise((resolve,reject)=>{
  const w=new Worker('/vendor/stockfish/stockfish-19-lite-single.js');
  engine=w;
  let started=false,settled=false;
  const pvs=new Map();
  const finish=(error,result)=>{
   if(settled)return;settled=true;
   clearTimeout(timer);timer=null;w.terminate();if(engine===w)engine=null;
   if(error)reject(error);else resolve(result);
  };
  timer=setTimeout(()=>finish(new Error('Search timeout')),ms+12000);
  w.onerror=()=>finish(new Error('Stockfish unavailable'));
  w.onmessage=e=>{
   for(const line of String(e.data).split('\n')){
    if(line.includes('uciok'))w.postMessage('isready');
    if(line.includes('readyok')&&!started){
     started=true;
     w.postMessage('setoption name Threads value 1');
     w.postMessage('setoption name Hash value 32');
     w.postMessage('setoption name UCI_LimitStrength value false');
     w.postMessage('setoption name Skill Level value 20');
     w.postMessage('setoption name MultiPV value '+multi);
     w.postMessage('position fen '+fen);
     w.postMessage('go movetime '+ms+' depth 40');
    }
    if(line.startsWith('info ')&&line.includes(' pv ')){
     const rank=Number(/\bmultipv (\d+)/.exec(line)?.[1]||1);
     const uci=line.split(' pv ')[1]?.split(' ')[0];
     if(rank<=multi&&/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))pvs.set(rank,uci);
    }
    if(line.startsWith('bestmove ')){
     const best=line.split(/\s+/)[1];
     finish(null,multi===1?[best]:[...pvs.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]));
     return;
    }
   }
  };
  w.postMessage('uci');
 });
}
self.onmessage=async e=>{
 const {fen,token,action}=e.data;
 if(action==='stop'){generation++;cleanup();return}
 generation++;cleanup();const own=generation;
 try{
  const predictions=await search(fen,900,3);
  if(own!==generation)return;
  const chess=new Chess(fen);
  for(const uci of predictions.slice(0,3)){
   if(own!==generation)return;
   try{
    const game=new Chess(fen);
    game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});
    const reply=(await search(game.fen(),1100,1))[0];
    if(own!==generation)return;
    if(/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(reply)){
     const legal=game.moves({verbose:true}).some(m=>m.from===reply.slice(0,2)&&m.to===reply.slice(2,4)&&(m.promotion||'q')===(reply[4]||'q'));
     if(legal)self.postMessage({token,fen,after:game.fen(),move:{from:reply.slice(0,2),to:reply.slice(2,4),promotion:reply[4]||'q'}});
    }
   }catch{}
  }
 }catch{}finally{if(own===generation)cleanup()}
};
