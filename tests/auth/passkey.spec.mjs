import { test, expect } from '@playwright/test';

const base = 'http://localhost:8788';

test('same account migrates from password to passkey and logs in via WebAuthn', async ({ page }) => {
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
    await page.locator('#passkey-confirm-password').fill('Local-test-only-orchard-57931!');
    await page.getByRole('button', { name: 'Create passkey' }).click();
    await expect(page.locator('#account-status')).toContainText('Your passkey is registered.', { timeout: 30000 });
    await page.locator('#sign-out').click();
    await expect(page.locator('#login-form')).toBeVisible();
    await page.locator('#passkey-login').click();
    await expect(page.locator('#profile-username')).toHaveText('local_tester', { timeout: 30000 });
    await expect(page.locator('#account-status')).toContainText('logged in with your passkey');
    const session = await page.request.get(base + '/api/auth/get-session');
    expect((await session.json()).user.username).toBe('local_tester');
  } finally {
    await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
    await client.send('WebAuthn.disable');
  }
});
