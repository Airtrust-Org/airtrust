import { describe, expect, it } from 'vitest';

import {
  closeEdbDiaryVolume,
  createEdbInformationLossIncident,
  isEdbInformationLossIncidentDocumented,
  openEdbDiaryVolume,
  recordAnacInformationLossNotification,
  recordPoliceOccurrence,
  recordSuccessfulReconstitution,
  type EdbDiaryVolume,
  type EdbInformationLossIncident,
} from '../../services/edb/diary-governance';

const actor = {
  actorRef: 'employee:10',
  displayName: 'Responsible person',
};

function persistedRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('eDB diary persistence/resume regression', () => {
  it('resumes a persisted open volume and closes the exact same diary identity without mutating the persisted snapshot', () => {
    const opened = openEdbDiaryVolume({
      diaryId: 71,
      volumeId: 'volume-resume-71-3',
      aircraftRegistration: 'PR-RES',
      sequence: 3,
      openedAt: '2026-09-05T10:00:00.000Z',
      openedBy: actor,
      observations: 'Persisted opening act',
    });
    const resumed = persistedRoundTrip<EdbDiaryVolume>(opened);
    const snapshotBeforeClose = persistedRoundTrip(resumed);

    const closed = closeEdbDiaryVolume(resumed, {
      closedAt: '2026-09-05T12:00:00.000Z',
      closedBy: {
        actorRef: 'employee:11',
        displayName: 'Closing responsible person',
      },
      observations: 'Persisted closing act',
    });

    expect(closed).toMatchObject({
      diaryId: 71,
      volumeId: 'volume-resume-71-3',
      aircraftRegistration: 'PR-RES',
      sequence: 3,
      status: 'CLOSED',
      openingAct: {
        type: 'OPENING',
        occurredAt: '2026-09-05T10:00:00.000Z',
      },
      closingAct: {
        type: 'CLOSING',
        occurredAt: '2026-09-05T12:00:00.000Z',
      },
    });
    expect(resumed).toEqual(snapshotBeforeClose);
    expect(resumed.status).toBe('OPEN');
  });

  it('fails closed when a persisted close transition is replayed', () => {
    const opened = openEdbDiaryVolume({
      diaryId: 72,
      volumeId: 'volume-replay-72-1',
      aircraftRegistration: 'PR-RPL',
      sequence: 1,
      openedAt: '2026-09-05T10:00:00.000Z',
      openedBy: actor,
    });
    const closed = closeEdbDiaryVolume(opened, {
      closedAt: '2026-09-05T11:00:00.000Z',
      closedBy: actor,
    });
    const resumedClosed = persistedRoundTrip<EdbDiaryVolume>(closed);

    expect(() =>
      closeEdbDiaryVolume(resumedClosed, {
        closedAt: '2026-09-05T12:00:00.000Z',
        closedBy: actor,
      }),
    ).toThrow('Only an open diary volume can be closed');
  });
});

describe('eDB information-loss persistence/resume regression', () => {
  it('resumes after each persisted evidence step and completes without losing prior evidence', () => {
    const created = createEdbInformationLossIncident({
      incidentId: 'incident-resume-1',
      diaryId: 73,
      volumeId: 'volume-73-2',
      kind: 'LOSS',
      detectedAt: '2026-09-05T08:00:00.000Z',
      description: 'Persistence/resume regression fixture',
    });

    const afterCreate = persistedRoundTrip<EdbInformationLossIncident>(created);
    const police = recordPoliceOccurrence(afterCreate, {
      reference: 'BO-RESUME-73',
      reportedAt: '2026-09-05T08:30:00.000Z',
    });
    const afterPolice = persistedRoundTrip<EdbInformationLossIncident>(police);
    const notified = recordAnacInformationLossNotification(afterPolice, {
      reference: 'LOCAL-ANAC-RESUME-73',
      notifiedAt: '2026-09-05T09:00:00.000Z',
    });
    const afterNotification = persistedRoundTrip<EdbInformationLossIncident>(notified);
    const completed = recordSuccessfulReconstitution(
      afterNotification,
      '2026-09-05T10:00:00.000Z',
    );

    expect(completed).toMatchObject({
      incidentId: 'incident-resume-1',
      diaryId: 73,
      volumeId: 'volume-73-2',
      policeOccurrenceReference: 'BO-RESUME-73',
      anacNotificationReference: 'LOCAL-ANAC-RESUME-73',
      reconstitutionOutcome: 'RECONSTITUTED',
      reconstitutionCompletedAt: '2026-09-05T10:00:00.000Z',
    });
    expect(isEdbInformationLossIncidentDocumented(completed)).toBe(true);
  });

  it('fails closed when persisted evidence steps are replayed after resume', () => {
    let incident = createEdbInformationLossIncident({
      incidentId: 'incident-replay-1',
      diaryId: 74,
      kind: 'CORRUPTION',
      detectedAt: '2026-09-05T08:00:00.000Z',
      description: 'Replay regression fixture',
    });
    incident = recordPoliceOccurrence(incident, {
      reference: 'BO-REPLAY-74',
      reportedAt: '2026-09-05T08:30:00.000Z',
    });
    incident = recordAnacInformationLossNotification(incident, {
      reference: 'LOCAL-ANAC-REPLAY-74',
      notifiedAt: '2026-09-05T09:00:00.000Z',
    });
    incident = recordSuccessfulReconstitution(incident, '2026-09-05T10:00:00.000Z');

    const resumed = persistedRoundTrip<EdbInformationLossIncident>(incident);

    expect(() =>
      recordPoliceOccurrence(resumed, {
        reference: 'BO-REPLAY-74-SECOND',
        reportedAt: '2026-09-05T10:30:00.000Z',
      }),
    ).toThrow('Police occurrence already recorded');

    expect(() =>
      recordAnacInformationLossNotification(resumed, {
        reference: 'LOCAL-ANAC-REPLAY-74-SECOND',
        notifiedAt: '2026-09-05T10:30:00.000Z',
      }),
    ).toThrow('ANAC notification already recorded');

    expect(() =>
      recordSuccessfulReconstitution(resumed, '2026-09-05T10:30:00.000Z'),
    ).toThrow('Reconstitution outcome already recorded');
  });
});
