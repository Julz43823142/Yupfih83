"""Create genuine precomputed 5,000-game Chess.com v87 example reports.

Run this off-line in CI. Never re-label short/Lichess snapshots as complete reviews.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "client-v87"))
os.chdir(ROOT / "client-v87")

import requests  # noqa: E402
from fairplay_method3 import review  # noqa: E402
from fairplay_deviation_display import suspicion_score  # noqa: E402
from fairplay_website_runner import clean, chart_samples, rolling_winrate_samples, opening_summary  # noqa: E402

EXAMPLES = {
    "hikaru": ("Hikaru", "hikaru-nakamura"),
    "magnuscarlsen": ("MagnusCarlsen", "magnus-carlsen"),
}

def get_chesscom(url: str) -> dict:
    response = requests.get(url, timeout=40, headers={"User-Agent": "EloScanner-example-report-builder/1.0", "Accept": "application/json"})
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
        raise ValueError("Expected Chess.com JSON object")
    return data

def build(account: str) -> None:
    if account not in EXAMPLES:
        raise ValueError("Unsupported example account")
    shown, slug = EXAMPLES[account]
    os.environ.pop("ELO_EXAMPLE_MAX_GAMES", None)
    result = review(account, progress=lambda msg: print(str(msg)[:200], flush=True))
    games = sorted(result.games, key=lambda g: (g.ended, g.identity), reverse=True)
    if len(games) != 5000:
        raise RuntimeError(
            f"Refusing incomplete example report for chess.com/@{account}: "
            f"{len(games)} actual parsed games, expected 5000. "
            "No short snapshot will be shipped."
        )
    profile = get_chesscom(f"https://api.chess.com/pub/player/{account}")
    if str(profile.get("username", "")).lower() != account:
        raise ValueError("Chess.com profile does not match requested username")
    stats = get_chesscom(f"https://api.chess.com/pub/player/{account}/stats")
    report = {
        "version": result.version,
        "username": result.username,
        "priority": result.priority,
        "confidence": result.confidence,
        "review_index": suspicion_score(result),
        "games": len(result.games),
        "elapsed_seconds": clean(result.elapsed),
        "selected_games": result.selected_games,
        "partial": result.partial,
        "reasons": clean(result.reasons),
        "method3": clean((result.diagnostics or {}).get("method3") or {}),
        "engine_used": False,
        "charts": clean(chart_samples(result.games)),
        "rolling_winrate": clean(rolling_winrate_samples(result.games)),
        "opening_summary": clean(opening_summary(result.games)),
    }
    insights = [
        {
            "date": g.ended,
            "tc": g.time_class,
            "result": "win" if g.score == 1 else "draw" if g.score == 0.5 else "loss",
            "color": "White" if g.color else "Black",
            "rating": g.rating,
        } for g in games
    ]
    totals = dict(Counter(g.time_class for g in games))
    document = {
        "schema": 2,
        "username": shown.lower(),
        "source": {"platform": "chess.com", "account": account},
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
        "stats": stats,
        "report": report,
        "insights": insights,
        "sample": {
            "requestedGames": 5000,
            "actualGames": len(games),
            "timeControls": totals,
            "latestEndTime": games[0].ended,
            "earliestEndTime": games[-1].ended,
        },
    }
    target = ROOT / "assets" / "example-reports-v2" / f"{slug}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"Validated and saved {account}: {len(games)} real Chess.com games, {target.stat().st_size} bytes", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("account", choices=tuple(EXAMPLES))
    args = parser.parse_args()
    build(args.account)
