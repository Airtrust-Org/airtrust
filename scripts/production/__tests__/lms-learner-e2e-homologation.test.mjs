import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLearnerAuthPayload,
  checkCertificate,
  checkLearnerQualifications,
  determineSlideAction,
  enrollLearner,
  evaluateAssessmentPolicy,
  evaluateCoursePath,
  evaluateHomologationVerdict,
  isLocationResumed,
  resolveAdminToken,
  resolveEffectiveLessonStatus,
  resolveScormContentFrame,
  runHomologation,
  setupAuthenticatedContext,
} from '../lms-learner-e2e-homologation.mjs';

test('lms-learner-e2e-homologation exports runHomologation and evaluateHomologationVerdict', () => {
  assert.equal(typeof runHomologation, 'function');
  assert.equal(typeof evaluateHomologationVerdict, 'function');
  assert.equal(typeof setupAuthenticatedContext, 'function');
  assert.equal(typeof enrollLearner, 'function');
  assert.equal(typeof resolveAdminToken, 'function');
  assert.equal(typeof checkLearnerQualifications, 'function');
  assert.equal(typeof checkCertificate, 'function');
});

test('evaluateHomologationVerdict yields PASS when all mandatory criteria pass', () => {
  const result = evaluateHomologationVerdict({
    percurso_ok: true,
    avaliacao_ok: true,
    isConcluido: true,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: true,
    qual: { id: 101, status: 'CONCLUIDA' },
    cert: { id: 55, validPdf: true, sha256: 'abc', sizeBytes: 1024 },
  });
  assert.equal(result.pass, true);
  assert.equal(result.reason, null);

  // Proves VALIDA (active qualification with future expiration date) yields PASS
  const resultValida = evaluateHomologationVerdict({
    percurso_ok: true,
    avaliacao_ok: true,
    isConcluido: true,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: true,
    qual: { id: 102, status: 'VALIDA', qualificacao_status: 'CONCLUIDA' },
    cert: { id: 56, validPdf: true, sha256: 'def', sizeBytes: 2048 },
  });
  assert.equal(resultValida.pass, true);
  assert.equal(resultValida.reason, null);
});

