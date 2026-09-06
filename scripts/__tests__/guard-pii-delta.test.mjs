import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isValidCpf,
  parseUnifiedDiffAddedLines,
  scanAddedLines,
} from '../pii-delta-lib.mjs';

test('valida CPF pelo checksum e rejeita sequências artificiais', () => {
  const valid = '529' + '.982.247-25';
  assert.equal(isValidCpf(valid), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('529.982.247-24'), false);
});

test('detecta e-mail real de tenant sem expor o valor na violação', () => {
  const realEmail = 'pessoa.real' + '@' + 'voecostadosol.com.br';
  const result = scanAddedLines([{ file: 'x.sql', line: 7, text: `email='${realEmail}'` }]);

  assert.equal(result.length, 1);
  assert.equal(result[0].ruleId, 'REAL_TENANT_EMAIL');
  assert.equal(JSON.stringify(result).includes('pessoa.real'), false);
});

test('detecta somente CPF válido literal', () => {
  const validCpf = '529' + '.982.247-25';
  const result = scanAddedLines([
    { file: 'x.sql', line: 1, text: `cpf='${validCpf}'` },
    { file: 'x.sql', line: 2, text: "cpf='000.000.000-00'" },
  ]);

  assert.deepEqual(result.map((item) => item.ruleId), ['VALID_CPF_LITERAL']);
});

test('aceita dados sintéticos não identificáveis', () => {
  const result = scanAddedLines([
    { file: 'fixture.ts', line: 1, text: "email='pilot@example.invalid'" },
    { file: 'fixture.ts', line: 2, text: "cpf='000.000.000-00'" },
  ]);
  assert.deepEqual(result, []);
});

test('parser considera apenas linhas adicionadas e preserva arquivo/linha', () => {
  const email = 'real' + '@' + 'voecostadosol.com.br';
  const diff = [
    'diff --git a/a.sql b/a.sql',
    '--- a/a.sql',
    '+++ b/a.sql',
    '@@ -10,1 +10,2 @@',
    ' linha existente',
    `+email=${email}`,
    '-linha removida',
  ].join('\n');

  const added = parseUnifiedDiffAddedLines(diff);
  assert.deepEqual(added, [{ file: 'a.sql', line: 11, text: `email=${email}` }]);
  assert.equal(scanAddedLines(added)[0]?.ruleId, 'REAL_TENANT_EMAIL');
});
