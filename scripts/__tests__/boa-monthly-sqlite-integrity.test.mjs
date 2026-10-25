/**
 * BOA monthly report: SQLite in-memory integration-test fixture only.
 * source_reference: worker-airtrust/migrations/0287_frms_fadiga_checkin_diario.sql
 * operational_decision: Test DML creates synthetic employee/event fixtures in :memory:;
 *   no operations on Cloudflare D1, production, staging, tenant 6 data or actual personnel.
 * dry_run_required: This script IS the offline dry run. It cannot address a remote DB.
 * rollback_plan_required: In-memory fixture is closed and discarded in finally;
 *   no persistent resource, migration, remote write or recovery action is necessary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const Module = require('node:module');
const root = fileURLToPath(new URL('../..', import.meta.url));
const file = join(root, 'worker-airtrust/src/lib/frms/bombeiros-monthly-management-report.ts');
const compiled = esbuild.buildSync({
  entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false,
});
const artifact = '/tmp/airtrust-boa-monthly-integration-test.cjs';
const internal = new Module(artifact);
internal.filename = artifact;
internal.paths = Module._nodeModulePaths(dirname(artifact));
internal._compile(compiled.outputFiles[0].text, artifact);
const { loadBoaMonthlyManagementPreview } = internal.exports;

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
      ativo INTEGER NOT NULL, deleted_at TEXT
    );
    CREATE TABLE frms_fadiga_evento (
      id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL,
      checkin_id TEXT, tipo TEXT NOT NULL, payload_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
  const addEmployee = sqlite.prepare('INSERT INTO funcionarios VALUES (?, ?, 1, NULL)');
  for (let id = 21; id <= 26; id++) addEmployee.run(id, 130);
  addEmployee.run(6, 6);
  const event = sqlite.prepare(
    'INSERT INTO frms_fadiga_evento VALUES (?, ?, ?, ?, ?, ?)',
  );
  const createdAt = '2026-10-12T10:00:00Z';
  for (const month of ['2026-09', '2026-10']) {
    for (let id = 21; id <= 26; id++) {
      const receipt = `${month}-receipt-${id}`, opened = `${month}-case-${id}`;
      const stamp = `${month}-12T10:00:00Z`;
      event.run(receipt, 130, receipt, 'BOA_CHECKIN_V1',
        JSON.stringify({ schema: 'BOA_CHECKIN_V1', funcionario_id: id,
          reference_date: `${month}-12`, submitted_at: stamp,
          dispatch_permission: 'NOT_GRANTED' }), stamp);
      event.run(opened, 130, receipt, 'BOA_CASE_OPENED_V1',
        JSON.stringify({ schema: 'BOA_CASE_OPENED_V1', funcionario_id: id,
          dispatch_permission: 'NOT_GRANTED' }), stamp);
    }
  }
  event.run('costadosol-receipt', 6, 'costadosol-receipt', 'BOA_CHECKIN_V1',
    JSON.stringify({ schema: 'BOA_CHECKIN_V1', funcionario_id: 6,
      reference_date: '2026-10-12', submitted_at: createdAt,
      dispatch_permission: 'NOT_GRANTED' }), createdAt);
  const d1 = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let params = [];
      return {
        bind(...args) { params = args; return this; },
        async first() { return stmt.get(...params) ?? null; },
      };
    },
  };
  return { sqlite, event, d1 };
}

const ids = new Set([21, 22, 23, 24, 25, 26]);
const treatment = {
  schema: 'FRMS_CASE_TREATMENT_V1',
  responsavel: 'Coordenação operacional BOA',
  prazo: '2026-10-30',
  acao_mitigacao: 'Rever duração da missão e verificar repouso adequado.',
  justificativa: 'O relato exige uma decisão humana antes do retorno.',
};
const closure = {
  schema: 'FRMS_CASE_RESOLUTION_V1',
  avaliacao_eficacia: 'Repouso documentado e decisão de escala conferida.',
};

test('BOA monthly event evidence is tenant-owned, consistent and fails closed under real SQLite', async () => {
  const { sqlite, event, d1 } = fixture();
  const query = () => loadBoaMonthlyManagementPreview(d1, 130, '2026-10', ids);
  const reject = async () => assert.rejects(query(),
    /BOA_MONTHLY_CASE_STREAM_INTEGRITY_ERROR/);
  try {
    const healthy = await query();
    assert.equal(healthy.current.participants, 6);
    assert.equal(healthy.current.checkin_receipts, 6);
    assert.equal(healthy.previous.checkin_receipts, 6);
    assert.equal(healthy.current.cases.awaiting_treatment, 6);
    assert.equal(healthy.receipt_delta, 0);
    assert.equal(JSON.stringify(healthy).includes('funcionario_id'), false);

    const original = sqlite.prepare(
      "SELECT payload_json FROM frms_fadiga_evento WHERE id='2026-10-case-21'",
    ).get().payload_json;
    const update = sqlite.prepare(
      'UPDATE frms_fadiga_evento SET payload_json = ? WHERE id = ?',
    );
    update.run(JSON.stringify({
      schema: 'BOA_CASE_OPENED_V1', funcionario_id: 6,
      dispatch_permission: 'NOT_GRANTED',
    }), '2026-10-case-21');
    await reject(); // Costa do Sol employee cannot be attributed to BOA receipt
    update.run(original, '2026-10-case-21');

    event.run('treat-21', 130, '2026-10-case-21', 'BOA_CASE_TREATMENT_V1',
      JSON.stringify({ schema: 'FRMS_CASE_TREATMENT_V1' }),
      '2026-10-13T10:00:00Z');
    await reject(); // Missing mitigation substance does not count as treatment
    update.run(JSON.stringify(treatment), 'treat-21');

    event.run('close-21', 130, '2026-10-case-21', 'BOA_CASE_CLOSED_V1',
      JSON.stringify({ schema: 'FRMS_CASE_RESOLUTION_V1',
        avaliacao_eficacia: 'curto' }), '2026-10-14T10:00:00Z');
    await reject(); // A closure without adequate efficacy evidence is invalid
    update.run(JSON.stringify(closure), 'close-21');

    sqlite.prepare(
      "UPDATE frms_fadiga_evento SET created_at='2026-10-13T09:00:00Z' WHERE id='close-21'",
    ).run();
    await reject(); // Closing before the mitigation is chronologically impossible
    sqlite.prepare(
      "UPDATE frms_fadiga_evento SET created_at='2026-10-14T10:00:00Z' WHERE id='close-21'",
    ).run();

    const suppressed = await query();
    assert.equal(suppressed.current.cases.privacy, 'SMALL_CELL_SUPPRESSED');
    assert.equal(suppressed.current.cases.closed_with_efficacy, null);

    for (let id = 22; id <= 26; id++) {
      event.run('treat-' + id, 130, '2026-10-case-' + id,
        'BOA_CASE_TREATMENT_V1', JSON.stringify(treatment),
        '2026-10-13T10:00:00Z');
      event.run('close-' + id, 130, '2026-10-case-' + id,
        'BOA_CASE_CLOSED_V1', JSON.stringify(closure),
        '2026-10-14T10:00:00Z');
    }
    const final = await query();
    assert.equal(final.current.cases.closed_with_efficacy, 6);
    assert.equal(final.current.cases.privacy, 'OBSERVED');
    assert.equal(final.provenance.signed, false);
  } finally {
    sqlite.close();
  }
});
