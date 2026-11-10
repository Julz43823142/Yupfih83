import { test, expect } from '@playwright/test';

const base = 'http://localhost:8788';
const phoneUA = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

test('desktop QR login uses phone passkey without invoking desktop WebAuthn', async ({ browser }) => {
  const phoneContext = await browser.newContext({ userAgent: phoneUA, isMobile: true, hasTouch: true });
  const desktopContext = await browser.newContext();
  const phone = await phoneContext.newPage(), desktop = await desktopContext.newPage();
  const cdp = await phoneContext.newCDPSession(phone);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }
  });
  try {
    await phone.goto(base + '/account.html');
    await expect(phone.locator('#passkey-login')).toBeVisible();
    await expect(phone.locator('#qr-login-start')).toBeHidden();
    await phone.locator('#username').fill('local_tester');
    await phone.locator('#password').fill('Local-test-only-orchard-57931!');
    await phone.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(phone.locator('#profile-username')).toHaveText('local_tester', { timeout: 30000 });
    await phone.locator('#passkey-confirm-password').fill('Local-test-only-orchard-57931!');
    await phone.getByRole('button', { name: 'Create passkey' }).click();
    await expect(phone.locator('#account-status')).toContainText('Your passkey is registered.', { timeout: 30000 });
    await phone.locator('#sign-out').click();
    await expect(phone.locator('#login-panel')).toBeVisible();

    await desktop.addInitScript(() => {
      window.desktopWebAuthnCalls = 0;
      if (navigator.credentials?.get) {
        const original = navigator.credentials.get.bind(navigator.credentials);
        navigator.credentials.get = (...args) => {
          window.desktopWebAuthnCalls++;
          return original(...args);
        };
      }
    });
    await desktop.goto(base + '/account.html');
    await expect(desktop.locator('#qr-login-start')).toBeVisible();
    await expect(desktop.locator('#passkey-login')).toBeHidden();
    const startResponse = desktop.waitForResponse(r => r.url().endsWith('/api/auth/qr-login/start') && r.status() === 200);
    await desktop.locator('#qr-login-start').click();
    const qr = await (await startResponse).json();
    await expect(desktop.locator('#qr-login-image svg')).toBeVisible();
    await expect(desktop.locator('#qr-login-code')).toHaveText(qr.code);
    expect(qr.phoneUrl).not.toContain(qr.secret);
    phone.on('dialog', dialog => dialog.accept());
    await phone.goto(qr.phoneUrl.replace('https://eloscanner.com', base));
    await expect(phone.locator('#qr-login-phone')).toBeVisible();
    await expect(phone.locator('#qr-phone-code')).toHaveText(qr.code);
    await phone.locator('#qr-phone-approve').click();
    await expect(phone.locator('#qr-phone-status')).toContainText('Computer approved.', { timeout: 30000 });
    await expect(desktop.locator('#profile-username')).toHaveText('local_tester', { timeout: 30000 });
    expect(await desktop.evaluate(() => window.desktopWebAuthnCalls)).toBe(0);
    expect((await (await desktop.request.get(base + '/api/auth/get-session')).json()).user.username).toBe('local_tester');
    expect((await (await desktop.request.post(base + '/api/auth/qr-login/finish', {
      headers: { Origin: base }, data: { id: qr.id, secret: qr.secret }
    })).status())).toBe(410);
  } finally {
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
    await cdp.send('WebAuthn.disable');
    await phoneContext.close();
    await desktopContext.close();
  }
});

test('cancel button revokes the QR request on the server', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(base + '/account.html');
    await expect(page.locator('#qr-login-start')).toBeVisible();
    const started = page.waitForResponse(r => r.url().endsWith('/api/auth/qr-login/start') && r.status() === 200);
    await page.locator('#qr-login-start').click();
    const qr = await (await started).json();
    await expect(page.locator('#qr-login-desktop')).toBeVisible();
    const cancelled = page.waitForResponse(r => r.url().endsWith('/api/auth/qr-login/cancel'));
    await page.locator('#qr-login-cancel').click();
    expect((await cancelled).status()).toBe(200);
    await expect(page.locator('#account-status')).toContainText('cancelled on the server');
    await expect(page.locator('#qr-login-desktop')).toBeHidden();
    const finished = await context.request.post(base + '/api/auth/qr-login/finish', {
      headers: { Origin: base }, data: { id: qr.id, secret: qr.secret }
    });
    expect(finished.status()).toBe(410);
    const session = await context.request.get(base + '/api/auth/get-session');
    const result = await session.json();
    expect(result?.user).toBeFalsy();
  } finally {
    await context.close();
  }
});
