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

Existing D1 online chess/social migrations must already be applied in the **preview** database. Do not apply these to production without permission.

## Measuring the 10 ms server goal

Each successful move response has `Server-Timing: chess;dur=<milliseconds>`. This measures total Pages handler processing (Origin check, rate limits, authentication, D1, legal-move validation, database update). It **does not** include the network round trip or the time to deliver a push to the opponent.

Run local browser tests and collect `Server-Timing` and client observed move-to-opponent latencies at p50/p95/p99. Then repeat with two physically separate networks against the isolated preview with Durable Object enabled. Compare against the target **p95 server handler <= 10 ms**, after warm-up and under realistic concurrent traffic. Do not report the target as achieved without measured evidence.

## Release security gate

1. Verify a guest and account user can connect, reconnect, and resume; cross-origin WebSocket upgrades, wrong seat secrets, and account-session mismatch fail.
2. Verify the WebSocket frame, API bodies, redirect locations, response headers, error messages, logs and browser network requests never disclose a peer IP, cookie or secret.
3. Verify only one move wins simultaneous races, stale frames cannot roll back a finished game, and server clocks remain authoritative.
4. Verify fallback polling when socket is absent, refused, or dropped, and hibernation/reconnection behavior.
5. Benchmark server move processing and end-to-end delivery under network loss, latency and simulated throttling. Run penetration/security review before production readiness.

This provides a **push transport**, not guaranteed 10 ms global end-to-end latency, nor Lichess-style bounded lag compensation. These require separate measured engineering and testing.
