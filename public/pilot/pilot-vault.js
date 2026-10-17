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

const LEGACY_RECOVERY_PROOF_ID = 'legacy-pin-v1-recovery-proof';

// Fingerprint only ciphertext and non-secret record metadata. The digest detects
// changes in the legacy vault after a previously confirmed recovery, without PIN
// access or exposing operational plaintext.
async function legacyVaultFingerprint(database) {
  const fingerprints = [];
  for (const storeName of ['meta', ...PILOT_VAULT_STORES.filter((store) => store !== 'meta')]) {
    const transaction = database.transaction(storeName, 'readonly');
    const rows = await requestResult(transaction.objectStore(storeName).getAll());
    await transactionDone(transaction);
    for (const record of rows.sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
      const encrypted = record.ciphertext_bytes || record.ciphertext || record.wrapped_key || '';
      const data = typeof encrypted === 'string'
        ? new TextEncoder().encode(encrypted)
        : new Uint8Array(encrypted);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
      fingerprints.push([storeName, String(record.id), record.local_revision ?? '',
        record.updated_at ?? '', bytesToBase64(digest)].join(':'));
    }
  }
  const finalDigest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(fingerprints.join('\n')),
  );
  return bytesToBase64(new Uint8Array(finalDigest));
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
      // Never skip a PIN-encrypted vault. Copy verified records to V2 only with
      // the operator's PIN. V1 is kept unchanged for recovery/rollback.
      const sourceFingerprint = await legacyVaultFingerprint(primaryDatabase);
      const current = new PilotVault(await openPilotDatabase(DEVICE_DB_NAME));
      const proof = await current.getMetaRecord(LEGACY_RECOVERY_PROOF_ID);
      if (proof?.source_fingerprint === sourceFingerprint && proof?.completed === true) {
        primaryDatabase.close();
      } else {
        current.legacyVault = primaryVault;
        current.legacyFingerprint = sourceFingerprint;
      }
      return current;
    }

    return primaryVault;
  }

  async getMetaRecord(id) {
    const transaction = this.database.transaction('meta', 'readonly');
    const record = await requestResult(transaction.objectStore('meta').get(id));
    await transactionDone(transaction);
    return record || null;
  }

  async recoverLegacyPin(pin) {
    if (!this.legacyVault || !this.legacyFingerprint) {
      throw new Error('Vault PIN antigo não está pendente de recuperação.');
    }
    // Wrong PIN must not provision V2, touch source records or dismiss readiness.
    await this.legacyVault.unlock(pin);

    const source = this.legacyVault;
    const staged = [];
    for (const storeName of PILOT_VAULT_STORES) {
      const transaction = source.database.transaction(storeName, 'readonly');
      const records = await requestResult(transaction.objectStore(storeName).getAll());
      await transactionDone(transaction);
      for (const record of records) {
        if (storeName === 'meta' && record.id === VAULT_CONFIG_ID) continue;
        if (storeName === 'meta') {
          staged.push({ storeName, id: record.id, rawMeta: record });
        } else if (record.payload_type === 'bytes-v1') {
          const decrypted = await source.getBytes(storeName, record.id);
          if (!decrypted) throw new Error('Anexo legado não pôde ser recuperado.');
          staged.push({ storeName, id: record.id, bytes: decrypted.bytes,
            localRevision: decrypted.localRevision });
        } else {
          const decrypted = await source.decryptRecord(storeName, record);
          staged.push({ storeName, id: record.id, value: decrypted.value,
            localRevision: decrypted.localRevision });
        }
      }
    }

    const config = await this.getVaultConfig();
    if (!config) {
      await this.provisionDeviceKey();
    } else if (Number(config.version) >= DEVICE_CONFIG_VERSION && config.device_key) {
      this.masterKey = config.device_key;
    } else {
      throw new Error('Vault atual inválido; recuperação bloqueada para proteger os dados.');
    }

    // Fail closed on a collision: never replace unsynced records already in V2.
    const recordsToWrite = [];
    for (const entry of staged) {
      const transaction = this.database.transaction(entry.storeName, 'readonly');
      const existing = await requestResult(transaction.objectStore(entry.storeName).get(entry.id));
      await transactionDone(transaction);
      if (existing) {
        if (entry.storeName === 'meta') {
          if (JSON.stringify(existing) !== JSON.stringify(entry.rawMeta)) {
            throw new Error('Identidade local divergente entre vault antigo e atual; recuperação bloqueada.');
          }
        } else if (entry.bytes) {
          const current = await this.getBytes(entry.storeName, entry.id);
          const same = current?.localRevision === entry.localRevision &&
            current?.bytes.length === entry.bytes.length &&
            current.bytes.every((byte, index) => byte === entry.bytes[index]);
          if (!same) throw new Error('Conflito com anexo offline existente no tablet.');
        } else {
          const current = await this.getJson(entry.storeName, entry.id);
          if (current?.localRevision !== entry.localRevision ||
              JSON.stringify(current.value) !== JSON.stringify(entry.value)) {
            throw new Error('Conflito com rascunho/outbox já existente no tablet.');
          }
        }
        continue;
      }
      const record = entry.storeName === 'meta'
        ? entry.rawMeta
        : entry.bytes
          ? await this.encryptBytesRecord(entry.storeName, entry.id, entry.bytes, entry.localRevision)
          : await this.encryptJsonRecord(entry.storeName, entry.id, entry.value, entry.localRevision);
      recordsToWrite.push({ storeName: entry.storeName, record });
    }

    if (recordsToWrite.length) {
      const stores = [...new Set(recordsToWrite.map((entry) => entry.storeName))];
      const transaction = this.database.transaction(stores, 'readwrite');
      for (const entry of recordsToWrite) transaction.objectStore(entry.storeName).put(entry.record);
      await transactionDone(transaction);
    }

    // Only a complete decrypting read-back may mark the recovery as successful.
    for (const entry of staged) {
      if (entry.storeName === 'meta') {
        const current = await this.getMetaRecord(entry.id);
        if (JSON.stringify(current) !== JSON.stringify(entry.rawMeta)) {
          throw new Error('Falha de verificação do metadado recuperado.');
        }
      } else if (entry.bytes) {
        const current = await this.getBytes(entry.storeName, entry.id);
        if (current?.localRevision !== entry.localRevision ||
            current?.bytes.length !== entry.bytes.length ||
            !current.bytes.every((byte, index) => byte === entry.bytes[index])) {
          throw new Error('Falha no read-back do anexo recuperado.');
        }
      } else {
        const current = await this.getJson(entry.storeName, entry.id);
        if (current?.localRevision !== entry.localRevision ||
            JSON.stringify(current.value) !== JSON.stringify(entry.value)) {
          throw new Error('Falha no read-back do rascunho/outbox recuperado.');
        }
      }
    }
    const proof = { id: LEGACY_RECOVERY_PROOF_ID, completed: true,
      source_fingerprint: this.legacyFingerprint, records_verified: staged.length,
      completed_at: new Date().toISOString() };
    const confirmation = this.database.transaction('meta', 'readwrite');
    confirmation.objectStore('meta').put(proof);
    await transactionDone(confirmation);
    if ((await this.getMetaRecord(LEGACY_RECOVERY_PROOF_ID))?.source_fingerprint !==
        this.legacyFingerprint) {
      throw new Error('Confirmação da recuperação local não foi persistida.');
    }

    source.lock();
    source.database.close();
    this.legacyVault = null;
    this.legacyFingerprint = null;
    return { status: 'ready', migrated: true, recordsVerified: staged.length };
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
    if (this.legacyVault) return { status: 'legacy-pin-required', migrated: false };
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
    // Compatibility entrypoint: never rewrite the original PIN vault in place.
    // The only permitted migration is a verified copy into V2.
    return this.recoverLegacyPin(pin);
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

  async encryptBytesRecord(storeName, id, bytes, localRevision) {
    this.assertStore(storeName);
    this.assertUnlocked();

    const plaintext = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (plaintext.byteLength === 0) {
      throw new Error('Anexo offline vazio.');
    }
    const iv = randomBytes(12);
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
      payload_type: 'bytes-v1',
      iv: bytesToBase64(iv),
      ciphertext_bytes: ciphertext,
      local_revision: Number(localRevision || 0),
      updated_at: new Date().toISOString(),
    };
  }

  async putBytes(storeName, id, bytes, localRevision) {
    const record = await this.encryptBytesRecord(storeName, id, bytes, localRevision);
    const transaction = this.database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(record);
    await transactionDone(transaction);
  }

  async getBytes(storeName, id) {
    this.assertStore(storeName);
    this.assertUnlocked();

    const transaction = this.database.transaction(storeName, 'readonly');
    const record = await requestResult(transaction.objectStore(storeName).get(id));
    await transactionDone(transaction);
    if (!record) return null;
    if (record.payload_type !== 'bytes-v1' || !record.ciphertext_bytes) {
      throw new Error('Anexo offline incompatível com esta versão do Pilot App.');
    }

    const ciphertext =
      record.ciphertext_bytes instanceof Uint8Array
        ? record.ciphertext_bytes
        : new Uint8Array(record.ciphertext_bytes);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(record.iv),
        additionalData: recordAad(storeName, record.id),
      },
      this.masterKey,
      ciphertext,
    );

    return {
      id: record.id,
      bytes: new Uint8Array(plaintext),
      localRevision: Number(record.local_revision || 0),
      updatedAt: record.updated_at || null,
    };
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
