// source_reference: production tenant-6 D1 audit event 2026-10-10 19:10:05 UTC (read-only).
// operational_decision: classify only 81 active mandatory role-qualified cancellations for governed restoration.
// dry_run_required: true; no apply mode, D1 mutation or notifications implemented here.
// rollback_plan_required: issue #1376; future production recovery must specify D1 Time Travel and compensating restoration.
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAudit, candidateHash } from '../production/audit-training-compliance-81-cancellations.mjs';

function makeRows() {
  let id = 0;
  const rows = [];
  const push = (code, originalStatus, n, applicable) => {
    for (let i = 0; i < n; i += 1) {
      rows.push({id: ++id, code, originalStatus, mandatoryApplicable: applicable ? 1 : 0,
        status: 'CANCELADO', cycleStatus: 'CANCELADO', cycleCount: 1});
    }
  };
  push('FDM-TRIPULACAO', 'CONCLUIDO', 9, true);
  push('FDM-TRIPULACAO', 'EM_ANDAMENTO', 1, true);
  push('FDM-TRIPULACAO', 'NAO_INICIADO', 1, true);
  push('MNT_MCQ', 'CONCLUIDO', 18, true);
  push('MNT_MCQ', 'NAO_INICIADO', 5, true);
  push('MNT_MGM', 'CONCLUIDO', 18, true);
  push('MNT_MGM', 'NAO_INICIADO', 5, true);
  push('MNT_MOM', 'CONCLUIDO', 20, true);
  push('MNT_MOM', 'NAO_INICIADO', 4, true);
  push('FDM_GATE', 'CONCLUIDO', 2, false);
  push('NR-26', 'CONCLUIDO', 3, false);
  push('NR-26', 'NAO_INICIADO', 10, false);
  return rows;
}
test('read-only audit captures exactly 81 eligible and preserves 5 completed and 10 unstarted', () => {
  const report = evaluateAudit(makeRows(), 0);
  assert.equal(report.event_total, 96);
  assert.equal(report.mandatory_restore_candidates, 81);
  assert.equal(report.original_status_counts.CONCLUIDO, 65);
  assert.equal(report.completed_awaiting_individual_review, 5);
  assert.equal(report.not_started_without_current_requirement, 10);
  assert.equal(report.writes_performed, false);
  assert.equal(report.email_sent, false);
  assert.equal(report.pii_emitted, false);
  assert.match(report.candidate_sha256, /^[0-9a-f]{64}$/);
});
test('candidate digest is deterministic and independent of input row order', () => {
  const source = makeRows().filter((row) => row.mandatoryApplicable);
  assert.equal(candidateHash(source), candidateHash(source.slice().reverse()));
});
test('audit fails closed on different event size, current states, duplicate and later writes', () => {
  const rows = makeRows();
  assert.throws(() => evaluateAudit(rows.slice(1), 0), /EVENT_COUNT_NOT_96/);
  assert.throws(() => evaluateAudit(rows, 1), /POST_EVENT_MUTATION_DETECTED/);
  const changed = structuredClone(rows);
  changed[0].status = 'CONCLUIDO';
  assert.throws(() => evaluateAudit(changed, 0), /MAT_CURRENT_STATE_CHANGED/);
  const cycle = structuredClone(rows);
  cycle[0].cycleCount = 2;
  assert.throws(() => evaluateAudit(cycle, 0), /CYCLE_NOT_UNIQUE/);
  const duplicates = structuredClone(rows);
  duplicates[1].id = duplicates[0].id;
  assert.throws(() => evaluateAudit(duplicates, 0), /EVENT_IDS_NOT_UNIQUE/);
});
test('audit never marks maintenance or flight training without active mandatory requirement', () => {
  const rows = makeRows();
  rows[0].mandatoryApplicable = 0;
  assert.throws(() => evaluateAudit(rows, 0), /UNCLASSIFIED_EVENT_ROW/);
});
