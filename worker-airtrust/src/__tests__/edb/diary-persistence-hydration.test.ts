import { describe, expect, it } from 'vitest';
import {
  hydrateEdbDiaryVolumeRow,
  hydrateEdbInformationLossIncidentRow,
  type EdbStoredIntegrityIncidentRow,
  type EdbStoredVolumeRow,
} from '../../repositories/edb/edb-diary-repository';
import { canonicalJson } from '../../services/edb/canonicalization';

const actor = {
  employeeId: 10,
  fullName: 'Responsavel Designado',
  anacCode: null,
};

function volumeRow(overrides: Partial<EdbStoredVolumeRow> = {}): EdbStoredVolumeRow {
  return {
    id: 'vol-1',
    empresa_id: 10,
    diario_id: 1,
    numero_volume: 1,
    status: 'ABERTO',
    aberto_em: '2026-08-01T00:00:00.000Z',
    aberto_por: 10,
    ato_abertura_json: canonicalJson({
      aircraftRegistrationMarks: 'PR-ABC',
      act: {
        type: 'OPENING',
        occurredAt: '2026-08-01T00:00:00.000Z',
        actor,
        observations: 'Abertura',
      },
    }),
    encerrado_em: null,
    encerrado_por: null,
    ato_encerramento_json: null,
    retencao_minima_ate: null,
    ...overrides,
  };
}

function incidentRow(
  overrides: Partial<EdbStoredIntegrityIncidentRow> = {},
): EdbStoredIntegrityIncidentRow {
  return {
    id: 'incident-1',
    empresa_id: 10,
    diario_id: 1,
    volume_id: 'vol-1',
    tipo: 'LOSS',
    ocorrido_em: '2026-08-28T15:00:00.000Z',
    descricao: 'Perda parcial de registros',
    police_report_reference: null,
    anac_notification_reference: null,
    status: 'OPEN',
    reconstitution_evidence_json: canonicalJson({
      policeReportedAt: null,
      anacNotifiedAt: null,
      reconstitutionCompletedAt: null,
      newDiaryOpeningObservation: null,
    }),
    created_by: 1,
    updated_by: 1,
    created_at: '2026-08-28T15:00:01.000Z',
    updated_at: '2026-08-28T15:00:01.000Z',
    ...overrides,
  };
}

describe('eDB persisted diary volume hydration', () => {
  it('rehydrates an open volume with the exact opening actor and aircraft snapshot', () => {
    const volume = hydrateEdbDiaryVolumeRow(volumeRow());
    expect(volume).toMatchObject({
      diaryId: 1,
      volumeId: 'vol-1',
      aircraftRegistrationMarks: 'PR-ABC',
      sequence: 1,
      status: 'OPEN',
    });
    expect(volume.openingAct.actor).toEqual(actor);
  });

  it('rehydrates a closed volume only when column and JSON closing evidence agree', () => {
    const volume = hydrateEdbDiaryVolumeRow(
      volumeRow({
        status: 'ENCERRADO',
        encerrado_em: '2026-08-31T23:00:00.000Z',
        encerrado_por: 10,
        ato_encerramento_json: canonicalJson({
          act: {
            type: 'CLOSING',
            occurredAt: '2026-08-31T23:00:00.000Z',
            actor,
            observations: 'Encerramento',
          },
        }),
      }),
    );
    expect(volume.status).toBe('CLOSED');
    expect(volume.closingAct?.observations).toBe('Encerramento');
  });

  it('fails closed when the opening actor differs from the persisted actor column', () => {
    expect(() => hydrateEdbDiaryVolumeRow(volumeRow({ aberto_por: 99 }))).toThrow(
      'EDB_VOLUME_OPENING_ACTOR_MISMATCH',
    );
  });

  it('fails closed when an open volume already carries closing evidence', () => {
    expect(() =>
      hydrateEdbDiaryVolumeRow(
        volumeRow({ encerrado_em: '2026-08-31T23:00:00.000Z' }),
      ),
    ).toThrow('EDB_OPEN_VOLUME_HAS_CLOSING_EVIDENCE');
  });
});

describe('eDB persisted integrity incident hydration', () => {
  it('preserves diary and optional volume scope on an open incident', () => {
    const incident = hydrateEdbInformationLossIncidentRow(incidentRow());
    expect(incident).toMatchObject({
      incidentId: 'incident-1',
      diaryId: 1,
      volumeId: 'vol-1',
      reconstitutionOutcome: 'PENDING',
    });
  });

  it('rehydrates police, ANAC and successful reconstitution timestamps from evidence JSON', () => {
    const incident = hydrateEdbInformationLossIncidentRow(
      incidentRow({
        police_report_reference: 'BO-123',
        anac_notification_reference: 'ANAC-SEI-1',
        status: 'RECONSTITUTED',
        reconstitution_evidence_json: canonicalJson({
          policeReportedAt: '2026-08-28T15:30:00.000Z',
          anacNotifiedAt: '2026-08-28T16:00:00.000Z',
          reconstitutionCompletedAt: '2026-08-29T10:00:00.000Z',
          newDiaryOpeningObservation: null,
        }),
      }),
    );
    expect(incident.policeOccurrenceReference).toBe('BO-123');
    expect(incident.anacNotificationReference).toBe('ANAC-SEI-1');
    expect(incident.reconstitutionOutcome).toBe('RECONSTITUTED');
    expect(incident.reconstitutionCompletedAt).toBe('2026-08-29T10:00:00.000Z');
  });

  it('rehydrates impossible reconstitution only with an opening observation that references the police report', () => {
    const incident = hydrateEdbInformationLossIncidentRow(
      incidentRow({
        police_report_reference: 'BO-987',
        anac_notification_reference: 'ANAC-SEI-2',
        status: 'IMPOSSIBLE_TO_RECONSTITUTE',
        reconstitution_evidence_json: canonicalJson({
          policeReportedAt: '2026-08-28T15:30:00.000Z',
          anacNotifiedAt: '2026-08-28T16:00:00.000Z',
          reconstitutionCompletedAt: '2026-08-29T10:00:00.000Z',
          newDiaryOpeningObservation: 'Nao reconstituido. Referencia BO-987.',
        }),
      }),
    );
    expect(incident.reconstitutionOutcome).toBe('IMPOSSIBLE');
    expect(incident.newDiaryOpeningObservation).toContain('BO-987');
  });

  it('rejects a police timestamp without the corresponding police reference', () => {
    expect(() =>
      hydrateEdbInformationLossIncidentRow(
        incidentRow({
          reconstitution_evidence_json: canonicalJson({
            policeReportedAt: '2026-08-28T15:30:00.000Z',
            anacNotifiedAt: null,
            reconstitutionCompletedAt: null,
            newDiaryOpeningObservation: null,
          }),
        }),
      ),
    ).toThrow('EDB_INTEGRITY_INCIDENT_POLICE_REFERENCE_REQUIRED');
  });

  it('rejects CLOSED until a separate closure contract is explicitly modeled', () => {
    expect(() =>
      hydrateEdbInformationLossIncidentRow(incidentRow({ status: 'CLOSED' })),
    ).toThrow('EDB_INTEGRITY_INCIDENT_CLOSED_UNSUPPORTED');
  });
});
