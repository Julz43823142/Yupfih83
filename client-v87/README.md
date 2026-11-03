# Browser-side Fair Play v87

The EloScanner homepage performs Fair Play v87 analysis in a dedicated Web Worker,
using CPython WebAssembly (Pyodide 0.27.2). The original website-review Python
modules and opening-lines reference are copied from
`Julz43823142/Ydhnd902137812`. This preserves the formulas, selection rules,
report schema and chart sampling without running GitHub Actions.

`browser_adapter.py` replaces only the public Chess.com network transport.
The browser obtains Chess.com PubAPI JSON and supplies it to the unchanged
Python collector. The adapter does **not** accept missing archives as normal
data; it asks the Worker to fetch additional months.

`chess/` is a pinned copy of python-chess 1.11.2, © Niklas Fiekas,
licensed under GPL-3.0-or-later. Its full license is in `LICENSE.txt`.
The source files remain included here for license compliance.

Cloudflare handles a sliding quota of 15 starts per IP per 10 minutes and
issues short-lived CIP interaction tokens. It does **not** calculate v87,
dispatch a GitHub runner, or receive and certify browser-produced risk scores.
Previous saved reports remain historical, not newly server-verified reports.

Browser performance and result parity should be validated against the native
runner on representative real accounts before claiming exact parity in every
mobile browser. Changes to v87 in the Discord/backend repository must be
manually synced here before the browser version is considered up to date.
