import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('../../docs/lms/catalog/CATALOG_READONLY_BASELINE_20261017.json', import.meta.url),'utf8'));
test('baseline EAD conserva universo e classes sem fabricar certificacao', () => {
 assert.equal(manifest.audited_courses.length, 50);
 assert.equal(manifest.previous_catalog_snapshot.audited_course_count,45);
 for(const [kind,n] of [['EXACT_SAME_ZIP_SHA',38],['ZIP_SHA_CHANGED',2],['NOT_COMPARABLE_NO_HASH',3],['ABSENT_IN_OLDER_45',7]]) assert.equal(manifest.audited_courses.filter(c=>c.previous_catalog_sha_comparison===kind).length,n);
 assert.deepEqual(manifest.audited_courses.filter(c=>c.previous_catalog_sha_comparison==='ZIP_SHA_CHANGED').map(c=>c.course_id),[21,41]);
 assert.deepEqual(manifest.previous_catalog_snapshot.entries_in_older_catalog_not_in_later_active_audit.map(c=>c.course_id),[13,14]);
 assert.ok(manifest.audited_courses.every(c=>typeof c.catalog_title==='string' && c.catalog_title.trim().length>0));
 assert.equal(manifest.audited_courses.find(c=>c.course_id===22).content_type,'pptx');
 assert.equal(manifest.audited_courses.find(c=>c.course_id===23).completion_manifest_validated_in_preview,false);
 assert.equal(manifest.audited_courses.filter(c=>c.completion_manifest_validated_in_preview===true).length,46);
 assert.equal(manifest.workflow_target_company_id,6);
 assert.ok(manifest.audited_courses.every(c=>c.tenant_id===6));
 assert.equal(manifest.original_sources_22.length, 22);
 assert.equal(new Set(manifest.audited_courses.map(c=>c.course_id)).size,50);
 for (const [s,n] of [['PASS',25],['INCONCLUSIVE',22],['FAIL',3]]) {
   assert.equal(manifest.audited_courses.filter(c=>c.baseline_chromium===s&&c.baseline_webkit===s).length,n);
 }
 assert.equal(manifest.audited_courses.filter(c=>c.original_source_sha_match==='EXACT_MATCH_CONFIRMED_IN_PRIOR_RECONCILIATION').length,19);
 assert.equal(manifest.original_sources_22.filter(c=>c.exact_catalog_mapping==='NO_EXACT_SHA_MATCH_IN_AUDITED_50').length,3);
 assert.ok(manifest.audited_courses.every(c=>c.functional_certification==='NOT_CERTIFIED'));
 assert.ok(manifest.original_sources_22.every(c=>c.authorial_approval==='PENDING'));
 assert.ok(manifest.audited_courses.every(c=>!c.active_zip_sha256||/^[a-f0-9]{64}$/.test(c.active_zip_sha256)));
 assert.deepEqual(manifest.audited_courses.filter(c=>c.final_decision==='SOURCE_OR_PEDAGOGICAL_APPROVAL_REQUIRED').map(c=>c.course_id),[23,49,69]);
});
