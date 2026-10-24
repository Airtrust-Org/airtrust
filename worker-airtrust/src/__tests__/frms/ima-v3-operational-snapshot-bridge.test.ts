import { describe, expect, it } from 'vitest';
import {
  bridgeImaOperationalSnapshot,
  type ImaSnapshotEvidenceRow,
  type ImaSnapshotBridgeInput,
} from '../../lib/frms/ima-v3-operational-snapshot-bridge';

const actual: ImaSnapshotEvidenceRow = {
  empresa_id: 6, funcionario_id: 42, data_operacional: '2026-10-15',
  hora_apresentacao: '03:00', hora_termino: '11:00',
  jornada_data_source: 'REAL', operational_data_source: 'CONTROLE_VOOS',
  escala_source: 'EVD', escalado: true, teve_jornada: true,
  snapshot_status: 'OK',
  checkin_status: 'RECEBIDO', sleep_data_source: 'REAL', wake_data_source: 'REAL',
  horas_sono: 7.5, kss_score: 4,
};

const input = (rows: ImaSnapshotEvidenceRow[]): ImaSnapshotBridgeInput => ({
  expectedEmpresaId: 6,
  expectedFuncionarioId: 42,
  snapshotRows: rows,
  windowStartAt: '2026-10-15T00:00:00-03:00',
  windowEndAt: '2026-10-16T00:00:00-03:00',
  referenceUtcOffsetMinutes: -180,
});

