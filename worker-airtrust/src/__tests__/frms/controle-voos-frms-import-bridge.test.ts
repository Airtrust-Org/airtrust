import { describe, expect, it, vi } from 'vitest';
import { importControleVoosFromSigvoosRaw } from '../../lib/frms/controle-voos-frms-import-bridge';
import type { SigvoosImporterRunnerReport } from '../../services/controle-voos/sigvoos-importer-runner';

const db = {} as never;

function report(over: Partial<SigvoosImporterRunnerReport> = {}): SigvoosImporterRunnerReport {
  return {
    totalPayloads: 1,
    processedPayloads: 1,
    reusedPayloads: 0,
    failedPayloads: 0,
    processedRecords: 0,
    conflictRecords: 0,
    reusedRecords: 0,
    reusedStages: 0,
    createdFlights: 0,
    updatedFlights: 0,
    createdEtapas: 0,
    updatedEtapas: 0,
    createdTripulantes: 0,
    updatedTripulantes: 0,
    resolvedTripulantes: 0,
    createdConflicts: 0,
    conflicts: [],
    warnings: [],
    byPayload: [],
    ...over,
  } as SigvoosImporterRunnerReport;
}

const rawTwoLegs = [
  { flight_report: { id: 'FR-1' }, leg: { number: 1 } },
  { flight_report: { id: 'FR-1' }, leg: { number: 2 } },
] as Array<Record<string, unknown>>;

describe('importControleVoosFromSigvoosRaw — SIGVOOS → Controle de Voos bridge', () => {
  it('is DISABLED and does not call the importer when the tenant is not allow-listed', async () => {
    const runner = vi.fn();
    const out = await importControleVoosFromSigvoosRaw({
      db,
      empresaId: 6,
      rawRecords: rawTwoLegs,
      from: '2026-08-01',
      to: '2026-08-28',
      env: {},
      runner,
    });
    expect(out.status).toBe('DISABLED');
    expect(runner).not.toHaveBeenCalled();
  });

  it('feeds the SAME raw records to the governed importer exactly once, with the sync window', async () => {
    const runner = vi.fn().mockResolvedValue(
      report({ createdFlights: 1, createdEtapas: 2, createdTripulantes: 1, reusedRecords: 0 }),
    );
    const out = await importControleVoosFromSigvoosRaw({
      db,
      empresaId: 6,
      rawRecords: rawTwoLegs,
      from: '2026-08-01',
      to: '2026-08-28',
      operadorId: '99',
      env: { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: '6' },
      runner,
    });

    expect(runner).toHaveBeenCalledTimes(1);
    const [, empresaArg, payloads, options] = runner.mock.calls[0];
    expect(empresaArg).toBe(6);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].payload).toBe(rawTwoLegs); // same array, no re-normalisation
    expect(payloads[0].sourceWindowStart).toBe('2026-08-01');
    expect(payloads[0].sourceWindowEnd).toBe('2026-08-28');
    expect(payloads[0].actorUserId).toBe(99);
    expect(options.continueOnError).toBe(true);

    expect(out).toMatchObject({
      status: 'OK',
      rawRecords: 2,
      createdFlights: 1,
      createdEtapas: 2,
      createdTripulantes: 1,
    });
  });

  it('reports idempotency: a second run of the same payload creates nothing (all REUSED)', async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce(report({ createdFlights: 1, createdEtapas: 2, createdTripulantes: 1 }))
      .mockResolvedValueOnce(report({ reusedRecords: 2 }));

    const first = await importControleVoosFromSigvoosRaw({
      db, empresaId: 6, rawRecords: rawTwoLegs, from: '2026-08-01', to: '2026-08-28',
      env: { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: '6' }, runner,
    });
    const second = await importControleVoosFromSigvoosRaw({
      db, empresaId: 6, rawRecords: rawTwoLegs, from: '2026-08-01', to: '2026-08-28',
      env: { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: '6' }, runner,
    });

    expect(first.createdEtapas).toBe(2);
    expect(second.createdFlights).toBe(0);
    expect(second.createdEtapas).toBe(0);
    expect(second.reusedRecords).toBe(2);
  });

  it('surfaces importer conflicts without failing', async () => {
    const runner = vi.fn().mockResolvedValue(report({ conflictRecords: 1, failedPayloads: 0 }));
    const out = await importControleVoosFromSigvoosRaw({
      db, empresaId: 6, rawRecords: rawTwoLegs, from: '2026-08-01', to: '2026-08-28',
      env: { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: '6' }, runner,
    });
    expect(out.status).toBe('OK');
    expect(out.conflictRecords).toBe(1);
  });

  it('isolates a thrown importer error: status ERROR, never rethrows', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runner = vi.fn().mockRejectedValue(new Error('D1_WRITE_FAILED'));
    const out = await importControleVoosFromSigvoosRaw({
      db, empresaId: 6, rawRecords: rawTwoLegs, from: '2026-08-01', to: '2026-08-28',
      env: { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: '6' }, runner,
    });
    expect(out.status).toBe('ERROR');
    expect(out.errorMessage).toBe('D1_WRITE_FAILED');
    expect(out.failedPayloads).toBe(1);
    consoleSpy.mockRestore();
  });

  it('does nothing on an empty SIGVOOS window (status OK, no importer call)', async () => {
    const runner = vi.fn();
    const out = await importControleVoosFromSigvoosRaw({
      db, empresaId: 6, rawRecords: [], from: '2026-08-01', to: '2026-08-28',
      env: { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: '6' }, runner,
    });
    expect(out.status).toBe('OK');
    expect(out.rawRecords).toBe(0);
    expect(runner).not.toHaveBeenCalled();
  });

  it('is DISABLED for a null/invalid empresaId even when the flag is "all"', async () => {
    const runner = vi.fn();
    const out = await importControleVoosFromSigvoosRaw({
      db, empresaId: null, rawRecords: rawTwoLegs, from: '2026-08-01', to: '2026-08-28',
      env: { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: 'all' }, runner,
    });
    expect(out.status).toBe('DISABLED');
    expect(runner).not.toHaveBeenCalled();
  });
});
