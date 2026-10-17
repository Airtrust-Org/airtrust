import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { canonicalPairs, coverageSQL } from '../staging/verify-0546-staging-applicability.mjs';

test('staging 0546 canonical applicability is exact and read-only', () => {
  const sql=readFileSync('worker-airtrust/schema-v2/changes/0546_training_compliance_canonical_category_repair.sql','utf8');
  const pairs=canonicalPairs(sql);
  assert.equal(pairs.length,68);
  const q=coverageSQL(pairs);
  assert.match(q,/missing_or_duplicate/);
  assert.match(q,/empresa_id=6/);
  assert.match(q,/tr\.ativo=1/);
  assert.match(q,/tr\.obrigatoriedade='OBRIGATORIA'/);
  assert.doesNotMatch(q,/\b(?:UPDATE|DELETE|INSERT|DROP)\b/i);
});
