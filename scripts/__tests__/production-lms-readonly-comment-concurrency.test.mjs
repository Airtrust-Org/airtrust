import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(path.join(root, '.github/workflows/production-lms-active-course-certification-readonly.yml'), 'utf8');
const group = source.match(/^  group: (.+)$/m)?.[1] || '';

test('unrelated issue comments never evict a pending governed read-only course QA run', () => {
  assert.match(group, /github\.event_name == 'issue_comment'/);
  assert.match(group, /!startsWith\(github\.event\.comment\.body, 'AIRTRUST_PRODUCTION_LMS_ACTIVE_CERTIFICATION_READONLY '\)/);
  assert.match(group, /github\.run_id/);
  assert.match(group, /\|\| 'production-lms-active-course-certification-readonly'/);
  assert.match(source, /cancel-in-progress: false/);
});

test('actual read-only QA requests retain guarded main-only and exact SHA requirements', () => {
  assert.match(source, /github\.event_name != 'issue_comment' \|\|/);
  assert.match(source, /startsWith\(github\.event\.comment\.body, 'AIRTRUST_PRODUCTION_LMS_ACTIVE_CERTIFICATION_READONLY '\)/);
  assert.match(source, /\[\[ "\$GITHUB_REF" == 'refs\/heads\/main' \]\]/);
  assert.match(source, /EXPECTED_SHA/);
  assert.match(source, /verify-release-gates\.mjs/);
});
