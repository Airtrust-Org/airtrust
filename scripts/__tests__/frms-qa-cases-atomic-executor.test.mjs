// source_reference: FRMS #1426 and Cloudflare D1Database.batch documented rollback.
// operational_decision: test in-memory D1 binding adapter, no remote database.
// dry_run_required: Node SQLite memory only, no token, no apply endpoint.
// rollback_plan_required: failure in mid-batch must abort all 8 CAS rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createDecipheriv} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {buildReviewPlan} from '../staging/frms-qa-cases-repair-plan.mjs';
import {
  validateQaPreimage,encryptQaPreimage,buildQaAtomicStatements,executeQaAtomicRepair, compensateQaAtomicRepair,
} from '../staging/frms-qa-cases-atomic-executor.mjs';

const days=Array.from({length:30},(_,i)=>({
  day:new Date(Date.parse('2026-09-14T00:00:00Z')+i*86400000).toISOString().slice(0,10),
  jornadas:'5-9',
}));
const plan=buildReviewPlan(days);
const preimage=plan.operations.map(x=>({
  table:x.table,id:x.id,updated_at:'old',
  original:{id:x.id,updated_at:'old',fixture:'QA_ONLY'},
}));
const sha='a'.repeat(40);
const approval=()=>({
  environment:'staging',tenantId:999013,d1Id:'bf9963f4-eb12-439b-a830-20bbf577ac22',sha,
  approval:{approved:true,sha,dbId:'bf9963f4-eb12-439b-a830-20bbf577ac22',tenantId:999013,
    scope:'FRMS_QA_999013_4_CASES_4_JOURNEYS',planSha256:plan.sql_sha256,
    preimageSha256:validateQaPreimage(plan,preimage),
    authorizedIds:plan.operations.map(x=>x.id),reference:'AIRTRUST-STAGING-TEST'},
  recovery:{dbId:'bf9963f4-eb12-439b-a830-20bbf577ac22',timeTravelBookmark:'mock-only'},
  artifact:{encryptedAndStored:true,restrictedReference:'protected/test',
    sha256:'b'.repeat(64)},
});
function post0351JourneyColumns(){
  const dir=new URL('../../worker-airtrust/migrations/',import.meta.url);
  return [...new Set(readdirSync(dir).filter(name=>/^\d{4}_.*\.sql$/.test(name))
    .filter(name=>Number(name.slice(0,4))>351)
    .flatMap(name=>[...readFileSync(new URL(name,dir),'utf8')
      .matchAll(/ALTER TABLE frms_jornada\s+ADD COLUMN\s+([a-z_][a-z0-9_]*)/gi)]
      .map(match=>match[1])))];
}
function setup(){
  const db=new DatabaseSync(':memory:');
  db.exec("CREATE TABLE funcionarios (id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula TEXT,deleted_at TEXT,ativo INTEGER)");
  db.exec("CREATE TABLE frms_jornada (id TEXT PRIMARY KEY,empresa_id INTEGER,tripulante_id INTEGER,data TEXT,deleted_at TEXT,registrado_por TEXT,origem TEXT,observacao TEXT,duracao_jornada_minutos INTEGER,updated_at TEXT)");
  db.exec("CREATE TABLE frms_alerta (id TEXT PRIMARY KEY,tripulante_id INTEGER,jornada_id TEXT,tipo_limite TEXT,nivel TEXT,created_at TEXT,mensagem TEXT,resolvido INTEGER,resolvido_em TEXT,resolvido_por TEXT,visualizado INTEGER,visualizado_em TEXT,visualizado_por TEXT,percentual_atingido REAL,valor_atual_min INTEGER,valor_limite_min INTEGER,notas_resolucao TEXT,updated_at TEXT,deleted_at TEXT)");
  const person=db.prepare("INSERT INTO funcionarios VALUES(?,?,?,NULL,1)");
  for(let n=1;n<=14;n++)person.run(n,999013,'QA-FRMS-UX-'+String(n).padStart(2,'0'));
  person.run(100,6,'QA-FRMS-UX-01');
  const journey=db.prepare("INSERT INTO frms_jornada VALUES(?,999013,?,?,NULL,'QA_FRMS_UX','MANUAL','CENARIO SINTETICO - SEM VALIDADE OPERACIONAL',540,'old')");
  for(const x of plan.operations.filter(y=>y.table==='frms_jornada')){
    const match=x.id.match(/(2026-[0-9]{2}-[0-9]{2})-QA-FRMS-UX-([0-9]{2})$/);
    journey.run(x.id,Number(match[2]),match[1]);
  }
  const old=[7,5,4,14],dates=['2026-10-13','2026-10-12','2026-10-10','2026-10-09'];
  const kinds=['REPOUSO','FDP_DIARIO','HV_7D','REPOUSO'],levels=['CRITICO','ATENCAO','AVISO','CRITICO'];
  const alert=db.prepare("INSERT INTO frms_alerta VALUES(?,?,NULL,?,?,?,'QA SINTETICO: revisar contexto e registrar providencia',0,NULL,NULL,0,NULL,NULL,112,620,540,NULL,'old',NULL)");
  for(let i=0;i<4;i++)alert.run('qa-frms-ux-case-'+(i+1),old[i],kinds[i],levels[i],dates[i]+' 10:00:00');
  db.exec("INSERT INTO frms_jornada VALUES('other-tenant',6,100,'2026-10-13',NULL,'REAL','SIGVOOS','REAL',100,'old')");
  // Complete reviewed 0351 row image, not an artificially small mock that
  // would make a partial-row CAS appear to protect every database column.
  for (const name of ['status','hora_apresentacao','hora_termino',
    'horas_voo_minutos','hora_primeiro_acionamento','hora_primeira_decolagem',
    'hora_ultimo_pouso','hora_corte_motor','repouso_plataforma_inicio',
    'repouso_plataforma_fim','repouso_plataforma_valido','created_at',
    'tipo_base','tripulacao_aumentada','classe_cabine','aclimatado','local_base']) {
    db.exec('ALTER TABLE frms_jornada ADD COLUMN '+name+' TEXT');
  }
  for(const name of post0351JourneyColumns()){
    if(!db.prepare('PRAGMA table_info(frms_jornada)').all().some(row=>row.name===name))
      db.exec('ALTER TABLE frms_jornada ADD COLUMN "'+name+'" TEXT');
  }
  return db;
}
function fakeD1(db,{beforeBatch}={}){
  return {
    prepare(sql){return {sql,params:[],bind(...args){this.params=args;return this;}};},
    async batch(stmts){
      beforeBatch?.();
      db.exec('BEGIN IMMEDIATE');
      try{
        for(const s of stmts){
          const prepared=db.prepare(s.sql);
          if(s.sql.startsWith('UPDATE '))prepared.run(...s.params);
          else prepared.all(...s.params);
        }
        db.exec('COMMIT');
        return [];
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
  };
}
function loadFullImages(db){
  return plan.operations.map(op=>{
    const original=db.prepare("SELECT * FROM "+op.table+" WHERE id=?").get(op.id);
    return {table:op.table,id:op.id,updated_at:original.updated_at,original};
  });
}
function authorizeCompensation(context,before,after){
  context.compensationApproval={approved:true,sha:context.sha,
    dbId:context.d1Id,tenantId:context.tenantId,planSha256:plan.sql_sha256,
    preimageSha256:validateQaPreimage(plan,before),
    postimageSha256:validateQaPreimage(plan,after),
    authorizedIds:plan.operations.map(x=>x.id),reference:'AIRTRUST-STAGING-TEST-COMPENSATION',
    scope:'FRMS_QA_999013_SELECTIVE_COMPENSATION'};
}
test('refuse missing authorization, changed SHA/DB, or recovery',()=>{
  const statements=buildQaAtomicStatements({plan,preimage,context:approval()});
  assert.equal(statements.length,18);
  assert.equal(statements.filter(s=>s.sql.startsWith('UPDATE ')).length,8);
  for(const [key,value] of [['environment','production'],['sha','other'],['d1Id','unknown']]){
    const context=approval();context[key]=value;
    assert.throws(()=>buildQaAtomicStatements({plan,preimage,context}),/QA_WRITE_APPROVAL/);
  }
  const context=approval();context.recovery=null;
  assert.throws(()=>buildQaAtomicStatements({plan,preimage,context}),/QA_WRITE_APPROVAL/);
});
test('AES-GCM seals exactly eight preimage rows with reversible authenticated encryption',()=>{
  const key=randomBytes(32);
  const protectedData=encryptQaPreimage({plan,rows:preimage,key});
  assert.equal(protectedData.format,'AES-256-GCM');
  assert.equal(protectedData.rows,8);
  const d=createDecipheriv('aes-256-gcm',key,Buffer.from(protectedData.iv,'base64'));
  d.setAuthTag(Buffer.from(protectedData.tag,'base64'));
  const decoded=Buffer.concat([d.update(Buffer.from(protectedData.ciphertext,'base64')),d.final()]);
  assert.deepEqual(JSON.parse(decoded.toString('utf8')),preimage);
});
test('the D1 binding batch contract atomically updates four journeys and four cases',async()=>{
  const db=setup();
  const result=await executeQaAtomicRepair({db:fakeD1(db),plan,preimage,context:approval()});
  assert.equal(result.updatedRows,8);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM frms_alerta WHERE jornada_id IS NOT NULL").get().n,4);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM frms_jornada WHERE origem='SIGVOOS' AND empresa_id=999013").get().n,4);
  assert.equal(db.prepare("SELECT origem FROM frms_jornada WHERE id='other-tenant'").get().origem,'SIGVOOS');
  await assert.rejects(()=>executeQaAtomicRepair({db:fakeD1(db),plan,preimage,context:approval()}),/malformed JSON/);
  db.close();
});
test('mid-batch drift forces rollback of every change without partial commit',async()=>{
  const db=setup();
  const third=plan.operations.filter(x=>x.table==='frms_jornada')[2].id;
  db.prepare("UPDATE frms_jornada SET origem='FIRA' WHERE id=?").run(third);
  await assert.rejects(()=>executeQaAtomicRepair({db:fakeD1(db),plan,preimage,context:approval()}),/malformed JSON/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_jornada WHERE origem='SIGVOOS' AND empresa_id=999013").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_alerta WHERE jornada_id IS NOT NULL").get().n,0);
  db.close();
});

