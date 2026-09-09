import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getOfflineSyncReceipt,
  replayReceipt,
  recordOfflineSyncConflict,
  getActiveRdvByFlight,
  getRdvOrThrow,
  listEtapas,
  normalizeEtapaInput,
  validateEtapaInput,
  computeEtapaTempos,
  normalizeRdvInput,
  assertRdvRules,
} = vi.hoisted(() => ({
  getOfflineSyncReceipt: vi.fn(),
  replayReceipt: vi.fn(),
  recordOfflineSyncConflict: vi.fn(),
  getActiveRdvByFlight: vi.fn(),
  getRdvOrThrow: vi.fn(),
  listEtapas: vi.fn(),
  normalizeEtapaInput: vi.fn(),
  validateEtapaInput: vi.fn(),
  computeEtapaTempos: vi.fn(),
  normalizeRdvInput: vi.fn(),
  assertRdvRules: vi.fn(),
}));

vi.mock('../../services/controle-voos/pilot-offline-sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/controle-voos/pilot-offline-sync')>();
  return {
    ...actual,
    getOfflineSyncReceipt,
    replayReceipt,
    recordOfflineSyncConflict,
  };
});

vi.mock('../../repositories/controle-voos/rdv-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../repositories/controle-voos/rdv-repository')>();
  return {
    ...actual,
    getActiveRdvByFlight,
    getRdvOrThrow,
  };
});

vi.mock('../../services/controle-voos/rdv-etapas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/controle-voos/rdv-etapas')>();
  return {
    ...actual,
    listEtapas,
    normalizeEtapaInput,
    validateEtapaInput,
    computeEtapaTempos,
  };
});

vi.mock('../../services/controle-voos/rdv-validation', () => ({
  normalizeRdvInput,
  assertRdvRules,
}));

import { applyPilotOfflineSnapshotCommand } from '../../services/controle-voos/pilot-offline-sync-apply';

const flight = {
  id: 42,
  empresa_id: 7,
  prefixo: 'PR-TST',
  data_programacao: '2026-09-09',
  origem_id: 1,
  destino_id: 2,
  tipo_voo_id: 1,
  natureza_voo_id: 1,
  aeronave_id: 3,
  horario_previsto_partida: '2026-09-09T10:00:00Z',
  horario_previsto_chegada: '2026-09-09T11:00:00Z',
  horario_real_partida: null,
  horario_real_chegada: null,
  status: 'planejado',
  observacoes: null,
  cancelado_motivo_id: null,
  alternado_destino_id: null,
  versao: 6,
  created_at: '2026-09-09T08:00:00Z',
  updated_at: '2026-09-09T09:00:00Z',
} as any;

const rdv = {
  id: 90,
  empresa_id: 7,
  voo_id: 42,
  numero: 'RDV-20260909-PRTST',
  data_voo: '2026-09-09',
  status: 'rascunho',
  workflow_status: 'rascunho',
  versao: 3,
} as any;

const command = (overrides: Record<string, unknown> = {}) =>
  ({
    client_operation_id: '123e4567-e89b-42d3-a456-426614174000',
    tenant_id: 7,
    user_id: 70,
    flight_id: 42,
    device_id: 'device-1234567890',
    command_type: 'rdv_snapshot_upsert_v1',
    entity_type: 'rdv_snapshot',
    operation_type: 'upsert',
    base_server_version: 3,
    base_flight_version: 6,
    local_sequence: 5,
    claimed_at: '2026-09-09T19:30:00.000Z',
    payload_hash: 'a'.repeat(64),
    lease: {
      envelope_version: 1,
      alg: 'ES256',
      key_id: 'pilot-test-key',
      payload: 'payload',
      signature: 'signature',
    },
    payload: {
      source_package_id: 'pilot-offline:v1:voo:42:v6:rdv:3',
      source_rdv_id: 90,
      rdv: { numero: 'RDV-20260909-PRTST', data_voo: '2026-09-09' },
      stages: [
        {
          source_stage_id: 10,
          source_stage_updated_at: '2026-09-09T09:02:00Z',
          fields: { numero_etapa: 1, origem_icao: 'SBME', destino_icao: '9PCP' },
        },
      ],
    },
    ...overrides,
  }) as any;

