# Realtime chess: preview-only rollout and performance gate

This branch adds optional server-push updates for online chess. **Do not merge, deploy to production, or apply production migrations without explicit approval.**

## Threat model and design

- Both peers connect only to EloScanner/Cloudflare, never directly to each other.
- Pages Functions authenticate the game ID and a per-seat bearer secret on the WebSocket upgrade. Registered seats additionally require their current Better Auth session.
- Browser supplies the secret in the WebSocket subprotocol header, **not the URL**. The Pages gateway forwards a newly constructed request containing only a verified seat identifier to the private Durable Object; it never forwards IP, Cookie, bearer header, or source headers.
- One Durable Object instance per game, keyed by game ID. Only server-authoritative, database-committed moves are broadcast. An explicit field allowlist drops private metadata. WebSocket messages from browsers cannot submit moves.
- Existing POST move/resign endpoints remain the **only** mutation path. Server-side move legality, clocks, optimistic concurrency and rate limits remain intact.
- If the Durable Object binding is unavailable, the browser automatically continues with 900 ms active-game polling; if connected, it polls every 10 seconds for recovery/timeout reconciliation.
- The room caps simultaneous connections, rejects unexpected messages and uses the Cloudflare hibernation API.

## Separate Cloudflare deployment required (not done)

Cloudflare Pages **cannot host a Durable Object class itself**. It requires a separately deployed Worker. Configuration provided in `workers/online-room.wrangler.jsonc`; entrypoint `workers/online-room.mjs`.

To enable on a **non-production** environment, a maintainer must deploy the Worker separately, then attach its Durable Object namespace to the Pages preview project as:

```toml
[[durable_objects.bindings]]
name = "ONLINE_ROOM"
class_name = "OnlineChessRoom"
script_name = "eloscanner-online-room"
```

Cloudflare Dashboard > Pages project > Settings > Bindings > Add > Durable Object also works. Use preview-specific configuration and confirm it does not bind production. Redeploy the preview after adding the binding. Do **not** expose a direct public Worker route to the room; its public entrypoint deliberately returns 404.

D1 migrations `0003_online_chess.sql`, `0004_social.sql` and **`0005_online_lag.sql`** must already be applied in the **preview** database before this branch is enabled. Do not apply these to production without permission.

## Measuring the 10 ms server goal

Each successful move response has `Server-Timing: chess;dur=<milliseconds>`. This measures total Pages handler processing (Origin check, rate limits, authentication, D1, legal-move validation, database update). It **does not** include the network round trip or the time to deliver a push to the opponent.

Run local browser tests and collect `Server-Timing` and client observed move-to-opponent latencies at p50/p95/p99. Then repeat with two physically separate networks against the isolated preview with Durable Object enabled. Compare against the target **p95 server handler <= 10 ms**, after warm-up and under realistic concurrent traffic. Do not report the target as achieved without measured evidence.

## Release security gate

1. Verify a guest and account user can connect, reconnect, and resume; cross-origin WebSocket upgrades, wrong seat secrets, and account-session mismatch fail.
2. Verify the WebSocket frame, API bodies, redirect locations, response headers, error messages, logs and browser network requests never disclose a peer IP, cookie or secret.
3. Verify only one move wins simultaneous races, stale frames cannot roll back a finished game, and server clocks remain authoritative.
4. Verify fallback polling when socket is absent, refused, or dropped, and hibernation/reconnection behavior.
5. Benchmark server move processing and end-to-end delivery under network loss, latency and simulated throttling. Run penetration/security review before production readiness.

## Bounded 3+0 lag allowance, heartbeat and premoves

- The room allows a strictly rate-limited read-only `ping`/`pong` exchange. A client collects a smoothed WebSocket RTT; the server never treats a reported RTT as proof of physical network conditions.
- Each confirmed move may receive **at most 80 ms** of clock credit from half of that RTT, subject to **at most 1,200 ms total per seat per 3+0 game**, stored in D1. No extra credit is given when RTT is missing or invalid. A bounded expiration grace prevents the timeout route from racing a move within the small allowed credit window.
- A malicious client can fabricate latency, but it cannot gain more than the fixed 1.2-second total allowance. This is deliberately conservative and **not equivalent to Lichess's mature lag-compensation algorithm**. The client cannot dictate game time or move legality.
- Client heartbeat identifies dead sockets, with an exponential reconnect delay of 1, 2, 4, 8, then 15 seconds. Authoritative state is fetched on reconnection. Polling remains the fallback if the Durable Object is unavailable.
- Optional premoves are queued locally and submitted over the authorized HTTP route **only after** an opponent move is confirmed and the premove is still legal.

## Benchmark definitions

The CI workflow now includes a dedicated local `realtime-websocket` job that starts the actual Cloudflare workerd Durable Object + Pages + D1 and plays moves between two Chromium browser contexts. It reports:

- `serverMs`: handler `Server-Timing`, excluding Internet/network RTT.
- `deliveryMs`: Playwright test-clock click start to receipt of a WebSocket update. Includes automation overhead.
- `transportMs`: browser-side fetch initiation to the opponent's WebSocket message event, both on the same local host clock; excludes Playwright click dispatch but **includes the HTTP API, database, Durable Object and local browser/WebSocket stack**.

These values do not predict Netherlands-to-England or intercontinental production timing. A goal of 10 ms Netherlands-to-Netherlands or 50 ms Netherlands-to-England **cannot be claimed** from local same-host tests. Measure a Cloudflare preview across real networks with 100+ moves, p50/p95/p99, reconnect, throttling and sustained load.

Do not deploy, merge, or apply the new migration to production without explicit approval.
