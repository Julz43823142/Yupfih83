"""Export original engine-free v87 review to a short-lived Actions artifact."""
import json
import math
import os

from fairplay_method3 import review, observations
from fairplay_deviation_display import suspicion_score


def clean(value, depth=0):
    if depth > 12:
        return None
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, (tuple, list)):
        return [clean(item, depth + 1) for item in value[:1200]]
    if isinstance(value, dict):
        return {str(key): clean(item, depth + 1) for key, item in list(value.items())[:300]}
    return str(value)


def chart_samples(games):
    """Return truthful game-numbered chart observations and descriptive rolling trends."""
    from collections import deque
    from statistics import mean, median
    grouped = observations(games)
    ordered = sorted(games, key=lambda g: (g.ended, g.identity))
    by_control = {name: [] for name in ("rapid", "blitz", "bullet")}
    for game in ordered:
        if game.time_class in by_control:
            by_control[game.time_class].append(game)
    sampled = {}
    for kind, rows in grouped.items():
        full = []
        score_window = deque(maxlen=10)
        accuracy_window = deque(maxlen=30)
        timing_window = deque(maxlen=30)
        for row, game in zip(rows, by_control[kind]):
            item = dict(row)
            item["ended"] = game.ended
            phases = {"early": [], "middle": [], "late": [], "pressure": [], "normal": []}
            for decision in game.decisions:
                think = getattr(decision, "think", None)
                if getattr(decision, "clock_valid", False) is not True or not isinstance(think, (int, float)) or not math.isfinite(think) or think < 0 or think >= 120:
                    continue
                move = getattr(decision, "fullmove", None)
                if type(move) is int and move > 0:
                    phases["early" if move <= 10 else "middle" if move <= 30 else "late"].append(think)
                before = getattr(decision, "clock_before", None)
                if isinstance(before, (int, float)) and math.isfinite(before):
                    if 0 <= before < 10:
                        phases["pressure"].append(think)
                    elif before >= 30:
                        phases["normal"].append(think)
            for phase in ("early", "middle", "late"):
                item[phase + "_think_seconds"] = median(phases[phase]) if len(phases[phase]) >= 5 else None
            normal = median(phases["normal"]) if phases["normal"] else None
            item["pressure_ratio"] = median(phases["pressure"]) / normal if phases["pressure"] and normal is not None and normal >= .25 else None
            player, opponent = game.rating, game.opponent_rating
            valid = (game.rated is True and
                     all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0
                         for v in (player, opponent)) and
                     game.score in (0, 0.5, 1))
            item["actual_score"] = game.score * 100 if valid else None
            item["expected_score"] = (
                100 / (1 + 10 ** ((opponent - player) / 400)) if valid else None)
            score_window.append((item["actual_score"], item["expected_score"]))
            matched = [(a, e) for a, e in score_window if a is not None and e is not None]
            item["rolling_observed"] = mean(a for a, _ in matched) if len(matched) >= 8 else None
            item["rolling_expected"] = mean(e for _, e in matched) if len(matched) >= 8 else None
            accuracy_window.append(item.get("official_accuracy"))
            good_accuracy = [v for v in accuracy_window if isinstance(v, (int,float)) and math.isfinite(v)]
            item["accuracy_mean_30"] = mean(good_accuracy) if len(good_accuracy) >= 5 else None
            timing_window.append(item.get("median_think_seconds"))
            good_timing = [v for v in timing_window if isinstance(v, (int,float)) and math.isfinite(v)]
            item["timing_mean_30"] = mean(good_timing) if len(good_timing) >= 5 else None
            full.append(item)
        stride = max(1, math.ceil(len(full) / 1000))
        selected = full[::stride][:1000]
        if full and selected and selected[-1] is not full[-1]:
            selected[-1] = full[-1]
        sampled[kind] = selected
    return sampled



def rolling_winrate_samples(games):
    """Pooled completed-game win rate, matching the Discord 50-game window."""
    ordered = sorted((g for g in games if g.time_class in ("rapid", "blitz", "bullet")), key=lambda g: (g.ended, g.identity))
    window = []
    rows = []
    for i, game in enumerate(ordered):
        score = game.score if type(game.score) in (int, float) and game.score in (0, .5, 1) else None
        window.append(score)
        if len(window) > 50:
            window.pop(0)
        if (i + 1) % 5 and i != len(ordered) - 1:
            continue
        known = [x for x in window if x is not None]
        rows.append({"game": i + 1, "ended": game.ended, "win_rate": 100 * sum(x == 1 for x in known) / len(known) if len(known) >= 10 and len(known) / len(window) >= .6 else None})
    return rows


def opening_summary(games):
    """Descriptive opening repertoire, using the same UCI choice groups as Method 3."""
    from collections import Counter
    from fairplay_method3_opening_shift import opening_choice
    output = {}
    for kind in ("rapid", "blitz", "bullet"):
        grouped = {}
        for game in games:
            if game.time_class != kind:
                continue
            choice = opening_choice(game)
            if not choice:
                continue
            (time_class, control, color, family), name = choice
            label = color.title() + " · " + family
            grouped.setdefault(label, Counter())[name] += 1
        output[kind] = [
            {"group": label, "total": sum(counter.values()),
             "choices": [{"name": name, "games": count}
                         for name, count in counter.most_common()]}
            for label, counter in sorted(grouped.items(),
                key=lambda entry: sum(entry[1].values()), reverse=True)
        ]
    return output


def main():
    username = os.environ["CHESS_USERNAME"]
    result = review(username, progress=lambda message: print(str(message)[:160], flush=True))
    payload = {
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
    with open("v87-result.json", "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=True)
    print("v87 review complete; JSON artifact generated.")


if __name__ == "__main__":
    main()
