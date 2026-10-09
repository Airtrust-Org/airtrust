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
