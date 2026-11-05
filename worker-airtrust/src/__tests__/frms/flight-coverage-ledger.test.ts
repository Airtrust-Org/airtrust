import { describe, expect, it } from 'vitest';
import type { SigvoosSyncSummary } from '../../services/sigvoos-frms';
import {
  buildRollingFlightCoverage,
  coverageDayEventId,
  enumerateDays,
  isApprovedCoverageTenant,
  isVerifiedCvSigvoosSync,
  loadConfirmedFlightDays,
  persistClosedDayCoverage,
  revokeClosedDayCoverage,
} from '../../lib/frms/flight-coverage-ledger';
import { hasCompleteRollingFlightCoverage } from '../../lib/frms/regulatory-compliance';

function summary(overrides: Record<string, unknown> = {}): SigvoosSyncSummary {
  return {
    periodo: { from: '2026-11-02', to: '2026-11-04' },
    sourceWindowVerified: true,
    totalErros: 0,
    totalRegistrosBrutos: 1,
    totalRegistrosNormalizados: 1,
    importacoes: [{
      tripulante_id: '17', erros: 0,
    }],
    controleVoosImport: {
      status: 'OK', sourceMaterialized: true, rawRecords: 1,
      createdFlights: 1, createdEtapas: 1, createdTripulantes: 1,
      reusedRecords: 0, conflictRecords: 0, failedPayloads: 0,
    },
    ...overrides,
  } as unknown as SigvoosSyncSummary;
}

function recorder() {
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare: (sql: string) => {
      let values: unknown[] = [];
      return {
        bind: (...v: unknown[]) => {
          values = v;
          return { run: async () => {
            writes.push({ sql, values });
            return { meta: { changes: 1 } };
          } };
        },
      };
    },
  };
  return { db: db as unknown as D1Database, writes };
}

