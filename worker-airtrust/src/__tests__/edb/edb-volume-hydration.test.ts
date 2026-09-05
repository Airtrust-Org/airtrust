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

describe('eDB 0483 diary-volume hydration', () => {
  it('rehydrates an open persisted volume without changing its regulated identity', () => {
    expect(hydrateEdbDiaryVolumeRow(row())).toEqual({
      diaryId: 1,
      volumeId: 'vol-1',
      aircraftRegistration: 'PR-ABC',
      sequence: 1,
      status: 'OPEN',
      openingAct: {
        type: 'OPENING',
        occurredAt: '2026-08-01T00:00:00.000Z',
        actor,
        observations: 'Abertura',
      },
      closingAct: null,
    });
  });

  it('rehydrates a closed volume only when relational and JSON timestamps agree', () => {
    const volume = hydrateEdbDiaryVolumeRow(
      row({
        status: 'CLOSED',
        closed_at: '2026-08-31T23:00:00.000Z',
        closing_act_json: closingActJson(),
        retencao_minima_ate: '2031-09-01',
      }),
    );

    expect(volume.status).toBe('CLOSED');
    expect(volume.closingAct).toEqual({
      type: 'CLOSING',
      occurredAt: '2026-08-31T23:00:00.000Z',
      actor,
      observations: 'Encerramento',
    });
  });

  it('fails closed when opening JSON disagrees with the immutable opened_at column', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(
        row({ opening_act_json: openingActJson({ occurredAt: '2026-08-02T00:00:00.000Z' }) }),
      ),
    ).toThrow('EDB_VOLUME_OPENING_TIMESTAMP_MISMATCH');
  });

  it('fails closed when an open row already carries closing evidence', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(row({ closed_at: '2026-08-31T23:00:00.000Z' })),
    ).toThrow('EDB_OPEN_VOLUME_HAS_CLOSING_EVIDENCE');
  });

  it('fails closed when a closed row is missing its immutable closing act', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(
        row({ status: 'CLOSED', closed_at: '2026-08-31T23:00:00.000Z' }),
      ),
    ).toThrow('EDB_CLOSED_VOLUME_MISSING_CLOSING_EVIDENCE');
  });

  it('fails closed when closing JSON disagrees with the closed_at column', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(
        row({
          status: 'CLOSED',
          closed_at: '2026-08-31T23:00:00.000Z',
          closing_act_json: closingActJson({ occurredAt: '2026-09-01T00:00:00.000Z' }),
        }),
      ),
    ).toThrow('EDB_VOLUME_CLOSING_TIMESTAMP_MISMATCH');
  });

  it('rejects malformed actor evidence rather than synthesizing identity', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(
        row({
          opening_act_json: openingActJson({ actor: { actorRef: '', displayName: 'X' } }),
        }),
      ),
    ).toThrow('EDB_VOLUME_ACT_ACTOR_INVALID');
  });

  it('rejects malformed JSON without attempting recovery', () => {
    expect(() => hydrateEdbDiaryVolumeRow(row({ opening_act_json: '{' }))).toThrow(
      'EDB_VOLUME_OPENING_ACT_INVALID_JSON',
    );
  });
});
