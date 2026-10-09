import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEnrollmentPlan, chunkIds } from '../production/training-compliance-enroll-no-email.mjs';

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
