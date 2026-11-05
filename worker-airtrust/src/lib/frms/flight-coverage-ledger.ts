/**
 * AUD-005/025 — Attestations of closed operational days from SIGVOOS -> CV.
 * Zero flights is confirmed only by a complete, successful external fetch,
 * with no unmapped crew, unresolved CV conflict or failed payload.
 *
 * Reuses the tenant-scoped SIGVOOS event table (migration 0387): no new D1
 * schema or claims that old, pre-attestation syncs verified a zero-flight day.
 */
import type { SigvoosSyncSummary } from '../../services/sigvoos-frms';
import type { RollingFlightCoverageEvidence } from './regulatory-compliance';
import { addDaysIso } from './iso-date';

export const FRMS_COVERAGE_EVENT_TYPE = 'FRMS_COVERAGE_DAY';
const EVENT_PREFIX = 'frms_coverage_day';
const COVERAGE_SOURCE = 'SIGVOOS_CV';

type EventRow = { id: string; empresa_id?: number; status: string; payload_json: string | null };

export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function enumerateDays(from: string, to: string, limit = 400): string[] {
  if (!isIsoDay(from) || !isIsoDay(to) || to < from) throw new Error('FRMS_COVERAGE_DATE_INVALID');
  const days: string[] = [];
  for (let current = from; current <= to; current = addDaysIso(current, 1)) {
    if (days.length >= limit) throw new Error('FRMS_COVERAGE_WINDOW_TOO_LARGE');
    days.push(current);
  }
  return days;
}

export function isApprovedCoverageTenant(empresaId: number, csv: string | undefined): boolean {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) return false;
  return (csv ?? '').split(',').some((id) =>
    /^[1-9][0-9]*$/.test(id.trim()) && Number(id.trim()) === empresaId,
  );
}

export function isVerifiedCvSigvoosSync(summary: SigvoosSyncSummary): boolean {
  const cv = summary.controleVoosImport;
  const nonNegativeInt = (n: number) => Number.isSafeInteger(n) && n >= 0;
  if (!cv || cv.status !== 'OK' || summary.sourceWindowVerified !== true) return false;
  if (!nonNegativeInt(summary.totalErros) || summary.totalErros !== 0 ||
      !nonNegativeInt(summary.totalRegistrosBrutos) ||
      !nonNegativeInt(summary.totalRegistrosNormalizados) ||
      summary.totalRegistrosBrutos !== summary.totalRegistrosNormalizados ||
      !nonNegativeInt(cv.rawRecords) || cv.rawRecords !== summary.totalRegistrosBrutos ||
      !nonNegativeInt(cv.conflictRecords) || cv.conflictRecords !== 0 ||
      !nonNegativeInt(cv.failedPayloads) || cv.failedPayloads !== 0) return false;

  // Positive records without any resolved/mapped crew cannot attest a
  // complete CV materialisation. Missing mapping remains UNKNOWN.
  if (summary.totalRegistrosBrutos > 0 && summary.importacoes.length === 0) return false;
  return summary.importacoes.every((entry) =>
    entry.tripulante_id != null && String(entry.tripulante_id).trim().length > 0 &&
    nonNegativeInt(entry.erros) && entry.erros === 0
  );
}

export function coverageDayEventId(empresaId: number, day: string): string {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || !isIsoDay(day)) {
    throw new Error('FRMS_COVERAGE_TENANT_OR_DAY_INVALID');
  }
  return EVENT_PREFIX + ':' + empresaId + ':' + day;
}

export async function persistClosedDayCoverage(params: {
  db: D1Database;
  empresaId: number;
  periodFrom: string;
  periodTo: string;
  operationalDate: string;
  summary: SigvoosSyncSummary;
  /** Must be operator-reviewed: the API credentials cover all relevant flights. */
  authoritativeSourceApproved: boolean;
  verifiedAt?: string;
}): Promise<{ confirmed: number; unverified: number }> {
  const { db, empresaId, periodFrom, periodTo, operationalDate, summary } = params;
  const days = enumerateDays(periodFrom, periodTo, 32);
  if (!isIsoDay(operationalDate) || days.some((d) => d >= operationalDate) ||
      summary.periodo.from !== periodFrom || summary.periodo.to !== periodTo) {
    throw new Error('FRMS_COVERAGE_NON_CLOSED_OR_MISMATCHED_WINDOW');
  }
  const verified = params.authoritativeSourceApproved === true && isVerifiedCvSigvoosSync(summary);
  const stamp = params.verifiedAt ?? new Date().toISOString();
  for (const day of days) {
    const id = coverageDayEventId(empresaId, day);
    // Original import events remain as immutable chronological evidence.
    // This deterministic latest-state projection can be invalidated by a
    // subsequent failed reconciliation of the same day.
    const payload = JSON.stringify({
      version: 1, empresa_id: empresaId, day, source: COVERAGE_SOURCE,
      source_fetched: true, cv_materialized: verified,
      source_raw_rows: summary.totalRegistrosBrutos,
      source_normalized_rows: summary.totalRegistrosNormalizados,
      source_import_errors: summary.totalErros,
      cv_conflicts: summary.controleVoosImport?.conflictRecords ?? null,
      cv_failed: summary.controleVoosImport?.failedPayloads ?? null,
      verified_at: stamp,
    });
    const status = verified ? 'CONSOLIDADO' : 'FALHOU';
    const result = await db.prepare(
      "INSERT INTO integracoes_sigvoos_eventos " +
      "(id, empresa_id, tipo_evento, status, payload_json, created_at, updated_at, deleted_at) " +
      "VALUES (?, ?, 'FRMS_COVERAGE_DAY', ?, ?, ?, ?, NULL) " +
      "ON CONFLICT(id) DO UPDATE SET status = excluded.status, " +
      "payload_json = excluded.payload_json, updated_at = excluded.updated_at " +
      "WHERE integracoes_sigvoos_eventos.empresa_id = excluded.empresa_id " +
      "AND integracoes_sigvoos_eventos.tipo_evento = 'FRMS_COVERAGE_DAY'"
    ).bind(id, empresaId, status, payload, stamp, stamp).run();
    if (Number(result.meta?.changes ?? 0) !== 1) throw new Error('FRMS_COVERAGE_TENANT_CONFLICT');
  }
  return { confirmed: verified ? days.length : 0, unverified: verified ? 0 : days.length };
}

