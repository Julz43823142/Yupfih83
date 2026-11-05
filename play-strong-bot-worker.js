// Strong tiers use the same Stockfish 19 Lite build as Analysis.
// Each request has an isolated engine so an old search cannot play in a new game.
let engine=null,timeout=null,active=null;
function stop(){if(timeout)clearTimeout(timeout);timeout=null;if(engine){engine.terminate();engine=null}active=null}
self.onmessage=e=>{
 const msg=e.data;
 if(msg.action==='stop'){stop();return}
 stop();
 const {fen,token,elo,secondBest=false}=msg;active={token,fen};
 const budget=elo>=2900?6500:elo>=2700?4200:elo>=2500?3000:elo>=2300?2200:elo>=2100?1500:elo>=1600?950:elo>=1300?700:450;
 // UCI_Elo is supported only from roughly 1320. Below that, use Skill Level.
 // These are initial strength targets, not verified human-platform Elo ratings.
 const skill=elo<900?0:elo<1050?1:elo<1200?2:elo<1320?3:null;
 try{
  engine=new Worker('/vendor/stockfish/stockfish-19-lite-single.js');
  let started=false,secondMove=null;
  engine.onmessage=event=>{
   for(const line of String(event.data).split('\n')){
    if(line.includes('uciok'))engine?.postMessage('isready');
    if(line.includes('readyok')&&!started){
     started=true;
     engine?.postMessage('setoption name Threads value 1');
     engine?.postMessage('setoption name Hash value 16');
     if(secondBest)engine?.postMessage('setoption name MultiPV value 2');
     if(skill!==null){engine?.postMessage('setoption name UCI_LimitStrength value false');engine?.postMessage('setoption name Skill Level value '+skill)}
     else{engine?.postMessage('setoption name UCI_LimitStrength value true');engine?.postMessage('setoption name UCI_Elo value '+Math.min(3190,elo))}
     engine?.postMessage('position fen '+fen);
     engine?.postMessage('go movetime '+budget+' depth '+(elo>=2900?22:elo>=2600?19:elo>=2300?16:elo>=1600?13:11));
    }
    if(secondBest&&line.startsWith('info ')&&line.includes(' multipv 2 ')&&line.includes(' pv ')){
     const uci=line.split(' pv ')[1]?.split(' ')[0];
     if(/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))secondMove=uci;
    }
    if(line.startsWith('bestmove ')){
     const uci=(secondBest?secondMove:null)||line.split(/\s+/)[1];
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
