import { describe, expect, it } from 'vitest';
import {
  hydrateEdbDiaryVolumeRow,
  type EdbStoredVolumeRow,
} from '../../repositories/edb/edb-volume-hydration';

const actor = { actorRef: 'employee:10', displayName: 'Responsavel Designado' };

function openingActJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    aircraftRegistration: 'PR-ABC',
    act: {
      type: 'OPENING',
      occurredAt: '2026-08-01T00:00:00.000Z',
      actor,
      observations: 'Abertura',
      ...overrides,
    },
  });
}

function closingActJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    act: {
      type: 'CLOSING',
      occurredAt: '2026-08-31T23:00:00.000Z',
      actor,
      observations: 'Encerramento',
      ...overrides,
    },
  });
}

function row(overrides: Partial<EdbStoredVolumeRow> = {}): EdbStoredVolumeRow {
  return {
    id: 'vol-1',
    empresa_id: 10,
    diario_id: 1,
    numero_volume: 1,
    status: 'OPEN',
    opened_at: '2026-08-01T00:00:00.000Z',
    opening_act_json: openingActJson(),
    closed_at: null,
    closing_act_json: null,
    retencao_minima_ate: null,
    ...overrides,
  };
}

describe('eDB 0483 persisted-volume hydration fail-closed guards', () => {
  it.each([
    ['blank volume identity', { id: '   ' }, 'EDB_VOLUME_ID_REQUIRED'],
    ['invalid tenant identity', { empresa_id: 0 }, 'EDB_VOLUME_TENANT_ID_INVALID'],
    ['invalid diary identity', { diario_id: 0 }, 'EDB_VOLUME_DIARY_ID_INVALID'],
    ['invalid sequence identity', { numero_volume: 0 }, 'EDB_VOLUME_SEQUENCE_INVALID'],
    ['invalid persisted opened_at', { opened_at: 'not-a-timestamp' }, 'EDB_VOLUME_OPENED_AT_INVALID'],
  ])('rejects %s before exposing regulated state', (_label, overrides, code) => {
    expect(() => hydrateEdbDiaryVolumeRow(row(overrides as Partial<EdbStoredVolumeRow>))).toThrow(code);
  });

  it('rejects an opening act with the wrong immutable boundary type', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(row({ opening_act_json: openingActJson({ type: 'CLOSING' }) })),
    ).toThrow('EDB_VOLUME_ACT_INVALID');
  });

  it('rejects a persisted row with an unsupported lifecycle status', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(row({ status: 'CORRUPTED' as EdbStoredVolumeRow['status'] })),
    ).toThrow('EDB_VOLUME_STATUS_INVALID');
  });

  it('rejects malformed closing JSON rather than recovering a closed volume', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(
        row({
          status: 'CLOSED',
          closed_at: '2026-08-31T23:00:00.000Z',
          closing_act_json: '{',
          retencao_minima_ate: '2031-09-01',
        }),
      ),
    ).toThrow('EDB_VOLUME_CLOSING_ACT_INVALID_JSON');
  });

  it('rejects a closing act with the wrong immutable boundary type', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(
        row({
          status: 'CLOSED',
          closed_at: '2026-08-31T23:00:00.000Z',
          closing_act_json: closingActJson({ type: 'OPENING' }),
          retencao_minima_ate: '2031-09-01',
        }),
      ),
    ).toThrow('EDB_VOLUME_ACT_INVALID');
  });

  it('rejects malformed closing actor evidence rather than synthesizing identity', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(
        row({
          status: 'CLOSED',
          closed_at: '2026-08-31T23:00:00.000Z',
          closing_act_json: closingActJson({ actor: { actorRef: '', displayName: 'X' } }),
          retencao_minima_ate: '2031-09-01',
        }),
      ),
    ).toThrow('EDB_VOLUME_ACT_ACTOR_INVALID');
  });

  it('rejects an invalid persisted closed_at before reconstructing closure', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(
        row({
          status: 'CLOSED',
          closed_at: 'not-a-timestamp',
          closing_act_json: closingActJson(),
          retencao_minima_ate: '2031-09-01',
        }),
      ),
    ).toThrow('EDB_VOLUME_CLOSED_AT_INVALID');
  });
});
