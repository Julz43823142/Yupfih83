import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Chess} from '../../vendor/chess/chess-1.4.0.mjs';
import {BOT_RATINGS,engineElo,usesLocalBot} from '../../play-bot-strength.mjs';
import {preferredOpeningMove} from '../../play-bot-openings.mjs';

function position(...san){const game=new Chess();for(const move of san)game.move(move);return game}
const move=(game,id)=>preferredOpeningMove(game,id,()=>0)?.san||null;

test('low-rating and submitted viewer bots never use the uncalibrated Stockfish 1320 Elo floor',()=>{
 for(const id of ['bot200','bot300','bot400','bot500','bot600','bot700','bot800','bot900','bot1000','bot1100','bot1200','bot1300','cashojf3r']){
  assert.ok(usesLocalBot(id),id);
  assert.ok(BOT_RATINGS[id]<1320,id);
 }
 for(const id of ['bot1400','rocket','chessmass','peanut','ominous','pls90a','mikhail','bot3000','lars'])assert.equal(usesLocalBot(id),false,id);
 assert.equal(engineElo('bot1400'),1400);
 assert.equal(engineElo('bot3000'),3000);
 assert.equal(engineElo('lars'),3190);
 const ui=readFileSync(new URL('../../play.js',import.meta.url),'utf8');
 assert.match(ui,/if\(usesLocalBot\(level\)\)/);
 assert.match(ui,/elo:engineElo\(level\)/);
 assert.doesNotMatch(ui,/ratings\[level\].*\*pressure/);
 const html=readFileSync(new URL('../../play.html',import.meta.url),'utf8');
 assert.match(html,/data-bot="bot200"/);
});

test('London System repertoire works for an assigned viewer bot, without forcing illegal moves',()=>{
 const g=position();assert.equal(move(g,'cashojf3r'),'d4');
 g.move('d4');g.move('d5');assert.equal(move(g,'cashojf3r'),'Bf4');
 g.move('Bf4');g.move('Nf6');assert.equal(move(g,'cashojf3r'),'e3');
 assert.equal(move(position('e4','c5'),'cashojf3r'),null);
});

test('viewer opening repertoires follow actual positions, including Black and move-order variations',()=>{
 assert.equal(move(position(),'rocket'),'d4');
 assert.equal(move(position('d4','d5'),'rocket'),'c4');
 assert.equal(move(position(),'chessmass'),'e4');
 assert.equal(move(position('d4'),'chessmass'),'Nf6');
 assert.equal(move(position('e4','e5','Nf3','Nc6'),'chessmass'),'d4');
 assert.equal(move(position(),'peanut'),'e4');
 assert.equal(move(position('e4'),'peanut'),'e5');
 assert.equal(move(position('e4','e5','Nf3','Nc6'),'peanut'),'Bc4');
 assert.equal(move(position('e4','c5'),'peanut'),null);
 assert.equal(move(position('e4','e5'),'rocket'),null);
 assert.equal(move(position(),'bot600'),null);
});
