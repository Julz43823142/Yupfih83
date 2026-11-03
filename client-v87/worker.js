/* EloScanner browser-only Fair Play v87.
 * Original Python source runs locally in Pyodide inside this dedicated Worker.
 * Neither Chess.com archives nor analysis results are sent to GitHub.
 */
"use strict";

const ROOT = "/client-v87/";
const RELEASE = "20261103-browser-v87-1";
const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const SOURCES = [
  "chess/__init__.py",
  "chess/pgn.py",
  "chess/engine.py",
  "chess/svg.py",
  "fairplay_analysis.py",
  "fairplay_config.py",
  "fairplay_data.py",
  "fairplay_timing.py",
  "fairplay_opening.py",
  "fairplay_outcome_study.py",
  "fairplay_method3_windows.py",
  "fairplay_method3_coverage.py",
  "fairplay_method3_reliability.py",
  "fairplay_method3_accuracy_frequency.py",
  "fairplay_method3_review_triage.py",
  "fairplay_method3_history.py",
  "fairplay_method3_context.py",
  "fairplay_method3_opening_shift.py",
  "fairplay_method3.py",
  "fairplay_website_runner.py",
  "assets/fairplay/opening-lines.json"
];

let busy = false;
let pyodidePromise = null;

function progress(message, phase) {
  self.postMessage({
    type: "progress",
    phase: phase || "analyzing",
    progress: String(message || "Analyzing public chess games…").slice(0, 220)
  });
}

self.progressFromPython = function(message) {
  progress(message, "analyzing");
};

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getResponse(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (options && options.timeout) || 25000);
  try {
    return await fetch(url, {
      credentials: "omit",
      mode: "cors",
      cache: "no-store",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getJSON(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await getResponse(url, {timeout: 25000});
      if (response.status === 404) throw new Error("Chess.com profile or archive was not found.");
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 2) throw new Error("Chess.com is busy. Try again later.");
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delay = Number.isFinite(retryAfter) && retryAfter >= 0 && retryAfter <= 30
          ? Math.max(1000, retryAfter * 1000) : 1500 * Math.pow(2, attempt);
        await pause(delay);
        continue;
      }
      if (!response.ok) throw new Error("Chess.com API returned HTTP " + response.status + ".");
      const data = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Chess.com returned an invalid response.");
      }
      return data;
    } catch (error) {
      if (attempt === 2 || /not found|returned HTTP|invalid response|is busy/i.test(String(error.message))) {
        throw error;
      }
      await pause(1000 * Math.pow(2, attempt));
    }
  }
  throw new Error("Chess.com is unavailable.");
}

async function getSource(path) {
  const response = await getResponse(ROOT + path + "?v=" + RELEASE, {timeout: 30000});
  if (!response.ok) throw new Error("The local analysis code is unavailable (" + path + ").");
  return response.text();
}

async function loadPython() {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async function() {
    progress("Loading the original v87 engine onto your device…", "preparing");
    importScripts(PYODIDE_CDN + "pyodide.js");
    const pyodide = await self.loadPyodide({indexURL: PYODIDE_CDN});

    progress("Preparing local chess analysis modules…", "dependencies");
    const files = await Promise.all(SOURCES.map(async path => [path, await getSource(path)]));
    pyodide.FS.mkdirTree("/home/pyodide/client-v87");
    for (const [path, source] of files) {
      const fullName = "/home/pyodide/client-v87/" + path;
      const directory = fullName.slice(0, fullName.lastIndexOf("/"));
      pyodide.FS.mkdirTree(directory);
      pyodide.FS.writeFile(fullName, source, {encoding: "utf8"});
    }
    // Only PubAPI uses requests, for synchronous HTTP in the old runner.
    // BrowserPubAPI replaces that class; all game parsing/statistics stay original.
    pyodide.runPython(
      "import sys, types\n" +
      "sys.path.insert(0, '/home/pyodide/client-v87')\n" +
      "requests_stub = types.ModuleType('requests')\n" +
      "requests_stub.RequestException = OSError\n" +
      "sys.modules['requests'] = requests_stub\n"
    );
    pyodide.runPython(await getSource("browser_driver.py"));
    return pyodide;
  })();
  return pyodidePromise;
}

