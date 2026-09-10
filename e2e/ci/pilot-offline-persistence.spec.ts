import { expect, test } from '@playwright/test';

const PIN = '654321';

test('Pilot vault survives offline refresh and Service Worker stays isolated', async ({
  page,
  context,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/pilot/');
  await expect(page.getByRole('heading', { name: 'AirTrust Pilot' })).toBeVisible();

  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker API unavailable');
    }
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  await page.locator('#pin').fill(PIN);
  await page.locator('#pin-confirm').fill(PIN);
  await page.locator('#unlock-button').click();

  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#unlock-status')).toContainText(
    'Armazenamento offline desbloqueado',
  );

  await page.locator('#diagnostic-card > summary').click();
  const marker = `pilot-offline-ci-${Date.now()}`;
  await page.locator('#draft').fill(marker);
  await page.locator('#save-now').click();
  await expect(page.locator('#save-status')).toContainText('Salvo no tablet');

  const localProof = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('airtrust-pilot-v1', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error('IndexedDB open failed'));
    });

    const encryptedRecords = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = database.transaction('rdv_drafts', 'readonly');
      const request = transaction.objectStore('rdv_drafts').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error('IndexedDB read failed'));
    });

    const cacheNames = await caches.keys();
    const cachedUrls: string[] = [];
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      cachedUrls.push(...requests.map((request) => request.url));
    }

    const registrations = await navigator.serviceWorker.getRegistrations();

    return {
      encryptedRecords,
      cacheNames,
      cachedUrls,
      registrationScopes: registrations.map((registration) => registration.scope),
      controllerUrl: navigator.serviceWorker.controller?.scriptURL || null,
    };
  });

  expect(localProof.encryptedRecords.length).toBeGreaterThan(0);
  expect(JSON.stringify(localProof.encryptedRecords)).not.toContain(marker);
  expect(localProof.encryptedRecords).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        cipher_version: 1,
        ciphertext: expect.any(String),
        iv: expect.any(String),
      }),
    ]),
  );
  expect(localProof.cacheNames.length).toBeGreaterThan(0);
  expect(
    localProof.cacheNames.every((name) => name.startsWith('airtrust-pilot-shell-')),
  ).toBe(true);
  expect(localProof.cachedUrls.some((url) => new URL(url).pathname.startsWith('/api/'))).toBe(
    false,
  );
  expect(localProof.registrationScopes.length).toBeGreaterThan(0);
  expect(
    localProof.registrationScopes.every((scope) => new URL(scope).pathname === '/pilot/'),
  ).toBe(true);
  expect(localProof.controllerUrl).toContain('/pilot/pilot-sw.js');

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.locator('#connectivity')).toContainText('OFFLINE');
  await expect(page.locator('#unlock-title')).toContainText('Desbloquear dados offline');

  await page.locator('#pin').fill(PIN);
  await page.locator('#unlock-button').click();
  await expect(page.locator('#workspace')).toBeVisible();

  await page.locator('#diagnostic-card > summary').click();
  await expect(page.locator('#draft')).toHaveValue(marker);
  await expect(page.locator('#save-status')).toContainText('Rascunho recuperado do tablet');

  await context.setOffline(false);
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();

  const rootController = await page.evaluate(
    () => navigator.serviceWorker.controller?.scriptURL || null,
  );
  expect(rootController).toBeNull();
  expect(pageErrors).toEqual([]);
});
