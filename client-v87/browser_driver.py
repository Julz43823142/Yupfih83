"""Run the unmodified v87 Method 3 and website renderer inside Pyodide.

Chess.com JSON is fetched asynchronously by the dedicated browser Web Worker.
This adapter supplies it to the original synchronous collection path, without
executing any fair-play calculation on Cloudflare or GitHub runners.
"""
import json

from fairplay_method3 import review
from fairplay_website_runner import chart_samples, opening_summary, clean
from js import progressFromPython


def scan_player(username, profile_json, manifest_json, archives_json):
    profile_data = json.loads(profile_json)
    manifest_data = json.loads(manifest_json)
    archive_data = json.loads(archives_json)

    class BrowserPubAPI:
        def __init__(self, deadline):
            self.deadline = deadline
            self.fairplay_collection_coverage = {}

        def get(self, target, suffix="", *, profile=False):
            if suffix == "":
                return profile_data
            if suffix == "/games/archives":
                return manifest_data
            return archive_data.get(suffix)

        def close(self):
            pass

    result = review(username, progress=lambda message: progressFromPython(str(message)),
                    api_factory=BrowserPubAPI)
    payload = {
        "version": result.version,
        "username": result.username,
        "priority": result.priority,
        "confidence": result.confidence,
        "games": len(result.games),
        "elapsed_seconds": clean(result.elapsed),
        "selected_games": result.selected_games,
        "partial": result.partial,
        "reasons": clean(result.reasons),
        "method3": clean((result.diagnostics or {}).get("method3") or {}),
        "engine_used": False,
        "charts": clean(chart_samples(result.games)),
        "opening_summary": clean(opening_summary(result.games))
    }
    return json.dumps(payload, ensure_ascii=True, allow_nan=False)
