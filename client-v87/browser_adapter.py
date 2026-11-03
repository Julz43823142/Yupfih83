"""Run original v87 website exporter on public data fetched by the browser.
No GitHub jobs or Python HTTP requests occur in this adapter.
"""
import json
import os
from pathlib import Path
from js import v87Progress
import fairplay_website_runner

class BrowserArchiveNotReady(Exception):
    pass

_snapshot = None

class BrowserPubAPI:
    def __init__(self, deadline):
        self.deadline = deadline
        self.fairplay_collection_coverage = None

    def get(self, target, suffix='', *, profile=False):
        if suffix == '':
            return _snapshot['profile']
        if suffix == '/games/archives':
            return _snapshot['manifest']
        archives = _snapshot['archives']
        if suffix in archives:
            return archives[suffix]
        # Do not raise ReviewError: upstream treats that as missing coverage.
        raise BrowserArchiveNotReady('BROWSER_ARCHIVE_NOT_READY:' + suffix)

    def close(self):
        pass

def run(username):
    global _snapshot
    _snapshot = json.loads(Path('/home/pyodide/v87-input.json').read_text(encoding='utf-8'))
    original_review = fairplay_website_runner.review

    def browser_review(name, progress):
        def on_progress(message):
            progress(message)
            v87Progress(str(message))
        return original_review(name, progress=on_progress, api_factory=BrowserPubAPI)

    fairplay_website_runner.review = browser_review
    os.environ['CHESS_USERNAME'] = username
    try:
        # Unmodified v87 exporter: same scores, graphs and JSON contract.
        fairplay_website_runner.main()
    finally:
        fairplay_website_runner.review = original_review
        _snapshot = None
