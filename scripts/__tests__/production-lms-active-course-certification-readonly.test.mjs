import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const SCRIPT = 'scripts/validation/production-lms-active-course-certification-readonly.mjs';
const WORKFLOW = '.github/workflows/production-lms-active-course-certification-readonly.yml';

test('production active-course certifier is preview/read-only and exact-package aware', () => {
  const source = read(SCRIPT);
  assert.match(source, /assertAllowedProductionBaseUrl/);
  assert.match(source, /EXPECTED_PRODUCTION_SHA/);
  assert.match(source, /\/api\/lms\/cursos\/\$\{id\}\/scorm-package-versions/);
  assert.match(source, /status\s*\|\|\s*''\)\.toUpperCase\(\)\s*===\s*'ACTIVE'/);
  assert.match(source, /packageSha256/);
  assert.match(source, /\/api\/lms\/assets\/session/);
  assert.match(source, /preview:\s*true/);
  assert.match(source, /\/api\/lms\/scorm\/preview\/\$\{course\.id\}/);
  assert.match(source, /COMPLETION_NOT_REACHED/);
  assert.match(source, /reopen-completed/);
  assert.match(source, /locator\('#scorm-frame'\)/);
  assert.match(source, /contentFrame\(\)/);
  assert.match(source, /waitForURL/);
  assert.match(source, /CERT_COURSE_IDS/);
  assert.match(source, /summarizeStalledSlide/);
  assert.match(source, /captureVisibleControls/);
  assert.match(source, /visible_controls/);
  assert.match(source, /isProductChrome/);
  assert.match(source, /content-toggle/);
  assert.match(source, /content-choice/);
  assert.match(source, /submit-after-choice/);
  assert.match(source, /airtrustCertClicked/);
  assert.match(source, /interactionsValid/);
  assert.doesNotMatch(source, /interactions\.length\s*>\s*0/);
  assert.match(source, /calls_after_finish/);
  assert.match(source, /completion_reached/);
  assert.match(source, /chromium/);
  assert.match(source, /webkit/);

  assert.doesNotMatch(source, /\/api\/lms\/matriculas\/scorm\/commit/);
  assert.doesNotMatch(source, /method:\s*['"](?:PUT|DELETE|PATCH)['"]/);
  assert.doesNotMatch(source, /wrangler\s+(?:deploy|d1|r2)/i);
});

test('production certification workflow is governed, online-triggerable, SHA-pinned, secret-scoped and evidence-preserving', () => {
  const workflow = read(WORKFLOW);
  assert.match(workflow, /issue_comment:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /course_ids:/);
  assert.match(workflow, /COMMENT_ACTOR_MISMATCH/);
  assert.match(workflow, /COMMENT_COMMAND_MUST_BE_SINGLE_LINE/);
  assert.match(workflow, /COMMENT_COMMAND_INVALID/);
  assert.match(workflow, /COURSE_IDS_INVALID/);
  assert.match(workflow, /PR_FROM_FORK_REJECTED/);
  assert.match(workflow, /ACTOR_PERMISSION_INSUFFICIENT/);
  assert.match(workflow, /needs\.guard\.outputs\.course_ids/);
  assert.match(workflow, /CERT_COURSE_IDS/);
  assert.doesNotMatch(workflow, /\bpush:/);
  assert.doesNotMatch(workflow, /\bpull_request:/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_LMS_ACTIVE_CERTIFICATION_READONLY/);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /api\.airtrust\.online\/api\/version/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /secrets\.PROD_SMOKE_EMAIL/);
  assert.match(workflow, /secrets\.PROD_SMOKE_PASSWORD/);
  assert.match(workflow, /matrix:\s*\n\s*browser:\s*\[chromium, webkit\]/);
  assert.match(workflow, /production-lms-active-course-certification-readonly\.mjs/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /Enforce zero certification failures/);

  assert.doesNotMatch(workflow, /CLOUDFLARE_(?:WORKER|PAGES|D1|API)_/);
  assert.doesNotMatch(workflow, /wrangler\s+(?:deploy|d1|r2)/i);
});
