import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync('scripts/staging/lms-scorm-resume-readiness.mjs','utf8');
const workflow=readFileSync('.github/workflows/staging-scorm-resume-readiness.yml','utf8');
test('fail closed when a QA active package is unavailable or ambiguous',()=>{
 assert.match(code,/BLOCKED_NO_ACTIVE_QA_SCORM_PACKAGE/);
 assert.match(code,/BLOCKED_AMBIGUOUS_QA_SCORM_PACKAGE/);
 assert.match(code,/qa_examiner_training/);
 assert.match(code,/QA-PARTICIPANTE-ALFA/);
 assert.match(code,/sourceSha/);
 assert.match(code,/scorm-package-versions/);
 assert.doesNotMatch(code,/\/activate|\/scorm\/commit|method:'DELETE'/);
});
test('staging-only trusted main, mutex and no fixture mutation',()=>{
 assert.match(workflow,/refs\/heads\/main/);
 assert.match(workflow,/git merge-base --is-ancestor "\$RELEASE_SHA" HEAD/);
 assert.match(workflow,/environment: staging/);
 assert.match(workflow,/airtrust-staging-mutations-and-scorm-qa/);
 assert.match(workflow,/verify-release-gates.mjs/);
 assert.doesNotMatch(workflow,/wrangler d1 execute|pages deploy|migrations --apply/);
});