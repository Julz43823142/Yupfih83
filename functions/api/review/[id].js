import { json, github, listRuns, matchingRun, parseStoredZip } from "../../../lib/v87-github.js";
import {issueReviewProof} from "../../../lib/sus-auth.js";

export async function onRequestGet({ params, env }) {
  if (!env.GITHUB_TOKEN) return json({ error: "Server secret GITHUB_TOKEN is missing." }, 503);
  const id = String(params.id || "");
  if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: "Invalid review identifier." }, 400);
  try {
    const runs = await listRuns(env.GITHUB_TOKEN);
    const run = matchingRun(runs, id);
    if (!run) return json({ state: "queued", progress: "Waiting for analysis to start…" });
    if (run.status !== "completed") {
      if (run.status === "queued") return json({
        state:"queued", phase:"queued", progress:"Waiting for an available analysis worker…"
      });
      // GitHub Actions exposes actual job-step state, not per-game scan counts.
      // Keep phase reporting grounded in real steps rather than fabricated game totals.
      let phase="preparing", progress="Preparing analysis environment…";
      try {
        const jobsResponse = await github(env.GITHUB_TOKEN,
          "/actions/runs/" + run.id + "/jobs?per_page=20");
        if (jobsResponse.ok) {
          const jobs=(await jobsResponse.json()).jobs||[];
          const steps=jobs.flatMap(job=>job.steps||[]);
          const active=steps.find(step=>step.status==="in_progress");
          const done=steps.filter(step=>step.status==="completed");
          const current=active?.name||"";
          if (/fairplay_website_runner\.py/i.test(current)) {
            phase="analyzing";progress="Analyzing the collected games and Fair Play periods…";
          } else if (/upload-artifact/i.test(current)||done.some(step=>/fairplay_website_runner\.py/i.test(step.name||""))) {
            phase="uploading";progress="Game analysis complete. Preparing your report…";
          } else if (/pip install|requirements\.txt/i.test(current)) {
            phase="dependencies";progress="Setting up analysis tools…";
          } else if (/setup-python|checkout/i.test(current)) {
            phase="preparing";progress="Preparing the analysis environment…";
          }
        }
      } catch {}
      return json({state:"running",phase,progress});
    }
    if (run.conclusion !== "success") return json({ state: "failed", error: "Analysis could not complete successfully. Please try again." });
    const artifactsResponse = await github(env.GITHUB_TOKEN, "/actions/runs/" + run.id + "/artifacts?per_page=30");
    if (!artifactsResponse.ok) throw new Error("Cannot read artifacts");
    const artifacts = (await artifactsResponse.json()).artifacts || [];
    const artifact = artifacts.find(item => item.name === "v87-result" && !item.expired);
    if (!artifact) return json({ state: "running", progress: "Waiting for the review result artifact…" });
    const zipResponse = await github(env.GITHUB_TOKEN, "/actions/artifacts/" + artifact.id + "/zip");
    if (!zipResponse.ok) throw new Error("Cannot download review result");
    const result = parseStoredZip(await zipResponse.arrayBuffer());
    const sus_proof=await issueReviewProof(result.username,env.GITHUB_TOKEN);
    return json({ state: "complete", result, sus_proof });
  } catch {
    return json({ state: "failed", error: "Unable to retrieve the analysis. Please try again later." }, 502);
  }
}
