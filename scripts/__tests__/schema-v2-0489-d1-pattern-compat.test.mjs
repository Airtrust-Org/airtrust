import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const files = [
  'scripts/staging/validate-0489-preflight.sh',
  'scripts/staging/validate-0489-postconditions.sh',
  'scripts/schema-v2/validate-0489-production-preflight.sh',
  'scripts/schema-v2/validate-0489-production-postconditions.sh',
];

test('0489 metadata guards avoid LIKE against sqlite_master SQL', () => {
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /sql\s+LIKE\s+'%/i, file);
    assert.doesNotMatch(source, /LOWER\(sm\.sql\)\s+LIKE/i, file);
  }
});

test('0489 guards retain fail-closed index contract inspection', () => {
  const stagingPreflight = readFileSync(files[0], 'utf8');
  const productionPreflight = readFileSync(files[2], 'utf8');
  for (const source of [stagingPreflight, productionPreflight]) {
    assert.match(source, /tenant-index-contract:qualificacoes_tipos\.codigo/);
    assert.match(source, /createuniqueindexidx_qualificacoes_tipos_codigo_empresa_activeonqualificacoes_tipos\(empresa_id,codigocollatenocase\)wheredeleted_atisnull/);
    assert.match(source, /unexpected-global-natural-key-unique-indexes/);
    assert.match(source, /INSTR\(LOWER\(sm\.sql\), 'cpf'\)/);
  }

  for (const file of [files[1], files[3]]) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /cpf-index-contract/);
    assert.match(source, /matricula-index-contract/);
    assert.match(source, /email-index-contract/);
    assert.match(source, /INSTR\(LOWER\(COALESCE\(sql,''\)\), 'deleted_at is null'\)/);
    assert.match(source, /global-natural-key-unique-indexes/);
  }
});
