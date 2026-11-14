import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNTHETIC_LEARNER,
  generateValidTestCpf,
  assertLearnerClaims,
  selectEligibleSector,
} from '../provision-synthetic-qa-learner.mjs';

test('SYNTHETIC_LEARNER contains expected constants and zero PII', () => {
  assert.equal(SYNTHETIC_LEARNER.matricula, 'QA-LMS-202611');
  assert.equal(SYNTHETIC_LEARNER.email, 'qa.lms.202611@airtrust.online');
  assert.equal(SYNTHETIC_LEARNER.nome, 'AIRTRUST_QA_LMS_E2E_202611');
  assert.equal(SYNTHETIC_LEARNER.perfil, 'ALUNO');
  assert.equal(SYNTHETIC_LEARNER.cargo, 'Aluno de Teste QA');
});

test('selectEligibleSector prefers active training/operations sectors or first active sector', () => {
  const sample = [
    { id: 1, nome: 'Financeiro', ativo: 1 },
    { id: 2, nome: 'Treinamento e Instrução', ativo: 1 },
    { id: 3, nome: 'Inativo Treinamento', ativo: 0 },
  ];
  const chosen = selectEligibleSector(sample);
  assert.equal(chosen?.id, 2);
  assert.equal(chosen?.nome, 'Treinamento e Instrução');

  const fallbackSample = [
    { id: 5, nome: 'Manutenção', ativo: 1 },
  ];
  const fallbackChosen = selectEligibleSector(fallbackSample);
  assert.equal(fallbackChosen?.id, 5);

  assert.equal(selectEligibleSector([]), null);
  assert.equal(selectEligibleSector(null), null);
});

test('selectEligibleSector filters out unclassified sectors and respects operational scope', () => {
  // Caso de regressão: Administrativo é o primeiro e tem afinidade de nome, mas é desclassificado (sem domínio)
  // Operações de Voo é o segundo e é classificado e elegível no escopo do admin
  const sample = [
    { id: 10, nome: 'Administrativo Geral', ativo: 1 },
    { id: 20, nome: 'Operações de Voo', ativo: 1 },
  ];
  const unclassified = new Set([10]); // Setor 10 sem domínio
  const operationalScope = new Set([10, 20]);

  const chosen = selectEligibleSector(sample, unclassified, operationalScope);
  assert.equal(chosen?.id, 20);
  assert.equal(chosen?.nome, 'Operações de Voo');

  // Caso onde o setor está classificado mas fora do escopo do admin
  const outOfScope = new Set([99]);
  const chosenOutOfScope = selectEligibleSector(sample, new Set(), outOfScope);
  // Sem setor classificado no escopo, não efetuar provisionamento.
  assert.equal(chosenOutOfScope, null);
});

test('generateValidTestCpf produces an 11-digit CPF passing modulo 11 algorithm', () => {
  const prefix = '999000001';
  const cpf = generateValidTestCpf(prefix);
  assert.equal(cpf.length, 11);
  assert.equal(cpf.startsWith(prefix), true);

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
