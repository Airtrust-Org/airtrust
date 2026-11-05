// source_reference: issue #1213; docs/ops/LMS_NON_SCORM_COMPLETION_EVIDENCE_CONTRACT.md
// operational_decision: synthetic, in-memory SQLite fixtures only; no operational database writes.
// dry_run_required: no remote connection; schema applied to disposable :memory: database.
// rollback_plan_required: dispose SQLite in-memory database at test end; no production state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const change = readFileSync(
  new URL('../../worker-airtrust/schema-v2/changes/0574_lms_pptx_slide_evidence.sql', import.meta.url),
  'utf8',
);

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE funcionarios(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    CREATE TABLE lms_cursos(
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, ativo INTEGER,
      publicado INTEGER, tipo_conteudo TEXT, gerar_qualificacao_ao_concluir INTEGER,
      pptx_slide_count INTEGER, deleted_at TEXT
    );
    CREATE TABLE lms_matriculas(
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, curso_id INTEGER,
      funcionario_id INTEGER, status TEXT, deleted_at TEXT
    );
    CREATE TABLE lms_matricula_ciclos(
      id INTEGER PRIMARY KEY, matricula_id INTEGER, empresa_id INTEGER,
      curso_id INTEGER, funcionario_id INTEGER, ciclo_atual INTEGER, deleted_at TEXT
    );
    INSERT INTO funcionarios VALUES (60,6),(61,6),(70,7);
    INSERT INTO lms_cursos VALUES (22,6,1,1,'pptx',1,3,NULL),(23,7,1,1,'pptx',1,3,NULL);
    INSERT INTO lms_matriculas VALUES (200,6,22,60,'EM_ANDAMENTO',NULL),
                                    (201,7,23,70,'EM_ANDAMENTO',NULL);
    INSERT INTO lms_matricula_ciclos VALUES (500,200,6,22,60,1,NULL),
                                          (501,201,7,23,70,1,NULL);
  `);
  db.exec(change);
  return db;
}

const HASH='a'.repeat(64);
function add(db, slide=0, overrides={}) {
  const e={tenant:6, enrollment:200, course:22, employee:60, cycle:500,
           hash:HASH,slide,total:3,...overrides};
  return db.prepare(`INSERT INTO lms_pptx_slide_evidences
    (empresa_id,matricula_id,curso_id,funcionario_id,ciclo_id,content_sha256,slide_index,total_slides,server_received_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(e.tenant,e.enrollment,e.course,e.employee,e.cycle,
                                     e.hash,e.slide,e.total, '2026-11-05T10:00:00.000Z');
}

test('immutable, tenant-scoped PPTX ledger accepts current enrolled learner only',()=>{
  const db=fixture();
  add(db,0); add(db,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lms_pptx_slide_evidences').get().n,2);
  assert.throws(()=>add(db,2,{tenant:7}),/PPTX_EVIDENCE_SCOPE_INVALID/);
  assert.throws(()=>add(db,2,{employee:61}),/PPTX_EVIDENCE_SCOPE_INVALID/);
  assert.throws(()=>add(db,2,{course:23}),/PPTX_EVIDENCE_SCOPE_INVALID/);
  assert.throws(()=>add(db,2,{cycle:501}),/PPTX_EVIDENCE_SCOPE_INVALID/);
  assert.throws(()=>add(db,2,{total:4}),/PPTX_EVIDENCE_SCOPE_INVALID/);
  assert.throws(()=>db.exec('UPDATE lms_pptx_slide_evidences SET slide_index=2 WHERE slide_index=0'),/PPTX_EVIDENCE_IMMUTABLE/);
  assert.throws(()=>db.exec('DELETE FROM lms_pptx_slide_evidences'),/PPTX_EVIDENCE_IMMUTABLE/);
  db.close();
});

test('evidence cannot be posted for completed, cancelled or unpublished enrollment',()=>{
  const db=fixture();
  db.exec("UPDATE lms_matriculas SET status='CONCLUIDO' WHERE id=200");
  assert.throws(()=>add(db),/PPTX_EVIDENCE_SCOPE_INVALID/);
  db.exec("UPDATE lms_matriculas SET status='CANCELADO' WHERE id=200");
  assert.throws(()=>add(db),/PPTX_EVIDENCE_SCOPE_INVALID/);
  db.exec("UPDATE lms_matriculas SET status='EM_ANDAMENTO' WHERE id=200");
  db.exec('UPDATE lms_cursos SET publicado=0 WHERE id=22');
  assert.throws(()=>add(db),/PPTX_EVIDENCE_SCOPE_INVALID/);
  db.close();
});

test('new cycle and edition cannot reuse or overwrite prior evidence',()=>{
  const db=fixture();
  add(db);
  db.exec('UPDATE lms_matricula_ciclos SET ciclo_atual=0 WHERE id=500');
  db.exec('INSERT INTO lms_matricula_ciclos VALUES (502,200,6,22,60,1,NULL)');
  assert.throws(()=>add(db,1),/PPTX_EVIDENCE_SCOPE_INVALID/);
  add(db,0,{cycle:502});
  add(db,0,{cycle:502,hash:'b'.repeat(64)});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lms_pptx_slide_evidences').get().n,3);
  assert.throws(()=>add(db,0),/PPTX_EVIDENCE_SCOPE_INVALID/);
  db.close();
});

test('SQL unique index makes a repeated slide immutable and idempotent',()=>{
  const db=fixture();
  add(db);
  assert.throws(()=>add(db),/UNIQUE constraint failed/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lms_pptx_slide_evidences').get().n,1);
  db.close();
});
