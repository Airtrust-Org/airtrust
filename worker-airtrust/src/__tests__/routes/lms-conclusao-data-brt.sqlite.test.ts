/**
 * Data de conclusão do LMS é o dia civil de America/Sao_Paulo, não o dia UTC.
 *
 * Antes: `new Date().toISOString().slice(0, 10)` datava no dia seguinte toda
 * conclusão feita entre 21h e 24h BRT (UTC-3). Estes testes fixam o relógio
 * ao redor da virada UTC (00:00Z = 21:00 BRT) e da virada BRT (03:00Z).
 *
 * - PATCH /:id/status roda com SQLite real (node:sqlite) e o serviço canônico
 *   completeLmsMatricula real (caminho de conclusão sem qualificação).
 * - POST /xapi/statements usa o serviço como espião: só o argumento
 *   `dataConclusao` importa, a persistência é coberta pelo teste de serviço.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

const { completeSpy } = vi.hoisted(() => ({ completeSpy: vi.fn() }));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', 42);
    c.set('userRole', 'admin');
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
  hasRole: () => true,
}));
vi.mock('../../utils/tenant-resolution', () => ({ getEmpresaIdSafe: () => 1 }));
vi.mock('../../middleware/employee-sector-access', () => ({
  assertFuncionarioInScope: vi.fn(),
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [] })),
}));
vi.mock('../../utils/db', () => ({ logAudit: vi.fn() }));
vi.mock('../../lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('../../services/lms-completion', async () => {
  const actual = await vi.importActual<typeof import('../../services/lms-completion')>(
    '../../services/lms-completion',
  );
  completeSpy.mockImplementation(actual.completeLmsMatricula);
  return { ...actual, completeLmsMatricula: completeSpy };
});

import lmsMatriculasRoutes from '../../routes/lms-matriculas';
import lmsProgressoRoutes from '../../routes/lms-progresso';

const sql = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const opened: SqliteD1Database[] = [];

/** Instante UTC → dia civil esperado em America/Sao_Paulo (UTC-3, sem DST). */
const CASES = [
  { label: '20:59 BRT (23:59Z)', now: '2026-11-02T23:59:00Z', brt: '2026-11-02', utc: '2026-11-02' },
  { label: '21:00 BRT (00:00Z, virada UTC)', now: '2026-11-03T00:00:00Z', brt: '2026-11-02', utc: '2026-11-03' },
  { label: '23:59 BRT (02:59Z)', now: '2026-11-03T02:59:00Z', brt: '2026-11-02', utc: '2026-11-03' },
  { label: '00:00 BRT (03:00Z, virada BRT)', now: '2026-11-03T03:00:00Z', brt: '2026-11-03', utc: '2026-11-03' },
] as const;

function fixture() {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(`
    CREATE TABLE lms_cursos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, titulo TEXT, qualificacao_tipo_id INTEGER,
      scorm_package_r2_prefix TEXT, tipo_conteudo TEXT, scorm_mastery_score REAL,
      scorm_assessment_policy TEXT, scorm_assessment_policy_override TEXT,
      gerar_qualificacao_ao_concluir INTEGER DEFAULT 0
    );
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
    ALTER TABLE lms_matricula_ciclos ADD COLUMN assessment_policy TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN nome TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN vencimento_fim_mes TEXT;
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT,entity_type TEXT,entity_id INTEGER,
      old_values TEXT,new_values TEXT,ip_address TEXT,user_agent TEXT,empresa_id INTEGER,created_at TEXT
    );
    INSERT INTO lms_cursos (id,empresa_id,titulo,tipo_conteudo,gerar_qualificacao_ao_concluir)
      VALUES (34,1,'Curso sem qualificação','video',0);
    INSERT INTO lms_matriculas (id,empresa_id,curso_id,funcionario_id,status,progresso_pct)
      VALUES (384,1,34,1000,'EM_ANDAMENTO',40),(385,1,34,1001,'EM_ANDAMENTO',40);
    INSERT INTO lms_matricula_ciclos (empresa_id,matricula_id,curso_id,funcionario_id,numero_ciclo,origem,status,ciclo_atual,progresso_pct,tentativas)
      VALUES (1,384,34,1000,1,'LMS','EM_ANDAMENTO',1,40,1),(1,385,34,1001,1,'LMS','EM_ANDAMENTO',1,40,1);
  `);
  return db;
}

