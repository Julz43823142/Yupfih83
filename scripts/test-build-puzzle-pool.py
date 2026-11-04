"""Smoke checks for the 500k builder without downloading Lichess."""
import importlib.util
import io
import json
import tempfile
from pathlib import Path

path = Path(__file__).with_name("build-puzzle-pool.py")
spec = importlib.util.spec_from_file_location("puzzle_builder", path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

header = "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays\n"
rows = [f"test{i:04d},test-fen-{i},a2a3 b7b6,{400+i*110},60,80,50\n" for i in range(20)]
selected, eligible = mod.reservoir(io.StringIO(header + "".join(rows)), 12, 49)
assert eligible == 20 and len(selected) == 12
assert len({row[0] for row in selected}) == 12
with tempfile.TemporaryDirectory() as directory:
    output = Path(directory)/"shards"
    mod.create_shards(selected, output, 4, 49, eligible)
    manifest = json.loads((output/"manifest.json").read_text())
    assert manifest["total"] == 12
    assert sum(item["count"] for item in manifest["shards"]) == 12
    assert all(len(json.loads((output/f"{item['id']:04d}.json").read_text())) == item["count"]
               for item in manifest["shards"])
    assert all(item["count"] <= 4 for item in manifest["shards"])
print("Puzzle builder smoke tests passed.")
