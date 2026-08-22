/**
 * FRMS parameter governance V2.
 *
 * Values are resolved from an immutable revision.  The legacy global limits
 * table remains available only to bootstrap a reviewed legacy revision; it is
 * deliberately not a runtime fallback for an operational tenant/profile.
 */
import { LIMITES_DEFAULT, type LimitesMap } from './types';
import { resolveFadigaBusinessPolicy, type FadigaBusinessPolicy } from './fadiga-score';
import { resolveFortnightPolicy, type FrmsFortnightPolicy } from './fortnight-indicator';

export const FRMS_OFFSHORE_PROFILE = 'HELICOPTER_OFFSHORE' as const;
export const FRMS_LEGACY_MODEL_VERSION = 'LEGACY_MODEL_V2' as const;

export type FrmsRevisionStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'RETIRED';
export type FrmsRecalcStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'SUPERSEDED';

export interface FrmsConfigRevision {
  id: string;
  empresa_id: number | null;
  profile_code: string;
  revision_number: number;
  status: FrmsRevisionStatus;
  source_type: string;
  source_reference: string | null;
  regulatory_profile_id: string | null;
  policy_version: string;
  effective_from: string;
  effective_to: string | null;
  actor_user_id: string | null;
  reason: string;
  supersedes_revision_id: string | null;
  created_at: string;
}

export interface FrmsConfigParameter {
  id: string;
  revision_id: string;
  parameter_key: string;
  numeric_value: number | null;
  json_value: string | null;
  unit: string;
  metric: string | null;
  window_kind: string | null;
  direction: string | null;
  required: number;
  created_at: string;
}

export interface ResolvedFrmsParameterSet {
  revision: Readonly<FrmsConfigRevision>;
  values: Readonly<Record<string, number>>;
  modelVersion: string;
}

export class FrmsParameterResolutionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'FrmsParameterResolutionError';
  }
}

export interface FrmsOperationalContext {
  empresaId: number;
  profileCode: string;
  regulatoryProfileId: string;
  configRevisionId: string;
  modelVersion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  parameters: Readonly<Record<string, number>>;
  fadigaPolicy: FadigaBusinessPolicy;
  fortnightPolicy: FrmsFortnightPolicy;
}

export async function resolveFrmsOperationalContext(
  db: FrmsGovernanceDb,
  input: { empresaId: number; referenceAt: string; funcionarioId?: number; jornadaId?: string; checkinId?: string },
): Promise<FrmsOperationalContext> {
  const assignments = await db.prepare(
    `SELECT a.regulatory_profile_id, a.profile_code
       FROM frms_profile_assignments a
       JOIN frms_regulatory_profiles p ON p.id = a.regulatory_profile_id
      WHERE a.empresa_id = ? AND a.status = 'ACTIVE'
        AND a.effective_from <= ? AND (a.effective_to IS NULL OR a.effective_to >= ?)
        AND p.empresa_id = ? AND p.active = 1 AND p.deleted_at IS NULL
        AND p.profile_code = a.profile_code
        AND p.effective_from <= ? AND (p.effective_to IS NULL OR p.effective_to >= ?)`
  ).bind(input.empresaId, input.referenceAt, input.referenceAt, input.empresaId, input.referenceAt, input.referenceAt)
    .all<{ regulatory_profile_id: string; profile_code: string }>();
  const matches = assignments.results ?? [];
  if (matches.length !== 1) {
    throw new FrmsParameterResolutionError(
      matches.length === 0 ? 'FRMS_CONTEXT_UNAVAILABLE' : 'CONFIGURATION_ERROR',
      `Expected exactly one effective FRMS profile assignment for empresa=${input.empresaId}, date=${input.referenceAt}.`,
    );
  }
  const assignment = matches[0];
  const parameterSet = await loadResolvedFrmsParameters(
    db, input.empresaId, assignment.profile_code, input.referenceAt, Object.keys(LIMITES_DEFAULT),
  );
  return Object.freeze({
    empresaId: input.empresaId, profileCode: assignment.profile_code,
    regulatoryProfileId: assignment.regulatory_profile_id,
    configRevisionId: parameterSet.revision.id, modelVersion: parameterSet.modelVersion,
    effectiveFrom: parameterSet.revision.effective_from, effectiveTo: parameterSet.revision.effective_to,
    parameters: parameterSet.values,
    fadigaPolicy: resolveFadigaBusinessPolicy(parameterSet.values),
    fortnightPolicy: resolveFortnightPolicy(parameterSet.values),
  });
}

