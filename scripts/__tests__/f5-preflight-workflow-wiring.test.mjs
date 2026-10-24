import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflow = readFileSync(fileURLToPath(new URL('../../.github/workflows/staging-scorm-f5-readiness.yml', import.meta.url)), 'utf8');
test('F5 preflight receives trusted dispatch and harness SHA before any private ZIP source', () => {
  const beginning = workflow.indexOf('      - name: Verify provisioned F0 runner contract before reading private ZIP');
  const end = workflow.indexOf('      - name:', beginning + 13);
  const materialization = workflow.indexOf('      - name: Verify exact original ZIP from protected staging secrets');
  assert.ok(beginning >= 0 && end > beginning && materialization > end);
  const block = workflow.slice(beginning, end);
  for (const field of [
    'GITHUB_SHA: ${{ github.sha }}',
    'GITHUB_REPOSITORY: ${{ github.repository }}',
    'GITHUB_REF: ${{ github.ref }}',
    'GITHUB_EVENT_NAME: ${{ github.event_name }}',
    'F5_RELEASE_SHA: ${{ inputs.release_sha }}',
    'F5_CONFIRMATION: ${{ inputs.confirmation }}',
    'F5_F0_ADAPTER_SHA256: ${{ vars.F5_F0_ADAPTER_SHA256 }}',
    'SCORM_QA_ACCESS_TOKEN: ${{ secrets.SCORM_QA_ACCESS_TOKEN }}',
  ]) assert.ok(block.includes(field), 'Missing ' + field.split(':')[0]);
  assert.ok(block.includes('node scripts/staging/f5-provisioned-execution-preflight.mjs'));
  assert.ok(workflow.indexOf('node scripts/staging/f5-provisioned-execution-preflight.mjs') < materialization);
});