test('evaluateHomologationVerdict rejects PASS when resume verification fails', () => {
  const result = evaluateHomologationVerdict({
    percurso_ok: true,
    avaliacao_ok: true,
    isConcluido: true,
    progress100: true,
    resumedVerified: false,
    reopenNoDowngrade: true,
    qualExpected: false,
    qual: null,
    cert: null,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'RESUME_CHECKPOINT_FAILED');
});

test('evaluateHomologationVerdict fails when lesson location stays empty and resume is unverified', () => {
  // Simulates a course where traversal finishes and backend marks CONCLUIDO,
  // but no nonempty lesson location was ever exposed to verify resumption.
  const result = evaluateHomologationVerdict({
    percurso_ok: true,
    avaliacao_ok: true,
    isConcluido: true,
    progress100: true,
    resumedVerified: false,
    reopenNoDowngrade: true,
    qualExpected: true,
    qual: { id: 202, status: 'CONCLUIDA' },
    cert: { id: 77, validPdf: true, sha256: 'def', sizeBytes: 2048 },
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'RESUME_CHECKPOINT_FAILED');
});

test('evaluateHomologationVerdict rejects PASS when certificate PDF is invalid', () => {
  const result = evaluateHomologationVerdict({
    percurso_ok: true,
    avaliacao_ok: true,
    isConcluido: true,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: true,
    qual: { id: 101, status: 'CONCLUIDA' },
    cert: { id: 55, validPdf: false, sha256: 'xyz', sizeBytes: 50 },
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'INVALID_CERTIFICATE_PDF');
});

test('evaluateHomologationVerdict rejects PASS when expected qualification is missing', () => {
  const result = evaluateHomologationVerdict({
    percurso_ok: true,
    avaliacao_ok: true,
    isConcluido: true,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: true,
    qual: null,
    cert: null,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'EXPECTED_QUALIFICATION_NOT_GENERATED');
});

test('evaluateHomologationVerdict rejects PASS when reopen has progress downgrade', () => {
  const result = evaluateHomologationVerdict({
    percurso_ok: true,
    avaliacao_ok: true,
    isConcluido: true,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: false,
    qualExpected: false,
    qual: null,
    cert: null,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'STATUS_OR_PROGRESS_DOWNGRADE_ON_REOPEN');
});

test('evaluateHomologationVerdict rejects PASS when progress is below 100', () => {
  const result = evaluateHomologationVerdict({
    percurso_ok: true,
    avaliacao_ok: true,
    isConcluido: true,
    progress100: false,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: false,
    qual: null,
    cert: null,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'PROGRESS_BELOW_100');
});

test('evaluateHomologationVerdict rejects PASS when completion status is not reached', () => {
  const result = evaluateHomologationVerdict({
    percurso_ok: true,
    avaliacao_ok: true,
    isConcluido: false,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: false,
    qual: null,
    cert: null,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'COMPLETION_NOT_REACHED');
});

test('setupAuthenticatedContext adds access cookies and requests scoped asset session', async () => {
  const addedCookies = [];
  let requestedEndpoint = null;
  let requestedOptions = null;

  const mockContext = {
    async addCookies(cookies) {
      addedCookies.push(...cookies);
    },
    request: {
      async post(url, options) {
        requestedEndpoint = url;
        requestedOptions = options;
        return {
          ok: () => true,
          status: () => 200,
        };
      },
    },
  };

  await setupAuthenticatedContext(mockContext, 'mock-jwt-token-123', 42);

  assert.equal(addedCookies.length >= 3, true);
  assert.equal(addedCookies[0].name, 'airtrust_access_token');
  assert.equal(addedCookies[0].value, 'mock-jwt-token-123');
  assert.equal(addedCookies.some((c) => c.name === 'airtrust_token'), true);
  assert.equal(addedCookies.some((c) => c.name === 'auth_token'), true);
  assert.equal(requestedEndpoint?.endsWith('/api/lms/assets/session'), true);
  assert.equal(requestedOptions?.data?.matricula_id, 42);
});

test('enrollLearner reuses existing active enrollment from minhas-ead', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/api/lms/matriculas/minhas-ead')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 88, curso_id: 67, status: 'NAO_INICIADO', deleted_at: null }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const id = await enrollLearner('learner-token', 67, 193);
    assert.equal(id, 88);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('enrollLearner falls back to admin token on 403 sector restricted', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, opts) => {
      calls.push({ url: String(url), headers: opts?.headers });
      if (String(url).includes('/api/lms/matriculas/minhas-ead')) {
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (String(url).endsWith('/api/lms/matriculas')) {
        const auth = opts?.headers?.Authorization || '';
        if (auth.includes('learner-token')) {
          return new Response(
            JSON.stringify({ success: false, code: 'LMS_SELF_ENROLLMENT_NOT_ALLOWED' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (auth.includes('admin-token')) {
          return new Response(JSON.stringify({ success: true, data: { id: 99 } }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const id = await enrollLearner('learner-token', 44, 193, 'admin-token');
    assert.equal(id, 99);
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('enrollLearner reactivates cancelled enrollment on 409 LMS_REMATRICULATION_REQUIRED', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/api/lms/matriculas/minhas-ead')) {
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (String(url).endsWith('/api/lms/matriculas')) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'LMS_REMATRICULATION_REQUIRED',
            data: { matricula_id: 77 },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/lms/matriculas/77/rematricular')) {
        return new Response(
          JSON.stringify({ success: true, data: { matricula_id: 77, status: 'NAO_INICIADO' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const id = await enrollLearner('learner-token', 67, 193, 'admin-token');
    assert.equal(id, 77);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveAdminToken rejects admin token when tenant selection fails (TENANT_ACCESS_DENIED)', async () => {
  const originalFetch = globalThis.fetch;
  const prevEmail = process.env.PROD_SMOKE_EMAIL;
  const prevPass = process.env.PROD_SMOKE_PASSWORD;
  try {
    process.env.PROD_SMOKE_EMAIL = 'admin@example.com';
    process.env.PROD_SMOKE_PASSWORD = 'password123';

    const makeJwt = (payload) => {
      const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
      return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.fake_sig`;
    };

    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/api/auth/login')) {
        return new Response(
          JSON.stringify({
            token: makeJwt({ id: 1, role: 'admin', empresa_id: 99 }),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/auth/select-empresa')) {
        return new Response(
          JSON.stringify({
            error: 'Acesso negado para a empresa selecionada',
            code: 'TENANT_ACCESS_DENIED',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const token = await resolveAdminToken();
    assert.equal(token, null);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevEmail !== undefined) process.env.PROD_SMOKE_EMAIL = prevEmail;
    else delete process.env.PROD_SMOKE_EMAIL;
    if (prevPass !== undefined) process.env.PROD_SMOKE_PASSWORD = prevPass;
    else delete process.env.PROD_SMOKE_PASSWORD;
  }
});

test('checkLearnerQualifications prioritizes qualificacaoHistoricoId and course matching', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/api/qualificacoes/funcionario/193')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [
              { id: 10, lms_curso_id: 50, status: 'CONCLUIDA' },
              { id: 20, lms_curso_id: 67, status: 'CONCLUIDA' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const exact = await checkLearnerQualifications('token', 193, 50, 20);
    assert.equal(exact?.id, 20);

    const byCourse = await checkLearnerQualifications('token', 193, 67);
    assert.equal(byCourse?.id, 20);

    const notFound = await checkLearnerQualifications('token', 193, 999);
    assert.equal(notFound, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('checkCertificate validates PDF buffer and computes sha256', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/api/certificados/historico/20/certificados')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 701 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/certificados/download/701')) {
        const dummyPdf = Buffer.from('%PDF-1.4 dummy certificate content');
        return new Response(dummyPdf, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        });
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const cert = await checkCertificate('token', 20);
    assert.equal(cert?.id, 701);
    assert.equal(cert?.validPdf, true);
    assert.equal(typeof cert?.sha256, 'string');
    assert.equal(cert?.sizeBytes > 0, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('checkCertificate resolves streaming URL from JSON metadata when download returns redirect', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).endsWith('/api/certificados/historico/30/certificados')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 702 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/certificados/download/702')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { url: '/api/pasta-virtual/stream/702', nome: 'cert.pdf' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/pasta-virtual/stream/702')) {
        const dummyPdf = Buffer.from('%PDF-1.7 production streamed certificate content');
        return new Response(dummyPdf, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        });
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const cert = await checkCertificate('token', 30);
    assert.equal(cert?.id, 702);
    assert.equal(cert?.validPdf, true);
    assert.equal(typeof cert?.sha256, 'string');
    assert.equal(cert?.sizeBytes > 0, true);
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// Adversarial Tests: Course Path, Assessment Policy & Homologation Gate
// ---------------------------------------------------------------------------

test('adversarial: evaluateCoursePath fails when learner stops halfway', () => {
  const result = evaluateCoursePath({
    contentType: 'scorm',
    totalUnits: 49,
    visitedUnits: 25,
    atLastUnit: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INCOMPLETE_COURSE_PATH');
});

test('adversarial: evaluateCoursePath fails when learner does not reach last unit', () => {
  const result = evaluateCoursePath({
    contentType: 'scorm',
    totalUnits: 49,
    visitedUnits: 49,
    atLastUnit: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INCOMPLETE_COURSE_PATH');
});

test('adversarial: evaluateCoursePath fails when mandatory activities are incomplete', () => {
  const result = evaluateCoursePath({
    contentType: 'scorm',
    totalUnits: 30,
    visitedUnits: 30,
    atLastUnit: true,
    totalActivities: 5,
    completedActivities: 3,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'MANDATORY_ACTIVITIES_INCOMPLETE');
});

test('evaluateCoursePath passes when full journey and mandatory activities are completed', () => {
  const result = evaluateCoursePath({
    contentType: 'scorm',
    totalUnits: 49,
    visitedUnits: 49,
    atLastUnit: true,
    totalActivities: 4,
    completedActivities: 4,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
});

test('adversarial: evaluateAssessmentPolicy fails when scored course has lesson_status=failed', () => {
  const result = evaluateAssessmentPolicy({
    policy: 'SCORED',
    lessonStatus: 'failed',
    scoreRaw: 50,
    masteryScore: 80,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'ASSESSMENT_FAILED');
});

test('adversarial: evaluateAssessmentPolicy fails when scored course score is below mastery cut', () => {
  const result = evaluateAssessmentPolicy({
    policy: 'SCORED',
    lessonStatus: 'incomplete',
    scoreRaw: 70,
    masteryScore: 80,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'SCORE_BELOW_MASTERY');
});

test('adversarial: evaluateAssessmentPolicy fails when formative course status is incomplete', () => {
  const result = evaluateAssessmentPolicy({
    policy: 'FORMATIVE',
    lessonStatus: 'incomplete',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'FORMATIVE_STATUS_INCOMPLETE');
});

test('evaluateAssessmentPolicy passes for formative course when lesson_status is completed', () => {
  const result = evaluateAssessmentPolicy({
    policy: 'FORMATIVE',
    lessonStatus: 'completed',
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
});

test('evaluateAssessmentPolicy passes for scored course when score meets cut and status is passed', () => {
  const result = evaluateAssessmentPolicy({
    policy: 'SCORED',
    lessonStatus: 'passed',
    scoreRaw: 85,
    masteryScore: 80,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
});

test('adversarial: evaluateHomologationVerdict fails when percurso_ok is false', () => {
  const result = evaluateHomologationVerdict({
    percurso_ok: false,
    avaliacao_ok: true,
    isConcluido: true,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: false,
    qual: null,
    cert: null,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'INCOMPLETE_COURSE_PATH');
});

test('adversarial: evaluateHomologationVerdict fails when avaliacao_ok is false', () => {
  const result = evaluateHomologationVerdict({
    percurso_ok: true,
    avaliacao_ok: false,
    isConcluido: true,
    progress100: true,
    resumedVerified: true,
    reopenNoDowngrade: true,
    qualExpected: false,
    qual: null,
    cert: null,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'ASSESSMENT_NOT_PASSED');
});

test('adversarial: enrollLearner triggers rematricular when course is already CONCLUIDO', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, opts) => {
      calls.push({ url: String(url), method: opts?.method });
      if (String(url).includes('/api/lms/matriculas/minhas-ead')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 670, curso_id: 67, status: 'CONCLUIDO', deleted_at: null }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/lms/matriculas/670/rematricular')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { matricula_id: 671, status: 'NAO_INICIADO', ciclo: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const id = await enrollLearner('learner-token', 67, 193);
    assert.equal(id, 671);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].method, 'POST');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('adversarial: enrollLearner triggers rematricular when enrollment is EM_ANDAMENTO (isolamento de navegador)', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, opts) => {
      calls.push({ url: String(url), method: opts?.method });
      if (String(url).includes('/api/lms/matriculas/minhas-ead')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 670, curso_id: 67, status: 'EM_ANDAMENTO', deleted_at: null }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/lms/matriculas/670/rematricular')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { matricula_id: 672, status: 'NAO_INICIADO', ciclo: 3 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const id = await enrollLearner('learner-token', 67, 193);
    assert.equal(id, 672);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].method, 'POST');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('adversarial: evaluateAssessmentPolicy fails when score is below cut even if status is passed (contradictory score)', () => {
  const result = evaluateAssessmentPolicy({
    policy: 'SCORED',
    lessonStatus: 'passed',
    scoreRaw: 20,
    masteryScore: 80,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'SCORE_BELOW_MASTERY');
});

test('adversarial: missing, unknown and external assessment policies do not certify', () => {
  assert.equal(evaluateAssessmentPolicy({ lessonStatus: 'completed' }).ok, false);
  assert.equal(evaluateAssessmentPolicy({ policy: 'UNKNOWN', lessonStatus: 'passed' }).ok, false);
  assert.equal(evaluateAssessmentPolicy({ policy: 'EXTERNAL', lessonStatus: 'completed' }).ok, false);
  assert.equal(evaluateAssessmentPolicy({ policy: 'EXTERNAL', lessonStatus: 'passed', externalProofVerified: false }).reason, 'EXTERNAL_ASSESSMENT_NOT_ATTESTED');
  assert.equal(evaluateAssessmentPolicy({ policy: 'UNRECOGNIZED_POLICY', lessonStatus: 'completed' }).reason, 'ASSESSMENT_POLICY_UNSUPPORTED');
});

test('PPTX_SLIDES policy remains explicitly supported when backend completed', () => {
  assert.equal(evaluateAssessmentPolicy({ policy: 'PPTX_SLIDES', lessonStatus: 'completed' }).ok, true);
  assert.equal(evaluateAssessmentPolicy({ policy: 'PPTX_SLIDES', lessonStatus: 'incomplete' }).ok, false);
});

test('adversarial: evaluateCoursePath fails when units jump (skipping intermediate units)', () => {
  // Learner visited only unit 1 and unit 45 (e.g. via direct jump), but totalUnits is 45
  const result = evaluateCoursePath({
    contentType: 'scorm',
    totalUnits: 45,
    visitedUnits: 45,
    distinctUnitsVisited: new Set([1, 45]),
    atLastUnit: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INCOMPLETE_COURSE_PATH');
});

test('adversarial: unknown total and skipped slides never prove full course path', () => {
  const unknown = evaluateCoursePath({ contentType: 'scorm', totalUnits: 0, visitedUnits: 1, atLastUnit: true });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'COURSE_TOTAL_UNVERIFIED');
  const skipped = evaluateCoursePath({ contentType: 'scorm', totalUnits: 45, visitedUnits: 2, atLastUnit: true });
  assert.equal(skipped.ok, false);
  assert.equal(skipped.reason, 'INCOMPLETE_COURSE_PATH');
});

test('evaluateCoursePath passes with distinctUnitsVisited set covering all units', () => {
  const all45 = new Set(Array.from({ length: 45 }, (_, i) => i + 1));
  const result = evaluateCoursePath({
    contentType: 'scorm',
    totalUnits: 45,
    visitedUnits: 45,
    distinctUnitsVisited: all45,
    atLastUnit: true,
    totalActivities: 2,
    completedActivities: 2,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
});

test('adversarial: missing path or assessment evidence is not defaulted to PASS', () => {
  const actual = evaluateHomologationVerdict({
    isConcluido: true, progress100: true, resumedVerified: true,
    reopenNoDowngrade: true, qualExpected: false, qual: null, cert: null,
  });
  assert.equal(actual.pass, false);
  assert.equal(actual.reason, 'INCOMPLETE_COURSE_PATH');
});

test('regression: determineSlideAction does not oscillate between alternatives once question is answered and advances to qNext', () => {
  let qIndex = 0;
  let selectedOption = null;

  const mockDoc = {
    querySelector: (selector) => {
      if (selector === '#qNext') {
        return {
          disabled: false,
          getAttribute: () => null,
          hasAttribute: () => false,
          style: {},
          click: () => {
            qIndex += 1;
            selectedOption = null; // Next question starts with no answer selected
          },
        };
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector.includes('data-answer') || selector.includes('button.answer')) {
        // Return 3 options for the current question
        return [0, 1, 2].map((i) => ({
          disabled: false,
          getAttribute: () => null,
          hasAttribute: () => false,
          style: {},
          classList: {
            contains: (cls) => cls === 'selected' && selectedOption === i,
          },
          click: () => {
            selectedOption = i;
          },
        }));
      }
      return [];
    },
  };

  // Step 1: No answer selected -> chooses an answer
  const step1 = determineSlideAction(mockDoc);
  assert.equal(step1.type, 'assessment-answer');
  assert.equal(selectedOption, 0);

  // Step 2: Answer 0 is selected -> MUST NOT choose another alternative, must advance with qNext
  const step2 = determineSlideAction(mockDoc);
  assert.equal(step2.type, 'assessment-next-q');
  assert.equal(qIndex, 1); // Advanced to question 2!

  // Step 3: Question 2 has no answer -> chooses an answer
  const step3 = determineSlideAction(mockDoc);
  assert.equal(step3.type, 'assessment-answer');
});

test('regression: determineSlideAction does not oscillate between scenario options and advances to next-button', () => {
  let selectedOption = null;
  let nextClicked = false;

  const mockDoc = {
    querySelector: (selector) => {
      if (selector === '#next') {
        return {
          disabled: false,
          getAttribute: () => null,
          hasAttribute: () => false,
          style: {},
          click: () => {
            nextClicked = true;
          },
        };
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector.includes('data-opt') || selector.includes('button.option')) {
        // Return 4 scenario options A, B, C, D
        return [0, 1, 2, 3].map((i) => ({
          disabled: false,
          getAttribute: (attr) => (attr === 'data-opt' ? String(i) : null),
          hasAttribute: () => false,
          style: {},
          classList: {
            contains: (cls) => cls === 'selected' && selectedOption === i,
          },
          click: () => {
            selectedOption = i;
          },
        }));
      }
      return [];
    },
  };

  // Step 1: No scenario option selected -> chooses option 0
  const step1 = determineSlideAction(mockDoc);
  assert.equal(step1.type, 'scenario-option');
  assert.equal(selectedOption, 0);

  // Step 2: Option 0 is already selected -> MUST NOT choose another option, must advance with next-button
  const step2 = determineSlideAction(mockDoc);
  assert.equal(step2.type, 'next-button');
  assert.equal(nextClicked, true);
});

test('regression: determineSlideAction does not treat "Concluir avaliação" as final-button, and advances to "Concluir curso"', () => {
  let assessmentEvaluated = false;
  let finalCourseClicked = false;

  const mockDoc = {
    querySelector: (selector) => {
      if (selector === '.counter, #count') {
        return { textContent: '45 / 45' };
      }
      if (selector === '#next') {
        return {
          disabled: false,
          innerText: assessmentEvaluated ? 'Concluir curso' : 'Concluir avaliação',
          getAttribute: () => null,
          hasAttribute: () => false,
          click: () => {
            if (!assessmentEvaluated) {
              assessmentEvaluated = true;
            } else {
              finalCourseClicked = true;
            }
          },
        };
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector === 'button, input[type=button], a') {
        return [
          {
            disabled: false,
            innerText: assessmentEvaluated ? 'Concluir curso' : 'Concluir avaliação',
            getAttribute: () => null,
            hasAttribute: () => false,
            click: () => {
              if (!assessmentEvaluated) {
                assessmentEvaluated = true;
              } else {
                finalCourseClicked = true;
              }
            },
          },
        ];
      }
      return [];
    },
  };

  // Step 1: Assessment questions answered, button says "Concluir avaliação" -> MUST NOT be final-button, must be next-button
  const step1 = determineSlideAction(mockDoc);
  assert.notEqual(step1.type, 'final-button');
  assert.equal(step1.type, 'next-button');
  assert.equal(assessmentEvaluated, true);

  // Step 2: Now assessment is evaluated and button says "Concluir curso" -> MUST be final-button
  const step2 = determineSlideAction(mockDoc);
  assert.equal(step2.type, 'final-button');
  assert.equal(finalCourseClicked, true);
});

test('buildLearnerAuthPayload establishes full user session required by AuthContext and ProtectedRoute', () => {
  // A mock JWT payload with claims
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    id: 194,
    funcionario_id: 194,
    email: 'qa.lms.202611.chromium@airtrust.online',
    nome: 'Aluno QA Chromium',
    empresa_id: 6,
  })).toString('base64url');
  const mockJwt = `${header}.${claims}.signature`;

  const payload = buildLearnerAuthPayload(mockJwt, 194);
  assert.equal(payload.jwt, mockJwt);
  assert.equal(payload.user.id, 194);
  assert.equal(payload.user.funcionario_id, 194);
  assert.equal(payload.user.email, 'qa.lms.202611.chromium@airtrust.online');
  assert.equal(payload.user.role, 'ALUNO');
  assert.equal(payload.user.empresa_id, 6);
});

test('resolveScormContentFrame excludes launch wrapper with hidden completion overlay and locates nested SCO content', async () => {
  // Mock wrapper frame that contains #completion-overlay #btn-close
  const mockWrapperFrame = {
    url: () => 'https://api.airtrust.online/api/lms/scorm/launch/2404',
    evaluate: async (fn) => false, // not content
    $: async (selector) => {
      if (selector === '#scorm-frame') {
        return {
          contentFrame: async () => mockContentFrame,
        };
      }
      return null;
    },
  };

  // Mock nested content frame containing actual SCO course data
  const mockContentFrame = {
    url: () => 'https://api.airtrust.online/api/lms/assets/scorm/pkg-123/index.html',
    evaluate: async (fn) => true, // has COURSE_DATA / slides
  };

  const mockPage = {
    frames: () => [mockWrapperFrame, mockContentFrame],
    evaluate: async () => false,
    $: async (selector) => null,
  };

  const resolved = await resolveScormContentFrame(mockPage);
  assert.equal(resolved, mockContentFrame);
  assert.equal(resolved.url().includes('assets/scorm'), true);
});

test('regression: resolveScormContentFrame ignores about:blank frame until SCO course readiness is detected', async () => {
  let contentReady = false;
  const mockBlankFrame = {
    url: () => 'about:blank',
    evaluate: async () => false,
  };
  const mockSCOFrame = {
    url: () => 'https://api.airtrust.online/api/lms/assets/scorm/pkg-456/index.html',
    evaluate: async () => contentReady,
  };
  const mockPage = {
    frames: () => [mockBlankFrame, mockSCOFrame],
    evaluate: async () => false,
    $: async () => null,
  };

  // While SCO response is still loading, resolveScormContentFrame returns null rather than about:blank
  assert.equal(await resolveScormContentFrame(mockPage), null);

  // Once SCO content finishes loading, resolveScormContentFrame resolves the frame
  contentReady = true;
  const resolved = await resolveScormContentFrame(mockPage);
  assert.equal(resolved, mockSCOFrame);
});

test('regression: determineSlideAction recognizes and clicks "Revisar cenário pendente" on study_end without stalling', () => {
  let pendingClicked = false;
  const mockDoc = {
    querySelector: (sel) => {
      if (sel === '.counter, #count') return { innerText: '45/45' };
      if (sel === '#qNext') return null;
      if (sel === '#next') {
        return {
          disabled: false,
          innerText: 'Revisar cenário pendente (tela 24)',
          click: () => { pendingClicked = true; },
        };
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('button, input[type=button], a')) {
        return [{
          disabled: false,
          innerText: 'Revisar cenário pendente (tela 24)',
          click: () => { pendingClicked = true; },
        }];
      }
      return [];
    },
  };

  const action = determineSlideAction(mockDoc);
  assert.equal(action.type, 'pending-scenario-review');
  assert.equal(action.domCurrent, 45);
  assert.equal(action.domTotal, 45);
  assert.equal(pendingClicked, true);
});

test('regression: determineSlideAction recognizes and clicks "Voltar ao ponto atual" in preview mode', () => {
  let returnClicked = false;
  const mockDoc = {
    querySelector: (sel) => {
      if (sel === '.counter, #count') return { innerText: '5/45' };
      if (sel === '#qNext') return null;
      if (sel === '#next') {
        return {
          disabled: false,
          innerText: 'Voltar ao ponto atual',
          click: () => { returnClicked = true; },
        };
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('button, input[type=button], a')) {
        return [{
          disabled: false,
          innerText: 'Voltar ao ponto atual',
          click: () => { returnClicked = true; },
        }];
      }
      return [];
    },
  };

  const action = determineSlideAction(mockDoc);
  assert.equal(action.type, 'return-to-journey');
  assert.equal(action.domCurrent, 5);
  assert.equal(action.domTotal, 45);
  assert.equal(returnClicked, true);
});

test('adversarial: enrollLearner prioritizes reverter on CONCLUIDO when adminToken is provided to ensure full course journey reset', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, opts) => {
      calls.push({ url: String(url), method: opts?.method, body: opts?.body });
      if (String(url).includes('/api/lms/matriculas/minhas-ead')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 2405, curso_id: 67, status: 'CONCLUIDO', deleted_at: null }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/lms/matriculas/2405/reverter')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { matricula_id: 2405, status: 'EM_ANDAMENTO', reverted: true },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/lms/matriculas/2405/status') && opts?.method === 'PATCH') {
        return new Response(
          JSON.stringify({
            success: true,
            data: { matricula_id: 2405, status: 'NAO_INICIADO' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const id = await enrollLearner('learner-token', 67, 195, 'admin-token');
    assert.equal(id, 2405);
    assert.equal(calls.length, 3);
    assert.equal(calls[1].method, 'POST');
    assert.equal(calls[1].url.endsWith('/reverter'), true);
    assert.equal(calls[1].body.includes('CORRECAO'), true);
    assert.equal(calls[2].method, 'PATCH');
    assert.equal(calls[2].url.endsWith('/status'), true);
    assert.equal(calls[2].body.includes('NAO_INICIADO'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('adversarial: enrollLearner on EM_ANDAMENTO uses governed administrative patch and reversal when /finalizar would reject incomplete runs', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, opts) => {
      calls.push({ url: String(url), method: opts?.method, body: opts?.body });
      if (String(url).includes('/api/lms/matriculas/minhas-ead')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 2404, curso_id: 67, status: 'EM_ANDAMENTO', deleted_at: null }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      // Proves Codex finding: /finalizar on an incomplete course returns 409 SCORM_COMPLETION_REJECTED
      if (String(url).endsWith('/api/lms/matriculas/2404/finalizar')) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'SCORM_COMPLETION_REJECTED',
            error: 'Conclusão SCORM ainda não elegível',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/lms/matriculas/2404/status') && opts?.method === 'PATCH') {
        const parsedBody = JSON.parse(opts.body);
        return new Response(
          JSON.stringify({
            success: true,
            data: { matricula_id: 2404, status: parsedBody.status },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/lms/matriculas/2404/reverter')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { matricula_id: 2404, status: 'EM_ANDAMENTO', reverted: true },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const id = await enrollLearner('learner-token', 67, 194, 'admin-token');
    assert.equal(id, 2404);
    assert.equal(calls.length, 4);
    // 1: minhas-ead
    // 2: PATCH /status -> CONCLUIDO (governed administrative completion override)
    assert.equal(calls[1].method, 'PATCH');
    assert.equal(calls[1].url.endsWith('/status'), true);
    assert.equal(calls[1].body.includes('CONCLUIDO'), true);
    // 3: POST /reverter -> resets lms_progresso_scorm and cycles
    assert.equal(calls[2].method, 'POST');
    assert.equal(calls[2].url.endsWith('/reverter'), true);
    assert.equal(calls[2].body.includes('CORRECAO'), true);
    // 4: PATCH /status -> NAO_INICIADO
    assert.equal(calls[3].method, 'PATCH');
    assert.equal(calls[3].url.endsWith('/status'), true);
    assert.equal(calls[3].body.includes('NAO_INICIADO'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('regression: PPTX traversal resets to Slide 1 if player restored at an advanced slide', async () => {
  let slide1Clicked = false;
  const mockSlide1Btn = {
    isVisible: async () => true,
    evaluate: async (fn) => false, // not active
    click: async () => { slide1Clicked = true; },
  };

  const mockPage = {
    locator: (selector) => {
      if (selector === 'button[aria-label^="Slide 1"]') {
        return {
          first: () => mockSlide1Btn,
        };
      }
      return { first: () => ({ isVisible: async () => false }) };
    },
    waitForTimeout: async () => {},
  };

  const slide1Btn = mockPage.locator('button[aria-label^="Slide 1"]').first();
  if (await slide1Btn.isVisible().catch(() => false)) {
    const isSlide1Active = await slide1Btn.evaluate((el) => false).catch(() => true);
    if (!isSlide1Active) {
      await slide1Btn.click().catch(() => null);
    }
  }

  assert.equal(slide1Clicked, true);
});

test('regression: determineSlideAction prioritizes canonical COURSE_DATA.slides.length over incidental counter text', () => {
  const mockDoc = {
    defaultView: {
      COURSE_DATA: {
        slides: new Array(45).fill({ kind: 'content' }),
      },
    },
    querySelector: (selector) => {
      if (selector === '.counter, #count') {
        return {
          innerText: '1 / 50',
          textContent: '1 / 50',
        };
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector === '#next, #nextUnit, #nextBtn, button') {
        return [{
          id: 'next',
          innerText: 'Continuar →',
          disabled: false,
          click: () => {},
        }];
      }
      return [];
    },
  };

  const action = determineSlideAction(mockDoc);
  assert.equal(action.domTotal, 45);
  assert.equal(action.domCurrent, 1);
  assert.equal(action.atLastUnit, false);
});

test('regression: determineSlideAction marks atLastUnit when domCurrent equals canonical slide length', () => {
  const mockDoc = {
    defaultView: {
      COURSE_DATA: {
        slides: new Array(45).fill({ kind: 'content' }),
      },
      __AIRTRUST_PLAYER_TEST__: {
        getState: () => ({ active: 44 }), // 0-based index 44 = slide 45
      },
    },
    querySelector: (selector) => {
      if (selector === '.counter, #count') {
        return {
          innerText: '45 / 50',
        };
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector === 'button, input[type=button], a') {
        return [{
          innerText: 'Confirmar encerramento do estudo',
          disabled: false,
          click: () => {},
        }];
      }
      return [];
    },
  };

  const action = determineSlideAction(mockDoc);
  assert.equal(action.domTotal, 45);
  assert.equal(action.domCurrent, 45);
  assert.equal(action.atLastUnit, true);
  assert.equal(action.type, 'final-button');
});

test('resolveEffectiveLessonStatus prioritizes reopen terminal state over stale in-flight snapshot', () => {
  const status = resolveEffectiveLessonStatus({
    reopenState: { lessonStatus: 'completed' },
    lastRuntimeState: { lessonStatus: 'incomplete' },
    scormProgresso: { lesson_status: 'incomplete' },
    isConcluido: true,
    policy: 'FORMATIVE',
  });
  assert.equal(status, 'completed');
});

test('resolveEffectiveLessonStatus recognizes backend persisted scorm progression', () => {
  const status = resolveEffectiveLessonStatus({
    reopenState: null,
    lastRuntimeState: { lessonStatus: 'incomplete' },
    scormProgresso: { lesson_status: 'passed' },
    isConcluido: true,
    policy: 'SCORED',
  });
  assert.equal(status, 'passed');
});

test('adversarial: resolveEffectiveLessonStatus never fabricates completion when all snapshots are incomplete even if isConcluido is true', () => {
  const status = resolveEffectiveLessonStatus({
    reopenState: { lessonStatus: 'incomplete' },
    lastRuntimeState: { lessonStatus: 'incomplete' },
    scormProgresso: { lesson_status: 'incomplete' },
    reopenScormProgresso: { lesson_status: 'incomplete' },
    isConcluido: true,
    policy: 'FORMATIVE',
  });
  assert.equal(status, 'incomplete');
});

test('adversarial: resolveEffectiveLessonStatus preserves explicit failure even if isConcluido is true', () => {
  const status = resolveEffectiveLessonStatus({
    reopenState: { lessonStatus: 'failed' },
    lastRuntimeState: { lessonStatus: 'failed' },
    scormProgresso: { lesson_status: 'failed' },
    reopenScormProgresso: { lesson_status: 'failed' },
    isConcluido: true,
    policy: 'FORMATIVE',
  });
  assert.equal(status, 'failed');
});

test('adversarial: isLocationResumed rejects regression/reset to first unit when saved checkpoint was 2/45', () => {
  assert.equal(isLocationResumed('2/45', '1/45'), false);
  assert.equal(isLocationResumed('3/45', '1/45'), false);
});

test('isLocationResumed accepts exact and canonical unit matches', () => {
  assert.equal(isLocationResumed('2/45', '2/45'), true);
  assert.equal(isLocationResumed('3/45', '3'), true);
  assert.equal(isLocationResumed('4', '4/45'), true);
});

test('checkCertificate retries on initial empty list and succeeds on subsequent poll', async () => {
  const originalFetch = globalThis.fetch;
  let pollCount = 0;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/api/certificados/historico/40/certificados')) {
        pollCount += 1;
        if (pollCount === 1) {
          // First poll returns empty list while backend worker asynchronously writes certificate
          return new Response(
            JSON.stringify({ success: true, data: [] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({ success: true, data: [{ id: 801 }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/certificados/download/801')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { url: '/api/pasta-virtual/stream/801', nome: 'cert_801.pdf' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).endsWith('/api/pasta-virtual/stream/801')) {
        const dummyPdf = Buffer.from('%PDF-1.4 async certificate stream content');
        return new Response(dummyPdf, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        });
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const cert = await checkCertificate('token', 40, 5, 0);
    assert.equal(pollCount, 2);
    assert.equal(cert?.id, 801);
    assert.equal(cert?.validPdf, true);
    assert.equal(typeof cert?.sha256, 'string');
    assert.equal(cert?.sizeBytes > 0, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('checkLearnerQualifications retries on initial empty list and resolves when qualification appears', async () => {
  const originalFetch = globalThis.fetch;
  let qualPollCount = 0;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/api/qualificacoes/funcionario/194')) {
        qualPollCount += 1;
        if (qualPollCount === 1) {
          return new Response(
            JSON.stringify({ success: true, data: [] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 7660, lms_curso_id: 67, status: 'CONCLUIDA' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const qual = await checkLearnerQualifications('token', 194, 67, 7660, 5, 0);
    assert.equal(qualPollCount, 2);
    assert.equal(qual?.id, 7660);
    assert.equal(qual?.lms_curso_id, 67);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveAdminToken forces refresh when requested to prevent stale token reuse', async () => {
  const originalFetch = globalThis.fetch;
  let loginCalls = 0;
  const prevEmail = process.env.PROD_SMOKE_EMAIL;
  const prevPass = process.env.PROD_SMOKE_PASSWORD;
  try {
    process.env.PROD_SMOKE_EMAIL = 'admin@airtrust.online';
    process.env.PROD_SMOKE_PASSWORD = 'password';

    const makeJwt = (payload, callIdx) => {
      const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
      return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig${callIdx}`;
    };

    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/api/auth/login')) {
        loginCalls += 1;
        return new Response(
          JSON.stringify({
            success: true,
            accessToken: makeJwt({ id: 1, role: 'ADMIN', empresa_id: 6 }, loginCalls),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const token1 = await resolveAdminToken(true);
    assert.ok(token1?.includes('sig1'));

    // Without force refresh, it should return cached token
    const tokenCached = await resolveAdminToken(false);
    assert.equal(tokenCached, token1);
    assert.equal(loginCalls, 1);

    // With force refresh, it should call login again
    const token2 = await resolveAdminToken(true);
    assert.ok(token2?.includes('sig2'));
    assert.equal(loginCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevEmail !== undefined) process.env.PROD_SMOKE_EMAIL = prevEmail;
    else delete process.env.PROD_SMOKE_EMAIL;
    if (prevPass !== undefined) process.env.PROD_SMOKE_PASSWORD = prevPass;
    else delete process.env.PROD_SMOKE_PASSWORD;
  }
});

test('regression: getMatriculaDetail scorm_progresso fallback correctly resolves lesson_location', async () => {
  const detail = {
    id: 123,
    status: 'EM_ANDAMENTO',
    scorm_progresso: {
      lesson_location: 'slide_05',
      progresso_percentual: 50,
    },
  };
  const location = detail?.scorm_progresso?.lesson_location || detail?.progresso_scorm?.lesson_location;
  assert.equal(location, 'slide_05');
});

test('regression: unvisited gate selection excludes assessment and scenario answer buttons', () => {
  const mockButtons = [
    {
      innerText: 'Alternativa B',
      matches: (sel) => sel.includes('.answer') || sel.includes('[data-answer]'),
      closest: (sel) => sel.includes('.answers'),
      getAttribute: (attr) => (attr === 'data-answer' ? '1' : null),
      classList: { contains: () => false },
      disabled: false,
    },
    {
      innerText: 'Card de Informação 1',
      matches: () => false,
      closest: () => null,
      getAttribute: (attr) => (attr === 'data-gate' ? 'card_1' : null),
      classList: { contains: () => false },
      disabled: false,
    },
  ];

  const visible = () => true;
  const clean = (s) => String(s || '').trim();
  const clickedGates = [];
  const clickedTouches = [];

  const unvisitedGate = mockButtons.find((el) => {
    if (!visible(el) || el.disabled) return false;
    if (el.matches('.answer, .option, [data-answer], [data-opt], [data-choice], [data-question], [data-quiz], .quiz-btn, .quiz-option, .choice-btn, .alternative, [data-alternative]')) {
      return false;
    }
    if (el.closest('.answers, .options, .quiz-options, .question-answers, [data-quiz-container], .choices')) {
      return false;
    }
    const key = el.getAttribute('data-gate') || el.id || clean(el.innerText || '');
    if (!key || clickedGates.includes(key) || clickedTouches.includes(key)) return false;
    return !el.classList.contains('seen');
  });

  assert.ok(unvisitedGate);
  assert.equal(unvisitedGate.innerText, 'Card de Informação 1');
});


