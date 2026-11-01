/* EloScanner — v87 statistical review.
 * Configure API_URL after deploying fairplay_web_api.py from the bot repo.
 */
const API_URL = "/api"; // Same-origin Cloudflare Pages Functions; token remains server-side.
const form = document.getElementById("searchForm");
const usernameInput = document.getElementById("username");
const button = document.getElementById("analyzeBtn");
const statusText = document.getElementById("status");
const results = document.getElementById("results");
const playerCard = document.getElementById("playerCard");
document.getElementById("year").textContent = new Date().getFullYear();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function add(parent, tag, className, text) {
  const node = el(tag, className, text);
  parent.appendChild(node);
  return node;
}
function number(value, digits = 2) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—";
}
function ratingBox(label, value) {
  const box = el("div", "rating-box");
  add(box, "span", "rating-label", label);
  add(box, "span", "rating-value", value ?? "N/A");
  return box;
}
async function getJSON(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    if (response.status === 404) throw new Error("Player or review not found.");
    if (response.status === 429) throw new Error("Rate limit reached. Try again later.");
    let message = "Service request failed (" + response.status + ").";
    try { const details = await response.json(); if (details.error) message = details.error; } catch {}
    throw new Error(message);
  }
  return response.json();
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function metric(parent, title, value) {
  const box = add(parent, "div", "v87-metric");
  add(box, "span", "v87-muted", title);
  add(box, "strong", "", value ?? "—");
}
function sectionTitle(parent, title, description) {
  const head = add(parent, "div", "v87-heading");
  add(head, "h3", "", title);
  if (description) add(head, "p", "v87-muted", description);
}
function chartCard(grid, title, subtitle) {
  const card = add(grid, "article", "v87-chart");
  add(card, "h4", "", title);
  add(card, "p", "v87-muted", subtitle);
  return add(card, "div", "v87-plot");
}
function empty(plot, message = "No comparable data in this review") {
  add(plot, "p", "v87-empty", message);
}
function bars(plot, rows, opts = {}) {
  const valid = rows.filter(x => Number.isFinite(x.value));
  if (!valid.length) return empty(plot);
  const max = Math.max(...valid.map(x => Math.abs(x.value)), 0.01);
  for (const row of valid.slice(0, 12)) {
    const line = add(plot, "div", "v87-bar-row");
    add(line, "span", "v87-bar-label", row.label);
    const track = add(line, "div", "v87-bar-track");
    const fill = add(track, "div", "v87-bar-fill");
    fill.style.width = Math.min(100, Math.abs(row.value) / max * 100) + "%";
    add(line, "span", "v87-bar-number", opts.percent ? number(row.value * 100, 1) + "%" : number(row.value));
  }
}
function objectRows(obj, keys, labels = {}) {
  if (!obj || typeof obj !== "object") return [];
  return keys.map(k => ({ label: labels[k] || k.replaceAll("_", " "), value: obj[k] }))
    .filter(row => typeof row.value === "number" && Number.isFinite(row.value));
}
function listRows(items, labelKey, valueKey) {
  return Array.isArray(items) ? items.map((x, i) => ({
    label: String(x?.[labelKey] ?? (i + 1)),
    value: x?.[valueKey]
  })) : [];
}

/* Fetch all publicly available monthly Chess.com archives only when All Time is requested.
   The Fair Play review remains limited to its own 5,000-game analysis window. */
