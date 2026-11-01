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
      const subset=rows.map((row,i)=>({...row,game:i+1})).filter((_,i)=>i%stride===0).slice(0,850);
      if (rows.length&&subset.length&&subset[subset.length-1].game!==rows.length)
        subset[subset.length-1]={...rows[rows.length-1],game:rows.length};
      sampled[kind]=subset;
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
function timelineChart(parent, series, field, unit, compareField = null, periods = [], overlayField = null) {
  const palette = {rapid:"#65bbff", blitz:"#34dddc", bullet:"#ad9cff"};
  const data = series.flatMap(({key,label,rows}) => rows.filter(r => Number.isFinite(r?.[field]))
    .map((r,i) => ({...r,control:key,label,position:Number.isFinite(r.game)?r.game:i+1})));
  if(!data.length) return empty(parent,"Choose at least one time control");
  const W=1340,H=365,L=76,R=28,T=32,B=53;
  const xs=data.map(r=>r.position),xmin=Math.min(1,...xs),xmax=Math.max(...xs);
  const values=data.flatMap(r=>[r[field],compareField?r[compareField]:null,overlayField?r[overlayField]:null].filter(Number.isFinite));
  const low=Math.min(...values),high=Math.max(...values),range=high-low||1;
  const percent=["official_accuracy","actual_score","rolling_observed"].includes(field);
  // Keep the absolute per-game score on 0–100; zoom Accuracy to its observed range.
  // Never discard genuine low observations just to make the chart prettier.
  const accuracyZoom=field==="official_accuracy";
  const margin=Math.max(4,range*.09);
  const min=accuracyZoom?Math.max(0,Math.floor((low-margin)/5)*5):
    percent?0:Math.max(0,low-range*.12);
  const max=accuracyZoom?Math.min(100,Math.ceil((high+margin)/5)*5):
    percent?100:high+range*.12;
  const x=v=>L+(v-xmin)/(xmax-xmin||1)*(W-L-R);
  const y=v=>T+(max-v)/(max-min||1)*(H-T-B);
  const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
  svg.classList.add("timeline-svg");svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  svg.setAttribute("role","img");svg.setAttribute("aria-label","Game-number chart: "+field.replaceAll("_"," "));
  parent.appendChild(svg);
  function node(tag,attrs={},label,within=svg) {
    const n=document.createElementNS(ns,tag);
    Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));
    if(label!==undefined)n.textContent=label;
    within.appendChild(n);return n;
  }
  for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,yy=y(v);
    node("line",{x1:L,y1:yy,x2:W-R,y2:yy,stroke:"#29405a","stroke-width":1});
    node("text",{x:L-12,y:yy+5,"text-anchor":"end",fill:"#9bb1c6","font-size":14},`${number(v,0)}${unit}`);
  }
  for(let i=0;i<=4;i++){const value=xmin+(xmax-xmin)*i/4;
    node("text",{x:x(value),y:H-22,"text-anchor":"middle",fill:"#9bb1c6","font-size":14},String(Math.round(value)));}
  node("text",{x:(W+L-R)/2,y:H-3,"text-anchor":"middle",fill:"#9bb1c6","font-size":13},"Game number (chronological · per time class)");
  // Cross-control context uses the same dates, mapped onto each class's game numbers.
  for(const period of periods){
    const related=series.filter(s=>s.key===period.time_class);
    for(const line of related){
      const points=line.rows.filter(r=>Number.isFinite(r.ended)&&Number.isFinite(r.game));
      if(!points.length)continue;
      const start=points.find(r=>r.ended>=period.first_ended);
      const end=[...points].reverse().find(r=>r.ended<=period.last_ended);
      if(!start||!end||end.game<start.game)continue;
      const px=Math.max(L,x(start.game)),right=Math.min(W-R,x(end.game));
      if(right<=px)continue;
      const priority=String(period.priority||"").toUpperCase();
      const shade=period.context?"#ad82ff":priority==="VERY HIGH"?"#f05c70":priority==="HIGH"?"#f59b52":priority==="MODERATE"?"#f4d06f":"#5fbf93";
      node("rect",{x:px,y:T,width:right-px,height:H-T-B,fill:shade,"fill-opacity":".16",stroke:shade,"stroke-width":1.6});
      node("text",{x:px+5,y:T+15,fill:shade,"font-size":13,"font-weight":700},period.context?"Context":priority);
    }
  }
  const targets=[];
  for(const {key,label,rows} of series){
    const color=palette[key];
    const ordered=rows.filter(r=>Number.isFinite(r?.game))
      .sort((a,b)=>a.game-b.game);
    function pathOf(measure) {
      let d="",started=false;
      for(const r of ordered) {
        if(!Number.isFinite(r?.[measure])){started=false;continue;}
        d+=(started?" L ":" M ")+x(r.game).toFixed(2)+" "+y(r[measure]).toFixed(2);
        started=true;
      }
      return d;
    }
    const individual=field==="actual_score";
    if(individual) {
      // Outcomes are categorical (0 / 50 / 100), not a continuous quantity.
      // Disconnected compact dots avoid the unreadable orange zigzag at high game counts.
      const dotLayer=node("g",{"aria-label":"Individual game results"});
      for(const r of ordered) {
        if(!Number.isFinite(r[field]))continue;
        const point=node("circle",{
          cx:x(r.game),cy:y(r[field]),r:2.9,fill:"#ff9d52",
          opacity:.67
        },undefined,dotLayer);
      }
    } else {
      node("path",{d:pathOf(field),fill:"none",stroke:compareField?"#f59b52":color,
        "stroke-width":2.25,"stroke-linecap":"round","stroke-linejoin":"round",
        "stroke-dasharray":compareField?"6 3":"none"});
    }
    if(compareField)node("path",{d:pathOf(compareField),fill:"none",stroke:color,"stroke-width":2.3});
    if(overlayField)node("path",{d:pathOf(overlayField),fill:"none",stroke:"#4bdd9a",
      "stroke-width":3,"stroke-linejoin":"round"});
    for(const r of ordered){
      if(!Number.isFinite(r[field]))continue;
      targets.push({x:x(r.game),y:y(r[field]),row:r,key,label,color});
    }
  }
  const focus=node("circle",{cx:0,cy:0,r:6,fill:"#061b32",stroke:"#fff","stroke-width":2});
  focus.style.display="none";
  const tooltip=add(parent,"div","timeline-tooltip");tooltip.setAttribute("role","status");tooltip.hidden=true;
  function show(event){
    const rect=svg.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const px=(event.clientX-rect.left)*W/rect.width,py=(event.clientY-rect.top)*H/rect.height;
    let best=null,distance=Infinity;
    for(const point of targets){const dx=point.x-px,dy=(point.y-py)*.65,d=dx*dx+dy*dy;
      if(d<distance){distance=d;best=point;}}
    if(!best||Math.sqrt(distance)>(event.pointerType==="touch"?72:40)){
      tooltip.hidden=true;focus.style.display="none";return;}
    focus.setAttribute("cx",best.x);focus.setAttribute("cy",best.y);
    focus.setAttribute("stroke",best.color);focus.style.display="";
    const r=best.row;tooltip.replaceChildren();
    add(tooltip,"strong","",best.label);
    const when=Number.isFinite(r.ended)?new Date(r.ended*1000).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"";
    add(tooltip,"span","","Game "+r.game+(when?" · "+when:""));
    add(tooltip,"b","",number(r[field],2)+unit);
    if(compareField&&Number.isFinite(r[compareField]))add(tooltip,"span","","Elo expected: "+number(r[compareField],2)+unit);
    if(overlayField&&Number.isFinite(r[overlayField]))add(tooltip,"span","","Rolling mean: "+number(r[overlayField],2)+unit);
    tooltip.hidden=false;
    tooltip.style.left=Math.max(12,Math.min(rect.width-200,best.x/W*rect.width))+"px";
    tooltip.style.top=Math.max(12,best.y/H*rect.height-12)+"px";
  }
  svg.addEventListener("pointermove",show);svg.addEventListener("pointerdown",show);
  svg.addEventListener("pointerleave",()=>{tooltip.hidden=true;focus.style.display="none";});
  add(parent,"p","timeline-footnote",data.length+" sampled observations · game-number axis · hover or tap for exact values");
}
function realCharts(parent,data){
  for(const kind of ["rapid","blitz","bullet"]){
    if(Array.isArray(data.charts?.[kind]))data.charts[kind]=withPerGameScores(data.charts[kind]);
  }
  sectionTitle(parent,"Game-by-game analysis","Select any combination of Rapid, Blitz and Bullet to compare.");
  if(Number(data.games)<20)add(parent,"p","v87-sample-warning","Small sample: only "+number(data.games,0)+" games were reviewed. These charts are descriptive and do not provide reliable period-level Fair Play evidence.");
  const grid=add(parent,"div","timeline-grid");
  const marked=Array.isArray(data.method3?.marked_periods)?data.method3.marked_periods:[];
  const selected=data.method3?.selected;
  const significant=p=>["MODERATE","HIGH","VERY HIGH"].includes(String(p.priority||"").toUpperCase());
  const enoughGames=Number(data.games)>=20;
  const allPeriods=enoughGames?marked.filter(significant).map(p=>({...p,context:false})):[];
  if(enoughGames&&selected?.first_ended&&selected?.last_ended&&["MODERATE","HIGH","VERY HIGH"].includes(String(data.priority||"").toUpperCase())&&!allPeriods.some(p=>p.first_ended===selected.first_ended&&p.last_ended===selected.last_ended))
    allPeriods.push({...selected,priority:data.priority,context:false});
  if(enoughGames&&selected?.first_ended&&selected?.last_ended&&["MODERATE","HIGH","VERY HIGH"].includes(String(data.priority||"").toUpperCase()))
    for(const kind of ["rapid","blitz","bullet"]){
      if(kind!==selected.time_class)allPeriods.push({time_class:kind,
        first_ended:selected.first_ended,last_ended:selected.last_ended,context:true});
    }
  const groups=[["rapid","Rapid"],["blitz","Blitz"],["bullet","Bullet"]];
  const measures=[
    ["rolling_observed","Rolling 10-game expected / observed points","%","rolling_expected"],
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
      if(active.length){
        const overlays=careerMode?[]:allPeriods;
        const smoothing=field==="official_accuracy"?"accuracy_mean_30":
          field==="median_think_seconds"?"timing_mean_30":null;
        timelineChart(plot,active,field,unit,compare,overlays,smoothing);
      }
      else empty(plot,"Select Rapid, Blitz or Bullet to show the chart");
      for(const [key,btn] of buttons){const on=selected.has(key);
        btn.disabled=careerMode?!careerData.charts[key]?.length:!available.some(([name])=>name===key);
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
    if(compare)add(card,"p","timeline-legend",field==="rolling_observed"
      ?"Orange dashed: observed rolling 10-game points · blue/cyan/purple: expected points (same ten-game window)"
      :"Orange dots: individual results (win 100%, draw 50%, loss 0%) · blue/cyan/purple: Elo expected per game");
    if(field==="official_accuracy"||field==="median_think_seconds")add(card,"p","timeline-legend","Green: rolling 30-game mean (available observations only)");
    if(allPeriods.length)add(card,"p","timeline-legend","Shaded periods: orange HIGH · red VERY HIGH · yellow MODERATE · purple same-date context. Not proof of cheating.");
    draw();
  }
}

let reviewProgressStarted=0, reviewProgressTimer=null, reviewProgressStage="queued";
let reviewProgressPercent=0, reviewProgressReport="", reviewProgressFinishing=false;
// Ten neutral verbs × 30 analytical subjects × six scopes = 1,800 combinations.
// This rotating line is decorative; the separate phase line reports actual backend status.
const analysisVerbs=[
  "Reviewing","Checking","Comparing","Inspecting","Examining",
  "Mapping","Summarizing","Tracing","Cross-checking","Assessing"
];
const analysisSubjects=[
  "Elo expectations","game results","opponent ratings","rating changes",
  "opening choices","Rapid performance","Blitz performance","Bullet performance",
  "accuracy trends","scoring trends","historical patterns","game sequences",
  "rating differences","draw frequencies","win frequencies","loss frequencies",
  "thinking times","move timings","time controls","result distributions",
  "opening frequencies","game chronology","sample coverage","accuracy coverage",
  "rating stability","opponent strength","rolling averages","recent activity",
  "statistical variation","period comparisons"
];
const analysisScopes=[
  "across the game history","in the available games","over time",
  "within each time control","across recent periods","against earlier results"
];
function analysisStatusLine(){
  const index=Math.floor(Math.max(0,Date.now()-reviewProgressStarted)/3400);
  const total=analysisVerbs.length*analysisSubjects.length*analysisScopes.length;
  // Coprime stride visits every combination before repeating.
  const n=(index*427+137)%total;
  const verb=analysisVerbs[n%analysisVerbs.length];
  const subject=analysisSubjects[Math.floor(n/analysisVerbs.length)%analysisSubjects.length];
  const scope=analysisScopes[Math.floor(n/(analysisVerbs.length*analysisSubjects.length))];
  return verb+" "+subject+" "+scope+"…";
}
function currentReviewEstimate(){
  const elapsed=Math.max(0,Date.now()-reviewProgressStarted);
  // Continuously animated estimate. Backend job phases may accelerate it, but
  // never cause abrupt jumps. Real game-by-game counts aren't exposed.
  const slow=80*(1-Math.exp(-elapsed/5800));
  let target=elapsed<=14000?slow:80+12*(1-Math.exp(-(elapsed-14000)/85000));
  const phaseFloor={queued:0,preparing:28,dependencies:58,analyzing:83,uploading:96};
  target=Math.max(target,phaseFloor[reviewProgressStage]||0);
  target=Math.min(98,target);
  const ahead=target-reviewProgressPercent;
  if(ahead<=0)return reviewProgressPercent;
  // The bar may catch up more quickly when real work advances, but smoothly.
  const step=reviewProgressPercent<80?(["analyzing","uploading"].includes(reviewProgressStage)?1.5:0.9):
    reviewProgressStage==="uploading"?.42:.18;
  return Math.min(98,reviewProgressPercent+Math.min(ahead,step));
}
function stopReviewProgress(){
  if(reviewProgressTimer!==null){clearInterval(reviewProgressTimer);reviewProgressTimer=null;}
  reviewProgressStarted=0;
}
function showReviewProgress(message,stage="queued",completed=false){
  const panel=document.getElementById("v87-review");
  if(!panel)return;
  let progress=panel.querySelector(".v87-progress");
  if(!progress){
    panel.replaceChildren();
    progress=add(panel,"div","v87-progress");
    add(progress,"div","v87-progress-heading","PLAYER ANALYSIS");
    const value=add(progress,"div","v87-progress-value","0%");
    value.setAttribute("aria-label","Estimated analysis progress");
    add(progress,"p","v87-progress-message","");
    const track=add(progress,"div","v87-progress-track");
    track.setAttribute("role","progressbar");track.setAttribute("aria-label","Estimated analysis progress");
    track.setAttribute("aria-valuemin","0");track.setAttribute("aria-valuemax","100");
    const fill=add(track,"div","v87-progress-fill");fill.style.width="0%";
    add(progress,"p","v87-progress-quips","");
    add(progress,"p","v87-progress-note","Approximate progress, guided by actual workflow stages. Exact per-game counts are not available.");
  }
  if(stage)reviewProgressStage=stage;
  if(message)reviewProgressReport=message;
  reviewProgressPercent=completed?100:currentReviewEstimate();
  const value=progress.querySelector(".v87-progress-value");
  const track=progress.querySelector(".v87-progress-track");
  const fill=progress.querySelector(".v87-progress-fill");
  value.textContent=Math.floor(reviewProgressPercent)+"%";
  track.setAttribute("aria-valuenow",String(Math.floor(reviewProgressPercent)));
  fill.style.width=reviewProgressPercent+"%";
  progress.querySelector(".v87-progress-message").textContent=reviewProgressReport;
  const quip=completed?"Review complete.":analysisStatusLine();
  progress.querySelector(".v87-progress-quips").textContent=quip;
  progress.classList.toggle("v87-progress-complete",completed);
}
function startReviewProgress(){
  stopReviewProgress();
  reviewProgressStarted=Date.now();
  reviewProgressFinishing=false;
  reviewProgressPercent=0;reviewProgressStage="queued";reviewProgressReport="";
  showReviewProgress("Waiting for an analysis worker…","queued");
  reviewProgressTimer=setInterval(()=>{
    if(!reviewProgressFinishing&&document.querySelector("#v87-review .v87-progress"))
      showReviewProgress(reviewProgressReport,reviewProgressStage);
  },180);
}
async function finishReviewProgress(){
  reviewProgressFinishing=true;
  // Show the final transition visibly; do not abruptly replace 86% with results.
  showReviewProgress("Analysis complete. Preparing your results…","complete",true);
  await wait(1100);
  stopReviewProgress();
  reviewProgressFinishing=false;
}

function renderReview(data) {
  const panel = document.getElementById("v87-review");
  panel.replaceChildren();
  const top = add(panel, "div", "v87-top");
  const left = add(top, "div");
  add(left, "span", "eyebrow", "FAIR PLAY REVIEW");
  const priorityHeading=add(left, "h3", "v87-priority", data.priority || "UNAVAILABLE");
  const level=String(data.priority||"").toUpperCase().replaceAll(" ","-");
  if(["LOW","MODERATE","HIGH","VERY-HIGH"].includes(level))
    priorityHeading.classList.add("v87-priority-"+level.toLowerCase());
  const entries = Array.isArray(data.reasons) ? data.reasons : [data.reasons];
  const cleanedReasons = entries.filter(x => x != null)
    .map(x => typeof x === "string" ? x : JSON.stringify(x))
    .map(x => x.replace(/\s*This experimental results flag is not engine or Maia confirmation\.?/gi, "").trim())
    .filter(Boolean);
  const highlightedIndex = cleanedReasons.findIndex(reason =>
    /A chronological period scored substantially above its Elo-point expectation and passed the history-search guard/i.test(reason));
  if (highlightedIndex !== -1) {
    add(left, "p", "v87-priority-finding", cleanedReasons[highlightedIndex]);
  }
  add(left, "p", "v87-muted", "Manual review priority — not a cheating probability or verdict.");
  const stats = add(panel, "div", "v87-metrics");
  metric(stats, "REVIEW CONFIDENCE", data.confidence);
  metric(stats, "GAMES REVIEWED", number(data.games, 0));
  metric(stats, "TIME CONTROLS", "Rapid · Blitz · Bullet");

  if (data.partial) add(panel, "p", "v87-warning", "Partial review: data or time limits affected coverage.");
  sectionTitle(panel, "Review findings", "Key observations and reliability context");
  const reasons = add(panel, "ul", "v87-reasons");
  const readable = cleanedReasons.filter((_, i) => i !== highlightedIndex);
  if (!readable.length) add(reasons, "li", "", highlightedIndex !== -1
    ? "The primary finding is displayed directly below the review priority."
    : "No additional reason text supplied.");
  else readable.slice(0, 20).forEach(reason => add(reasons, "li", "", reason));
  if (data.charts && Object.values(data.charts).some(rows => Array.isArray(rows) && rows.length)) realCharts(panel, data);
  else { sectionTitle(panel, "Game-by-game analysis", "Detailed charts are available for new completed analyses."); add(panel, "p", "v87-muted", "This result does not contain chronological game observations. Start a new analysis to generate the charts."); }
  const opening=data.opening_summary;
  const shift=data.method3?.opening_shift;
  if(opening&&typeof opening==="object"){
    sectionTitle(panel,"Opening repertoire","Most-played opening choices · expand a time control for the full breakdown.");
    const openingGrid=add(panel,"div","opening-grid");
    for(const [kind,label] of [["rapid","Rapid"],["blitz","Blitz"],["bullet","Bullet"]]){
      const groups=Array.isArray(opening[kind])?opening[kind]:[];
      if(!groups.length)continue;
      const card=add(openingGrid,"article","opening-card opening-compact");
      add(card,"h4","",label);
      const total=groups.reduce((sum,g)=>sum+(Number(g.total)||0),0);
      add(card,"p","opening-subtitle",number(total,0)+" recorded opening choices");
      const summary=[];
      for(const group of groups){
        for(const choice of group.choices||[]){
          summary.push({name:group.group.replace("White · first move","White")
            .replace("Black · vs","Black vs")+" · "+choice.name,
            count:choice.games});
        }
      }
      summary.sort((a,b)=>b.count-a.count);
      function openingRow(parent,name,count,denominator){
        const row=add(parent,"div","opening-summary-row");
        const heading=add(row,"div","opening-summary-label");
        add(heading,"span","",name);
        add(heading,"strong","",number(count,0));
        const track=add(row,"div","opening-bar-track");
        const fill=add(track,"div","opening-bar-fill");
        fill.style.width=Math.min(100,100*count/Math.max(1,denominator)).toFixed(1)+"%";
      }
      const list=add(card,"div","opening-summary-list");
      for(const choice of summary.slice(0,4))openingRow(list,choice.name,choice.count,total);
      const details=add(card,"details","opening-details");
      add(details,"summary","","View all openings");
      const body=add(details,"div","opening-details-body");
      for(const group of groups){
        add(body,"h5","",group.group+" · "+number(group.total,0)+" games");
        for(const choice of group.choices||[])openingRow(body,choice.name,choice.games,group.total);
      }
    }
  }
  if(shift&&typeof shift==="object"){
    const wrap=add(panel,"div","opening-shift");
    add(wrap,"h4","","Opening change near the selected period · context only");
    add(wrap,"p","","In "+String(shift.time_class||"")+" ("+String(shift.color||"")+
      ", "+String(shift.opponent_opening||"")+"): "+String(shift.before||"")+" → "+
      String(shift.during||"")+" → "+String(shift.after||"")+
      ". A temporary change in openings is not evidence of misconduct.");
  }
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
  reviewProgressStage="queued";
  startReviewProgress();
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
      await finishReviewProgress();
      renderReview(job.result);
      statusText.textContent = "Analysis complete.";
      return;
    }
    if (job.state === "failed") {stopReviewProgress();throw new Error(job.error || "Review failed.");}
    reviewProgressStage=job.phase||job.state;
    showReviewProgress(job.progress||"Analyzing public game history…",reviewProgressStage);
    statusText.textContent = "";
  }
  stopReviewProgress();
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
      stopReviewProgress();
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
