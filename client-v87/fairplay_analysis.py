"""Minimal v87 ReviewResult data model for the browser.
The original fairplay_analysis.py also imports engine-only modules. The engine
is never used by Method 3, so only its unmodified result schema is bundled.
"""
from dataclasses import dataclass, field
from fairplay_data import GameSample
from fairplay_config import VERSION

@dataclass
class ReviewResult:
    username: str
    games: list[GameSample]
    selected_games: int
    skipped: dict
    partial: bool
    engine: str
    totals: dict
    classes: dict
    performance: dict
    context: dict
    families: dict
    priority: str
    confidence: str
    reasons: list[str]
    deep_confirmed: bool
    deep_coverage: dict
    elapsed: float
    version: str = VERSION
    timing: dict = field(default_factory=dict)
    clusters: dict = field(default_factory=dict)
    coverage: dict = field(default_factory=dict)
    diagnostics: dict = field(default_factory=dict)
    history: dict = field(default_factory=dict)
    timeline: list[GameSample] = field(default_factory=list)