test('separate approval enables selective atomic inverse CAS with verified pre/postimages',async()=>{
  const db=setup(),binding=fakeD1(db);
  const before=loadFullImages(db),context=approval();
  context.approval.preimageSha256=validateQaPreimage(plan,before);
  await executeQaAtomicRepair({db:binding,plan,preimage:before,context});
  const after=loadFullImages(db);
  await assert.rejects(()=>compensateQaAtomicRepair({
    db:binding,plan,preimage:before,postimage:after,context,
  }),/COMPENSATION_AUTHORIZATION_REQUIRED/);
  authorizeCompensation(context,before,after);
  const res=await compensateQaAtomicRepair({
    db:binding,plan,preimage:before,postimage:after,context,
  });
  assert.equal(res.updatedRows,8);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_alerta WHERE jornada_id IS NULL").get().n,4);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_jornada WHERE origem='MANUAL'").get().n,4);
  assert.equal(db.prepare("SELECT origem FROM frms_jornada WHERE id='other-tenant'").get().origem,'SIGVOOS');
  db.close();
});
test('inverse CAS refuses changed post-state without partially restoring rows',async()=>{
  const db=setup(),binding=fakeD1(db);
  const before=loadFullImages(db),context=approval();
  context.approval.preimageSha256=validateQaPreimage(plan,before);
  await executeQaAtomicRepair({db:binding,plan,preimage:before,context});
  const after=loadFullImages(db);
  authorizeCompensation(context,before,after);
  db.prepare("UPDATE frms_jornada SET observacao='UNEXPECTED' WHERE id=?").run(plan.operations[2].id);
  await assert.rejects(()=>compensateQaAtomicRepair({
    db:binding,plan,preimage:before,postimage:after,context,
  }),/malformed JSON/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_alerta WHERE jornada_id IS NOT NULL").get().n,4);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_jornada WHERE origem='SIGVOOS' AND empresa_id=999013").get().n,4);
  db.close();
});

