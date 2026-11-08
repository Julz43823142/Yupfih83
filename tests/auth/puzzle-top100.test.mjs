import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../../puzzle-top100.html',import.meta.url),'utf8');

test('puzzle sprint, survival and knight maze rankings always request Top 100',()=>{
 assert.match(html,/\['sprint','survival','knight-maze','endgame-survivor'/);
 assert.match(html,/\/api\/knight-maze\?limit=100/);
 assert.match(html,/\/api\/puzzle-leaderboard\?mode=/);
 assert.match(html,/\/api\/arcade\?mode=/);
 for(const mode of ['endgame-survivor','guess-the-elo','chess-memory','safe-square-rush','falling-board','queen-chase','chess-block-party','pawn-dash'])assert.match(html,new RegExp('data-mode="'+mode+'"'));
 assert.match(html,/<th>Report<\/th>/);
 assert.match(html,/&limit=100/);
 assert.doesNotMatch(html,/\bfilter\b/);
 assert.doesNotMatch(html,/\bdata-limit\b/);
 assert.doesNotMatch(html,/Top 10|Top 50/);
});

test('ranking response is validated before accessing entries',()=>{
 assert.match(html,/if\(!Array\.isArray\(data\.entries\)\)throw Error/);
 assert.match(html,/\(data\.entries\|\|\[\]\)\.forEach/);
});

test('Top 100 organizes puzzle and minigame leaderboards into separate category tabs',()=>{
 const html=readFileSync(new URL('../../puzzle-top100.html',import.meta.url),'utf8');
 assert.match(html,/data-category="puzzles"/);
 assert.match(html,/data-category="minigames"/);
 assert.match(html,/id="puzzle-leaderboard-tabs"/);
 assert.match(html,/id="minigame-leaderboard-tabs"[^>]*hidden/);
 assert.match(html,/category==='minigames'\?'knight-maze':'sprint'/);
 assert.match(html,/\.puzzles-tabs\[hidden\]\{display:none!important\}/);
});
