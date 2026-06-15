import type { D1Database } from '@cloudflare/workers-types';
import {
  importSigvoosPayloadToControleVoos,
  type ImportSigvoosPayloadItemResult,
  type ImportSigvoosPayloadOptions,
  type ImportSigvoosPayloadSummary,
} from './sigvoos-importer';

type RunnerPayloadStatus = 'PROCESSED' | 'PARTIAL' | 'REUSED' | 'CONFLICT' | 'EMPTY' | 'ERROR';

type ConflictSeverity = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
type ConflictStatus = 'ABERTO' | 'RESOLVIDO' | 'IGNORADO';
type ConflictEntityType = 'voo' | 'etapa' | 'tripulante';

export interface SigvoosImporterRunnerPayloadInput {
  payload: unknown;
  label?: string;
  empresaId?: number;
  sourceWindowStart?: string;
  sourceWindowEnd?: string;
  actorUserId?: number | null;
}

export interface SigvoosImporterRunnerOptions extends ImportSigvoosPayloadOptions {
  continueOnError?: boolean;
}

export interface SigvoosImporterRunnerWarning {
  code: 'PAYLOAD_EMPTY' | 'PAYLOAD_REUSED' | 'PAYLOAD_CONFLICT' | 'PAYLOAD_ERROR';
  payloadIndex: number;
  label: string;
  message: string;
}

export interface SigvoosImporterRunnerConflict {
  id: number;
  payloadIndex: number;
  label: string;
  stageId: string;
  payloadHash: string;
  entityType: ConflictEntityType;
  entityId: number;
  field: string;
  severity: ConflictSeverity;
  status: ConflictStatus;
  justification: string | null;
  sigvoosValue: unknown;
}

export interface SigvoosImporterRunnerPayloadReport {
  payloadIndex: number;
  label: string;
  empresaId: number;
  status: RunnerPayloadStatus;
  totalRecords: number;
  processedRecords: number;
  conflictRecords: number;
  reusedRecords: number;
  reusedStages: number;
  createdFlights: number;
  updatedFlights: number;
  createdEtapas: number;
  updatedEtapas: number;
  createdTripulantes: number;
  updatedTripulantes: number;
  resolvedTripulantes: number;
  createdConflicts: number;
  payloadHashes: string[];
  stageIds: string[];
  conflicts: SigvoosImporterRunnerConflict[];
  warnings: SigvoosImporterRunnerWarning[];
  rawSummary: ImportSigvoosPayloadSummary;
  errorMessage?: string;
}

export interface SigvoosImporterRunnerReport {
  totalPayloads: number;
  processedPayloads: number;
  reusedPayloads: number;
  failedPayloads: number;
  processedRecords: number;
  conflictRecords: number;
  reusedRecords: number;
  reusedStages: number;
  createdFlights: number;
  updatedFlights: number;
  createdEtapas: number;
  updatedEtapas: number;
  createdTripulantes: number;
  updatedTripulantes: number;
  resolvedTripulantes: number;
  createdConflicts: number;
  conflicts: SigvoosImporterRunnerConflict[];
  warnings: SigvoosImporterRunnerWarning[];
  byPayload: SigvoosImporterRunnerPayloadReport[];
}

interface ConflictRow {
  id: number;
  entidade_tipo: ConflictEntityType;
  entidade_id: number;
  campo: string;
  valor_sigvoos: string | null;
  severidade: ConflictSeverity;
  status: ConflictStatus;
  justificativa: string | null;
  staging_id: string;
}

