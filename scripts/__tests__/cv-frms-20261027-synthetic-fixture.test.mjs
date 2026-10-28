import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fixtureSql, DB, DB_ID, TENANT, DAY, MARKER, PIC, SIC} from '../staging/seed-cv-frms-coordination-20261027.mjs';

const workflow=readFileSync(new URL('../../.github/workflows/staging-cv-frms-20261027-synthetic-fixture.yml',import.meta.url),'utf8');
const script=readFileSync(new URL('../staging/seed-cv-frms-coordination-20261027.mjs',import.meta.url),'utf8');

test('fixture pinned exclusively to fictional tenant, date and staging D1',()=>{
  assert.equal(DB,'airtrust-db-staging-baseline-20260701');
  assert.equal(DB_ID,'bf9963f4-eb12-439b-a830-20bbf577ac22');
  assert.equal(TENANT,999006);
  assert.equal(DAY,'2026-10-27');
  assert.match(MARKER,/^QA_FRMS_CV_/);
  assert.equal(PIC,'QA-PARTICIPANTE-ALFA');
  assert.equal(SIC,'QA-PARTICIPANTE-BRAVO');
  assert.ok(!script.includes('airtrust-db-production'));
});
test('fixture inserts only flight, dedicated PIC/SIC, synthetic journey/check-in',()=>{
  const sql=fixtureSql();
  assert.equal((sql.match(/\bINSERT INTO\b/g)||[]).length,5);
  assert.deepEqual([...sql.matchAll(/\bINSERT INTO\s+([a-z_]+)/g)].map(m=>m[1]),[
    'cv_voos','cv_voo_tripulantes','cv_voo_tripulantes','frms_jornada','frms_fadiga_checkin'
  ]);
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|DROP|ALTER|REPLACE|ATTACH|DETACH)\b/i);
  assert.match(sql,/QA SINTETICO/);
  assert.match(sql,/NOT EXISTS/);
  assert.match(sql,/empresa_id=999006/g);
  assert.doesNotMatch(sql,/empresa_id\s*=\s*6(?:\D|$)/);
});
test('synthetic check-in is explicitly marked and SIC remains pending',()=>{
  const sql=fixtureSql();
  assert.match(sql,/'QA_SYNTHETIC'/);
  assert.match(sql,/jornada_inicio_prevista/);
  assert.match(sql,/'QA-PARTICIPANTE-ALFA'/);
  assert.match(sql,/'QA-PARTICIPANTE-BRAVO'/);
  assert.equal((sql.match(/INSERT INTO frms_fadiga_checkin/g)||[]).length,1);
  assert.match(sql,/checkin-20261027-v1/);
});
test('governed workflow gates SHA, staging environment and Time Travel before writing',()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/environment: staging/);
  assert.match(workflow,/group: airtrust-staging-mutations-and-scorm-qa/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/node scripts\/ci\/verify-release-gates\.mjs/);
  assert.match(workflow,/STAGING_WORKER_SHA_MISMATCH/);
  assert.match(workflow,/STAGING_PAGES_SHA_MISMATCH/);
  assert.match(workflow,/d1 time-travel info/);
  assert.match(workflow,/STAGING_D1_UUID_MISMATCH/);
  assert.match(workflow,/steps\.recovery\.outputs\.bookmark/);
  assert.match(workflow,/--inspect/);
  assert.match(workflow,/--apply/);
  assert.doesNotMatch(workflow,/secrets\.CLOUDFLARE_PRODUCTION/);
});
test('unexpected mode or missing staging credentials cannot write',()=>{
  assert.match(script,/CV_FRMS_STAGING_TARGET_OR_CREDENTIALS_MISSING/);
  assert.match(script,/CV_FRMS_RECOVERY_REQUIRED/);
  assert.match(script,/CV_FRMS_APPLY_NOT_CONFIRMED/);
  assert.match(script,/CV_FRMS_FIXTURE_PREFLIGHT_FAILED/);
  assert.match(script,/CV_FRMS_FIXTURE_POSTCONDITION_FAILED/);
  assert.match(script,/foreignCheckins/);
  assert.match(script,/collision/);
});

