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

/* Chronological plots use actual v87 observations, never fabricated values. */
function timelineChart(parent, rows, field, unit) {
  const valid = rows.filter(r => Number.isFinite(r?.[field]) && Number.isFinite(r?.game));
  if (!valid.length) return empty(parent, "No published observations for this measure");
  const W=760,H=238,L=54,R=19,T=18,B=39;
  const values=valid.map(r=>r[field]), lo=Math.min(...values), hi=Math.max(...values);
  const min=field==="official_accuracy"?0:Math.max(0,lo-(hi-lo||1)*.12);
  const max=field==="official_accuracy"?100:hi+(hi-lo||1)*.12;
  const end=Math.max(2,...rows.map(r=>Number(r.game)||0));
  const x=v=>L+(v-1)/(end-1)*(W-L-R), y=v=>T+(max-v)/(max-min||1)*(H-T-B);
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  svg.setAttribute("role","img");svg.setAttribute("aria-label",`${field.replaceAll("_"," ")} over ${end} games`);
  svg.classList.add("timeline-svg");parent.appendChild(svg);
  function node(tag,attrs={},text){const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!==undefined)n.textContent=text;svg.appendChild(n);return n;}
  for(let i=0;i<=4;i++){const v=min+(max-min)*i/4, yy=y(v);
    node("line",{x1:L,y1:yy,x2:W-R,y2:yy,stroke:"#29405a","stroke-width":1});
    node("text",{x:L-10,y:yy+4,"text-anchor":"end",fill:"#9bb1c6","font-size":12},`${Math.round(v)}${unit}`);
  }
  [1,Math.round((end+1)/2),end].forEach(g=>node("text",{x:x(g),y:H-12,"text-anchor":"middle",fill:"#9bb1c6","font-size":12},g));
  let path="",prev=0;
  rows.forEach(r=>{if(!Number.isFinite(r?.[field])||!Number.isFinite(r?.game)){prev=0;return;}
    path+=(prev?" L ":" M ")+x(r.game).toFixed(1)+" "+y(r[field]).toFixed(1);prev=1;});
  node("path",{d:path,fill:"none",stroke:"#65bbff","stroke-width":2.5,"stroke-linecap":"round","stroke-linejoin":"round"});
  valid.forEach((r,i)=>{if(valid.length>140&&i%Math.ceil(valid.length/140)!==0)return;
    const c=node("circle",{cx:x(r.game),cy:y(r[field]),r:valid.length>90?2.3:3.7,fill:"#a6ddff"});
    const title=document.createElementNS(ns,"title");title.textContent=`Game ${r.game}: ${number(r[field],1)}${unit}`;c.appendChild(title);
  });
  add(parent,"p","timeline-footnote",`${valid.length} measured games · gaps represent missing data`);
}
function realCharts(parent,data){
  sectionTitle(parent,"Game-by-game analysis","Actual observations from the completed v87 scan · by time control");
  const grid=add(parent,"div","timeline-grid");
  const groups=[["rapid","Rapid"],["blitz","Blitz"],["bullet","Bullet"]];
  for(const [key,label] of groups){
    const rows=Array.isArray(data.charts?.[key])?data.charts[key]:[];
    for(const [field,title,unit] of [
      ["official_accuracy","Official Chess.com accuracy","%"],
      ["player_elo","Player rating",""],
      ["median_think_seconds","Median thinking time","s"]]){
      const card=add(grid,"article","timeline-card");
      add(card,"div","timeline-category",label.toUpperCase());
      add(card,"h4","",title);
      const plot=add(card,"div","timeline-plot");
      timelineChart(plot,rows,field,unit);
    }
  }
}

