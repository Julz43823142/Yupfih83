import { json, github, listRuns, MAX_ACTIVE } from "../lib/v87-github.js";

export async function onRequestPost({ request, env }) {
  if (!env.GITHUB_TOKEN) return json({ error: "Server secret GITHUB_TOKEN is missing." }, 503);
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Origin not allowed." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const username = String(body?.username || "").trim();
  if (!/^[A-Za-z0-9_-]{3,25}$/.test(username)) return json({ error: "Invalid Chess.com username." }, 400);
  try {
    const runs = await listRuns(env.GITHUB_TOKEN);
    const active = runs.filter(run => run.status === "queued" || run.status === "in_progress").length;
    if (active >= MAX_ACTIVE) return json({ error: "Ten reviews are already running. Please try again later." }, 429);
    const id = crypto.randomUUID();
    const response = await github(env.GITHUB_TOKEN,
      "/actions/workflows/fairplay-v87-website.yml/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main", inputs: { chess_username: username, request_id: id } })
      });
    if (!response.ok) return json({ error: "Unable to start GitHub review (" + response.status + ")." }, 502);
    return json({ job_id: id, state: "queued" }, 202);
  } catch {
    return json({ error: "GitHub review service temporarily unavailable." }, 502);
  }
}
