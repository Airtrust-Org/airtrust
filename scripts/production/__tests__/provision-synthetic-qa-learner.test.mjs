import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNTHETIC_LEARNER,
  generateValidTestCpf,
  assertLearnerClaims,
} from '../provision-synthetic-qa-learner.mjs';

test('SYNTHETIC_LEARNER contains expected constants and zero PII', () => {
  assert.equal(SYNTHETIC_LEARNER.matricula, 'QA-LMS-202611');
  assert.equal(SYNTHETIC_LEARNER.email, 'qa.lms.202611@airtrust.online');
  assert.equal(SYNTHETIC_LEARNER.nome, 'AIRTRUST_QA_LMS_E2E_202611');
  assert.equal(SYNTHETIC_LEARNER.perfil, 'ALUNO');
  assert.equal(SYNTHETIC_LEARNER.cargo, 'Aluno de Teste QA');
});

test('generateValidTestCpf produces an 11-digit CPF passing modulo 11 algorithm', () => {
  const cpf = generateValidTestCpf('999000001');
  assert.equal(cpf.length, 11);
  assert.equal(cpf, '99900000188');

  // Verify first checksum digit
  let sum1 = 0;
  for (let i = 0; i < 9; i++) sum1 += parseInt(cpf.charAt(i), 10) * (10 - i);
  let d1 = 11 - (sum1 % 11);
  if (d1 >= 10) d1 = 0;
  assert.equal(d1, parseInt(cpf.charAt(9), 10));

  // Verify second checksum digit
  let sum2 = 0;
  for (let i = 0; i < 10; i++) sum2 += parseInt(cpf.charAt(i), 10) * (11 - i);
  let d2 = 11 - (sum2 % 11);
  if (d2 >= 10) d2 = 0;
  assert.equal(d2, parseInt(cpf.charAt(10), 10));
});

test('assertLearnerClaims validates tenant 6 and ALUNO role', () => {
  const payload = {
    empresa_id: 6,
    funcionario_id: 1234,
    role: 'ALUNO',
  };
  const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
  const claims = assertLearnerClaims(token, 1234);
  assert.equal(claims.empresa_id, 6);
  assert.equal(claims.funcionario_id, 1234);
  assert.equal(claims.role, 'ALUNO');
});

test('assertLearnerClaims rejects wrong tenant or non-aluno role', () => {
  const wrongTenant = `header.${Buffer.from(JSON.stringify({ empresa_id: 99, funcionario_id: 1234, role: 'ALUNO' })).toString('base64url')}.sig`;
  assert.throws(() => assertLearnerClaims(wrongTenant, 1234), /LEARNER_TOKEN_WRONG_TENANT/);

  const wrongRole = `header.${Buffer.from(JSON.stringify({ empresa_id: 6, funcionario_id: 1234, role: 'GESTOR' })).toString('base64url')}.sig`;
  assert.throws(() => assertLearnerClaims(wrongRole, 1234), /LEARNER_TOKEN_ROLE_NOT_ALUNO/);

  const wrongEmp = `header.${Buffer.from(JSON.stringify({ empresa_id: 6, funcionario_id: 9999, role: 'ALUNO' })).toString('base64url')}.sig`;
  assert.throws(() => assertLearnerClaims(wrongEmp, 1234), /LEARNER_TOKEN_WRONG_EMPLOYEE/);
});
