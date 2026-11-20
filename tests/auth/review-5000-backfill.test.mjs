import {spawnSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root=new URL('../../',import.meta.url);
const worker=readFileSync(new URL('client-v87-worker.js',root),'utf8');
const script=readFileSync(new URL('script.js',root),'utf8');

async function runSimulatedReview({firstCount,secondCount,firstReported,secondReported,runs=1,changeArchiveOnSecond=false}){
 const prefix='https://api.chess.com/pub/player/hikaru';
 const months=[prefix+'/games/2026/11',prefix+'/games/2026/10'];
 const row={rules:'chess',time_class:'blitz',rated:true,end_time:1790000000};
 const rows=[Array(firstCount).fill(row),Array(secondCount).fill(row)];
 const messages=[],visited=[],progressMessages=[];
 let latestInput=null,clock=0,pythonRuns=0;
 const python={
  FS:{
   writeFile(_path,payload){latestInput=JSON.parse(payload);},
   readFile(){
    const count=Object.keys(latestInput.archives).length===1?firstReported:secondReported;
    return JSON.stringify({version:'fairplay-v87-review-reliability',username:'hikaru',games:count});
   }
  },
  globals:{set(){}},
  runPython(){pythonRuns++;}
 };
 const context={
  loading:null,
  lastCompletedReview:null,
  scanIteration:1,
  preparePython:async()=>python,
  chessJSON:async url=>{
   if(url===prefix)return {username:'hikaru'};
   if(url===prefix+'/games/archives')return {archives:months};
   const index=months.indexOf(url);
   assert.ok(index>=0,'Unexpected Chess.com archive '+url);
   visited.push(url);
   return {games:rows[index],revision:changeArchiveOnSecond&&context.scanIteration>1?2:1};
  },
  progress:message=>progressMessages.push(message),
  self:{postMessage:message=>messages.push(message)},
  Date:{now:()=>{clock+=600;return clock}},
  setTimeout,Promise,Math,JSON,Number,String,RegExp,Set,Error,encodeURIComponent
 };
 const a=worker.indexOf('async function run(username){');
 const b=worker.indexOf('self.v87Progress=',a);
 assert.ok(a>0&&b>a,'Worker run() must exist');
 const calls=Array.from({length:runs},(_,i)=>'scanIteration='+String(i+1)+'; await run("hikaru");').join('\n');
 await runInNewContext('(async()=>{'+worker.slice(a,b)+'\n'+calls+'})()',context);
 return {visited,messages,progressMessages,pythonRuns};
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
 assert.ok(script.includes('/client-v87-worker.js?v=20261118-review-speed-215'));
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
  "        for field in ('identity','ended','time_class','rating','opponent_rating','result','score','accuracy','color','time_control','rated','opponent_username'):",
  "            assert getattr(full,field)==getattr(quick,field),field",
  '        assert quick.moves==full.moves[:2], (full.moves,quick.moves)',
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
 assert.match(script,/target\.removeAttribute\("title"\)/);
});

test('fast Elo Chernoff guard matches original 40-step numerical bounds and tiers',()=>{
 const python=[
  'import sys,random,time',
  "sys.path.insert(0,'client-v87')",
  'from math import exp,expm1,log,log1p',
  'from fairplay_periods import _upper_bound',
  'from fairplay_outcome_study import expected_points',
  'def old_bound(probabilities,actual):',
  '    n=len(probabilities);expected=sum(probabilities)',
  '    if not n or actual<=expected:return 1.0',
  '    if actual==n:return exp(sum(log(p) for p in probabilities))',
  '    lo,hi=0.0,64.0',
  '    for _ in range(40):',
  '        t=(lo+hi)/2;et=exp(t)',
  '        tilted=sum(p*et/(1+p*(et-1)) for p in probabilities)',
  '        if tilted<actual:lo=t',
  '        else:hi=t',
  '    t=(lo+hi)/2',
  '    return min(1.0,exp(sum(log1p(p*expm1(t)) for p in probabilities)-t*actual))',
  'random.seed(17)',
  'inputs=[]',
  'for n in (5,10,20,50,100,200,400):',
  '    for iteration in range(110):',
  '        probabilities=[expected_points(random.randint(150,3100),random.randint(150,3100)) for _ in range(n)]',
  '        expected=sum(probabilities)',
  '        actual=(n if iteration%11==0 else min(n-1e-6,expected+(n-expected)*random.random()))',
  '        inputs.append((probabilities,actual))',
  'old_start=time.perf_counter()',
  'baseline=[old_bound(p,a) for p,a in inputs]',
  'old_elapsed=time.perf_counter()-old_start',
  'new_start=time.perf_counter()',
  'updated=[_upper_bound(p,a) for p,a in inputs]',
  'new_elapsed=time.perf_counter()-new_start',
  'for first,second in zip(baseline,updated):',
  '    assert abs(first-second)<=1e-11,(first,second)',
  '    for cutoff in (.001,.01,.10):',
  '        if abs(first-cutoff)>1e-11: assert (first<=cutoff)==(second<=cutoff)',
  "print('Old Chernoff',round(old_elapsed,3),'s, new',round(new_elapsed,3),'s, speedup',round(old_elapsed/max(new_elapsed,1e-9),2))"
 ].join('\n');
 const result=spawnSync('python3',['-c',python],{
  cwd:new URL('../../',import.meta.url),encoding:'utf8',timeout:30000
 });
 assert.equal(result.status,0,result.stderr||result.stdout||String(result.error||'Chernoff parity failed'));
});

