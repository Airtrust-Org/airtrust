/**
 * source_reference: worker-airtrust/migrations/0287_frms_fadiga_checkin_diario.sql
 * operational_decision: Synthetic BOA crew membership and event stream on
 * SQLite :memory: only, to reproduce a revoked user/tenant association between
 * identity lookup and the actual conditional check-in INSERT.
 * dry_run_required: This test IS the offline dry run. No remote D1 endpoint.
 * rollback_plan_required: All SQLite fixtures remain in memory and the
 * database is always closed, without any remote effect.
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
const compiled = esbuild.buildSync({
  entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false,
});
const path = '/tmp/airtrust-boa-membership-qa.cjs';
const moduleForTest = new Module(path);
moduleForTest.filename = path;
moduleForTest.paths = Module._nodeModulePaths(dirname(path));
moduleForTest._compile(compiled.outputFiles[0].text, path);
const { resolveBoaCrewIdentity, registerBoaCheckin, loadBoaCrewCheckinStatus } = moduleForTest.exports;

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
      cargo TEXT, funcao TEXT, setor_id INTEGER, ativo INTEGER NOT NULL,
      deleted_at TEXT, status TEXT
    );
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY, funcionario_id INTEGER, deleted_at TEXT
    );
    CREATE TABLE usuarios_empresas (
      usuario_id INTEGER NOT NULL, empresa_id INTEGER NOT NULL
    );
    CREATE TABLE frms_fadiga_evento (
      id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL,
      checkin_id TEXT, tipo TEXT NOT NULL, payload_json TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO funcionarios VALUES
      (21, 130, 'Bombeiro Militar', 'Operador Aerotático', 9, 1, NULL, 'ATIVO'),
      (6, 6, 'Piloto', 'Piloto', 9, 1, NULL, 'ATIVO');
    INSERT INTO usuarios VALUES (101, 21, NULL), (106, 6, NULL);
    INSERT INTO usuarios_empresas VALUES (101, 130), (106, 6);
  `);
  const d1 = {
    prepare(sql) {
      const args = [];
      const statement = {
        sql,
        bind(...values) { args.splice(0, args.length, ...values); return this; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() {
          const result = sqlite.prepare(sql).run(...args);
          return { meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, d1 };
}

const input = {
  mission_type: 'RESGATE',
  duty_period: 'NOTURNO',
  standby_activation: true,
  critical_mission: true,
  sleep_hours_24h: 4,
  sleep_fragmented: true,
  kss_reported: 8,
  pvt_60s_completed: null,
  self_declared_unfit: true,
  acknowledge_confidentiality: true,
};
const policy = {
  profile_code: 'FIREFIGHTER_AVIATION',
  revision_id: 'boa-synthetic-approved-r1',
  policy_version: 'synthetic-test-v1',
};

test('BOA D1 conditional write refuses revoked membership, returns 403-equivalent result not false duplicate', async () => {
  const { sqlite, d1 } = fixture();
  const collect = date => registerBoaCheckin(d1, 130, 21, 101, date, input, policy);
  const eventCount = () => sqlite.prepare('SELECT COUNT(*) AS n FROM frms_fadiga_evento').get().n;
  try {
    assert.equal(await resolveBoaCrewIdentity(d1, 130, 101), 21);
    assert.equal(await resolveBoaCrewIdentity(d1, 130, 106), null);
    // Identity preflight succeeds; membership is revoked before the DB write.
    sqlite.exec('DELETE FROM usuarios_empresas WHERE usuario_id = 101 AND empresa_id = 130');
    const revoked = await collect('2026-10-20');
    assert.equal(revoked.accepted, false);
    assert.equal(revoked.status, 'RECHECK_DENIED');
    assert.equal(revoked.dispatch_permission, 'NOT_GRANTED');
    assert.equal(eventCount(), 0);

    sqlite.exec('INSERT INTO usuarios_empresas VALUES (101, 130)');
    const accepted = await collect('2026-10-20');
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.status, 'HUMAN_REVIEW_REQUIRED');
    assert.equal(eventCount(), 2);
    const receiptVisible = await loadBoaCrewCheckinStatus(d1, 130, 21, 101, '2026-10-20');
    assert.equal(receiptVisible.received, true);
    assert.equal(receiptVisible.case_id, accepted.case_id);
    assert.equal(receiptVisible.dispatch_permission, 'NOT_GRANTED');
    const duplicate = await collect('2026-10-20');
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.status, 'ALREADY_RECEIVED');
    assert.equal(eventCount(), 2);

    sqlite.exec("UPDATE usuarios SET deleted_at='2026-10-20' WHERE id=101");
    assert.equal((await collect('2026-10-21')).status, 'RECHECK_DENIED');
    assert.equal(eventCount(), 2);
    sqlite.exec('UPDATE usuarios SET deleted_at=NULL WHERE id=101');

    sqlite.exec("UPDATE funcionarios SET status='INATIVO' WHERE id=21");
    assert.equal((await collect('2026-10-21')).status, 'RECHECK_DENIED');
    assert.equal(eventCount(), 2);
    sqlite.exec("UPDATE funcionarios SET status='ATIVO' WHERE id=21");

    sqlite.exec('DELETE FROM usuarios_empresas WHERE usuario_id=101');
    const hidden = await loadBoaCrewCheckinStatus(d1, 130, 21, 101, '2026-10-20');
    assert.equal(hidden.received, false);
    assert.equal(hidden.checkin_id, null);
    assert.equal(hidden.case_id, null);
    assert.equal((await collect('2026-10-20')).status, 'RECHECK_DENIED');
    assert.equal(eventCount(), 2);
    assert.equal(sqlite.prepare(
      'SELECT COUNT(*) AS n FROM frms_fadiga_evento WHERE empresa_id = 6',
    ).get().n, 0);
  } finally {
    sqlite.close();
  }
});
