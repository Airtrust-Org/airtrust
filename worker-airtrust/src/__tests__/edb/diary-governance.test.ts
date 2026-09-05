import { describe, expect, it } from 'vitest';

import {
  closeEdbDiaryVolume,
  createEdbInformationLossIncident,
  isEdbInformationLossIncidentDocumented,
  minimumEdbRetentionUntil,
  openEdbDiaryVolume,
  recordAnacInformationLossNotification,
  recordImpossibleReconstitution,
  recordPoliceOccurrence,
  recordSuccessfulReconstitution,
} from '../../services/edb/diary-governance';

const actor = {
  actorRef: 'employee:10',
  displayName: 'Responsible person',
};

describe('eDB diary volume governance', () => {
  it('creates explicit opening and closing acts without an external API identifier', () => {
    const volume = openEdbDiaryVolume({
      diaryId: 1,
      volumeId: 'local-volume-001',
      aircraftRegistration: 'PR-ABC',
      sequence: 1,
      openedAt: '2026-09-01T00:00:00.000Z',
      openedBy: actor,
      observations: 'Opening act',
    });

    expect(volume).toMatchObject({
      diaryId: 1,
      volumeId: 'local-volume-001',
      status: 'OPEN',
      openingAct: { type: 'OPENING' },
      closingAct: null,
    });

    const closed = closeEdbDiaryVolume(volume, {
      closedAt: '2026-09-30T23:59:59.000Z',
      closedBy: actor,
      observations: 'Closing act',
    });

    expect(closed.status).toBe('CLOSED');
    expect(closed.closingAct?.type).toBe('CLOSING');
    expect(volume.status).toBe('OPEN');
  });

  it('rejects invalid diary identity and closing before opening', () => {
    expect(() =>
      openEdbDiaryVolume({
        diaryId: 0,
        volumeId: 'local-volume-001',
        aircraftRegistration: 'PR-ABC',
        sequence: 1,
        openedAt: '2026-09-10T00:00:00.000Z',
        openedBy: actor,
      }),
    ).toThrow('diaryId must be a positive integer');

    const volume = openEdbDiaryVolume({
      diaryId: 1,
      volumeId: 'local-volume-001',
      aircraftRegistration: 'PR-ABC',
      sequence: 1,
      openedAt: '2026-09-10T00:00:00.000Z',
      openedBy: actor,
    });

    expect(() =>
      closeEdbDiaryVolume(volume, {
        closedAt: '2026-09-09T23:59:59.000Z',
        closedBy: actor,
      }),
    ).toThrow('cannot predate');
  });
});

describe('eDB minimum retention', () => {
  it('has no finite cutoff while registration remains active', () => {
    expect(minimumEdbRetentionUntil(null)).toBeNull();
  });

  it('calculates cancellation + 5 years + 1 day', () => {
    expect(minimumEdbRetentionUntil('2026-09-04')).toBe('2031-09-05');
  });

  it('clamps a leap-day cancellation anniversary before adding the final day', () => {
    expect(minimumEdbRetentionUntil('2024-02-29')).toBe('2029-03-01');
  });

  it('rejects impossible calendar dates', () => {
    expect(() => minimumEdbRetentionUntil('2026-02-30')).toThrow('valid calendar date');
  });
});

describe('eDB information loss governance', () => {
  it('requires police occurrence evidence before ANAC notification evidence', () => {
    const incident = createEdbInformationLossIncident({
      incidentId: 'incident-1',
      diaryId: 1,
      kind: 'CORRUPTION',
      detectedAt: '2026-09-04T15:00:00.000Z',
      description: 'Partial record corruption',
    });

    expect(() =>
      recordAnacInformationLossNotification(incident, {
        reference: 'local-anac-reference',
        notifiedAt: '2026-09-04T16:00:00.000Z',
      }),
    ).toThrow('police occurrence');
  });

  it('tracks police report, ANAC notification evidence and successful reconstitution immutably', () => {
    const original = createEdbInformationLossIncident({
      incidentId: 'incident-2',
      diaryId: 1,
      kind: 'LOSS',
      detectedAt: '2026-09-04T15:00:00.000Z',
      description: 'Partial record loss',
    });

    const police = recordPoliceOccurrence(original, {
      reference: 'BO-12345',
      reportedAt: '2026-09-04T15:30:00.000Z',
    });
    const notified = recordAnacInformationLossNotification(police, {
      reference: 'local-anac-reference',
      notifiedAt: '2026-09-04T16:00:00.000Z',
    });
    const reconstituted = recordSuccessfulReconstitution(
      notified,
      '2026-09-05T10:00:00.000Z',
    );

    expect(original.policeOccurrenceReference).toBeNull();
    expect(police.anacNotificationReference).toBeNull();
    expect(reconstituted.reconstitutionOutcome).toBe('RECONSTITUTED');
    expect(isEdbInformationLossIncidentDocumented(reconstituted)).toBe(true);
  });

  it('requires the new opening observation to reference the police occurrence when reconstitution is impossible', () => {
    let incident = createEdbInformationLossIncident({
      incidentId: 'incident-3',
      diaryId: 1,
      kind: 'MISPLACEMENT',
      detectedAt: '2026-09-04T15:00:00.000Z',
      description: 'Entire volume misplaced',
    });

    incident = recordPoliceOccurrence(incident, {
      reference: 'BO-98765',
      reportedAt: '2026-09-04T15:30:00.000Z',
    });
    incident = recordAnacInformationLossNotification(incident, {
      reference: 'local-anac-reference-2',
      notifiedAt: '2026-09-04T16:00:00.000Z',
    });

    expect(() =>
      recordImpossibleReconstitution(incident, {
        completedAt: '2026-09-05T10:00:00.000Z',
        newDiaryOpeningObservation: 'Document not reconstituted.',
      }),
    ).toThrow('must reference');

    const completed = recordImpossibleReconstitution(incident, {
      completedAt: '2026-09-05T10:00:00.000Z',
      newDiaryOpeningObservation:
        'Document not reconstituted. Reference BO-98765. Declaration recorded.',
    });

    expect(completed.reconstitutionOutcome).toBe('IMPOSSIBLE');
    expect(isEdbInformationLossIncidentDocumented(completed)).toBe(true);
  });

  it('rejects impossible chronology for police and notification evidence', () => {
    const incident = createEdbInformationLossIncident({
      incidentId: 'incident-4',
      diaryId: 1,
      kind: 'LOSS',
      detectedAt: '2026-09-04T15:00:00.000Z',
      description: 'Chronology test',
    });

    expect(() =>
      recordPoliceOccurrence(incident, {
        reference: 'BO-1',
        reportedAt: '2026-09-04T14:59:00.000Z',
      }),
    ).toThrow('cannot predate incident detection');

    const police = recordPoliceOccurrence(incident, {
      reference: 'BO-1',
      reportedAt: '2026-09-04T15:30:00.000Z',
    });

    expect(() =>
      recordAnacInformationLossNotification(police, {
        reference: 'local-anac-reference',
        notifiedAt: '2026-09-04T15:29:00.000Z',
      }),
    ).toThrow('cannot predate police occurrence');
  });
});
