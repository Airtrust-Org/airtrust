import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { createRequire } from 'node:module';
const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as new (p: string) => { exec(s: string): void; prepare(s: string): { run(...a: never[]): unknown; get(...a: never[]): unknown; all(...a: never[]): unknown[] } };

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', 'manager');
    c.set('empresaId', Number(c.env?.__mockEmpresaId ?? 6));
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

vi.mock('../../middleware/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));

vi.mock('../../utils/ficha-role-scope', () => ({
  resolveFichaScope: () => 'FULL_ACCESS',
}));

vi.mock('../../services/simuladores/shared', async () => {
  const actual = await vi.importActual('../../services/simuladores/shared');
  return {
    ...actual,
    audit: vi.fn(async () => undefined),
  };
});

vi.mock('../../shared/handlers/horasVooFromSimulador.handler', () => ({
  syncHorasVooFromSimulador: vi.fn(async () => undefined),
}));

vi.mock('../../lib/fichaEmails', () => ({
  enviarEmailFichaSessao: vi.fn(async () => undefined),
}));

vi.mock('../../routes/simuladores-fichas-helpers', () => ({
  gerarQualificacaoDaFicha: vi.fn(),
  getQualificacaoGeracaoErrorStatus: vi.fn(),
  marcarNotificacoesFichaComoResolvidas: vi.fn(),
  listarManobrasPendentes: vi.fn(async () => []),
}));

import simuladoresFichasRoutes from '../../routes/simuladores-fichas';

function createDbMock(options?: {
  invalidTenantLink?: boolean;
  manobrasCount?: number;
  manobrasRowsCount?: number;
  notechsOrdens?: number[];
  sessionDate?: string;
  sessionTime?: string;
  signedInstructor?: boolean;
  signedStudent?: boolean;
  legacyStudentFlagOnly?: boolean;
  hasInstructorMeta?: boolean;
}) {
  const runs: Array<{ query: string; args: unknown[] }> = [];
  const batchSizes: number[] = [];
  const captured: Array<{ query: string; args: unknown[] }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        __query: query, __args: args,
        first: async () => {
          if (
            query.includes('SELECT id FROM fichas_sessao') &&
            query.includes('empresa_id = ?') &&
            query.includes('deleted_at IS NULL')
          ) {
            return { id: Number(args[0]) };
          }

          if (query.includes("SELECT 1 as found FROM sqlite_master") &&
              String(args[0]) === 'fichas_sessao_instrutor_meta') {
            return { found: options?.hasInstructorMeta ? 1 : 0 };
          }

          // operational-domain-access.ts: isTenantRbacEnabled — legacy tenant.
          if (query.includes('FROM empresas WHERE id')) {
            return { operational_domain_rbac_enabled: 0 };
          }
          if (query.includes('COALESCE(sa.data, fs.data_sessao) as data_sessao')) {
            return {
              data_sessao: options?.sessionDate || '2026-06-16',
              hora_inicio: options?.sessionTime || '00:00',
            };
          }
          if (
            query.includes('SELECT COUNT(DISTINCT id) AS total') &&
            query.includes('FROM funcionarios')
          ) {
            return { total: options?.invalidTenantLink ? 1 : 2 };
          }
          // operational-domain-access-core.ts: pedagogical-bypass — resolves the
          // caller's funcionario_id first; the sessao_id/agendamento_slot_id
          // lookup below is only reached when this returns a real funcionario.
          if (query.includes('SELECT f.id FROM usuarios u') && query.includes('JOIN funcionarios f')) {
            return { id: 999 };
          }
          // operational-domain-access-core.ts: pedagogical-bypass lookup for
          // resourceType 'simulador_ficha'. Mirrors real D1/SQLite behavior —
          // fichas_sessao has no `sessao_id` column (it's `agendamento_slot_id`);
          // referencing the wrong one throws exactly like production did. Must be
          // checked before the broader getFichaWithInstructorMeta match below,
          // since both share the same trailing WHERE clause text.
          if (
            query.includes('sa.instrutor_id, sa.examinador_id, fs.colaborador_id_aluno') &&
            query.includes('FROM fichas_sessao fs')
          ) {
            if (query.includes('fs.sessao_id')) {
              throw new Error('D1_ERROR: no such column: fs.sessao_id: SQLITE_ERROR');
            }
            return { instrutor_id: 11, examinador_id: null, colaborador_id_aluno: 10 };
          }
          // getFichaWithInstructorMeta() (introduced in PR #307, simuladores-fichas.ts
          // and simuladores-fichas-acoes.ts) joins fichas_sessao_instrutor_meta instead
          // of the plain SELECT below. Match on the stable tenant-scoped WHERE clause
          // rather than the whole SQL text, since column/JOIN formatting is expected
          // to keep evolving independently of this fixture.
          if (
            query.includes('FROM fichas_sessao fs') &&
            query.includes('WHERE fs.id = ? AND fs.empresa_id = ? AND fs.deleted_at IS NULL')
          ) {
            return {
              id: 901,
              uuid: 'fs-901',
              colaborador_id_aluno: 10,
              instrutor_id: 11,
              tipo_sessao: 'PER',
              status: options?.signedStudent ? 'AGUARDANDO_ASSINATURA_INSTRUTOR' : 'AGUARDANDO_ASSINATURA_ALUNO',
              empresa_id: Number(args[1] || 6),
              deleted_at: null,
              equipamento_utilizado: null,
              dispositivo_identificacao: null,
              assento_instrucao_utilizado: null,
              assinatura_aluno_timestamp: options?.signedStudent ? '2026-11-13T10:00:00Z' : null,
              assinatura_tripulante: options?.signedStudent || options?.legacyStudentFlagOnly ? 1 : 0,
              assinatura_instrutor_timestamp: options?.signedInstructor
                ? '2026-11-13T11:00:00Z' : null,
              assinatura_instrutor: options?.signedInstructor ? 1 : 0,
              resultado_final: null,
            };
          }
          if (
            query.includes(
              'SELECT * FROM fichas_sessao WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
            )
          ) {
            return {
              id: 901,
              uuid: 'fs-901',
              colaborador_id_aluno: 10,
              instrutor_id: 11,
              tipo_sessao: 'PER',
              empresa_id: Number(args[1] || 6),
              deleted_at: null,
            };
          }
          if (query.includes('SELECT * FROM fichas_sessao WHERE id=? AND deleted_at IS NULL')) {
            return {
              id: 901,
              uuid: 'fs-901',
              colaborador_id_aluno: 10,
              instrutor_id: 11,
              tipo_sessao: 'PER',
              empresa_id: 6,
              status: 'AGUARDANDO_ASSINATURA_ALUNO',
              deleted_at: null,
            };
          }
          if (query.includes('SELECT COUNT(1) as total FROM fichas_sessao_manobras')) {
            return { total: options?.manobrasCount ?? 0 };
          }
          return null;
        },
        all: async () => {
          if (query.includes('SELECT ordem, resultado, categoria FROM fichas_sessao_manobras')) {
            const rowsCount = options?.manobrasRowsCount ?? 2;
            return {
              results: Array.from({ length: rowsCount }, (_, index) => ({
                ordem: index + 1,
                categoria: options?.notechsOrdens?.includes(index + 1) ? 'NOTECHS' : 'GERAL',
                resultado: null,
              })),
            };
          }
          return { results: [] };
        },
        run: async () => {
          runs.push({ query, args });
          return { meta: { changes: 1, last_row_id: 901 } };
        },
      });

      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    }),
    batch: async (statements: unknown[]) => {
      batchSizes.push(statements.length);
      for (const s of statements as Array<{ __query: string; __args: unknown[] }>) captured.push({ query: s.__query, args: s.__args });
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  } as unknown as D1Database;

  return { db, runs, batchSizes, captured };
}


