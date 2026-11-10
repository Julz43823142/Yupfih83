import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './fixture.mjs';
import { ensureModerationTable, findScores, removeScore } from '../../lib/leaderboard-moderation.mjs';
import { onRequestGet as puzzleGet } from '../../functions/api/puzzle-leaderboard.js';
import { onRequestGet as mazeGet } from '../../functions/api/knight-maze.js';
import { onRequestGet as arcadeGet } from '../../functions/api/arcade.js';
import { IDs as arcadeModes } from '../../arcade-rules.mjs';

async function seed(db) {
  await db.prepare("CREATE TABLE puzzle_score_entries (id INTEGER PRIMARY KEY AUTOINCREMENT,hour INTEGER,mode TEXT,nickname TEXT,score INTEGER,created_at INTEGER,source_type TEXT,account_id TEXT,legacy_key TEXT)").run();
  await db.prepare("CREATE TABLE arcade_score_entries (id INTEGER PRIMARY KEY AUTOINCREMENT,mode TEXT,nickname TEXT,score INTEGER,created_at INTEGER,source_type TEXT,account_id TEXT)").run();
  await db.prepare("CREATE TABLE knight_maze_scores (nickname TEXT PRIMARY KEY COLLATE NOCASE,score INTEGER NOT NULL,created_at INTEGER NOT NULL,source_type TEXT NOT NULL DEFAULT 'nickname',account_id TEXT)").run();
  await db.prepare("CREATE TABLE knight_maze_score_entries (id INTEGER PRIMARY KEY AUTOINCREMENT,nickname TEXT,score INTEGER,created_at INTEGER,source_type TEXT,account_id TEXT,legacy_key TEXT UNIQUE)").run();
  await db.prepare("INSERT INTO puzzle_score_entries(hour,mode,nickname,score,created_at,source_type) VALUES(1,'sprint5','Guest',20,1,'nickname'),(1,'sprint5','Guest',30,2,'nickname'),(1,'sprint3','Verified',35,3,'account')").run();
  await db.prepare("INSERT INTO knight_maze_score_entries(nickname,score,created_at,source_type) VALUES('Guest',20,1,'nickname'),('Guest',30,2,'nickname'),('Verified',35,3,'account')").run();
  await db.prepare("INSERT INTO arcade_score_entries(mode,nickname,score,created_at,source_type) VALUES('guess-the-elo','Guest',20,1,'nickname'),('guess-the-elo','Guest',30,2,'nickname'),('pawn-dash','Verified',35,3,'account')").run();
  await ensureModerationTable(db);
}
test('score moderation hides exact anonymous entry but retains other nickname and account entries', async () => {
  const db = database(); await seed(db);
  for (const board of ['puzzle','maze']) {
    assert.equal((await findScores(db,board,'guest')).total,2);
    assert.equal(await removeScore(db,board,1),true);
    assert.equal(await removeScore(db,board,1),true);
    assert.equal((await findScores(db,board,'guest')).total,1);
    assert.equal((await findScores(db,board,'verified')).total,1);
    assert.equal(await removeScore(db,board,999),false);
  }
});
test('public puzzle rankings exclude removed scores in standard and unique views', async () => {
  const db=database(); await seed(db);
  await removeScore(db,'puzzle',2);
  const env={SUS_DB:db};
  for(const unique of ['', '&filter=unique']){
    const response=await puzzleGet({request:new Request('https://eloscanner.com/api/puzzle-leaderboard?mode=sprint5&limit=100'+unique),env});
    assert.equal(response.status,200);
    const {entries}=await response.json();
    assert.equal(entries.some(row=>row.nickname==='Guest'&&row.score===30),false);
    assert.equal(entries.some(row=>row.nickname==='Guest'&&row.score===20),true);
  }
});
test('public knight maze rankings exclude removed scores in standard and unique views', async () => {
  const db=database(); await seed(db);
  await removeScore(db,'maze',2);
  const env={SUS_DB:db};
  for(const unique of ['', '?filter=unique']){
    const response=await mazeGet({request:new Request('https://eloscanner.com/api/knight-maze'+unique),env});
    assert.equal(response.status,200);
    const {entries}=await response.json();
    assert.equal(entries.some(row=>row.nickname==='Guest'&&row.score===30),false);
    assert.equal(entries.some(row=>row.nickname==='Guest'&&row.score===20),true);
  }
});
test('invalid boards and unsafe IDs never delete a score',async()=>{
  const db=database();await seed(db);
  assert.equal(await removeScore(db,'unknown',1),false);
  for(const id of [0,-1,1.5,NaN,Infinity,'1'])assert.equal(await removeScore(db,'puzzle',id),false);
  assert.equal((await findScores(db,'puzzle','')).total,3);
});

test('all nine active arcade rankings support individual nickname and account removals', async () => {
  assert.equal(arcadeModes.size,9);
  const db=database(); await seed(db);
  assert.equal((await findScores(db,'arcade','Guest',0,'guess-the-elo')).total,2);
  assert.equal((await findScores(db,'arcade','Verified',0,'pawn-dash')).total,1);
  assert.equal(await removeScore(db,'arcade',2),true);
  assert.equal((await findScores(db,'arcade','Guest',0,'guess-the-elo')).total,1);
  for (const uniqueMode of arcadeModes) {
    const response=await arcadeGet({request:new Request('https://eloscanner.com/api/arcade?mode='+uniqueMode),env:{SUS_DB:db}});
    assert.equal(response.status,200,uniqueMode);
    const {entries}=await response.json();
    assert.ok(!entries.some(row=>row.nickname==='Guest'&&row.score===30),uniqueMode);
    if(uniqueMode==='guess-the-elo') assert.ok(entries.some(row=>row.nickname==='Guest'&&row.score===20));
  }
  assert.equal(await removeScore(db,'arcade',3),true);
  const response=await arcadeGet({request:new Request('https://eloscanner.com/api/arcade?mode=pawn-dash'),env:{SUS_DB:db}});
  assert.deepEqual((await response.json()).entries,[]);
});
test('nickname filters never interpret SQL wildcard characters as a broad delete',async()=>{
  const db=database();await seed(db);
  assert.equal((await findScores(db,'puzzle','%')).total,0);
  assert.equal((await findScores(db,'puzzle','_')).total,0);
});