function isEffective(revision: FrmsConfigRevision, operationalDate: string): boolean {
  return (
    revision.status === 'ACTIVE' &&
    revision.effective_from <= operationalDate &&
    (revision.effective_to == null || revision.effective_to >= operationalDate)
  );
}

/** Resolves an exact profile first; generic/fixed-wing fallbacks are forbidden. */
export function resolveEffectiveRevision(
  revisions: readonly FrmsConfigRevision[],
  empresaId: number,
  profileCode: string,
  operationalDate: string,
): FrmsConfigRevision {
  const candidates = revisions.filter(
    (revision) =>
      revision.profile_code === profileCode &&
      (revision.empresa_id === empresaId || revision.empresa_id == null) &&
      isEffective(revision, operationalDate),
  );
  const tenant = candidates.filter((revision) => revision.empresa_id === empresaId);
  const scoped = tenant.length ? tenant : candidates;
  const ordered = [...scoped].sort(
    (a, b) => b.revision_number - a.revision_number || b.effective_from.localeCompare(a.effective_from),
  );
  const chosen = ordered[0];
  if (!chosen) {
    throw new FrmsParameterResolutionError(
      'FRMS_PARAMETER_PROFILE_NOT_CONFIGURED',
      `No active FRMS parameter revision for empresa=${empresaId}, profile=${profileCode}, date=${operationalDate}.`,
    );
  }
  const equallyPreferred = ordered.filter(
    (revision) =>
      revision.revision_number === chosen.revision_number &&
      revision.effective_from === chosen.effective_from,
  );
  if (equallyPreferred.length !== 1) {
    throw new FrmsParameterResolutionError(
      'FRMS_PARAMETER_REVISION_AMBIGUOUS',
      `More than one equally preferred FRMS parameter revision matches empresa=${empresaId}, profile=${profileCode}, date=${operationalDate}.`,
    );
  }
  return chosen;
}

export function buildResolvedParameterSet(
  revision: FrmsConfigRevision,
  parameters: readonly FrmsConfigParameter[],
  requiredKeys: readonly string[],
): ResolvedFrmsParameterSet {
  const values: Record<string, number> = {};
  for (const parameter of parameters) {
    if (parameter.revision_id !== revision.id) continue;
    if (parameter.json_value != null) {
      try {
        JSON.parse(parameter.json_value);
      } catch {
        throw new FrmsParameterResolutionError(
          'FRMS_PARAMETER_INVALID_JSON',
          `Parameter ${parameter.parameter_key} contains invalid JSON.`,
        );
      }
    }
    if (parameter.numeric_value == null) continue;
    if (!Number.isFinite(Number(parameter.numeric_value))) {
      throw new FrmsParameterResolutionError(
        'FRMS_PARAMETER_INVALID_VALUE',
        `Parameter ${parameter.parameter_key} has an invalid numeric value.`,
      );
    }
    values[parameter.parameter_key] = Number(parameter.numeric_value);
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(values, key)) {
      throw new FrmsParameterResolutionError(
        'FRMS_PARAMETER_REQUIRED_MISSING',
        `Required parameter ${key} is missing from revision ${revision.id}.`,
      );
    }
  }
  return Object.freeze({
    revision: Object.freeze({ ...revision }),
    values: Object.freeze({ ...values }),
    modelVersion: revision.policy_version,
  });
}

/** Maps only a complete governed set into the historical calculation contract. */
export function asGovernedLimites(
  parameterSet: ResolvedFrmsParameterSet,
  requiredKeys: readonly (keyof LimitesMap)[],
): LimitesMap {
  for (const key of requiredKeys) {
    if (!Object.hasOwn(parameterSet.values, key)) {
      throw new FrmsParameterResolutionError(
        'FRMS_PARAMETER_REQUIRED_MISSING',
        `Required calculation parameter ${key} is missing from revision ${parameterSet.revision.id}.`,
      );
    }
  }
  const candidate: unknown = { ...parameterSet.values };
  if (!isGovernedLimitesMap(candidate, requiredKeys)) {
    throw new FrmsParameterResolutionError(
      'FRMS_PARAMETER_REQUIRED_MISSING',
      `Revision ${parameterSet.revision.id} does not satisfy the calculation contract.`,
    );
  }
  return Object.freeze(candidate);
}

function isGovernedLimitesMap(
  value: unknown,
  requiredKeys: readonly (keyof LimitesMap)[],
): value is LimitesMap {
  if (!value || typeof value !== 'object') return false;
  const values = value as Record<string, unknown>;
  return requiredKeys.every((key) => Number.isFinite(values[key]));
}

