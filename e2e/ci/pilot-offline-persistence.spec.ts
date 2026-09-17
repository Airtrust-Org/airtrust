import { expect, test } from '@playwright/test';

test('Pilot vault survives offline refresh, close/reopen and Service Worker stays isolated', async ({
  page,
  context,
  browserName,
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

  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#legacy-vault-card')).toBeHidden();
  await expect(page.getByText('PIN offline')).toHaveCount(0);

  await page.locator('#diagnostic-card > summary').click();
  const marker = `pilot-offline-ci-${Date.now()}`;
  await page.locator('#draft').fill(marker);
  await page.locator('#save-now').click();
  await expect(page.locator('#save-status')).toContainText('Salvo no tablet');

  const localProof = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('airtrust-pilot-v1', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });

    const encryptedRecords = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = database.transaction('rdv_drafts', 'readonly');
      const request = transaction.objectStore('rdv_drafts').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
    });

    const vaultConfig = await new Promise<Record<string, unknown> | undefined>(
      (resolve, reject) => {
        const transaction = database.transaction('meta', 'readonly');
        const request = transaction.objectStore('meta').get('vault-config');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB meta read failed'));
      },
    );

    const deviceKey = vaultConfig?.device_key as CryptoKey | undefined;
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
      vaultConfig: vaultConfig
        ? {
            version: vaultConfig.version,
            keyProtection: vaultConfig.key_protection,
            keyExtractable: deviceKey?.extractable ?? null,
            keyAlgorithm: deviceKey?.algorithm?.name ?? null,
          }
        : null,
      cacheNames,
      cachedUrls,
      registrationScopes: registrations.map((registration) => registration.scope),
      controllerUrl: navigator.serviceWorker.controller?.scriptURL || null,
    };
  });

  expect(localProof.vaultConfig).toEqual({
    version: 2,
    keyProtection: 'NON_EXTRACTABLE_DEVICE_CRYPTOKEY',
    keyExtractable: false,
    keyAlgorithm: 'AES-GCM',
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
  expect(localProof.cacheNames.every((name) => name.startsWith('airtrust-pilot-shell-'))).toBe(
    true,
  );
  expect(localProof.cachedUrls.some((url) => new URL(url).pathname.startsWith('/api/'))).toBe(
    false,
  );
  expect(
    localProof.cachedUrls.some((url) => new URL(url).pathname === '/pilot/pilot-preflight.js'),
  ).toBe(true);
  expect(localProof.registrationScopes.length).toBeGreaterThan(0);
  expect(
    localProof.registrationScopes.every((scope) => new URL(scope).pathname === '/pilot/'),
  ).toBe(true);
  expect(localProof.controllerUrl).toContain('/pilot/pilot-sw.js');

  let finalPage = page;

  if (browserName === 'webkit') {
    // Playwright WebKit currently aborts reload/goto internally after
    // BrowserContext.setOffline(true). Validate the two Safari-critical pieces
    // separately without weakening them: persistent IndexedDB across a real
    // page close/reopen, then Service Worker cache delivery while all network
    // requests that escape the worker are blocked.
    await page.close();
    const reopened = await context.newPage();
    reopened.on('pageerror', (error) => pageErrors.push(error.message));
    await reopened.goto('/pilot/', { waitUntil: 'domcontentloaded' });
    await expect(reopened.locator('#workspace')).toBeVisible();
    await expect(reopened.locator('#legacy-vault-card')).toBeHidden();
    await reopened.locator('#diagnostic-card > summary').click();
    await expect(reopened.locator('#draft')).toHaveValue(marker);
    await expect(reopened.locator('#save-status')).toContainText('Rascunho recuperado do tablet');

    await reopened.evaluate(() => {
      Object.defineProperty(Navigator.prototype, 'onLine', {
        configurable: true,
        get: () => false,
      });
      window.dispatchEvent(new Event('offline'));
    });
    await expect(reopened.locator('#connectivity')).toContainText('OFFLINE');

    await context.route('**/*', async (route) => {
      await route.abort('internetdisconnected');
    });
    const cachedShellProof = await reopened.evaluate(async () => {
      const paths = ['/pilot/index.html', '/pilot/pilot-preflight.js'];
      return Promise.all(
        paths.map(async (path) => {
          const response = await fetch(path, { cache: 'no-store' });
          const body = await response.text();
          return { path, ok: response.ok, status: response.status, bodyLength: body.length };
        }),
      );
    });
    expect(cachedShellProof).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/pilot/index.html', ok: true, status: 200 }),
        expect.objectContaining({ path: '/pilot/pilot-preflight.js', ok: true, status: 200 }),
      ]),
    );
    expect(cachedShellProof.every((entry) => entry.bodyLength > 100)).toBe(true);
    await context.unroute('**/*');
    finalPage = reopened;
  } else {
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.locator('#connectivity')).toContainText('OFFLINE');
    await expect(page.locator('#workspace')).toBeVisible();
    await expect(page.locator('#legacy-vault-card')).toBeHidden();
    await page.locator('#diagnostic-card > summary').click();
    await expect(page.locator('#draft')).toHaveValue(marker);
    await expect(page.locator('#save-status')).toContainText('Rascunho recuperado do tablet');

    await page.close();
    const reopened = await context.newPage();
    reopened.on('pageerror', (error) => pageErrors.push(error.message));
    await reopened.goto('/pilot/', { waitUntil: 'domcontentloaded' });
    await expect(reopened.locator('#connectivity')).toContainText('OFFLINE');
    await expect(reopened.locator('#workspace')).toBeVisible();
    await expect(reopened.locator('#legacy-vault-card')).toBeHidden();
    await reopened.locator('#diagnostic-card > summary').click();
    await expect(reopened.locator('#draft')).toHaveValue(marker);
    await expect(reopened.locator('#save-status')).toContainText('Rascunho recuperado do tablet');
    await context.setOffline(false);
    finalPage = reopened;
  }

  await finalPage.goto('/');

  const rootController = await finalPage.evaluate(
    () => navigator.serviceWorker.controller?.scriptURL || null,
  );
  expect(rootController).toBeNull();
  expect(pageErrors).toEqual([]);
});