test('only end-to-end scan time is displayed without phase details',()=>{
 assert.match(script,/target\.textContent="Analysis time: "/);
 assert.match(script,/target\.removeAttribute\("title"\)/);
 assert.doesNotMatch(script,/target\.textContent\+=" · Archives "/);
 assert.doesNotMatch(script,/target\.textContent\+=" · unchanged archives/);
 assert.match(worker,/const REVISION = "20261118-review-speed-215"/);
 assert.match(script,/client-v87-worker\.js\?v=20261118-review-speed-215/);

});

test('successful reviews keep the warmed worker but cancellation discards it',()=>{
 assert.match(script,/let reusableReviewWorker=null;/);
 assert.match(script,/worker=reusableReviewWorker\|\|\(reusableReviewWorker=new Worker/);
 assert.match(script,/worker\.removeEventListener\("message",onWorkerMessage\)/);
 assert.match(script,/if\(callback===reject\)\s*\{\s*worker\.terminate\(\);/);
 assert.match(script,/reusableReviewWorker===worker\)reusableReviewWorker=null/);
 assert.match(worker,/const REVISION = "20261118-review-speed-215"/);
 assert.match(script,/client-v87-worker\.js\?v=20261118-review-speed-215/);
});

test('identical fresh 5000-game archives reuse the previous complete v87 result',async()=>{
 const {messages,visited,pythonRuns}=await runSimulatedReview({
  firstCount:5300,secondCount:5300,firstReported:5000,secondReported:5000,runs:2
 });
 assert.equal(pythonRuns,1,'Identical inputs must not recompute the complete Python review');
 assert.equal(visited.length,4,'Both scans must independently refetch every archive');
 assert.deepEqual(messages.map(m=>m.type),['profile','complete','profile','complete']);
 assert.equal(messages[3].result.games,5000);
 assert.equal(messages[3].result.scan_timings.unchanged_archive_cache,true);
 assert.equal(messages[3].result.scan_timings.python_analysis_seconds,0);
});

test('changed Chess.com archives invalidate the reused v87 report',async()=>{
 const {messages,pythonRuns}=await runSimulatedReview({
  firstCount:5300,secondCount:5300,firstReported:5000,secondReported:5000,
  runs:2,changeArchiveOnSecond:true
 });
 assert.equal(pythonRuns,2,'Any change in downloaded archive contents must trigger full analysis');
 assert.equal(messages[3].result.scan_timings.unchanged_archive_cache,undefined);
 assert.equal(messages[3].result.games,5000);
});

test('selected period explicitly shows scored points above or below expected',()=>{
 assert.match(script,/metric\(periodMetrics, "EXPECTED POINTS", formatPoints\(r\.expected_points\)\)/);
 assert.match(script,/metric\(periodMetrics, "SCORED POINTS", formatPoints\(r\.actual_points\)\)/);
 assert.match(script,/difference=pointsKnown\?r\.actual_points-r\.expected_points:null/);
 assert.match(script,/metric\(periodMetrics, "VS EXPECTED", pointsDelta\)/);
 assert.match(script,/points above expected/);
 assert.match(script,/points below expected/);
 assert.match(script,/Exactly as expected/);
});

test('report cache avoids redundant JSON roundtrips on 5000-game reruns',()=>{
 assert.match(worker,/const report=\{\.\.\.lastCompletedReview\.report\}/);
 assert.match(worker,/lastCompletedReview=\{username:name,inputJSON,report\}/);
 assert.doesNotMatch(worker,/JSON\.parse\(JSON\.stringify\(lastCompletedReview\.report\)\)/);
 assert.doesNotMatch(worker,/report:JSON\.parse\(JSON\.stringify\(report\)\)/);
});

test('progress uses actual worker milestones instead of a slow elapsed-time curve',()=>{
 const begin=script.indexOf('let reviewProgressStage="queued";');
 const end=script.indexOf('function placeExampleCardsNearOverview()',begin);
 const bar=script.slice(begin,end);
 assert.ok(begin>=0&&end>begin);
 assert.match(bar,/reviewProgressPercent=Math\.max\(reviewProgressPercent,Math\.min\(99,/);
 assert.match(bar,/reviewProgressReport;/);
 assert.doesNotMatch(bar,/Math\.exp\(-seconds|setInterval\(|analysisStatusLine\(/);
 assert.match(script,/showReviewProgress\(data\.progress\|\|"Analyzing locally on your device…",reviewProgressStage,false,data\.percent\)/);
 assert.match(worker,/self\.v87Progress=pythonProgress/);
 assert.match(worker,/progress\("Final report ready…","analyzing",99\)/);
});

test('worker milestones reflect collected games, analyzed blocks and boundaries',()=>{
 const output=[];
 const a=worker.indexOf('function progress(');
 const b=worker.indexOf('async function preparePython()',a);
 assert.ok(a>=0&&b>a);
 const commands=[
  'pythonProgress("Collecting rated and unrated games… 2500/5000 games · 10/80 archives");',
  'pythonProgress("Method 3: block 11/25");',
  'pythonProgress("Method 3: boundary 8/24");',
  'pythonProgress("Method 3: building graphs and report…");'
 ].join(String.fromCharCode(10));
 runInNewContext(worker.slice(a,b)+String.fromCharCode(10)+commands,{
  self:{postMessage:m=>output.push(m)},String,Math,Number
 });
 assert.equal(output.length,4);
 assert.equal(output[0].percent,52);
 assert.equal(output[1].percent,73);
 assert.ok(output[2].percent>=87&&output[2].percent<=90);
 assert.equal(output[3].percent,96);
 assert.ok(output.every(m=>m.type==='progress'&&m.phase==='analyzing'));
});

test('only the end-to-end scan time is visible, no phase timings',()=>{
 const a=script.indexOf('function showMeasuredDuration(');
 const b=script.indexOf('function renderAdditionalInsights(',a);
 const duration=script.slice(a,b);
 assert.match(duration,/target\.textContent="Analysis time: "/);
 assert.doesNotMatch(duration,/Archives |Runtime wait |Python analysis/);
});

test('homepage points at current scan script, not legacy v198-speed JavaScript',()=>{
 const html=readFileSync(new URL('index.html',root),'utf8');
 assert.match(html,/script\.js\?v=20261118-216-live/);
 assert.doesNotMatch(html,/script\.js\?v=198-speed/);
 const headers=readFileSync(new URL('_headers',root),'utf8');
 assert.match(headers,/\/script\.js\s+Cache-Control: no-store/);
 assert.match(headers,/\/client-v87-worker\.js\s+Cache-Control: no-store/);
});

test('production build fingerprints the actual homepage JS contents',()=>{
 const build=readFileSync(new URL('scripts/build-site.mjs',root),'utf8');
 assert.match(build,/homepageScript=join\(output,'script\.js'\)/);
 assert.match(build,/createHash\('sha256'\)\.update\(readFileSync\(homepageScript\)\)/);
 assert.match(build,/writeFileSync\(homepage,updated\)/);
});

test('latest UI shows ONLY total duration and receives true milestone percentages',()=>{
 const begin=script.indexOf('function showMeasuredDuration(');
 const end=script.indexOf('function renderAdditionalInsights(',begin);
 const duration=script.slice(begin,end);
 assert.ok(begin>0&&end>begin);
 assert.match(duration,/target\.textContent="Analysis time: "/);
 assert.doesNotMatch(duration,/Archives|Runtime wait|Python analysis/);
 assert.match(script,/showReviewProgress\(data\.progress\|\|"Analyzing locally on your device…",reviewProgressStage,false,data\.percent\)/);
 assert.match(worker,/self\.v87Progress=pythonProgress/);
});

test('puzzle mode menu is visible before the board with four working tabs',()=>{
 const html=readFileSync(new URL('puzzles.html',root),'utf8');
 const js=readFileSync(new URL('puzzles.js',root),'utf8');
 const css=readFileSync(new URL('puzzle-board-size-202.css',root),'utf8');
 assert.ok(html.includes('class="puzzle-mode-menu"'));
 assert.ok(html.indexOf('class="puzzle-mode-menu"')<html.indexOf('class="puzzle-board-card"'));
 assert.ok(html.includes('Choose a puzzle'));
 for(const mode of ['random','custom','sprint','survival']){
  assert.ok(html.includes('data-puzzle-mode="'+mode+'"'),mode+' mode is visible');
 }
 assert.ok(js.includes("tab.addEventListener('click',()=>switchMode(tab.dataset.puzzleMode))"));
 assert.ok(css.includes('.puzzles-layout>.puzzle-mode-menu'));
 assert.ok(css.includes('grid-row:1 / span 3!important'));
 assert.ok(css.includes('@media(max-width:759px)'));
 assert.ok(html.includes('/puzzle-board-size-202.css?v=217-puzzle-menu'));
});

test('puzzle Auto Next is off by default, persists explicit opt-in, and loads fresh JS',()=>{
 const html=readFileSync(new URL('puzzles.html',root),'utf8');
 const js=readFileSync(new URL('puzzles.js',root),'utf8');
 assert.match(html,/id="puzzle-auto-next" role="switch" aria-label="Automatically load the next puzzle"/);
 assert.doesNotMatch(html,/id="puzzle-auto-next"[^>]* checked/);
 assert.match(html,/puzzles\.js\?v=219-auto-next-off/);
 assert.match(js,/let autoNextEnabled=false;/);
 assert.match(js,/localStorage\.getItem\('eloscanner-puzzle-auto-next'\)==='on'/);
 assert.match(js,/localStorage\.setItem\('eloscanner-puzzle-auto-next',autoNextEnabled\?'on':'off'\)/);
});