export interface FrmsRecalcRun {
  id: string;
  empresa_id: number | null;
  profile_code: string;
  previous_revision_id: string | null;
  target_revision_id: string;
  effective_from: string;
  effective_to: string | null;
  changed_parameter_keys_json: string;
  status: FrmsRecalcStatus;
  processed_count: number;
  failed_count: number;
  cursor_json: string | null;
  error_summary: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function nextRecalcStatus(
  run: Pick<FrmsRecalcRun, 'status' | 'failed_count'>,
  hasMore: boolean,
): FrmsRecalcStatus {
  if (run.status === 'SUPERSEDED') return 'SUPERSEDED';
  if (run.failed_count > 0) return 'FAILED';
  return hasMore ? 'RUNNING' : 'COMPLETE';
}

export function staleStateForRevision(resultRevisionId: string | null, targetRevisionId: string): 'CURRENT' | 'RECALC_PENDING' {
  return resultRevisionId === targetRevisionId ? 'CURRENT' : 'RECALC_PENDING';
}

type D1RowResult<T> = { results?: T[] };
export interface FrmsGovernanceDb {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T>(): Promise<D1RowResult<T>>;
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
}

export async function loadResolvedFrmsParameters(
  db: FrmsGovernanceDb,
  empresaId: number,
  profileCode: string,
  operationalDate: string,
  requiredKeys: readonly string[],
): Promise<ResolvedFrmsParameterSet> {
  const revisions = await db
    .prepare(
      `SELECT * FROM frms_config_revisions
       WHERE profile_code = ? AND status = 'ACTIVE'
         AND (empresa_id = ? OR empresa_id IS NULL)
         AND effective_from <= ?
         AND (effective_to IS NULL OR effective_to >= ?)`,
    )
    .bind(profileCode, empresaId, operationalDate, operationalDate)
    .all<FrmsConfigRevision>();
  const revision = resolveEffectiveRevision(revisions.results ?? [], empresaId, profileCode, operationalDate);
  const parameters = await db
    .prepare('SELECT * FROM frms_config_parameters WHERE revision_id = ?')
    .bind(revision.id)
    .all<FrmsConfigParameter>();
  return buildResolvedParameterSet(revision, parameters.results ?? [], requiredKeys);
}

export interface CreateFrmsRevisionInput {
  empresaId: number | null;
  profileCode: string;
  sourceType: string;
  sourceReference?: string | null;
  regulatoryProfileId?: string | null;
  policyVersion: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  actorUserId?: string | null;
  reason: string;
  parameters: ReadonlyArray<{
    key: string;
    value: number;
    unit: string;
    metric?: string | null;
    windowKind?: string | null;
    direction?: string | null;
  }>;
}

function nowSql(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function newId(): string {
  return crypto.randomUUID();
}

export interface FrmsGovernanceWritableDb extends FrmsGovernanceDb {
  batch(statements: Array<{ run(): Promise<unknown> }>): Promise<unknown>;
}

/**
 * Atomically persists a new immutable revision, supersedes unfinished runs in
 * the same scope, and creates the PENDING ledger row before recalculation.
 */
export async function createRevisionAndRecalcRun(
  db: FrmsGovernanceWritableDb,
  input: CreateFrmsRevisionInput,
): Promise<{ revisionId: string; runId: string; previousRevisionId: string | null }> {
  if (!input.profileCode || !input.policyVersion || !input.reason || input.parameters.length === 0) {
    throw new FrmsParameterResolutionError('FRMS_PARAMETER_REVISION_INVALID', 'Revision metadata and parameters are required.');
  }
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    throw new FrmsParameterResolutionError('FRMS_PARAMETER_EFFECTIVITY_INVALID', 'effective_to precedes effective_from.');
  }
  for (const parameter of input.parameters) {
    if (!parameter.key || !parameter.unit || !Number.isFinite(parameter.value)) {
      throw new FrmsParameterResolutionError('FRMS_PARAMETER_INVALID_VALUE', 'Every parameter needs a finite value and unit.');
    }
  }

  const previous = await db
    .prepare(
      `SELECT * FROM frms_config_revisions
       WHERE empresa_id IS ? AND profile_code = ? AND status = 'ACTIVE'
       ORDER BY revision_number DESC LIMIT 1`,
    )
    .bind(input.empresaId, input.profileCode)
    .first<FrmsConfigRevision>();
  const revisionId = newId();
  const runId = newId();
  const timestamp = nowSql();
  const revisionNumber = (previous?.revision_number ?? 0) + 1;
  const changedKeys = JSON.stringify(input.parameters.map((parameter) => parameter.key).sort());
  const statements = [] as Array<{ run(): Promise<unknown> }>;

  if (previous) {
    statements.push(
      db.prepare(
        `UPDATE frms_config_revisions
         SET effective_to = date(?, '-1 day')
         WHERE id = ? AND effective_from < ?
           AND (effective_to IS NULL OR effective_to >= ?)`,
      ).bind(input.effectiveFrom, previous.id, input.effectiveFrom, input.effectiveFrom),
    );
  }
  statements.push(
    db
      .prepare(
        `UPDATE frms_recalc_runs SET status = 'SUPERSEDED', completed_at = ?, updated_at = ?
         WHERE empresa_id IS ? AND profile_code = ? AND status IN ('PENDING', 'RUNNING')`,
      )
      .bind(timestamp, timestamp, input.empresaId, input.profileCode),
    db
      .prepare(
        `INSERT INTO frms_config_revisions (
          id, empresa_id, profile_code, revision_number, status, source_type,
          source_reference, regulatory_profile_id, policy_version, effective_from, effective_to,
          actor_user_id, reason, supersedes_revision_id, created_at
        ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        revisionId, input.empresaId, input.profileCode, revisionNumber, input.sourceType,
        input.sourceReference ?? null, input.regulatoryProfileId ?? null, input.policyVersion, input.effectiveFrom,
        input.effectiveTo ?? null, input.actorUserId ?? null, input.reason, previous?.id ?? null, timestamp,
      ),
  );
  for (const parameter of input.parameters) {
    statements.push(
      db
        .prepare(
          `INSERT INTO frms_config_parameters (
            id, revision_id, parameter_key, numeric_value, unit, metric, window_kind, direction, required, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        )
        .bind(
          newId(), revisionId, parameter.key, parameter.value, parameter.unit,
          parameter.metric ?? null, parameter.windowKind ?? null, parameter.direction ?? null, timestamp,
        ),
    );
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO frms_recalc_runs (
          id, empresa_id, profile_code, previous_revision_id, target_revision_id,
          effective_from, effective_to, changed_parameter_keys_json, status,
          processed_count, failed_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, 0, ?, ?)`,
      )
      .bind(
        runId, input.empresaId, input.profileCode, previous?.id ?? null, revisionId,
        input.effectiveFrom, input.effectiveTo ?? null, changedKeys, timestamp, timestamp,
      ),
  );
  await db.batch(statements);
  return { revisionId, runId, previousRevisionId: previous?.id ?? null };
}

export async function loadFrmsRecalcRun(
  db: FrmsGovernanceDb,
  runId: string,
): Promise<FrmsRecalcRun> {
  const run = await db.prepare('SELECT * FROM frms_recalc_runs WHERE id = ?').bind(runId).first<FrmsRecalcRun>();
  if (!run) throw new FrmsParameterResolutionError('FRMS_RECALC_RUN_NOT_FOUND', `Recalculation run ${runId} was not found.`);
  return run;
}

export interface RecalcChunk<T> {
  items: readonly T[];
  cursor: string | null;
  hasMore: boolean;
}

/** A chunk runner never treats a fixed page size as a completed recalculation. */
export async function processRecalcRunInChunks<T>(input: {
  load: (cursor: string | null) => Promise<RecalcChunk<T>>;
  process: (item: T) => Promise<void>;
  onProgress?: (state: { processed: number; failed: number; cursor: string | null; hasMore: boolean }) => Promise<void>;
}): Promise<{ status: 'COMPLETE' | 'FAILED'; processed: number; failed: number }> {
  let cursor: string | null = null;
  let processed = 0;
  let failed = 0;
  let hasMore = true;
  while (hasMore) {
    const chunk = await input.load(cursor);
    if (chunk.items.length === 0 && chunk.hasMore) {
      throw new FrmsParameterResolutionError('FRMS_RECALC_CURSOR_STALLED', 'Recalculation cursor advanced without items.');
    }
    for (const item of chunk.items) {
      try {
        await input.process(item);
        processed += 1;
      } catch {
        failed += 1;
      }
    }
    cursor = chunk.cursor;
    hasMore = chunk.hasMore;
    await input.onProgress?.({ processed, failed, cursor, hasMore });
  }
  return { status: failed > 0 ? 'FAILED' : 'COMPLETE', processed, failed };
}
