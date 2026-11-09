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
  assert.match(signup, /created\\.loggedIn && created\\.user\\?\\.username === created\\.username/, 'only a verified matching signup session may show the user');
});

test('phone signup WebAuthn ceremony requests an external authenticator', () => {
  const source = readFileSync(new URL('../../lib/auth/gateway.mjs', import.meta.url), 'utf8');
  const begin = source.indexOf("if (signupRoute && route === 'passkey-signup/options')");
  const end = source.indexOf("if (signupRoute && route === 'passkey-signup/verify')", begin);
  assert.ok(begin >= 0 && end > begin);
  const options = source.slice(begin, end);
  assert.match(options, /authenticatorAttachment:\s*'cross-platform'/);
  assert.match(options, /hints:\s*\['hybrid'\]/);
  assert.match(options, /userVerification:\s*'required'/);
});
