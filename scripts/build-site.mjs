import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const directories = new Set(['assets', 'client-v87', 'vendor', 'engine', 'stockfish', 'images', 'fonts']);
const files = /\.(html|css|js|mjs|json|svg|png|jpg|jpeg|webp|ico|txt|xml|wasm|webmanifest|woff2?)$/i;
const privateFile = /(?:^|[._-])(?:credentials?|secrets?|private|backup|dump|token)(?:[._-]|$)|\.(?:sql|sqlite3?|db|pem|key|p12|pfx|bak|log|map)$/i;

// Each document permits only its own static inline scripts, without unsafe-inline
// or unsafe-eval. Pyodide's dedicated worker uses its separate response policy.
export function protectHTML(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(match[1]) || !match[2].trim()) continue;
    hashes.push(`'sha256-${createHash('sha256').update(match[2].replace(/\r\n?/g, '\n')).digest('base64')}'`);
  }
  const policy = `script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com ${[...new Set(hashes)].join(' ')}; script-src-attr 'none'; worker-src 'self'; object-src 'none'; base-uri 'self'`;
  return html.replace(/<head\b[^>]*>/i, head => `${head}\n<meta http-equiv="Content-Security-Policy" content="${policy}">`);
}

export function buildSite(root = resolve('.'), output = resolve(root, 'dist')) {
  rmSync(output, { recursive: true, force: true }); mkdirSync(output, { recursive: true });
  function copy(relative, nested = false) {
    for (const item of readdirSync(join(root, relative), { withFileTypes: true })) {
      const path = join(relative, item.name);
      // Never follow symlinks or publish hidden files, even inside public folders.
      if (item.isSymbolicLink() || item.name.startsWith('.') || privateFile.test(item.name)) continue;
      if (item.isDirectory()) {
        if (nested || directories.has(item.name)) copy(path, true);
        continue;
      }
      if (!item.isFile()) continue;
      if (!nested && (['package.json', 'package-lock.json', 'playwright.config.mjs'].includes(item.name) || !(files.test(item.name) || ['_headers', '_redirects', '_routes.json'].includes(item.name)))) continue;
      // Vendor demos are unnecessary same-origin pages with external scripts.
      if (nested && /\.html?$/i.test(item.name)) continue;
      const target = join(output, path); mkdirSync(dirname(target), { recursive: true });
      if (/\.html$/i.test(item.name)) writeFileSync(target, protectHTML(readFileSync(join(root, path), 'utf8')));
      else copyFileSync(join(root, path), target);
    }
  }
  copy('');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSite();
  console.log('Public assets built in dist/ with per-page script policies.');
}