const SCHEMA = `CREATE TABLE fichas_sessao (id INTEGER PRIMARY KEY, empresa_id INTEGER, status TEXT, observacoes TEXT,
      updated_at TEXT, deleted_at TEXT, assinatura_aluno_timestamp TEXT, assinatura_aluno_imagem TEXT, assinatura_tripulante INTEGER DEFAULT 0,
      assinatura_instrutor_timestamp TEXT, assinatura_instrutor INTEGER DEFAULT 0);
      CREATE TABLE fichas_sessao_manobras (id INTEGER PRIMARY KEY, ficha_id INTEGER, ordem INTEGER, resultado TEXT, observacoes TEXT, updated_at TEXT, deleted_at TEXT);
      CREATE TABLE fichas_sessao_instrutor_meta (ficha_id INTEGER PRIMARY KEY, empresa_id INTEGER, equipamento_utilizado TEXT,
        dispositivo_identificacao TEXT, assento_instrucao_utilizado TEXT, created_at TEXT, updated_at TEXT);`;

function putFicha(db: D1Database, body: Record<string, unknown>) {
  return simuladoresFichasRoutes.fetch(
    new Request('http://localhost/fichas/901', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    { DB: db, __mockEmpresaId: 6 } as unknown as Env,
    {} as ExecutionContext,
  );
}

function seed(sql: InstanceType<typeof DatabaseSync>, student: { ts: string | null; flag: number }) {
  sql.exec(SCHEMA);
  sql.prepare(`INSERT INTO fichas_sessao (id, empresa_id, status, observacoes, updated_at, assinatura_aluno_timestamp, assinatura_aluno_imagem, assinatura_tripulante)
    VALUES (901, 6, 'AGUARDANDO_ASSINATURA_INSTRUTOR', 'obs original', '2026-11-13T10:00:00Z', ?, ?, ?)`)
    .run(...([student.ts, student.ts ? 'img-aluno' : null, student.flag] as never[]));
  sql.exec(`INSERT INTO fichas_sessao_manobras (ficha_id, ordem, resultado, observacoes) VALUES (901,1,'9','visto pelo aluno'),(901,2,'8','')`);
}

function replay(sql: InstanceType<typeof DatabaseSync>, statements: Array<{ query: string; args: unknown[] }>) {
  for (const s of statements) {
    sql.prepare(s.query.replace(/\s+/g, ' ')).run(...(s.args.map((v) => (v === undefined ? null : v)) as never[]));
  }
}

function snapshot(sql: InstanceType<typeof DatabaseSync>) {
  return {
    notas: sql.prepare('SELECT ordem, resultado, observacoes FROM fichas_sessao_manobras ORDER BY ordem').all(),
    ficha: sql.prepare('SELECT status, observacoes, updated_at, assinatura_aluno_timestamp, assinatura_aluno_imagem, assinatura_tripulante FROM fichas_sessao WHERE id = 901').get(),
    meta: sql.prepare('SELECT COUNT(*) AS n FROM fichas_sessao_instrutor_meta').get(),
  };
}

describe('F14-04 — PUT /fichas/:id após assinatura do aluno (fail-closed)', () => {
  const payloads: Array<[string, Record<string, unknown>]> = [
    ['nota de manobra', { manobras: [{ ordem: 1, resultado: 3, observacoes: 'nota alterada' }] }],
    ['observações gerais', { observacoes: 'texto novo' }],
    ['metadados do instrutor', { equipamento_utilizado: 'OUTRO', dispositivo_identificacao: 'FFS-9' }],
    ['recalculate_status', { recalculate_status: true, manobras: [{ ordem: 1, resultado: 3, observacoes: '' }] }],
  ];

  it.each(payloads)('recusa %s com 409 FICHA_STUDENT_SIGNED e não escreve nada', async (_nome, body) => {
    const { db, runs, batchSizes, captured } = createDbMock({ signedStudent: true, manobrasRowsCount: 2 });
    const response = await putFicha(db, body);
    expect(response.status).toBe(409);
    const json = await response.json() as { success: boolean; code: string; error: string };
    expect(json).toMatchObject({ success: false, code: 'FICHA_STUDENT_SIGNED' });
    expect(json.error).toMatch(/retificação/i);
    expect(batchSizes).toHaveLength(0);
    expect(captured).toHaveLength(0);
    expect(runs.some((r) => /UPDATE|INSERT|DELETE/i.test(r.query))).toBe(false);
  });

  it('recusa também linha legada com apenas assinatura_tripulante = 1 (sem timestamp)', async () => {
    const { db, batchSizes } = createDbMock({ legacyStudentFlagOnly: true, manobrasRowsCount: 2 });
    const response = await putFicha(db, { manobras: [{ ordem: 1, resultado: 3, observacoes: '' }] });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'FICHA_STUDENT_SIGNED' });
    expect(batchSizes).toHaveLength(0);
  });

  it('ficha sem assinatura do aluno continua editável e o SQL gravado carrega o guard de assinatura do aluno', async () => {
    const { db, captured } = createDbMock({ hasInstructorMeta: true, manobrasRowsCount: 2 });
    const response = await putFicha(db, {
      manobras: [{ ordem: 1, resultado: 8, observacoes: 'ok' }],
      equipamento_utilizado: 'FFS', dispositivo_identificacao: 'FFS-1',
    });
    expect(response.status).toBe(200);
    const child = captured.find((s) => s.query.includes('UPDATE fichas_sessao_manobras'));
    const meta = captured.find((s) => s.query.includes('INSERT INTO fichas_sessao_instrutor_meta'));
    const header = captured.find((s) => s.query.includes('UPDATE fichas_sessao SET status'));
    expect(child && meta && header).toBeTruthy();
    for (const s of [child!, meta!, header!]) {
      expect(s.query).toMatch(/assinatura_aluno_timestamp IS NULL/);
      expect(s.query).toMatch(/COALESCE\((?:fs\.)?assinatura_tripulante,0\)=0/);
    }
    // metaGuard aparece no INSERT ... WHERE e no ON CONFLICT ... WHERE
    expect(meta!.query.match(/assinatura_aluno_timestamp IS NULL/g)).toHaveLength(2);
  });

  it('corrida: SQL gravado, reexecutado em SQLite real após o aluno assinar, não altera nenhuma linha', async () => {
    // A leitura prévia vê a ficha ainda sem assinatura do aluno ...
    const { db, captured } = createDbMock({ hasInstructorMeta: true, manobrasRowsCount: 2 });
    const response = await putFicha(db, {
      expected_updated_at: undefined,
      manobras: [{ ordem: 1, resultado: 3, observacoes: 'nota alterada' }],
      equipamento_utilizado: 'FFS', dispositivo_identificacao: 'FFS-1',
      observacoes: 'texto novo',
    });
    expect(response.status).toBe(200);
    expect(captured.length).toBeGreaterThanOrEqual(3);

    // ... mas, antes do db.batch, o aluno assina. Replay do SQL exato contra esse estado.
    for (const student of [{ ts: '2026-11-13T10:00:00Z', flag: 1 }, { ts: null, flag: 1 }]) {
      const sql = new DatabaseSync(':memory:');
      seed(sql, student);
      const before = snapshot(sql);
      replay(sql, captured);
      expect(snapshot(sql)).toEqual(before);
      const nota = sql.prepare('SELECT resultado FROM fichas_sessao_manobras WHERE ordem = 1').get() as { resultado: string };
      expect(Number(nota.resultado)).toBe(9);
    }
  });

  it('controle positivo: o mesmo replay em SQLite real altera a ficha quando o aluno ainda não assinou', async () => {
    const { db, captured } = createDbMock({ hasInstructorMeta: true, manobrasRowsCount: 2 });
    await putFicha(db, {
      manobras: [{ ordem: 1, resultado: 3, observacoes: 'nota alterada' }],
      equipamento_utilizado: 'FFS', dispositivo_identificacao: 'FFS-1',
    });
    const sql = new DatabaseSync(':memory:');
    seed(sql, { ts: null, flag: 0 });
    replay(sql, captured);
    const nota = sql.prepare('SELECT resultado FROM fichas_sessao_manobras WHERE ordem = 1').get() as { resultado: string };
    expect(Number(nota.resultado)).toBe(3);
    expect((sql.prepare('SELECT COUNT(*) AS n FROM fichas_sessao_instrutor_meta').get() as { n: number }).n).toBe(1);
  });
});
