#!/usr/bin/env python3
"""Export genuine MagnusCarlsen Chess.com games when the archive index is absent.

Only fetches Chess.com's official monthly JSON endpoints; no third-party games,
no Lichess data and no fabricated PGNs. Missing months remain missing.
"""
from datetime import datetime, timezone
from pathlib import Path
import os
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'client-v87'))

import fairplay_method3
import fairplay_website_runner
from fairplay_data import PubAPI


class ChessComMonthlyFallback(PubAPI):
    def get(self, target, suffix='', *, profile=False):
        if target.lower()!='magnuscarlsen':
            raise ValueError('Unexpected Chess.com account')
        if suffix=='/games/archives':
            official=super().get(target,suffix)
            if isinstance(official,dict) and official.get('archives'):
                return official
            # Chess.com sometimes omits the public archive index while monthly
            # Chess.com game JSON remains available. Probe recent months only.
            # Nonexistent months are handled by the normal collector as gaps.
            now=datetime.now(timezone.utc)
            months=[]
            for offset in range(72):
                absolute=now.year*12+(now.month-1)-offset
                y,m=divmod(absolute,12)
                if y<2010:break
                months.append(f'https://api.chess.com/pub/player/{target}/games/{y:04d}/{m+1:02d}')
            print('Chess.com archive index missing; probing',len(months),
                  'official monthly endpoints',flush=True)
            return {'archives':list(reversed(months))}
        return super().get(target,suffix,profile=profile)


def main():
    original=fairplay_website_runner.review
    fairplay_website_runner.review=lambda username,progress:fairplay_method3.review(
        username,progress,api_factory=ChessComMonthlyFallback)
    os.environ['CHESS_USERNAME']='MagnusCarlsen'
    try:
        fairplay_website_runner.main()
    finally:
        fairplay_website_runner.review=original


if __name__=='__main__':
    main()
