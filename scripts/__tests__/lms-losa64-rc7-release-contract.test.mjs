import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

test('LOSA RC7 exact package and protected activation contract', () => {
  const script = readFileSync(new URL('../production/lms-losa64-rc7-formative-external-release.mjs', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../../.github/workflows/production-lms-course64-losa-rc7-m8-gated-replacement.yml', import.meta.url), 'utf8');
  const confirmation = 'AIRTRUST_TENANT6_COURSE64_LOSA_FORMATIVE_EXTERNAL_RC7_DIRECT';
  assert.ok(script.includes("process.env.CONFIRMATION === '" + confirmation + "'"));
  assert.ok(workflow.includes('[[ "$CONFIRMATION" == ' + confirmation + ' ]]'));
  assert.ok(script.includes("'X-Airtrust-External-Content-Policy': 'FORMATIVE'"));
  assert.ok(script.includes("'X-Airtrust-Require-No-Enrollments': 'true'"));
  assert.ok(script.includes("detail.scorm_assessment_policy === 'FORMATIVE'"));
  assert.match(script, /assessmentPolicy\) === 'FORMATIVE'/);
  assert.ok(script.includes("data.examMode === 'EXTERNAL'"));
  assert.ok(script.includes('d2df555f03c12197a22386e8f9ad4ca2f9e2f7ee87924ea2cde8e80aa00325a9'));
  assert.ok(script.includes('067e57e0266fabd1adb21773efd34b325aa57d21b26547fd40542415b8fcfe9f'));
  assert.ok(workflow.includes('course64-losa-rc7-067e57e0-20261118.zip'));
  assert.ok(workflow.includes('LOSA64_ZERO_ENROLLMENTS_CONFIRMED'));
  assert.ok(workflow.includes('verify-release-gates.mjs'));
});
