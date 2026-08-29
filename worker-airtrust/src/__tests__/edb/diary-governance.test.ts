import { describe, expect, it } from 'vitest';
import {
  closeEdbDiaryVolume,
  createEdbInformationLossIncident,
  isEdbInformationLossIncidentRegulatorilyDocumented,
  minimumEdbRetentionUntil,
  onboardOperationWindowStart,
  openEdbDiaryVolume,
  recordAnacInformationLossNotification,
  recordImpossibleReconstitution,
  recordPoliceOccurrence,
  recordSuccessfulReconstitution,
} from '../../services/edb/diary-governance';

const actor = {
  employeeId: 10,
  fullName: 'Responsavel Designado',
  anacCode: null,
};

describe('eDB diary volume governance', () => {
  it('creates explicit opening and closing acts without inventing an ANAC API identifier', () => {
    const volume = openEdbDiaryVolume({
      diaryId: 1,
      volumeId: 'local-volume-001',
      aircraftRegistrationMarks: 'PR-ABC',
      sequence: 1,
      openedAt: '2026-08-01T00:00:00.000Z',
      openedBy: actor,
      observations: 'Abertura do volume operacional',
    });

    expect(volume.diaryId).toBe(1);
    expect(volume.status).toBe('OPEN');
    expect(volume.openingAct.type).toBe('OPENING');
    expect(volume.closingAct).toBeNull();

    const closed = closeEdbDiaryVolume(volume, {
      closedAt: '2026-08-31T23:59:59.000Z',
      closedBy: actor,
      observations: 'Encerramento do volume',
    });
    expect(closed.status).toBe('CLOSED');
    expect(closed.closingAct?.type).toBe('CLOSING');
    expect(volume.status).toBe('OPEN');
  });

  it('prevents closing a volume before its opening act', () => {
    const volume = openEdbDiaryVolume({
      diaryId: 1,
      volumeId: 'local-volume-001',
      aircraftRegistrationMarks: 'PR-ABC',
      sequence: 1,
      openedAt: '2026-08-10T00:00:00.000Z',
      openedBy: actor,
    });
    expect(() =>
      closeEdbDiaryVolume(volume, {
        closedAt: '2026-08-09T23:59:59.000Z',
        closedBy: actor,
      }),
    ).toThrow('cannot predate');
  });

  it('rejects a diary identity that cannot map to edb_diarios.id', () => {
    expect(() =>
      openEdbDiaryVolume({
        diaryId: 0,
        volumeId: 'local-volume-001',
        aircraftRegistrationMarks: 'PR-ABC',
        sequence: 1,
        openedAt: '2026-08-10T00:00:00.000Z',
        openedBy: actor,
      }),
    ).toThrow('diaryId must be a positive integer');
  });
});

describe('eDB retention and onboard availability policy', () => {
  it('keeps records indefinitely while deregistration has not occurred', () => {
    expect(minimumEdbRetentionUntil(null)).toBeNull();
  });

  it('calculates the minimum retention date as deregistration + 5 years + 1 day', () => {
    expect(minimumEdbRetentionUntil('2026-08-28')).toBe('2031-08-29');
  });

  it('calculates the 30-day operation window boundary', () => {
    expect(onboardOperationWindowStart('2026-08-28')).toBe('2026-07-29');
  });
});

describe('eDB loss/corruption reconstitution governance', () => {
  it('requires police occurrence evidence before recording the ANAC notification', () => {
    const incident = createEdbInformationLossIncident({
      incidentId: 'incident-1',
      diaryId: 1,
      kind: 'CORRUPTION',
      detectedAt: '2026-08-28T15:00:00.000Z',
      description: 'Corrupcao parcial de registros detectada',
    });

    expect(() =>
      recordAnacInformationLossNotification(incident, {
        reference: 'ANAC-SEI-001',
        notifiedAt: '2026-08-28T16:00:00.000Z',
      }),
    ).toThrow('police occurrence');
  });

  it('tracks police report, ANAC notification and successful reconstitution without rewriting history', () => {
    const original = createEdbInformationLossIncident({
      incidentId: 'incident-2',
      diaryId: 1,
      kind: 'LOSS',
      detectedAt: '2026-08-28T15:00:00.000Z',
      description: 'Perda parcial de registros',
    });
    const police = recordPoliceOccurrence(original, {
      reference: 'BO-12345',
      reportedAt: '2026-08-28T15:30:00.000Z',
    });
    const notified = recordAnacInformationLossNotification(police, {
      reference: 'ANAC-SEI-001',
      notifiedAt: '2026-08-28T16:00:00.000Z',
    });
    const reconstituted = recordSuccessfulReconstitution(
      notified,
      '2026-08-29T10:00:00.000Z',
    );

    expect(original.policeOccurrenceReference).toBeNull();
    expect(police.anacNotificationReference).toBeNull();
    expect(reconstituted.reconstitutionOutcome).toBe('RECONSTITUTED');
    expect(isEdbInformationLossIncidentRegulatorilyDocumented(reconstituted)).toBe(true);
  });

  it('requires the new opening observation to reference the police occurrence when reconstitution is impossible', () => {
    let incident = createEdbInformationLossIncident({
      incidentId: 'incident-3',
      diaryId: 1,
      kind: 'MISPLACEMENT',
      detectedAt: '2026-08-28T15:00:00.000Z',
      description: 'Extravio integral do volume',
    });
    incident = recordPoliceOccurrence(incident, {
      reference: 'BO-98765',
      reportedAt: '2026-08-28T15:30:00.000Z',
    });
    incident = recordAnacInformationLossNotification(incident, {
      reference: 'ANAC-SEI-002',
      notifiedAt: '2026-08-28T16:00:00.000Z',
    });

    expect(() =>
      recordImpossibleReconstitution(incident, {
        completedAt: '2026-08-29T10:00:00.000Z',
        newDiaryOpeningObservation: 'Documento nao reconstituido.',
      }),
    ).toThrow('must reference');

    const completed = recordImpossibleReconstitution(incident, {
      completedAt: '2026-08-29T10:00:00.000Z',
      newDiaryOpeningObservation: 'Documento nao reconstituido. Referencia BO-98765. Declaracao registrada.',
    });
    expect(completed.reconstitutionOutcome).toBe('IMPOSSIBLE');
    expect(isEdbInformationLossIncidentRegulatorilyDocumented(completed)).toBe(true);
  });
});
