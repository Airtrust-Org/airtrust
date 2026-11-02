/**
 * #1541 / #1322 / #1422 residuals — real SQLite (node:sqlite) with the
 * canonical cycle schema (migration 0346) and Schema V2 plan 0557.
 * Covers: concurrent renewals, renewal x cancellation, replay/race of a
 * SCORM commit from an archived cycle, injected failure at every write of the
 * renewal transaction, cross-tenant isolation, evidence preservation across
 * successive cycles, qualification attribution and the cron fallback path.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { ensureMatriculaCycle, resetMatriculaForNewCycle } from '../../services/lms-matricula-cycle';
import {
  assertScormCommitCycle,
  assertScormCycleWriteApplied,
  SCORM_ACTIVE_CYCLE_WRITE_GUARD_SQL,
  scormActiveCycleWriteGuardBinds,
} from '../../services/lms-scorm-cycle-guard';
import { ensureEadRenewalMatriculaForRow } from '../../cron/resilient/ead-renewal';

const sql = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const opened: SqliteD1Database[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

const TABLES = [
  'lms_matriculas', 'lms_matricula_ciclos', 'lms_progresso_scorm', 'lms_xapi_statements',
  'lms_completion_diagnostics_snapshots', 'lms_ciclo_evidencias', 'qualificacoes_historico',
  'audit_logs',
];

function fixture() {
  const db = new SqliteD1Database(); opened.push(db);
  db.database.exec(`
    CREATE TABLE lms_cursos (id INTEGER PRIMARY KEY,empresa_id INTEGER,scorm_package_r2_prefix TEXT);
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,funcionario_id INTEGER,
      status TEXT,deleted_at TEXT,observacoes TEXT,data_matricula TEXT,data_inicio TEXT,
      data_conclusao TEXT,data_expiracao TEXT,progresso_pct INTEGER,score_final INTEGER,
      tentativas INTEGER,qualificacao_historico_id INTEGER,matriculado_por INTEGER,
      ultimo_slide INTEGER,ultima_pagina INTEGER,created_at TEXT,updated_at TEXT,
      UNIQUE (empresa_id,curso_id,funcionario_id)
    );
    CREATE TABLE lms_historico_importado (id INTEGER PRIMARY KEY,empresa_id INTEGER,
      funcionario_id INTEGER,curso_id INTEGER,status TEXT,progresso_pct INTEGER,score_final REAL,
      qualificacao_historico_id INTEGER,data_conclusao TEXT,completed_at TEXT,created_at TEXT,
      updated_at TEXT,deleted_at TEXT);
    ${sql('migrations/0346_lms_matricula_ciclos_ssot.sql')}
    CREATE TABLE lms_progresso_scorm (
      id INTEGER PRIMARY KEY,matricula_id INTEGER UNIQUE,empresa_id INTEGER,lesson_status TEXT,
      completion_status TEXT,success_status TEXT,score_raw REAL,score_min REAL,
      score_max REAL,score_scaled REAL,session_time TEXT,total_time TEXT,
      suspend_data TEXT,launch_data TEXT,cmi_json TEXT,session_count INTEGER,
      last_commit_at TEXT,created_at TEXT,updated_at TEXT
    );
    CREATE TABLE lms_xapi_statements (
      id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula_id INTEGER,actor_json TEXT,
      verb_id TEXT,verb_display TEXT,object_id TEXT,object_type TEXT,result_json TEXT,
      context_json TEXT,timestamp TEXT,created_at TEXT
    );
    CREATE TABLE lms_completion_diagnostics_snapshots (
      id INTEGER PRIMARY KEY,empresa_id INTEGER,matricula_id INTEGER,
      tentativa INTEGER,diagnostics_json TEXT
    );
    ALTER TABLE qualificacoes_historico ADD COLUMN certificado_arquivo_id INTEGER;
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT,entity_type TEXT,
      entity_id INTEGER,old_values TEXT,new_values TEXT,empresa_id INTEGER,created_at TEXT
    );
    ${sql('migrations/0557_lms_cycle_evidence_archive.sql')}

    INSERT INTO lms_cursos VALUES (34,1,'lms/scorm/1/34/v1'),(35,2,'lms/scorm/2/35/v1');
    INSERT INTO qualificacoes_historico (id,empresa_id,funcionario_id,status,certificado_arquivo_id,data_vencimento)
      VALUES (700,1,77,'VIGENTE',910,'2026-10-20'),(701,2,88,'VIGENTE',911,'2026-10-20');
    INSERT INTO lms_matriculas VALUES
      (384,1,34,77,'CONCLUIDO',NULL,'t1','2025-10-01','2025-10-02','2025-10-03',NULL,100,93,2,700,NULL,41,41,NULL,NULL),
      (385,2,35,88,'CONCLUIDO',NULL,'t2','2025-10-01','2025-10-02','2025-10-03',NULL,100,88,1,701,NULL,20,20,NULL,NULL);
    -- Cycle rows as left by legacy completions: summary not yet materialized.
    INSERT INTO lms_matricula_ciclos (id,empresa_id,matricula_id,curso_id,funcionario_id,numero_ciclo,origem,status,ciclo_atual,progresso_pct,tentativas)
      VALUES (99,1,384,34,77,1,'LMS','EM_ANDAMENTO',1,99,2),(98,2,385,35,88,1,'LMS','CONCLUIDO',1,100,1);
    INSERT INTO lms_progresso_scorm (matricula_id,empresa_id,lesson_status,completion_status,success_status,score_raw,suspend_data,cmi_json,session_count)
      VALUES (384,1,'passed','completed','passed',93,'old-1','{"cmi.core.lesson_location":"41/41"}',2),
             (385,2,'passed','completed','passed',88,'old-2','{"cmi.core.lesson_location":"20/20"}',1);
    INSERT INTO lms_xapi_statements (id,empresa_id,matricula_id,actor_json,verb_id,object_id,created_at)
      VALUES (500,1,384,'{}','https://x.test/passed','urn:a','2025-10-03'),
             (501,2,385,'{}','https://x.test/passed','urn:b','2025-10-03');
    INSERT INTO lms_completion_diagnostics_snapshots VALUES (8,1,384,2,'{"t":1}'),(9,2,385,1,'{"t":2}');
  `);
  return db;
}

const one = (db: SqliteD1Database, q: string) => db.database.prepare(q).get() as Record<string, unknown>;
const all = (db: SqliteD1Database, q: string) => db.database.prepare(q).all() as Record<string, unknown>[];
const dump = (db: SqliteD1Database) =>
  JSON.stringify(TABLES.map((t) => all(db, `SELECT * FROM ${t} ORDER BY rowid`)));
const tenantTwo = (db: SqliteD1Database) => JSON.stringify(TABLES.filter((t) => t !== 'audit_logs')
  .map((t) => all(db, `SELECT * FROM ${t} WHERE empresa_id=2 ORDER BY rowid`)));
const renew = (d1: D1Database, empresaId = 1, matriculaId = 384) =>
  resetMatriculaForNewCycle(d1, { empresaId, matriculaId, origin: 'AUTO_RENOVACAO', observacoes: 'Renovação' });

/** Holds every batch until `parties` callers have finished their preflight reads. */
function gated(db: SqliteD1Database, parties: number, beforeRelease?: () => void) {
  let waiting: Array<() => void> = [];
  return new Proxy(db, {
    get(target, prop) {
      if (prop !== 'batch') {
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      }
      return async (statements: Parameters<SqliteD1Database['batch']>[0]) => {
        await new Promise<void>((release) => {
          waiting.push(release);
          if (waiting.length === parties) {
            beforeRelease?.();
            const all = waiting; waiting = []; all.forEach((r) => r());
          }
        });
        return target.batch(statements);
      };
    },
  }) as unknown as D1Database;
}

