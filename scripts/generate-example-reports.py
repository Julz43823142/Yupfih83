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
DRAWS={'agreed','repetition','stalemate','insufficient','50move','timevsinsufficient'}

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

def fetch_insights(session,username):
    base='https://api.chess.com/pub/player/'+username.lower()
    archives=read_json(session,base+'/games/archives').get('archives',[])
    rows=[]
    for address in reversed(archives):
        if not address.startswith(base+'/games/'):continue
        try:
            monthly=read_json(session,address)
        except requests.RequestException:
            continue
        for game in monthly.get('games',[]):
            if game.get('rules')!='chess':continue
            white=(game.get('white') or {}).get('username','').lower()==username.lower()
            black=(game.get('black') or {}).get('username','').lower()==username.lower()
            if not (white or black):continue
            own=game['white' if white else 'black']
            opponent=game['black' if white else 'white']
            own_result=own.get('result')
            outcome='win' if own_result=='win' else 'draw' if own_result in DRAWS else 'loss' if opponent.get('result')=='win' else None
            if outcome is None:continue
            rows.append({'result':outcome,'color':'White' if white else 'Black',
                         'tc':game.get('time_class') or 'other',
                         'date':game.get('end_time') or 0,
                         'rating':own.get('rating') if isinstance(own.get('rating'),int) else None})
        if len(rows)>=5500:break
        time.sleep(.5)
    rows.sort(key=lambda g:g['date'],reverse=True)
    return rows[:5000]

def generate(username,slug):
    print('Generating '+username,flush=True)
    env={**os.environ,'CHESS_USERNAME':username}
    subprocess.run([sys.executable,str(ROOT/'client-v87'/'fairplay_website_runner.py')],
                   cwd=ROOT,env=env,check=True,timeout=1200)
    report=json.loads((ROOT/'v87-result.json').read_text())
    if report.get('version')!='fairplay-v87-review-reliability' or report.get('username')!=username.lower() or report.get('games',0)<1:
        raise RuntimeError('Incomplete or invalid v87 report: '+username)
    with requests.Session() as session:
        base='https://api.chess.com/pub/player/'+username.lower()
        profile=read_json(session,base)
        stats=read_json(session,base+'/stats')
        insights=fetch_insights(session,username)
    if not insights:raise RuntimeError('No trustworthy game insights for '+username)
    OUTPUT.mkdir(parents=True,exist_ok=True)
    payload={'schema':1,'username':username.lower(),
             'generatedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
             'profile':profile,'stats':stats,'report':report,'insights':insights}
    target=OUTPUT/(slug+'.json')
    target.write_text(json.dumps(payload,separators=(',',':'),ensure_ascii=True))
    print('Wrote '+str(target)+' games='+str(report['games'])+' bytes='+str(target.stat().st_size),flush=True)

if __name__=='__main__':
    for username,slug in USERS.items():generate(username,slug)
