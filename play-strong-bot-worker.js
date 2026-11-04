// Strong tiers use the same Stockfish 19 Lite build as Analysis.
// Each request has an isolated engine so an old search cannot play in a new game.
let engine=null,timeout=null,active=null;
function stop(){if(timeout)clearTimeout(timeout);timeout=null;if(engine){engine.terminate();engine=null}active=null}
self.onmessage=e=>{
 const msg=e.data;
 if(msg.action==='stop'){stop();return}
 stop();
 const {fen,token,elo}=msg;active={token,fen};
 const budget=elo>=2900?6500:elo>=2700?4200:elo>=2500?3000:elo>=2300?2200:elo>=2100?1500:1000;
 try{
  engine=new Worker('/vendor/stockfish/stockfish-19-lite-single.js');
  let ready=false,started=false;
  engine.onmessage=event=>{
   for(const line of String(event.data).split('\n')){
    if(line.includes('uciok'))engine?.postMessage('isready');
    if(line.includes('readyok')&&!started){
     ready=true;started=true;
     engine?.postMessage('setoption name Threads value 1');
     engine?.postMessage('setoption name Hash value 16');
     engine?.postMessage('position fen '+fen);
     engine?.postMessage('go movetime '+budget+' depth '+(elo>=2900?22:elo>=2600?19:elo>=2300?16:14));
    }
    if(line.startsWith('bestmove ')){
     const uci=line.split(/\s+/)[1];
     if(uci&&uci!=='(none)'&&/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))self.postMessage({token,move:{from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'}});
     else self.postMessage({token,error:'No legal engine move'});
     stop();return;
    }
   }
  };
  engine.onerror=()=>{self.postMessage({token,error:'Stockfish unavailable'});stop()};
  engine.postMessage('uci');
  timeout=setTimeout(()=>{self.postMessage({token,error:'Stockfish timed out'});stop()},budget+20000);
 }catch(err){self.postMessage({token,error:String(err)});stop()}
};
