import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const publish=readFileSync('.github/workflows/passkey-production-publish.yml','utf8');
const account=readFileSync('account.html','utf8');

test('production publish smoke checks current account assets',()=>{
  const assets=[...publish.matchAll(/page\.includes\('([^']+\.js\?v=[^']+)'\)/g)].map(m=>m[1]);
  assert.ok(assets.length>=2,'Production smoke must check expected account scripts');
  for(const asset of assets)
    assert.ok(account.includes(asset),'Production smoke expects an outdated asset: '+asset);
});

test('production live smoke requires recovery and phone-transfer readiness',()=>{
  assert.match(publish,/cfg\\.recoveryCodesReady===true/);
  assert.match(publish,/cfg\\.phoneTransferReady===true/);
  assert.match(publish,/cfg\\.registrationOpen===false/);
});

test('production publish tests actual local passkeys, recovery and transfer before deployment',()=>{
  assert.match(publish,/LOCAL_PASSKEY_TEST=true npm run dev:auth/);
  for(const name of ['passkey.spec.mjs','passkey-signup.spec.mjs',
    'recovery-browser.spec.mjs','phone-transfer-browser.spec.mjs'])
    assert.ok(publish.includes('tests/auth/'+name),'Missing release browser test '+name);
  const gate=publish.indexOf('Require complete 0010-0013 D1 security schema before any publication');
  const deploy=publish.indexOf('Deploy built Functions and site to production branch ONLY');
  assert.ok(gate>0&&deploy>gate,'Production D1 schema guard must precede deploy');
  assert.match(publish,/vars\.PUBLIC_SIGNUP_ENABLED\?\.value!=='false'/);
  assert.match(publish,/project\.source\?\.config\?\.production_deployments_enabled!==false/);
});
