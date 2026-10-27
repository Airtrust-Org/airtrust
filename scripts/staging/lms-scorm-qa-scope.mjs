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
