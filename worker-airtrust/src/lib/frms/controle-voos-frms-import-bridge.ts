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

/**
 * The governed batch runner's exact signature. Kept as an alias so the default
 * (`runSigvoosImporterBatch`) assigns without any cast and tests can inject a
 * compatible stub.
 */
export type SigvoosImporterBatchRunner = typeof runSigvoosImporterBatch;

export interface ControleVoosImportOutcome {
  status: 'DISABLED' | 'OK' | 'ERROR';
  rawRecords: number;
  createdFlights: number;
  createdEtapas: number;
  createdTripulantes: number;
  reusedRecords: number;
  conflictRecords: number;
  failedPayloads: number;
  /** Independently read back active, tenant-scoped CV legs/crew and conflicts.
   * Importer OK/reused counters alone never prove materialisation. */
  sourceMaterialized: boolean;
  errorMessage?: string;
}

const disabledOutcome = (rawRecordsCount: number): ControleVoosImportOutcome => ({
  status: 'DISABLED',
  rawRecords: rawRecordsCount,
  createdFlights: 0,
  createdEtapas: 0,
  createdTripulantes: 0,
  reusedRecords: 0,
  conflictRecords: 0,
  failedPayloads: 0,
  sourceMaterialized: false,
});

type CvMaterializedStage = {
  id: string;
  import_status: string;
  active_flight: number | null;
  active_etapa: number | null;
  active_crew: number | null;
  unresolved: number;
};

/** Fail-closed readback for reused and newly imported SIGVOOS stages.
 * A reused CONFLICT/PENDING stage is not a completed CV leg even when the
 * importer returns OK with conflictRecords=0 for this particular replay.
 */
async function verifyCvMaterializedStages(
  db: D1Database,
  empresaId: number,
  rawCount: number,
  report: SigvoosImporterRunnerReport,
): Promise<boolean> {
  if (report.failedPayloads !== 0 || report.conflictRecords !== 0 ||
      report.byPayload.length !== 1 || report.byPayload[0]?.totalRecords !== rawCount) {
    return false;
  }
  const results = report.byPayload[0].rawSummary?.results;
  if (!Array.isArray(results) || results.length !== rawCount) return false;
  const ids = new Set<string>();
  for (const result of results) {
    if (!result.stageId || result.status === 'CONFLICT' ||
        !Number.isSafeInteger(result.flightId) || Number(result.flightId) <= 0 ||
        !Number.isSafeInteger(result.etapaId) || Number(result.etapaId) <= 0 ||
        !Number.isSafeInteger(result.tripulanteId) || Number(result.tripulanteId) <= 0) {
      return false;
    }
    ids.add(result.stageId);
  }
  if (ids.size !== rawCount) return false;

  const stages = [...ids];
  for (let offset = 0; offset < stages.length; offset += 50) {
    const chunk = stages.slice(offset, offset + 50);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db.prepare(
      `SELECT s.id, s.import_status,
              v.id AS active_flight, e.id AS active_etapa, t.id AS active_crew,
              EXISTS (
                SELECT 1 FROM cv_conflitos_integracao c
                WHERE c.empresa_id = s.empresa_id AND c.staging_id = s.id
                  AND c.status = 'ABERTO' AND c.deleted_at IS NULL
              ) AS unresolved
         FROM cv_sigvoos_staging s
         LEFT JOIN cv_voos v ON v.id = s.cv_voo_id AND v.empresa_id = s.empresa_id
           AND v.deleted_at IS NULL
         LEFT JOIN cv_voo_etapas e ON e.id = s.cv_etapa_id AND e.voo_id = s.cv_voo_id
           AND e.empresa_id = s.empresa_id AND e.deleted_at IS NULL
         LEFT JOIN cv_voo_tripulantes t ON t.id = s.cv_tripulante_id
           AND t.voo_id = s.cv_voo_id AND t.etapa_id = s.cv_etapa_id
           AND t.empresa_id = s.empresa_id AND t.deleted_at IS NULL
        WHERE s.empresa_id = ? AND s.deleted_at IS NULL AND s.id IN (${placeholders})`
    ).bind(empresaId, ...chunk).all<CvMaterializedStage>();
    if (rows.results.length !== chunk.length) return false;
    const found = new Set<string>();
    for (const row of rows.results) {
      if (!chunk.includes(row.id) || found.has(row.id) ||
          row.import_status !== 'PROCESSED' ||
          !row.active_flight || !row.active_etapa || !row.active_crew ||
          Number(row.unresolved) !== 0) return false;
      found.add(row.id);
    }
  }
  return true;
}

export async function importControleVoosFromSigvoosRaw(params: {
  db: D1Database;
  empresaId: number | null | undefined;
  rawRecords: ReadonlyArray<Record<string, unknown>>;
  from: string;
  to: string;
  operadorId?: string | number | null;
  env: ControleVoosFrmsImportFlagEnv | undefined;
  /** Injectable for tests; defaults to the real governed batch runner. */
  runner?: SigvoosImporterBatchRunner;
}): Promise<ControleVoosImportOutcome> {
  const { db, empresaId, rawRecords, from, to, operadorId, env } = params;
  const runner: SigvoosImporterBatchRunner = params.runner ?? runSigvoosImporterBatch;
  const count = rawRecords.length;

  if (typeof empresaId !== 'number' || empresaId <= 0) return disabledOutcome(count);
  if (!isControleVoosFrmsImportEnabledForEmpresa(empresaId, env ?? {})) {
    return disabledOutcome(count);
  }
  if (count === 0) {
    return { ...disabledOutcome(count), status: 'OK', sourceMaterialized: true };
  }

  try {
    const report = await runner(
      db,
      empresaId,
      [
        {
          payload: rawRecords,
          label: `sigvoos-frms-sync ${from}..${to}`,
          empresaId,
          sourceWindowStart: from,
          sourceWindowEnd: to,
          actorUserId: Number(operadorId) || null,
        },
      ],
      { continueOnError: true, sourceWindowStart: from, sourceWindowEnd: to },
    );

    const sourceMaterialized = await verifyCvMaterializedStages(db, empresaId, count, report);
    return {
      status: 'OK',
      sourceMaterialized,
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
      sourceMaterialized: false,
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
