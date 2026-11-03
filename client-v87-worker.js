/* EloScanner Fair Play v87 — on-device Python/WASM Web Worker.
 * Uses original v87 calculation modules, never starts GitHub Actions.
 */
"use strict";
const REVISION = "20261103-local-v87-15min-5";
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/";
const PYTHON_FILES = [
  "fairplay_method3.py", "fairplay_method3_coverage.py",
  "fairplay_method3_windows.py", "fairplay_method3_reliability.py",
  "fairplay_method3_accuracy_frequency.py", "fairplay_method3_review_triage.py",
  "fairplay_method3_history.py", "fairplay_method3_context.py",
  "fairplay_method3_opening_shift.py", "fairplay_website_runner.py",
  "fairplay_data.py", "fairplay_config.py", "fairplay_outcome_study.py",
  "fairplay_timing.py", "fairplay_opening.py", "fairplay_analysis.py",
  "fairplay_periods.py", "fairplay_accuracy_reference.py",
  "fairplay_clusters.py", "fairplay_local_timing.py",
  "fairplay_calibration.py", "fairplay_convergence.py",
  "fairplay_positions.py", "fairplay_results.py",
  "browser_adapter.py", "assets/fairplay/opening-lines.json",
  "chess/__init__.py", "chess/pgn.py", "chess/engine.py", "chess/svg.py", "chess/variant.py"
];
let loading = null;
let busy = false;
function progress(message, phase = "preparing") {
  self.postMessage({type:"progress",progress:String(message),phase});
}
async function preparePython() {
  progress("Loading Fair Play v87 on your device…","preparing");
  importScripts(PYODIDE_URL+"pyodide.js");
  const py = await self.loadPyodide({indexURL:PYODIDE_URL});
  progress("Loading the original Fair Play calculations…","dependencies");
  const files = await Promise.all(PYTHON_FILES.map(async path => {
    const response = await fetch("/client-v87/"+path+"?v="+REVISION,{cache:"force-cache"});
    if(!response.ok)throw Error("Missing local analysis module: "+path);
    return [path,await response.text()];
  }));
  const fs = py.FS;
  for(const [path,source] of files){
    const parts=("/home/pyodide/"+path).split("/");
    let folder="";
    for(let i=1;i<parts.length-1;i++){
      folder+="/"+parts[i];
      if(!fs.analyzePath(folder).exists)fs.mkdir(folder);
    }
    fs.writeFile("/home/pyodide/"+path,source,{encoding:"utf8"});
  }
  fs.chdir("/home/pyodide");
  // requests is imported by the original module, but the browser adapter
  // exclusively supplies prefetched PubAPI JSON; no Python HTTP is performed.
  py.runPython([
    "import sys, types",
    "sys.path.insert(0, '/home/pyodide')",
    "requests = types.ModuleType('requests')",
    "class RequestException(Exception): pass",
    "class Session:",
    "    def close(self): pass",
    "requests.RequestException = RequestException",
    "requests.Session = Session",
    "sys.modules['requests'] = requests",
    "import browser_adapter"
  ].join("\n"));
  return py;
}
async function chessJSON(url,limit=16000000){
  for(let attempt=0;attempt<3;attempt++){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),18000);
    try{
      const response=await fetch(url,{signal:controller.signal,headers:{Accept:"application/json"}});
      if(response.status===404)return null;
      if(response.status===429||response.status>=500){
        if(attempt===2)throw Error("Chess.com is busy. Try again later.");
        const after=Number(response.headers.get("Retry-After"));
        const delay=Number.isFinite(after)&&after>0?Math.min(after*1000,30000):(attempt+1)*2000;
        await new Promise(done=>setTimeout(done,delay));
        continue;
      }
      if(!response.ok)throw Error("Chess.com returned HTTP "+response.status);
      const raw=await response.text();
      if(raw.length>limit)throw Error("Public game archive exceeds the size limit.");
      const body=JSON.parse(raw);
      if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid Chess.com response.");
      return body;
    }catch(error){
      if(attempt===2||/size limit|HTTP 4|Invalid Chess/.test(String(error)))throw error;
      await new Promise(done=>setTimeout(done,(attempt+1)*1000));
    }finally{
      clearTimeout(timeout);
    }
  }
  throw Error("Unable to load Chess.com public games.");
}
async function run(username){
  if(!/^[A-Za-z0-9_-]{3,25}$/.test(username))throw Error("Invalid Chess.com username.");
  const name=username.toLowerCase();
  // Download Python runtime in parallel with the Chess.com archives.
  const runtime=loading||(loading=preparePython().catch(error=>{loading=null;throw error}));
  progress("Reading the public Chess.com game history…","collecting");
  const prefix="https://api.chess.com/pub/player/"+encodeURIComponent(name);
  const [profile,manifest]=await Promise.all([
    chessJSON(prefix,1000000),chessJSON(prefix+"/games/archives",1000000)
  ]);
  if(!profile||String(profile.username||"").toLowerCase()!==name)
    throw Error("Chess.com could not verify this player.");
  if(!manifest||!Array.isArray(manifest.archives))
    throw Error("No public Chess.com game archives are available.");
  const pattern=new RegExp("^https://api\\.chess\\.com/pub/player/"+name+"/games/[0-9]{4}/(0[1-9]|1[0-2])$","i");
  const months=[...new Set(manifest.archives.filter(url=>typeof url==="string"&&pattern.test(url)))]
    .sort().reverse().slice(0,240);
  const input={profile,manifest,archives:{}};
  let index=0,candidates=0,lastArchiveRequest=0;
  async function nextArchive(){
    if(index>=months.length)return false;
    // Match the upstream collector's half-second pacing to reduce 429s.
    const pause=Math.max(0,500-(Date.now()-lastArchiveRequest));
    if(pause)await new Promise(done=>setTimeout(done,pause));
    lastArchiveRequest=Date.now();
    const url=months[index++];
    const suffix=url.slice(prefix.length);
    progress("Downloading game archive "+index+"/"+months.length+"…","collecting");
    try{
      const body=await chessJSON(url);
      input.archives[suffix]=body;
      if(body&&Array.isArray(body.games)){
        for(const row of body.games){
          if(row&&row.rules!=="variants"&&(row.rules===undefined||row.rules==="chess")
            &&["rapid","blitz","bullet"].includes(row.time_class)
            &&typeof row.rated==="boolean"&&Number(row.end_time)>0)candidates++;
        }
      }
    }catch(error){
      if(/Chess.com is busy|HTTP 429|size limit/.test(String(error)))throw error;
      input.archives[suffix]=null; // Explicit incomplete coverage, never fake data.
    }
    return true;
  }
  while(index<months.length&&candidates<5300)await nextArchive();
  const py=await runtime;
  for(let attempt=0;attempt<=months.length;attempt++){
    progress("Calculating the original Fair Play v87 report locally…","analyzing");
    py.FS.writeFile("/home/pyodide/v87-input.json",JSON.stringify(input),{encoding:"utf8"});
    py.globals.set("v87_target",name);
    try{
      py.runPython("browser_adapter.run(v87_target)");
      const report=JSON.parse(py.FS.readFile("/home/pyodide/v87-result.json",{encoding:"utf8"}));
      if(report.version!=="fairplay-v87-review-reliability"||report.username!==name)
        throw Error("Unexpected local Fair Play output.");
      self.postMessage({type:"complete",result:report});
      return;
    }catch(error){
      // If some PGNs are invalid, the original collector may require more
      // months. Fetch them and rerun; do not silently mark them unavailable.
      if(!String(error).includes("BROWSER_ARCHIVE_NOT_READY"))throw error;
      const before=candidates;
      if(!await nextArchive())throw Error("Not enough public archive data.");
      while(index<months.length&&candidates<before+400)await nextArchive();
    }
  }
  throw Error("Review could not complete its archive backfill.");
}
self.v87Progress=message=>progress(message,"analyzing");
self.onmessage=async event=>{
  if(!event.data||event.data.type!=="run"||busy)return;
  busy=true;
  try{await run(String(event.data.username||""))}
  catch(error){
    const message=String(error?.message||error||"Local analysis unavailable");
    self.postMessage({type:"error",error:message.length>280?message.slice(-280):message});
  }finally{busy=false}
};
