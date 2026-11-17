#!/usr/bin/env python3
"""Publish truthful, static EloScanner example snapshots using the current v87 exporter."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import requests

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'assets'/'example-reports'
USERS={'MagnusCarlsen':'magnus-carlsen','Hikaru':'hikaru-nakamura'}

def read_json(session,url):
    for attempt in range(5):
        try:
            response=session.get(url,timeout=30,headers={'Accept':'application/json'})
            if response.status_code in (429,500,502,503,504):
                time.sleep(min(20,2**attempt*2))
                continue
            response.raise_for_status()
            return response.json()
        except (requests.RequestException,ValueError):
            if attempt==4:raise
            time.sleep(min(20,2**attempt*2))
    raise RuntimeError('Chess.com unavailable')

def report_insights(report):
    """Use the same verified games already included in the v87 export.
    Avoid downloading thousands of archives a second time.
    """
    rows=[]
    for kind in ('rapid','blitz','bullet'):
        for game in report.get('charts',{}).get(kind,[]):
            score=game.get('actual_score')
            if score not in (0,50,100):continue
            ended=game.get('ended')
            if not isinstance(ended,(int,float)) or ended<=0:continue
            rows.append({'result':{0:'loss',50:'draw',100:'win'}[score],
                         'color':'Unknown','tc':kind,'date':ended,
                         'rating':game.get('player_elo')})
    return sorted(rows,key=lambda g:g['date'],reverse=True)


def generate(username,slug):
    print('Generating '+username,flush=True)
    source={'platform':'chess.com','account':username.lower()}
    env={**os.environ,'CHESS_USERNAME':username}
    runner=(ROOT/'scripts'/'export-magnus-chesscom.py' if username=='MagnusCarlsen' else ROOT/'client-v87'/'fairplay_website_runner.py')
    subprocess.run([sys.executable,str(runner)],
                   cwd=ROOT,env=env,check=True,timeout=1200)
    report=json.loads((ROOT/'v87-result.json').read_text())
    if report.get('version')!='fairplay-v87-review-reliability' or report.get('username')!=source['account'] or report.get('games',0)<1:
        raise RuntimeError('Incomplete or invalid v87 report: '+username)
    with requests.Session() as session:
        session.headers.update({'User-Agent':'EloScanner/1.0 (public example reports; eloscanner.com)'})
        base='https://api.chess.com/pub/player/'+username.lower()
        profile=read_json(session,base)
        stats=read_json(session,base+'/stats')
        insights=report_insights(report)
    if not insights:raise RuntimeError('No valid report observations for '+username)
    if report['games']>5000:raise RuntimeError('Exceeded 5000-game sample limit')
    # The huge per-subject diagnostic trace is not used by any website renderer.
    # Keep all displayed v87 metrics, selected periods, charts, opening and trends.
    if isinstance(report.get('method3'),dict):
        report['method3'].pop('subject',None)
    OUTPUT.mkdir(parents=True,exist_ok=True)
    payload={'schema':3,'username':username.lower(),'source':source,
             'generatedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
             'profile':profile,'stats':stats,'report':report,'insights':insights}
    target=OUTPUT/(slug+'.json')
    target.write_text(json.dumps(payload,separators=(',',':'),ensure_ascii=True))
    print('Wrote '+str(target)+' games='+str(report['games'])+' bytes='+str(target.stat().st_size),flush=True)

if __name__=='__main__':
    if len(sys.argv)!=2 or sys.argv[1] not in USERS:
        raise SystemExit('Usage: generate-example-reports.py MagnusCarlsen|Hikaru')
    generate(sys.argv[1],USERS[sys.argv[1]])
