import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = 'worker-airtrust/migrations/0438_controle_voos_rdv_coordenacao_workflow.sql';

test('apply-migration-production blocks raw 0438 execution', () => {
  const result = spawnSync('bash', ['scripts/apply-migration-production.sh', migration], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AIRTRUST_ALLOW_PROD_DB_WRITE: 'YES',
      AIRTRUST_CONFIRM_PROD_DB_WRITE: 'I understand this may modify production data',
    },
  });

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;

  assert.equal(result.status, 4);
  assert.match(output, /0438 must not be applied via raw d1 execute/);
  assert.match(output, /0438-rdv-coordination-workflow-production\.md/);
  assert.match(output, /\.github\/workflows\/apply-schema-change-v2\.yml/);
  assert.doesNotMatch(output, /Proceeding with production migration execution/);
});
