import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './fixture.mjs';
import { ensureModerationTable, findScores, removeScore } from '../../lib/leaderboard-moderation.mjs';
import { onRequestGet as puzzleGet } from '../../functions/api/puzzle-leaderboard.js';
import { onRequestGet as mazeGet } from '../../functions/api/knight-maze.js';

async function seed(db) {
  await db.prepare("CREATE TABLE puzzle_score_entries (id INTEGER PRIMARY KEY AUTOINCREMENT,hour INTEGER,mode TEXT,nickname TEXT,score INTEGER,created_at INTEGER,source_type TEXT,account_id TEXT,legacy_key TEXT)").run();
  await db.prepare("CREATE TABLE knight_maze_score_entries (id INTEGER PRIMARY KEY AUTOINCREMENT,nickname TEXT,score INTEGER,created_at INTEGER,source_type TEXT,account_id TEXT,legacy_key TEXT)").run();
  await db.prepare("INSERT INTO puzzle_score_entries(hour,mode,nickname,score,created_at,source_type) VALUES(1,'sprint5','Guest',20,1,'nickname'),(1,'sprint5','Guest',30,2,'nickname'),(1,'sprint3','Verified',35,3,'account')").run();
  await db.prepare("INSERT INTO knight_maze_score_entries(nickname,score,created_at,source_type) VALUES('Guest',20,1,'nickname'),('Guest',30,2,'nickname'),('Verified',35,3,'account')").run();
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