/** Reconciliation failure revokes any previous verified state for these days. */
export async function revokeClosedDayCoverage(
  db: D1Database, empresaId: number, from: string, to: string,
  operationalDate: string,
): Promise<void> {
  const days = enumerateDays(from, to, 32);
  if (!isIsoDay(operationalDate) || days.some((d) => d >= operationalDate)) {
    throw new Error('FRMS_COVERAGE_NON_CLOSED_WINDOW');
  }
  for (const day of days) {
    await db.prepare(
      "UPDATE integracoes_sigvoos_eventos SET status = 'FALHOU', " +
      "updated_at = ? WHERE id = ? AND empresa_id = ? " +
      "AND tipo_evento = 'FRMS_COVERAGE_DAY' AND deleted_at IS NULL"
    ).bind(new Date().toISOString(), coverageDayEventId(empresaId, day), empresaId).run();
  }
}

export async function loadConfirmedFlightDays(
  db: D1Database, empresaId: number, from: string, to: string,
): Promise<ReadonlyMap<string, string>> {
  // Validate source and scope even when no rows were previously written.
  const firstId = coverageDayEventId(empresaId, from);
  const lastId = coverageDayEventId(empresaId, to);
  if (to < from) throw new Error('FRMS_COVERAGE_WINDOW_INVALID');
  const rows = await db.prepare(
    "SELECT id, status, payload_json FROM integracoes_sigvoos_eventos " +
    "WHERE empresa_id = ? AND tipo_evento = 'FRMS_COVERAGE_DAY' " +
    "AND deleted_at IS NULL AND id BETWEEN ? AND ?"
  ).bind(empresaId, firstId, lastId).all<EventRow>();
  const confirmed = new Map<string, string>();
  for (const row of rows.results ?? []) {
    if (row.status !== 'CONSOLIDADO') continue;
    let payload: unknown;
    try { payload = JSON.parse(row.payload_json ?? 'null'); } catch { continue; }
    if (!payload || typeof payload !== 'object') continue;
    const p = payload as Record<string, unknown>;
    if (p.version !== 1 || p.source !== COVERAGE_SOURCE ||
        p.empresa_id !== empresaId || p.cv_materialized !== true ||
        p.source_fetched !== true || typeof p.day !== 'string' ||
        !isIsoDay(p.day) || row.id !== coverageDayEventId(empresaId, p.day) ||
        p.day < from || p.day > to ||
        typeof p.verified_at !== 'string' || !Number.isFinite(Date.parse(p.verified_at))) continue;
    confirmed.set(p.day, p.verified_at);
  }
  return confirmed;
}

function asUtcTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const raw = value.trim();
  // SQLite datetime('now') is UTC but does not append an offset.
  const canonical = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? raw.replace(' ', 'T') + 'Z' : raw;
  const parsed = Date.parse(canonical);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildRollingFlightCoverage(
  referenceDay: string, confirmedDays: ReadonlyMap<string, string>,
  rollingUpdatedAt?: string | null,
): RollingFlightCoverageEvidence {
  if (!isIsoDay(referenceDay)) throw new Error('FRMS_COVERAGE_REFERENCE_DATE_INVALID');
  const projectedAt = asUtcTimestamp(rollingUpdatedAt);
  const monthStart = referenceDay.slice(0, 7) + '-01';
  const yearStart = referenceDay.slice(0, 4) + '-01-01';
  const count = (from: string) => {
    const days = enumerateDays(from, referenceDay);
    return { expectedDays: days.length, confirmedDays: days.filter((day) => {
      const attestedAt = asUtcTimestamp(confirmedDays.get(day));
      return projectedAt != null && attestedAt != null && projectedAt >= attestedAt;
    }).length };
  };
  return {
    sourceVerified: confirmedDays.size > 0 && projectedAt != null,
    windows: {
      month: count(monthStart), year: count(yearStart),
      days28: count(addDaysIso(referenceDay, -27)),
      days365: count(addDaysIso(referenceDay, -364)),
    },
  };
}
