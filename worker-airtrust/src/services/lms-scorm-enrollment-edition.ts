/**
 * Resolve the SCORM edition that was active when the current enrollment cycle
 * began. Package activation history is tenant/course scoped and comes from the
 * immutable package audit log; the course's current pointer is never allowed
 * to silently repin an older cycle.
 */
export type ScormEnrollmentEdition = {
  status: 'RESOLVED' | 'LEGACY' | 'UNRESOLVED';
  packageId?: string;
  packageSha256?: string;
  r2Prefix?: string;
  launchFile?: string;
  scormVersion?: string;
  reason?: 'PACKAGE_HISTORY_UNAVAILABLE' | 'CYCLE_START_UNVERIFIED' | 'PACKAGE_NOT_ACTIVE_AT_CYCLE_START' | 'PACKAGE_HISTORY_AMBIGUOUS' | 'PACKAGE_METADATA_INVALID';
};

type ActivationRow = {
  package_id: string;
  package_sha256: string;
  r2_prefix: string;
  launch_file: string;
  scorm_versao: string;
  package_status: string;
  activated_at: string;
};

const SHA256 = /^[a-f0-9]{64}$/;

function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isFinite(time) ? time : null;
}

function safeLaunchFile(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 500 &&
    !value.startsWith('/') && !value.includes('..') && !value.includes('\\');
}

/** Read-only selector. It never updates an enrollment, cycle, course or package. */
export async function resolveScormEnrollmentEdition(params: {
  db: D1Database;
  empresaId: number;
  cursoId: number;
  cycleStartedAt: unknown;
  currentPrefix: string | null;
  currentLaunchFile: string | null;
  currentScormVersion: string | null;
}): Promise<ScormEnrollmentEdition> {
  const { db, empresaId, cursoId } = params;
  if (![empresaId, cursoId].every((value) => Number.isSafeInteger(value) && value > 0)) {
    return { status: 'UNRESOLVED', reason: 'PACKAGE_METADATA_INVALID' };
  }

  let rows: ActivationRow[];
  try {
    const result = await db.prepare(
      `SELECT p.id AS package_id, p.package_sha256, p.r2_prefix, p.launch_file,
              p.scorm_versao, p.status AS package_status, a.created_at AS activated_at
         FROM lms_scorm_package_audit_log a
         JOIN lms_scorm_package_versions p
           ON p.id = a.package_id AND p.empresa_id = a.empresa_id AND p.curso_id = a.curso_id
        WHERE a.empresa_id = ? AND a.curso_id = ? AND a.action = 'ACTIVATED'
        ORDER BY a.created_at DESC, a.id DESC`,
    ).bind(empresaId, cursoId).all<ActivationRow>();
    rows = result?.results ?? [];
  } catch {
    // Old flat-prefix SCORM courses predate the immutable package-version
    // registry. Preserve that path only; a versioned candidate prefix without
    // auditable activation history is never served as the current edition.
    const isVersioned = Boolean(params.currentPrefix?.includes('/_candidates/'));
    return isVersioned
      ? { status: 'UNRESOLVED', reason: 'PACKAGE_HISTORY_UNAVAILABLE' }
      : { status: 'LEGACY', r2Prefix: params.currentPrefix ?? undefined,
          launchFile: params.currentLaunchFile ?? undefined,
          scormVersion: params.currentScormVersion ?? undefined };
  }

  if (!rows.length) {
    const isVersioned = Boolean(params.currentPrefix?.includes('/_candidates/'));
    return isVersioned
      ? { status: 'UNRESOLVED', reason: 'PACKAGE_NOT_ACTIVE_AT_CYCLE_START' }
      : { status: 'LEGACY', r2Prefix: params.currentPrefix ?? undefined,
          launchFile: params.currentLaunchFile ?? undefined,
          scormVersion: params.currentScormVersion ?? undefined };
  }

  const cycleStart = parseTime(params.cycleStartedAt);
  if (cycleStart === null) return { status: 'UNRESOLVED', reason: 'CYCLE_START_UNVERIFIED' };
  const eligible = rows
    .map((row) => ({ row, at: parseTime(row.activated_at) }))
    .filter((entry): entry is { row: ActivationRow; at: number } => entry.at !== null && entry.at <= cycleStart);
  if (!eligible.length) return { status: 'UNRESOLVED', reason: 'PACKAGE_NOT_ACTIVE_AT_CYCLE_START' };
  const newestAt = Math.max(...eligible.map((entry) => entry.at));
  const latest = eligible.filter((entry) => entry.at === newestAt);
  const packageIds = new Set(latest.map((entry) => entry.row.package_id));
  if (packageIds.size !== 1) return { status: 'UNRESOLVED', reason: 'PACKAGE_HISTORY_AMBIGUOUS' };

  const row = latest[0].row;
  const expectedPrefix = `lms/scorm/${empresaId}/${cursoId}/_candidates/`;
  if (!row.package_id || !SHA256.test(row.package_sha256) ||
      !row.r2_prefix.startsWith(expectedPrefix) || row.r2_prefix.includes('..') ||
      !row.r2_prefix.endsWith('/') || !safeLaunchFile(row.launch_file) ||
      !['1.2', '2004'].includes(row.scorm_versao) ||
      !['ACTIVE', 'SUPERSEDED'].includes(row.package_status)) {
    return { status: 'UNRESOLVED', reason: 'PACKAGE_METADATA_INVALID' };
  }
  return {
    status: 'RESOLVED', packageId: row.package_id, packageSha256: row.package_sha256,
    r2Prefix: row.r2_prefix, launchFile: row.launch_file, scormVersion: row.scorm_versao,
  };
}
