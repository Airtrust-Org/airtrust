import { expect, test } from '@playwright/test';

async function openDiagnosticCard(page: import('@playwright/test').Page) {
  await page.locator('#diagnostic-card').evaluate((element) => {
    element.classList.remove('hidden');
  });
  await page.locator('#diagnostic-card > summary').click();
}

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

  await openDiagnosticCard(page);
  const marker = `pilot-offline-ci-${Date.now()}`;
  await page.locator('#draft').fill(marker);
  await page.locator('#save-now').click();
  await expect(page.locator('#save-status')).toContainText('Salvo no tablet');

  const localProof = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('airtrust-pilot-v1');
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
    await openDiagnosticCard(reopened);
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
    await openDiagnosticCard(page);
    await expect(page.locator('#draft')).toHaveValue(marker);
    await expect(page.locator('#save-status')).toContainText('Rascunho recuperado do tablet');

    await page.close();
    const reopened = await context.newPage();
    reopened.on('pageerror', (error) => pageErrors.push(error.message));
    await reopened.goto('/pilot/', { waitUntil: 'domcontentloaded' });
    await expect(reopened.locator('#connectivity')).toContainText('OFFLINE');
    await expect(reopened.locator('#workspace')).toBeVisible();
    await expect(reopened.locator('#legacy-vault-card')).toBeHidden();
    await openDiagnosticCard(reopened);
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


test('recovers encrypted legacy draft and outbox only after PIN, with verified V2 read-back and intact V1', async ({ page }) => {
  const legacyPin = '654321';
  const marker = `pilot-legacy-recovery-${Date.now()}`;
  const outboxId = 'operation:legacy:123';

  await page.goto('/');
  await page.evaluate(async ({ pin, value, operationId }) => {
    const { PilotVault } = await import('/pilot/pilot-vault.js');
    const vault = await PilotVault.open();
    await vault.provision(pin);
    await vault.putJson('rdv_drafts', 'phase1-synthetic-rdv-draft', { observacoes: value }, 1);
    await vault.putJson('rdv_drafts', 'rdv:legacy:123', { voo_id: 123, note: value }, 2);
    await vault.putJson('outbox', operationId, { client_operation_id: operationId, status: 'pending' }, 3);
    await vault.putBytes('attachments', 'attachment:legacy', new Uint8Array([10, 20, 30]), 4);
  }, { pin: legacyPin, value: marker, operationId: outboxId });

  await page.goto('/pilot/');
  await expect(page.locator('#legacy-vault-card')).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();

  await page.locator('#legacy-vault-pin').fill('000000');
  await page.locator('#legacy-vault-recover').click();
  await expect(page.locator('#legacy-vault-status')).toContainText('Código local antigo incorreto');
  await expect(page.locator('#workspace')).toBeHidden();

  await page.locator('#legacy-vault-pin').fill(legacyPin);
  await page.locator('#legacy-vault-recover').click();
  await expect(page.locator('#legacy-vault-card')).toBeHidden();
  await expect(page.locator('#workspace')).toBeVisible();
  await openDiagnosticCard(page);
  await expect(page.locator('#draft')).toHaveValue(marker);

  const proof = await page.evaluate(async ({ value, operationId }) => {
    async function open(name: string): Promise<IDBDatabase> {
      return await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      });
    }
    async function get(database: IDBDatabase, store: string, id: string): Promise<any> {
      return await new Promise((resolve, reject) => {
        const tx = database.transaction(store, 'readonly');
        const request = tx.objectStore(store).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
      });
    }
    const legacy = await open('airtrust-pilot-v1');
    const current = await open('airtrust-pilot-v2');
    const v1 = await get(legacy, 'meta', 'vault-config');
    const v2 = await get(current, 'meta', 'vault-config');
    const legacyDraft = await get(legacy, 'rdv_drafts', 'phase1-synthetic-rdv-draft');
    const v2Draft = await get(current, 'rdv_drafts', 'phase1-synthetic-rdv-draft');
    const v2Outbox = await get(current, 'outbox', operationId);
    const recovery = await get(current, 'meta', 'legacy-pin-v1-recovery-proof');
    const { PilotVault } = await import('/pilot/pilot-vault.js');
    const verifiedVault = await PilotVault.open();
    const ready = await verifiedVault.openAutomatically();
    const attachment = await verifiedVault.getBytes('attachments', 'attachment:legacy');
    return {
      recoveryReady: ready.status === 'ready',
      attachmentRestored: attachment?.bytes.join(',') === '10,20,30',
      v1Version: v1.version, v2Version: v2.version,
      v1PlaintextLeak: JSON.stringify(legacyDraft).includes(value),
      v1Ciphertext: legacyDraft.ciphertext,
      v2Ciphertext: v2Draft.ciphertext,
      v2Outbox: Boolean(v2Outbox),
      proof: recovery?.completed === true && recovery?.records_verified >= 3,
    };
  }, { value: marker, operationId: outboxId });

  expect(proof.v1Version).toBe(1);
  expect(proof.v2Version).toBe(2);
  expect(proof.v1PlaintextLeak).toBe(false);
  expect(proof.v1Ciphertext).toBeTruthy();
  expect(proof.v2Ciphertext).toBeTruthy();
  expect(proof.v2Ciphertext).not.toBe(proof.v1Ciphertext);
  expect(proof.v2Outbox).toBe(true);
  expect(proof.recoveryReady).toBe(true);
  expect(proof.attachmentRestored).toBe(true);
  expect(proof.proof).toBe(true);

  await page.reload();
  await expect(page.locator('#legacy-vault-card')).toBeHidden();
  await expect(page.locator('#workspace')).toBeVisible();
  await openDiagnosticCard(page);
  await expect(page.locator('#draft')).toHaveValue(marker);
});

