import { json, github, listRuns, matchingRun, parseStoredZip } from "../../../lib/v87-github.js";

export async function onRequestGet({ params, env }) {
  if (!env.GITHUB_TOKEN) return json({ error: "Server secret GITHUB_TOKEN is missing." }, 503);
  const id = String(params.id || "");
  if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: "Invalid review identifier." }, 400);
  try {
    const runs = await listRuns(env.GITHUB_TOKEN);
    const run = matchingRun(runs, id);
    if (!run) return json({ state: "queued", progress: "Waiting for GitHub to schedule the review…" });
    if (run.status !== "completed") {
      return json({ state: "running", progress: run.status === "queued" ? "Waiting for a GitHub runner…" : "Original Python v87 review running…" });
    }
    if (run.conclusion !== "success") return json({ state: "failed", error: "GitHub review did not complete successfully. Check the Actions run." });
    const artifactsResponse = await github(env.GITHUB_TOKEN, "/actions/runs/" + run.id + "/artifacts?per_page=30");
    if (!artifactsResponse.ok) throw new Error("Cannot read artifacts");
    const artifacts = (await artifactsResponse.json()).artifacts || [];
    const artifact = artifacts.find(item => item.name === "v87-result" && !item.expired);
    if (!artifact) return json({ state: "running", progress: "Waiting for the review result artifact…" });
    const zipResponse = await github(env.GITHUB_TOKEN, "/actions/artifacts/" + artifact.id + "/zip");
    if (!zipResponse.ok) throw new Error("Cannot download review result");
    const result = parseStoredZip(await zipResponse.arrayBuffer());
    return json({ state: "complete", result });
  } catch {
    return json({ state: "failed", error: "Unable to retrieve the v87 review. Please try again later." }, 502);
  }
}
