import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync('scripts/smoke-authenticated-operational.sh', 'utf8');

test('RDV production queue smoke is explicit opt-in and tenant-6 pinned', () => {
  assert.match(script, /AIRTRUST_RUN_RDV_QUEUE_SMOKE="${AIRTRUST_RUN_RDV_QUEUE_SMOKE:-NO}"/);
  assert.match(script, /AIRTRUST_EXPECTED_EMPRESA_ID" != "6"/);
  assert.match(script, //api/controle-voos/rdv/fila?limit=1/);
  assert.match(script, /run_request "RDV queue" "GET"/);
  assert.doesNotMatch(script, /run_request "RDV queue" "(POST|PUT|PATCH|DELETE)"/);
});
