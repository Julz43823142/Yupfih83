import {Chess} from '/vendor/chess/chess-1.4.0.mjs';
const values={"p":100,"n":320,"b":330,"r":500,"q":900,"k":20000};
const ratings={"cashojf3r":800,"bot400":400,"bot500":500,"bot600":600,"bot700":700,"bot800":800,"bot900":900,"bot1000":1000,"bot1100":1100,"bot1200":1200,"bot1300":1300,"bot1400":1400,"rocket":1500,"bot1650":1650,"bot1800":1800,"bot1950":1950,"ominous":2090,"bot2200":2200,"mikhail":2350,"bot2500":2500,"bot2700":2700};
ratings["bot300"]=300;
ratings["bot1550"]=1550;
ratings["bot1600"]=1600;
ratings["bot1700"]=1700;
ratings["bot1900"]=1900;
ratings["bot2000"]=2000;
ratings["bot2100"]=2100;
ratings["bot2250"]=2250;
ratings["bot2300"]=2300;
ratings["bot2400"]=2400;
ratings["bot2450"]=2450;
ratings["bot2600"]=2600;
ratings["bot2800"]=2800;
ratings["bot2850"]=2850;
ratings["bot2900"]=2900;
ratings["bot3000"]=3000;
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
// Small legal opening repertoire for cashojf3r, usable as either color.
// A FEN-position lookup works in the worker without relying on lost move history.
// Each candidate is validated by chess.js when the book is constructed.
const cashOpeningLines=[
 // Queen's Gambit, including declined and accepted setups.
 ['d4','d5','c4','e6','Nc3','Nf6','Bg5'],
 ['d4','d5','c4','dxc4','Nf3','Nf6','e3'],
 ['d4','Nf6','c4','e6','Nc3','d5','Bg5'],
 // London System against common replies.
 ['d4','d5','Bf4','Nf6','e3','e6','Nf3'],
 ['d4','Nf6','Bf4','d5','e3','e6','Nf3'],
 ['d4','d5','Nf3','Nf6','Bf4','e6','e3'],
 // Four Knights Game.
 ['e4','e5','Nf3','Nc6','Nc3','Nf6','Bb5'],
 ['e4','e5','Nc3','Nf6','Nf3','Nc6','Bb5'],
 ['e4','e5','Nf3','Nf6','Nc3','Nc6','Bb5']
];
function openingKey(game){return game.fen().split(' ').slice(0,4).join(' ')}
const cashBook=new Map();
for(const line of cashOpeningLines){
 const game=new Chess();
 for(const san of line){
  const key=openingKey(game);
  const legal=game.moves({verbose:true}).find(m=>m.san===san);
  if(!legal)break;
  const choices=cashBook.get(key)||[];
  if(!choices.includes(legal.san))choices.push(legal.san);
  cashBook.set(key,choices);
  game.move(legal);
 }
}
function cashOpeningMove(moves){
 if(botLevel!=='cashojf3r')return null;
 const choices=cashBook.get(openingKey(chess));
 if(!choices?.length)return null;
 const candidates=moves.filter(m=>choices.includes(m.san));
 if(!candidates.length)return null;
 return candidates[Math.floor(Math.random()*candidates.length)];
}
function chooseBotMove(){
 const moves=chess.moves({verbose:true});if(!moves.length)return null;
 const cashBookMove=cashOpeningMove(moves);
 if(cashBookMove)return cashBookMove;
 // Rocketleague prefers the Queen's Gambit when White; legal moves only.
 if(botLevel==='rocket'&&chess.turn()==='w'){
  const history=chess.history({verbose:true});
  const preferred=history.length===0?'d4':history.length===2&&history[0]?.san==='d4'&&history[1]?.san.startsWith('d5')?'c4':null;
  const opening=moves.find(m=>m.san===preferred);
  if(opening)return opening;
 }
 const elo=ratings[botLevel]||1000,side=chess.turn();
 // Elo values are approximate difficulty tiers, not independently calibrated ratings.
 // Lower levels search less deeply and make more deliberate suboptimal choices.
 const depth=elo<1000?1:elo<1650?2:elo<2000?3:4;
 const noise=elo<700?700:elo<1000?480:elo<1300?300:elo<1650?180:elo<1950?115:elo<2200?70:elo<2500?32:10;
 const ranked=moves.map(m=>{
  chess.move(m);
  const score=search(chess,depth-1,-Infinity,Infinity,side);
  chess.undo();
  const aggression=(botLevel==='ominous'||botLevel==='cashojf3r')?((m.captured?45:0)+(m.san.includes('+')?60:0)+(m.san.includes('#')?150:0)):0;
  return {move:m,score:score+aggression+(Math.random()-.5)*noise};
 }).sort((a,b)=>b.score-a.score);
 const probability=elo<800?.62:elo<1100?.48:elo<1500?.3:elo<1900?.16:elo<2300?.07:.01;
 if(ranked.length>1&&Math.random()<probability){
  const options=ranked.slice(1,Math.min(5,ranked.length));
  return options[Math.floor(Math.random()*options.length)].move;
 }
 return ranked[0].move;
}

self.onmessage=e=>{const {fen,level,token}=e.data;try{chess=new Chess(fen);botLevel=level;const m=chooseBotMove();self.postMessage({token,move:m?{from:m.from,to:m.to,promotion:m.promotion||'q'}:null})}catch(err){self.postMessage({token,error:String(err)})}};
