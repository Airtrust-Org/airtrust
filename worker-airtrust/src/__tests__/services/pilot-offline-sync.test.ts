import { describe, expect, it } from 'vitest';
import type { Env } from '../../types';
import {
  assertOfflineSyncCommandHash,
  canonicalJson,
  computeOfflineSyncCommandHash,
  isPilotOfflineSyncEnabled,
  normalizeOfflineSyncCommand,
  parseOfflineSyncBatch,
  replayReceipt,
  type PilotOfflineSyncCommand,
  type PilotOfflineSyncReceiptRow,
} from '../../services/controle-voos/pilot-offline-sync';

function command(overrides: Partial<PilotOfflineSyncCommand> = {}): PilotOfflineSyncCommand {
  return {
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
    payload_hash: '0'.repeat(64),
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
      rdv: { numero: 'RDV-42', data_voo: '2026-09-09' },
      stages: [],
    },
    ...overrides,
  };
}

describe('Pilot offline sync contract', () => {
  it('canonicaliza objetos independentemente da ordem das chaves', () => {
    expect(
      canonicalJson({
        z: 1,
        a: { y: 2, b: 3 },
        list: [{ q: 1, a: 2 }],
      }),
    ).toBe(
      canonicalJson({
        list: [{ a: 2, q: 1 }],
        a: { b: 3, y: 2 },
        z: 1,
      }),
    );
  });

  it('calcula e exige SHA-256 do material exato do comando', async () => {
    const base = command();
    const hash = await computeOfflineSyncCommandHash(base);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    const valid = { ...base, payload_hash: hash };
    await expect(assertOfflineSyncCommandHash(valid)).resolves.toBeUndefined();

    const tampered = {
      ...valid,
      payload: {
        ...valid.payload,
        rdv: { numero: 'RDV-TAMPERED', data_voo: '2026-09-09' },
      },
    };
    await expect(assertOfflineSyncCommandHash(tampered)).rejects.toMatchObject({
      code: 'CONTROLE_VOOS_PILOT_SYNC_PAYLOAD_HASH_MISMATCH',
    });
  });

  it('replay do mesmo operation id so e aceito com o mesmo hash e contexto', () => {
    const current = command({ payload_hash: 'a'.repeat(64) });
    const receipt: PilotOfflineSyncReceiptRow = {
      id: 1,
      empresa_id: 7,
      client_operation_id: current.client_operation_id,
      voo_id: 42,
      usuario_id: 70,
      funcionario_id: 77,
      device_id: current.device_id,
      command_type: current.command_type,
      entity_type: current.entity_type,
      canonical_entity_id: '90',
      payload_hash: current.payload_hash,
      base_server_version: 3,
      server_entity_version: 4,
      result_status: 'accepted',
      result_code: null,
      result_json: null,
      received_at: '2026-09-09T20:00:00.000Z',
      updated_at: '2026-09-09T20:00:00.000Z',
    };

    expect(replayReceipt(receipt, current)).toMatchObject({
      status: 'already_accepted',
      server_entity_version: 4,
      canonical_entity_id: '90',
    });

    expect(() =>
      replayReceipt(receipt, {
        ...current,
        payload_hash: 'b'.repeat(64),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'CONTROLE_VOOS_PILOT_SYNC_OPERATION_HASH_CONFLICT',
      }),
    );
  });

  it('v1 aceita exatamente um comando por request para evitar aplicacao parcial de lote', () => {
    const raw = command();
    expect(parseOfflineSyncBatch({ commands: [raw] })).toHaveLength(1);
    expect(() =>
      parseOfflineSyncBatch({
        commands: [
          raw,
          {
            ...raw,
            client_operation_id: '223e4567-e89b-42d3-a456-426614174001',
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'CONTROLE_VOOS_PILOT_SYNC_BATCH_SIZE_INVALID',
      }),
    );
  });

  it('normaliza contrato sem aceitar tipos/comandos paralelos', () => {
    const normalized = normalizeOfflineSyncCommand(command());
    expect(normalized.command_type).toBe('rdv_snapshot_upsert_v1');

    expect(() =>
      normalizeOfflineSyncCommand({
        ...command(),
        command_type: 'unsafe_last_write_wins',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'CONTROLE_VOOS_PILOT_SYNC_COMMAND_INVALID',
      }),
    );
  });

  it('flag de sync e fail-closed quando ausente', () => {
    expect(isPilotOfflineSyncEnabled({} as Env)).toBe(false);
    expect(
      isPilotOfflineSyncEnabled({ PILOT_OFFLINE_SYNC_ENABLED: 'false' } as unknown as Env),
    ).toBe(false);
    expect(
      isPilotOfflineSyncEnabled({ PILOT_OFFLINE_SYNC_ENABLED: 'true' } as unknown as Env),
    ).toBe(true);
  });
});