const careerHistoryCache = new Map();
async function loadCareerRatings(username, onProgress) {
  const user = String(username || "").toLowerCase();
  if (!/^[a-z0-9_-]{3,25}$/.test(user)) throw new Error("Player username is unavailable.");
  if (careerHistoryCache.has(user)) return careerHistoryCache.get(user);
  const task = (async () => {
    const root = "https://api.chess.com/pub/player/" + encodeURIComponent(user);
    const manifest = await getJSON(root + "/games/archives");
    const archives = Array.isArray(manifest.archives) ? manifest.archives : [];
    if (!archives.length) throw new Error("No publicly available monthly game archives.");
    const all = {rapid:[],blitz:[],bullet:[]};
    const fetchMonth = async url => {
      if (typeof url !== "string" || !url.startsWith(root + "/games/")) throw new Error("Invalid archive address.");
      for (let attempt=0; attempt<3; attempt++) {
        try { return await getJSON(url); }
        catch (error) {
          if (attempt===2 || !/Rate limit|429|failed/i.test(String(error.message))) throw error;
          await wait(800*(attempt+1));
        }
      }
    };
    for (let i=0;i<archives.length;i+=2) {
      const months = await Promise.all(archives.slice(i,i+2).map(fetchMonth));
      for (const month of months) {
        for (const game of Array.isArray(month.games)?month.games:[]) {
          const kind=String(game.time_class||"").toLowerCase();
          if (!Object.hasOwn(all,kind) || game.rated!==true) continue;
          const isWhite=String(game.white?.username||"").toLowerCase()===user;
          const isBlack=String(game.black?.username||"").toLowerCase()===user;
          if (!isWhite&&!isBlack) continue;
          const rating=Number((isWhite?game.white:game.black)?.rating);
          const ended=Number(game.end_time);
          if (rating>0 && Number.isFinite(rating) && ended>1000000000)
            all[kind].push({player_elo:rating,ended});
        }
      }
      if (typeof onProgress==="function") onProgress("Loading career history: "+Math.min(i+2,archives.length)+" / "+archives.length+" months");
    }
    const sampled={};let total=0;
    for (const kind of ["rapid","blitz","bullet"]) {
      const rows=all[kind].sort((a,b)=>a.ended-b.ended);
      total+=rows.length;
      const stride=Math.max(1,Math.ceil(rows.length/850));
      const subset=rows.filter((_,i)=>i%stride===0).slice(0,850);
      if (rows.length&&subset.length&&subset[subset.length-1]!==rows[rows.length-1])
        subset[subset.length-1]=rows[rows.length-1];
      sampled[kind]=subset.map(row=>({...row,game:rows.indexOf(row)+1}));
    }
    if (!total) throw new Error("No rated Rapid, Blitz or Bullet history found.");
    return {charts:sampled,archives:archives.length,total};
  })();
  careerHistoryCache.set(user,task);
  try { return await task; }
  catch(error){careerHistoryCache.delete(user);throw error;}
}
function withPerGameScores(rows) {
  return rows.map(r=>{
    if(Number.isFinite(r?.actual_score)&&Number.isFinite(r?.expected_score))return r;
    const good=r?.rated===true && [r.score,r.player_elo,r.opponent_elo].every(Number.isFinite)
      && r.player_elo>0 && r.opponent_elo>0 && [0,.5,1].includes(r.score);
    return good?{...r,actual_score:r.score*100,
      expected_score:100/(1+Math.pow(10,(r.opponent_elo-r.player_elo)/400))}:r;
  });
}