test('blocks legacy recovery when V2 already contains different unsynced data', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { PilotVault } = await import('/pilot/pilot-vault.js');
    const v1 = await PilotVault.open();
    await v1.provision('654321');
    await v1.putJson('outbox', 'operation:collision', { status: 'legacy' }, 1);
    const v2 = await PilotVault.open();
    await v2.provisionDeviceKey();
    await v2.putJson('outbox', 'operation:collision', { status: 'newer' }, 2);
  });
  await page.goto('/pilot/');
  await expect(page.locator('#legacy-vault-card')).toBeVisible();
  await page.locator('#legacy-vault-pin').fill('654321');
  await page.locator('#legacy-vault-recover').click();
  await expect(page.locator('#legacy-vault-status')).toContainText('Conflito com rascunho/outbox');
  await expect(page.locator('#workspace')).toBeHidden();
  const intact = await page.evaluate(async () => {
    const request = indexedDB.open('airtrust-pilot-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('meta', 'readonly');
    return await new Promise((resolve, reject) => {
      const req = tx.objectStore('meta').get('vault-config');
      req.onsuccess = () => resolve(req.result.version === 1);
      req.onerror = () => reject(req.error);
    });
  });
  expect(intact).toBe(true);
});

test('reports denied persistence without claiming permanent local retention', async ({ page }) => {
  await page.addInitScript(() => {
    // WebKit may not expose navigator.storage at all. Provide the API itself
    // so this tests an explicit denial, not the separate "unavailable" state.
    const storage = navigator.storage;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persist: async () => false,
        estimate: async () => storage?.estimate
          ? storage.estimate()
          : { usage: 0, quota: 0 },
      },
    });
  });
  await page.goto('/pilot/');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#storage-retention-status')).toHaveAttribute('data-retention', 'denied');
  await expect(page.locator('#storage-retention-status')).toContainText('não concedeu retenção persistente');
});

test('marks quota failure without claiming the diagnostic draft was saved', async ({ page }) => {
  await page.goto('/pilot/');
  await expect(page.locator('#workspace')).toBeVisible();
  await openDiagnosticCard(page);
  await page.evaluate(() => {
    const previous = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'rdv_drafts') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return previous.apply(this, args as Parameters<typeof previous>);
    };
  });
  await page.locator('#draft').fill('quota-failure-test');
  await page.locator('#save-now').click();
  await expect(page.locator('#save-status')).toContainText('Falha ao salvar no tablet');
  await expect(page.locator('#save-status')).not.toContainText('Salvo no tablet');
});