/** Same statement shape as POST /matriculas/scorm/commit (guarded upsert). */
async function guardedCommit(db: SqliteD1Database, cicloId: number, cmi: string) {
  const r = await db.asD1().prepare(`INSERT INTO lms_progresso_scorm
      (matricula_id,empresa_id,lesson_status,cmi_json,session_count,last_commit_at)
      SELECT ?,?,?,?,1,datetime('now') WHERE ${SCORM_ACTIVE_CYCLE_WRITE_GUARD_SQL}
      ON CONFLICT(matricula_id) DO UPDATE SET lesson_status=excluded.lesson_status,
        cmi_json=COALESCE(excluded.cmi_json,lms_progresso_scorm.cmi_json),
        session_count=lms_progresso_scorm.session_count+1`)
    .bind(384, 1, 'passed', cmi, ...scormActiveCycleWriteGuardBinds(cicloId, 384, 1)).run();
  assertScormCycleWriteApplied(r.meta?.changes);
}

describe('LMS cycle renewal integrity (#1541)', () => {
  it('two simultaneous renewals after both preflights: exactly one cycle, one archive, one audit', async () => {
    const db = fixture();
    const d1 = gated(db, 2);
    const outcomes = await Promise.allSettled([renew(d1), renew(d1)]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult;
    expect(String(rejected.reason)).toContain('LMS_CYCLE_CONCURRENT_CHANGE');
    expect(all(db, 'SELECT numero_ciclo,ciclo_atual FROM lms_matricula_ciclos WHERE matricula_id=384 ORDER BY numero_ciclo'))
      .toEqual([{ numero_ciclo: 1, ciclo_atual: 0 }, { numero_ciclo: 2, ciclo_atual: 1 }]);
    expect(one(db, 'SELECT COUNT(*) n FROM lms_ciclo_evidencias')).toEqual({ n: 1 });
    expect(one(db, "SELECT COUNT(*) n FROM audit_logs WHERE action='LMS_CYCLE_ATOMIC_RENEWAL'")).toEqual({ n: 1 });
    expect(one(db, "SELECT observacoes FROM lms_matriculas WHERE id=384").observacoes).not.toContain('LMS_CYCLE_RESET');
  });

  it('renewal racing a cancellation is rejected with zero writes', async () => {
    const db = fixture();
    const d1 = gated(db, 1, () => db.database.exec("UPDATE lms_matriculas SET status='CANCELADO' WHERE id=384"));
    const before = dump(db);
    await expect(renew(d1)).rejects.toThrow('LMS_CYCLE_CONCURRENT_CHANGE');
    db.database.exec("UPDATE lms_matriculas SET status='CONCLUIDO' WHERE id=384");
    expect(dump(db)).toBe(before);
  });

  const failurePoints: Array<[string, string]> = [
    ['archive snapshot', 'BEFORE INSERT ON lms_ciclo_evidencias'],
    ['xAPI attribution', 'BEFORE UPDATE OF archived_cycle_id ON lms_xapi_statements'],
    ['previous cycle close', 'BEFORE UPDATE OF ciclo_atual ON lms_matricula_ciclos'],
    ['qualification attribution', 'BEFORE UPDATE OF lms_matricula_ciclo_id ON qualificacoes_historico'],
    ['CMI reset', 'BEFORE UPDATE ON lms_progresso_scorm'],
    ['diagnostics clear', 'BEFORE DELETE ON lms_completion_diagnostics_snapshots'],
    ['enrollment reset', "BEFORE UPDATE ON lms_matriculas WHEN NEW.status='NAO_INICIADO'"],
    ['new cycle insert', 'BEFORE INSERT ON lms_matricula_ciclos'],
    ['audit receipt', 'BEFORE INSERT ON audit_logs'],
  ];
  it.each(failurePoints)('failure injected at %s leaves no partial effect', async (_label, when) => {
    const db = fixture();
    const before = dump(db);
    db.database.exec(`CREATE TRIGGER injected_failure ${when} BEGIN SELECT RAISE(ABORT,'INJECTED'); END;`);
    await expect(renew(db.asD1())).rejects.toThrow('INJECTED');
    expect(dump(db)).toBe(before);
    db.database.exec('DROP TRIGGER injected_failure');
    expect(await renew(db.asD1())).toBeGreaterThan(99); // a clean retry still succeeds
  });

  it('rejects a replayed SCORM commit of the archived cycle and closes the guard→write race', async () => {
    const db = fixture();
    // Late tab passed the read guard while cycle 99 was current...
    await expect(assertScormCommitCycle(db.asD1(), 1, 384, 99)).resolves.toBeUndefined();
    const newCycle = await renew(db.asD1());
    // ...and its write lands after the renewal: nothing is written.
    await expect(guardedCommit(db, 99, '{"cmi.core.lesson_location":"41/41"}'))
      .rejects.toMatchObject({ statusCode: 409, code: 'LMS_SCORM_CYCLE_MISMATCH' });
    await expect(assertScormCommitCycle(db.asD1(), 1, 384, 99))
      .rejects.toMatchObject({ statusCode: 409, code: 'LMS_SCORM_CYCLE_MISMATCH' });
    expect(one(db, 'SELECT cmi_json,lesson_status,session_count FROM lms_progresso_scorm WHERE matricula_id=384'))
      .toEqual({ cmi_json: null, lesson_status: null, session_count: 0 });
    // The new cycle's own session writes normally.
    await guardedCommit(db, Number(newCycle), '{"cmi.core.lesson_location":"1/41"}');
    expect(one(db, 'SELECT cmi_json FROM lms_progresso_scorm WHERE matricula_id=384').cmi_json)
      .toBe('{"cmi.core.lesson_location":"1/41"}');
  });

  it('the commit route uses the write-time cycle guard in the upsert itself', () => {
    const route = sql('src/routes/lms-matriculas.ts');
    const commit = route.slice(route.indexOf("app.post('/scorm/commit'"), route.indexOf("app.post('/:id/finalizar'"));
    expect(commit).toMatch(/SELECT \?(,\?){13},1,datetime\('now'\) WHERE \$\{CYCLE_WRITE_GUARD\}/);
    expect(commit).toContain('cycleGuardBinds(Number(d.ciclo_id), d.matricula_id, empresaId)');
    expect(commit).toContain('assertCycleWrite((await db');
    expect(commit).not.toMatch(/VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,1/);
  });

  it('cross-tenant: foreign tenant cannot renew; renewal of tenant 1 leaves tenant 2 byte-identical', async () => {
    const db = fixture();
    const t2 = tenantTwo(db);
    await expect(renew(db.asD1(), 2, 384)).rejects.toThrow('LMS_CYCLE_ENROLLMENT_NOT_FOUND');
    expect(await ensureMatriculaCycle(db.asD1(), { matriculaId: 384, empresaId: 2 })).toBeNull();
    await renew(db.asD1(), 1, 384);
    expect(tenantTwo(db)).toBe(t2);
    expect(one(db, 'SELECT COUNT(*) n FROM lms_ciclo_evidencias WHERE empresa_id=2')).toEqual({ n: 0 });
  });

  it('freezes the previous cycle summary and attributes its qualification without duplicating it', async () => {
    const db = fixture();
    const qualifications = one(db, 'SELECT COUNT(*) n FROM qualificacoes_historico');
    await renew(db.asD1());
    expect(one(db, 'SELECT status,progresso_pct,score_final,data_conclusao,qualificacao_historico_id FROM lms_matricula_ciclos WHERE id=99'))
      .toEqual({ status: 'CONCLUIDO', progresso_pct: 100, score_final: 93, data_conclusao: '2025-10-03', qualificacao_historico_id: 700 });
    expect(one(db, 'SELECT lms_matricula_ciclo_id,status,certificado_arquivo_id FROM qualificacoes_historico WHERE id=700'))
      .toEqual({ lms_matricula_ciclo_id: 99, status: 'VIGENTE', certificado_arquivo_id: 910 });
    expect(one(db, 'SELECT COUNT(*) n FROM qualificacoes_historico')).toEqual(qualifications);
    expect(one(db, 'SELECT qualificacao_historico_id,progresso_pct,score_final FROM lms_matricula_ciclos WHERE ciclo_atual=1 AND matricula_id=384'))
      .toEqual({ qualificacao_historico_id: null, progresso_pct: 0, score_final: null });
  });

  it('never re-points a qualification already linked to another cycle', async () => {
    const db = fixture();
    db.database.exec(`INSERT INTO lms_matricula_ciclos (id,empresa_id,matricula_id,curso_id,funcionario_id,numero_ciclo,origem,status,ciclo_atual,deleted_at)
      VALUES (50,1,384,34,77,0,'LMS','CONCLUIDO',0,NULL);
      UPDATE qualificacoes_historico SET lms_matricula_ciclo_id=50 WHERE id=700;`);
    await renew(db.asD1());
    expect(one(db, 'SELECT lms_matricula_ciclo_id FROM qualificacoes_historico WHERE id=700')).toEqual({ lms_matricula_ciclo_id: 50 });
  });

  it('preserves immutable evidence of every successive cycle, attributed to its own cycle', async () => {
    const db = fixture();
    const second = Number(await renew(db.asD1()));
    db.database.exec(`
      INSERT INTO lms_xapi_statements (id,empresa_id,matricula_id,actor_json,verb_id,object_id,created_at)
        VALUES (502,1,384,'{}','https://x.test/passed','urn:a','2026-10-03');
      UPDATE lms_progresso_scorm SET lesson_status='passed',cmi_json='{"cycle":2}',suspend_data='new-2' WHERE matricula_id=384;
      UPDATE lms_matriculas SET status='CONCLUIDO',progresso_pct=100,score_final=97,data_conclusao='2026-10-03' WHERE id=384;`);
    const third = Number(await renew(db.asD1()));
    expect(third).toBeGreaterThan(second);
    expect(all(db, 'SELECT id,archived_cycle_id FROM lms_xapi_statements WHERE empresa_id=1 ORDER BY id'))
      .toEqual([{ id: 500, archived_cycle_id: 99 }, { id: 502, archived_cycle_id: second }]);
    const archives = all(db, 'SELECT ciclo_id,scorm_json FROM lms_ciclo_evidencias ORDER BY ciclo_id');
    expect(archives.map((a) => a.ciclo_id)).toEqual([99, second]);
    expect(JSON.parse(String(archives[0].scorm_json))).toMatchObject({ suspend_data: 'old-1', score_raw: 93 });
    expect(JSON.parse(String(archives[1].scorm_json))).toMatchObject({ suspend_data: 'new-2', cmi_json: '{"cycle":2}' });
    expect(one(db, `SELECT status,score_final FROM lms_matricula_ciclos WHERE id=${second}`))
      .toEqual({ status: 'CONCLUIDO', score_final: 97 });
    expect(all(db, 'SELECT numero_ciclo FROM lms_matricula_ciclos WHERE matricula_id=384 ORDER BY numero_ciclo').map((r) => r.numero_ciclo))
      .toEqual([1, 2, 3]);
    expect(() => db.database.exec('DELETE FROM lms_ciclo_evidencias')).toThrow('LMS_CYCLE_EVIDENCE_IMMUTABLE');
    expect(() => db.database.exec('DELETE FROM lms_xapi_statements WHERE id=502')).toThrow('LMS_XAPI_HISTORICAL_IMMUTABLE');
  });
});

describe('EAD renewal cron fallback on a CONCLUIDO enrollment (#1322), real SQLite', () => {
  const row = { qualificacao_historico_id: 700, funcionario_id: 77, empresa_id: 1,
    qualificacao_id: 31, curso_id: 34, curso_titulo: 'PBN' };

  it('opens a new cycle instead of skipping, without duplicating the enrollment; retry is idempotent', async () => {
    const db = fixture();
    expect(await ensureEadRenewalMatriculaForRow(db.asD1(), row))
      .toEqual({ matriculaId: 384, created: false, active: true });
    expect(one(db, 'SELECT COUNT(*) n FROM lms_matriculas WHERE empresa_id=1')).toEqual({ n: 1 });
    expect(one(db, 'SELECT origem,status,numero_ciclo FROM lms_matricula_ciclos WHERE matricula_id=384 AND ciclo_atual=1'))
      .toEqual({ origem: 'AUTO_RENOVACAO', status: 'NAO_INICIADO', numero_ciclo: 2 });
    expect(one(db, 'SELECT COUNT(*) n FROM lms_ciclo_evidencias')).toEqual({ n: 1 });
    // Re-discovery (e.g. after an ambiguous response) keeps the active cycle.
    await ensureEadRenewalMatriculaForRow(db.asD1(), row);
    expect(one(db, 'SELECT COUNT(*) n FROM lms_matricula_ciclos WHERE matricula_id=384')).toEqual({ n: 2 });
    expect(one(db, 'SELECT COUNT(*) n FROM lms_ciclo_evidencias')).toEqual({ n: 1 });
  });
});