test('isolated SQLite: first apply and repeat remain idempotent, source is unchanged',()=>{
  const sql=fixtureSql();
  const py=String.raw`
import sqlite3, sys
db=sqlite3.connect(':memory:')
db.executescript("""
CREATE TABLE cv_voos (id INTEGER PRIMARY KEY, empresa_id INTEGER, prefixo TEXT, data_programacao TEXT, origem_id INTEGER, destino_id INTEGER, tipo_voo_id INTEGER, natureza_voo_id INTEGER, aeronave_id INTEGER, horario_previsto_partida TEXT, horario_previsto_chegada TEXT, status TEXT, observacoes TEXT, versao INTEGER, origem_importacao TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT);
CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, matricula TEXT, ativo INTEGER, deleted_at TEXT);
CREATE TABLE cv_voo_tripulantes (id INTEGER PRIMARY KEY, empresa_id INTEGER, voo_id INTEGER, funcionario_id INTEGER, funcao TEXT, horario_apresentacao TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT);
CREATE TABLE frms_jornada (id TEXT PRIMARY KEY, tripulante_id INTEGER, data TEXT, status TEXT, hora_apresentacao TEXT, hora_termino TEXT, duracao_jornada_minutos INTEGER, horas_voo_minutos INTEGER, registrado_por TEXT, origem TEXT, observacao TEXT, empresa_id INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT);
CREATE TABLE frms_fadiga_checkin (id TEXT PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER, data_checkin TEXT, hora_checkin TEXT, kss_score INTEGER, horas_sono REAL, qualidade_sono INTEGER, sintomas_json TEXT, observacoes TEXT, score_fadiga INTEGER, nivel_fadiga TEXT, status_operacional TEXT, recomendacao TEXT, apto INTEGER, requires_frat_review INTEGER, computed_risk_level TEXT, requires_operational_review INTEGER, report_source TEXT, submitted_at TEXT, wake_time TEXT, jornada_inicio_prevista TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT);
INSERT INTO funcionarios VALUES(1,999006,'QA-PARTICIPANTE-ALFA',1,NULL);
INSERT INTO funcionarios VALUES(2,999006,'QA-PARTICIPANTE-BRAVO',1,NULL);
INSERT INTO cv_voos (id,empresa_id,prefixo,data_programacao,status,observacoes,origem_importacao) VALUES(1,999006,'QA-SRC','2026-10-27','planejado','ORIGINAL-SOURCE','MANUAL');
""")
sql=sys.stdin.read()
for attempt in range(2):
    db.executescript(sql)
    def n(q): return db.execute(q).fetchone()[0]
    assert n("SELECT COUNT(*) FROM cv_voos")==2
    assert n("SELECT COUNT(*) FROM cv_voo_tripulantes")==2
    assert n("SELECT COUNT(*) FROM frms_jornada")==1
    assert n("SELECT COUNT(*) FROM frms_fadiga_checkin")==1
    assert n("SELECT COUNT(*) FROM cv_voos WHERE id=1 AND observacoes='ORIGINAL-SOURCE'")==1
    assert n("SELECT COUNT(*) FROM cv_voo_tripulantes WHERE funcionario_id=1 AND funcao='PIC'")==1
    assert n("SELECT COUNT(*) FROM cv_voo_tripulantes WHERE funcionario_id=2 AND funcao='SIC'")==1
    assert n("SELECT COUNT(*) FROM frms_fadiga_checkin WHERE funcionario_id=2")==0
print('ISOLATED_CV_FRMS_SQLITE_IDEMPOTENT_PASS')
`;
  const result=spawnSync('python3',['-c',py],{input:sql,encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/ISOLATED_CV_FRMS_SQLITE_IDEMPOTENT_PASS/);
});