test('keeps V1 intact and retries recovery after an interrupted V2 write', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { PilotVault } = await import('/pilot/pilot-vault.js');
    const vault = await PilotVault.open();
    await vault.provision('654321');
    await vault.putJson('rdv_drafts', 'phase1-synthetic-rdv-draft',
      { observacoes: 'restore-after-interruption' }, 1);
  });
  await page.goto('/pilot/');
  await expect(page.locator('#legacy-vault-card')).toBeVisible();
  await page.evaluate(() => {
    const previous = IDBObjectStore.prototype.put;
    (window as any).__restorePut = () => { IDBObjectStore.prototype.put = previous; };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'rdv_drafts') throw new DOMException('Simulated write abort', 'AbortError');
      return previous.apply(this, args as Parameters<typeof previous>);
    };
  });
  await page.locator('#legacy-vault-pin').fill('654321');
  await page.locator('#legacy-vault-recover').click();
  await expect(page.locator('#legacy-vault-status')).toContainText('armazenamento antigo foi preservado');
  await expect(page.locator('#workspace')).toBeHidden();

  await page.evaluate(() => (window as any).__restorePut());
  await page.reload();
  await expect(page.locator('#legacy-vault-card')).toBeVisible();
  await page.locator('#legacy-vault-pin').fill('654321');
  await page.locator('#legacy-vault-recover').click();
  await expect(page.locator('#workspace')).toBeVisible();
  await openDiagnosticCard(page);
  await expect(page.locator('#draft')).toHaveValue('restore-after-interruption');
});

test('lost acknowledgement retains encrypted outbox until draft confirmation is durable', async ({ page }) => {
  await page.goto('/pilot/');
  await expect(page.locator('#workspace')).toBeVisible();

  const outcome = await page.evaluate(async () => {
    const { PilotVault } = await import('/pilot/pilot-vault.js');
    const { persistPilotFinalSyncResult } = await import('/pilot/pilot-sync-receipt.js');
    const vault = await PilotVault.open();
    const ready = await vault.openAutomatically();
    if (ready.status !== 'ready') throw new Error('Pilot vault unavailable for acceptance test');
    const operationId = crypto.randomUUID();
    const outboxId = 'operation:qa:' + operationId;
    const receiptId = 'receipt:qa:' + operationId;
    const command = {
      client_operation_id: operationId,
      flight_id: 101,
      local_sequence: 2,
      payload_hash: 'a'.repeat(64),
    };
    await vault.putJson('outbox', outboxId, { status: 'pending', command }, 1);
    const pendingRecord = await vault.getJson('outbox', outboxId);
    const accepted = {
      client_operation_id: operationId,
      status: 'accepted',
      canonical_entity_id: '202',
      server_entity_version: 3,
      server_received_at: '2026-10-17T19:00:00Z',
    };

    let rejected = false;
    try {
      await persistPilotFinalSyncResult({
        vault, outboxRecord: pendingRecord, result: accepted, receiptId,
        markAccepted: async () => {
          throw new DOMException('Simulated draft write interruption', 'QuotaExceededError');
        },
      });
    } catch (error) {
      rejected = error?.name === 'QuotaExceededError';
    }
    const outboxRetained = Boolean(await vault.getJson('outbox', outboxId));
    const receiptRetained = await vault.getJson('sync_receipts', receiptId);
    let acknowledged = 0;

    // A subsequent delivery reuses the same operation and server receipt.
    await persistPilotFinalSyncResult({
      vault, outboxRecord: await vault.getJson('outbox', outboxId),
      result: { ...accepted, status: 'already_accepted' },
      receiptId,
      markAccepted: async (retryCommand, retryResult) => {
        if (retryCommand.client_operation_id !== operationId ||
            retryResult.status !== 'already_accepted') {
          throw new Error('Lost original operation identity');
        }
        acknowledged += 1;
      },
    });

    return {
      rejected,
      outboxRetained,
      receiptPersisted: receiptRetained?.value?.command_identity?.payload_hash === 'a'.repeat(64),
      localAckCount: acknowledged,
      outboxRemovedAfterAck: !(await vault.getJson('outbox', outboxId)),
    };
  });

  expect(outcome).toEqual({
    rejected: true,
    outboxRetained: true,
    receiptPersisted: true,
    localAckCount: 1,
    outboxRemovedAfterAck: true,
  });
});