test('migrates a legacy PIN vault once without losing encrypted draft data', async ({ page }) => {
  const legacyPin = '654321';
  const marker = `pilot-legacy-migration-${Date.now()}`;

  await page.goto('/');
  await page.evaluate(
    async ({ pin, value }) => {
      const { PilotVault } = await import('/pilot/pilot-vault.js');
      const vault = await PilotVault.open();
      await vault.provision(pin);
      await vault.putJson(
        'rdv_drafts',
        'phase1-synthetic-rdv-draft',
        { observacoes: value },
        1,
      );
    },
    { pin: legacyPin, value: marker },
  );

  await page.goto('/pilot/');
  await expect(page.locator('#legacy-vault-card')).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();
  await page.locator('#legacy-vault-pin').fill(legacyPin);
  await page.locator('#legacy-vault-migrate').click();

  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#legacy-vault-card')).toBeHidden();
  await page.locator('#diagnostic-card > summary').click();
  await expect(page.locator('#draft')).toHaveValue(marker);

  const proof = await page.evaluate(async (plainMarker) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('airtrust-pilot-v1', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });
    const config = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      const transaction = database.transaction('meta', 'readonly');
      const request = transaction.objectStore('meta').get('vault-config');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB meta read failed'));
    });
    const drafts = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = database.transaction('rdv_drafts', 'readonly');
      const request = transaction.objectStore('rdv_drafts').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB draft read failed'));
    });
    const key = config?.device_key as CryptoKey | undefined;
    return {
      config: {
        version: config?.version,
        migratedFrom: config?.migrated_from,
        keyProtection: config?.key_protection,
        keyExtractable: key?.extractable ?? null,
      },
      containsPlaintext: JSON.stringify(drafts).includes(plainMarker),
    };
  }, marker);

  expect(proof.config).toEqual({
    version: 2,
    migratedFrom: 'PBKDF2_PIN_V1',
    keyProtection: 'NON_EXTRACTABLE_DEVICE_CRYPTOKEY',
    keyExtractable: false,
  });
  expect(proof.containsPlaintext).toBe(false);
});
