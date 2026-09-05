import { describe, expect, it } from 'vitest';
import {
  EDB_CONTRACT_VERSION,
  createEmptyEdbFlightRecord,
  type EdbCrewMember,
} from '../../services/edb/contracts';

describe('eDB regulatory contract foundation', () => {
  it('creates a neutral draft without synthesizing unavailable regulated facts', () => {
    const record = createEmptyEdbFlightRecord({
      operatorCompanyId: 6,
      operatorRegulation: 'RBAC135',
      sourceFlightId: 101,
      capturedAt: '2026-09-05T07:00:00.000Z',
    });

    expect(record.contractVersion).toBe(EDB_CONTRACT_VERSION);
    expect(record.status).toBe('DRAFT');
    expect(record.logicalRecordId).toBeNull();
    expect(record.revisionId).toBeNull();
    expect(record.source).toEqual({
      sourceSystem: 'AIRTRUST',
      sourceType: 'CONTROLE_VOOS_RDV',
      sourceFlightId: 101,
      sourceRdvId: null,
      sourceRdvVersion: null,
      sourceStageId: null,
      capturedAt: '2026-09-05T07:00:00.000Z',
    });
    expect(record.flight.cycles).toBeNull();
    expect(record.flight.personsOnBoard).toBeNull();
    expect(record.flight.cargoKg).toBeNull();
    expect(record.flight.occurrences).toBeNull();
    expect(record.flight.technicalDiscrepancies).toBeNull();
    expect(record.signatures).toEqual({
      picTechnicalAcknowledgement: null,
      picFlightRecord: null,
      operatorRecord: null,
    });
  });

  it('preserves explicit zero source identifiers instead of treating them as absent', () => {
    const record = createEmptyEdbFlightRecord({
      operatorCompanyId: 6,
      operatorRegulation: 'RBAC135',
      sourceFlightId: 101,
      sourceRdvId: 0,
      sourceRdvVersion: 0,
      sourceStageId: 0,
      capturedAt: '2026-09-05T07:00:00.000Z',
      logicalRecordId: '',
      revisionId: '',
    });

    expect(record.source.sourceRdvId).toBe(0);
    expect(record.source.sourceRdvVersion).toBe(0);
    expect(record.source.sourceStageId).toBe(0);
    expect(record.logicalRecordId).toBe('');
    expect(record.revisionId).toBe('');
  });

  it('keeps operational role separate from the unresolved ANAC regulatory function code', () => {
    const pic: EdbCrewMember = {
      employeeId: 10,
      fullName: 'Piloto em Comando',
      anacCode: '123456',
      operationalRole: 'PIC',
      regulatoryFunctionCode: null,
    };
    const sic: EdbCrewMember = {
      employeeId: 11,
      fullName: 'Segundo em Comando',
      anacCode: '654321',
      operationalRole: 'SIC',
      regulatoryFunctionCode: null,
    };

    expect(pic.regulatoryFunctionCode).toBeNull();
    expect(sic.regulatoryFunctionCode).toBeNull();
  });
});
