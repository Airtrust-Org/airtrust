import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCertificate,
  checkLearnerQualifications,
  enrollLearner,
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

test('evaluateHomologationVerdict rejects PASS when certificate PDF is invalid', () => {
  const result = evaluateHomologationVerdict({
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
