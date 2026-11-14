import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { GROUP_QUERIES, buildPlan, classifyCase } from '../production/lms-qualification-consistency-plan-readonly.mjs';

test('every group query is a single SELECT and the tool has no apply path', () => {
  for (const sql of Object.values(GROUP_QUERIES)) {
    assert.match(sql.trim(), /^SELECT\b/i);
    assert.doesNotMatch(sql, /;|\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|ATTACH|DETACH|PRAGMA)\b/i);
  }
  const source = fs.readFileSync(new URL('../production/lms-qualification-consistency-plan-readonly.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /--remote[^\n]*execute[^\n]*--file|\.run\(/);
  assert.match(source, /NO_APPLY_MODE/);
});

test('cancelled enrollment with live history is never proposed for deletion of the qualification', () => {
  const c = classifyCase('cancelled_with_live_history', {
    historico_status: 'CONCLUIDA',
    status_before_repair: 'CONCLUIDO',
    replacement_enrollments: 0,
  });
  assert.match(c.proposed, /RESTAURAR/);
  assert.match(c.proposed, /historico, SCORM e xAPI nao mudam/);
  assert.equal(c.needs_training_manager, true);
});

test('completion without history is never fabricated', () => {
  const legacy = classifyCase('completed_without_history', { course_generates_qualification: 0, course_has_type: 0 });
  assert.match(legacy.proposed, /NENHUMA ACAO/);
  const other = classifyCase('completed_without_history', { course_generates_qualification: 1, course_has_type: 1 });
  assert.match(other.proposed, /nunca fabricar/);
});

test('buildPlan reports counts and zero writes', () => {
  const plan = buildPlan({ pointer_to_deleted_history: [{ id: 5, curso_id: 2, other_live_history: 0 }] });
  assert.equal(plan.writes, 0);
  assert.equal(plan.groups.pointer_to_deleted_history.count, 1);
});
