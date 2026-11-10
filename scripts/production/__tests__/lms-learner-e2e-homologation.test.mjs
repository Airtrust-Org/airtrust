import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCertificate,
  checkLearnerQualifications,
  enrollLearner,
  evaluateAssessmentPolicy,
  evaluateCoursePath,
  evaluateHomologationVerdict,
  resolveAdminToken,
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

  assert.equal(addedCookies.length >= 1, true);
  assert.equal(addedCookies[0].name, 'airtrust_access_token');
  assert.equal(addedCookies[0].value, 'mock-jwt-token-123');
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
            data: [{ id: 88, curso_id: 67, status: 'EM_ANDAMENTO', deleted_at: null }],
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

test('adversarial: missing, unknown and external assessment policies do not certify', () => {
  assert.equal(evaluateAssessmentPolicy({ lessonStatus: 'completed' }).ok, false);
  assert.equal(evaluateAssessmentPolicy({ policy: 'UNKNOWN', lessonStatus: 'passed' }).ok, false);
  assert.equal(evaluateAssessmentPolicy({ policy: 'EXTERNAL', lessonStatus: 'completed' }).ok, false);
});

test('adversarial: SCORED passed with a score below mastery is rejected', () => {
  const actual = evaluateAssessmentPolicy({
    policy: 'SCORED', lessonStatus: 'passed', scoreRaw: 20, masteryScore: 80,
  });
  assert.equal(actual.ok, false);
  assert.equal(actual.reason, 'SCORE_BELOW_MASTERY');
});

test('PPTX_SLIDES policy remains explicitly supported when backend completed', () => {
  assert.equal(evaluateAssessmentPolicy({ policy: 'PPTX_SLIDES', lessonStatus: 'completed' }).ok, true);
  assert.equal(evaluateAssessmentPolicy({ policy: 'PPTX_SLIDES', lessonStatus: 'incomplete' }).ok, false);
});

test('adversarial: unknown total and skipped slides never prove full course path', () => {
  const unknown = evaluateCoursePath({ contentType: 'scorm', totalUnits: 0, visitedUnits: 1, atLastUnit: true });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'COURSE_TOTAL_UNVERIFIED');
  const skipped = evaluateCoursePath({ contentType: 'scorm', totalUnits: 45, visitedUnits: 2, atLastUnit: true });
  assert.equal(skipped.ok, false);
});

test('adversarial: missing path or assessment evidence is not defaulted to PASS', () => {
  const actual = evaluateHomologationVerdict({
    isConcluido: true, progress100: true, resumedVerified: true,
    reopenNoDowngrade: true, qualExpected: false, qual: null, cert: null,
  });
  assert.equal(actual.pass, false);
  assert.equal(actual.reason, 'INCOMPLETE_COURSE_PATH');
});