function chartNine(parent, data) {
  const m = data.method3 || {};
  const chosen = m.selected || {};
  const quality = m.data_quality || {};
  const context = m.period_context || {};
  const grid = add(parent, "div", "v87-chart-grid");
  let plot;

  plot = chartCard(grid, "01 · Review coverage", "Games and searched windows");
  bars(plot, [{label:"Games",value:data.games}, {label:"Selected",value:data.selected_games},
    {label:"Windows",value:m.searched_windows}, {label:"Segments",value:m.segments_checked}]);

  plot = chartCard(grid, "02 · Rating reliability", "Original v87 rating reliability diagnostics");
  bars(plot, objectRows(m.rating_reliability, ["rated_games","unrated_games","rated_count","anchors","anchor_count","repeated_opponents"]));

  plot = chartCard(grid, "03 · Selected period", "Observed selected-period measurements");
  bars(plot, objectRows(chosen, ["games","wins","draws","losses","score_excess","expected_score","actual_score","score","z_score"]));

  plot = chartCard(grid, "04 · Results screen", "v87 effect screen; not cheating probability");
  bars(plot, objectRows(m.selected_high_effect_screen,
    ["observed_excess","required_excess","additional_percentage_points_needed"]));

  plot = chartCard(grid, "05 · Data quality", "Counts reported by the original review");
  bars(plot, objectRows(quality, ["games","rated_games","unrated_games","missing_accuracy","missing_rating","archives","coverage"]));

  plot = chartCard(grid, "06 · Guarded periods", "Reasons periods were limited by reliability guards");
  bars(plot, Object.entries(m.period_guard_counts || {}).map(([label,value]) => ({label,value})));

  plot = chartCard(grid, "07 · Accuracy frequency", "Available official-Accuracy signal counts");
  bars(plot, Array.isArray(m.accuracy_frequency_signals)
    ? [{label:"Signals",value:m.accuracy_frequency_signals.length},
       {label:"Absolute signals",value:(m.absolute_accuracy_frequency_signals || []).length},
       {label:"Limited flags",value:(m.limited_accuracy_review_flags || []).length}]
    : objectRows(m.accuracy_frequency, ["games","samples","eligible","signals"]));

  plot = chartCard(grid, "08 · Historical changes", "Changes identified in the player's own history");
  bars(plot, Array.isArray(m.history_changes)
    ? [{label:"History changes",value:m.history_changes.length},
       {label:"Marked periods",value:Array.isArray(m.marked_periods)?m.marked_periods.length:0},
       {label:"Review observations",value:Array.isArray(m.manual_review_observations)?m.manual_review_observations.length:0}]
    : []);

  plot = chartCard(grid, "09 · Period context", "Additional original Method 3 period measurements");
  bars(plot, objectRows(context, ["games","wins","draws","losses","score_excess","accuracy","average_accuracy","rating_change"]));
}
function showReviewProgress(message, stage = "queued") {
  const panel = document.getElementById("v87-review");
  if (!panel) return;
  let progress = panel.querySelector(".v87-progress");
  if (!progress) {
    panel.replaceChildren();
    progress = add(panel, "div", "v87-progress");
    add(progress, "div", "v87-progress-heading", "FAIR PLAY V87 · ANALYSIS");
    add(progress, "p", "v87-progress-message", "");
    const track = add(progress, "div", "v87-progress-track");
    add(track, "div", "v87-progress-fill");
    add(progress, "p", "v87-progress-note", "The analysis runs on GitHub. This may take several minutes.");
  }
  progress.querySelector(".v87-progress-message").textContent = message;
  progress.querySelector(".v87-progress-fill").classList.toggle("v87-progress-running", stage === "running");
}
function renderReview(data) {
  const panel = document.getElementById("v87-review");
  panel.replaceChildren();
  const top = add(panel, "div", "v87-top");
  const left = add(top, "div");
  add(left, "span", "eyebrow", "FAIR PLAY V87 · ENGINE FREE");
  add(left, "h3", "v87-priority", data.priority || "UNAVAILABLE");
  add(left, "p", "v87-muted", "Manual review priority — not a cheating probability or verdict.");
  const stats = add(panel, "div", "v87-metrics");
  metric(stats, "REVIEW CONFIDENCE", data.confidence);
  metric(stats, "GAMES REVIEWED", number(data.games, 0));
  metric(stats, "SEARCHED WINDOWS", number(data.method3?.searched_windows, 0));
  metric(stats, "REVIEW VERSION", data.version);
  if (data.partial) add(panel, "p", "v87-warning", "Partial review: data or time limits affected coverage.");
  sectionTitle(panel, "Review findings", "Original v87 assessment and reliability context");
  const reasons = add(panel, "ul", "v87-reasons");
  const entries = Array.isArray(data.reasons) ? data.reasons : [data.reasons];
  const readable = entries.filter(x => x != null).map(x => typeof x === "string" ? x : JSON.stringify(x));
  if (!readable.length) add(reasons, "li", "", "No additional reason text supplied.");
  else readable.slice(0, 20).forEach(reason => add(reasons, "li", "", reason));
  sectionTitle(panel, "Statistical charts", "Chronological observations from the original v87 review. Missing values are not estimated.");
  if (data.charts && Object.keys(data.charts).length) realCharts(panel, data);
  else chartNine(panel, data);
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
      "The original Python v87 backend is not deployed yet. Profile ratings are available; a real review cannot run until the API is configured.");
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
      statusText.textContent = "Original v87 review complete.";
      return;
    }
    if (job.state === "failed") throw new Error(job.error || "Review failed.");
    showReviewProgress(job.state === "running" ? "Analyzing games with Fair Play v87…" : "Your analysis is in the queue…", job.state);
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
      add(panel, "p", "v87-warning", "Fair Play v87: " + error.message);
      statusText.textContent = "Profile loaded, but v87 review could not finish.";
    }
  } catch (error) {
    statusText.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Analyze Player →";
  }
});