/* Actual observations only. Overlaid controls share chronological timestamps when available. */
function timelineChart(parent, series, field, unit, compareField = null) {
  const palette = {rapid:"#65bbff", blitz:"#34dddc", bullet:"#ad9cff"};
  const data = series.flatMap(({key,label,rows}) => rows
    .filter(r => Number.isFinite(r?.[field]))
    .map((r,i) => ({...r, control:key, label, position:i+1,
      time:Number(r.ended)>1000000000?Number(r.ended):null})));
  if(!data.length) return empty(parent,"Choose at least one time control");
  const dated = data.every(r => r.time !== null);
  const W=920,H=330,L=65,R=24,T=22,B=49;
  const xs=data.map(r=>dated?r.time:r.position);
  const xmin=Math.min(...xs), xmax=Math.max(...xs);
  const values=data.flatMap(r=>[r[field],compareField?r[compareField]:null].filter(Number.isFinite));
  const low=Math.min(...values),high=Math.max(...values),range=high-low||1;
  const percent=field==="official_accuracy"||field==="actual_score";
  const min=percent?0:Math.max(0,low-range*.13);
  const max=percent?100:high+range*.13;
  const x=v=>L+((v-xmin)/(xmax-xmin||1))*(W-L-R);
  const y=v=>T+(max-v)/(max-min||1)*(H-T-B);
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg");
  svg.classList.add("timeline-svg");svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  svg.setAttribute("role","img");svg.setAttribute("aria-label","Interactive "+field.replaceAll("_"," ")+" chart");
  parent.appendChild(svg);
  function node(tag,attrs={},text,within=svg){const n=document.createElementNS(ns,tag);
    Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));
    if(text!==undefined)n.textContent=text;within.appendChild(n);return n;}
  for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,yy=y(v);
    node("line",{x1:L,y1:yy,x2:W-R,y2:yy,stroke:"#29405a","stroke-width":1});
    node("text",{x:L-12,y:yy+4,"text-anchor":"end",fill:"#9bb1c6","font-size":13},`${number(v,0)}${unit}`);
  }
  const ticks=[xmin,(xmin+xmax)/2,xmax];
  for(const value of ticks){
    const label=dated?new Date(value*1000).toLocaleDateString("en-GB",{month:"short",year:"2-digit"}):"Game "+Math.round(value);
    node("text",{x:x(value),y:H-15,"text-anchor":"middle",fill:"#9bb1c6","font-size":13},label);
  }
  const targets=[];
  for(const {key,label,rows} of series){
    const color=palette[key];
    const ordered=rows.filter(r=>Number.isFinite(r?.[field]))
      .map((r,i)=>({...r,position:i+1,time:Number(r.ended)>1000000000?Number(r.ended):null}))
      .sort((a,b)=>(dated?a.time-b.time:a.position-b.position));
    function graphPath(measure){
      let path="",started=false;
      for(const r of ordered){if(!Number.isFinite(r?.[measure])){started=false;continue;}
        const gx=x(dated?r.time:r.position),gy=y(r[measure]);
        path+=(started?" L ":" M ")+gx.toFixed(1)+" "+gy.toFixed(1);started=true;}
      return path;
    }
    node("path",{d:graphPath(field),fill:"none",stroke:compareField?"#f59b52":color,
      "stroke-width":2.7,"stroke-linejoin":"round","stroke-linecap":"round",
      opacity:compareField&&series.length>1?".82":"1"});
    if(compareField) node("path",{d:graphPath(compareField),fill:"none",stroke:color,
      "stroke-width":2.3,"stroke-dasharray":"7 5","stroke-linecap":"round"});
    for(const r of ordered){
      const px=x(dated?r.time:r.position),py=y(r[field]);
      targets.push({x:px,y:py,row:r,key,label,color});
      if(ordered.length<=180) node("circle",{cx:px,cy:py,r:2.7,fill:compareField?"#f59b52":color,opacity:.8});
    }
  }
  const focus=node("circle",{cx:0,cy:0,r:7,fill:"#061b32",stroke:"#fff","stroke-width":2});
  focus.style.display="none";
  const tooltip=add(parent,"div","timeline-tooltip");
  tooltip.setAttribute("role","status");tooltip.hidden=true;
  function show(event) {
    const rect=svg.getBoundingClientRect();
    const px=(event.clientX-rect.left)*W/rect.width,py=(event.clientY-rect.top)*H/rect.height;
    let best=null,distance=Infinity;
    for(const point of targets){const dx=point.x-px,dy=(point.y-py)*.8,d=dx*dx+dy*dy;
      if(d<distance){distance=d;best=point;}}
    if(!best || Math.sqrt(distance)>(event.pointerType==="touch"?58:30)){
      tooltip.hidden=true;focus.style.display="none";return;}
    focus.setAttribute("cx",best.x);focus.setAttribute("cy",best.y);
    focus.setAttribute("stroke",best.color);focus.style.display="";
    const r=best.row;
    tooltip.replaceChildren();
    add(tooltip,"strong","",best.label);
    const when=dated?new Date(r.time*1000).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"Game "+(r.game??r.position);
    add(tooltip,"span","",when+" · Game "+(r.game??r.position));
    add(tooltip,"b","",number(r[field],2)+unit);
    if(compareField && Number.isFinite(r[compareField]))
      add(tooltip,"span","", "Elo expected: "+number(r[compareField],2)+unit);
    tooltip.hidden=false;
    const left=(best.x/W)*rect.width,top=(best.y/H)*rect.height;
    tooltip.style.left=Math.max(12,Math.min(rect.width-175,left))+"px";
    tooltip.style.top=Math.max(12,top-14)+"px";
  }
  svg.addEventListener("pointermove",show);
  svg.addEventListener("pointerdown",show);
  svg.addEventListener("pointerleave",()=>{tooltip.hidden=true;focus.style.display="none";});
  add(parent,"p","timeline-footnote",data.length+" measured observations · hover or tap for exact values");
}
function realCharts(parent,data){
  for(const kind of ["rapid","blitz","bullet"]){
    if(Array.isArray(data.charts?.[kind]))data.charts[kind]=withPerGameScores(data.charts[kind]);
  }
  sectionTitle(parent,"Game-by-game analysis","Select any combination of Rapid, Blitz and Bullet to compare.");
  const grid=add(parent,"div","timeline-grid");
  const groups=[["rapid","Rapid"],["blitz","Blitz"],["bullet","Bullet"]];
  const measures=[
    ["actual_score","Actual vs expected score · per game","%","expected_score"],
    ["official_accuracy","Official Chess.com accuracy","%",null],
    ["player_elo","Player Elo rating","",null],
    ["opponent_elo","Opponent Elo rating","",null],
    ["median_think_seconds","Median thinking time","s",null]
  ];
  for(const [field,title,unit,compare] of measures){
    const available=groups.filter(([key])=>Array.isArray(data.charts?.[key])&&
      data.charts[key].some(r=>Number.isFinite(r?.[field])));
    if(!available.length)continue;
    const card=add(grid,"article","timeline-card");
    add(card,"h4","",title);
    const plot=add(card,"div","timeline-plot");
    const controls=add(card,"div","timeline-controls");
    controls.setAttribute("role","group");
    controls.setAttribute("aria-label",title+" · visible time controls");
    const buttons=new Map(),selected=new Set([available[0][0]]);
    let careerMode=false,careerData=null;
    let allTimeButton=null,statusLabel=null;
    if(field==="player_elo"){
      allTimeButton=add(controls,"button","timeline-control timeline-all-time","All Time");
      allTimeButton.type="button";
      allTimeButton.setAttribute("aria-pressed","false");
      allTimeButton.title="Load the full publicly available rated-game history";
      statusLabel=add(card,"p","timeline-career-note","");
      allTimeButton.addEventListener("click",async ()=>{
        if(careerMode){careerMode=false;draw();return;}
        allTimeButton.disabled=true;
        statusLabel.textContent="Loading complete public Chess.com game history…";
        try {
          careerData=await loadCareerRatings(data.username,message=>{statusLabel.textContent=message;});
          careerMode=true;
          selected.clear();
          for(const [key] of groups){
            if(careerData.charts[key]?.length)selected.add(key);
          }
          draw();
        }catch(error){
          statusLabel.textContent="All Time unavailable: "+error.message;
        }finally{allTimeButton.disabled=false;}
      });
    }
    function draw(){
      plot.replaceChildren();
      const source=careerMode?careerData.charts:data.charts;
      const active=groups.filter(([key])=>selected.has(key)&&Array.isArray(source[key])&&source[key].length)
        .map(([key,label])=>({key,label,rows:source[key]}));
      if(active.length)timelineChart(plot,active,field,unit,compare);
      else empty(plot,"Select Rapid, Blitz or Bullet to show the chart");
      for(const [key,btn] of buttons){const on=selected.has(key);
        btn.classList.toggle("is-active",on);btn.setAttribute("aria-pressed",String(on));}
      if(allTimeButton){
        allTimeButton.classList.toggle("is-active",careerMode);
        allTimeButton.setAttribute("aria-pressed",String(careerMode));
        if(careerMode)statusLabel.textContent="All Time: "+number(careerData.total,0)+
          " rated games across "+careerData.archives+" monthly archives · sampled points for chart clarity";
        else if(!statusLabel.textContent.startsWith("All Time unavailable"))statusLabel.textContent=
          "Recent analysis: up to 5,000 games. Choose All Time for the complete available career.";
      }
    }
    for(const [key,label] of groups){
      const btn=add(controls,"button","timeline-control",label);
      btn.type="button";
      const exists=available.some(([name])=>name===key);
      btn.disabled=!exists && !careerMode;
      btn.setAttribute("aria-pressed","false");
      btn.title=exists?"Toggle "+label:"No data for "+label;
      btn.addEventListener("click",()=>{if(selected.has(key))selected.delete(key);
        else selected.add(key);draw();});
      buttons.set(key,btn);
    }
    if(compare)add(card,"p","timeline-legend","Orange: actual result (win 100%, draw 50%, loss 0%) · blue/cyan/purple dashed: expected score per game");
    draw();
  }
}

