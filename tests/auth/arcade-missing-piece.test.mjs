import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from '../../vendor/chess/chess-1.4.0.mjs';
import {MISSING_PUZZLES} from '../../arcade-rules.mjs';

test('every Missing Piece challenge begins legal and forces a genuine mate after Black moves',()=>{
 assert.ok(MISSING_PUZZLES.length>=4);
 for(const [i,p] of MISSING_PUZZLES.entries()){
  const game=new Chess(p.fen);
  assert.equal(game.turn(),'b','black to move on level '+i);
  assert.equal(game.get(p.square),undefined,'empty insertion square on level '+i);
  assert.equal(game.put({type:p.piece.toLowerCase(),color:'w'},p.square),true,'insert piece on level '+i);
  assert.equal(game.isCheck(),false,'no immediate king check on level '+i);
  assert.equal(game.isCheckmate(),false,'cannot be mate immediately on level '+i);
  assert.ok(game.move({from:p.response[0],to:p.response[1]}),'legal Black reply on level '+i);
  assert.equal(game.turn(),'w');
  const last=game.move({from:p.mate[0],to:p.mate[1]});
  assert.ok(last,'legal final move on level '+i);
  assert.equal(game.isCheckmate(),true,'real mate after reply on level '+i);
 }
});
