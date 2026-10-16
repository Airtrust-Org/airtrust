import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyEnrollment,
  cohortHash,
  summarizeEvaluations,
} from '../production/lms99-canonical-reconciliation.mjs';

test('classifyEnrollment only marks server-ready SCORM as canonical ready', () => {
  assert.deepEqual(classifyEnrollment({
    status: 'EM_ANDAMENTO',
    progresso_pct: 100,
    tipo_conteudo: 'scorm',
    closure_readiness: {
      code: 'SCORM_READY_FOR_SERVER_VERIFICATION',
      eligible_for_server_verification: true,
    },
  }), {
    bucket: 'CANONICAL_READY',
    code: 'SCORM_READY_FOR_SERVER_VERIFICATION',
    ready: true,
  });

  assert.deepEqual(classifyEnrollment({
    status: 'EM_ANDAMENTO',
    progresso_pct: 100,
    tipo_conteudo: 'scorm',
    closure_readiness: {
      code: 'SCORE_BELOW_MASTERY',
      eligible_for_server_verification: false,
    },
  }), {
    bucket: 'BLOCKED',
    code: 'SCORE_BELOW_MASTERY',
    ready: false,
  });
});

test('classifyEnrollment never treats progress alone as completion evidence', () => {
  assert.equal(classifyEnrollment({
    status: 'EM_ANDAMENTO',
    progresso_pct: 100,
    tipo_conteudo: 'scorm',
    closure_readiness: null,
  }).bucket, 'BLOCKED');

  assert.equal(classifyEnrollment({
    status: 'REPROVADO',
    progresso_pct: 100,
    tipo_conteudo: 'scorm',
    closure_readiness: {
      code: 'SCORM_READY_FOR_SERVER_VERIFICATION',
      eligible_for_server_verification: true,
    },
  }).ready, false);

  assert.deepEqual(classifyEnrollment({
    status: 'EM_ANDAMENTO',
    progresso_pct: 100,
    tipo_conteudo: 'scorm',
    edition_mismatch: { required: true },
    closure_readiness: {
      code: 'SCORM_READY_FOR_SERVER_VERIFICATION',
      eligible_for_server_verification: true,
    },
  }), {
    bucket: 'BLOCKED',
    code: 'LMS_NEW_EDITION_REQUIRED',
    ready: false,
  });
});

test('drift to NAO_INICIADO or an unknown status never qualifies for canonical reconciliation', () => {
  for (const status of ['NAO_INICIADO', 'UNKNOWN', '']) {
    const result = classifyEnrollment({
      status,
      progresso_bruto: 100,
      tipo_conteudo: 'scorm',
      closure_readiness: {
        code: 'SCORM_READY_FOR_SERVER_VERIFICATION',
        eligible_for_server_verification: true,
      },
    });
    assert.deepEqual(result, {
      bucket: 'EXCLUDED', code: 'ENROLLMENT_NOT_ACTIVE', ready: false,
    });
  }
});

test('cohortHash is deterministic and independent of input order', () => {
  const a = cohortHash([{ id: 9, course_id: 4 }, { id: 3, course_id: 56 }]);
  const b = cohortHash([{ id: 3, course_id: 56 }, { id: 9, course_id: 4 }]);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(a, b);
});

test('summarizeEvaluations emits aggregates without enrollment identifiers', () => {
  const summary = summarizeEvaluations([
    { course_id: 4, bucket: 'CANONICAL_READY', code: 'SCORM_READY_FOR_SERVER_VERIFICATION' },
    { course_id: 4, bucket: 'BLOCKED', code: 'SCORE_BELOW_MASTERY' },
    { course_id: 56, bucket: 'BLOCKED', code: 'PROGRESS_EVIDENCE_MISSING' },
  ]);
  assert.equal(summary.canonical_ready, 1);
  assert.equal(summary.blocked, 2);
  assert.equal(summary.by_course[4].canonical_ready, 1);
  assert.equal(summary.by_code.SCORE_BELOW_MASTERY, 1);
  assert.equal(JSON.stringify(summary).includes('"id"'), false);
});