function eligibleCandidate(row, username) {
  if (!row || typeof row !== "object") return false;
  if (row.rules && row.rules !== "chess") return false;
  if (!["rapid", "blitz", "bullet"].includes(row.time_class)) return false;
  if (typeof row.rated !== "boolean") return false;
  if (!(Number.isFinite(row.end_time) && row.end_time > 0)) return false;
  if (typeof row.pgn !== "string" || !row.pgn.trim()) return false;
  const white = row.white && String(row.white.username || "").toLowerCase() === username;
  const black = row.black && String(row.black.username || "").toLowerCase() === username;
  if (white === black) return false;
  if (!row.white.result || !row.black.result ||
      row.white.result === "abandoned" || row.black.result === "abandoned") return false;
  return true;
}

async function loadArchives(username) {
  const api = "https://api.chess.com/pub/player/" + encodeURIComponent(username);
  progress("Getting the Chess.com archive list directly on your device…", "collecting");
  const manifest = await getJSON(api + "/games/archives");
  const pattern = new RegExp("^https://api\\.chess\\.com/pub/player/" +
    username + "/games/[0-9]{4}/(0[1-9]|1[0-2])$", "i");
  const urls = [...new Set(
    (Array.isArray(manifest.archives) ? manifest.archives : [])
      .filter(address => typeof address === "string" && pattern.test(address))
  )].sort().reverse().slice(0, 240);

  if (!urls.length) throw new Error("No public Chess.com archives are available.");
  const cache = {};
  let next = 0;
  let eligible = 0;

  async function loadMore(minimumAdditionalCandidates) {
    const threshold = eligible + minimumAdditionalCandidates;
    do {
      const url = urls[next++];
      progress("Downloading public games locally · " + next + "/" + urls.length +
        " months", "collecting");
      let archive;
      try {
        archive = await getJSON(url);
      } catch (error) {
        // The original v87 collector marks this month as incomplete,
        // rather than fabricating missing games or suspicion.
        archive = null;
      }
      const match = /\/games\/([0-9]{4})\/(0[1-9]|1[0-2])$/i.exec(url);
      if (match) {
        cache["/games/" + match[1] + "/" + match[2]] = archive;
      }
      const rows = archive && Array.isArray(archive.games) ? archive.games : [];
      eligible += rows.filter(row => eligibleCandidate(row, username)).length;
    } while (next < urls.length && eligible < threshold);
  }

  // Allow a margin for invalid/duplicate games before the original parser
  // selects the newest 5,000 valid observations.
  while (next < urls.length && eligible < 5500) {
    await loadMore(Math.max(1, 5500 - eligible));
  }

  return {
    manifest: manifest,
    cache: cache,
    get remaining() { return next < urls.length; },
    async fetchMore() {
      await loadMore(1000);
    }
  };
}

async function runReview(username, profile) {
  if (!/^[a-z0-9_-]{3,25}$/.test(username)) throw new Error("Invalid Chess.com username.");
  const [pyodide, archives] = await Promise.all([loadPython(), loadArchives(username)]);
  const scan = pyodide.globals.get("scan_player");
  if (!scan) throw new Error("Local v87 analysis is unavailable.");

  try {
    let result;
    for (let pass = 0; pass < 4; pass++) {
      progress("Calculating the original Fair Play v87 statistics on this device…", "analyzing");
      const json = scan(username,
        JSON.stringify(profile),
        JSON.stringify(archives.manifest),
        JSON.stringify(archives.cache));
      result = JSON.parse(json);
      if (result.games >= 5000 || !archives.remaining) break;
      progress("Collecting more games to preserve the complete v87 sample…", "collecting");
      await archives.fetchMore();
    }
    if (!result) throw new Error("Local analysis returned no report.");
    if (archives.remaining && result.games < 5000) {
      // Never label incomplete local sample as a full review.
      result.partial = true;
      result.reasons = Array.isArray(result.reasons) ? result.reasons : [];
      result.reasons.push("Local archive collection stopped before all older months could be checked.");
    }
    return result;
  } finally {
    if (typeof scan.destroy === "function") scan.destroy();
  }
}

self.addEventListener("message", async event => {
  const msg = event.data || {};
  if (msg.type !== "review" || busy) return;
  busy = true;
  try {
    const username = String(msg.username || "").trim().toLowerCase();
    const profile = msg.profile;
    if (!profile || typeof profile !== "object") throw new Error("A verified Chess.com profile is required.");
    const result = await runReview(username, profile);
    self.postMessage({type: "complete", result});
  } catch (error) {
    self.postMessage({
      type: "error",
      error: String(error && error.message || "Local analysis could not finish.").slice(0, 260)
    });
  } finally {
    busy = false;
  }
});
