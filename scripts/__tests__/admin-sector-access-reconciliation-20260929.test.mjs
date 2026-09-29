// source_reference: test contract for the reviewed 2026-09-29 admin sector-access reconciliation.
// operational_decision: verify additive tenant-scoped RBAC repair without executing production DML.
// dry_run_required: production mutation remains gated by the workflow dry-run predecessor.
// rollback_plan_required: production workflow must capture D1 Time Travel before apply.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const script = await readFile(new URL('../production/reconcile-admin-all-sector-access-20260929.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../../.github/workflows/production-admin-sector-access-reconciliation-20260929.yml', import.meta.url), 'utf8');

test('repair is tenant-scoped, additive, and preserves admin role/profile', () => {
  assert.match(script, /const EMPRESA_ID = 6/);
  assert.match(script, /TARGET_NOT_ADMIN/);
  assert.match(script, /TARGET_ADMIN_PROFILE_MISSING/);
  assert.match(script, /INSERT INTO setores_gestores/);
  assert.doesNotMatch(script, /UPDATE setores_gestores\s+SET deleted_at/i);
  assert.doesNotMatch(script, /DELETE FROM setores_gestores/i);
  assert.doesNotMatch(script, /UPDATE usuarios_empresas/i);
  assert.doesNotMatch(script, /UPDATE usuarios_empresas_perfis/i);
});

test('candidate identity includes target and exact missing sector', () => {
  assert.match(script, /target:\$\{targetUserId\}:assign-sector:\$\{sectorId\}/);
  assert.match(script, /CANDIDATE_SET_CHANGED/);
  assert.match(script, /POST_MISSING_ACTIVE_ASSIGNMENTS/);
});


test('sanitized candidate hash can resolve exactly one reviewed admin without emitting an id', () => {
  assert.match(script, /ADMIN_SECTOR_TARGET_CANDIDATE_HASH/);
  assert.match(script, /eligible_admins_for_candidate_hash/);
  assert.match(script, /TARGET_CANDIDATE_HASH_MATCH_COUNT_/);
  assert.match(workflow, /target_candidate_hash:/);
  assert.match(workflow, /TARGET_SELECTOR_AMBIGUOUS/);
  assert.match(workflow, /ADMIN_SECTOR_TARGET_CANDIDATE_HASH/);
});

test('production workflow requires exact SHA, release gates, reviewed dry-run, and recovery point', () => {
  assert.match(workflow, /Verify official release gates on exact SHA/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /REVIEWED_DRY_RUN_SHA_MISMATCH/);
  assert.match(workflow, /d1 time-travel info/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
});

test('sanitized evidence never emits target user id', () => {
  const publish = workflow.slice(workflow.indexOf('- name: Publish sanitized summary'));
  assert.doesNotMatch(publish, /target_user_id/);
  assert.match(script, /pii_emitted: false/);
});
