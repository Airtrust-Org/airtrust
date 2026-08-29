/**
 * Bridge: the raw SIGVOOS payload the canonical FRMS sync already fetched →
 * the Controle de Voos tables (`cv_voos` / `cv_voo_etapas` /
 * `cv_voo_tripulantes`), which are the leg-level source consumed by
 * Operational Load V1.
 *
 * Design constraints:
 * - ONE canonical SIGVOOS read: this reuses `rawRecords` from the FRMS sync,
 *   it never issues a second external fetch;
 * - reuses the existing governed importer (`runSigvoosImporterBatch` →
 *   `importSigvoosPayloadToControleVoos`): idempotent staging via payload hash,
 *   conflict isolation via `cv_conflitos_integracao`, tenant-scoped writes;
 * - failure isolated: any error here is captured and returned, never thrown,
 *   so the FRMS sync path is unaffected;
 * - opt-in per tenant via `CONTROLE_VOOS_FRMS_IMPORT_TENANTS` (fail closed).
 */

import type { D1Database } from '@cloudflare/workers-types';
import {
  isControleVoosFrmsImportEnabledForEmpresa,
  type ControleVoosFrmsImportFlagEnv,
} from './controle-voos-frms-import-flag';
import {
  runSigvoosImporterBatch,
  type SigvoosImporterRunnerReport,
} from '../../services/controle-voos/sigvoos-importer-runner';

export interface ControleVoosImportOutcome {
  status: 'DISABLED' | 'OK' | 'ERROR';
  rawRecords: number;
  createdFlights: number;
  createdEtapas: number;
  createdTripulantes: number;
  reusedRecords: number;
  conflictRecords: number;
  failedPayloads: number;
  errorMessage?: string;
}

type BatchRunner = (
  db: D1Database,
  empresaId: number,
  payloads: ReadonlyArray<{
    payload: unknown;
    label?: string;
    empresaId?: number;
    sourceWindowStart?: string;
    sourceWindowEnd?: string;
    actorUserId?: number | null;
  }>,
  options?: { continueOnError?: boolean; sourceWindowStart?: string; sourceWindowEnd?: string },
) => Promise<SigvoosImporterRunnerReport>;

const disabledOutcome = (rawRecordsCount: number): ControleVoosImportOutcome => ({
  status: 'DISABLED',
  rawRecords: rawRecordsCount,
  createdFlights: 0,
  createdEtapas: 0,
  createdTripulantes: 0,
  reusedRecords: 0,
  conflictRecords: 0,
  failedPayloads: 0,
});

export async function importControleVoosFromSigvoosRaw(params: {
  db: D1Database;
  empresaId: number | null | undefined;
  rawRecords: ReadonlyArray<Record<string, unknown>>;
  from: string;
  to: string;
  operadorId?: string | number | null;
  env: ControleVoosFrmsImportFlagEnv | undefined;
  /** Injectable for tests; defaults to the real governed batch runner. */
  runner?: BatchRunner;
}): Promise<ControleVoosImportOutcome> {
  const { db, empresaId, rawRecords, from, to, operadorId, env } = params;
  const runner = params.runner ?? (runSigvoosImporterBatch as unknown as BatchRunner);
  const count = rawRecords.length;

  if (typeof empresaId !== 'number' || empresaId <= 0) return disabledOutcome(count);
  if (!isControleVoosFrmsImportEnabledForEmpresa(empresaId, env ?? {})) {
    return disabledOutcome(count);
  }
  if (count === 0) {
    return { ...disabledOutcome(count), status: 'OK' };
  }

  try {
    const report = await runner(
      db,
      empresaId,
      [
        {
          payload: rawRecords as unknown[],
          label: `sigvoos-frms-sync ${from}..${to}`,
          empresaId,
          sourceWindowStart: from,
          sourceWindowEnd: to,
          actorUserId: Number(operadorId) || null,
        },
      ],
      { continueOnError: true, sourceWindowStart: from, sourceWindowEnd: to },
    );

    return {
      status: 'OK',
      rawRecords: count,
      createdFlights: report.createdFlights,
      createdEtapas: report.createdEtapas,
      createdTripulantes: report.createdTripulantes,
      reusedRecords: report.reusedRecords,
      conflictRecords: report.conflictRecords,
      failedPayloads: report.failedPayloads,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error ?? 'CV_IMPORT_FAILED');
    // eslint-disable-next-line no-console
    console.error('[SIGVOOS_CRON] Controle de Voos import falhou (FRMS não afetado):', {
      empresaId,
      from,
      to,
      error: errorMessage,
    });
    return {
      status: 'ERROR',
      rawRecords: count,
      createdFlights: 0,
      createdEtapas: 0,
      createdTripulantes: 0,
      reusedRecords: 0,
      conflictRecords: 0,
      failedPayloads: 1,
      errorMessage,
    };
  }
}
