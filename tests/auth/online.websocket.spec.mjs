import { test, expect } from '@playwright/test';

const base = 'http://localhost:8788';
const moves = [
  ['e2','e4','e4'], ['e7','e5','e5'], ['g1','f3','Nf3'],
  ['b8','c6','Nc6'], ['f1','c4','Bc4'], ['g8','f6','Nf6'],
  ['d2','d3','d3'], ['f8','c5','Bc5'], ['c2','c3','c3'],
  ['d7','d6','d6'], ['e1','g1','O-O'], ['e8','g8','O-O']
];
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.ceil(sorted.length*fraction)-1];
};

test('real local Durable Object WebSockets deliver 12 chess moves without waiting for polling', async ({browser}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pages = [await a.newPage(),await b.newPage()];
  const networkErrors = [];
  try {
    for(const p of pages){
      p.on('pageerror',error=>networkErrors.push(error.message));
      await p.addInitScript(() => {
        const Native = window.WebSocket;
        window.__eloWsOpened = false;
        window.__eloWsOpenCount = 0;
        window.__eloWsPongCount = 0;
        window.__eloWsCloseCount = 0;
        window.__eloWsSockets = [];
        window.__eloWsEvents = [];
        window.__eloSentMoves = [];
        const nativeFetch=window.fetch.bind(window);
        window.fetch=(url,options)=>{
          if(typeof url==='string'&&url.includes('/api/online/move')&&typeof options?.body==='string'){
            try{
              const body=JSON.parse(options.body);
              window.__eloSentMoves.push({from:body.from,to:body.to,at:Date.now()});
            }catch{}
          }
          return nativeFetch(url,options);
        };
        window.WebSocket = class extends Native {
          constructor(...args) {
            super(...args);
            window.__eloWsSockets.push(this);
            this.addEventListener('open',()=>{ window.__eloWsOpened = true;window.__eloWsOpenCount++ });
            this.addEventListener('close',()=>{ window.__eloWsCloseCount++ });
            this.addEventListener('message',event=>{
              try {
                const data=JSON.parse(event.data);
                if(data.type === 'pong') window.__eloWsPongCount++;
                if(data.type === 'state' && data.game?.moves)
                  window.__eloWsEvents.push({at:Date.now(),moves:data.game.moves,status:data.game.status});
              } catch {}
            });
          }
        };
      });
    }
    const [white,black]=pages;
    await white.goto(base+'/online.html?friend=1');
    await white.locator('#online-name').fill('SocketAlice');
    await white.getByRole('button',{name:'Play a Friend · Send a Link'}).click();
    await expect(white.locator('#online-link')).toHaveValue(/invite=[a-f0-9]{32}/,{timeout:15000});
    const invite=await white.locator('#online-link').inputValue();
    expect(invite).toContain('?invite=');
    await black.goto(invite);
    await black.locator('#online-name').fill('SocketBob');
    await black.getByRole('button',{name:'Join game'}).click();
    await expect(white.locator('#online-status')).toContainText('Your move',{timeout:25000});
    await expect(black.locator('#online-status')).toContainText('Opponent to move',{timeout:25000});
    for(const p of pages) await expect.poll(()=>p.evaluate(()=>window.__eloWsOpened),{timeout:20000}).toBe(true);
    // The room must reply to an actual socket ping before we claim measured RTT.
    for(const p of pages) await expect.poll(()=>p.evaluate(()=>window.__eloWsPongCount),{timeout:12000}).toBeGreaterThan(0);
    const delivery=[];
    const transport=[];
    const server=[];
    for(let index=0;index<moves.length;index++){
      const [from,to,san]=moves[index];
      const me=pages[index%2],other=pages[1-index%2];
      const started=Date.now();
      const response=me.waitForResponse(r=>r.url().includes('/api/online/move'),{timeout:20000});
      await me.locator('#online-board button[data-sq="'+from+'"]').click();
      await me.locator('#online-board button[data-sq="'+to+'"]').click();
      const done=await response;
      expect(done.status()).toBe(200);
      const timing=await done.headerValue('Server-Timing');
      server.push(Number(/chess;dur=([\d.]+)/.exec(timing)[1]));
      await expect.poll(()=>other.evaluate(n=>window.__eloWsEvents.some(e=>e.moves.length>=n),index+1),{timeout:15000}).toBe(true);
      const received=await other.evaluate(n=>window.__eloWsEvents.find(e=>e.moves.length===n)?.at,index+1);
      expect(received).toBeGreaterThanOrEqual(started);
      const ms=received-started;
      delivery.push(ms);
      // Eliminate Playwright's two click commands from the transport figure.
      // Both Chromium contexts share one test-host wall clock.
      const sent=await me.evaluate(({from,to})=>window.__eloSentMoves.findLast(m=>m.from===from&&m.to===to)?.at,{from,to});
      expect(sent).toBeGreaterThan(0);
      const wire=received-sent;
      expect(wire).toBeGreaterThanOrEqual(0);
      transport.push(wire);
      await expect(other.locator('#online-moves')).toContainText(san,{timeout:15000});
      if(index===5){
        // Force a dropped browser socket midgame. The exponential retry
        // must reconnect and sync before subsequent moves.
        await other.evaluate(()=>window.__eloWsSockets.at(-1).close());
        try{
          await expect.poll(()=>other.evaluate(()=>window.__eloWsOpenCount),{timeout:15000}).toBeGreaterThanOrEqual(2);
        }catch(error){
          console.log('WEBSOCKET RECONNECT DIAGNOSTICS',JSON.stringify(await other.evaluate(()=>({
            closes:window.__eloWsCloseCount,opens:window.__eloWsOpenCount,
            readyStates:window.__eloWsSockets.map(x=>x.readyState),
            urls:window.__eloWsSockets.map(x=>new URL(x.url).pathname)
          }))));
          throw error;
        }
        await expect.poll(()=>other.evaluate(()=>window.__eloWsSockets.at(-1).readyState),{timeout:15000}).toBe(1);
      }
    }
    console.log('REAL LOCAL WEBSOCKET 12 MOVES:',JSON.stringify({
      serverMs:server,deliveryMs:delivery,transportMs:transport,
      serverP50:percentile(server,.50),serverP95:percentile(server,.95),
      deliveryP50:percentile(delivery,.50),deliveryP95:percentile(delivery,.95),
      transportP50:percentile(transport,.50),transportP95:percentile(transport,.95),
      note:'Local loopback browser fetch-start to opponent WebSocket event on the SAME host; not real internet latency.'
    }));
    expect(networkErrors).toEqual([]);
  } finally {await a.close();await b.close()}
});
