import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

test('LOSA RC5 confirmation, SHA and guarded production script match exact workflow', () => {
  const script = readFileSync(new URL('../production/lms-losa64-rc5-formative-external-release.mjs', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../../.github/workflows/production-lms-course64-losa-rc5-formative-external-replacement.yml', import.meta.url), 'utf8');
  const confirmation = 'AIRTRUST_TENANT6_COURSE64_LOSA_FORMATIVE_EXTERNAL_RC5_DIRECT';
  assert.match(script, /process\.env\.CONFIRMATION === 'AIRTRUST_TENANT6_COURSE64_LOSA_FORMATIVE_EXTERNAL_RC5_DIRECT'/);
  assert.ok(workflow.includes('[[ "$CONFIRMATION" == ' + confirmation + ' ]]'));
  assert.match(script, /X-Airtrust-External-Content-Policy': 'FORMATIVE'/);
  assert.match(script, /assessmentPolicy\) === 'FORMATIVE'/);
  assert.match(script, /examMode === 'EXTERNAL'/);
  assert.ok(script.includes('5d8cc147030e1944c2b728e074a2ac31422af98ddf5ed117a913f39d80974d7d'));
  assert.ok(script.includes('d2df555f03c12197a22386e8f9ad4ca2f9e2f7ee87924ea2cde8e80aa00325a9'));
  assert.ok(workflow.includes('course64-losa-rc5-formative-external-d2df555f-20261118.zip'));
});
