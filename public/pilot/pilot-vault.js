const DB_NAME = 'airtrust-pilot-v1';
const DEVICE_DB_NAME = 'airtrust-pilot-v2';
const DB_VERSION = 3;
const VAULT_CONFIG_ID = 'vault-config';
const WRAP_AAD = new TextEncoder().encode('airtrust-pilot-vault-key-v1');
const KDF_ITERATIONS = 210000;
const DEVICE_CONFIG_VERSION = 2;

export const PILOT_VAULT_STORES = Object.freeze([
  'meta',
  'offline_leases',
  'flight_packages',
  'rdv_drafts',
  'stage_drafts',
  'fuel_entries',
  'attachments',
  'outbox',
  'sync_receipts',
  'workflow_receipts',
  'conflicts',
  'active_sessions',
]);

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha no IndexedDB'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('Transação abortada'));
    transaction.onerror = () => reject(transaction.error || new Error('Falha na transação'));
  });
}

function openPilotDatabase(databaseName = DB_NAME) {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(new Error('IndexedDB indisponível neste navegador'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DB_VERSION);
    request.onerror = () =>
      reject(request.error || new Error('Falha ao abrir armazenamento offline'));
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const storeName of PILOT_VAULT_STORES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'id' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function deriveWrappingKey(pin, salt) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: KDF_ITERATIONS,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function recordAad(storeName, id) {
  return new TextEncoder().encode(DB_NAME + ':' + storeName + ':' + id + ':v1');
}

export class PilotVault {
  constructor(database) {
    this.database = database;
    this.masterKey = null;
  }

  static async open() {
    const primaryDatabase = await openPilotDatabase(DB_NAME);
    const primaryVault = new PilotVault(primaryDatabase);
    const primaryConfig = await primaryVault.getVaultConfig();

    if (primaryConfig && Number(primaryConfig.version) < DEVICE_CONFIG_VERSION) {
      // Keep every legacy encrypted record untouched. The current app uses a separate
      // device-key vault so no legacy PIN prompt blocks the pilot workflow.
      primaryDatabase.close();
      return new PilotVault(await openPilotDatabase(DEVICE_DB_NAME));
    }

    return primaryVault;
  }

  async isProvisioned() {
    const transaction = this.database.transaction('meta', 'readonly');
    const record = await requestResult(transaction.objectStore('meta').get(VAULT_CONFIG_ID));
    await transactionDone(transaction);
    return Boolean(record);
  }

  async getVaultConfig() {
    const transaction = this.database.transaction('meta', 'readonly');
    const record = await requestResult(transaction.objectStore('meta').get(VAULT_CONFIG_ID));
    await transactionDone(transaction);
    return record || null;
  }

  async provisionDeviceKey() {
    if (await this.isProvisioned()) {
      throw new Error('Este tablet já possui um vault offline configurado.');
    }
    const deviceKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const transaction = this.database.transaction('meta', 'readwrite');
    transaction.objectStore('meta').put({
      id: VAULT_CONFIG_ID,
      version: DEVICE_CONFIG_VERSION,
      cipher: 'AES-GCM-256',
      key_protection: 'NON_EXTRACTABLE_DEVICE_CRYPTOKEY',
      device_key: deviceKey,
      created_at: new Date().toISOString(),
    });
    await transactionDone(transaction);
    this.masterKey = deviceKey;
  }

  async openAutomatically() {
    const config = await this.getVaultConfig();
    if (!config) {
      await this.provisionDeviceKey();
      return { status: 'ready', migrated: false };
    }
    if (Number(config.version) >= DEVICE_CONFIG_VERSION && config.device_key) {
      this.masterKey = config.device_key;
      return { status: 'ready', migrated: false };
    }
    return { status: 'legacy-pin-required', migrated: false };
  }

  async migrateLegacyPin(pin) {
    const config = await this.getVaultConfig();
    if (!config || Number(config.version) !== 1) {
      throw new Error('Armazenamento antigo não encontrado.');
    }
    await this.unlock(pin);
    const transaction = this.database.transaction('meta', 'readwrite');
    transaction.objectStore('meta').put({
      id: VAULT_CONFIG_ID,
      version: DEVICE_CONFIG_VERSION,
      cipher: 'AES-GCM-256',
      key_protection: 'NON_EXTRACTABLE_DEVICE_CRYPTOKEY',
      device_key: this.masterKey,
      migrated_from: 'PBKDF2_PIN_V1',
      migrated_at: new Date().toISOString(),
      created_at: config.created_at || new Date().toISOString(),
    });
    await transactionDone(transaction);
    return { status: 'ready', migrated: true };
  }

  async getOrCreateDeviceId() {
    const id = 'pilot-device-identity';
    let transaction = this.database.transaction('meta', 'readonly');
    let record = await requestResult(transaction.objectStore('meta').get(id));
    await transactionDone(transaction);
    if (record?.device_id) return String(record.device_id);

    const deviceId = crypto.randomUUID();
    transaction = this.database.transaction('meta', 'readwrite');
    transaction.objectStore('meta').put({
      id,
      version: 1,
      device_id: deviceId,
      created_at: new Date().toISOString(),
    });
    await transactionDone(transaction);

    transaction = this.database.transaction('meta', 'readonly');
    record = await requestResult(transaction.objectStore('meta').get(id));
    await transactionDone(transaction);
    if (!record?.device_id) {
      throw new Error('Falha ao persistir identidade local do tablet.');
    }
    return String(record.device_id);
  }

  async provision(pin) {
    if (typeof pin !== 'string' || pin.length < 6) {
      throw new Error('O código local antigo deve ter pelo menos 6 caracteres.');
    }
    if (await this.isProvisioned()) {
      throw new Error('Este tablet já possui um vault offline configurado.');
    }

    const salt = randomBytes(16);
    const wrapIv = randomBytes(12);
    const wrappingKey = await deriveWrappingKey(pin, salt);
    const generatedMasterKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const rawMasterKey = new Uint8Array(await crypto.subtle.exportKey('raw', generatedMasterKey));
    const wrappedKey = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: wrapIv, additionalData: WRAP_AAD },
        wrappingKey,
        rawMasterKey,
      ),
    );

    const transaction = this.database.transaction('meta', 'readwrite');
    transaction.objectStore('meta').put({
      id: VAULT_CONFIG_ID,
      version: 1,
      cipher: 'AES-GCM-256',
      kdf: 'PBKDF2-SHA256',
      kdf_iterations: KDF_ITERATIONS,
      salt: bytesToBase64(salt),
      wrap_iv: bytesToBase64(wrapIv),
      wrapped_key: bytesToBase64(wrappedKey),
      created_at: new Date().toISOString(),
    });
    await transactionDone(transaction);

    this.masterKey = await crypto.subtle.importKey(
      'raw',
      rawMasterKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  async unlock(pin) {
    const transaction = this.database.transaction('meta', 'readonly');
    const config = await requestResult(transaction.objectStore('meta').get(VAULT_CONFIG_ID));
    await transactionDone(transaction);

    if (!config) {
      throw new Error('Vault offline ainda não configurado.');
    }

    try {
      const wrappingKey = await deriveWrappingKey(pin, base64ToBytes(config.salt));
      const rawMasterKey = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: base64ToBytes(config.wrap_iv),
          additionalData: WRAP_AAD,
        },
        wrappingKey,
        base64ToBytes(config.wrapped_key),
      );
      this.masterKey = await crypto.subtle.importKey(
        'raw',
        rawMasterKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      );
    } catch {
      this.masterKey = null;
      throw new Error('Código local antigo incorreto ou armazenamento local inválido.');
    }
  }

  lock() {
    this.masterKey = null;
  }

  isUnlocked() {
    return this.masterKey !== null;
  }

  assertStore(storeName) {
    if (!PILOT_VAULT_STORES.includes(storeName) || storeName === 'meta') {
      throw new Error('Store offline não autorizada: ' + storeName);
    }
  }

  assertUnlocked() {
    if (!this.masterKey) {
      throw new Error('Vault offline bloqueado.');
    }
  }

  async encryptJsonRecord(storeName, id, value, localRevision) {
    this.assertStore(storeName);
    this.assertUnlocked();

    const iv = randomBytes(12);
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: recordAad(storeName, id) },
        this.masterKey,
        plaintext,
      ),
    );

    return {
      id,
      cipher_version: 1,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
      local_revision: Number(localRevision || 0),
      updated_at: new Date().toISOString(),
    };
  }

  async putJson(storeName, id, value, localRevision) {
    const record = await this.encryptJsonRecord(storeName, id, value, localRevision);
    const transaction = this.database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(record);
    await transactionDone(transaction);
  }

  async putJsonBatch(entries) {
    this.assertUnlocked();
    if (!Array.isArray(entries) || entries.length === 0) return;

    const records = await Promise.all(
      entries.map(async (entry) => ({
        storeName: entry.storeName,
        record: await this.encryptJsonRecord(
          entry.storeName,
          entry.id,
          entry.value,
          entry.localRevision,
        ),
      })),
    );

    const storeNames = [...new Set(records.map((entry) => entry.storeName))];
    const transaction = this.database.transaction(storeNames, 'readwrite');
    for (const { storeName, record } of records) {
      transaction.objectStore(storeName).put(record);
    }
    await transactionDone(transaction);
  }

  async decryptRecord(storeName, record) {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(record.iv),
        additionalData: recordAad(storeName, record.id),
      },
      this.masterKey,
      base64ToBytes(record.ciphertext),
    );

    return {
      id: record.id,
      value: JSON.parse(new TextDecoder().decode(plaintext)),
      localRevision: Number(record.local_revision || 0),
      updatedAt: record.updated_at || null,
    };
  }

  async getJson(storeName, id) {
    this.assertStore(storeName);
    this.assertUnlocked();

    const transaction = this.database.transaction(storeName, 'readonly');
    const record = await requestResult(transaction.objectStore(storeName).get(id));
    await transactionDone(transaction);
    if (!record) return null;

    return this.decryptRecord(storeName, record);
  }

  async listJson(storeName) {
    this.assertStore(storeName);
    this.assertUnlocked();

    const transaction = this.database.transaction(storeName, 'readonly');
    const records = await requestResult(transaction.objectStore(storeName).getAll());
    await transactionDone(transaction);

    return Promise.all(records.map((record) => this.decryptRecord(storeName, record)));
  }

  async deleteJson(storeName, id) {
    this.assertStore(storeName);
    this.assertUnlocked();

    const transaction = this.database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    await transactionDone(transaction);
  }
}
