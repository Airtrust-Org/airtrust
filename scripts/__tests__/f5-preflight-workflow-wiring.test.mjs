import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflow = readFileSync(fileURLToPath(new URL('../../.github/workflows/staging-scorm-f5-readiness.yml', import.meta.url)), 'utf8');
test('F5 preflight receives trusted dispatch and harness SHA before any private ZIP source', () => {
  const beginning = workflow.indexOf('      - name: Verify provisioned F0 runner contract before reading private ZIP');
  const materialization = workflow.indexOf('      - name: Verify exact original ZIP from protected staging secrets');
  assert.ok(beginning >= 0 && materialization > beginning);
  const block = workflow.slice(beginning, materialization);
  for (const field of [
    'GITHUB_SHA: ${{ github.sha }}',
    'GITHUB_REPOSITORY: ${{ github.repository }}',
    'GITHUB_REF: ${{ github.ref }}',
    'GITHUB_EVENT_NAME: ${{ github.event_name }}',
    'F5_RELEASE_SHA: ${{ inputs.release_sha }}',
    'F5_CONFIRMATION: ${{ inputs.confirmation }}',
    'F5_F0_ADAPTER_SHA256: ${{ steps.f0-mount.outputs.adapter_sha256 }}',
    'SCORM_QA_ACCESS_TOKEN: ${{ secrets.SCORM_QA_ACCESS_TOKEN }}',
  ]) assert.ok(block.includes(field), 'Missing ' + field.split(':')[0]);
  assert.ok(block.includes('node scripts/staging/f5-provisioned-execution-preflight.mjs'));
  assert.ok(workflow.indexOf('node scripts/staging/f5-provisioned-execution-preflight.mjs') < materialization);
});

test('protected staging bridge mounts the exact reviewed adapter and destroys temporary artifacts',()=>{
  const grant=workflow.indexOf('      - name: Verify exact single-candidate F0 authorization');
  const mount=workflow.indexOf('      - name: Materialize protected F0 plan and exact-checkout adapter');
  const preflight=workflow.indexOf('      - name: Verify provisioned F0 runner contract');
  const zip=workflow.indexOf('      - name: Verify exact original ZIP from protected staging secrets');
  assert.ok(grant>=0 && grant<mount && mount<preflight && preflight<zip);
  const block=workflow.slice(mount,preflight);
  for(const value of [
    'node scripts/staging/f5-materialize-private-runner.mjs',
    'F5_EXECUTOR_PLAN_B64: ${{ secrets.F5_EXECUTOR_PLAN_B64 }}',
    'F5_F0_ADAPTER_SOURCE: ${{ github.workspace }}/scripts/staging/f5-f0-adapters.mjs',
  ]) assert.ok(block.includes(value),'Required private mount missing');
  assert.ok(!block.includes('secrets.F5_F0_ADAPTER_B64'));
  assert.ok(!workflow.includes('vars.F5_EXECUTOR_PLAN_PATH'));
  assert.ok(!workflow.includes('vars.F5_F0_ADAPTER_MODULE'));
  for(const artifact of ['f5-executor-plan.json','f5-provisioned-f0-adapter.mjs'])
    assert.ok(workflow.includes('runner.temp }}/'+artifact));
  const cleanup=workflow.indexOf('      - name: Destroy temporary private candidate source');
  assert.ok(cleanup>zip);
  for(const artifact of ['f5-private-candidate.zip','f5-executor-plan.json',
    'f5-provisioned-f0-adapter.mjs','f5-mount.json'])
    assert.ok(workflow.slice(cleanup).includes(artifact));
});

test('R5 source is transferred privately only after grant and preflight, never by unmounted vars path', () => {
  const grant = workflow.indexOf('      - name: Verify exact single-candidate F0 authorization');
  const preflight = workflow.indexOf('      - name: Verify provisioned F0 runner contract');
  const source = workflow.indexOf('      - name: Fetch and hash exact private R5 ZIP on ephemeral runner');
  const execute = workflow.indexOf('      - name: Execute one inactive candidate through the pinned F0 adapters');
  assert.ok(grant >= 0 && grant < preflight && preflight < source && source < execute);
  const block = workflow.slice(source, execute);
  for (const required of [
    'node scripts/staging/f5-fetch-private-candidate.mjs',
    'F5_PRIVATE_ZIP_DOWNLOAD_URL: ${{ secrets.F5_PRIVATE_ZIP_DOWNLOAD_URL }}',
    'F5_PRIVATE_ZIP_ALLOWED_HOST: ${{ vars.F5_PRIVATE_ZIP_ALLOWED_HOST }}',
    'F5_PRIVATE_ZIP_PATH: ${{ runner.temp }}/f5-private-candidate.zip',
    "inputs.package_sha256 != '6240d3d143d9f01d46daea96fb1b37e5d8f2793e5b6980cadedb7bb73b8ac83a'",
  ]) assert.ok(block.includes(required), 'Missing protected transfer requirement');
  assert.ok(!workflow.includes('vars.F5_PRIVATE_ZIP_PATH'),
    'A path variable cannot materialize a private ZIP on GitHub-hosted runners');
  assert.ok(workflow.slice(execute).includes(
    'F5_PRIVATE_ZIP_PATH: ${{ runner.temp }}/f5-private-candidate.zip'));
  assert.ok(workflow.includes('      - name: Destroy temporary private candidate source'));
});