test('compensation CAS treats SQL NULL as an exact value and aborts on concurrent untouched-column drift atomically',async()=>{
  const db=setup(),binding=fakeD1(db);
  const before=loadFullImages(db),context=approval();
  context.approval.preimageSha256=validateQaPreimage(plan,before);
  await executeQaAtomicRepair({db:binding,plan,preimage:before,context});
  const after=loadFullImages(db);
  authorizeCompensation(context,before,after);
  const concurrentBinding=fakeD1(db,{beforeBatch(){
    // `resolvido_em` is outside the repair's write set and is NULL in the
    // approved postimage. This models another writer winning before D1.batch
    // acquires its transaction; the full-row predicate must reject it.
    db.prepare("UPDATE frms_alerta SET resolvido_em=? WHERE id=?")
      .run('2026-10-25T12:00:00Z',plan.operations[1].id);
  }});
  await assert.rejects(()=>compensateQaAtomicRepair({
    db:concurrentBinding,plan,preimage:before,postimage:after,context,
  }),/malformed JSON/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_jornada WHERE origem='SIGVOOS' AND empresa_id=999013").get().n,4);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM frms_alerta WHERE jornada_id IS NOT NULL").get().n,4);
  assert.equal(db.prepare("SELECT resolvido_em FROM frms_alerta WHERE id=?")
    .get(plan.operations[1].id).resolvido_em,'2026-10-25T12:00:00Z');
  db.close();
});

