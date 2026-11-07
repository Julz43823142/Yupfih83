import {Chess} from '/vendor/chess/chess-1.4.0.mjs';
const values={"p":100,"n":320,"b":330,"r":500,"q":900,"k":20000};
import {BOT_RATINGS} from './play-bot-strength.mjs';
import {preferredOpeningMove} from './play-bot-openings.mjs';
const ratings=BOT_RATINGS;
let chess,botLevel;
const evaluate=(game,side)=>{
 if(game.isCheckmate())return game.turn()===side?-999999:999999;
 if(game.isDraw())return 0;
 let sum=0;
 for(const row of game.board())for(const pc of row)if(pc){
  const advancement=pc.type==='p'?(pc.color==='w'?Number(pc.square[1])-2:7-Number(pc.square[1])):0;
  const center=(3.5-Math.abs(3.5-(pc.square.charCodeAt(0)-97)))*2;
  const score=values[pc.type]+(pc.type==='p'?advancement*3:0)+center;
  sum+=(pc.color===side?1:-1)*score;
 }
 return sum;
};
function search(game,depth,alpha,beta,side){
 if(depth===0||game.isGameOver())return evaluate(game,side);
 const maximizing=game.turn()===side;
 const moves=game.moves({verbose:true}).sort((a,b)=>(Number(!!b.captured)*100+Number(b.san.includes('+'))*30)-(Number(!!a.captured)*100+Number(a.san.includes('+'))*30));
 let best=maximizing?-Infinity:Infinity;
 for(const move of moves){game.move(move);const v=search(game,depth-1,alpha,beta,side);game.undo();if(maximizing){best=Math.max(best,v);alpha=Math.max(alpha,best)}else{best=Math.min(best,v);beta=Math.min(beta,best)}if(beta<=alpha)break}
 return best;
}
function chooseBotMove(bookOnly=false){
 const moves=chess.moves({verbose:true});if(!moves.length)return null;
 const bookMove=preferredOpeningMove(chess,botLevel);
 if(bookMove)return bookMove;
 if(bookOnly)return null;
 const elo=ratings[botLevel]||1000,side=chess.turn();
 // Elo values are approximate difficulty tiers, not independently calibrated ratings.
 // Lower levels search less deeply and make more deliberate suboptimal choices.
 const depth=elo<500?1:elo<800?2:elo<1320?3:elo<1900?3:4;
 const noise=elo<300?1100:elo<500?750:elo<700?480:elo<900?280:elo<1100?160:elo<1320?100:elo<1650?55:elo<1950?35:elo<2200?25:elo<2500?18:8;
 const ranked=moves.map(m=>{
  chess.move(m);
  const score=search(chess,depth-1,-Infinity,Infinity,side);
  chess.undo();
  const aggression=(botLevel==='ominous'||botLevel==='cashojf3r')?((m.captured?16:0)+(m.san.includes('+')?24:0)+(m.san.includes('#')?100:0)):0;
  return {move:m,score:score+aggression+(Math.random()-.5)*noise};
 }).sort((a,b)=>b.score-a.score);
 const probability=elo<300?.65:elo<500?.5:elo<700?.38:elo<900?.25:elo<1100?.16:elo<1320?.1:elo<1500?.07:elo<1900?.04:elo<2300?.025:.01;
 if(ranked.length>1&&Math.random()<probability){
  const options=ranked.slice(1,Math.min(5,ranked.length));
  return options[Math.floor(Math.random()*options.length)].move;
 }
 return ranked[0].move;
}

self.onmessage=e=>{const {fen,level,token,bookOnly=false}=e.data;try{chess=new Chess(fen);botLevel=level;const m=chooseBotMove(bookOnly);self.postMessage({token,bookMiss:bookOnly&&!m,move:m?{from:m.from,to:m.to,promotion:m.promotion||'q'}:null})}catch(err){self.postMessage({token,error:String(err)})}};
