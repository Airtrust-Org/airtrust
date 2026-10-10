import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// Exercise the actual shipping Pilot App function bodies. The existing shell
// assertions validate source contracts but do not run the attachment-failure
// path, which is the reported operational regression.
const source = readFileSync(resolve(process.cwd(), 'public/pilot/pilot-app.js'), 'utf8');

function functionBody(name: string, followingDeclaration: string): string {
  const begin = source.indexOf(`async function ${name}(`);
  const end = source.indexOf(followingDeclaration, begin);
  if (begin < 0 || end < 0 || end <= begin) {
    throw new Error(`Pilot function boundary changed: ${name}`);
  }
  return source.slice(begin, end);
}

const actualFunctions = [
  functionBody('cacheFlightDocumentForOffline', 'async function cacheFlightDocumentsForOffline('),
  functionBody('cacheFlightDocumentsForOffline', 'function changedFlightDocumentLabels('),
  functionBody('prepareFlightPackage', 'async function ensurePilotShellReadyForFlight('),
].join('\n');

type StoredRecord = {
  value: {
    package: { contract: { package_id: string }; voo: { id: number } };
    offline_documents: Array<{
      id: number; type: string; available_offline: boolean; cache_error: string | null;
    }>;
  };
  localRevision: number;
};

function setupSandbox(options: { rejectPackageWrite?: boolean } = {}) {
  const packageData = {
    contract: { package_id: 'authorized-qa-flight-601' },
    voo: { id: 601 },
    documents: [
      { id: 101, type: 'WEATHER_REPORT', label: 'Weather Report', file_name: 'weather.pdf', size: 4 },
      { id: 102, type: 'PLANO_VOO', label: 'Planejamento de voo', file_name: 'planning.pdf', size: 20 },
    ],
  };

  class PilotOnlineRequestError extends Error {
    constructor(readonly status: number) { super('Falha HTTP do arquivo'); }
  }

  let saved: StoredRecord | null = null;
  const messages: Array<{ message: string; status: string }> = [];
  const opened: StoredRecord[] = [];
  const cachedAttachments: string[] = [];
  const refreshOnlineButton = { disabled: false };

  const sandbox = {
    PilotOnlineRequestError,
    Blob,
    navigator: { onLine: true },
    offlineFlightLocked: false,
    refreshOnlineButton,
    vault: {
      isUnlocked: () => true,
      getJson: async () => saved,
      putJson: async (_store: string, _key: string, value: StoredRecord['value'], localRevision: number) => {
        if (options.rejectPackageWrite) throw new Error('IndexedDB indisponível');
        saved = { value, localRevision };
      },
      getBytes: async () => null,
      putBytes: async (_store: string, key: string) => { cachedAttachments.push(key); },
    },
    authenticatedGet: async () => ({ data: packageData }),
    authenticatedBlob: async (path: string) => {
      if (path.endsWith('/101')) throw new PilotOnlineRequestError(503);
      if (path.endsWith('/102')) return new Blob([new Uint8Array([1, 2])], { type: 'application/pdf' });
      throw new Error(`Unexpected document ${path}`);
    },
    verifyCachedFlightDocument: async () => null,
    sha256Hex: async () => 'unused',
    flightDocumentCacheKey: (id: number, eventId: number) => `flight:${id}:document:${eventId}`,
    currentFlightDocuments: (value: typeof packageData) => value.documents,
    flightDocumentLabel: (type: string) => type,
    validateOfflinePackage: (value: typeof packageData, expectedId: number) => {
      if (value.voo.id !== expectedId || !value.contract.package_id) throw new Error('Pacote inválido');
    },
    changedFlightDocumentLabels: () => [],
    offlineDocumentPreparationSummary: () => 'Documentos conferidos',
    setSessionMessage: (message: string, status: string) => { messages.push({ message, status }); },
    loadCachedPackages: async () => {},
    openPackageRecord: (record: StoredRecord) => { opened.push(record); },
    updateStorageEstimate: async () => {},
  };

  const prepare = runInNewContext(
    `${actualFunctions}\nprepareFlightPackage;`,
    sandbox,
  ) as (flightId: number) => Promise<StoredRecord | null>;

  return {
    prepare,
    messages,
    opened,
    cachedAttachments,
    refreshOnlineButton,
    getSaved: () => saved,
  };
}

describe('Pilot App actual offline document failure path', () => {
  it('abre pacote cifrado mesmo se Weather Report retornar HTTP 503 e Planejamento tiver tamanho divergente', async () => {
    const app = setupSandbox();

    const record = await app.prepare(601);

    expect(record).not.toBeNull();
    expect(app.opened).toHaveLength(1);
    expect(app.opened[0]).toBe(record);
    expect(app.getSaved()).toBe(record);
    expect(record?.localRevision).toBe(1);
    expect(record?.value.offline_documents).toEqual([
      expect.objectContaining({ id: 101, type: 'WEATHER_REPORT', available_offline: false, cache_error: 'HTTP_503' }),
      expect.objectContaining({ id: 102, type: 'PLANO_VOO', available_offline: false, cache_error: 'INTEGRITY_MISMATCH' }),
    ]);
    expect(app.cachedAttachments).toHaveLength(0);
    expect(app.messages.at(-1)).toMatchObject({ status: 'attention' });
    expect(app.messages.at(-1)?.message).toContain('documentos pendentes de download');
    expect(app.refreshOnlineButton.disabled).toBe(false);
  });

  it('mantém o voo indisponível se o pacote principal não puder ser persistido no vault', async () => {
    const app = setupSandbox({ rejectPackageWrite: true });

    const record = await app.prepare(601);

    expect(record).toBeNull();
    expect(app.opened).toHaveLength(0);
    expect(app.getSaved()).toBeNull();
    expect(app.messages.at(-1)).toMatchObject({ status: 'error' });
    expect(app.refreshOnlineButton.disabled).toBe(false);
  });
});
