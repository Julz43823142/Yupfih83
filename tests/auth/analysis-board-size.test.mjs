import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
const css=readFileSync(new URL('analysis-board-size-201.css',root),'utf8');
const html=readFileSync(new URL('analysis.html',root),'utf8');

test('Analysis loads the board-size fix after shared material styles',()=>{
 const material=html.lastIndexOf('/chess-material.css?v=200');
 const size=html.lastIndexOf('/analysis-board-size-201.css?v=201');
 assert.ok(material>=0&&size>material);
 assert.ok(size<html.lastIndexOf('</head>'));
});
test('Analysis uses exactly the Guess the Elo board width at desktop sizes',()=>{
 assert.match(css,/grid-template-columns:30px minmax\(0,700px\)!important/);
 assert.match(css,/max-width:700px!important/);
 assert.match(css,/max-width:738px!important/);
 assert.match(css,/@media\(min-width:1370px\)/);
 assert.match(css,/grid-template-columns:minmax\(190px,1fr\) minmax\(0,738px\) minmax\(280px,1\.2fr\)!important/);
});
test('Analysis board and evaluation bar keep their positions and the material/player strips',()=>{
 assert.match(css,/>#board\{[\s\S]*?grid-column:2!important;grid-row:2!important/);
 assert.match(css,/>\.board-eval-wrap\{[\s\S]*?grid-column:1!important;grid-row:2!important/);
 assert.match(css,/\.analysis-player-black\{[\s\S]*?grid-row:1!important/);
 assert.match(css,/\.analysis-player-white\{[\s\S]*?grid-row:3!important/);
 assert.match(css,/\.board-with-eval\.analysis-flipped>\.analysis-player-white/);
});
test('Narrow and intermediate viewports keep full-width board rather than a 640px cap',()=>{
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.doesNotMatch(css,/min\(44vw,\s*640px\)|max-width:660px/);
});
