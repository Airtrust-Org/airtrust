// source_reference: #1426, governed FRMS QA synthetic fixture inspection.
// operational_decision: test bounded CAS statements only, no operational approval.
// dry_run_required: Node unit tests; no network and no D1 connection.
// rollback_plan_required: encrypted preimage + per-row inverse CAS before any approved apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewPlan, assertReviewPlan, EXPECTED_IDS } from '../staging/frms-qa-cases-repair-plan.mjs';
const days=Array.from({length:30},(_,i)=>({
  day:new Date(Date.parse('2026-09-14T00:00:00Z')+i*86400000).toISOString().slice(0,10),
  jornadas:'5-9',
}));
test('eight exact-target operations, four alerts and four journeys only',()=>{
  const p=buildReviewPlan(days);
  assert.equal(assertReviewPlan(p),true);
  assert.equal(p.operations.length,8);
  assert.deepEqual(p.operations.filter(x=>x.table==='frms_alerta').map(x=>x.id),EXPECTED_IDS);
  assert.equal(p.writes,0);
  assert.equal(p.apply_authorized,false);
  assert.match(p.sql_sha256,/^[a-f0-9]{64}$/);
});
test('line-level CAS refuses wrong owner, date, source, missing journey or previous treatment',()=>{
  const p=buildReviewPlan(days);
  for(const op of p.operations){
    assert.match(op.sql,/deleted_at IS NULL/);
    assert.match(op.sql,/UPDATE frms_(alerta|jornada) SET/);
    assert.doesNotMatch(op.sql,/\b(?:DELETE|INSERT|DROP|ALTER|REPLACE)\b/i);
    if(op.table==='frms_alerta'){
      assert.match(op.sql,/jornada_id IS NULL AND resolvido=0/);
      assert.match(op.sql,/COALESCE\(TRIM\(notas_resolucao\),' '\)=''|COALESCE\(TRIM\(notas_resolucao\),'\)=''|COALESCE\(TRIM\(notas_resolucao\),''\)=''/);
      assert.match(op.sql,/AND .*IS NOT NULL AND .* > 0/s);
      assert.match(op.sql,/tripulante_id=.*FROM funcionarios/s);
    }else{
      assert.match(op.sql,/origem='MANUAL'/);
      assert.match(op.sql,/registrado_por='QA_FRMS_UX'/);
      assert.match(op.sql,/origem='SIGVOOS'/);
    }
  }
});
test('plan is deterministic and rejects wrong cohort',()=>{
  const x=buildReviewPlan(days), y=buildReviewPlan(days);
  assert.equal(x.sql_sha256,y.sql_sha256);
  assert.throws(()=>buildReviewPlan(days.slice(1)),/QA_30D_SOURCE_REQUIRED/);
  assert.throws(()=>assertReviewPlan({...x,operations:x.operations.slice(1)}),/REPAIR_PLAN_SCOPE_REJECTED/);
});

test('SQLite: single reviewed batch changes only 8 QA rows; a drift aborts the whole transaction', async()=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {LEGACY_CASE_BASELINE,expectedQaCases}=await import('../staging/inspect-frms-ux-cases.mjs');
  const setup=()=>{
    const db=new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, matricula TEXT NOT NULL, ativo INTEGER, deleted_at TEXT);
      CREATE TABLE frms_jornada (id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, tripulante_id INTEGER NOT NULL, data TEXT NOT NULL, registrado_por TEXT, origem TEXT, observacao TEXT, duracao_jornada_minutos INTEGER, updated_at TEXT, deleted_at TEXT);
      CREATE TABLE frms_alerta (id TEXT PRIMARY KEY, tripulante_id INTEGER, jornada_id TEXT, tipo_limite TEXT, nivel TEXT, created_at TEXT, mensagem TEXT, resolvido INTEGER, valor_atual_min INTEGER, valor_limite_min INTEGER, notas_resolucao TEXT, updated_at TEXT, deleted_at TEXT);`);
    for(let i=1;i<=14;i++)db.prepare('INSERT INTO funcionarios(id,empresa_id,matricula,ativo) VALUES(?,?,?,1)')
      .run(i,999013,'QA-FRMS-UX-'+String(i).padStart(2,'0'));
    db.prepare('INSERT INTO funcionarios(id,empresa_id,matricula,ativo) VALUES(100,7,?,1)')
      .run('QA-FRMS-UX-01');
    const wants=expectedQaCases(days);
    for(let i=0;i<4;i++){
      const want=wants[i], old=LEGACY_CASE_BASELINE[i], crew=Number(want.matricula.slice(-2));
      db.prepare(`INSERT INTO frms_jornada(id,empresa_id,tripulante_id,data,registrado_por,origem,observacao,duracao_jornada_minutos,updated_at)
      VALUES(?,999013,?,?,'QA_FRMS_UX','MANUAL','CENARIO SINTETICO - SEM VALIDADE OPERACIONAL',540,'old')`)
        .run('qa-frms-ux-j-'+want.date+'-'+want.matricula,crew,want.date);
      db.prepare(`INSERT INTO frms_alerta(id,tripulante_id,jornada_id,tipo_limite,nivel,created_at,mensagem,resolvido,valor_atual_min,valor_limite_min,updated_at)
      VALUES(?,?,NULL,?,?,?,'QA SINTETICO: revisar contexto e registrar providencia',0,620,540,'old')`)
        .run(old.id,Number(old.owner.slice(-2)),old.kind,old.level,old.day+' 10:00:00');
    }
    db.prepare(`INSERT INTO frms_jornada(id,empresa_id,tripulante_id,data,registrado_por,origem,observacao,duracao_jornada_minutos)
      VALUES('other-tenant-j',7,100,'2026-10-13','QA_FRMS_UX','MANUAL','KEEP',540)`).run();
    db.prepare(`INSERT INTO frms_alerta(id,tripulante_id,resolvido,valor_atual_min)
      VALUES('other-tenant-case',100,0,999)`).run();
    return {db,wants};
  };
  const applyAtomic=(db,plan)=>{
    db.exec('BEGIN IMMEDIATE');
    try {
      for(const statement of plan.operations) {
        const result=db.prepare(statement.sql).run();
        if(result.changes!==1)throw new Error('CAS_ROW_COUNT_BLOCKED:'+statement.id);
      }
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  };
  const plan=buildReviewPlan(days);
  const good=setup();
  applyAtomic(good.db,plan);
  const count=good.db.prepare(`SELECT COUNT(*) AS n FROM frms_alerta a
    JOIN frms_jornada j ON j.id=a.jornada_id AND j.tripulante_id=a.tripulante_id
    WHERE a.id IN ('qa-frms-ux-case-1','qa-frms-ux-case-2','qa-frms-ux-case-3','qa-frms-ux-case-4')
    AND j.origem='SIGVOOS' AND j.empresa_id=999013`).get();
  assert.equal(count.n,4);
  assert.deepEqual({...good.db.prepare('SELECT origem,observacao FROM frms_jornada WHERE id=?')
    .get('other-tenant-j')},{origem:'MANUAL',observacao:'KEEP'});
  assert.equal(good.db.prepare('SELECT valor_atual_min FROM frms_alerta WHERE id=?')
    .get('other-tenant-case').valor_atual_min,999);
  assert.throws(()=>applyAtomic(good.db,plan),/CAS_ROW_COUNT_BLOCKED/);
  const drift=setup();
  drift.db.prepare("UPDATE frms_jornada SET origem='REAL' WHERE id=?")
    .run('qa-frms-ux-j-'+drift.wants[1].date+'-'+drift.wants[1].matricula);
  assert.throws(()=>applyAtomic(drift.db,plan),/CAS_ROW_COUNT_BLOCKED/);
  assert.equal(drift.db.prepare("SELECT COUNT(*) AS n FROM frms_jornada WHERE origem='SIGVOOS'").get().n,0);
  assert.equal(drift.db.prepare("SELECT COUNT(*) AS n FROM frms_alerta WHERE jornada_id IS NOT NULL").get().n,0);
});
