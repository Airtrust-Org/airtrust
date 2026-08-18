/**
 * LMS-P0-1: real-SQLite (CLI-executed batch, same harness as
 * lms-completion.rollback.test.ts) tests for the reuse-existing-historico
 * contract. Before this fix, buildCompletionBatchStatements' reuse path
 * (pre.existingHistoricoId truthy) never checked or transitioned the
 * existing row's status at all — a PLANEJADA row stayed stuck PLANEJADA
 * forever while the matricula got marked CONCLUIDO, and a CANCELADA/
 * RENOVADA row was silently treated as if it fulfilled the course.
 *
 * Contract:
 * - CONCLUIDA: idempotent reuse, no status change.
 * - PLANEJADA: realized to CONCLUIDA in the same batch (settlement),
 *   including predecessor materialization — never a second row.
 * - CANCELADA / RENOVADA / unknown: completeLmsMatricula fails closed
 *   BEFORE calling buildCompletionBatchStatements — covered by the
 *   mocked unit tests below since that check lives in completeLmsMatricula,
 *   not in the pure batch-builder function this file otherwise exercises.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCompletionBatchStatements,
  completeLmsMatricula,
  LmsCompletionRejectedError,
} from '../../services/lms-completion';
import { execSql, querySql, runSqliteBatch } from '../helpers/sqlite-batch-runner';

vi.mock('../../services/qualification-category-contract', () => ({
  requireActiveQualificationCategoryById: vi.fn(async () => ({
    id: 13,
    nome: 'TREINAMENTO',
    codigo: 'TRN',
    lmsIntegrada: true,
  })),
}));

let dir: string;
let dbPath: string;

const SCHEMA = `
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER,
  qualificacao_codigo TEXT,
  tipo_codigo TEXT,
  codigo TEXT,
  categoria_id INTEGER,
  categoria TEXT,
  categoria_codigo TEXT,
  data_conclusao TEXT,
  data_vencimento TEXT,
  validade_meses INTEGER,
  observacoes TEXT,
  tipo TEXT,
  status TEXT,
  renovada INTEGER DEFAULT 0,
  renovacao_de INTEGER,
  lms_matricula_id INTEGER,
  lms_matricula_ciclo_id INTEGER,
  origem_tipo TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);
CREATE UNIQUE INDEX idx_qualificacoes_historico_unique_active
  ON qualificacoes_historico(funcionario_id, qualificacao_codigo, data_conclusao)
  WHERE deleted_at IS NULL;

CREATE TABLE lms_matriculas (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER,
  status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
  progresso_pct INTEGER DEFAULT 0,
  score_final INTEGER,
  data_inicio TEXT,
  data_conclusao TEXT,
  qualificacao_historico_id INTEGER,
  updated_at TEXT
);

CREATE TABLE lms_matricula_ciclos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER,
  matricula_id INTEGER,
  curso_id INTEGER,
  funcionario_id INTEGER,
  numero_ciclo INTEGER,
  origem TEXT,
  status TEXT,
  ciclo_atual INTEGER DEFAULT 1,
  data_conclusao TEXT,
  progresso_pct INTEGER DEFAULT 0,
  qualificacao_historico_id INTEGER,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT,
  entity_type TEXT,
  entity_id INTEGER,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  user_agent TEXT,
  empresa_id INTEGER,
  created_at TEXT
);
`;

function seedMatricula(id: number, status = 'EM_ANDAMENTO') {
  execSql(
    dbPath,
    `INSERT INTO lms_matriculas (id, empresa_id, funcionario_id, status, progresso_pct) VALUES (${id}, 6, 77, '${status}', 40);`,
  );
}

function seedHistorico(params: {
  id: number;
  status: string;
  dataConclusao?: string;
  renovada?: number;
}) {
  execSql(
    dbPath,
    `INSERT INTO qualificacoes_historico
       (id, empresa_id, funcionario_id, qualificacao_codigo, status, data_conclusao, renovada, created_at, updated_at)
     VALUES (${params.id}, 6, 77, 'QUAL-X', '${params.status}', ${
       params.dataConclusao ? `'${params.dataConclusao}'` : 'NULL'
     }, ${params.renovada ?? 0}, datetime('now'), datetime('now'));`,
  );
}

function baseParams(overrides: Partial<Parameters<typeof buildCompletionBatchStatements>[0]> = {}) {
  return {
    db: {} as unknown as D1Database,
    empresaId: 6,
    matriculaId: 1,
    funcionarioId: 77,
    cursoTitulo: 'Curso com qualificação',
    gerarQualificacaoAoConcluir: true,
    qualificacaoTipoId: 55,
    qualificacaoCodigo: 'QUAL-X',
    qualificacaoNome: 'Qualificação X',
    qualificacaoCategoriaId: 13,
    qualificacaoCategoria: 'TREINAMENTO',
    validade: 12,
    vencimentoFimMes: 0 as const,
    dataConclusao: '2026-07-30',
    existingHistoricoId: null,
    progressoPct: 100,
    action: 'LMS_MATRICULA_CONCLUIDA',
    actorUserId: 42,
    ...overrides,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lms-completion-p0-1-'));
  dbPath = join(dir, 'test.db');
  execSql(dbPath, SCHEMA);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('LMS-P0-1: reuse contract (real SQL via buildCompletionBatchStatements)', () => {
  it('CONCLUIDA existing row: idempotent reuse, no status change, no duplicate row', () => {
    seedMatricula(1);
    seedHistorico({ id: 900, status: 'CONCLUIDA', dataConclusao: '2026-07-30' });

    const pre = {
      existingHistoricoId: 900,
      existingHistoricoStatus: 'CONCLUIDA',
      anteriorAtivaId: null,
      anteriorAtivaObservacoes: null,
      currentCycleId: null,
      nextNumeroCiclo: 1,
    };
    const statements = buildCompletionBatchStatements(baseParams(), pre);
    const result = runSqliteBatch(dbPath, statements);
    expect(result.committed).toBe(true);

    const rows = querySql(dbPath, 'SELECT * FROM qualificacoes_historico;');
    expect(rows).toHaveLength(1); // no duplicate
    expect((rows[0] as Record<string, unknown>).status).toBe('CONCLUIDA');

    const matricula = querySql(dbPath, 'SELECT * FROM lms_matriculas WHERE id = 1;')[0] as Record<
      string,
      unknown
    >;
    expect(matricula.status).toBe('CONCLUIDO');
  });

  it('PLANEJADA existing row: realized to CONCLUIDA in place — the actual bug this fix closes', () => {
    seedMatricula(1);
    seedHistorico({ id: 901, status: 'PLANEJADA', dataConclusao: '2026-07-30' });

    const pre = {
      existingHistoricoId: 901,
      existingHistoricoStatus: 'PLANEJADA',
      anteriorAtivaId: null,
      anteriorAtivaObservacoes: null,
      currentCycleId: null,
      nextNumeroCiclo: 1,
    };
    const statements = buildCompletionBatchStatements(baseParams(), pre);
    const result = runSqliteBatch(dbPath, statements);
    expect(result.committed).toBe(true);

    const rows = querySql(dbPath, 'SELECT * FROM qualificacoes_historico;');
    expect(rows).toHaveLength(1); // realized the SAME row, no second row created
    expect((rows[0] as Record<string, unknown>).id).toBe(901);
    expect((rows[0] as Record<string, unknown>).status).toBe('CONCLUIDA');

    const matricula = querySql(dbPath, 'SELECT * FROM lms_matriculas WHERE id = 1;')[0] as Record<
      string,
      unknown
    >;
    expect(matricula.status).toBe('CONCLUIDO');
    expect(matricula.qualificacao_historico_id).toBe(901);
  });

  it('PLANEJADA realization also materializes an eligible predecessor as RENOVADA', () => {
    seedMatricula(1);
    seedHistorico({ id: 800, status: 'CONCLUIDA', dataConclusao: '2025-01-01' });
    seedHistorico({ id: 901, status: 'PLANEJADA', dataConclusao: '2026-07-30' });

    const pre = {
      existingHistoricoId: 901,
      existingHistoricoStatus: 'PLANEJADA',
      anteriorAtivaId: 800,
      anteriorAtivaObservacoes: null,
      currentCycleId: null,
      nextNumeroCiclo: 1,
    };
    const statements = buildCompletionBatchStatements(baseParams(), pre);
    const result = runSqliteBatch(dbPath, statements);
    expect(result.committed).toBe(true);

    const target = querySql(dbPath, 'SELECT * FROM qualificacoes_historico WHERE id = 901;')[0] as Record<
      string,
      unknown
    >;
    expect(target.status).toBe('CONCLUIDA');
    expect(target.renovacao_de).toBe(800);

    const predecessor = querySql(
      dbPath,
      'SELECT * FROM qualificacoes_historico WHERE id = 800;',
    )[0] as Record<string, unknown>;
    expect(predecessor.status).toBe('RENOVADA');
    expect(predecessor.renovada).toBe(1);
  });
});

describe('LMS-P0-1: fail-closed contract (completeLmsMatricula, mocked db)', () => {
  function makeFailClosedDb(existingStatus: string) {
    return {
      prepare: vi.fn((sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('FROM qualificacoes_tipos')) {
              return { id: 55, categoria_id: 13 };
            }
            if (sql.includes('FROM qualificacoes_historico') && sql.includes('id = ?')) {
              return { id: 901, status: existingStatus };
            }
            if (sql.includes('FROM qualificacoes_historico')) {
              return { id: 901, status: existingStatus };
            }
            return null;
          },
          run: async () => ({ meta: { changes: 1 } }),
          all: async () => ({ results: [] }),
        }),
      })),
      batch: vi.fn(async () => {
        throw new Error('batch must not be called when failing closed');
      }),
    } as unknown as D1Database;
  }

  it('CANCELADA existing row: fails closed, never calls batch, matricula never marked CONCLUIDO', async () => {
    const db = makeFailClosedDb('CANCELADA');
    await expect(
      completeLmsMatricula({
        db,
        empresaId: 6,
        matriculaId: 1,
        funcionarioId: 77,
        cursoTitulo: 'Curso',
        gerarQualificacaoAoConcluir: true,
        qualificacaoTipoId: 55,
        qualificacaoCodigo: 'QUAL-X',
        qualificacaoNome: null,
        qualificacaoCategoria: null,
        validade: 12,
        dataConclusao: '2026-07-30',
        existingHistoricoId: 901,
        action: 'LMS_MATRICULA_CONCLUIDA',
      }),
    ).rejects.toMatchObject({
      constructor: LmsCompletionRejectedError,
      code: 'LMS_QUALIFICATION_STATUS_INCOMPATIBLE',
    });
  });

  it('RENOVADA existing row: fails closed, never calls batch', async () => {
    const db = makeFailClosedDb('RENOVADA');
    await expect(
      completeLmsMatricula({
        db,
        empresaId: 6,
        matriculaId: 1,
        funcionarioId: 77,
        cursoTitulo: 'Curso',
        gerarQualificacaoAoConcluir: true,
        qualificacaoTipoId: 55,
        qualificacaoCodigo: 'QUAL-X',
        qualificacaoNome: null,
        qualificacaoCategoria: null,
        validade: 12,
        dataConclusao: '2026-07-30',
        existingHistoricoId: 901,
        action: 'LMS_MATRICULA_CONCLUIDA',
      }),
    ).rejects.toMatchObject({
      constructor: LmsCompletionRejectedError,
      code: 'LMS_QUALIFICATION_STATUS_INCOMPATIBLE',
    });
  });
});
