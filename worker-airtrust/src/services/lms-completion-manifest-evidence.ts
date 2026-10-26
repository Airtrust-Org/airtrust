/**
 * Active-package completion manifest evidence (AIRTRUST_COMPLETION_CONTRACT_V1).
 *
 * The completion manifest stored next to the ACTIVE package is the authorized
 * contract of what that package emits. Completion criteria must be derived from
 * it: the Worker must never demand an AirTrust-only field that the active
 * package does not declare/emit (e.g. the wrapper's `airtrust.viewed_slides`
 * ledger) when the package's own declared evidence proves the same fact.
 *
 * Read-only. Never writes R2/D1. Any failure returns null (= "no manifest
 * evidence"), which keeps the previous, stricter behaviour (fail-closed).
 */

export type ManifestAssessmentMode = 'NONE' | 'EXTERNAL' | 'SCORM';

/**
 * Packages declaring NONE/EXTERNAL carry no assessment of their own: they are
 * study-only content. Completing the study (verified coverage + explicit learner
 * confirmation) is what concludes the enrollment — there is no score to wait for.
 */
export function isStudyOnlyAssessmentMode(mode: ManifestAssessmentMode | null | undefined): boolean {
  return mode === 'NONE' || mode === 'EXTERNAL';
}

export interface ActiveCompletionManifest {
  packageVersion: string | null;
  requiredSlideIds: string[];
  /** NONE/EXTERNAL = the package has no assessment of its own (study-only content). */
  assessmentMode: ManifestAssessmentMode;
  workerApprovalRequired: boolean;
}

export type ManifestStudyCoverageSource = 'WRAPPER_LEDGER' | 'PACKAGE_STATE';

export interface ManifestStudyCoverage {
  manifest_present: true;
  package_version: string | null;
  assessment_mode: ManifestAssessmentMode;
  required_total: number;
  /** Highest count of distinct required units proven by a single source. */
  recorded: number;
  verified: boolean;
  source: ManifestStudyCoverageSource | null;
}

const MAX_MANIFEST_BYTES = 100_000;
const MAX_SLIDES = 1000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseActiveCompletionManifest(raw: unknown): ActiveCompletionManifest | null {
  const manifest = asRecord(raw);
  if (!manifest) return null;
  const content = asRecord(manifest.content);
  const slides = content?.requiredSlides;
  if (!Array.isArray(slides) || slides.length < 1 || slides.length > MAX_SLIDES ||
      !slides.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 256) ||
      new Set(slides).size !== slides.length) return null;
  const assessment = asRecord(manifest.assessment);
  const declaredMode = typeof assessment?.mode === 'string' ? assessment.mode.toUpperCase() : null;
  const assessmentMode: ManifestAssessmentMode =
    declaredMode === 'NONE' ? 'NONE' : declaredMode === 'EXTERNAL' ? 'EXTERNAL' : 'SCORM';
  const completion = asRecord(manifest.completion);
  const version = manifest.packageVersion;
  return {
    packageVersion: typeof version === 'string' && version.length > 0 && version.length <= 200
      ? version : null,
    requiredSlideIds: slides as string[],
    assessmentMode,
    workerApprovalRequired: completion?.workerApprovalRequired === true,
  };
}

/** Same tenant/course prefix discipline as lms-edition-mismatch.ts. */
export function isTenantScopedScormPrefix(
  prefix: unknown, empresaId: number, cursoId: number,
): prefix is string {
  if (typeof prefix !== 'string') return false;
  const trimmed = prefix.trim();
  return Number.isSafeInteger(empresaId) && empresaId > 0 &&
    Number.isSafeInteger(cursoId) && cursoId > 0 &&
    trimmed.startsWith(`lms/scorm/${empresaId}/${cursoId}/`) &&
    !trimmed.includes('..') && !trimmed.includes('\\');
}

