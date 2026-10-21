/**
 * BOA synthetic demo fixture — offline verification only.
 * source_reference: docs/frms/BOA_CBMMG_LICITACAO_POC_MATRIX_20261020.md
 * operational_decision: Verify 130 fictitious crew, append-only stream and
 * tenant-scoped monthly SQL with in-memory SQLite; never target D1 remotely.
 * dry_run_required: Entire test is in-memory and disposable.
 * rollback_plan_required: sqlite.close() destroys every generated row.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildBoaDemoDataset, bindBoaDemoEventRows, buildBoaTender130IdentityPlan } from '../fixtures/boa/boa-demo-dataset.mjs';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const Module = require('node:module');
const root = fileURLToPath(new URL('../..', import.meta.url));
const reportFile = join(root, 'worker-airtrust/src/lib/frms/bombeiros-monthly-management-report.ts');
const compiled = esbuild.buildSync({
  entryPoints: [reportFile], bundle: true, platform: 'node', format: 'cjs', write: false,
});
const artifact = '/tmp/airtrust-boa-synthetic-demo-monthly-test.cjs';
const localModule = new Module(artifact);
localModule.filename = artifact;
localModule.paths = Module._nodeModulePaths(dirname(artifact));
localModule._compile(compiled.outputFiles[0].text, artifact);
const { loadBoaMonthlyManagementPreview } = localModule.exports;

function bindings(dataset) {
  const employeeIds = Object.fromEntries(dataset.crew.map((crew, index) => [crew.ref, 2001 + index]));
  const actors = [
    ...dataset.crew.map(crew => crew.user_ref),
    ...dataset.managers.map(manager => manager.ref), dataset.admin.ref,
  ];
  const userIds = Object.fromEntries(actors.map((ref, index) => [ref, 4001 + index]));
  const policyRevision = {
    approved: true, profile_code: 'FIREFIGHTER_AVIATION',
    revision_id: 'APPROVAL-IS-TEST-FIXTURE-ONLY', policy_version: 'DEMO-NOT-SCIENTIFICALLY-VALIDATED',
  };
  return { tenantId: 3130, employeeIds, userIds, policyRevision };
}

test('dataset consists only of 130 clearly fictitious crew and stable two-month scenarios', () => {
  const a = buildBoaDemoDataset();
  const b = buildBoaDemoDataset();
  assert.deepEqual(a, b);
  assert.equal(a.metadata.tenant_id, null);
  assert.equal(a.metadata.no_network_or_database_write, true);
  assert.equal(a.metadata.dispatch_permission, 'NOT_GRANTED');
  assert.equal(a.crew.length, 130);
  assert.equal(a.sectors.length, 4);
  assert.equal(a.managers.length, 4);
  assert.equal(a.missions.length, 280);
  assert.equal(a.events.length, 839);
  assert.equal(new Set(a.crew.map(x => x.ref)).size, 130);
  assert.ok(a.crew.every(x => x.nome.startsWith('TRIPULANTE TOTALMENTE FICTICIO ')));
  assert.ok(a.crew.every(x => x.cargo === 'BOMBEIRO MILITAR' && x.profile_expected === 'flight'));
  assert.ok(a.events.every(x => x.payload_template.dispatch_permission === 'NOT_GRANTED'
    || x.tipo === 'BOA_CASE_TREATMENT_V1' || x.tipo === 'BOA_CASE_CLOSED_V1'));
  assert.ok(a.events.some(x => x.tipo === 'BOA_CHECKIN_V1'
    && x.payload_template.sleep_hours_24h === null));
  assert.deepEqual(a.expected['2026-09'], {
    participants: 100, receipts: 100, ABERTO: 34, EM_TRATAMENTO: 33, RESOLVIDO: 33,
  });
  assert.deepEqual(a.expected['2026-10'], {
    participants: 120, receipts: 180, ABERTO: 60, EM_TRATAMENTO: 60, RESOLVIDO: 60,
  });
  assert.equal(a.crew.length - a.expected['2026-10'].participants, 10);
});

test('official sizing is 130 user roles total, not 130 crew plus supervisors', () => {
  const dataset = buildBoaDemoDataset();
  const plan = buildBoaTender130IdentityPlan(dataset);
  assert.equal(plan.count, 130);
  assert.deepEqual([plan.crew_count, plan.manager_count, plan.admin_count], [125, 4, 1]);
  assert.equal(plan.official_provisioned_users, 0);
  assert.equal(plan.authentication_ready, false);
  assert.equal(plan.accounts.length, 130);
  assert.equal(new Set(plan.accounts.map(x => x.ref)).size, 130);
  assert.equal(plan.accounts.filter(x => x.role === 'tripulante').length, 125);
  assert.equal(plan.accounts.filter(x => x.role === 'gestor').length, 4);
  assert.equal(plan.accounts.filter(x => x.role === 'administrador').length, 1);
  assert.ok(plan.accounts.every(x => x.credentials_provisioned === false));
  assert.ok(plan.accounts.every(x => !('token' in x || 'password' in x)));
  assert.ok(dataset.events.every(x => plan.accounts.some(a =>
    a.ref === x.actor_ref || a.employee_ref === x.crew_ref)));
  assert.equal(dataset.events.length, 839);
  const tampered = structuredClone(dataset);
  tampered.events[0].crew_ref = dataset.crew[129].ref;
  assert.throws(() => buildBoaTender130IdentityPlan(tampered), /EVENT_ACTOR_NOT_COVERED/);
});

test('bind requires isolated synthetic tenant, distinct actor identities and explicit approved-profile evidence', () => {
  const dataset = buildBoaDemoDataset();
  const values = bindings(dataset);
  assert.throws(() => bindBoaDemoEventRows(dataset, { ...values, tenantId: 6 }), /ISOLATED_TENANT_REQUIRED/);
  assert.throws(() => bindBoaDemoEventRows(dataset, { ...values, tenantId: 0 }), /ISOLATED_TENANT_REQUIRED/);
  assert.throws(() => bindBoaDemoEventRows(dataset, {
    ...values, employeeIds: { ...values.employeeIds, [dataset.crew[0].ref]: 0 },
  }), /EMPLOYEE_MAP_INVALID/);
  assert.throws(() => bindBoaDemoEventRows(dataset, {
    ...values, userIds: { ...values.userIds, [dataset.crew[0].user_ref]: values.userIds[dataset.crew[1].user_ref] },
  }), /USER_MAP_INVALID/);
  assert.throws(() => bindBoaDemoEventRows(dataset, {
    ...values, policyRevision: { ...values.policyRevision, approved: false },
  }), /POLICY_APPROVAL_REQUIRED/);
  const events = bindBoaDemoEventRows(dataset, values);
  assert.equal(events.length, 839);
  assert.ok(events.every(event => event.empresa_id === 3130 && event.id.startsWith('BOA-DEMO-')));
  assert.ok(events.every(event => event.tipo === 'BOA_CHECKIN_V1'
    ? JSON.parse(event.payload_json).funcionario_id > 0 : true));
  assert.ok(events.every(event => event.checkin_id && event.created_at));
});

test('real SQLite monthly BOA query consumes synthetic events without disclosure or offshore contamination', async () => {
  const fixture = buildBoaDemoDataset();
  const values = bindings(fixture);
  const events = bindBoaDemoEventRows(fixture, values);
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(
      'CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, ativo INTEGER, deleted_at TEXT);' +
      'CREATE TABLE frms_fadiga_evento (id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, ' +
      'checkin_id TEXT, tipo TEXT NOT NULL, payload_json TEXT, created_at TEXT NOT NULL);'
    );
    const person = sqlite.prepare('INSERT INTO funcionarios VALUES (?, ?, 1, NULL)');
    for (const id of Object.values(values.employeeIds)) person.run(id, 3130);
    person.run(6, 6);
    const event = sqlite.prepare('INSERT INTO frms_fadiga_evento VALUES (?, ?, ?, ?, ?, ?)');
    for (const row of events) {
      event.run(row.id, row.empresa_id, row.checkin_id, row.tipo, row.payload_json, row.created_at);
    }
    event.run('COSTA-SENTINEL', 6, 'COSTA-SENTINEL', 'BOA_CHECKIN_V1',
      JSON.stringify({ schema: 'BOA_CHECKIN_V1', funcionario_id: 6,
        reference_date: '2026-10-06', submitted_at: '2026-10-06T08:00:00Z',
        dispatch_permission: 'NOT_GRANTED' }), '2026-10-06T08:00:00Z');
    const db = { prepare(sql) {
      const statement = sqlite.prepare(sql);
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() { return statement.get(...params) ?? null; },
      };
    } };
    const allowed = new Set(Object.values(values.employeeIds));
    const report = await loadBoaMonthlyManagementPreview(db, 3130, '2026-10', allowed);
    assert.equal(report.current.participants, 120);
    assert.equal(report.current.checkin_receipts, 180);
    assert.deepEqual([
      report.current.cases.awaiting_treatment, report.current.cases.under_treatment,
      report.current.cases.closed_with_efficacy,
    ], [60, 60, 60]);
    assert.equal(report.current.cases.privacy, 'OBSERVED');
    assert.equal(report.previous.participants, 100);
    assert.equal(report.previous.checkin_receipts, 100);
    assert.deepEqual([
      report.previous.cases.awaiting_treatment, report.previous.cases.under_treatment,
      report.previous.cases.closed_with_efficacy,
    ], [34, 33, 33]);
    assert.equal(report.receipt_delta, 80);
    assert.equal(report.coverage, 'NOT_DETERMINABLE_WITHOUT_ROSTER');
    assert.equal(report.provenance.signed, false);
    assert.doesNotMatch(JSON.stringify(report), /TRIPULANTE TOTALMENTE FICTICIO|funcionario_id|kss_reported|sleep_hours_24h/);
    await assert.rejects(
      loadBoaMonthlyManagementPreview(db, 6, '2026-10', allowed), /BOA_REPORT_TENANT_REQUIRED/,
    );
    sqlite.prepare("UPDATE frms_fadiga_evento SET payload_json = ? WHERE id = ?")
      .run(JSON.stringify({ schema: 'BOA_CASE_OPENED_V1', funcionario_id: 6,
        dispatch_permission: 'NOT_GRANTED' }), 'BOA-DEMO-202610-001-CAS');
    await assert.rejects(
      loadBoaMonthlyManagementPreview(db, 3130, '2026-10', allowed),
      /BOA_MONTHLY_CASE_STREAM_INTEGRITY_ERROR/,
    );
  } finally {
    sqlite.close();
  }
});
