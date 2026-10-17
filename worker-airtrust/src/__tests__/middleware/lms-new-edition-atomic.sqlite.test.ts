import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

const { hasRoleMock } = vi.hoisted(() => ({ hasRoleMock: vi.fn(() => true) }));
vi.mock('../../middleware/rbac', () => ({ hasRole: hasRoleMock }));
import { enforceLmsEnrollmentIntegrity } from '../../middleware/lms-enrollment-integrity';

const opened: SqliteD1Database[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });
beforeEach(() => { vi.clearAllMocks(); hasRoleMock.mockReturnValue(true); });

function fixture(withMigration = true) {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(`
    CREATE TABLE lms_cursos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, tipo_conteudo TEXT,
      scorm_package_r2_prefix TEXT, ativo INTEGER, publicado INTEGER, deleted_at TEXT
    );
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      funcionario_id INTEGER, status TEXT, deleted_at TEXT, qualificacao_historico_id INTEGER,
      progresso_pct INTEGER, score_final INTEGER, tentativas INTEGER, data_inicio TEXT,
      data_conclusao TEXT, data_expiracao TEXT, data_matricula TEXT,
      ultimo_slide INTEGER, ultima_pagina INTEGER, matriculado_por INTEGER,
      observacoes TEXT, updated_at TEXT
    );
    CREATE TABLE lms_matricula_ciclos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, matricula_id INTEGER, curso_id INTEGER,
      funcionario_id INTEGER, numero_ciclo INTEGER, origem TEXT, status TEXT,
      ciclo_atual INTEGER, deleted_at TEXT, observacoes TEXT, data_matricula TEXT,
      progresso_pct INTEGER, tentativas INTEGER, created_at TEXT, updated_at TEXT
    );
    CREATE UNIQUE INDEX idx_only_one_cycle
      ON lms_matricula_ciclos(matricula_id) WHERE ciclo_atual=1 AND deleted_at IS NULL;
    CREATE TABLE lms_progresso_scorm (
      id INTEGER PRIMARY KEY, matricula_id INTEGER, empresa_id INTEGER,
      lesson_status TEXT, completion_status TEXT, success_status TEXT,
      score_raw REAL, score_min REAL, score_max REAL, score_scaled REAL,
      session_time TEXT, total_time TEXT, suspend_data TEXT, launch_data TEXT,
      cmi_json TEXT, session_count INTEGER, last_commit_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE TABLE lms_xapi_statements (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, matricula_id INTEGER,
      verb_id TEXT, created_at TEXT
    );
    CREATE TABLE lms_completion_diagnostics_snapshots (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, matricula_id INTEGER,
      tentativa INTEGER, diagnostics_json TEXT
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, entity_type TEXT,
      entity_id INTEGER, old_values TEXT, new_values TEXT,
      ip_address TEXT, user_agent TEXT, empresa_id INTEGER, created_at TEXT
    );
    INSERT INTO lms_cursos VALUES (34,1,'scorm','lms/scorm/1/34/new/',1,1,NULL);
    INSERT INTO lms_matriculas VALUES
      (384,1,34,77,'EM_ANDAMENTO',NULL,NULL,99,100,2,'2026-10-01',
       NULL,NULL,'2026-10-01',41,41,NULL,'','2026-10-02');
    INSERT INTO lms_matricula_ciclos
      (id,empresa_id,matricula_id,curso_id,funcionario_id,numero_ciclo,origem,
       status,ciclo_atual,progresso_pct,tentativas)
      VALUES (99,1,384,34,77,1,'LMS','EM_ANDAMENTO',1,99,2);
    INSERT INTO lms_progresso_scorm
      (id,matricula_id,empresa_id,lesson_status,completion_status,success_status,
       score_raw,suspend_data,cmi_json,session_count,last_commit_at)
      VALUES (2,384,1,'incomplete','incomplete','unknown',NULL,'saved-answers',
        '{"cmi.core.lesson_location":"41/41","airtrust.total_slides":41}',
        2,'2026-10-02');
    INSERT INTO lms_xapi_statements VALUES
      (500,1,384,'https://example.test/experienced','2026-10-02');
    INSERT INTO lms_completion_diagnostics_snapshots
      VALUES (3,1,384,2,'{"pending":["slide-41"]}');
  `);
  if (withMigration) {
    // Use the actual additive DDL and integrity triggers, not a mocked schema.
    // The canonical 0337 SCORM table has no physical lesson_location column.
    db.database.exec(readFileSync(resolve(process.cwd(),
      'migrations/0557_lms_cycle_evidence_archive.sql'), 'utf8'));
  }
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    c.set('empresaId' as never, 1 as never);
    c.set('userId' as never, 42 as never);
    const blocked = await enforceLmsEnrollmentIntegrity(c as never);
    if (blocked) return blocked;
    await next();
  });
  app.post('/api/lms/matriculas/:id/nova-edicao', c => c.json({ fallback: true }));
  const bucket = {
    get: vi.fn(async () => ({
      size: 256,
      text: async () => JSON.stringify({
        content: { requiredSlides: Array.from({length: 37}, (_, i) => `slide-${i + 1}`) }
      })
    }))
  } as unknown as R2Bucket;
  const post = (empresaId = 1) => {
    const tenantApp = app; // tenant is authenticated server context, never client body.
    if (empresaId !== 1) {
      // Different tenant cannot select the protected matrícula even by ID.
      const crossTenant = new Hono<{ Bindings: Env }>();
      crossTenant.use('*', async (c,next) => {
        c.set('empresaId' as never, empresaId as never);
        c.set('userId' as never, 42 as never);
        const blocked=await enforceLmsEnrollmentIntegrity(c as never);
        if (blocked) return blocked;
        return next();
      });
      crossTenant.post('/api/lms/matriculas/:id/nova-edicao',c=>c.json({fallback:true}));
      return crossTenant.fetch(new Request('http://localhost/api/lms/matriculas/384/nova-edicao', {
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({reason:'Nova edição autorizada na empresa'})
      }),{DB:db.asD1(),BUCKET:bucket} as Env,{} as ExecutionContext);
    }
    return tenantApp.fetch(new Request('http://localhost/api/lms/matriculas/384/nova-edicao', {
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({reason:'Nova edição autorizada na empresa'})
    }),{DB:db.asD1(),BUCKET:bucket} as Env,{} as ExecutionContext);
  };
  return {db,post};
}

