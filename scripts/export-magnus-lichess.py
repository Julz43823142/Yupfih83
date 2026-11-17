#!/usr/bin/env python3
"""Generate Magnus's authentic v87 sample from a disclosed Lichess account.

Chess.com's public MagnusCarlsen game-archives endpoint returns HTTP 404.
Do not invent Chess.com games or report statistics. The source is Lichess
@DrNykterstein, using only real public rated standard games and PGN clocks.
Lichess and Chess.com rating pools must never be mixed.
"""
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import io
import os
import re
import sys
import time

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'client-v87'))

import chess
import chess.pgn
import fairplay_method3
import fairplay_website_runner

ACCOUNT = 'drnykterstein'
URL = 'https://lichess.org/api/games/user/DrNykterstein'
HEADERS = {'Accept': 'application/x-chess-pgn',
           'User-Agent': 'EloScanner/1.0 (public historical example; eloscanner.com)'}


def public_pgn():
    with requests.Session() as session:
        for attempt in range(5):
            try:
                response = session.get(URL, headers=HEADERS,
                    params={'max': 300, 'clocks': 'true', 'evals': 'false',
                            'opening': 'false', 'rated': 'true',
                            'perfType': 'bullet,blitz,rapid'},
                    timeout=(15, 90))
                if response.status_code in (429, 500, 502, 503, 504):
                    retry = response.headers.get('Retry-After', '')
                    delay = min(45, int(retry) if retry.isdigit() else 2**(attempt+1))
                    print('Lichess export busy, retrying...', flush=True)
                    time.sleep(delay)
                    continue
                response.raise_for_status()
                if len(response.content) > 20_000_000:
                    raise RuntimeError('Public Lichess response exceeded limit')
                return response.text
            except requests.RequestException:
                if attempt == 4:
                    raise
                time.sleep(2**(attempt+1))
    raise RuntimeError('Public Lichess export unavailable')


def export_rows():
    stream = io.StringIO(public_pgn())
    months = defaultdict(list)
    seen = 0
    while True:
        game = chess.pgn.read_game(stream)
        if game is None:
            break
        headers = game.headers
        if game.errors or headers.get('Variant', 'Standard') not in ('Standard', ''):
            continue
        names = [headers.get('White', '').casefold(), headers.get('Black', '').casefold()]
        if names.count(ACCOUNT) != 1:
            continue
        result = headers.get('Result')
        if result not in ('1-0', '0-1', '1/2-1/2'):
            continue
        event = headers.get('Event', '').casefold()
        kind = next((k for k in ('bullet','blitz','rapid') if k in event), None)
        if not kind:
            continue
        control = headers.get('TimeControl', '')
        if not re.fullmatch(r'[0-9]{1,5}\\+[0-9]{1,2}', control):
            continue
        try:
            ended = datetime.strptime(
                headers['UTCDate'] + ' ' + headers.get('UTCTime', '00:00:00'),
                '%Y.%m.%d %H:%M:%S').replace(tzinfo=timezone.utc)
            timestamp = int(ended.timestamp())
            white_rating = int(headers.get('WhiteElo', ''))
            black_rating = int(headers.get('BlackElo', ''))
        except (KeyError, ValueError):
            continue
        if not (100 <= white_rating <= 4000 and 100 <= black_rating <= 4000):
            continue
        game_pgn = str(game)
        outcomes = {'1-0': ('win', 'loss'), '0-1': ('loss','win'),
                    '1/2-1/2': ('draw','draw')}
        white_result, black_result = outcomes[result]
        record = {'rules': 'chess', 'time_class': kind, 'rated': True,
            'time_control': control, 'end_time': timestamp,
            'white': {'username': headers['White'], 'rating': white_rating,
                      'result': white_result},
            'black': {'username': headers['Black'], 'rating': black_rating,
                      'result': black_result},
            'pgn': game_pgn,
            'uuid': 'lichess:' + hashlib.sha256(game_pgn.encode()).hexdigest()[:32]}
        months[ended.strftime('%Y/%m')].append(record)
        seen += 1
    if seen < 50:
        raise RuntimeError('Fewer than 50 valid public Magnus Lichess games')
    print('Verified Lichess PGNs:', seen, 'across', len(months), 'months', flush=True)
    return months


class PublicLichessArchive:
    def __init__(self, deadline):
        self.deadline = deadline
        self.months = export_rows()
        self.fairplay_collection_coverage = {}

    def get(self, target, suffix='', *, profile=False):
        if target != ACCOUNT:
            raise ValueError('Unexpected Lichess account')
        if not suffix:
            return {'username': ACCOUNT}
        if suffix == '/games/archives':
            return {'archives': [
                'https://api.chess.com/pub/player/' + ACCOUNT + '/games/' + month
                for month in sorted(self.months)
            ]}
        match = re.fullmatch(r'/games/([0-9]{4}/[0-9]{2})', suffix)
        if match:
            return {'games': self.months.get(match[1], [])}
        raise ValueError('Unsupported local archive lookup')


def run():
    original = fairplay_website_runner.review
    fairplay_website_runner.review = lambda username, progress: fairplay_method3.review(
        username, progress, api_factory=PublicLichessArchive)
    os.environ['CHESS_USERNAME'] = ACCOUNT
    try:
        fairplay_website_runner.main()
    finally:
        fairplay_website_runner.review = original


if __name__ == '__main__':
    run()
