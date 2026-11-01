# SUS community voting setup (Cloudflare Pages)

The website now includes the SUS +1 widget to the right of a player's name.
The widget is only added by the browser after a completed live analysis.
The API accepts votes only when the finished-review endpoint issues a valid
short-lived signed proof for that particular Chess.com username.

**One-time Cloudflare setup is required before voting works:**

1. In Cloudflare Dashboard → Workers & Pages → D1, create database `eloscanner-sus`.
2. Run the statements in `migrations/0001_sus_votes.sql` against that database
   (Cloudflare D1 SQL Console works).
3. In Workers & Pages → `fairplaychess` → Settings → Bindings, add a **D1 database
   binding** with variable name **SUS_DB**, pointing to `eloscanner-sus`.
   Apply it to production (and preview if desired); redeploy the Pages project.
4. Ensure the existing secret `GITHUB_TOKEN` is configured as for analyses.

The API uses a signed first-party, HttpOnly, Secure, SameSite=Lax voter cookie
and a UNIQUE constraint per username/voter ID. This discourages duplicate clicks
but does not prevent determined abuse (e.g. clearing cookies or multiple devices).
A SUS count is **community opinion, not verified evidence or a Fair Play verdict**.

The counter is shown only following a successfully completed live analysis.
Cached sample previews do not grant vote eligibility until a fresh analysis
has completed. The API will report 503 until D1 binding and tables are ready.
