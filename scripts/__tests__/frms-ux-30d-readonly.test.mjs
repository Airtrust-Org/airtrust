// source_reference: audited FRMS UX 30-day readonly-source safety test (2026-10-13).
// operational_decision: exercise rejection of DML as *test strings*; never execute SQL.
// dry_run_required: not applicable; test is pure and has no database connection.
// rollback_plan_required: not applicable; no persistence or writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareSanitized30dAggregates, QUERIES, assertReadOnlyQuery, FROM, TO, disclosureBand } from '../production/frms-ux-30d-readonly.mjs';

test('read-only SQL never selects personal identifiers or raw health data', () => {
  for (const sql of Object.values(QUERIES)) {
    assertReadOnlyQuery(sql);
    assert.match(sql, /^SELECT /);
    assert.doesNotMatch(sql, /SELECT\s+(?:ch\.\*|j\.\*|a\.\*|f\.\*|f\.id|ch\.kss_score|ch\.horas_sono)/i);
  }
  assert.throws(() => assertReadOnlyQuery('DELETE FROM frms_jornada'), /ONLY_SELECT_PERMITTED/);
  assert.throws(() => assertReadOnlyQuery('SELECT x FROM y; DROP TABLE y'), /MUTATION_FORBIDDEN/);
});

test('fixed 30 days, no exposed small counts or employee records', () => {
  assert.equal(FROM, '2026-09-14');
  assert.equal(TO, '2026-10-13');
  const report = prepareSanitized30dAggregates({
    jornadas: [{ dia: FROM, n: 1 }, { dia: TO, n: 13 }],
    checkins: [{ dia: TO, n: 7 }],
    casos: [{ dia: TO, n: 2 }],
    voos: [{ dia: TO, n: 7 }],
  });
  assert.equal(report.days.length, 30);
  assert.equal(report.days[0].jornadas, '1-4');
  assert.equal(report.days[29].jornadas, '10-19');
  assert.equal(report.days[29].checkins, '5-9');
  assert.equal(report.days[29].casos, '1-4');
  assert.equal(report.days[20].jornadas, '0');
  assert.ok(!/funcionario_id|tripulante_id|email|cpf|password|kss_score|horas_sono/.test(JSON.stringify(report)));
  assert.equal(disclosureBand(4), '1-4');
  assert.throws(() => prepareSanitized30dAggregates({
    jornadas: [{ dia: FROM, n: 6 }, { dia: FROM, n: 6 }],
  }), /INVALID_OR_DUPLICATE/);
});

test('workflow executes only trusted main and accesses production secrets only in read-only job', () => {
  const wf = readFileSync(new URL('../../.github/workflows/frms-ux-30d-production-aggregate.yml', import.meta.url), 'utf8');
  assert.match(wf, /refs\/heads\/main/);
  assert.match(wf, /EXPECTED_SHA.*GITHUB_SHA/);
  assert.match(wf, /environment: production/);
  assert.match(wf, /permissions:\s*\n\s*contents: read/);
  assert.match(wf, /D1_MIGRATION_API_TOKEN/);
  assert.match(wf, /only safe aggregate bands/);
  assert.doesNotMatch(wf, /wrangler d1 execute|wrangler deploy|apply_migrations|migrations apply|pages deploy/);
});
