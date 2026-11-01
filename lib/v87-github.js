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
  const decoder = new TextDecoder();
  // Read the ZIP central directory; streaming ZIP writers may omit sizes in local headers.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("Invalid ZIP archive");
  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50) break;
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.slice(pos + 46, pos + 46 + nameLength));
    if (name.endsWith("v87-result.json")) {
      if (method !== 0) throw new Error("Expected stored result ZIP entry");
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Invalid ZIP entry");
      const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      if (start + compressedSize > bytes.length) throw new Error("Truncated result archive");
      return JSON.parse(decoder.decode(bytes.slice(start, start + compressedSize)));
    }
    pos += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("Result JSON not found in archive");
}
export { json, github, listRuns, matchingRun, parseStoredZip, MAX_ACTIVE };
