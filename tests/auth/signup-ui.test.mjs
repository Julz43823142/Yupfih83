import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('phone signup must not silently authenticate using an unrelated existing passkey', () => {
  const source = readFileSync(new URL('../../account.js', import.meta.url), 'utf8');
  const begin = source.indexOf("byId('registration-preview-form').addEventListener");
  const end = source.indexOf("byId('login-form').addEventListener", begin);
  assert.ok(begin >= 0 && end > begin, 'signup handler exists');
  const signup = source.slice(begin, end);
  assert.match(signup, /created\.username !== username\.toLowerCase\(\)/);
  assert.match(signup, /form\.hidden = true/);
  assert.doesNotMatch(signup, /eloPasskey\.signIn\s*\(/, 'signup must not automatically trigger generic discoverable sign-in');
  assert.match(signup, /created\.loggedIn && created\.user\?\.username === created\.username/, 'only a verified matching signup session may show the user');
});

test('phone signup WebAuthn ceremony requests the phone-local passkey provider', () => {
  const source = readFileSync(new URL('../../lib/auth/gateway.mjs', import.meta.url), 'utf8');
  const begin = source.indexOf("if (signupRoute && route === 'passkey-signup/options')");
  const end = source.indexOf("if (signupRoute && route === 'passkey-signup/verify')", begin);
  assert.ok(begin >= 0 && end > begin);
  const options = source.slice(begin, end);
  assert.match(options, /authenticatorAttachment:\s*'platform'/);
  assert.match(options, /hints:\s*\['client-device'\]/);
  assert.match(options, /userVerification:\s*'required'/);
});

test('desktop signup is a QR handoff, not a Windows Hello ceremony', () => {
  const page = readFileSync(new URL('../../account.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../../account.js', import.meta.url), 'utf8');
  const qr = readFileSync(new URL('../../phone-signup-qr.js', import.meta.url), 'utf8');
  assert.match(page, /id="signup-phone-handoff"/);
  assert.match(page, /id="signup-phone-qr"/);
  assert.match(page, /phone-signup-qr\.js/);
  assert.match(script, /window\.eloPhoneSignup\?\.isPhone\(\)/);
  assert.match(script, /byId\('registration-preview-form'\)\.hidden = true/);
  assert.match(script, /window\.eloPhoneSignup\?\.renderQr/);
  assert.match(qr, /const signupURL = 'https:\\/\\/' \+ host \+ '\\/account\\.html\\?view=signup'/);
  assert.match(qr, /const productionHost = 'eloscanner\\.com'/);
  assert.match(qr, /const productionRows = \\[/);
  const start = qr.indexOf('const rows = [');
  const end = qr.indexOf('];', start);
  const rows = [...qr.slice(start, end).matchAll(/'([a-f0-9]{12})'/g)].map(x => x[1]);
  assert.equal(rows.length, 45, 'QR matrix is 45 by 45');
  assert.equal(rows[0].slice(0, 2), '1f', 'QR finder pattern present');
});
