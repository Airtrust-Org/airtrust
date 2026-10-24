/**
 * Verify BOA case-to-checkin evidence linkage using actual in-memory SQLite.
 * dry_run_required: no network, credentials, D1 or production; database ephemeral.
 * source_reference: docs/frms/BOA_CBMMG_AUDITORIA_FUNCIONAL_CIENTIFICA_CADEIA_DADOS_20261021.md
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
const libPath = join(root, 'worker-airtrust/src/lib/frms/bombeiros-operational-events.ts');
const artifact = esbuild.buildSync({ entryPoints:[libPath], bundle:true,
  platform:'node', format:'cjs', write:false });
const tmp = '/tmp/airtrust-boa-evidence-node-test.cjs';
const mod = new Module(tmp);
mod.filename = tmp;
mod.paths = Module._nodeModulePaths(dirname(tmp));
mod._compile(artifact.outputFiles[0].text,tmp);
const {loadBoaCaseEvidenceCoverage} = mod.exports;
const sector9 = {mode:'restricted',setorIds:[9],funcionarioId:null};
const sector10 = {mode:'restricted',setorIds:[10],funcionarioId:null};

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE frms_fadiga_evento (id TEXT PRIMARY KEY, empresa_id INTEGER,
       checkin_id TEXT, tipo TEXT, payload_json TEXT, created_at TEXT);
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER,
       setor_id INTEGER, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY, deleted_at TEXT);
    CREATE TABLE usuarios_empresas (usuario_id INTEGER, empresa_id INTEGER, role TEXT);
    CREATE TABLE setores (id INTEGER PRIMARY KEY, empresa_id INTEGER, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE setores_gestores (usuario_id INTEGER, empresa_id INTEGER,
       setor_id INTEGER, ativo INTEGER, deleted_at TEXT, role TEXT);
    INSERT INTO usuarios VALUES (90,NULL),(91,NULL),(92,NULL);
    INSERT INTO usuarios_empresas VALUES (90,130,'manager'),(91,130,'manager'),(92,6,'manager');
    INSERT INTO setores VALUES (9,130,1,NULL),(10,130,1,NULL);
    INSERT INTO setores_gestores VALUES
      (90,130,9,1,NULL,'manager'),(91,130,10,1,NULL,'manager');
    INSERT INTO funcionarios VALUES (21,130,9,1,NULL),(22,130,10,1,NULL),(31,6,9,1,NULL);
  `);
  const add=(id,tenant,parent,type,data) =>
    sql.prepare(`INSERT INTO frms_fadiga_evento
      VALUES (?,?,?,?,?,'2026-10-20T09:00:00Z')`)
      .run(id,tenant,parent,type,JSON.stringify(data));
  const checkin=(id,tenant,crew,sleep,kss)=>{
    add(id,tenant,id,'BOA_CHECKIN_V1',{
      schema:'BOA_CHECKIN_V1',funcionario_id:crew,sleep_hours_24h:sleep,
      kss_reported:kss,mission_type:'RESGATE',duty_period:'NOTURNO',
      dispatch_permission:'NOT_GRANTED',
    });
  };
  const opened=(id,tenant,receipt,crew)=>{
    add(id,tenant,receipt,'BOA_CASE_OPENED_V1',{
      schema:'BOA_CASE_OPENED_V1',funcionario_id:crew,dispatch_permission:'NOT_GRANTED',
    });
  };
  checkin('r1',130,21,4.5,8);opened('c1',130,'r1',21);
  checkin('r2',130,22,null,null);opened('c2',130,'r2',22);
  checkin('r6',6,31,7,5);opened('c6',6,'r6',31);
  const db={prepare(query){
    const statement=sql.prepare(query);
    return {bind(...params){
      return {async all(){return {results:statement.all(...params)}}};
    }};
  }};
  return {sql,db};
}

test('real SQLite returns only declared vs missing evidence for authorized manager',async()=>{
  const {sql,db}=fixture();
  try {
    const response=await loadBoaCaseEvidenceCoverage(db,130,'c1',90,sector9);
    assert.equal(response?.source,'BOA_AUTHENTICATED_CHECKIN_EVENT');
    assert.equal(response?.sleep_evidence,'SELF_REPORTED_UNVERIFIED');
    assert.equal(response?.kss_evidence,'SUBJECTIVE_SELF_REPORT');
    assert.equal(response?.mission_context,'CREW_DECLARATION_UNVERIFIED');
    assert.equal(response?.pvt_evidence,'NO_PERFORMANCE_MEASUREMENT');
    assert.equal(response?.scientific_risk_estimate,null);
    assert.equal(response?.dispatch_permission,'NOT_GRANTED');
    const body=JSON.stringify(response);
    for(const forbidden of ['4.5','kss_reported','sleep_hours_24h','funcionario_id','nome_guerra']){
      assert.ok(!body.includes(forbidden),'Leaked sensitive value/key: '+forbidden);
    }
  } finally {sql.close();}
});
test('real SQLite blocks other sector, wrong tenant, revoked manager and leaves null missing',async()=>{
  const {sql,db}=fixture();
  try {
    assert.equal(await loadBoaCaseEvidenceCoverage(db,130,'c2',90,sector9),null);
    assert.equal(await loadBoaCaseEvidenceCoverage(db,130,'c6',90,sector9),null);
    assert.equal(await loadBoaCaseEvidenceCoverage(db,130,'c1',91,sector10),null);
    assert.equal(await loadBoaCaseEvidenceCoverage(db,130,'c1',92,sector9),null);
    const other=await loadBoaCaseEvidenceCoverage(db,130,'c2',91,sector10);
    assert.equal(other?.sleep_evidence,'NOT_REPORTED');
    assert.equal(other?.kss_evidence,'NOT_REPORTED');
    sql.exec('UPDATE setores_gestores SET ativo=0 WHERE usuario_id=90 AND empresa_id=130');
    assert.equal(await loadBoaCaseEvidenceCoverage(db,130,'c1',90,sector9),null);
    await assert.rejects(()=>loadBoaCaseEvidenceCoverage(db,6,'c6',92,sector9),/INVALID_TENANT/);
  } finally {sql.close();}
});

test('malformed historical KSS, sleep or mission evidence fails closed instead of becoming missing',async()=>{
  const {sql,db}=fixture();
  try {
    sql.exec("UPDATE frms_fadiga_evento SET payload_json=json_set(payload_json,'$.kss_reported',0) WHERE id='r1'");
    await assert.rejects(()=>loadBoaCaseEvidenceCoverage(db,130,'c1',90,sector9),/INTEGRITY_ERROR/);
    sql.exec("UPDATE frms_fadiga_evento SET payload_json=json_set(payload_json,'$.kss_reported',8,'$.sleep_hours_24h',-1) WHERE id='r1'");
    await assert.rejects(()=>loadBoaCaseEvidenceCoverage(db,130,'c1',90,sector9),/INTEGRITY_ERROR/);
    sql.exec("UPDATE frms_fadiga_evento SET payload_json=json_set(payload_json,'$.sleep_hours_24h',7,'$.mission_type','INVALID') WHERE id='r1'");
    await assert.rejects(()=>loadBoaCaseEvidenceCoverage(db,130,'c1',90,sector9),/INTEGRITY_ERROR/);
  } finally {sql.close();}
});
