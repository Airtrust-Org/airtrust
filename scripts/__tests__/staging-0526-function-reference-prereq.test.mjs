// source_reference: staging run 37087544679 failed read-only 0526 preflight at comandante-function=0
// operational_decision: keep production 0526 immutable and seed only non-PII function references in reduced staging
// dry_run_required: true
// rollback_plan_required: staging D1 Time Travel recovery point captured by apply-approved-migration-with-recovery-point.sh
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { adaptStagingMigrationSql } from '../staging/staging-migration-adapters.mjs';

const NAME = '0526_training_compliance_matrix_alignment.sql';
const EXPECTED = [
  ['CMD','Comandante'], ['COP','Copiloto'], ['MEC','Mecânico'],
  ['AUXM','Aux Manutenção'], ['AUXS','Aux Suprimentos'],
  ['SUPS','Supervisor Suprimentos'], ['RMP','Agente Rampa'],
];

test('0526 staging adapter adds only the bounded non-PII function references', () => {
  const canonical = readFileSync(`worker-airtrust/migrations/${NAME}`, 'utf8');
  const adapted = adaptStagingMigrationSql({ migrationName: NAME, migrationSql: canonical });
  for (const [code,name] of EXPECTED) assert.ok(adapted.includes(`'${code}','${name}'`));
  assert.ok(adapted.endsWith(canonical));
  assert.equal(readFileSync('worker-airtrust/schema-v2/changes/0526_training_compliance_matrix_alignment.sql','utf8'), canonical);
  const bootstrap = adapted.slice(0, adapted.length - canonical.length);
  for (const forbidden of ['funcionarios','qualificacoes_historico','lms_matriculas','certificados','funcionarios_compliance_condicoes']) {
    assert.doesNotMatch(bootstrap, new RegExp(`INSERT INTO ${forbidden}|UPDATE ${forbidden}|DELETE FROM ${forbidden}`, 'i'));
  }
});

test('0526 staging bootstrap is idempotent and preserves an accepted existing synonym', () => {
  const canonical = readFileSync(`worker-airtrust/migrations/${NAME}`, 'utf8');
  const adapted = adaptStagingMigrationSql({ migrationName: NAME, migrationSql: canonical });
  const bootstrap = adapted.slice(0, adapted.length - canonical.length).trim();
  const db = path.join(mkdtempSync(path.join(tmpdir(), 'airtrust-0526-staging-')), 'db.sqlite');
  const setup = `
CREATE TABLE funcoes(id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT,nome TEXT,descricao TEXT,categoria TEXT,ativo INTEGER,empresa_id INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
CREATE UNIQUE INDEX idx_funcoes_codigo_tenant_active ON funcoes(empresa_id,codigo COLLATE NOCASE) WHERE deleted_at IS NULL;
INSERT INTO funcoes(codigo,nome,categoria,ativo,empresa_id) VALUES('LEGACY_AUXM','Auxiliar de Manutenção','MANUTENCAO',1,6);`;
  assert.equal(spawnSync('sqlite3',[db],{input:setup,encoding:'utf8'}).status,0);
  for (let i=0;i<2;i++) {
    const apply=spawnSync('sqlite3',[db],{input:bootstrap,encoding:'utf8'});
    assert.equal(apply.status,0,apply.stderr);
  }
  const query=(sql)=>spawnSync('sqlite3',[db,sql],{encoding:'utf8'}).stdout.trim();
  assert.equal(query("SELECT COUNT(*) FROM funcoes WHERE empresa_id=6 AND deleted_at IS NULL;"),'7');
  assert.equal(query("SELECT COUNT(*) FROM funcoes WHERE empresa_id=6 AND nome='Auxiliar de Manutenção';"),'1');
  assert.equal(query("SELECT COUNT(*) FROM funcoes WHERE empresa_id=6 AND codigo='AUXM';"),'0');
  for (const [code,name] of EXPECTED.filter(([code])=>code!=='AUXM')) {
    assert.equal(query(`SELECT COUNT(*) FROM funcoes WHERE empresa_id=6 AND codigo='${code}' AND nome='${name}';`),'1');
  }
});

test('0526 staging preflight accepts absence but rejects reference ambiguity and code collisions', () => {
  const pre = readFileSync('scripts/staging/validate-0526-preflight.sh','utf8');
  for (const label of ['comandante-function','copiloto-function','mechanic-function','maintenance-assistant-function','supplies-assistant-function','supplies-supervisor-function','ramp-agent-function']) {
    assert.match(pre, new RegExp(`assert_zero_or_one ${label}`));
  }
  for (const label of ['comandante-code-collision','copiloto-code-collision','mechanic-code-collision','maintenance-assistant-code-collision','supplies-assistant-code-collision','supplies-supervisor-code-collision','ramp-agent-code-collision']) {
    assert.match(pre, new RegExp(`assert_count ${label} 0`));
  }
});
