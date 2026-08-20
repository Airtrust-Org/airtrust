/**
 * AirTrust FRMS IOGP — jornada avaliacoes repository.
 *
 * Tenant-scoped persistence for `frms_jornada_avaliacoes` (migration 0463).
 *
 * Cross-tenant protection:
 * - `empresaId` is required and must be a positive integer.
 * - `snapshot.empresaId` must match `empresaId` or the write is rejected.
 * - Every SELECT also scopes to `empresa_id`.
 *
 * This module MUST NOT be imported or called when the feature flag is OFF.
 * The shadow caller (`frms-iogp-shadow-caller.ts`) is the sole gatekeeper.
 *
 * Schema: frms_jornada_avaliacoes
 *   id, empresa_id, jornada_id, evaluation_version, input_fingerprint,
 *   regulatory_profile_id, compliance_json, biological_summary_json,
 *   operational_demand_json, environmental_json, overall_level,
 *   automatic_approval_allowed, evidence_hash, calculated_at,
 *   created_at, updated_at, deleted_at
 */

import type { FrmsIogpEvaluationSnapshot } from './evaluation-contract';

/** Minimal DB interface (subset of D1Database). Allows mocking in tests. */
export interface FrmsAvaliacaoDb {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      first<T = unknown>(): Promise<T | null>;
    };
  };
}

function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Computes a short deterministic fingerprint of the snapshot inputs that are
 * relevant to idempotency: the sigvoos leg keys, weather stations, compliance
 * status list, and biological level. NOT a security-grade hash — just a
 * deduplication aid stored in the UNIQUE index column.
 */
function buildInputFingerprint(snapshot: FrmsIogpEvaluationSnapshot): string {
  const parts = [
    snapshot.biological.level,
    snapshot.compliance.map((c) => c.status).join(','),
    snapshot.evidence.sigvoosLegKeys.join('|'),
    snapshot.evidence.weatherSource,
  ];
  return parts.join('::');
}

/**
 * Persists a shadow IOGP evaluation snapshot to `frms_jornada_avaliacoes`.
 *
 * Uses INSERT OR IGNORE to handle concurrent writes with the same fingerprint
 * gracefully. If the row already exists (same empresa_id + jornada_id +
 * evaluation_version + input_fingerprint), the write is skipped silently.
 *
 * @throws if empresaId is invalid or snapshot.empresaId !== empresaId.
 */
export async function persistFrmsJornadaAvaliacao(
  db: FrmsAvaliacaoDb,
  empresaId: number,
  snapshot: FrmsIogpEvaluationSnapshot,
): Promise<void> {
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw new Error('persistFrmsJornadaAvaliacao: empresaId must be a positive integer.');
  }

  // Cross-tenant guard: the snapshot must have been built for the same tenant.
  if (snapshot.empresaId !== empresaId) {
    throw new Error(
      `persistFrmsJornadaAvaliacao: cross-tenant write rejected — ` +
        `snapshot.empresaId=${snapshot.empresaId} vs caller empresaId=${empresaId}.`,
    );
  }

  const timestamp = now();
  const inputFingerprint = buildInputFingerprint(snapshot);
  const id = generateId();

  await db
    .prepare(
      `INSERT OR IGNORE INTO frms_jornada_avaliacoes (
        id,
        empresa_id,
        jornada_id,
        evaluation_version,
        input_fingerprint,
        regulatory_profile_id,
        compliance_json,
        biological_summary_json,
        operational_demand_json,
        environmental_json,
        overall_level,
        automatic_approval_allowed,
        evidence_hash,
        calculated_at,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      id,
      empresaId,
      snapshot.jornadaId,
      snapshot.evaluationVersion,
      inputFingerprint,
      snapshot.regulatoryProfileCode, // used as regulatory_profile_id reference
      JSON.stringify(snapshot.compliance),
      JSON.stringify(snapshot.biological),
      JSON.stringify(snapshot.operational),
      JSON.stringify(snapshot.environmental),
      snapshot.orchestration.overallLevel,
      snapshot.orchestration.automaticApprovalAllowed ? 1 : 0,
      JSON.stringify(snapshot.evidence),
      snapshot.evaluatedAt,
      timestamp,
      timestamp,
    )
    .run();
}
