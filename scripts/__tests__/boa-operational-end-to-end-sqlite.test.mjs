/**
 * Executable BOA end-to-end proof using REAL application SQL + in-memory SQLite.
 * source_reference: docs/frms/BOA_CBMMG_AUDITORIA_FUNCIONAL_CIENTIFICA_CADEIA_DADOS_20261021.md
 * operational_decision: demonstrate checkin→case→mitigation→efficacy→monthly
 * report and RBAC on a 130-role synthetic cohort, without fake cloud users.
 * dry_run_required: ALL writes are to DatabaseSync(':memory:') only.
 * rollback_plan_required: sqlite.close() destroys the entire test dataset.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const root = fileURLToPath(new URL('../..', import.meta.url));
function load(file, label) {
  const entry = join(root, file);
  const output = esbuild.buildSync({
    entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false,
  }).outputFiles[0].text;
  const filename = '/tmp/airtrust-boa-' + label + '-sqlite-e2e.cjs';
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}
const operational = load('worker-airtrust/src/lib/frms/bombeiros-operational-events.ts', 'operational');
const { loadBoaMonthlyManagementPreview } = load(
  'worker-airtrust/src/lib/frms/bombeiros-monthly-management-report.ts', 'monthly',
);
const {
  resolveBoaCrewIdentity, registerBoaCheckin, loadBoaCrewCheckinStatus,
  loadBoaCaseQueue, loadBoaOperationalCase, loadBoaCaseEvidenceCoverage,
  registerBoaCaseAction,
} = operational;

const sectorScope = { mode: 'restricted', setorIds: [9], funcionarioId: null };
const checkinInput = {
  mission_type: 'RESGATE', duty_period: 'NOTURNO',
  standby_activation: true, critical_mission: true,
  sleep_hours_24h: 4.5, sleep_fragmented: true,
  kss_reported: 8, pvt_60s_completed: null,
  self_declared_unfit: false, acknowledge_confidentiality: true,
};
const governance = {
  // Fixture value is for code tests only, NOT a purported scientific approval.
  profile_code: 'FIREFIGHTER_AVIATION',
  revision_id: 'qa-unapproved-policy-placeholder',
  policy_version: 'qa-unapproved-method',
};
const date = '2026-10-22';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, cargo TEXT,
      funcao TEXT, setor_id INTEGER NOT NULL, ativo INTEGER NOT NULL,
      deleted_at TEXT, status TEXT
    );
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY, funcionario_id INTEGER, deleted_at TEXT
    );
    CREATE TABLE usuarios_empresas (
      usuario_id INTEGER NOT NULL, empresa_id INTEGER NOT NULL, role TEXT
    );
    CREATE TABLE setores (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
      ativo INTEGER NOT NULL, deleted_at TEXT
    );
    CREATE TABLE setores_gestores (
      id INTEGER PRIMARY KEY, setor_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL, empresa_id INTEGER NOT NULL,
      role TEXT, ativo INTEGER NOT NULL, deleted_at TEXT
    );
    CREATE TABLE frms_fadiga_evento (
      id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, checkin_id TEXT,
      tipo TEXT NOT NULL, payload_json TEXT, created_at TEXT NOT NULL
    );
    INSERT INTO setores VALUES
      (9,130,1,NULL), (10,130,1,NULL), (11,130,1,NULL), (12,130,1,NULL),
      (9+1000,6,1,NULL);
  `);
  const addEmployee = sqlite.prepare(
    'INSERT INTO funcionarios VALUES (?,130,?,?,?,1,NULL,?)');
  const addUser = sqlite.prepare('INSERT INTO usuarios VALUES (?,?,NULL)');
  const addMembership = sqlite.prepare('INSERT INTO usuarios_empresas VALUES (?,130,?)');
  const addGrant = sqlite.prepare('INSERT INTO setores_gestores VALUES (?,?,?,?,?,1,NULL)');
  const crewIds = [];
  for (let i = 0; i < 125; i++) {
    const employee = 10001 + i, user = 20001 + i;
    const sector = i < 10 ? 9 : 9 + i % 4;
    addEmployee.run(employee, 'Bombeiro Militar', 'Operador Aerotático', sector, 'ATIVO');
    addUser.run(user, employee);
    addMembership.run(user, 'student');
    crewIds.push(employee);
  }
  for (let i = 0; i < 4; i++) {
    const user = 300 + i, sector = 9 + i;
    addUser.run(user, null);
    addMembership.run(user, 'manager');
    addGrant.run(i + 1, sector, user, 130, 'manager');
  }
  addUser.run(401, null); addMembership.run(401, 'admin');
  // The complete fictional procurement cohort: 125 crew, 4 managers, 1 admin.
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n,130);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM usuarios_empresas').get().n,130);
  const d1 = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return statement.get(...args) ?? null; },
        async all() { return { results: statement.all(...args) }; },
        async run() {
          const result = statement.run(...args);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK'); throw error;
      }
    },
  };
  return {sqlite, d1, crewIds};
}
const eventCount = sql =>
  Number(sql.prepare('SELECT COUNT(*) AS n FROM frms_fadiga_evento').get().n);

test('BOA complete synthetic 130-role cycle with real SQL and no remote connection', async () => {
  const {sqlite,d1,crewIds} = fixture();
  try {
    assert.equal(await resolveBoaCrewIdentity(d1,130,20001),10001);
    assert.equal(await resolveBoaCrewIdentity(d1,6,20001).catch(() => null),null);
    let checkinAndCase = [];
    for (let i=0; i<10; i++) {
      const employee = crewIds[i], user = 20001+i;
      const receipt = await registerBoaCheckin(d1,130,employee,user,date,checkinInput,governance);
      assert.equal(receipt.accepted,true);
      assert.equal(receipt.status,'HUMAN_REVIEW_REQUIRED');
      assert.equal(receipt.dispatch_permission,'NOT_GRANTED');
      assert.equal((await loadBoaCrewCheckinStatus(d1,130,employee,user,date)).case_id,receipt.case_id);
      checkinAndCase.push(receipt);
    }
    assert.equal(eventCount(sqlite),20); // 10 receipts + 10 opened cases
    assert.equal((await registerBoaCheckin(d1,130,10001,20001,date,checkinInput,governance)).status,'ALREADY_RECEIVED');
    assert.equal(eventCount(sqlite),20); // duplicate is idempotent
    const queue = await loadBoaCaseQueue(d1,130,300,sectorScope);
    assert.equal(queue.items.length,10);
    assert.ok(queue.items.every(item=>item.state==='ABERTO'));
    assert.doesNotMatch(JSON.stringify(queue),/kss_reported|sleep_hours_24h|funcionario_id/i);

    for (const item of checkinAndCase.slice(0,5)) {
      const id = item.case_id;
      const coverage = await loadBoaCaseEvidenceCoverage(d1,130,id,300,sectorScope);
      assert.equal(coverage.sleep_evidence,'SELF_REPORTED_UNVERIFIED');
      assert.equal(coverage.pvt_evidence,'NO_PERFORMANCE_MEASUREMENT');
      assert.equal(coverage.scientific_risk_estimate,null);
      assert.doesNotMatch(JSON.stringify(coverage),/4\.5|kss_reported|sleep_hours_24h/);
      assert.equal(await registerBoaCaseAction(d1,130,id,300,{
        responsavel:'Gestor BOA fictício',prazo:'2026-10-31',
        acao_mitigacao:'Redimensionamento de sobreaviso sujeito à revisão humana.',
        justificativa:'Autodeclaração pendente de avaliação técnica responsável.',
      },'treatment',sectorScope),'RECORDED');
      assert.equal((await loadBoaOperationalCase(d1,130,id,300,sectorScope)).status.state,
        'EM_TRATAMENTO');
      assert.equal(await registerBoaCaseAction(d1,130,id,300,{
        avaliacao_eficacia:'Avaliação humana sintética com providência registrada.',
      },'closure',sectorScope),'RECORDED');
      assert.equal((await loadBoaOperationalCase(d1,130,id,300,sectorScope)).status.state,
        'RESOLVIDO');
      assert.equal(await registerBoaCaseAction(d1,130,id,300,{
        avaliacao_eficacia:'Repetição proibida de encerramento fictício.',
      },'closure',sectorScope),'NOT_ALLOWED');
    }
    assert.equal(eventCount(sqlite),30); // 20 original + 5 mitigations + 5 closures
    const status = await loadBoaCaseQueue(d1,130,300,sectorScope);
    assert.equal(status.items.filter(item=>item.state==='RESOLVIDO').length,5);
    assert.equal(status.items.filter(item=>item.state==='ABERTO').length,5);

    const report = await loadBoaMonthlyManagementPreview(
      d1,130,'2026-10',new Set(crewIds),
    );
    assert.equal(report.current.participants,10);
    assert.equal(report.current.checkin_receipts,10);
    assert.equal(report.current.cases.privacy,'OBSERVED');
    assert.equal(report.current.cases.opened,10);
    assert.equal(report.current.cases.awaiting_treatment,5);
    assert.equal(report.current.cases.closed_with_efficacy,5);
    assert.equal(report.current.cases.under_treatment,0);
    assert.equal(report.previous.checkin_receipts,0);
    assert.equal(report.receipt_delta,10);
    assert.equal(report.provenance.signed,false);
    assert.equal(report.provenance.scientific_score,'NOT_VALIDATED');
    assert.doesNotMatch(JSON.stringify(report),
      /kss_reported|sleep_hours_24h|funcionario_id|nome_guerra|flight_clearance/i);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM frms_fadiga_evento WHERE empresa_id=6').get().n,0);

    sqlite.exec('UPDATE setores_gestores SET ativo=0 WHERE usuario_id=300');
    assert.deepEqual((await loadBoaCaseQueue(d1,130,300,sectorScope)).items,[]);
    assert.equal(await loadBoaCaseEvidenceCoverage(d1,130,checkinAndCase[0].case_id,300,sectorScope),null);
    assert.equal(await registerBoaCaseAction(d1,130,checkinAndCase[6].case_id,300,{
      responsavel:'Gestor BOA fictício',prazo:'2026-10-31',
      acao_mitigacao:'Mitigação depois de revogação não autorizada.',
      justificativa:'Não deve inserir evento após revogação de acesso.',
    },'treatment',sectorScope),'NOT_ALLOWED');
    assert.equal(eventCount(sqlite),30);
  } finally { sqlite.close(); }
});
