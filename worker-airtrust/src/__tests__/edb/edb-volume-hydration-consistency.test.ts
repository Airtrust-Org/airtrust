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

describe('eDB persisted-volume duplicated-evidence consistency', () => {
  it('rejects an opening timestamp that disagrees with the relational opened_at', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(
        row({ opening_act_json: openingActJson({ occurredAt: '2026-08-01T00:00:01.000Z' }) }),
      ),
    ).toThrow('EDB_VOLUME_OPENING_TIMESTAMP_MISMATCH');
  });

  it.each([
    ['closed_at', { closed_at: '2026-08-31T23:00:00.000Z' }],
    ['closing act', { closing_act_json: closingActJson() }],
    ['retention evidence', { retencao_minima_ate: '2031-09-01' }],
  ])('rejects an OPEN row carrying %s', (_label, overrides) => {
    expect(() => hydrateEdbDiaryVolumeRow(row(overrides as Partial<EdbStoredVolumeRow>))).toThrow(
      'EDB_OPEN_VOLUME_HAS_CLOSING_EVIDENCE',
    );
  });

  it.each([
    ['closed_at', { closing_act_json: closingActJson() }],
    ['closing act', { closed_at: '2026-08-31T23:00:00.000Z' }],
  ])('rejects a CLOSED row missing %s', (_label, evidence) => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(
        row({
          status: 'CLOSED',
          retencao_minima_ate: '2031-09-01',
          ...evidence,
        }),
      ),
    ).toThrow('EDB_CLOSED_VOLUME_MISSING_CLOSING_EVIDENCE');
  });

  it('rejects a closing timestamp that disagrees with the relational closed_at', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(
        row({
          status: 'CLOSED',
          closed_at: '2026-08-31T23:00:00.000Z',
          closing_act_json: closingActJson({ occurredAt: '2026-08-31T23:00:01.000Z' }),
          retencao_minima_ate: '2031-09-01',
        }),
      ),
    ).toThrow('EDB_VOLUME_CLOSING_TIMESTAMP_MISMATCH');
  });

  it.each([
    ['opening actor', openingActJson({ actor: { actorRef: ' ', displayName: 'X' } }), 'EDB_VOLUME_ACT_ACTOR_INVALID'],
    ['opening observations', openingActJson({ observations: ' ' }), 'EDB_VOLUME_ACT_OBSERVATIONS_INVALID'],
  ])('rejects malformed %s evidence instead of normalizing it', (_label, opening_act_json, code) => {
    expect(() => hydrateEdbDiaryVolumeRow(row({ opening_act_json }))).toThrow(code);
  });
});
