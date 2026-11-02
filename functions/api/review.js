import { json, github, listRuns, MAX_ACTIVE } from "../../lib/v87-github.js";

export async function onRequestPost({ request, env }) {
  if (!env.GITHUB_TOKEN) return json({ error: "Server secret GITHUB_TOKEN is missing." }, 503);
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Origin not allowed." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const username = String(body?.username || "").trim();
  if (!/^[A-Za-z0-9_-]{3,25}$/.test(username)) return json({ error: "Invalid Chess.com username." }, 400);
  // Fail closed when rate-limit storage is unavailable; prevents unbounded workflow dispatch.
  if (!env.SUS_DB) return json({ error: "Rate-limit storage unavailable." }, 503);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const encoder = new TextEncoder();
  const secret = await crypto.subtle.importKey("raw", encoder.encode(env.GITHUB_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", secret, encoder.encode(ip));
  const client = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
  const bucket = Math.floor(Date.now() / 900000);
  try {
    const limit = await env.SUS_DB.prepare(
      "INSERT INTO review_rate_limits (client, bucket, attempts) VALUES (?, ?, 1) ON CONFLICT(client, bucket) DO UPDATE SET attempts = attempts + 1 RETURNING attempts"
    ).bind(client, bucket).first();
    if (Number(limit?.attempts || 0) > 3) return json({ error: "Too many requests. Try again in 15 minutes." }, 429);
  } catch {
    return json({ error: "Rate-limit storage unavailable." }, 503);
  }
  try {
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
