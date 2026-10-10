import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeCandidateIdFromPrefix,
  hasMeaningfulScormLocation,
  launchInitialCmi,
  parseLaunchCycle,
  resolveExpectedCandidateId,
  summarizeEnrollment,
} from '../validation/lms-enrollment-readonly-review-helpers.mjs';

const candidate = 'aabbccdd-1122-3344-5566-77889900aabb';

test('resolves only a canonical active candidate UUID from the enrollment prefix', () => {
  assert.equal(activeCandidateIdFromPrefix(`lms/scorm/6/842/_candidates/${candidate}/`), candidate);
  assert.equal(activeCandidateIdFromPrefix('lms/scorm/6/842/legacy/'), null);
  assert.equal(activeCandidateIdFromPrefix(`lms/scorm/6/842/_candidates/not-a-uuid/`), null);
});

test('auto candidate resolution is pinned to the enrollment and rejects a mismatch', () => {
  const activePrefix = `lms/scorm/6/842/_candidates/${candidate}/`;
  assert.equal(resolveExpectedCandidateId({ expectedCandidateId: 'auto', activePrefix }), candidate);
  assert.equal(resolveExpectedCandidateId({ expectedCandidateId: candidate, activePrefix }), candidate);
  assert.throws(
    () => resolveExpectedCandidateId({ expectedCandidateId: 'bbbbbbbb-1122-3344-5566-77889900aabb', activePrefix }),
    /EXPECTED_CANDIDATE_DOES_NOT_MATCH_ENROLLMENT/,
  );
});

test('summarizes LMS state without returning suspend data or personal details', () => {
  const result = summarizeEnrollment({
    id: 842,
    empresa_id: 6,
    curso_id: 21,
    tipo_conteudo: 'scorm',
    status: 'EM_ANDAMENTO',
    progresso_pct: 0,
    funcionario_nome: 'must not escape',
    scorm_progresso: {
      lesson_status: 'incomplete',
      suspend_data: 'private-learning-state',
      cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '3/40', 'cmi.core.score.raw': '75' }),
    },
  });
  assert.deepEqual(result, {
    matricula_id: 842,
    empresa_id: 6,
    curso_id: 21,
    content_type: 'scorm',
    enrollment_status: 'EM_ANDAMENTO',
    progress_pct: 0,
    scorm: {
      lesson_status: 'incomplete',
      lesson_location: '3/40',
      score_raw: 75,
      suspend_data_present: true,
      suspend_data_length: 22,
    },
  });
  assert.equal(JSON.stringify(result).includes('private-learning-state'), false);
  assert.equal(JSON.stringify(result).includes('must not escape'), false);
});

test('treats only initial SCORM positions as no learner resume progress', () => {
  assert.equal(hasMeaningfulScormLocation(null), false);
  assert.equal(hasMeaningfulScormLocation(''), false);
  assert.equal(hasMeaningfulScormLocation('0/40'), false);
  assert.equal(hasMeaningfulScormLocation('0'), false);
  assert.equal(hasMeaningfulScormLocation('1/40'), true);
});

test('extracts active cycle identity and launch CMI without evaluating learner code', () => {
  const html = `
    var CICLO_ID = 912;
    var NUMERO_CICLO = 2;
    var PREVIEW_MODE = false;
    var REVIEW_MODE = false;
    var parsed = JSON.parse("{\\\"cmi.core.lesson_location\\\":\\\"\\\"}");
  `;
  assert.deepEqual(parseLaunchCycle(html), {
    ciclo_id: 912,
    numero_ciclo: 2,
    preview_mode: false,
    review_mode: false,
  });
  assert.deepEqual(launchInitialCmi(html), { 'cmi.core.lesson_location': '' });
  assert.equal(launchInitialCmi('<html></html>'), null);
});
