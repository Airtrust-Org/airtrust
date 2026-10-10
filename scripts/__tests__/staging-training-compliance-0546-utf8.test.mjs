import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const validator = readFileSync('scripts/staging/validate-0534-postconditions.sh', 'utf8');
const workflow = readFileSync('.github/workflows/staging-training-compliance-qa.yml', 'utf8');

test('NR-26 staging validator compares accented canonical functions correctly using SQLite', () => {
  const sql = validator.match(/assert_count nr26-extra 0 "([^"]+)"/)?.[1];
  assert.ok(sql, 'NR-26 canonical extras postcondition must exist');
  for (const accent of ['ã', 'â', 'ç', 'õ', 'é']) {
    assert.ok(sql.includes("'" + accent + "'"), 'missing accent normalization ' + accent);
  }
  const python = [
    'import sqlite3,sys',
    'db=sqlite3.connect(":memory:")',
    'db.executescript("""CREATE TABLE qualificacoes_tipos(id INTEGER,empresa_id INTEGER,codigo TEXT);CREATE TABLE funcoes(id INTEGER,nome TEXT);CREATE TABLE treinamento_requisitos(id INTEGER,empresa_id INTEGER,qualificacao_tipo_id INTEGER,funcao_id INTEGER,escopo TEXT,ativo INTEGER,deleted_at TEXT);""")',
    'db.execute("INSERT INTO qualificacoes_tipos VALUES(1,6,?)",("NR-26",))',
    'roles=["Auxiliar de Manutenção","Gerente de Manutenção","Gerente de Operações","Gerente de Segurança Operacional","Mecânico","Técnico de Segurança do Trabalho","Auxiliar de CTM"]',
    'for i,name in enumerate(roles,1):',
    ' db.execute("INSERT INTO funcoes VALUES(?,?)",(i,name))',
    ' db.execute("INSERT INTO treinamento_requisitos VALUES(?,?,?, ?,?,?,NULL)",(i,6,1,i,"FUNCAO",1))',
    'result=db.execute(sys.argv[1]).fetchone()[0]',
    'print(result)',
  ].join('\n');
  const actual = execFileSync('python3', ['-c', python, sql], { encoding: 'utf8' }).trim();
  assert.equal(actual, '1', 'only true extra Auxiliar de CTM should fail the canonical role list');
});

test('staging QA chooses and validates 0546 without bypassing the 0534 baseline', () => {
  assert.match(workflow, /m0546/);
  assert.match(workflow, /if \(d === 1\)/);
  assert.match(workflow, /TRAINING_COMPLIANCE_QA_0546_BASELINE_INVALID/);
  assert.match(workflow, /validate-0534-postconditions\.sh/);
  assert.match(workflow, /validate-0546-postconditions\.sh/);
  assert.match(workflow, /TRAINING_COMPLIANCE_QA_VALIDATOR_FAILURE baseline=/);
  assert.match(validator, /overlay_0546/);
  assert.match(validator, /POSTCONDITION_SUPERSEDED=regras-ouro-company-rule-by-0546/);
  assert.match(validator, /assert_count nr26-extra 0/);
});
