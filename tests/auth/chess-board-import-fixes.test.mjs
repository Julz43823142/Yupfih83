import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

test('Analysis image import panel survives moving import controls to Game Review',()=>{
 const script=read('analysis-stockfish-fixed.js');
 const tab=read('analysis-image-tab.js');
 const page=read('analysis.html');
 assert.match(script,/const imagePanel=\$\('position-photo-panel'\)/);
 assert.match(script,/const textPanel=\$\('text-import-panel'\)/);
 assert.match(script,/importSlot\.append\(importCard\.querySelector\('\.tab-row'\),imagePanel,textPanel\)/);
 assert.doesNotMatch(script,/importSlot\.append\(importCard\.querySelector\('\.tab-row'\),\$\('import-value'\)/);
 assert.match(tab,/imageTab\.addEventListener\('click'/);
 assert.match(page,/id="image-import-tab"/);
 assert.match(page,/id="position-photo"/);
 assert.match(page,/analysis-stockfish-fixed\.js\?v=202-image-fixed/);
});

test('Guess the Elo material labels sit inside reserved wrapper space',()=>{
 const css=read('chess-material.css');
 assert.match(css,/\.arcade-main \.arcade-board-wrap\{[\s\S]*?padding-top:28px!important;padding-bottom:28px!important/);
 assert.match(css,/\.arcade-board-wrap>\.elo-material-top\{top:2px!important\}/);
 assert.match(css,/\.arcade-board-wrap>\.elo-material-bottom\{top:auto!important;bottom:2px!important\}/);
 assert.match(css,/overflow:hidden!important/);
});
test('Material displays captured-piece icons and only +difference, not all points',()=>{
 const module=read('chess-material.mjs');
 assert.match(module,/score\.textContent='\+'\+lead/);
 assert.doesNotMatch(module,/pts on board|remaining\.textContent=points/);
 assert.match(module,/elo-material-captures/);
 const css=read('chess-material.css');
 assert.match(css,/\.elo-material-remaining\{display:none!important\}/);
});

test('Puzzle chessboard has the same 700px playing surface as Guess the Elo',()=>{
 const css=read('puzzle-board-size-202.css');
 const page=read('puzzles.html');
 assert.match(css,/max-width:700px!important/);
 assert.match(css,/max-width:724px!important/);
 assert.match(css,/minmax\(0,724px\)/);
 assert.match(page,/puzzle-board-size-202\.css\?v=217-puzzle-menu/);
 assert.doesNotMatch(page,/Find the best move<\/strong>/);
 assert.match(page,/id="puzzle-side"/);
});

test('Analysis chessboard starts just below compact page chrome',()=>{
 const css=read('analysis-compact-top-202.css');
 const page=read('analysis.html');
 assert.match(css,/margin-top:4px!important;padding-top:0!important/);
 assert.match(css,/max-width:700px!important/);
 assert.match(page,/analysis-compact-top-202\.css\?v=202/);
});