function db() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      run: vi.fn(),
    })),
    batch: vi.fn(),
  } as any;
}

describe('Pilot offline snapshot apply orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeRdvInput.mockReturnValue({
      numero: 'RDV-20260909-PRTST',
      data_voo: '2026-09-09',
    });
    normalizeEtapaInput.mockReturnValue({
      numero_etapa: 1,
      origem_icao: 'SBME',
      destino_icao: '9PCP',
    });
    computeEtapaTempos.mockReturnValue({
      tempo_decolagem_pouso: null,
      tempo_total: null,
    });
    getActiveRdvByFlight.mockResolvedValue(rdv);
    listEtapas.mockResolvedValue([
      {
        id: 10,
        numero_etapa: 1,
        updated_at: '2026-09-09T09:02:00Z',
      },
    ]);
    recordOfflineSyncConflict.mockImplementation(async (_db: unknown, input: any) => ({
      client_operation_id: input.command.client_operation_id,
      status: 'conflict',
      server_received_at: null,
      server_entity_version: null,
      canonical_entity_id: null,
      error_code: input.code,
      conflict: input.detail,
    }));
  });

  it('short-circuits an existing idempotency receipt before any domain read/write', async () => {
    const database = db();
    const prior = { id: 1, payload_hash: 'a'.repeat(64) };
    const replayed = { status: 'already_accepted', server_entity_version: 4 };
    getOfflineSyncReceipt.mockResolvedValue(prior);
    replayReceipt.mockReturnValue(replayed);

    await expect(
      applyPilotOfflineSnapshotCommand({
        db: database,
        empresaId: 7,
        userId: 70,
        funcionarioId: 77,
        flight,
        command: command(),
      }),
    ).resolves.toBe(replayed);

    expect(replayReceipt).toHaveBeenCalledWith(prior, expect.anything());
    expect(getActiveRdvByFlight).not.toHaveBeenCalled();
    expect(database.batch).not.toHaveBeenCalled();
  });

  it('records a flight-version conflict before opening a mutation batch', async () => {
    const database = db();
    getOfflineSyncReceipt.mockResolvedValue(null);

    const result = await applyPilotOfflineSnapshotCommand({
      db: database,
      empresaId: 7,
      userId: 70,
      funcionarioId: 77,
      flight: { ...flight, versao: 7 },
      command: command(),
    });

    expect(result).toMatchObject({
      status: 'conflict',
      error_code: 'CONTROLE_VOOS_PILOT_SYNC_FLIGHT_VERSION_CONFLICT',
    });
    expect(recordOfflineSyncConflict).toHaveBeenCalled();
    expect(listEtapas).not.toHaveBeenCalled();
    expect(database.batch).not.toHaveBeenCalled();
  });

  it('records stage-topology drift instead of applying last-write-wins', async () => {
    const database = db();
    getOfflineSyncReceipt.mockResolvedValue(null);
    listEtapas.mockResolvedValue([
      { id: 11, numero_etapa: 1, updated_at: '2026-09-09T09:02:00Z' },
    ]);

    const result = await applyPilotOfflineSnapshotCommand({
      db: database,
      empresaId: 7,
      userId: 70,
      funcionarioId: 77,
      flight,
      command: command(),
    });

    expect(result).toMatchObject({
      status: 'conflict',
      error_code: 'CONTROLE_VOOS_PILOT_SYNC_STAGE_TOPOLOGY_CONFLICT',
    });
    expect(database.batch).not.toHaveBeenCalled();
  });

  it('orders the atomic D1 batch as RDV CAS, stages, event, receipt', () => {
    const source = readFileSync(
      join(
        __dirname,
        '../../services/controle-voos/pilot-offline-sync-apply.ts',
      ),
      'utf8',
    );
    expect(source).toContain(
      'input.db.batch([\n      rdvStatement,\n      ...stageStatements,\n      eventStatement,\n      receiptStatement,\n    ])',
    );
    expect(source).toContain('AND ${stageCas.sql}');
    expect(source).not.toContain('last-write-wins');
  });
});
