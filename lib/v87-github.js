const OWNER = "Julz43823142";
const REPO = "Ydhnd902137812";
const WORKFLOW = "fairplay-v87-website.yml";
const API = "https://api.github.com";
const MAX_ACTIVE = 10;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
function headers(token) {
  return {
    "Authorization": "Bearer " + token,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "FairPlay-v87-Pages"
  };
}
async function github(token, path, options = {}) {
  const response = await fetch(API + "/repos/" + OWNER + "/" + REPO + path, {
    ...options, headers: { ...headers(token), ...(options.headers || {}) },
    redirect: "follow"
  });
  return response;
}
async function listRuns(token) {
  const response = await github(token,
    "/actions/workflows/" + WORKFLOW + "/runs?event=workflow_dispatch&per_page=100");
  if (!response.ok) throw new Error("GitHub runs unavailable (" + response.status + ")");
  return (await response.json()).workflow_runs || [];
}
function matchingRun(runs, id) {
  return runs.find(run => run.display_title === "Fair Play v87 · " + id);
}
function parseStoredZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  // Actions upload-artifact uses a ZIP archive; compression-level 0 stores the JSON uncompressed.
  let pos = 0;
  while (pos + 30 <= bytes.length && view.getUint32(pos, true) === 0x04034b50) {
    const method = view.getUint16(pos + 8, true);
    const compressedSize = view.getUint32(pos + 18, true);
    const filenameLength = view.getUint16(pos + 26, true);
    const extraLength = view.getUint16(pos + 28, true);
    const nameStart = pos + 30;
    const contentStart = nameStart + filenameLength + extraLength;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + filenameLength));
    if (method !== 0 || compressedSize === 0 || contentStart + compressedSize > bytes.length) {
      throw new Error("Unsupported or incomplete result archive");
    }
    if (name.endsWith("v87-result.json")) {
      return JSON.parse(new TextDecoder().decode(bytes.slice(contentStart, contentStart + compressedSize)));
    }
    pos = contentStart + compressedSize;
  }
  throw new Error("Result JSON not found in archive");
}
export { json, github, listRuns, matchingRun, parseStoredZip, MAX_ACTIVE };