function parseJsonIfPossible(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function loadConflict(
  db: D1Database,
  conflictId: number,
): Promise<ConflictRow | null> {
  return (
    (await db
      .prepare(
        `SELECT id, entidade_tipo, entidade_id, campo, valor_sigvoos, severidade, status, justificativa, staging_id
           FROM cv_conflitos_integracao
          WHERE id = ?`,
      )
      .bind(conflictId)
      .first<ConflictRow>()) || null
  );
}

async function collectConflicts(
  db: D1Database,
  payloadIndex: number,
  label: string,
  results: ImportSigvoosPayloadItemResult[],
): Promise<SigvoosImporterRunnerConflict[]> {
  const conflicts: SigvoosImporterRunnerConflict[] = [];

  for (const result of results) {
    if (!result.conflictId) continue;
    const row = await loadConflict(db, result.conflictId);
    if (!row) continue;

    conflicts.push({
      id: Number(row.id),
      payloadIndex,
      label,
      stageId: row.staging_id,
      payloadHash: result.payloadHash,
      entityType: row.entidade_tipo,
      entityId: Number(row.entidade_id),
      field: row.campo,
      severity: row.severidade,
      status: row.status,
      justification: row.justificativa,
      sigvoosValue: parseJsonIfPossible(row.valor_sigvoos),
    });
  }

  return conflicts;
}

function buildWarnings(
  payloadIndex: number,
  label: string,
  summary: ImportSigvoosPayloadSummary,
  status: RunnerPayloadStatus,
  errorMessage?: string,
): SigvoosImporterRunnerWarning[] {
  const warnings: SigvoosImporterRunnerWarning[] = [];

  if (summary.totalRecords === 0) {
    warnings.push({
      code: 'PAYLOAD_EMPTY',
      payloadIndex,
      label,
      message: 'payload sem registros extraiveis',
    });
  }

  if (summary.reusedRecords > 0) {
    warnings.push({
      code: 'PAYLOAD_REUSED',
      payloadIndex,
      label,
      message: `${summary.reusedRecords}/${summary.totalRecords} registros reutilizados do staging local`,
    });
  }

  if (summary.conflictRecords > 0) {
    warnings.push({
      code: 'PAYLOAD_CONFLICT',
      payloadIndex,
      label,
      message: `${summary.conflictRecords}/${summary.totalRecords} registros terminaram em conflito`,
    });
  }

  if (status === 'ERROR' && errorMessage) {
    warnings.push({
      code: 'PAYLOAD_ERROR',
      payloadIndex,
      label,
      message: errorMessage,
    });
  }

  return warnings;
}

function derivePayloadStatus(
  summary: ImportSigvoosPayloadSummary,
  errorMessage?: string,
): RunnerPayloadStatus {
  if (errorMessage) return 'ERROR';
  if (summary.totalRecords === 0) return 'EMPTY';
  if (summary.reusedRecords === summary.totalRecords) return 'REUSED';
  if (summary.conflictRecords === summary.totalRecords) return 'CONFLICT';
  if (summary.reusedRecords > 0 || summary.conflictRecords > 0) return 'PARTIAL';
  return 'PROCESSED';
}

function emptySummary(): ImportSigvoosPayloadSummary {
  return {
    totalRecords: 0,
    processedRecords: 0,
    conflictRecords: 0,
    reusedRecords: 0,
    createdFlights: 0,
    updatedFlights: 0,
    createdEtapas: 0,
    updatedEtapas: 0,
    createdTripulantes: 0,
    updatedTripulantes: 0,
    createdConflicts: 0,
    results: [],
  };
}

export async function runSigvoosImporterBatch(
  db: D1Database,
  defaultEmpresaId: number,
  payloads: ReadonlyArray<SigvoosImporterRunnerPayloadInput>,
  options: SigvoosImporterRunnerOptions = {},
): Promise<SigvoosImporterRunnerReport> {
  const report: SigvoosImporterRunnerReport = {
    totalPayloads: payloads.length,
    processedPayloads: 0,
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
  };

  for (const [index, input] of payloads.entries()) {
    const payloadIndex = index + 1;
    const label = input.label || `payload-${payloadIndex}`;
    const empresaId = input.empresaId ?? defaultEmpresaId;

    const importerOptions: ImportSigvoosPayloadOptions = {
      actorUserId: input.actorUserId ?? options.actorUserId ?? null,
      sourceWindowStart: input.sourceWindowStart ?? options.sourceWindowStart,
      sourceWindowEnd: input.sourceWindowEnd ?? options.sourceWindowEnd,
    };

    let summary = emptySummary();
    let errorMessage: string | undefined;

    try {
      summary = await importSigvoosPayloadToControleVoos(db, empresaId, input.payload as never, importerOptions);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error ?? 'SIGVOOS_IMPORT_RUNNER_ERROR');
      if (!options.continueOnError) {
        throw error;
      }
    }

    const status = derivePayloadStatus(summary, errorMessage);
    const conflicts = await collectConflicts(db, payloadIndex, label, summary.results);
    const warnings = buildWarnings(payloadIndex, label, summary, status, errorMessage);
    const resolvedTripulantes = summary.createdTripulantes + summary.updatedTripulantes;

    const payloadReport: SigvoosImporterRunnerPayloadReport = {
      payloadIndex,
      label,
      empresaId,
      status,
      totalRecords: summary.totalRecords,
      processedRecords: summary.processedRecords,
      conflictRecords: summary.conflictRecords,
      reusedRecords: summary.reusedRecords,
      reusedStages: summary.reusedRecords,
      createdFlights: summary.createdFlights,
      updatedFlights: summary.updatedFlights,
      createdEtapas: summary.createdEtapas,
      updatedEtapas: summary.updatedEtapas,
      createdTripulantes: summary.createdTripulantes,
      updatedTripulantes: summary.updatedTripulantes,
      resolvedTripulantes,
      createdConflicts: summary.createdConflicts,
      payloadHashes: summary.results.map((result) => result.payloadHash),
      stageIds: summary.results.map((result) => result.stageId),
      conflicts,
      warnings,
      rawSummary: summary,
      errorMessage,
    };

    report.byPayload.push(payloadReport);
    report.conflicts.push(...conflicts);
    report.warnings.push(...warnings);
    report.processedRecords += summary.processedRecords;
    report.conflictRecords += summary.conflictRecords;
    report.reusedRecords += summary.reusedRecords;
    report.reusedStages += summary.reusedRecords;
    report.createdFlights += summary.createdFlights;
    report.updatedFlights += summary.updatedFlights;
    report.createdEtapas += summary.createdEtapas;
    report.updatedEtapas += summary.updatedEtapas;
    report.createdTripulantes += summary.createdTripulantes;
    report.updatedTripulantes += summary.updatedTripulantes;
    report.resolvedTripulantes += resolvedTripulantes;
    report.createdConflicts += summary.createdConflicts;

    if (status === 'ERROR') {
      report.failedPayloads += 1;
      continue;
    }

    report.processedPayloads += 1;
    if (status === 'REUSED') {
      report.reusedPayloads += 1;
    }
  }

  return report;
}
