import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const output = resolve('dist');
rmSync(output, { recursive: true, force: true }); mkdirSync(output);
// Only public assets go to Pages. Never copy credentials, tooling or server code.
const directories = new Set(['assets', 'client-v87', 'vendor', 'engine', 'stockfish', 'images', 'fonts']);
const files = /\.(html|css|js|mjs|json|svg|png|jpg|jpeg|webp|ico|txt|xml|wasm|webmanifest|woff2?)$/i;
for (const item of readdirSync('.', { withFileTypes: true })) {
  if (item.name.startsWith('.') || ['package.json', 'package-lock.json', 'playwright.config.mjs'].includes(item.name)) continue;
  if (item.isDirectory() ? directories.has(item.name) : files.test(item.name) || ['_headers', '_redirects', '_routes.json'].includes(item.name)) {
    cpSync(item.name, resolve(output, item.name), { recursive: true });
  }
}
console.log('Public assets built in dist/. Server code and secrets excluded.');