export async function readActiveCompletionManifest(params: {
  bucket: R2Bucket | null | undefined;
  empresaId: number;
  cursoId: number;
  activePrefix: unknown;
}): Promise<ActiveCompletionManifest | null> {
  const { bucket, empresaId, cursoId, activePrefix } = params;
  if (!bucket || !isTenantScopedScormPrefix(activePrefix, empresaId, cursoId)) return null;
  const prefix = activePrefix.trim();
  try {
    const key = `${prefix.endsWith('/') ? prefix : `${prefix}/`}airtrust-completion-manifest.json`;
    const object = await bucket.get(key);
    if (!object || object.size > MAX_MANIFEST_BYTES) return null;
    return parseActiveCompletionManifest(JSON.parse(await object.text()));
  } catch {
    return null;
  }
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 65_536) return null;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function distinctIntegers(value: unknown, min: number, maxExclusive: number): Set<number> | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((n) => typeof n === 'number' && Number.isSafeInteger(n) &&
    n >= min && n < maxExclusive)) return null;
  const set = new Set(value as number[]);
  return set.size === value.length ? set : null;
}

/**
 * Proves coverage of every manifest-declared required unit from EITHER:
 *  - the wrapper ledger (`airtrust.viewed_slides`, 1-based) for the same total; or
 *  - the package's own persisted state (suspend_data `{p, d, ids?}`, 0-based
 *    indexes) pinned to the active `packageVersion`.
 * A location/bookmark (N/N) alone never proves earlier units.
 */
export function evaluateManifestStudyCoverage(params: {
  manifest: ActiveCompletionManifest;
  cmiJson: string | null | undefined;
  suspendData?: string | null;
}): ManifestStudyCoverage {
  const { manifest } = params;
  const total = manifest.requiredSlideIds.length;
  const result = (recorded: number, source: ManifestStudyCoverageSource | null): ManifestStudyCoverage => ({
    manifest_present: true,
    package_version: manifest.packageVersion,
    assessment_mode: manifest.assessmentMode,
    required_total: total,
    recorded,
    verified: source !== null,
    source,
  });

  const cmi = parseObject(params.cmiJson ?? null);
  let best = 0;
  if (cmi) {
    const declaredTotal = cmi['airtrust.total_slides'];
    const ledger = declaredTotal === total
      ? distinctIntegers(cmi['airtrust.viewed_slides'], 1, total + 1)
      : null;
    if (ledger) {
      if (ledger.size === total) return result(total, 'WRAPPER_LEDGER');
      best = Math.max(best, ledger.size);
    }
  }

  const inline = cmi?.['cmi.suspend_data'];
  const state = parseObject(typeof inline === 'string' && inline.trim() ? inline : params.suspendData);
  if (state) {
    const versionMatches = manifest.packageVersion === null
      ? false // without a declared identity, package state cannot be pinned to the active edition
      : state.p === manifest.packageVersion;
    const ids = state.ids;
    const idsCompatible = ids === undefined || (Array.isArray(ids) && ids.length === total &&
      ids.every((id, index) => id === manifest.requiredSlideIds[index]));
    const visited = versionMatches && idsCompatible ? distinctIntegers(state.d, 0, total) : null;
    if (visited) {
      if (visited.size === total) return result(total, 'PACKAGE_STATE');
      best = Math.max(best, visited.size);
    }
  }
  return result(best, null);
}

/** Convenience used by the Worker guards: manifest + coverage, or null. */
export async function readActiveManifestCoverage(params: {
  bucket: R2Bucket | null | undefined;
  empresaId: number;
  cursoId: number;
  activePrefix: unknown;
  contentType: unknown;
  cmiJson: string | null | undefined;
  suspendData?: string | null;
}): Promise<ManifestStudyCoverage | null> {
  if (String(params.contentType ?? 'scorm').trim().toLowerCase() !== 'scorm') return null;
  const manifest = await readActiveCompletionManifest(params);
  if (!manifest) return null;
  return evaluateManifestStudyCoverage({
    manifest, cmiJson: params.cmiJson, suspendData: params.suspendData ?? null,
  });
}
