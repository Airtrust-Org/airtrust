import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

test('0546 production and staging schema ledgers use exactly the reviewed canonical change identifiers', () => {
 const expectedChangeId='training-compliance-canonical-category-repair-0546';
 const expectedFilename='0546_training_compliance_canonical_category_repair.sql';
 const manifest=JSON.parse(readFileSync('worker-airtrust/schema-v2/training-compliance-canonical-category-repair-0546.json','utf8'));
 assert.equal(manifest.changeId,expectedChangeId);
 assert.equal(manifest.filePath,'worker-airtrust/schema-v2/changes/'+expectedFilename);
 for(const path of [
  'scripts/schema-v2/validate-0546-production-preflight.sh',
  'scripts/schema-v2/validate-0546-production-postconditions.sh'
 ]) {
  const sql=readFileSync(path,'utf8');
  assert.ok(sql.includes("change_id='"+expectedChangeId+"'"),path);
  assert.doesNotMatch(sql,/training-compliance-canonical-pdf-alignment-0546/);
  assert.ok(sql.includes("training-compliance-canonical-pdf-alignment-0545"),'must detect unapplied 0545');
 }
 for(const path of [
  'scripts/staging/validate-0546-preflight.sh',
  'scripts/staging/validate-0546-postconditions.sh'
 ]) {
  const sql=readFileSync(path,'utf8');
  assert.ok(sql.includes("name='"+expectedFilename+"'"),path);
  assert.doesNotMatch(sql,/0546_training_compliance_canonical_pdf_alignment\.sql/);
  assert.ok(sql.includes("0545_training_compliance_canonical_pdf_alignment.sql"),'must detect unapplied 0545');
 }
});

test('post-release Compliance workflow validates D1 0546 without rewriting the already-applied migration', () => {
 const flow=readFileSync('.github/workflows/production-training-compliance-readonly-smoke.yml','utf8');
 assert.match(flow, /Production Compliance 0546 D1 Postconditions \(read-only\)/);
 assert.ok(flow.includes('bash scripts/schema-v2/validate-0546-production-postconditions.sh --target=airtrust-db'));
 assert.ok(flow.includes('needs: [guard, schema, browser]'));
 assert.ok(flow.includes('needs.schema.result'));
 assert.ok(flow.includes('CLOUDFLARE_D1_MIGRATION_API_TOKEN'));
 assert.doesNotMatch(flow, /wrangler d1 execute[\s\S]*?--command/);
 const post=readFileSync('scripts/schema-v2/validate-0546-production-postconditions.sh','utf8');
 assert.ok(post.includes('TRAINING_COMPLIANCE_0546_POSTCONDITIONS=PASS'));
 assert.ok(post.includes('nr05-designated'));
 assert.ok(post.includes('nr05-universal'));
 assert.ok(post.includes('regras-ouro-active'));
});
