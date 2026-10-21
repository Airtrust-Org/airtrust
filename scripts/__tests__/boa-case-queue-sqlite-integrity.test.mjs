/**
 * source_reference: worker-airtrust/migrations/0287_frms_fadiga_checkin_diario.sql
 * operational_decision: Offline SQLite :memory: synthetic BOA case-stream fixture;
 * no Cloudflare connection, no production or staging data, no remote credentials.
 * dry_run_required: The script is itself a local read/write simulation using
 * invented employees/events and the real application SQL.
 * rollback_plan_required: DatabaseSync :memory: is disposed in finally;
 * neither a persistent database nor a remote write is possible.
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
const file = join(root, 'worker-airtrust/src/lib/frms/bombeiros-operational-events.ts');
const built = esbuild.buildSync({
  entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false,
});
const artifact = '/tmp/airtrust-boa-queue-sqlite-qa.cjs';
const mod = new Module(artifact);
mod.filename = artifact;
mod.paths = Module._nodeModulePaths(dirname(artifact));
mod._compile(built.outputFiles[0].text, artifact);
const { loadBoaCaseQueue, registerBoaCaseAction } = mod.exports;

function dbFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, setor_id INTEGER,
      ativo INTEGER NOT NULL, deleted_at TEXT
    );
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY, deleted_at TEXT);
    CREATE TABLE usuarios_empresas (usuario_id INTEGER, empresa_id INTEGER);
    INSERT INTO usuarios VALUES (90, NULL);
    INSERT INTO usuarios_empresas VALUES (90, 130);
    CREATE TABLE frms_fadiga_evento (
      id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL,
      checkin_id TEXT, tipo TEXT NOT NULL, payload_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
  const person = sqlite.prepare('INSERT INTO funcionarios VALUES (?, ?, ?, 1, NULL)');
  person.run(21, 130, 9);
  person.run(22, 130, 10); // Same BOA, different managerial sector.
  person.run(6, 6, 9); // Existing Costa tenant must never appear.
  const add = sqlite.prepare('INSERT INTO frms_fadiga_evento VALUES (?, ?, ?, ?, ?, ?)');
  function insertCase(employee, tenant, prefix) {
    const receipt = prefix + '-receipt', caseId = prefix + '-case';
    add.run(receipt, tenant, receipt, 'BOA_CHECKIN_V1', JSON.stringify({
      schema: 'BOA_CHECKIN_V1', funcionario_id: employee,
      reference_date: '2026-10-20', dispatch_permission: 'NOT_GRANTED',
    }), '2026-10-20T08:00:00Z');
    add.run(caseId, tenant, receipt, 'BOA_CASE_OPENED_V1', JSON.stringify({
      schema: 'BOA_CASE_OPENED_V1', funcionario_id: employee,
      dispatch_permission: 'NOT_GRANTED', review_required: true,
    }), '2026-10-20T09:00:00Z');
  }
  insertCase(21, 130, 'boa');
  insertCase(22, 130, 'restricted');
  insertCase(6, 6, 'costa');
  const d1 = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let bindings = [];
      return {
        bind(...values) { bindings = values; return this; },
        async all() { return { results: stmt.all(...bindings) }; },
        async first() { return stmt.get(...bindings) ?? null; },
        async run() { const result = stmt.run(...bindings);
          return { meta: { changes: Number(result.changes) } }; },
      };
    },
  };
  return { sqlite, d1, add };
}
const scope = { mode: 'restricted', setorIds: [9], funcionarioId: null };
const validTreatment = {
  schema: 'FRMS_CASE_TREATMENT_V1', responsavel: 'Coordenador BOA',
  prazo: '2026-10-31',
  acao_mitigacao: 'Revisar o sobreaviso e a escala antes de retomar a missão.',
  justificativa: 'A ocorrência exige revisão e autorização humana independente.',
};
const validClosure = {
  schema: 'FRMS_CASE_RESOLUTION_V1',
  avaliacao_eficacia: 'Repouso verificado pelo responsável e nova escala analisada.',
};

test('BOA manager queue never labels a corrupt, offshore or premature case as resolved', async () => {
  const { sqlite, d1, add } = dbFixture();
  const fetch = () => loadBoaCaseQueue(d1, 130, scope);
  const fail = async () => assert.rejects(fetch(), /BOA_CASE_QUEUE_INTEGRITY_ERROR/);
  const patch = sqlite.prepare('UPDATE frms_fadiga_evento SET payload_json=? WHERE id=?');
  const patchTime = sqlite.prepare('UPDATE frms_fadiga_evento SET created_at=? WHERE id=?');
  try {
    const queue = await fetch();
    assert.deepEqual(queue.items.map(x => x.case_id), ['boa-case']);
    assert.equal(queue.items[0].state, 'ABERTO');
    assert.doesNotMatch(JSON.stringify(queue), /funcionario_id|kss|sono|pvt/i);
    await assert.rejects(loadBoaCaseQueue(d1, 6, scope), /BOMBEIROS_INVALID_TENANT/);

    patch.run(JSON.stringify({ schema: 'HELICOPTER_OFFSHORE',
      funcionario_id: 21, dispatch_permission: 'NOT_GRANTED' }), 'boa-case');
    await fail();
    patch.run(JSON.stringify({ schema: 'BOA_CASE_OPENED_V1',
      funcionario_id: 21, dispatch_permission: 'NOT_GRANTED' }), 'boa-case');

    add.run('treatment', 130, 'boa-case', 'BOA_CASE_TREATMENT_V1',
      JSON.stringify({ schema: 'FRMS_CASE_TREATMENT_V1' }), '2026-10-20T10:00:00Z');
    await fail();
    patch.run(JSON.stringify(validTreatment), 'treatment');
    assert.equal((await fetch()).items[0].state, 'EM_TRATAMENTO');

    add.run('closure', 130, 'boa-case', 'BOA_CASE_CLOSED_V1',
      JSON.stringify({ schema: 'FRMS_CASE_RESOLUTION_V1',
        avaliacao_eficacia: 'curto' }), '2026-10-20T11:00:00Z');
    await fail();
    patch.run(JSON.stringify(validClosure), 'closure');

    patchTime.run('2026-10-20T09:30:00Z', 'closure');
    await fail();
    patchTime.run('2026-10-20T11:00:00Z', 'closure');

    const final = await fetch();
    assert.deepEqual(final.items.map(x => x.case_id), ['boa-case']);
    assert.equal(final.items[0].state, 'RESOLVIDO');
    assert.equal(final.items[0].treatment_recorded, true);
  } finally {
    sqlite.close();
  }
});

test('BOA case append rechecks current manager membership and valid treatment in real SQLite', async () => {
  const { sqlite, d1 } = dbFixture();
  const addTreatment = () => registerBoaCaseAction(d1, 130, 'boa-case', 90, {
    responsavel: 'Coordenador BOA', prazo: '2026-10-31',
    acao_mitigacao: 'Revisar o sobreaviso e a escala antes de retomar a missão.',
    justificativa: 'A ocorrência exige revisão e autorização humana independente.',
  }, 'treatment', scope);
  const resolve = () => registerBoaCaseAction(d1, 130, 'boa-case', 90, {
    avaliacao_eficacia: 'Repouso verificado e escala reavaliada pelo responsável.',
  }, 'closure', scope);
  const count = () => sqlite.prepare(
    "SELECT COUNT(*) AS n FROM frms_fadiga_evento WHERE empresa_id=130 AND checkin_id='boa-case'",
  ).get().n;
  try {
    assert.equal(count(), 0);
    // The manager may have seen the case during the preflight.
    // The membership is revoked just before the SQL write.
    sqlite.exec('DELETE FROM usuarios_empresas WHERE usuario_id=90 AND empresa_id=130');
    assert.equal(await addTreatment(), 'NOT_ALLOWED');
    assert.equal(count(), 0);

    sqlite.exec('INSERT INTO usuarios_empresas VALUES (90,130)');
    assert.equal(await addTreatment(), 'RECORDED');
    assert.equal(count(), 1);
    assert.equal(await addTreatment(), 'NOT_ALLOWED');

    sqlite.exec('UPDATE usuarios SET deleted_at="2026-10-20" WHERE id=90');
    assert.equal(await resolve(), 'NOT_ALLOWED');
    assert.equal(count(), 1);
    sqlite.exec('UPDATE usuarios SET deleted_at=NULL WHERE id=90');

    // An invalid treatment must never permit a closure just because it exists.
    const t = sqlite.prepare(
      "SELECT id,payload_json FROM frms_fadiga_evento WHERE checkin_id='boa-case' AND tipo='BOA_CASE_TREATMENT_V1'",
    ).get();
    sqlite.prepare('UPDATE frms_fadiga_evento SET payload_json=? WHERE id=?')
      .run(JSON.stringify({ schema: 'FRMS_CASE_TREATMENT_V1' }), t.id);
    assert.equal(await resolve(), 'NOT_ALLOWED');
    assert.equal(count(), 1);
    sqlite.prepare('UPDATE frms_fadiga_evento SET payload_json=? WHERE id=?')
      .run(t.payload_json, t.id);
    assert.equal(await resolve(), 'RECORDED');
    assert.equal(count(), 2);
    assert.equal(await resolve(), 'NOT_ALLOWED');
    assert.equal(sqlite.prepare(
      'SELECT COUNT(*) AS n FROM frms_fadiga_evento WHERE empresa_id=6',
    ).get().n, 2);
  } finally {
    sqlite.close();
  }
});