describe('FRMS SIGVOOS/CV closed-day coverage ledger', () => {
  it('validates leap dates and never accepts future or malformed boundaries', () => {
    expect(enumerateDays('2024-02-28', '2024-03-01')).toEqual([
      '2024-02-28', '2024-02-29', '2024-03-01',
    ]);
    expect(() => enumerateDays('2026-02-29', '2026-03-01')).toThrow();
    expect(() => enumerateDays('2026-11-04', '2026-11-02')).toThrow();
    expect(() => coverageDayEventId(0, '2026-11-04')).toThrow();
  });

  it('does not certify a source until CV and matching crew data are complete', () => {
    expect(isApprovedCoverageTenant(6, '6, 7')).toBe(true);
    expect(isApprovedCoverageTenant(6, 'all,*')).toBe(false);
    expect(isApprovedCoverageTenant(6, undefined)).toBe(false);
    expect(isApprovedCoverageTenant(6, '60,61')).toBe(false);
    expect(isVerifiedCvSigvoosSync(summary())).toBe(true);
    expect(isVerifiedCvSigvoosSync(summary({ sourceWindowVerified: false }))).toBe(false);
    expect(isVerifiedCvSigvoosSync(summary({
      totalRegistrosBrutos: 0, totalRegistrosNormalizados: 0,
      importacoes: [],
      controleVoosImport: {
        status: 'OK', sourceMaterialized: true, rawRecords: 0, createdFlights: 0, createdEtapas: 0,
        createdTripulantes: 0, reusedRecords: 0, conflictRecords: 0, failedPayloads: 0,
      },
    }))).toBe(true); // zero from complete external API is valid evidence
    expect(isVerifiedCvSigvoosSync(summary({
      controleVoosImport: { ...summary().controleVoosImport, sourceMaterialized: false },
    }))).toBe(false);
    expect(isVerifiedCvSigvoosSync(summary({ controleVoosImport: { status: 'DISABLED' } }))).toBe(false);
    expect(isVerifiedCvSigvoosSync(summary({ totalRegistrosNormalizados: 0 }))).toBe(false);
    expect(isVerifiedCvSigvoosSync(summary({ importacoes: [{ tripulante_id: null, erros: 0 }] }))).toBe(false);
    expect(isVerifiedCvSigvoosSync(summary({ importacoes: [{ tripulante_id: '17', erros: 1 }] }))).toBe(false);
    expect(isVerifiedCvSigvoosSync(summary({ totalErros: 1 }))).toBe(false);
    expect(isVerifiedCvSigvoosSync(summary({
      controleVoosImport: { ...summary().controleVoosImport, conflictRecords: 1 },
    }))).toBe(false);
    expect(isVerifiedCvSigvoosSync(summary({
      controleVoosImport: { ...summary().controleVoosImport, failedPayloads: 1 },
    }))).toBe(false);
  });

  it('persists only tenant-scoped closed days, including attested no-flight days', async () => {
    const { db, writes } = recorder();
    const zero = summary({
      totalRegistrosBrutos: 0, totalRegistrosNormalizados: 0, importacoes: [],
      controleVoosImport: {
        status: 'OK', sourceMaterialized: true, rawRecords: 0, createdFlights: 0, createdEtapas: 0,
        createdTripulantes: 0, reusedRecords: 0, conflictRecords: 0, failedPayloads: 0,
      },
    });
    expect(await persistClosedDayCoverage({
      db, empresaId: 6, periodFrom: '2026-11-02', periodTo: '2026-11-04',
      operationalDate: '2026-11-05', summary: zero, authoritativeSourceApproved: true, verifiedAt: '2026-11-05T14:00:00Z',
    })).toEqual({ confirmed: 3, unverified: 0 });
    expect(writes).toHaveLength(3);
    expect(writes.every(({ sql }) => sql.includes('empresa_id = excluded.empresa_id'))).toBe(true);
    expect(writes.map((w) => w.values[0])).toEqual([
      coverageDayEventId(6, '2026-11-02'),
      coverageDayEventId(6, '2026-11-03'),
      coverageDayEventId(6, '2026-11-04'),
    ]);
    expect(writes.every((w) => w.values[1] === 6 && w.values[2] === 'CONSOLIDADO')).toBe(true);
    await expect(persistClosedDayCoverage({
      db, empresaId: 6, periodFrom: '2026-11-04', periodTo: '2026-11-05',
      operationalDate: '2026-11-05', summary: zero, authoritativeSourceApproved: true,
    })).rejects.toThrow('FRMS_COVERAGE_NON_CLOSED_OR_MISMATCHED_WINDOW');
  });

  it('does not certify a technically successful source without operator approval', async () => {
    const { db, writes } = recorder();
    const result = await persistClosedDayCoverage({
      db, empresaId: 6, periodFrom: '2026-11-02', periodTo: '2026-11-04',
      operationalDate: '2026-11-05', summary: summary(), authoritativeSourceApproved: false,
    });
    expect(result).toEqual({ confirmed: 0, unverified: 3 });
    expect(writes.every((w) => w.values[2] === 'FALHOU')).toBe(true);
  });

  it('records FALHOU on nonverified CV import, not fictitious zero', async () => {
    const { db, writes } = recorder();
    const result = await persistClosedDayCoverage({
      db, empresaId: 6, periodFrom: '2026-11-02', periodTo: '2026-11-04',
      operationalDate: '2026-11-05', summary: summary({ totalErros: 1 }), authoritativeSourceApproved: true,
    });
    expect(result).toEqual({ confirmed: 0, unverified: 3 });
    expect(writes.every((w) => w.values[2] === 'FALHOU')).toBe(true);
  });

  it('revokes existing positive attestations after a failed recheck', async () => {
    const { db, writes } = recorder();
    await revokeClosedDayCoverage(db, 6, '2026-11-03', '2026-11-04', '2026-11-05');
    expect(writes).toHaveLength(2);
    expect(writes.every((w) => w.sql.includes("status = 'FALHOU'"))).toBe(true);
    expect(writes[0]?.values[2]).toBe(6);
  });

  it('loads only same-tenant validated events with explicit version and CV materialisation', async () => {
    const id = coverageDayEventId(6, '2026-11-04');
    const payload = JSON.stringify({
      version: 1, empresa_id: 6, day: '2026-11-04',
      source: 'SIGVOOS_CV', cv_materialized: true, source_fetched: true,
      verified_at: '2026-11-05T12:00:00Z',
    });
    const binds: unknown[][] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => {
          expect(sql).toContain('empresa_id = ?');
          binds.push(values);
          return { all: async () => ({ results: [
            { id, status: 'CONSOLIDADO', payload_json: payload },
            { id: coverageDayEventId(7, '2026-11-04'), status: 'CONSOLIDADO', payload_json: payload },
            { id: coverageDayEventId(6, '2026-11-03'), status: 'FALHOU', payload_json: payload },
            { id: coverageDayEventId(6, '2026-11-02'), status: 'CONSOLIDADO',
              payload_json: JSON.stringify({ ...JSON.parse(payload), version: 0, day: '2026-11-02' }) },
          ] }) };
        },
      }),
    } as unknown as D1Database;
    const coverage = await loadConfirmedFlightDays(db, 6, '2026-11-02', '2026-11-04');
    expect([...coverage.keys()]).toEqual(['2026-11-04']);
    expect(binds).toEqual([[6, coverageDayEventId(6, '2026-11-02'), id]]);
  });

  it('never marks incomplete rolling month/year/28/365 windows as compliant', () => {
    const reference = '2026-11-05';
    const allDays = new Map(enumerateDays('2025-11-06', reference).map(day =>
      [day, '2026-11-05T12:00:00Z'] as const));
    const complete = buildRollingFlightCoverage(reference, allDays, '2026-11-05 12:01:00');
    expect(complete.windows.month.expectedDays).toBe(5);
    expect(complete.windows.year.expectedDays).toBe(309);
    expect(complete.windows.days28.expectedDays).toBe(28);
    expect(complete.windows.days365.expectedDays).toBe(365);
    expect(hasCompleteRollingFlightCoverage(complete)).toBe(true);
    allDays.delete('2026-11-02');
    expect(hasCompleteRollingFlightCoverage(buildRollingFlightCoverage(reference, allDays, '2026-11-05 12:01:00'))).toBe(false);
    expect(hasCompleteRollingFlightCoverage(buildRollingFlightCoverage(reference, new Map()))).toBe(false);
    expect(hasCompleteRollingFlightCoverage(buildRollingFlightCoverage(reference, allDays))).toBe(false);
    expect(hasCompleteRollingFlightCoverage(buildRollingFlightCoverage(reference, allDays, '2026-11-05 11:59:00'))).toBe(false);
  });
});
