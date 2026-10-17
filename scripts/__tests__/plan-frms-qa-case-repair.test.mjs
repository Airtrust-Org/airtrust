// source_reference: #1426 / #1562 / read-only run #39076290801.
// operational_decision: SQLite-only proof of eight QA compare-and-swap updates.
// dry_run_required: memory database only, no remote D1.
// rollback_plan_required: test transaction rollback on any update-count mismatch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { buildQaRepairPlan } from '../staging/plan-frms-qa-case-repair.mjs';

const days=Array.from({length:30},(_,i)=>({
  day:new Date(Date.parse('2026-09-14T00:00:00Z')+i*86400000).toISOString().slice(0,10),
  jornadas:'5-9'
}));
const plan=buildQaRepairPlan(days);
function dbFixture(){
  const db=new DatabaseSync(':memory:');
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE funcionarios (id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula TEXT,deleted_at TEXT,ativo INTEGER,status TEXT)");
  db.exec("CREATE TABLE frms_jornada (id TEXT PRIMARY KEY,tripulante_id INTEGER REFERENCES funcionarios(id),empresa_id INTEGER,data TEXT,deleted_at TEXT,registrado_por TEXT,origem TEXT,observacao TEXT,duracao_jornada_minutos INTEGER,updated_at TEXT)");
  db.exec("CREATE TABLE frms_alerta (id TEXT PRIMARY KEY,tripulante_id INTEGER REFERENCES funcionarios(id),jornada_id TEXT REFERENCES frms_jornada(id),tipo_limite TEXT,nivel TEXT,created_at TEXT,updated_at TEXT,valor_atual_min INTEGER,valor_limite_min INTEGER,mensagem TEXT,resolvido INTEGER,resolvido_em TEXT,resolvido_por TEXT,visualizado INTEGER,visualizado_em TEXT,notas_resolucao TEXT,deleted_at TEXT)");
  const insertPerson=db.prepare("INSERT INTO funcionarios VALUES(?,?,?,NULL,1,'ATIVO')");
  for(let n=1;n<=14;n++)insertPerson.run(n,999013,'QA-FRMS-UX-'+String(n).padStart(2,'0'));
  insertPerson.run(100,6,'QA-FRMS-UX-01');
  const journey=db.prepare("INSERT INTO frms_jornada VALUES(?,?,999013,?,NULL,'QA_FRMS_UX','MANUAL','CENARIO SINTETICO - SEM VALIDADE OPERACIONAL',540,'old')");
  for(const entry of plan.cases)journey.run(entry.journeyId,Number(entry.journeyId.slice(-2)),entry.newDay);
  const oldCrew=[7,5,4,14],oldDays=['2026-10-13','2026-10-12','2026-10-10','2026-10-09'];
  const kinds=['REPOUSO','FDP_DIARIO','HV_7D','REPOUSO'],levels=['CRITICO','ATENCAO','AVISO','CRITICO'];
  const alert=db.prepare("INSERT INTO frms_alerta VALUES(?,?,NULL,?,?,?,'old',620,540,'QA SINTETICO: revisar contexto e registrar providencia',0,NULL,NULL,0,NULL,NULL,NULL)");
  for(let i=0;i<4;i++)alert.run('qa-frms-ux-case-'+(i+1),oldCrew[i],kinds[i],levels[i],oldDays[i]+' 10:00:00');
  db.exec("INSERT INTO frms_jornada VALUES('outside',100,6,'2026-10-12',NULL,'REAL','SIGVOOS','REAL',700,'old')");
  return db;
}
function locallyAtomic(db){
  db.exec('BEGIN');
  try{
    for(const sql of plan.statements){
      db.exec(sql);
      if(Number(db.prepare('SELECT changes() AS n').get().n)!==1)throw Error('CAS_REJECTED');
    }
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
test('exact four cases, four journeys, and pure no-write planner',()=>{
  assert.equal(plan.mode,'PREPARE_ONLY');
  assert.equal(plan.approved,false);
  assert.equal(plan.statements.length,8);
  assert.equal(plan.expectedChanges,8);
  assert.equal(plan.tenantId,999013);
  assert.ok(plan.statements.every(s=>s.startsWith('UPDATE frms_')));
  assert.ok(plan.statements.every(s=>!/\b(DELETE|DROP|ALTER|INSERT)\b/.test(s)));
});
test('local SQLite updates precisely eight QA rows and rejects repeated apply',()=>{
  const db=dbFixture();
  locallyAtomic(db);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_jornada WHERE empresa_id=999013 AND origem='SIGVOOS'").get().n,4);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_alerta WHERE jornada_id IS NOT NULL").get().n,4);
  assert.equal(db.prepare("SELECT tripulante_id id FROM frms_alerta WHERE id='qa-frms-ux-case-1'").get().id,1);
  assert.equal(db.prepare("SELECT origem FROM frms_jornada WHERE id='outside'").get().origem,'SIGVOOS');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM funcionarios WHERE empresa_id=999013").get().n,14);
  assert.throws(()=>locallyAtomic(db),/CAS_REJECTED/);
  db.close();
});
test('unexpected manual-source drift aborts in-memory batch without partial writes',()=>{
  const db=dbFixture();
  db.prepare("UPDATE frms_jornada SET origem='ACTUAL' WHERE id=?").run(plan.cases[2].journeyId);
  assert.throws(()=>locallyAtomic(db),/CAS_REJECTED/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_jornada WHERE empresa_id=999013 AND origem='SIGVOOS'").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_alerta WHERE jornada_id IS NOT NULL").get().n,0);
  db.close();
});
test('invalid source dates rejected',()=>{
  const bad=days.map(x=>({...x}));
  bad[29].day='2027-10-13';
  assert.throws(()=>buildQaRepairPlan(bad),/QA_DATE_INVALID/);
});
