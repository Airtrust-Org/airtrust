/**
 * Restrict disposable staging fixtures to the exact browser QA scope.
 * Negative-only checks must not create three unrelated upload candidates.
 * The full scope retains all four legacy fixtures until its candidate-first
 * positive journey is separately reviewed and granted.
 */
const FIXTURES_BY_SCOPE = Object.freeze({
  all: Object.freeze(['success', 'reject', 'timeout', 'resume']),
  'resume-inactive-preview': Object.freeze(['resume']),
  'candidate-first-no-grant': Object.freeze(['resume']),
});

export function fixtureKindsForQaScope(scope = 'all') {
  if (typeof scope !== 'string' ||
      !Object.hasOwn(FIXTURES_BY_SCOPE, scope)) {
    throw new Error('QA_SCORM_SCOPE_NOT_SUPPORTED');
  }
  return [...FIXTURES_BY_SCOPE[scope]];
}

/**
 * Cleanup is a destructive staging operation. A state file alone must never
 * authorize deleting an arbitrary course ID (even inside the QA tenant).
 * Validate the exact run, fixture count, names, kinds and unique IDs first.
 */
export function assertDisposableQaCleanupState(state, scope, runMarker) {
  const kinds = fixtureKindsForQaScope(scope);
  if (!/^\d+-\d+$/.test(String(runMarker)) ||
      !state || state.schema_version !== 1 ||
      state.run_marker !== runMarker ||
      !state.courses || typeof state.courses !== 'object' ||
      Array.isArray(state.courses) ||
      Object.keys(state.courses).length !== kinds.length) {
    throw new Error('QA_SCORM_CLEANUP_STATE_MISMATCH');
  }
  const labels = { success: 'Success', reject: 'Reject', timeout: 'Timeout', resume: 'Resume' };
  const seen = new Set();
  return kinds.map((kind) => {
    const item = state.courses[kind];
    const title = 'QA SCORM ' + labels[kind] + ' ' + runMarker;
    const zipName = 'qa-scorm-' + kind + '-' + runMarker + '.zip';
    if (!item || item.kind !== kind || item.title !== title ||
        item.zip_name !== zipName ||
        !Number.isSafeInteger(item.id) || item.id <= 0 || seen.has(item.id)) {
      throw new Error('QA_SCORM_CLEANUP_FIXTURE_IDENTITY_MISMATCH');
    }
    seen.add(item.id);
    return { id: item.id, kind, title };
  });
}

/** Verify actual Worker course identity before any QA cleanup or rollback. */
export function assertDisposableQaCourseReadback(course, expected) {
  if (!expected || !Number.isSafeInteger(expected.id) || expected.id <= 0 ||
      typeof expected.title !== 'string' ||
      !/^QA SCORM (Success|Reject|Timeout|Resume) [0-9]+-[0-9]+$/.test(expected.title) ||
      !course || Number(course.id) !== expected.id ||
      course.titulo !== expected.title ||
      course.categoria !== 'QA Synthetic' ||
      course.tipo_conteudo !== 'scorm' ||
      (course.publicado !== 0 && course.publicado !== false)) {
    throw new Error('QA_SCORM_CLEANUP_TARGET_IDENTITY_MISMATCH');
  }
  return true;
}