const row = (db: SqliteD1Database, id: number) =>
  db.database.prepare('SELECT status, data_conclusao FROM lms_matriculas WHERE id = ?').get(id) as {
    status: string;
    data_conclusao: string | null;
  };
const cycle = (db: SqliteD1Database, id: number) =>
  db.database
    .prepare('SELECT status, data_conclusao FROM lms_matricula_ciclos WHERE matricula_id = ?')
    .get(id) as { status: string; data_conclusao: string | null };

async function patchStatus(db: SqliteD1Database, id: number, status: string) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', lmsMatriculasRoutes);
  return app.fetch(
    new Request(`http://localhost/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
    { DB: db.asD1() } as Env,
    {} as ExecutionContext,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  for (const db of opened.splice(0)) db.close();
});

describe('PATCH /:id/status grava data_conclusao no dia de São Paulo (SQLite real)', () => {
  it.each(CASES)('CONCLUIDO às $label', async ({ now, brt, utc }) => {
    vi.setSystemTime(new Date(now));
    expect(new Date(now).toISOString().slice(0, 10)).toBe(utc); // a causa antiga
    const db = fixture();

    const res = await patchStatus(db, 384, 'CONCLUIDO');

    expect(res.status).toBe(200);
    expect(row(db, 384)).toEqual({ status: 'CONCLUIDO', data_conclusao: brt });
    expect(cycle(db, 384)).toEqual({ status: 'CONCLUIDO', data_conclusao: brt });
    // matrícula do outro funcionário permanece intocada
    expect(row(db, 385)).toEqual({ status: 'EM_ANDAMENTO', data_conclusao: null });
  });

  it.each(CASES)('REPROVADO às $label', async ({ now, brt }) => {
    vi.setSystemTime(new Date(now));
    const db = fixture();

    const res = await patchStatus(db, 384, 'REPROVADO');

    expect(res.status).toBe(200);
    expect(row(db, 384)).toEqual({ status: 'REPROVADO', data_conclusao: brt });
  });

  it('status sem conclusão não grava data_conclusao', async () => {
    vi.setSystemTime(new Date('2026-11-03T00:30:00Z'));
    const db = fixture();

    const res = await patchStatus(db, 384, 'EM_ANDAMENTO');

    expect(res.status).toBe(200);
    expect(row(db, 384).data_conclusao).toBeNull();
  });
});

describe('POST /xapi/statements entrega o dia de São Paulo ao serviço canônico', () => {
  it.each(CASES)('completed às $label', async ({ now, brt }) => {
    vi.setSystemTime(new Date(now));
    completeSpy.mockClear();
    completeSpy.mockResolvedValueOnce({
      outcome: 'qualification_not_required',
      qualificacaoHistoricoId: null,
      matriculaId: 384,
    });
    const db = fixture();
    db.database.exec(`
      CREATE TABLE lms_xapi_statements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,empresa_id INTEGER,matricula_id INTEGER,actor_json TEXT,
        verb_id TEXT,verb_display TEXT,object_id TEXT,object_type TEXT,result_json TEXT,
        context_json TEXT,timestamp TEXT,created_at TEXT
      );
    `);
    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsProgressoRoutes);

    const res = await app.fetch(
      new Request('http://localhost/xapi/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 384,
          actor: { mbox: 'mailto:aluno@example.test' },
          verb: { id: 'http://adlnet.gov/expapi/verbs/completed', display: { 'en-US': 'completed' } },
          object: { id: 'h5p:20', objectType: 'Activity' },
        }),
      }),
      { DB: db.asD1() } as Env,
      {} as ExecutionContext,
    );

    expect(res.status).toBe(201);
    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(completeSpy.mock.calls[0]?.[0]).toMatchObject({ matriculaId: 384, dataConclusao: brt });
  });
});

describe('escritores de data de conclusão do LMS não usam o dia UTC', () => {
  // Cobre também POST /scorm/commit e POST /:id/finalizar, cujo setup completo
  // (SCORM, mastery, manifesto) não cabe neste arquivo.
  it.each(['src/routes/lms-matriculas.ts', 'src/routes/lms-progresso.ts'])(
    '%s deriva a data do helper de São Paulo',
    (file) => {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/toISOString\(\)\s*\.\s*(slice|substring)\(\s*0\s*,\s*10\s*\)/);
      expect(source).toContain('getTodayIsoSaoPaulo()');
    },
  );
});