test('compensation rejects an alert image stripped of an untouched SQL column',async()=>{
  const db=setup(),binding=fakeD1(db);
  const before=loadFullImages(db),context=approval();
  context.approval.preimageSha256=validateQaPreimage(plan,before);
  await executeQaAtomicRepair({db:binding,plan,preimage:before,context});
  const after=loadFullImages(db);
  const partialBefore=structuredClone(before);
  const partialAfter=structuredClone(after);
  for(let i=0;i<plan.operations.length;i++){
    const removed=plan.operations[i].table==='frms_alerta'
      ? 'mensagem' : 'hora_primeiro_acionamento';
    delete partialBefore[i].original[removed];
    delete partialAfter[i].original[removed];
  }
  const {assertQaCompensationImages}=await import('../staging/frms-qa-cases-atomic-executor.mjs');
  assert.throws(()=>assertQaCompensationImages({
    plan,preimage:partialBefore,postimage:partialAfter,
  }),/QA_COMPENSATION_FULL_ROWS_REQUIRED/);
  db.close();
});


test('compensation rejects an unrecognized extra SQL field in both snapshot images',async()=>{
  const db=setup(),binding=fakeD1(db);
  const before=loadFullImages(db),context=approval();
  context.approval.preimageSha256=validateQaPreimage(plan,before);
  await executeQaAtomicRepair({db:binding,plan,preimage:before,context});
  const after=loadFullImages(db);
  // Simulates a migrated table with a newly added field absent from the
  // reviewed schema: neither pre nor post-image alone proves its contract.
  const futureBefore=structuredClone(before),futureAfter=structuredClone(after);
  for(let i=0;i<plan.operations.length;i++){
    if(plan.operations[i].table==='frms_alerta'){
      futureBefore[i].original.future_schema_column='UNKNOWN';
      futureAfter[i].original.future_schema_column='UNKNOWN';
    }
  }
  const {assertQaCompensationImages}=await import('../staging/frms-qa-cases-atomic-executor.mjs');
  assert.throws(()=>assertQaCompensationImages({
    plan,preimage:futureBefore,postimage:futureAfter,
  }),/QA_COMPENSATION_FULL_ROWS_REQUIRED/);
  db.close();
});


test('compensation accepts complete D1 journey rows across reviewed post-0351 migrations',async()=>{
  const db=setup(),binding=fakeD1(db);
  const extended=post0351JourneyColumns();
  assert.ok(extended.length>=17, 'expected migrations 0352-0354 to add >=17 journey columns');
  const actualCols=db.prepare('PRAGMA table_info(frms_jornada)').all().map(row=>row.name);
  assert.ok(extended.every(name=>actualCols.includes(name)),'migration-derived D1 column missing in fixture');
  const before=loadFullImages(db),context=approval();
  context.approval.preimageSha256=validateQaPreimage(plan,before);
  await executeQaAtomicRepair({db:binding,plan,preimage:before,context});
  const after=loadFullImages(db);
  const {assertQaCompensationImages}=await import('../staging/frms-qa-cases-atomic-executor.mjs');
  assert.deepEqual(Object.keys(assertQaCompensationImages({plan,preimage:before,postimage:after})).sort(),
    ['postimageSha256','preimageSha256']);
  db.close();
});