function row(db:SqliteD1Database,sql:string) {
  return db.database.prepare(sql).get() as Record<string,unknown>;
}

describe('nova-edicao route on D1 SQLite with Schema V2 0557',()=>{
  it('archives prior SCORM/diagnostics and xAPI transactionally, without falsely assigning new package to old cycle',async()=>{
    const {db,post}=fixture();
    const res=await post();
    expect(res.status).toBe(200);
    expect(row(db,"SELECT status,progresso_pct,ultimo_slide,qualificacao_historico_id FROM lms_matriculas WHERE id=384"))
      .toEqual({status:'NAO_INICIADO',progresso_pct:0,ultimo_slide:0,qualificacao_historico_id:null});
    const old=row(db,"SELECT enrollment_json,scorm_json,diagnostics_json,course_package_prefix FROM lms_ciclo_evidencias WHERE ciclo_id=99");
    expect(old.course_package_prefix).toBe(null);
    expect(JSON.parse(String(old.enrollment_json))).toMatchObject({
      historical_edition_provenance:{previous_package_prefix:null,status:'HISTORICAL_PACKAGE_PREFIX_UNVERIFIED'}
    });
    expect(JSON.parse(String(old.scorm_json))).toMatchObject({suspend_data:'saved-answers',session_count:2});
    expect(JSON.parse(String(old.diagnostics_json))).toHaveLength(1);
    expect(row(db,"SELECT COUNT(*) AS n FROM lms_completion_diagnostics_snapshots WHERE matricula_id=384")).toEqual({n:0});
    expect(row(db,"SELECT archived_cycle_id FROM lms_xapi_statements WHERE id=500")).toEqual({archived_cycle_id:99});
    expect(row(db,"SELECT COUNT(*) AS n FROM lms_matricula_ciclos WHERE matricula_id=384 AND ciclo_atual=1")).toEqual({n:1});
    expect(row(db,"SELECT suspend_data,cmi_json,session_count FROM lms_progresso_scorm WHERE matricula_id=384"))
      .toEqual({suspend_data:null,cmi_json:null,session_count:0});
  });
  it('prevents duplicate or concurrent edition resets and never creates two current cycles',async()=>{
    const {db,post}=fixture();
    const statuses=(await Promise.all([post(),post()])).map(r=>r.status);
    expect(statuses.sort()).toEqual([200,409]);
    expect(row(db,"SELECT COUNT(*) AS n FROM lms_ciclo_evidencias")).toEqual({n:1});
    expect(row(db,"SELECT COUNT(*) AS n FROM lms_matricula_ciclos WHERE matricula_id=384 AND ciclo_atual=1")).toEqual({n:1});
  });
  it('rolls back every write on late audit failure',async()=>{
    const {db,post}=fixture();
    db.database.exec(`CREATE TRIGGER simulate_audit_failure BEFORE INSERT ON audit_logs
      BEGIN SELECT RAISE(ABORT, 'SIMULATED_AUDIT_FAILURE'); END;`);
    const res=await post();
    expect(res.status).toBe(409);
    expect(row(db,"SELECT status,ultimo_slide,progresso_pct FROM lms_matriculas WHERE id=384"))
      .toEqual({status:'EM_ANDAMENTO',ultimo_slide:41,progresso_pct:99});
    expect(row(db,"SELECT COUNT(*) AS n FROM lms_ciclo_evidencias")).toEqual({n:0});
    expect(row(db,"SELECT archived_cycle_id FROM lms_xapi_statements WHERE id=500")).toEqual({archived_cycle_id:null});
    expect(row(db,"SELECT COUNT(*) AS n FROM lms_completion_diagnostics_snapshots")).toEqual({n:1});
  });
  it('fails closed if migration 0557 was not applied',async()=>{
    const {db,post}=fixture(false);
    const res=await post();
    expect(res.status).toBe(409);
    expect(row(db,"SELECT status,progresso_pct FROM lms_matriculas WHERE id=384"))
      .toEqual({status:'EM_ANDAMENTO',progresso_pct:99});
  });
  it('enforces authenticated tenant boundary on edition reset',async()=>{
    const {db,post}=fixture();
    const res=await post(2);
    expect([403,404]).toContain(res.status);
    expect(row(db,"SELECT status,ultimo_slide FROM lms_matriculas WHERE id=384"))
      .toEqual({status:'EM_ANDAMENTO',ultimo_slide:41});
  });
});
