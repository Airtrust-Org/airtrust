import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-training-enrollment-cleanup.yml','utf8');
const script = readFileSync('scripts/production/cleanup-unstarted-training-enrollments.mjs','utf8');

test('production enrollment cleanup is exact-SHA, dry-run-first and recovery guarded', () => {
  assert.match(workflow, /EXPECTED_SHA.*GITHUB_SHA/s);
  assert.match(workflow, /reviewed_dry_run_run_id/);
  assert.match(workflow, /Capture D1 Time Travel recovery point/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /environment: production/);
});

test('cleanup criteria preserve any training evidence and emit no PII', () => {
  assert.match(script, /status,''\)\)='NAO_INICIADO'/);
  assert.match(script, /COALESCE\(m\.progresso_pct,0\)=0/);
  assert.match(script, /m\.data_inicio IS NULL/);
  assert.match(script, /NOT EXISTS \(SELECT 1 FROM lms_progresso_scorm/);
  assert.match(script, /NOT EXISTS \(SELECT 1 FROM lms_xapi_statements/);
  assert.match(script, /NOT EXISTS \(SELECT 1 FROM lms_completion_diagnostics_snapshots/);
  assert.match(script, /NOT EXISTS \(SELECT 1 FROM qualificacoes_historico/);
  assert.match(script, /pii_emitted: false/);
  assert.match(script, /PROTECTED_STATUS_CHANGED/);
  execFileSync('node',['--check','scripts/production/cleanup-unstarted-training-enrollments.mjs']);
});

test('apply binds to the exact reviewed candidate set', () => {
  assert.match(script, /TRAINING_ENROLLMENT_EXPECTED_COUNT/);
  assert.match(script, /TRAINING_ENROLLMENT_EXPECTED_HASH/);
  assert.match(script, /CANDIDATE_SET_CHANGED/);
  assert.match(script, /D1 meta\.changes includes trigger side effects/);
  assert.match(script, /APPLY_ENROLLMENT_POSTCOUNT_MISMATCH/);
  assert.doesNotMatch(script, /update\.meta\?\.changes/);
  assert.match(workflow, /production-training-enrollment-cleanup-dry-run-\$EXPECTED_SHA/);
});
