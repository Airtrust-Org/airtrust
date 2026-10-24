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


test.describe('Completed RDV online consultation with mocked authorization', () => {
  // Online API mocks must remain observable in WebKit; the Service Worker path
  // is exercised independently by the real vault/offline tests below.
  test.use({ serviceWorkers: 'block' });

  test('reopens a completed flight without edit lease when secure vault is supported; otherwise fails closed', async ({ page }) => {
  // Playwright WebKit builds differ in whether IndexedDB can persist a non-extractable
  // CryptoKey. Do not fake an encrypted vault or weaken production crypto to hide this.
  await page.goto('/');
  const canPersistDeviceKey = await page.evaluate(async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    );
    const name = 'pilot-ci-crypto-key-probe';
    const request = indexedDB.open(name, 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => request.result.createObjectStore('meta');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const supported = await new Promise<boolean>((resolve) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
      tx.onerror = () => resolve(false);
      try {
        tx.objectStore('meta').put({ key }, 'probe');
      } catch {
        try { tx.abort(); } catch {}
        resolve(false);
      }
    });
    db.close();
    indexedDB.deleteDatabase(name);
    return supported;
  });
  if (!canPersistDeviceKey) {
    // This path is a real security assertion, not a skipped test: never proceed
    // with an unprotected offline key in an incompatible browser.
    await page.goto('/pilot/');
    await expect(page.locator('#session-status')).toContainText(
      'Este navegador não permite guardar com segurança a chave offline',
    );
    await expect(page.locator('#legacy-vault-card')).toBeHidden();
    await expect(page.locator('#flight-detail-card')).toBeHidden();
    return;
  }
  const today = await page.evaluate(() => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  });
  let editLeaseRequests = 0;
  await page.addInitScript(() => localStorage.setItem('airtrust_token', 'synthetic-access'));
  await page.route('**/api/controle-voos/voos/meus', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [{
      id: 42, prefixo: 'PR-QA', numero_voo: 'QA-42',
      data_programacao: today, origem_id: 1, destino_id: 2,
      versao: 4, rdv_versao: 2,
    }] }),
  }));
  await page.route('**/api/controle-voos/voos/42/offline-lease', (route) => {
    editLeaseRequests += 1;
    return route.fulfill({ status: 409, contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Read-only RDV' }) });
  });
  await page.route('**/api/controle-voos/voos/42/offline-package', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, data: {
      contract: { name: 'airtrust-pilot-offline-package', version: 1,
        read_only: true, sync_supported: true, regulated_edb: false,
        package_id: 'qa-flight-42-v4' },
      identity: { tenant_id: 7, user_id: 70, funcionario_id: 77 },
      voo: { id: 42, prefixo: 'PR-QA', numero_voo: 'QA-42',
        data_programacao: today, origem_id: 1, destino_id: 2,
        status: 'concluido_operacionalmente', versao: 4 },
      rdv: { id: 90, numero: 'RDV-QA-42',
        status: 'preenchimento_finalizado', workflow_status: 'enviado', versao: 2 },
      origem: { codigo_icao: 'SBME' }, destino: { codigo_icao: 'SBAA' },
      tripulantes: [], etapas: [], abastecimentos: [],
      aeronave: { modelo: 'Helicóptero de teste' },
      workspace: { contract: { name: 'airtrust-pilot-workspace' }, planning: { documentos: [] } },
    } }),
  }));
  await page.goto('/pilot/');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#session-status')).not.toContainText('Não foi possível iniciar o Pilot App');
  // Normalize the selected day on WebKit regardless of browser timezone.
  await page.locator('#authorized-flight-date').fill(today);
  await page.locator('#authorized-flight-date').dispatchEvent('change');
  try {
    await expect(page.getByRole('button', { name: 'Abrir voo' })).toHaveCount(1);
  } catch (error) {
    // Only emitted on an actual failure. Distinguishes auth, date filtering,
    // failed bootstrap, missing API data and hidden controls on WebKit.
    const diagnostic = await page.evaluate(() => {
      const get = (selector: string) => document.querySelector(selector);
      return {
        session: get('#session-status')?.textContent,
        onlineList: get('#online-flights')?.textContent,
        onlineListHtml: get('#online-flights')?.innerHTML?.slice(0, 1000),
        selectedDate: (get('#authorized-flight-date') as HTMLInputElement | null)?.value,
        connectivity: get('#connectivity')?.textContent,
        listHidden: get('#online-flights-card')?.className,
        flightDetailHidden: get('#flight-detail-card')?.className,
      };
    });
    console.log('PILOT_READONLY_WEBKIT_DIAGNOSTIC', JSON.stringify(diagnostic));
    throw error;
  }

  await page.getByRole('button', { name: 'Abrir voo' }).click();
  await expect(page.locator('#flight-detail-card')).toBeVisible();
  await expect(page.locator('#flight-detail-card')).toHaveClass(/read-only-flight/);
  await expect(page.locator('#rdv-editor-card')).toBeHidden();
  await expect(page.locator('#pilot-workspace-view')).toContainText('RDV-QA-42');
  expect(editLeaseRequests).toBe(0);

  await page.locator('#close-detail').click();
  await expect(page.locator('#flight-detail-card')).toBeHidden();
  await page.getByRole('button', { name: 'Abrir voo' }).click();
  await expect(page.locator('#flight-detail-card')).toBeVisible();
  await expect(page.locator('#flight-detail-card')).toHaveClass(/read-only-flight/);
  expect(editLeaseRequests).toBe(0);
  });
});

test('skips the legacy PIN prompt only when old encrypted stores are empty', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { PilotVault } = await import('/pilot/pilot-vault.js');
    const legacy = await PilotVault.open();
    await legacy.provision('654321');
    // An old vault config alone does not mean flight records require recovery.
  });

  await page.goto('/pilot/');
  await expect(page.locator('#legacy-vault-card')).toBeHidden();
  await expect(page.locator('#workspace')).toBeVisible();

  const proof = await page.evaluate(async () => {
    const open = (name: string) => new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const get = (db: IDBDatabase, id: string) => new Promise<any>((resolve, reject) => {
      const request = db.transaction('meta', 'readonly').objectStore('meta').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const v1 = await open('airtrust-pilot-v1');
    const v2 = await open('airtrust-pilot-v2');
    const legacy = await get(v1, 'vault-config');
    const current = await get(v2, 'vault-config');
    const receipt = await get(v2, 'legacy-pin-v1-recovery-proof');
    return {
      legacyPreserved: legacy?.version === 1,
      currentReady: current?.version === 2 && current.device_key?.extractable === false,
      emptyRecoveryVerified: receipt?.completed === true && receipt.records_verified === 0,
    };
  });
  expect(proof).toEqual({
    legacyPreserved: true,
    currentReady: true,
    emptyRecoveryVerified: true,
  });

  await page.reload();
  await expect(page.locator('#legacy-vault-card')).toBeHidden();
  await expect(page.locator('#workspace')).toBeVisible();
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
