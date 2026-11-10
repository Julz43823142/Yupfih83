import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './fixture.mjs';
import {ensureModerationTable} from '../../lib/leaderboard-moderation.mjs';
import {onRequestGet} from '../../functions/api/profile-records/[username].js';

function seed(){
 const auth=database(),scores=database();
 auth.sqlite.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,username) VALUES(?,?,?,?,?,?,?)').run('u1','Sharkmeister','shark@example.test',1,1,1,'sharkmeister');
 auth.sqlite.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,username) VALUES(?,?,?,?,?,?,?)').run('u2','Thijs','thijs@example.test',1,1,1,'thijs');
 scores.sqlite.exec(`
  CREATE TABLE arcade_score_entries(id INTEGER PRIMARY KEY,mode TEXT,nickname TEXT,score INTEGER,created_at INTEGER,source_type TEXT,account_id TEXT);
  CREATE TABLE knight_maze_score_entries(id INTEGER PRIMARY KEY,mode TEXT,nickname TEXT,score INTEGER,created_at INTEGER,source_type TEXT,account_id TEXT);
  CREATE TABLE puzzle_score_entries(id INTEGER PRIMARY KEY,hour INTEGER,mode TEXT,nickname TEXT,score INTEGER,created_at INTEGER,source_type TEXT,account_id TEXT);
 `);
 return {env:{AUTH_DB:auth,SUS_DB:scores}, db:scores};
}
async function get(env,username){
 const response=await onRequestGet({params:{username},env});
 return {status:response.status,body:await response.json()};
}
test('personal bests use authenticated account IDs, never a matching anonymous nickname',async()=>{
 const {env,db}=seed();await ensureModerationTable(db);
 const put=db.sqlite.prepare('INSERT INTO arcade_score_entries VALUES(?,?,?,?,?,?,?)');
 put.run(1,'pawn-dash','Sharkmeister',500,10,'nickname',null); // same name is not ownership
 put.run(2,'pawn-dash','Thijs',350,15,'account','u2');
 put.run(3,'pawn-dash','sharkmeister',300,20,'account','u1');
 put.run(4,'pawn-dash','sharkmeister',250,22,'account','u1');
 const {status,body}=await get(env,'SHARKMEISTER');
 assert.equal(status,200);
 assert.deepEqual(body.records,[{mode:'pawn-dash',score:300,rank:3}]);
});
test('ranking ties, moderation and separate minigames are accurate',async()=>{
 const {env,db}=seed();await ensureModerationTable(db);
 const a=db.sqlite.prepare('INSERT INTO arcade_score_entries VALUES(?,?,?,?,?,?,?)');
 a.run(1,'chess-memory','Thijs',50,1,'account','u2');
 a.run(2,'chess-memory','Sharkmeister',50,2,'account','u1');
 a.run(3,'chess-memory','Sharkmeister',100,3,'account','u1'); // moderated: should disappear
 db.sqlite.prepare("INSERT INTO leaderboard_removed_scores(board,entry_id,removed_at) VALUES('arcade',3,10)").run();
 const m=db.sqlite.prepare('INSERT INTO knight_maze_score_entries VALUES(?,?,?,?,?,?,?)');
 m.run(1,'knight-maze','Thijs',20,1,'account','u2');
 m.run(2,'knight-maze','Sharkmeister',18,2,'account','u1');
 const p=db.sqlite.prepare('INSERT INTO puzzle_score_entries VALUES(?,?,?,?,?,?,?,?)');
 p.run(1,1,'sprint3','Sharkmeister',30,1,'account','u1');
 p.run(2,1,'sprint5','Thijs',40,1,'account','u2');
 p.run(3,1,'sprint5','Sharkmeister',35,2,'account','u1');
 p.run(4,1,'survival','Sharkmeister',5,3,'account','u1');
 p.run(5,1,'sprint','Sharkmeister',999,0,'account','u1'); // not a ranked sprint length
 const {status,body}=await get(env,'sharkmeister');
 assert.equal(status,200);
 assert.deepEqual(Object.fromEntries(body.records.map(r=>[r.mode,{score:r.score,rank:r.rank}])),{
  'chess-memory':{score:50,rank:2},
  'knight-maze':{score:18,rank:2},
  'sprint':{score:35,rank:2},
  'survival':{score:5,rank:1}
 });
});
test('unknown users are not exposed and unavailable databases fail closed',async()=>{
 const {env}=seed();
 assert.equal((await get(env,'Unknown')).status,404);
 assert.equal((await get({...env,SUS_DB:null},'sharkmeister')).status,503);
 assert.equal((await get(env,'bad!')).status,404);
});