describe('FRMS IMA V3 operational snapshot bridge — tenant-scoped, no dispatch hook', () => {
  it('does not promote reconstructed CV +/-30min duty boundaries to observed, or gaps to sleep', () => {
    const result = bridgeImaOperationalSnapshot(input([actual]));
    expect(result).toMatchObject({
      sourceRows: 1, mappedActualRows: 0, mappedPlannedRows: 0,
      mappedEstimatedRows: 1, reconstructedOperationalRows: 1,
      rejectedRows: 0, operationalDecision: 'NOT_ASSESSED',
      modelValidation: 'NOT_VALIDATED',
      exposure: {
        state: 'INCOMPLETE_SCHEDULE', estimatedDutyHours: 8, actualDutyHours: 0,
        gapHours: 16, estimatedReferenceNightDutyHours: 3,
        actualReferenceNightDutyHours: 0, offDutyOpportunityHours: 0,
        verifiedSleepHours: null, fatigueIndex: null, fitForDuty: null,
        flightAuthorization: 'NOT_PROVIDED',
      },
    });
    expect(result.dailyEvidence).toMatchObject({
      sampleSize: 1, realSleepDurationRows: 1, wakeEvidenceRows: 1,
      knownKssRows: 1, datedSleepEpisodeRows: 0,
      datedSleepEpisodeCoveragePct: 0, readyPvtBaselineRows: 0,
      assessment: 'INSUFFICIENT_SLEEP_TIMELINE',
    });
    expect(JSON.stringify(result)).not.toContain('"funcionario_id"');
    expect(JSON.stringify(result)).not.toContain('"empresa_id"');
  });

  it('classifies a genuine scale without a performed journey as PLANNED', () => {
    const planned: ImaSnapshotEvidenceRow = {
      ...actual, teve_jornada: false, jornada_data_source: 'AUSENTE',
      operational_data_source: 'AUSENTE', escala_source: 'EVD', snapshot_status: 'ATENCAO',
    };
    const result = bridgeImaOperationalSnapshot(input([planned]));
    expect(result.mappedPlannedRows).toBe(1);
    expect(result.exposure.plannedDutyHours).toBe(8);
    expect(result.exposure.actualDutyHours).toBe(0);
  });

  it('never upgrades mixed fallback or manual journey to ACTUAL', () => {
    const mixed = bridgeImaOperationalSnapshot(input([{
      ...actual, operational_data_source: 'CONTROLE_VOOS_COM_FALLBACK_SIGVOOS',
    }]));
    expect(mixed.exposure.estimatedDutyHours).toBe(8);
    expect(mixed.reconstructedOperationalRows).toBe(0);
    expect(mixed.exposure.actualDutyHours).toBe(0);
    expect(mixed.mappedEstimatedRows).toBe(1);

    const manual = bridgeImaOperationalSnapshot(input([{
      ...actual, jornada_data_source: 'MANUAL', operational_data_source: 'AUSENTE',
    }]));
    expect(manual.mappedEstimatedRows).toBe(1);
    expect(manual.exposure.actualDutyHours).toBe(0);
  });

  it('rejects absent provenance, including a roster-only entry', () => {
    const result = bridgeImaOperationalSnapshot(input([{
      ...actual, escalado: false, teve_jornada: false,
      jornada_data_source: 'AUSENTE', escala_source: 'AUSENTE',
      operational_data_source: 'AUSENTE',
    }]));
    expect(result).toMatchObject({
      rejectedRows: 1,
      rejectedReasons: { UNKNOWN_PROVENANCE: 1 },
      exposure: { state: 'NO_SCHEDULE_EVIDENCE', gapHours: 24 },
    });
  });

  it('quarantines snapshot inconsistencies and missing boundaries', () => {
    const inconsistent = bridgeImaOperationalSnapshot(input([{
      ...actual, snapshot_status: 'INCOMPLETO',
    }]));
    expect(inconsistent.rejectedReasons.INCONSISTENT_SNAPSHOT).toBe(1);
    const missing = bridgeImaOperationalSnapshot(input([{
      ...actual, hora_termino: null,
    }]));
    expect(missing.rejectedReasons.INCOMPLETE_BOUNDARY).toBe(1);
    expect(missing.exposure.reportedHours).toBe(0);
    expect(missing.exposure.offDutyOpportunityHours).toBe(0);
  });

  it('rejects cross-tenant and cross-crew rows before any output', () => {
    expect(() => bridgeImaOperationalSnapshot(input([
      actual, { ...actual, data_operacional: '2026-10-16', empresa_id: 7 },
    ]))).toThrow('IMA_BRIDGE_CROSS_TENANT');
    expect(() => bridgeImaOperationalSnapshot(input([{
      ...actual, funcionario_id: 43,
    }]))).toThrow('IMA_BRIDGE_CROSS_CREW');
    expect(() => bridgeImaOperationalSnapshot({
      ...input([]), expectedEmpresaId: 0,
    })).toThrow('IMA_BRIDGE_AUTHORIZED_ID_REQUIRED');
  });

  it('rejects duplicate crew-days rather than summing or silently favoring source', () => {
    expect(() => bridgeImaOperationalSnapshot(input([
      actual, { ...actual, operational_data_source: 'SIGVOOS' },
    ]))).toThrow('IMA_BRIDGE_DUPLICATE_DAY');
  });

  it('preserves overnight crossing with explicit operational offset', () => {
    const result = bridgeImaOperationalSnapshot(input([{
      ...actual, hora_apresentacao: '22:30', hora_termino: '04:30',
    }]));
    expect(result.exposure.estimatedDutyHours).toBe(1.5); // clipped at midnight
    expect(result.exposure.actualDutyHours).toBe(0);
    expect(result.exposure.estimatedReferenceNightDutyHours).toBe(0);
    expect(result.exposure.gapHours).toBe(22.5);
  });

  it('does not mark check-in values as observed if check-in was not received', () => {
    const result = bridgeImaOperationalSnapshot(input([{
      ...actual, checkin_status: 'PENDENTE',
    }]));
    expect(result.dailyEvidence).toMatchObject({
      sampleSize: 1, pendingCheckinRows: 1,
      realSleepDurationRows: 0, wakeEvidenceRows: 0,
      knownKssRows: 0, datedSleepEpisodeRows: 0,
      readyPvtBaselineRows: 0,
    });
    expect(result.dailyEvidence.blockerCodes)
      .toContain('SONO_DIARIO_NAO_COMPROVA_CRONOLOGIA_DE_SONO_VIGILIA');
  });

  it('never creates a sleep episode from declared duration plus wake hour', () => {
    const evidence = bridgeImaOperationalSnapshot(input([{
      ...actual, horas_sono: 8, kss_score: 8,
    }])).dailyEvidence;
    expect(evidence.realSleepDurationRows).toBe(1);
    expect(evidence.knownKssRows).toBe(1);
    expect(evidence.datedSleepEpisodeRows).toBe(0);
    expect(evidence.assessment).toBe('INSUFFICIENT_SLEEP_TIMELINE');
  });

  it('rejects invalid clock, same start/end and impossible calendar dates', () => {
    const badClock = bridgeImaOperationalSnapshot(input([{
      ...actual, hora_apresentacao: '24:00',
    }]));
    expect(badClock.rejectedReasons.INCOMPLETE_BOUNDARY).toBe(1);
    expect(bridgeImaOperationalSnapshot(input([{
      ...actual, hora_termino: '03:00',
    }])).exposure.reportedHours).toBe(0);
    expect(() => bridgeImaOperationalSnapshot(input([{
      ...actual, data_operacional: '2026-02-30',
    }]))).toThrow('IMA_BRIDGE_INVALID_DATE');
  });

  it('fails closed on overlapping dates rather than double counting actual/planned', () => {
    const a: ImaSnapshotEvidenceRow = {
      ...actual, hora_apresentacao: '22:00', hora_termino: '04:00',
    };
    const b: ImaSnapshotEvidenceRow = {
      ...actual, data_operacional: '2026-10-16',
      hora_apresentacao: '02:00', hora_termino: '09:00',
      teve_jornada: false, jornada_data_source: 'AUSENTE',
      operational_data_source: 'AUSENTE',
    };
    expect(() => bridgeImaOperationalSnapshot({
      ...input([a, b]), windowEndAt: '2026-10-17T00:00:00-03:00',
    })).toThrow('IMA_SCHEDULE_OVERLAPPING_EVIDENCE');
  });
});
