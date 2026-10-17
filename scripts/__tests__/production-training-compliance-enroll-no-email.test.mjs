import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnrollmentPlan, chunkIds, executeSilentEnrollment } from '../production/training-compliance-enroll-no-email.mjs';

test('buildEnrollmentPlan creates only single-course actionable groups', () => {
  const result = buildEnrollmentPlan({
    gaps_matricula: [
      {
        qualificacao_tipo_id: 10,
        qualificacao_tipo_codigo: 'Q1',
        qualificacao_tipo_nome: 'Qualificação 1',
        funcionarios: [{ id: 1 }, { id: 2 }, { id: 2 }],
        cursos_ead: [{ id: 77, titulo: 'Curso EAD 1' }],
      },
      {
        qualificacao_tipo_id: 11,
        qualificacao_tipo_codigo: 'Q2',
        qualificacao_tipo_nome: 'Qualificação 2',
        funcionarios: [{ id: 3 }],
        cursos_ead: [],
      },
    ],
  });

  assert.deepEqual(result.ambiguous, []);
  assert.equal(result.plan.length, 1);
  assert.deepEqual(result.plan[0].funcionario_ids, [1, 2]);
  assert.equal(result.plan[0].curso.id, 77);
  assert.equal(result.unavailable.length, 1);
  assert.equal(result.unavailable[0].codigo, 'Q2');
});

test('buildEnrollmentPlan fails closed by surfacing ambiguous course mappings', () => {
  const result = buildEnrollmentPlan({
    gaps_matricula: [
      {
        qualificacao_tipo_id: 10,
        qualificacao_tipo_codigo: 'AMB',
        qualificacao_tipo_nome: 'Ambígua',
        funcionarios: [{ id: 1 }],
        cursos_ead: [
          { id: 77, titulo: 'Curso A' },
          { id: 78, titulo: 'Curso B' },
        ],
      },
    ],
  });

  assert.equal(result.plan.length, 0);
  assert.equal(result.ambiguous.length, 1);
  assert.deepEqual(result.ambiguous[0].cursos, [77, 78]);
});

test('chunkIds respects the LMS batch ceiling', () => {
  const ids = Array.from({ length: 401 }, (_, index) => index + 1);
  const chunks = chunkIds(ids, 200);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [200, 200, 1]);
});

test('FDM Manutenção scope enrolls only expired or never-trained workers into course 72', () => {
  const source = { gaps_matricula: [
    { qualificacao_tipo_id: 12, qualificacao_tipo_codigo: 'FDM-MECANICO',
      funcionarios: [
        { id: 5, status_compliance: 'NAO_REALIZADO' },
        { id: 6, status_compliance: 'VENCIDO' },
        { id: 7, status_compliance: 'VENCENDO' },
        { id: 8, status_compliance: 'CONFORME' },
        { id: 9, status_compliance: 'EM_ANDAMENTO' },
      ],
      cursos_ead: [{ id: 72, titulo: 'FDM Manutenção' }] },
    { qualificacao_tipo_id: 13, qualificacao_tipo_codigo: 'FDM-COMITE-GATEKEEPER',
      funcionarios: [{ id: 10, status_compliance: 'NAO_REALIZADO' }],
      cursos_ead: [{ id: 73 }] },
    { qualificacao_tipo_id: 14, qualificacao_tipo_codigo: 'FDM-TRIPULACAO',
      funcionarios: [{ id: 11, status_compliance: 'NAO_REALIZADO' }],
      cursos_ead: [{ id: 71 }] },
  ] };
  const scoped = buildEnrollmentPlan(source, { scope: 'FDM_MNT_72' });
  assert.equal(scoped.plan.length, 1);
  assert.equal(scoped.plan[0].curso.id, 72);
  assert.deepEqual(scoped.plan[0].funcionario_ids, [5, 6]);
  assert.equal(scoped.unavailable.length, 0);
  assert.equal(scoped.ambiguous.length, 0);
});

test('FDM scope fails closed when course 72 is mapped to a different ID', () => {
  const gap = { qualificacao_tipo_codigo: 'FDM-MECANICO',
    funcionarios: [{ id: 11, status_compliance: 'VENCIDO' }],
    cursos_ead: [{ id: 74, titulo: 'Wrong LMS' }] };
  assert.throws(() =>
    buildEnrollmentPlan({ gaps_matricula: [gap] }, { scope: 'FDM_MNT_72' }),
    /FDM72_COURSE_MAPPING_NOT_EXACT/);
  const missing = buildEnrollmentPlan({ gaps_matricula: [{ ...gap, cursos_ead: [] }] },
    { scope: 'FDM_MNT_72' });
  assert.equal(missing.unavailable.length, 1);
});

