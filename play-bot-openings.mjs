import {Chess} from './vendor/chess/chess-1.4.0.mjs';
// A position-aware repertoire: only follow a line while the opponent's moves
// actually allow it. No forced move-number opening scripts after deviations.
// Each SAN is validated against chess.js while the book is built.
const repertoire={
 cashojf3r:[
  // London System against common 1...d5 and 1...Nf6 setups.
  ['d4','d5','Bf4','Nf6','e3','e6','Nf3'],
  ['d4','Nf6','Bf4','d5','e3','e6','Nf3'],
  ['d4','d5','Nf3','Nf6','Bf4','e6','e3'],
  // Queen's Gambit (declined, accepted and Indian move orders).
  ['d4','d5','c4','e6','Nc3','Nf6','Bg5'],
  ['d4','d5','c4','dxc4','Nf3','Nf6','e3'],
  ['d4','Nf6','c4','e6','Nc3','d5','Bg5'],
  // Four Knights Game, including alternative development orders.
  ['e4','e5','Nf3','Nc6','Nc3','Nf6','Bb5'],
  ['e4','e5','Nc3','Nf6','Nf3','Nc6','Bb5'],
  ['e4','e5','Nf3','Nf6','Nc3','Nc6','Bb5']
 ],
 rocket:[
  ['d4','d5','c4','e6','Nc3','Nf6','Nf3'],
  ['d4','d5','c4','dxc4','Nf3','Nf6','e3'],
  ['d4','Nf6','c4','e6','Nc3','d5','Nf3'],
  ['d4','d5','c4','c6','Nc3','Nf6','Nf3']
 ],
 chessmass:[
  // Scotch Gambit as White.
  ['e4','e5','Nf3','Nc6','d4','exd4','Bc4','Bc5','c3'],
  ['e4','e5','Nf3','Nc6','d4','exd4','Bc4','Nf6','e5'],
  // King's Indian Defense against queen-pawn openings.
  ['d4','Nf6','c4','g6','Nc3','Bg7','e4','d6'],
  ['d4','Nf6','Nf3','g6','c4','Bg7','Nc3','d6'],
  ['c4','Nf6','d4','g6','Nc3','Bg7','e4','d6']
 ],
 peanut:[
  // Italian Game as White and symmetrical Italian setups as Black.
  ['e4','e5','Nf3','Nc6','Bc4','Bc5','c3','Nf6'],
  ['e4','e5','Nf3','Nc6','Bc4','Nf6','d3','Bc5'],
  ['e4','e5','Nf3','Nc6','Bc4','Bc5','d3','Nf6']
 ]
};
export const openingKey=game=>game.fen().split(' ').slice(0,4).join(' ');
const books=new Map();
for(const [id,lines] of Object.entries(repertoire)){
 const positions=new Map();
 for(const line of lines){
  const game=new Chess();
  for(let ply=0;ply<line.length;ply++){
   const san=line[ply],legal=game.moves({verbose:true}).find(move=>move.san===san);
   if(!legal)throw new Error('Invalid '+id+' repertoire move: '+san);
   // The repertoire governs the bot's color, not its opponent's replies.
   // Each viewer bot can be chosen as either White or Black.
   const key=openingKey(game);
   let choices=positions.get(key);
   if(!choices){choices=new Map();positions.set(key,choices)}
   choices.set(san,(choices.get(san)||0)+1);
   game.move(legal);
  }
 }
 books.set(id,positions);
}
export function preferredOpeningMove(game,id,random=Math.random){
 const choices=books.get(id)?.get(openingKey(game));
 if(!choices)return null;
 const legal=game.moves({verbose:true});
 // Keep declared repertoire priorities: chess.js legal-move ordering is not
 // an opening preference and changes the result for deterministic choices.
 const candidates=[...choices].map(([san,weight])=>({move:legal.find(m=>m.san===san),weight})).filter(x=>x.move);
 if(!candidates.length)return null;
 const total=candidates.reduce((sum,x)=>sum+x.weight,0);
 let draw=random()*total;
 for(const candidate of candidates){draw-=candidate.weight;if(draw<0)return candidate.move}
 return candidates.at(-1).move;
}
