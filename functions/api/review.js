import { json, github, listRuns, MAX_ACTIVE } from "../../lib/v87-github.js";


// Cloudflare D1 enforces a shared per-IP quota across all Pages instances.
// Store only an HMAC of the IP, never the address itself.
async function reviewQuota(request, env) {
  if (!env.SUS_DB || !env.GITHUB_TOKEN) return { error: "Review quota unavailable.", status: 503 };
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return { error: "Unable to verify visitor.", status: 403 };
  const key = await crypto.subtle.importKey("raw",
    new TextEncoder().encode(env.GITHUB_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  const identity = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const windowId = Math.floor(Date.now() / 600000);
  await env.SUS_DB.prepare(
    "CREATE TABLE IF NOT EXISTS review_rate_limits (identity TEXT NOT NULL, window_id INTEGER NOT NULL, hits INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(identity, window_id))"
  ).run();
  const result = await env.SUS_DB.prepare(
    "INSERT INTO review_rate_limits(identity,window_id,hits) VALUES(?,?,1) ON CONFLICT(identity,window_id) DO UPDATE SET hits=hits+1 WHERE hits < 15 RETURNING hits"
  ).bind(identity,windowId).first();
  if (!result) return { error: "Maximum 15 reviews per 10 minutes. Please try again later.", status: 429 };
  return null;
}

export async function onRequestPost({ request, env }) {
  if (!env.GITHUB_TOKEN) return json({ error: "Server secret GITHUB_TOKEN is missing." }, 503);
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Origin not allowed." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const username = String(body?.username || "").trim();
  if (!/^[A-Za-z0-9_-]{3,25}$/.test(username)) return json({ error: "Invalid Chess.com username." }, 400);
  try {
    const quota = await reviewQuota(request, env);
    if (quota) return json({ error: quota.error }, quota.status);
    const runs = await listRuns(env.GITHUB_TOKEN);
    const active = runs.filter(run => run.status === "queued" || run.status === "in_progress").length;
    if (active >= MAX_ACTIVE) return json({ error: "The analysis service is busy. Please try again shortly." }, 429);
    const id = crypto.randomUUID();
    const response = await github(env.GITHUB_TOKEN,
      "/actions/workflows/fairplay-v87-website.yml/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main", inputs: { chess_username: username, request_id: id } })
      });
    if (!response.ok) return json({ error: "Unable to start analysis (" + response.status + ")." }, 502);
    return json({ job_id: id, state: "queued" }, 202);
  } catch {
    return json({ error: "Analysis service temporarily unavailable." }, 502);
  }
}