test('FDM scope filters unchanged completed and renewal-approaching evidence', () => {
  const result = buildEnrollmentPlan({ gaps_matricula: [{
    qualificacao_tipo_codigo: 'FDM-MECANICO',
    funcionarios: [{ id: 15, status_compliance: 'VENCENDO' }, { id: 16, status_compliance: 'CONFORME' }],
    cursos_ead: [{ id: 72 }],
  }] }, { scope: 'FDM_MNT_72' });
  assert.equal(result.plan.length, 0);
  assert.throws(() => buildEnrollmentPlan({}, { scope: 'UNSCOPED' }), /ENROLLMENT_SCOPE_INVALID/);
});

test('scoped executor writes only FDM72, never sends email, and validates tenant six', async () => {
  const calls = [];
  let reconcileReads = 0;
  const validJson = (data) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
  const fetchImpl = async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    calls.push({ pathname, init });
    if (pathname === '/api/auth/login')
      return validJson({ accessToken: 'scoped-test-token-0123456789' });
    if (pathname === '/api/auth/empresas')
      return validJson({ empresaAtualId: 6, empresas: [{ id: 6 }, { id: 7 }] });
    if (pathname === '/api/empresas/minha')
      return validJson({ id: 6 });
    if (pathname === '/api/compliance-treinamentos/reconciliacao') {
      reconcileReads += 1;
      return validJson({ gaps_matricula: [
        { qualificacao_tipo_codigo: 'FDM-MECANICO',
          funcionarios: reconcileReads === 1
            ? [{ id: 5, status_compliance: 'NAO_REALIZADO' }, { id: 6, status_compliance: 'VENCIDO' }]
            : [{ id: 7, status_compliance: 'VENCENDO' }],
          cursos_ead: [{ id: 72 }] },
        { qualificacao_tipo_codigo: 'FDM-TRIPULACAO',
          funcionarios: [{ id: 9, status_compliance: 'NAO_REALIZADO' }],
          cursos_ead: [{ id: 71 }] },
      ] });
    }
    if (pathname === '/api/compliance-treinamentos/reconciliacao/fdm-mnt72/sincronizar') {
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(init.body), { scope: 'FDM_MNT_72', course_id: 72 });
      return validJson({ created: 1, reactivated: 1, preserved: 0 });
    }
    throw new Error('UNEXPECTED_API_ROUTE:' + pathname);
  };
  const result = await executeSilentEnrollment({
    fetchImpl, apiBaseUrl: 'https://api.airtrust.online',
    email: 'test@example.invalid', password: 'synthetic-not-real', scope: 'FDM_MNT_72',
  });
  assert.equal(result.created, 1);
  assert.equal(result.reactivated, 1);
  assert.equal(result.scope, 'FDM_MNT_72');
  assert.equal(result.groups_planned, 1);
  assert.equal(calls.filter((entry) => entry.pathname === '/api/compliance-treinamentos/reconciliacao/fdm-mnt72/sincronizar').length, 1);
  assert.equal(calls.some((entry) => entry.pathname === '/api/lms/matriculas/lote'), false);
  assert.equal(calls.some((entry) => /email|convites/.test(entry.pathname)), false);
  assert.equal(reconcileReads, 2);
});

test('scoped executor refuses to mutate if tenant six is inaccessible', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    calls.push(path);
    if (path === '/api/auth/login') return { ok: true, status: 200, json: async () =>
      ({ success: true, data: { accessToken: 'scoped-test-token-0123456789' } }) };
    if (path === '/api/auth/empresas') return { ok: true, status: 200, json: async () =>
      ({ success: true, data: { empresaAtualId: 7, empresas: [{ id: 7 }] } }) };
    throw new Error('UNEXPECTED_ROUTE');
  };
  await assert.rejects(() => executeSilentEnrollment({
    fetchImpl, email: 'test@example.invalid', password: 'synthetic', scope: 'FDM_MNT_72',
  }), /FDM72_TENANT_NOT_AUTHORIZED/);
  assert.deepEqual(calls, ['/api/auth/login', '/api/auth/empresas']);
});
