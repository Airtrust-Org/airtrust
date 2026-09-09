const DB_NAME = 'airtrust-pilot-v1';
const DB_VERSION = 1;
const VAULT_CONFIG_ID = 'vault-config';
const WRAP_AAD = new TextEncoder().encode('airtrust-pilot-vault-key-v1');
const KDF_ITERATIONS = 210000;

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
  'conflicts',
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

function openPilotDatabase() {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(new Error('IndexedDB indisponível neste navegador'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir armazenamento offline'));
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
    return new PilotVault(await openPilotDatabase());
  }

  async isProvisioned() {
    const transaction = this.database.transaction('meta', 'readonly');
    const record = await requestResult(transaction.objectStore('meta').get(VAULT_CONFIG_ID));
    await transactionDone(transaction);
    return Boolean(record);
  }

  async provision(pin) {
    if (typeof pin !== 'string' || pin.length < 6) {
      throw new Error('O PIN offline deve ter pelo menos 6 caracteres.');
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
      throw new Error('PIN offline incorreto ou vault local inválido.');
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

  async putJson(storeName, id, value, localRevision) {
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

    const transaction = this.database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put({
      id,
      cipher_version: 1,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
      local_revision: Number(localRevision || 0),
      updated_at: new Date().toISOString(),
    });
    await transactionDone(transaction);
  }

  async getJson(storeName, id) {
    this.assertStore(storeName);
    this.assertUnlocked();

    const transaction = this.database.transaction(storeName, 'readonly');
    const record = await requestResult(transaction.objectStore(storeName).get(id));
    await transactionDone(transaction);
    if (!record) return null;

    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(record.iv),
        additionalData: recordAad(storeName, id),
      },
      this.masterKey,
      base64ToBytes(record.ciphertext),
    );

    return {
      value: JSON.parse(new TextDecoder().decode(plaintext)),
      localRevision: Number(record.local_revision || 0),
      updatedAt: record.updated_at || null,
    };
  }
}
