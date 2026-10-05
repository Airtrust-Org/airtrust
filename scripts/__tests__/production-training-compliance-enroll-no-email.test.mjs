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
