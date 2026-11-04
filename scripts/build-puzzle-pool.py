#!/usr/bin/env python3
"""Build an offline, lazy-loadable 500,000-puzzle Lichess CC0 bank for Cloudflare Pages.

Run on a GitHub Actions runner, NOT in the user's browser. Only small JSON
shards are requested by players. The complete dataset is never downloaded by
the site visitor. This is deliberately separate from score verification.
"""
import argparse
import csv
import io
import json
import random
import shutil
import urllib.request
from pathlib import Path

SOURCE = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
BANDS = ((400, 999), (1000, 1399), (1400, 1799),
         (1800, 2199), (2200, 2599), (2600, 3500))


def valid_puzzle(row):
    try:
        rating = int(row["Rating"])
        deviation = int(row["RatingDeviation"])
        popularity = int(row["Popularity"])
        plays = int(row["NbPlays"])
        moves = row["Moves"].split()
    except (KeyError, ValueError, TypeError, AttributeError):
        return None
    if not (400 <= rating <= 3500 and deviation <= 200
            and popularity >= 0 and plays >= 10
            and 2 <= len(moves) <= 18
            and row.get("PuzzleId") and row.get("FEN")):
        return None
    return [str(row["PuzzleId"]), str(row["FEN"]), " ".join(moves), rating]


def reservoir(reader, target, seed):
    rng = random.Random(seed)
    selected = []
    eligible = 0
    for record in csv.DictReader(reader):
        row = valid_puzzle(record)
        if not row:
            continue
        eligible += 1
        if len(selected) < target:
            selected.append(row)
        else:
            slot = rng.randrange(eligible)
            if slot < target:
                selected[slot] = row
        if eligible % 1000000 == 0:
            print(f"Qualifying puzzles: {eligible:,}; sampled: {len(selected):,}", flush=True)
    if len(selected) != target:
        raise RuntimeError(f"Only {eligible:,} qualifying puzzles. Need {target:,}.")
    return selected, eligible


def create_shards(selected, out_dir, shard_size, seed, eligible):
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    rng = random.Random(seed + 1)
    buckets = [[] for _ in BANDS]
    for row in selected:
        for idx, (low, high) in enumerate(BANDS):
            if low <= row[3] <= high:
                buckets[idx].append(row)
                break
    manifest = {"version": 1, "source": "Lichess CC0 puzzle database",
                "total": len(selected), "bands": [list(b) for b in BANDS],
                "shards": []}
    shard_id = 0
    for band_index, bucket in enumerate(buckets):
        rng.shuffle(bucket)
        for offset in range(0, len(bucket), shard_size):
            chunk = bucket[offset:offset + shard_size]
            shard_id += 1
            name = f"{shard_id:04d}.json"
            (out_dir / name).write_text(
                json.dumps(chunk, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8")
            manifest["shards"].append({
                "id": shard_id, "band": band_index, "count": len(chunk),
                "min": min(row[3] for row in chunk),
                "max": max(row[3] for row in chunk)})
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(selected):,} unique puzzles, {shard_id} static shards "
          f"({eligible:,} eligible Lichess puzzles scanned).", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=500000)
    parser.add_argument("--shard-size", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=20261104)
    parser.add_argument("--output", default="assets/puzzle-pool")
    parser.add_argument("--input", help="Optional local uncompressed CSV for tests")
    args = parser.parse_args()
    if args.count < 1 or args.shard_size < 1:
        parser.error("Count and shard size must be positive.")
    if args.input:
        with open(args.input, encoding="utf-8", newline="") as file:
            rows, eligible = reservoir(file, args.count, args.seed)
    else:
        import zstandard
        req = urllib.request.Request(SOURCE, headers={
            "User-Agent": "EloScanner-PuzzlePool/1.0"})
        with urllib.request.urlopen(req, timeout=120) as stream:
            with zstandard.ZstdDecompressor().stream_reader(stream) as binary:
                with io.TextIOWrapper(binary, encoding="utf-8", newline="") as text:
                    rows, eligible = reservoir(text, args.count, args.seed)
    ids = set(row[0] for row in rows)
    if len(ids) != len(rows):
        raise RuntimeError("Puzzle sample contains duplicate Lichess IDs.")
    create_shards(rows, Path(args.output), args.shard_size, args.seed, eligible)


if __name__ == "__main__":
    main()
