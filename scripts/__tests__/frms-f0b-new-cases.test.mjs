// source_reference: issues #1426/#776; synthetic four-case F0B staging acceptance.
// operational_decision: verify actual fixture SQL on disposable SQLite memory DB;
//   preserve pre-existing eight legacy QA rows, tenant 999013 only.
// dry_run_required: tests invoke buildApplySql() exclusively on in-memory DB.
// rollback_plan_required: test buildRollbackSql() deletes only new synthetic
//   records and confirms the legacy QA rows are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {buildApplySql,buildRollbackSql,CASES,TARGET,assertNewCases} from '../staging/frms-f0b-new-cases.mjs';

function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec("CREATE TABLE empresas(id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);"+
    "CREATE TABLE funcionarios(id INTEGER,empresa_id INTEGER,matricula TEXT,ativo INTEGER,deleted_at TEXT);"+
    "CREATE TABLE frms_jornada(id TEXT PRIMARY KEY,tripulante_id INTEGER,data TEXT,status TEXT,hora_apresentacao TEXT,hora_termino TEXT,duracao_jornada_minutos INTEGER,horas_voo_minutos INTEGER,registrado_por TEXT,origem TEXT,observacao TEXT,empresa_id INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);"+
    "CREATE TABLE frms_alerta(id TEXT PRIMARY KEY,tripulante_id INTEGER,jornada_id TEXT,tipo_limite TEXT,nivel TEXT,percentual_atingido INTEGER,valor_atual_min INTEGER,valor_limite_min INTEGER,mensagem TEXT,visualizado INTEGER,resolvido INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT,notas_resolucao TEXT);"+
    "INSERT INTO empresas VALUES(999013,'qa_frms_ux_30d',1,NULL),(999014,'other',1,NULL);"+
    "INSERT INTO funcionarios VALUES(101,999013,'QA-FRMS-UX-01',1,NULL),(102,999013,'QA-FRMS-UX-02',1,NULL),(201,999014,'QA-FRMS-UX-01',1,NULL);");
  db.exec('CREATE UNIQUE INDEX idx_frms_jornada_trip_data_uq ON frms_jornada(tripulante_id,data) WHERE deleted_at IS NULL');
  const a=db.prepare("INSERT INTO frms_alerta(id,tripulante_id,jornada_id,resolvido,visualizado,created_at) VALUES(?,?,NULL,0,0,'2026-10-13')");
  const j=db.prepare("INSERT INTO frms_jornada(id,tripulante_id,empresa_id,data,origem) VALUES(?,?,999013,?,'MANUAL')");
  for(let i=1;i<=4;i++){
    a.run('qa-frms-ux-case-'+i,i%2?101:102);
    j.run('qa-frms-ux-j-legacy-'+i,i%2?101:102,['2026-10-12','2026-10-11','2026-10-10','2026-10-09'][i-1]);
  }
  return db;
}
function legacy(db){
  return [db.prepare("SELECT * FROM frms_alerta WHERE id LIKE 'qa-frms-ux-case-%' ORDER BY id").all(),
    db.prepare("SELECT * FROM frms_jornada WHERE id LIKE 'qa-frms-ux-j-%' ORDER BY id").all()];
}
function readValid(db){
  return db.prepare("SELECT a.id,j.id AS journey,j.data,f.matricula,a.tipo_limite,a.nivel,j.origem,j.observacao,a.mensagem,j.empresa_id,a.resolvido,a.deleted_at,j.deleted_at AS jdeleted,a.valor_atual_min,j.duracao_jornada_minutos "+
    "FROM frms_alerta a JOIN frms_jornada j ON j.id=a.jornada_id AND CAST(j.tripulante_id AS INTEGER)=CAST(a.tripulante_id AS INTEGER) "+
    "JOIN funcionarios f ON f.id=CAST(a.tripulante_id AS INTEGER) AND f.empresa_id=j.empresa_id WHERE a.id LIKE 'qa-frms-f0b-case-%' ORDER BY a.id").all();
}
test('only four new synthetic SIGVOOS cases, and the eight legacy rows are byte-for-byte unchanged',()=>{
  const db=fixture(),before=legacy(db);
  db.exec(buildApplySql());
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_alerta WHERE id LIKE 'qa-frms-f0b-case-%'").get().n,4);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_jornada WHERE id LIKE 'qa-frms-f0b-j-%'").get().n,4);
  assert.equal(assertNewCases(readValid(db)),true);
  assert.deepEqual(legacy(db),before);
  const rows=readValid(db);
  assert.equal(rows.filter(x=>x.tipo_limite==='FDP_DIARIO'&&x.valor_atual_min===x.duracao_jornada_minutos).length,1);
  assert.equal(rows.every(x=>x.empresa_id===TARGET.tenant),true);
  db.exec(buildApplySql());
  assert.equal(readValid(db).length,4,'replay is idempotent');
  assert.deepEqual(legacy(db),before);
  db.exec(buildRollbackSql());
  assert.equal(readValid(db).length,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_jornada WHERE id LIKE 'qa-frms-f0b-j-%'").get().n,0);
  assert.deepEqual(legacy(db),before);
  db.close();
});
test('new evidence contract rejects wrong origin, crew, tenant, stale FDP and partial sets',()=>{
  for(const [column,value] of [['origem','MANUAL'],['matricula','QA-INTRUSO'],['empresa_id',999014],['valor_atual_min',99999]]){
    const db=fixture();db.exec(buildApplySql());
    const rows=readValid(db).map(x=>({...x}));
    if(column==='valor_atual_min'){
      const n=rows.findIndex(x=>x.tipo_limite==='FDP_DIARIO');
      rows[n][column]=value;
    }else rows[0][column]=value;
    assert.throws(()=>assertNewCases(rows),/QA_NEW_CASE_LINKAGE_OR_SCOPE_INVALID/);
    assert.throws(()=>assertNewCases(rows.slice(1)),/QA_NEW_CASE_COUNT_NOT_FOUR/);
    db.close();
  }
});
test('no legacy DML, no production target, and four distinct crew-date journey links',()=>{
  const sql=buildApplySql();
  assert.equal((sql.match(/INSERT INTO frms_jornada/g)||[]).length,4);
  assert.equal((sql.match(/INSERT INTO frms_alerta/g)||[]).length,4);
  assert.doesNotMatch(sql,/\bUPDATE\b|\bDELETE\b|qa-frms-ux-case-|qa-frms-ux-j-/);
  assert.equal(new Set(CASES.map(x=>x.id)).size,4);
  assert.equal(new Set(CASES.map(x=>x.journey)).size,4);
  assert.equal(TARGET.db,'airtrust-db-staging-baseline-20260701');
});
