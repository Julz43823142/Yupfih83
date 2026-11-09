import { test, expect } from '@playwright/test';

const base = 'http://localhost:8788';

test('same account migrates from password to passkey and logs in via WebAuthn', async ({ page }) => {
  // Exercise phone enrollment UI with Chromium's genuine WebAuthn virtual authenticator.
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', {
    configurable: true, get: () => 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Chrome/131.0'
  }));
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true
    }
  });
  try {
    await page.goto(base + '/account.html');
    await expect(page.locator('#passkey-login')).toBeVisible();
    const before = await page.request.get(base + '/api/auth/config');
    expect((await before.json()).registrationOpen).toBe(false);
    await page.locator('#username').fill('local_tester');
    await page.locator('#password').fill('Local-test-only-orchard-57931!');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('#profile-username')).toHaveText('local_tester', { timeout: 30000 });
    await expect(page.locator('#passkey-profile-panel')).toBeVisible();
    const initialSession = await page.request.get(base + '/api/auth/get-session');
    const originalUserId = (await initialSession.json()).user.id;
    expect(originalUserId).toBeTruthy();
    let firstRegistration = null;
    await page.route('**/api/auth/passkey/verify-registration', async route => {
      firstRegistration ??= route.request().postDataJSON();
      await route.continue();
    });
    await page.locator('#passkey-confirm-password').fill('Local-test-only-orchard-57931!');
    await page.getByRole('button', { name: 'Create passkey' }).click();
    await expect(page.locator('#account-status')).toContainText('Your passkey is registered.', { timeout: 30000 });
    await expect(page.locator('#passkey-count')).toContainText('1 passkey registered.', { timeout: 30000 });
    expect(firstRegistration?.response?.id).toBeTruthy();
    const registerReplay = await page.request.post(base + '/api/auth/passkey/verify-registration', {
      headers: { Origin: base },
      data: firstRegistration
    });
    expect(registerReplay.status()).toBeGreaterThanOrEqual(400);
    const existingKeys = await page.request.get(base + '/api/auth/passkey/list-user-passkeys');
    expect(existingKeys.status()).toBe(200);
    const safeKeys = await existingKeys.json();
    expect(safeKeys.length).toBe(1);
    expect(Object.keys(safeKeys[0]).sort()).toEqual(['backedUp', 'createdAt', 'id', 'name']);
    expect(JSON.stringify(safeKeys)).not.toMatch(/publicKey|credentialID|session_token|@accounts\\.invalid/i);
    await page.locator('#sign-out').click();
    await expect(page.locator('#login-form')).toBeVisible();
    let firstAssertion = null;
    await page.route('**/api/auth/passkey/verify-authentication', async route => {
      firstAssertion ??= route.request().postDataJSON();
      await route.continue();
    });
    await page.locator('#passkey-login').click();
    await expect(page.locator('#profile-username')).toHaveText('local_tester', { timeout: 30000 });
    await expect(page.locator('#account-status')).toContainText('logged in with your passkey');
    const session = await page.request.get(base + '/api/auth/get-session');
    const signedInUser = (await session.json()).user;
    expect(signedInUser.username).toBe('local_tester');
    expect(signedInUser.id).toBe(originalUserId);
    expect(firstAssertion?.response?.id).toBeTruthy();
    // A previously accepted signature must never create a second session.
    const replay = await page.request.post(base + '/api/auth/passkey/verify-authentication', {
      headers: { Origin: base },
      data: firstAssertion
    });
    expect(replay.status()).toBeGreaterThanOrEqual(400);
    const crossOrigin = await page.request.post(base + '/api/auth/passkey/verify-authentication', {
      headers: { Origin: 'https://attacker.example' },
      data: firstAssertion
    });
    expect(crossOrigin.status()).toBe(403);
    const stillSignedIn = await page.request.get(base + '/api/auth/get-session');
    expect((await stillSignedIn.json()).user.username).toBe('local_tester');
    await page.locator('#sign-out').click();
    await expect(page.locator('#login-form')).toBeVisible();
    await page.locator('#username').fill('local_tester');
    await page.locator('#password').fill('Local-test-only-orchard-57931!');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('#profile-username')).toHaveText('local_tester', { timeout: 30000 });
    const fallback = await page.request.get(base + '/api/auth/get-session');
    expect((await fallback.json()).user.id).toBe(originalUserId);
  } finally {
    await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
    await client.send('WebAuthn.disable');
  }
});
