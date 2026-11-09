import { createAuthClient } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { startRegistration } from '@simplewebauthn/browser';

// This is bundled into a same-origin classic script by scripts/build-site.mjs.
// Native browser WebAuthn selects local device, phone QR or security key.
const client = createAuthClient({
  baseURL: location.origin,
  plugins: [passkeyClient()]
});

function unwrap(result) {
  if (result?.error) throw new Error('Passkey authentication failed. Please try again.');
  return result?.data;
}

window.eloPasskey = Object.freeze({
  registerPhone: async optionsJSON => startRegistration({ optionsJSON }),
  registerRecoveryPhone: async optionsJSON => startRegistration({ optionsJSON }),
  signIn: async () => unwrap(await client.signIn.passkey()),
  enroll: async () => unwrap(await client.passkey.addPasskey({ name: 'EloScanner passkey' })),
  list: async () => unwrap(await client.passkey.listUserPasskeys())
});
