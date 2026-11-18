import {spawnSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root=new URL('../../',import.meta.url);
const worker=readFileSync(new URL('client-v87-worker.js',root),'utf8');
const script=readFileSync(new URL('script.js',root),'utf8');

async function runSimulatedReview({firstCount,secondCount,firstReported,secondReported}){
 const prefix='https://api.chess.com/pub/player/hikaru';
 const months=[prefix+'/games/2026/11',prefix+'/games/2026/10'];
 const row={rules:'chess',time_class:'blitz',rated:true,end_time:1790000000};
 const rows=[Array(firstCount).fill(row),Array(secondCount).fill(row)];
 const messages=[],visited=[],progressMessages=[];
 let latestInput=null,clock=0;
 const python={
  FS:{
   writeFile(_path,payload){latestInput=JSON.parse(payload);},
   readFile(){
    const count=Object.keys(latestInput.archives).length===1?firstReported:secondReported;
    return JSON.stringify({version:'fairplay-v87-review-reliability',username:'hikaru',games:count});
   }
  },
  globals:{set(){}},
  runPython(){}
 };
 const context={
  loading:null,
  preparePython:async()=>python,
  chessJSON:async url=>{
   if(url===prefix)return {username:'hikaru'};
   if(url===prefix+'/games/archives')return {archives:months};
   const index=months.indexOf(url);
   assert.ok(index>=0,'Unexpected Chess.com archive '+url);
   visited.push(url);
   return {games:rows[index]};
  },
  progress:message=>progressMessages.push(message),
  self:{postMessage:message=>messages.push(message)},
  Date:{now:()=>{clock+=600;return clock}},
  setTimeout,Promise,Math,JSON,Number,String,RegExp,Set,Error,encodeURIComponent
 };
 const a=worker.indexOf('async function run(username){');
 const b=worker.indexOf('self.v87Progress=',a);
 assert.ok(a>0&&b>a,'Worker run() must exist');
 await runInNewContext(worker.slice(a,b)+'\nrun("hikaru")',context);
 return {visited,messages,progressMessages};
}

test('the v87 worker does not publish a 164-game review while older Chess.com archives remain',async()=>{
 const {visited,messages,progressMessages}=await runSimulatedReview({
  firstCount:5300,secondCount:5300,firstReported:164,secondReported:5000
 });
 assert.equal(visited.length,2,'Must fetch the older month after an underfilled review');
 assert.deepEqual(messages.map(m=>m.type),['profile','complete']);
 assert.equal(messages[1].result.games,5000,'Never publish the 164-game intermediate result');
 assert.equal(messages[1].result.archive_months_checked,2);
 assert.equal(messages[1].result.source_platform,'chess.com');
 assert.ok(progressMessages.some(m=>m.includes('Checking Chess.com archives')));
 assert.ok(!progressMessages.some(m=>m.includes('164 / 5,000')),'The initial parallel prefetch should avoid a redundant 164-game calculation');
});

test('a review reports the honest available game count when all archives are exhausted',async()=>{
 const {visited,messages}=await runSimulatedReview({
  firstCount:5300,secondCount:0,firstReported:164,secondReported:164
 });
 assert.equal(visited.length,2);
 assert.equal(messages[1].result.games,164);
 assert.equal(messages[1].result.archive_months_checked,2);
 assert.equal(messages[1].result.archive_months_available,2);
});

test('the main script always loads the updated review worker',()=>{
 assert.ok(script.includes('/client-v87-worker.js?v=20261118-review-speed-209'));
 assert.ok(script.includes('report.archive_months_checked'));
 assert.ok(script.includes('of up to 5,000 eligible games reviewed'));
});

test('review period uses the same selected-window results as Discord',()=>{
 assert.match(script,/const selected = data\.method3\?\.selected;/);
 assert.match(script,/EXPECTED POINTS.*formatPoints\(r\.expected_points\)/);
 assert.match(script,/SCORED POINTS.*formatPoints\(r\.actual_points\)/);
 assert.match(script,/WINRATE.*r\.win_fraction/);
 assert.match(script,/selected\.first_ended, selected\.last_ended/);
 assert.doesNotMatch(script,/sectionTitle\(panel, "Review findings"/);
 assert.match(worker,/Promise\.all\(Array\.from\(\{length:batchSize\},\(\)=>nextArchive\(\)\)\)/);
});

test('the minigames leaderboard link has no blue box or button padding',()=>{
 const html=readFileSync(new URL('minigames.html',root),'utf8');
 assert.match(html,/View all leaderboards<\/a>/);
 const style=html.match(/\.hub-intro a\{([^}]+)\}/)?.[1];
 assert.ok(style);
 assert.match(style,/font-weight:850/);
 assert.match(style,/text-decoration:underline/);
 assert.doesNotMatch(style,/(?:background|border:|border-radius|padding:)/);
});

test('the example page never waits for a live profile or game analysis',()=>{
 const entry=script.indexOf('async function openSavedExample()');
 const submit=script.indexOf('form.addEventListener("submit"',entry);
 const example=script.slice(entry,submit);
 assert.match(example,/await fetch\("/);
 assert.match(example,/renderReview\(saved\.report\)/);
 assert.doesNotMatch(example,/await runReview|await analyzeOnVisitorDevice|await getJSON/);
 const boot=script.slice(script.lastIndexOf('if(activeExample){'));
 assert.match(boot,/openSavedExample\(\)/);
 assert.doesNotMatch(boot,/requestSubmit\(\)/);
});

test('v87 parser keeps full move validation but limits expensive metrics to subject turns',()=>{
 const source=readFileSync(new URL('client-v87/fairplay_data.py',root),'utf8');
 const loop=source.slice(source.indexOf('    for node in game.mainline():'),source.indexOf('    # The latest-50 comprehensive scope',source.indexOf('    for node in game.mainline():')));
 assert.ok(loop.includes('if ply > config.max_plies or (not method3_only and node.move not in board.legal_moves):'));
 assert.ok(loop.includes('previous[side] = after'));
 assert.ok(loop.includes('board.push(node.move)'));
 const subject=loop.indexOf('        elif side == color:');
 assert.ok(subject>=0,'The full decision path remains available for other callers');
 for(const operation of ['legal = board.legal_moves.count()', 'in_check = board.is_check()', 'material = sum(', 'opening = book_status(', 'forced = legal == 1']){
   assert.ok(loop.indexOf(operation)>subject,'Subject-only operation is not guarded: '+operation);
 }
 assert.ok(loop.indexOf('capture = board.is_capture(node.move)')<subject,'Opponent captures remain observed');
});

test('ordinary website review starts the worker without waiting for a second profile fetch',()=>{
 const entry=script.indexOf('form.addEventListener("submit"');
 const normal=script.slice(entry,script.indexOf('  try {\n    const encoded',entry)>0?script.indexOf('  try {\n    const encoded',entry):undefined);
 assert.ok(normal.includes('await runReview(username,requestId)'));
 assert.doesNotMatch(normal,/profile=await Promise\.race|await getJSON\("https:\/\/api\.chess\.com\/pub\/player\//);
 assert.ok(script.includes('report.total_scan_seconds=(performance.now()-startedAt)/1000'));
 assert.ok(script.includes('if(settled||scanSerial!==activeReviewSerial)return'));
});

test('sample coverage uses v87 diagnostic counts instead of sampled chart points',()=>{
 assert.match(script,/sectionTitle\(panel, "Sample \/ Coverage"/);
 assert.match(script,/quality\.rated_games \?\? data\.method3\?\.rated_games/);
 assert.match(script,/quality\.unrated_games \?\? data\.method3\?\.unrated_games/);
 assert.match(script,/quality\.published_accuracy_games/);
 assert.match(script,/ratedGames \+ unratedGames === reviewed/);
 assert.match(script,/publishedAccuracy <= reviewed/);
 assert.match(script,/metric\(coverage, "LIVE GAMES"/);
 assert.match(script,/metric\(coverage, "GAMES REVIEWED"/);
 assert.match(script,/metric\(coverage, "PUBLISHED ACCURACY"/);
 const section=script.slice(script.indexOf('function renderReview(data)'),script.indexOf('function renderPlayer(',script.indexOf('function renderReview(data)')));
 assert.doesNotMatch(section,/Review findings|Key observations|No period passed to configure/i);
 assert.match(section,/sectionTitle\(panel, "Selected period"/);
});

test('indexed v87 safeguards exactly match the original results over 5,000 games',()=>{
 const python=[
  'import sys',
  'from types import SimpleNamespace',
  "sys.path.insert(0, 'client-v87')",
  'from fairplay_method3_reliability import rating_support, opponent_support, index_history',
  'games=[]',
  'for i in range(5000):',
  "    kind=('rapid','blitz','bullet')[i%3]",
  '    games.append(SimpleNamespace(identity=str(i), ended=1700000000+i*11000,',
  "        time_class=kind, rated=(i%11!=0), rating=1250+(i%70)*9,",
  "        opponent_username=('friend'+str(i%17)) if i%13 else None))",
  'index=index_history(games)',
  'for left in (0,1,40,300,900,2500,4600,4900,4990):',
  '    for width in (1,5,20,80):',
  '        members=[g for g in games[left:left+width] if g.time_class==games[left].time_class]',
  '        if not members:continue',
  '        old=rating_support(games,members,account_joined=None)',
  '        new=rating_support(games,members,account_joined=None,history_index=index)',
  '        assert old==new, (left,width,old,new)',
  '        old=opponent_support(members,history=games)',
  '        new=opponent_support(members,history=games,history_index=index)',
  '        assert old==new, (left,width,old,new)',
  "print('Indexed reliability output matches baseline')"
 ].join('\n');
 const result=spawnSync('python3',['-c',python],{
  cwd:new URL('../../',import.meta.url),encoding:'utf8',timeout:30000
 });
 assert.equal(result.status,0,result.stderr||result.stdout||String(result.error||'Python check failed'));
});

test('browser lightweight PGN path preserves original v87 game and graph evidence',()=>{
 const python=[
  'import sys',
  "sys.path.insert(0,'client-v87')",
  'import chess, chess.pgn',
  'from fairplay_data import parse_game',
  'from fairplay_method3 import observations',
  'from fairplay_website_runner import chart_samples, rolling_winrate_samples, opening_summary',
  "moves='e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8 h2h3 c6b8 d2d4 b8d7 d4e5 d6e5'.split()",
  'samples=[]',
  'for color in (True,False):',
  '    for rated in (True,False):',
  '        game=chess.pgn.Game()',
  "        game.headers['White']='example' if color else 'opponent'",
  "        game.headers['Black']='opponent' if color else 'example'",
  "        game.headers['Result']='1-0'",
  '        board=chess.Board()',
  '        node=game',
  '        for ply,uci in enumerate(moves):',
  '            move=board.parse_uci(uci)',
  '            node=node.add_variation(move)',
  '            node.set_clock(180-ply*2)',
  '            board.push(move)',
  "        row={'rules':'chess','time_class':'blitz','rated':rated,'end_time':1700000000,",
  "             'time_control':'180','uuid':str(color)+str(rated),",
  "             'white':{'username':'example','result':'win','rating':1500},",
  "             'black':{'username':'opponent','result':'checkmated','rating':1450},",
  "             'pgn':str(game),'accuracies':{'white':82.5,'black':76.3}}",
  "        if not color: row['white']['username'],row['black']['username']='opponent','example'",
  "        if not color: row['white']['result'],row['black']['result']='win','checkmated'",
  "        target='example'",
  '        full=parse_game(row,target,allow_short=True,include_unrated=True)',
  '        quick=parse_game(row,target,allow_short=True,include_unrated=True,method3_only=True)',
  '        assert full is not None and quick is not None, (full,quick)',
  "        for field in ('identity','ended','time_class','rating','opponent_rating','result','score','accuracy','color','time_control','rated','moves','opponent_username'):",
  "            assert getattr(full,field)==getattr(quick,field),field",
  '        assert len(full.decisions)==len(quick.decisions)',
  "        for field in ('ply','fullmove','move','clock_before','clock_after','think','clock_valid','opponent_clock_before'):",
  '            assert [getattr(d,field) for d in full.decisions]==[getattr(d,field) for d in quick.decisions],field',
  '        samples.append((full,quick))',
  '        if color and rated:',
  "            invalid=dict(row,pgn=row['pgn'].replace('e4','e9',1))",
  "            assert parse_game(invalid,target,allow_short=True,include_unrated=True) is None",
  "            assert parse_game(invalid,target,allow_short=True,include_unrated=True,method3_only=True) is None",
  'full=[a for a,b in samples]',
  'quick=[b for a,b in samples]',
  'assert observations(full)==observations(quick)',
  'assert chart_samples(full)==chart_samples(quick)',
  'assert rolling_winrate_samples(full)==rolling_winrate_samples(quick)',
  'assert opening_summary(full)==opening_summary(quick)'
 ].join('\n');
 const result=spawnSync('python3',['-c',python],{
  cwd:new URL('../../',import.meta.url),encoding:'utf8',timeout:60000
 });
 assert.equal(result.status,0,result.stderr||result.stdout||String(result.error||'PGN fixture failed'));
});

test('browser Method 3 reuses PGN legality validation rather than replaying the board',()=>{
 const source=readFileSync(new URL('client-v87/fairplay_data.py',root),'utf8');
 assert.match(source,/game is None or game\.errors or game\.headers\.get\('Result'\)/);
 assert.match(source,/not method3_only and node\.move not in board\.legal_moves/);
 assert.match(source,/if not method3_only:\s*board\.push\(node\.move\)/);
 assert.match(source,/side = \(chess\.WHITE if ply % 2 else chess\.BLACK\) if method3_only else board\.turn/);
 assert.match(source,/ply, \(ply \+ 1\) \/\/ 2, '', node\.move\.uci\(\)/);
});

test('streaming PGN visitor preserves headers, mainline clocks and variation errors',()=>{
 const python=[
  'import sys,io',
  "sys.path.insert(0,'client-v87')",
  'import chess.pgn',
  'from fairplay_data import QuietGameBuilder,ClockOnlyGameBuilder',
  'fixtures=[',
  '  """[White "example"]\\n[Black "opponent"]\\n[Result "1-0"]\\n\\n1. e4 {[%clk 0:03:00]} e5 {note [%clk 0:02:59]} 2. Nf3 {[%clk 0:02:57]} Nc6 1-0""",',
  '  """[White "example"]\\n[Black "opponent"]\\n[Result "0-1"]\\n\\n1. d4 {text} {[%clk 0:02:57]} d5 (1... Nf6 {[%clk 0:02:59]} 2. c4 (2. Nf3) 2... g6) 2. c4 {[%clk 0:02:55]} e6 0-1""",',
  '  """[White "example"]\\n[Black "opponent"]\\n[Result "1/2-1/2"]\\n\\n{introduction} 1. c4 $1 {[%clk 0:05:00]} e5 2. Nc3 Nf6 {[%clk 0:04:57]} 1/2-1/2""",',
  '  """[White "example"]\\n[Black "opponent"]\\n[Result "1-0"]\\n\\n1. e4 e9 1-0"""',
  ']',
  'for text in fixtures:',
  '    full=chess.pgn.read_game(io.StringIO(text),Visitor=QuietGameBuilder)',
  '    fast=chess.pgn.read_game(io.StringIO(text),Visitor=ClockOnlyGameBuilder)',
  '    assert dict(full.headers)==dict(fast.headers)',
  '    assert len(full.errors)==len(fast.errors)',
  '    assert full.board().fen()==fast.board().fen()',
  '    assert [(n.move.uci(),n.clock()) for n in full.mainline()]==[(n.move.uci(),n.clock()) for n in fast.mainline()]',
  "print('PGN header, result, clock and legal-move parity verified')"
 ].join('\n');
 const result=spawnSync('python3',['-c',python],{
  cwd:new URL('../../',import.meta.url),encoding:'utf8',timeout:30000
 });
 assert.equal(result.status,0,result.stderr||result.stdout||String(result.error||'PGN visitor test failed'));
});

test('real scan reports independent archive, startup and Python phase timings',()=>{
 assert.match(worker,/report\.scan_timings=\{/);
 assert.match(worker,/archive_download_seconds:/);
 assert.match(worker,/pyodide_extra_wait_seconds:/);
 assert.match(worker,/python_analysis_seconds:/);
 assert.match(worker,/archive_backfill_seconds:/);
 assert.match(script,/target\.title="Chess\.com archives:/);
});
