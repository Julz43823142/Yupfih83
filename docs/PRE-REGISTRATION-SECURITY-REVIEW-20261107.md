# EloScanner — pre-registration code security review (7 November 2026)

**Scope:** source on the `security/prelaunch-api-hardening-20261107` branch and the repository's automated local security suite. This is **not** a production penetration test or permission to enable registration.

## Original 22-point checklist

The prior answer called 12 checks "self-checkable", but the table actually marked **11** as "Ja". This review preserves the original 22 identifiers and does not treat code review as proof of production safety.

| # | Code-reviewable area | Source/test evidence | Limitation |
|---|---|---|---|
| 2 | Account permissions and leaderboards | Authenticated leaderboard identity is taken from the session; puzzle/maze submissions use server-owned game state; account/guest names are reserved consistently | Public puzzle answers and human-paced automation can still influence non-prize rankings |
| 7 | Missing access control | Auth gateway explicitly lists permitted actions; online/social routes now reject unlisted actions before allocating D1 counters | All production routes and deployments must still be checked |
| 8 | IDOR | Session ownership and account-linked chess seat are checked server-side; Chromium now tests cross-account friendship, inbox and seat requests | Scope is tested endpoints, not an independent production pentest |
| 11 | Insecure sessions | Better Auth sessions and host-only Secure/HttpOnly/SameSite cookies; expiry, tampering and logout regressions | Production cookie, edge and DNS behavior not inspected |
| 12 | SQL injection | First-party D1 queries reviewed for parameter binding; dynamic ranking SQL uses internally selected fixed clauses | A code review does not prove absence of all injection defects |
| 13 | XSS | Client-rendering sinks reviewed; ranking uses textContent; built HTML injects per-document CSP hashes; browser XSS regression | Third-party runtime and full live browser attack surface are not independently audited |
| 14 | Code injection | Retired external engine proxies; reviewed first-party execution points and isolated Pyodide worker | Bundled third-party JS/Python not exhaustively audited |
| 15 | Input validation | Bounded JSON parsing, allowlisted routes, names, IDs, origins and chess moves | New endpoints must preserve these controls |
| 16 | Tamperable scores/accounts | SQLite-atomic proof/race defenses; server-authoritative chess validation and account-owned scores; server-time pacing for puzzle solves (1.2 seconds average) and knight-maze levels (0.75 seconds average), with automation regression tests | Public puzzle solutions and deterministic mazes can still be automated at plausible speeds; scores are not prize-grade |
| 17 | Unsafe error handling | Generic API errors and no credential/secret reflection in reviewed auth paths | Cloudflare logs and production integrations not available |
| 21 | Unsafe defaults | Public registration fail-closed; build excludes private files and vendor demos; read-only CI token for tests | Cloudflare dashboard and deployed configuration remain unverified |

**The other 11 items remain outside a complete source-only determination:** #1, #3, #4, #5, #6, #9, #10, #18, #19, #20 and #22. They require deployment-specific evidence, independent live testing, operational review or further scope. No item is automatically marked safe just because a regression test passed.

## Findings repaired on this branch

1. **Unbounded throttle-scope creation:** unknown online/social routes previously reached per-route D1 rate limiting. Explicit route/method allowlists now reject them before DB work; a regression checks no counters are written.
2. **Authentication cleanup amplification:** rejected source-throttled login requests no longer execute expiry DELETE queries. Accepted traffic performs bounded cleanup at most once per five minutes per isolate; tests verify blocked requests skip cleanup.
3. **Official-name impersonation:** anonymous puzzle and maze rankings now share the reserved staff-identity policy with signup and guest chess. A verified-score submission test covers the puzzle path.
4. **Broken rankings:** the top-100 page referenced an undefined JavaScript `filter`, preventing results from rendering. Removed the reference; browser XSS test expects safe literal rendering.
5. **Click/premove reliability:** the board previously captured the pointer even on an ordinary click. Pointer capture now begins only for actual piece dragging; the move validation and game rules were not altered.
6. **Stale test fixture:** the online unit tests missed migration `0006_online_draw_offers.sql`. The fixture now uses the latest schema and cross-account browser tests were added.

7. **Score automation hardening:** publicly solvable puzzles and deterministic knight mazes now have additional server-time-based average pacing enforced at atomic score writes. Tests exercise fast answer floods and rapid maze progression. This raises the cost of automated ranking inflation but cannot prove human play or stop slower bots.

## Before opening public registration

Do not enable `PUBLIC_SIGNUP_ENABLED` until production Turnstile, Cloudflare edge/WAF, D1 permissions, secrets, backup restoration, API quotas/CPU budget, monitoring, administrative access and controlled multi-account production checks have been reviewed. Confirm an account recovery/support policy: the current username-based product has no email verification or self-service password reset.

The live site was not load-tested or attacked in this review. No production migrations, registration configuration, merges or deployments were performed. The PR should be reviewed and merged only after all CI checks pass.
