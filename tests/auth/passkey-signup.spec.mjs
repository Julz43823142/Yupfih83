import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { database } from './fixture.mjs';
import { handleAuth } from '../../lib/auth/gateway.mjs';

// Isolated in-memory D1 stand-in and local HTTP origin. Turnstile's answer is
// stubbed only by this test server; real WebAuthn verification is NOT stubbed.
test('new account: real WebAuthn registration, session, duplicate and replay protection', async ({ page }) => {
  const db = database();
  const server = createServer();
  server.listen(0);
  await once(server, 'listening');
  const origin = 'http://localhost:' + server.address().port;
  const env = {
    AUTH_DB: db,
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: 'LOCAL-TEST-ONLY-passkey-signup-unique-secret-1234567',
    PASSKEY_LOGIN_ENABLED: 'true',
    PASSKEY_RP_ID: 'localhost',
    PUBLIC_SIGNUP_ENABLED: 'true',
    TURNSTILE_SITE_KEY: 'test-only-site-key',
    TURNSTILE_SECRET_KEY: 'test-only-server-key'
  };
  server.on('request', async (req, res) => {
    try {
      if (req.url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><title>Local WebAuthn test</title>');
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = new Headers(req.headers);
      headers.set('CF-Connecting-IP', '127.0.0.1');
      const response = await handleAuth({
        env,
        request: new Request(origin + req.url, {
          method: req.method,
          headers,
          ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {})
        })
      }, {
        fetch: async url => {
          if (url !== 'https://challenges.cloudflare.com/turnstile/v0/siteverify') throw Error('Unexpected external call');
          return Response.json({ success: true, hostname: 'localhost', action: 'signup' });
        }
      });
      res.statusCode = response.status;
      for (const [key, value] of response.headers) {
        if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, value);
      }
      for (const cookie of response.headers.getSetCookie()) res.appendHeader('Set-Cookie', cookie);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      res.writeHead(500);
      res.end('Test server error');
    }
  });
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
        hasUserVerification: true, isUserVerified: true,
        automaticPresenceSimulation: true
      }
    });
    await page.goto(origin + '/');
    const outcome = await page.evaluate(async () => {
      const api = async (route, body) => {
        const response = await fetch('/api/auth/' + route, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        return { status: response.status, body: await response.json() };
      };
      const from64 = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), x => x.charCodeAt(0));
      const to64 = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const options = await api('passkey-signup/options', { username: 'browser_signup', turnstileToken: 'local-test' });
      if (options.status !== 200) return { options };
      const publicKey = options.body.publicKey;
      const credential = await navigator.credentials.create({
        publicKey: {
          ...publicKey,
          challenge: from64(publicKey.challenge),
          user: { ...publicKey.user, id: from64(publicKey.user.id) }
        }
      });
      const attestation = {
        id: credential.id,
        rawId: to64(credential.rawId),
        type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment,
        response: {
          clientDataJSON: to64(credential.response.clientDataJSON),
          attestationObject: to64(credential.response.attestationObject),
          transports: credential.response.getTransports()
        },
        clientExtensionResults: credential.getClientExtensionResults()
      };
      const payload = {
        attemptId: options.body.attemptId,
        challenge: publicKey.challenge,
        credential: attestation
      };
      const verified = await api('passkey-signup/verify', payload);
      const replay = await api('passkey-signup/verify', payload);
      const sessionResponse = await fetch('/api/auth/get-session');
      const session = await sessionResponse.json();
      const duplicate = await api('passkey-signup/options', { username: 'second_account', turnstileToken: 'local-test' });
      return { options: options.status, verified, replay: replay.status, session, duplicate: duplicate.status };
    });
    expect(outcome.options).toBe(200);
    expect(outcome.verified.status).toBe(201);
    expect(outcome.verified.body.loggedIn).toBe(true);
    expect(outcome.verified.body.user?.username).toBe('browser_signup');
    expect(outcome.verified.body.user?.id).toBe(outcome.session.user?.id);
    expect(outcome.replay).toBe(403);
    expect(outcome.duplicate).toBe(409);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM "user"').get().n).toBe(1);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM passkey').get().n).toBe(1);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM session').get().n).toBe(1);
    const key = db.sqlite.prepare('SELECT publicKey,credentialID,userId FROM passkey').get();
    expect(key.userId).toBe(outcome.verified.body.user.id);
    expect(key.publicKey.length).toBeGreaterThan(40);
    expect(key.credentialID.length).toBeGreaterThan(10);
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  } finally {
    await cdp.send('WebAuthn.disable').catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }
});
