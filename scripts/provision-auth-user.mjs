// Offline operator tool. Never exposed through Pages Functions.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { createAuth } from '../lib/auth/config.mjs';
import { checkNewPassword } from '../lib/auth/password.mjs';
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/provision-auth-user.mjs --local [--fixture]\nnode scripts/provision-auth-user.mjs --remote --database <D1-name-or-ID>\nnode scripts/provision-auth-user.mjs --export-sql --output <file.sql>\nPrompts for username, password and target BETTER_AUTH_SECRET. Export contains sensitive password hashes; never share it.');
  process.exit(0);
}
const remote = args.includes('--remote');
const exportSql = args.includes('--export-sql');
if (Number(remote) + Number(args.includes('--local')) + Number(exportSql) !== 1) throw new Error('Choose exactly one of --local, --remote or --export-sql');
const outputIndex = args.indexOf('--output');
const outputFile = exportSql ? args[outputIndex + 1] : null;
if (exportSql && (outputIndex < 0 || !outputFile || outputFile.startsWith('-'))) throw new Error('--export-sql requires --output <file.sql>');
const fixture = args.includes('--fixture') || args.includes('--fixture2');
if (fixture && (remote || exportSql)) throw new Error('Fixture users are forbidden for remote databases and SQL exports');
const dbIndex = args.indexOf('--database'); const target = remote ? args[dbIndex + 1] : 'AUTH_DB';
if (remote && (dbIndex < 0 || !target || target.startsWith('-'))) throw new Error('Explicit --database is required for remote provisioning');
function prompt(question, hidden = false) {
  if (hidden && process.platform === 'win32') {
    // PowerShell's native secure input avoids raw-mode keypress handling
    // that can fail in Windows terminals. Never pass secrets in argv.
    const script = [
      '$secure = Read-Host -Prompt ' + "'Enter secret (input hidden)'" + ' -AsSecureString',
      '$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)',
      'try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) }',
      'finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }'
    ].join('; ');
    process.stdout.write(question + '\\n');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8', windowsHide: false
    });
    if (result.status !== 0) throw new Error('Secure input cancelled or unavailable');
    return Promise.resolve(result.stdout);
  }
  if (!process.stdin.isTTY) throw new Error('Interactive terminal required (use --local --fixture for automated tests)');
  if (!hidden) return new Promise(resolve => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(question, value => { rl.close(); resolve(value); }); });
  return new Promise((resolve, reject) => {
    process.stdout.write(question); emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
    let value = '';
    const finish = () => { process.stdin.removeListener('keypress', listener); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    function listener(text, key) {
      if (key?.ctrl && key.name === 'c') { finish(); reject(new Error('Cancelled')); }
      else if (key?.name === 'return') { finish(); resolve(value); }
      else if (key?.name === 'backspace') value = value.slice(0, -1);
      else if (text && !key?.ctrl) value += text;
    }
    process.stdin.on('keypress', listener);
  });
}
const username = fixture ? (args.includes('--fixture2') ? 'local_friend' : 'local_tester') : (await prompt('Test username (3–24 letters, digits or underscores): ')).trim().toLowerCase();
if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('Invalid username');
const password = fixture ? 'Local-test-only-orchard-57931!' : await prompt('Unique test password (hidden): ', true);
const secret = fixture ? 'LOCAL-TEST-ONLY-never-use-in-production-1234567890' : await prompt('Target BETTER_AUTH_SECRET (hidden): ', true);
if (!fixture) { const error = await checkNewPassword(password, username); if (error) throw new Error(error); }
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/auth/0001_auth.sql', import.meta.url), 'utf8'));
const auth = createAuth({ AUTH_DB: sqlite, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'http://localhost:8788' }, { provision: true });
await auth.api.signUpEmail({ body: { email: `${crypto.randomUUID()}@accounts.invalid`, name: username, username, password } });
const literal = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const lines = [];
for (const table of ['user', 'account']) {
  for (const row of sqlite.prepare(`SELECT * FROM "${table}"`).all()) lines.push(`INSERT INTO "${table}" (${Object.keys(row).map(k => `"${k}"`).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});`);
}
if (exportSql) {
  // Never overwrite an existing export. It contains password hashes and account identifiers.
  writeFileSync(outputFile, lines.join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  sqlite.close();
  console.log('SQL export created at the requested path. Sensitive: do not share or commit this file.');
  process.exit(0);
}
const dir = mkdtempSync(join(tmpdir(), 'elo-auth-provision-'));
try {
  const file = join(dir, 'provision.sql'); writeFileSync(file, lines.join('\n'), { mode: 0o600 });
  const command = ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', target, remote ? '--remote' : '--local', '--file', file];
  if (!remote) command.push('--config', 'tests/auth/wrangler.jsonc');
  const result = spawnSync(process.execPath, command, { stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  // SQL/error output can include hashes; never print it.
  if (result.status !== 0) throw new Error('Provisioning failed. Check database configuration and whether the username already exists.');
  console.log('Test account provisioned. Public registration remains closed.');
} finally { sqlite.close(); rmSync(dir, { recursive: true, force: true }); }