function showReviewProgress(message, stage = "queued") {
  const panel = document.getElementById("v87-review");
  if (!panel) return;
  let progress = panel.querySelector(".v87-progress");
  if (!progress) {
    panel.replaceChildren();
    progress = add(panel, "div", "v87-progress");
    add(progress, "div", "v87-progress-heading", "PLAYER ANALYSIS");
    add(progress, "p", "v87-progress-message", "");
    const track = add(progress, "div", "v87-progress-track");
    add(track, "div", "v87-progress-fill");
    add(progress, "p", "v87-progress-note", "Reviewing public game history. This may take several minutes.");
  }
  progress.querySelector(".v87-progress-message").textContent = message;
  progress.querySelector(".v87-progress-fill").classList.toggle("v87-progress-running", stage === "running");
}
function renderReview(data) {
  const panel = document.getElementById("v87-review");
  panel.replaceChildren();
  const top = add(panel, "div", "v87-top");
  const left = add(top, "div");
  add(left, "span", "eyebrow", "FAIR PLAY REVIEW");
  add(left, "h3", "v87-priority", data.priority || "UNAVAILABLE");
  add(left, "p", "v87-muted", "Manual review priority — not a cheating probability or verdict.");
  const stats = add(panel, "div", "v87-metrics");
  metric(stats, "REVIEW CONFIDENCE", data.confidence);
  metric(stats, "GAMES REVIEWED", number(data.games, 0));
  metric(stats, "TIME CONTROLS", "Rapid · Blitz · Bullet");

  if (data.partial) add(panel, "p", "v87-warning", "Partial review: data or time limits affected coverage.");
  sectionTitle(panel, "Review findings", "Key observations and reliability context");
  const reasons = add(panel, "ul", "v87-reasons");
  const entries = Array.isArray(data.reasons) ? data.reasons : [data.reasons];
  const readable = entries.filter(x => x != null).map(x => typeof x === "string" ? x : JSON.stringify(x));
  if (!readable.length) add(reasons, "li", "", "No additional reason text supplied.");
  else readable.slice(0, 20).forEach(reason => add(reasons, "li", "", reason));
  if (data.charts && Object.values(data.charts).some(rows => Array.isArray(rows) && rows.length)) realCharts(panel, data);
  else { sectionTitle(panel, "Game-by-game analysis", "Detailed charts are available for new completed analyses."); add(panel, "p", "v87-muted", "This result does not contain chronological game observations. Start a new analysis to generate the charts."); }
  const foot = add(panel, "p", "v87-note",
    "Charts reflect available observed game data; they are not cheating probabilities. Statistical review priority is not proof of misconduct.");
}
function renderPlayer(profile, stats, username) {
  const header = add(playerCard, "div", "player-header");
  if (profile.avatar) {
    const avatar = add(header, "img", "player-avatar");
    avatar.src = profile.avatar;
    avatar.alt = "Player avatar";
    avatar.referrerPolicy = "no-referrer";
  }
  const identity = add(header, "div");
  add(identity, "h3", "player-name", profile.username || username);
  const link = add(identity, "a", "player-link", "View Chess.com profile");
  link.href = "https://www.chess.com/member/" + encodeURIComponent(profile.username || username);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const ratings = add(playerCard, "div", "rating-grid");
  ratings.appendChild(ratingBox("BULLET", stats.chess_bullet?.last?.rating));
  ratings.appendChild(ratingBox("BLITZ", stats.chess_blitz?.last?.rating));
  ratings.appendChild(ratingBox("RAPID", stats.chess_rapid?.last?.rating));
}
async function runReview(username) {
  const panel = document.getElementById("v87-review");
  panel.replaceChildren();
  if (!API_URL) {
    add(panel, "p", "v87-warning",
      "The analysis service is currently unavailable. Please try again later.");
    return;
  }
  showReviewProgress("Preparing your Fair Play review…");
  statusText.textContent = "";
  const base = API_URL.replace(/\/$/, "");
  const started = await getJSON(base + "/review", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username})
  });
  for (let i = 0; i < 240; i++) {
    await wait(3000);
    const job = await getJSON(base + "/review/" + encodeURIComponent(started.job_id));
    if (job.state === "complete") {
      renderReview(job.result);
      statusText.textContent = "Analysis complete.";
      return;
    }
    if (job.state === "failed") throw new Error(job.error || "Review failed.");
    showReviewProgress(job.state === "running" ? "Analyzing game history…" : "Your analysis is in the queue…", job.state);
    statusText.textContent = "";
  }
  throw new Error("Review still processing. Try again later.");
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  if (!/^[A-Za-z0-9_-]{3,25}$/.test(username)) {
    statusText.textContent = "Enter a valid Chess.com username.";
    return;
  }
  button.disabled = true;
  button.textContent = "Analyzing…";
  statusText.textContent = "Loading player profile…";
  results.classList.add("hidden");
  playerCard.replaceChildren();
  try {
    const encoded = encodeURIComponent(username);
    const [profile, stats] = await Promise.all([
      getJSON("https://api.chess.com/pub/player/" + encoded),
      getJSON("https://api.chess.com/pub/player/" + encoded + "/stats")
    ]);
    renderPlayer(profile, stats, username);
    let panel = document.getElementById("v87-review");
    if (!panel) {
      panel = add(results, "section", "v87-review");
      panel.id = "v87-review";
    }
    results.classList.remove("hidden");
    results.scrollIntoView({behavior:"smooth",block:"start"});
    try { await runReview(username); }
    catch (error) {
      panel.replaceChildren();
      add(panel, "p", "v87-warning", "Analysis unavailable: " + error.message);
      statusText.textContent = "Profile loaded, but the analysis could not finish.";
    }
  } catch (error) {
    statusText.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Analyze Player →";
  }
});
