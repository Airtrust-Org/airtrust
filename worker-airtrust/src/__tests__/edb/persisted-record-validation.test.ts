import { describe, expect, it } from 'vitest';
import { createEmptyEdbFlightRecord } from '../../services/edb/contracts';
import { isPersistedEdbFlightRecord } from '../../services/edb/persisted-record-validation';

function record() {
  return createEmptyEdbFlightRecord({
    operatorCompanyId: 10,
    operatorRegulation: 'RBAC135',
    sourceFlightId: 20,
    sourceRdvId: 30,
    sourceRdvVersion: 1,
    sourceStageId: 40,
    capturedAt: '2026-08-28T12:00:00Z',
    logicalRecordId: 'flight-20-stage-40',
    revisionId: 'edbrev-20-40-r1',
  });
}

describe('eDB persisted record runtime validation', () => {
  it('accepts the canonical contract shape before business completeness validation', () => {
    expect(isPersistedEdbFlightRecord(record())).toBe(true);
  });

  it('rejects unverified ANAC transport lifecycle states', () => {
    for (const status of ['ANAC_PENDING', 'ANAC_SYNCED']) {
      const value = record() as unknown as { status: string };
      value.status = status;
      expect(isPersistedEdbFlightRecord(value)).toBe(false);
    }
  });

  it('rejects non-integer persistent identities', () => {
    const value = record();
    value.source.sourceFlightId = 20.5;
    expect(isPersistedEdbFlightRecord(value)).toBe(false);
  });

  it('rejects malformed persisted timestamps', () => {
    const value = record();
    value.source.capturedAt = 'not-a-timestamp';
    expect(isPersistedEdbFlightRecord(value)).toBe(false);
  });

  it('rejects malformed signature hashes even when the rest of the proof shape exists', () => {
    const value = record();
    value.signatures.picTechnicalAcknowledgement = {
      signatureId: 'sig-tech-1',
      type: 'PIC_TECHNICAL_ACK',
      targetType: 'TECHNICAL_SITUATION',
      targetId: 'tech-1',
      signer: { employeeId: 10, fullName: 'PIC Test', anacCode: '123456' },
      signedAt: '2026-08-28T11:00:00Z',
      canonicalPayloadHashSha256: 'invalid',
      method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
      proofReference: 'proof/tech-1',
    };
    expect(isPersistedEdbFlightRecord(value)).toBe(false);
  });

  it.each([
    ['operator company identity', (value: ReturnType<typeof record>) => { value.identity.operatorCompanyId = 10.5; }],
    ['aircraft identity', (value: ReturnType<typeof record>) => { value.identity.aircraft.aircraftId = 1.5; }],
    ['source RDV identity', (value: ReturnType<typeof record>) => { value.source.sourceRdvId = 30.5; }],
    ['source RDV version', (value: ReturnType<typeof record>) => { value.source.sourceRdvVersion = 1.5; }],
    ['source stage identity', (value: ReturnType<typeof record>) => { value.source.sourceStageId = 40.5; }],
    ['landing count', (value: ReturnType<typeof record>) => { value.flight.landingsTotal = 1.5; }],
    ['cycle count', (value: ReturnType<typeof record>) => { value.flight.cycles = 2.5; }],
    ['persons on board', (value: ReturnType<typeof record>) => { value.flight.personsOnBoard = 3.5; }],
  ])('fails closed for fractional persisted %s', (_label, mutate) => {
    const value = record();
    mutate(value);
    expect(isPersistedEdbFlightRecord(value)).toBe(false);
  });

  it.each([
    ['airframe due hours', (value: ReturnType<typeof record>) => { value.maintenance.nextIntervention.dueAtAirframeHours = Number.POSITIVE_INFINITY; }],
    ['day duration', (value: ReturnType<typeof record>) => { value.flight.duration.dayMinutes = Number.NaN; }],
    ['night duration', (value: ReturnType<typeof record>) => { value.flight.duration.nightMinutes = Number.POSITIVE_INFINITY; }],
    ['total duration', (value: ReturnType<typeof record>) => { value.flight.duration.totalMinutes = Number.NEGATIVE_INFINITY; }],
    ['actual IFR duration', (value: ReturnType<typeof record>) => { value.flight.duration.ifrActualMinutes = Number.NaN; }],
    ['simulated IFR duration', (value: ReturnType<typeof record>) => { value.flight.duration.ifrSimulatedMinutes = Number.POSITIVE_INFINITY; }],
    ['fuel', (value: ReturnType<typeof record>) => { value.flight.fuelBeforeEngineStart = Number.NaN; }],
    ['cargo', (value: ReturnType<typeof record>) => { value.flight.cargoKg = Number.POSITIVE_INFINITY; }],
  ])('fails closed for non-finite persisted %s', (_label, mutate) => {
    const value = record();
    mutate(value);
    expect(isPersistedEdbFlightRecord(value)).toBe(false);
  });

  it('rejects mixed-type persisted string evidence arrays', () => {
    const owners = record();
    owners.identity.aircraft.owners = ['Owner A', 123 as unknown as string];
    expect(isPersistedEdbFlightRecord(owners)).toBe(false);

    const occurrences = record();
    occurrences.flight.occurrences = ['none', { text: 'unexpected' } as unknown as string];
    expect(isPersistedEdbFlightRecord(occurrences)).toBe(false);
  });

  it('rejects malformed nested crew and discrepancy identities', () => {
    const crew = record();
    crew.flight.crew = [{
      employeeId: 1,
      fullName: 'PIC Test',
      anacCode: null,
      operationalRole: 'INVALID' as 'PIC',
      regulatoryFunctionCode: null,
    }];
    expect(isPersistedEdbFlightRecord(crew)).toBe(false);

    const discrepancy = record();
    discrepancy.flight.technicalDiscrepancies = [{
      description: 'Hydraulic indication',
      detectedBy: {
        employeeId: 10.5,
        fullName: 'Mechanic Test',
        anacCode: null,
      },
    }];
    expect(isPersistedEdbFlightRecord(discrepancy)).toBe(false);
  });

  it('rejects invalid correction revision evidence', () => {
    const zero = record();
    zero.correction.revision = 0;
    expect(isPersistedEdbFlightRecord(zero)).toBe(false);

    const fractional = record();
    fractional.correction.revision = 1.5;
    expect(isPersistedEdbFlightRecord(fractional)).toBe(false);
  });
});
