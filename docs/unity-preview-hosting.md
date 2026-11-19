# Unity preview deployment (EloScanner)

Source: private `Julz43823142/The-Fallen-King-Unity`. Hosting: this Cloudflare Pages website, deployed by `npm run build` to `dist`.

The published Unity test page is intended to live at `/fallen-king-unity/index.html`. **Do not replace** `crownless-prison.html`, the Babylon.js preview, until the new game is validated.

## First upload
The Unity player was built locally on 2026-11-19. To add its binary WebAssembly and data files without sharing credentials:
1. Extract the prepared package `The-Fallen-King-EloScanner-Upload.zip` on a local computer.
2. It contains a folder named `fallen-king-unity` with `index.html`, `Build/` and `TemplateData/`.
3. In this repository's `main` branch choose **Add file → Upload files**. Drag the entire extracted `fallen-king-unity` folder into the drop zone, preserving paths, and commit directly to `main`. GitHub browser upload supports individual files below 25 MiB; the largest is an uncompressed WebAssembly file of approximately 20.2 MiB. If folder dragging is unsupported in your browser, use GitHub Desktop to commit the folder to a local clone of this repo.
4. Cloudflare Pages will build the site and expose `https://eloscanner.com/fallen-king-unity/index.html`.

### Why uncompressed .wasm and .data?
The original Unity export used Brotli `.br` extensions and requires server `Content-Encoding: br` to be set correctly. The prepared package decompresses these into ordinary `.wasm`, `.data`, and `.js` and updates `index.html` accordingly. This makes static hosting simpler and avoids relying on fallback behavior. The largest file remains under Pages' 25 MiB per-file limit. This package uses the uploaded local game build, not a new build. Larger builds in future may need R2 or a separate asset host.

### Security
`scripts/build-site.mjs` permits only the special `fallen-king-unity/index.html` page as nested HTML and allows `.data` only inside `fallen-king-unity/Build/`. It runs `protectHTML` on that page like other site documents.

### Subsequent updates
A committed Unity source change alone does not publish a new Web build. A rebuilt browser package must replace the `fallen-king-unity` files in the website repository (or use an automated binary release/deploy workflow after Unity licensing/CI credentials are configured securely).

Do not commit credentials or license files.
