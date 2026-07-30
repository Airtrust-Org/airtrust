/**
 * lms-completion.ts — prova de atomicidade REAL contra SQLite (não mock).
 *
 * Executa buildCompletionBatchStatements() como uma única transação via
 * sqlite3 CLI (mesmo mecanismo de scripts/apply-simuladores-matriz-import.mjs)
 * e injeta falha depois de cada etapa, confirmando no banco que:
 *   - matrícula nunca fica CONCLUIDO;
 *   - nenhum Histórico novo órfão;
 *   - nenhum vínculo unilateral;
 *   - ciclo permanece inalterado;
 *   - Histórico anterior nunca fica RENOVADA sem sucessor;
 *   - nenhuma auditoria de sucesso falsa.
 *
 * E que a execução completa (sem falha injetada) grava tudo atomicamente,
 * incluindo duas conclusões concorrentes (a segunda perde a UNIQUE
 * constraint, tem o batch INTEIRO revertido, e só then re-tenta como reuso).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCompletionBatchStatements } from '../../services/lms-completion';
import { execSql, querySql, runSqliteBatch } from '../helpers/sqlite-batch-runner';

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
  categoria TEXT,
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

const preNoAnterior = {
  existingHistoricoId: null,
  anteriorAtivaId: null,
  anteriorAtivaObservacoes: null,
  currentCycleId: null,
  nextNumeroCiclo: 1,
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lms-completion-rollback-'));
  dbPath = join(dir, 'test.db');
  execSql(dbPath, SCHEMA);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('lms-completion — atomicidade real (SQLite via CLI, não mock)', () => {
  it('execução completa sem falha: grava Histórico + matrícula + ciclo + auditoria atomicamente', () => {
    seedMatricula(1);
    const statements = buildCompletionBatchStatements(baseParams(), preNoAnterior);

    const result = runSqliteBatch(dbPath, statements);
    expect(result.committed).toBe(true);

    const matricula = querySql(dbPath, 'SELECT * FROM lms_matriculas WHERE id = 1;')[0] as Record<
      string,
      unknown
    >;
    expect(matricula.status).toBe('CONCLUIDO');
    expect(matricula.progresso_pct).toBe(100);
    expect(matricula.qualificacao_historico_id).not.toBeNull();

    const historico = querySql(dbPath, 'SELECT * FROM qualificacoes_historico;');
    expect(historico).toHaveLength(1);

    const ciclo = querySql(dbPath, 'SELECT * FROM lms_matricula_ciclos;');
    expect(ciclo).toHaveLength(1);
    expect((ciclo[0] as Record<string, unknown>).qualificacao_historico_id).not.toBeNull();

    const audit = querySql(
      dbPath,
      "SELECT * FROM audit_logs WHERE action = 'LMS_MATRICULA_CONCLUIDA';",
    );
    expect(audit).toHaveLength(1);
  });

  it('falha injetada em CADA statement: nenhum efeito parcial sobrevive (matrícula, histórico, ciclo, auditoria)', () => {
    seedMatricula(2);
    const statements = buildCompletionBatchStatements(
      baseParams({ matriculaId: 2 }),
      preNoAnterior,
    );

    for (let failAt = 0; failAt < statements.length; failAt += 1) {
      // Recria o banco a cada iteração (cada falha é testada isoladamente).
      rmSync(dbPath, { force: true });
      execSql(dbPath, SCHEMA);
      seedMatricula(2);

      const corrupted = statements.map((s, i) =>
        i === failAt
          ? {
              sql: s.sql.replace(/^\s*(INSERT|UPDATE)/i, '$1 INTO tabela_inexistente_xyz'),
              args: s.args,
            }
          : s,
      );

      const result = runSqliteBatch(dbPath, corrupted);
      expect(result.committed).toBe(false);

      const matricula = querySql(dbPath, 'SELECT * FROM lms_matriculas WHERE id = 2;')[0] as Record<
        string,
        unknown
      >;
      expect(matricula.status).not.toBe('CONCLUIDO');
      expect(matricula.qualificacao_historico_id).toBeNull();

      expect(querySql(dbPath, 'SELECT * FROM qualificacoes_historico;')).toHaveLength(0);
      expect(querySql(dbPath, 'SELECT * FROM lms_matricula_ciclos;')).toHaveLength(0);
      expect(querySql(dbPath, 'SELECT * FROM audit_logs;')).toHaveLength(0);
    }
  });

  it('renovação: Histórico anterior só vira RENOVADA se o batch INTEIRO (incluindo o novo Histórico) confirmar', () => {
    seedMatricula(3);
    execSql(
      dbPath,
      `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, status, renovada, deleted_at)
       VALUES (500, 6, 77, 'QUAL-X', '2025-07-30', 'CONCLUIDA', 0, NULL);`,
    );

    const preComAnterior = {
      ...preNoAnterior,
      anteriorAtivaId: 500,
      anteriorAtivaObservacoes: null,
    };
    const statements = buildCompletionBatchStatements(
      baseParams({ matriculaId: 3 }),
      preComAnterior,
    );

    // Falha injetada no INSERT do novo Histórico (statement 0): o anterior
    // NUNCA deve virar RENOVADA sem sucessor real.
    const corrupted = statements.map((s, i) =>
      i === 0
        ? {
            sql: s.sql.replace(
              'INSERT INTO qualificacoes_historico',
              'INSERT INTO tabela_inexistente_xyz',
            ),
            args: s.args,
          }
        : s,
    );
    const failResult = runSqliteBatch(dbPath, corrupted);
    expect(failResult.committed).toBe(false);

    const anteriorAposFalha = querySql(
      dbPath,
      'SELECT status, renovada FROM qualificacoes_historico WHERE id = 500;',
    )[0] as Record<string, unknown>;
    expect(anteriorAposFalha.status).toBe('CONCLUIDA');
    expect(anteriorAposFalha.renovada).toBe(0);

    // Execução completa: agora sim o anterior vira RENOVADA, junto com o novo garantido.
    const successResult = runSqliteBatch(dbPath, statements);
    expect(successResult.committed).toBe(true);

    const anteriorAposSucesso = querySql(
      dbPath,
      'SELECT status, renovada FROM qualificacoes_historico WHERE id = 500;',
    )[0] as Record<string, unknown>;
    expect(anteriorAposSucesso.status).toBe('RENOVADA');
    expect(anteriorAposSucesso.renovada).toBe(1);

    const novo = querySql(
      dbPath,
      'SELECT * FROM qualificacoes_historico WHERE id != 500;',
    )[0] as Record<string, unknown>;
    expect(novo.renovacao_de).toBe(500);
  });

  it('duas conclusões concorrentes: a segunda perde a UNIQUE constraint, seu batch inteiro reverte, retry vira reuso', () => {
    seedMatricula(4);
    seedMatricula(5);

    const statementsA = buildCompletionBatchStatements(
      baseParams({ matriculaId: 4 }),
      preNoAnterior,
    );
    const resultA = runSqliteBatch(dbPath, statementsA);
    expect(resultA.committed).toBe(true);

    // Segunda matrícula tentando criar o MESMO Histórico (mesma
    // funcionario+codigo+data_conclusao) — simula a corrida perdida.
    const statementsB = buildCompletionBatchStatements(
      baseParams({ matriculaId: 5 }),
      preNoAnterior,
    );
    const resultB = runSqliteBatch(dbPath, statementsB);
    expect(resultB.committed).toBe(false);
    expect(resultB.stderr).toContain('UNIQUE constraint failed');

    // Matrícula 5 NÃO foi marcada CONCLUIDO, nenhum segundo Histórico foi criado.
    const matricula5 = querySql(dbPath, 'SELECT * FROM lms_matriculas WHERE id = 5;')[0] as Record<
      string,
      unknown
    >;
    expect(matricula5.status).not.toBe('CONCLUIDO');
    expect(querySql(dbPath, 'SELECT * FROM qualificacoes_historico;')).toHaveLength(1);

    // Retry como reuso: histórico já existe, o batch de reuso só religa a
    // matrícula 5 ao Histórico existente (sem inserir statement 0 de novo).
    const existingId = (
      querySql(dbPath, 'SELECT id FROM qualificacoes_historico;')[0] as Record<string, unknown>
    ).id as number;
    const retryPre = { ...preNoAnterior, existingHistoricoId: existingId };
    const retryStatements = buildCompletionBatchStatements(
      baseParams({ matriculaId: 5, existingHistoricoId: existingId }),
      retryPre,
    );
    const retryResult = runSqliteBatch(dbPath, retryStatements);
    expect(retryResult.committed).toBe(true);

    expect(querySql(dbPath, 'SELECT * FROM qualificacoes_historico;')).toHaveLength(1); // ainda 1, não duplicou
    const matricula5AposRetry = querySql(
      dbPath,
      'SELECT * FROM lms_matriculas WHERE id = 5;',
    )[0] as Record<string, unknown>;
    expect(matricula5AposRetry.status).toBe('CONCLUIDO');
    expect(matricula5AposRetry.qualificacao_historico_id).toBe(existingId);
  });

  it('cinco retries idempotentes do mesmo batch (histórico já existente) nunca duplicam nem regridem', () => {
    seedMatricula(6);
    const first = buildCompletionBatchStatements(baseParams({ matriculaId: 6 }), preNoAnterior);
    expect(runSqliteBatch(dbPath, first).committed).toBe(true);

    const existingId = (
      querySql(dbPath, 'SELECT id FROM qualificacoes_historico;')[0] as Record<string, unknown>
    ).id as number;
    for (let i = 0; i < 5; i += 1) {
      // Cada retry precisa refletir o ciclo já criado pela execução
      // anterior — a mesma leitura que readPreBatchState faria de verdade
      // contra o banco antes de montar o próximo batch.
      const cicloAtual = querySql(
        dbPath,
        'SELECT id FROM lms_matricula_ciclos WHERE matricula_id = 6;',
      )[0] as Record<string, unknown> | undefined;
      const retryPre = {
        ...preNoAnterior,
        existingHistoricoId: existingId,
        currentCycleId: (cicloAtual?.id as number | undefined) ?? null,
      };
      const retry = buildCompletionBatchStatements(
        baseParams({ matriculaId: 6, existingHistoricoId: existingId }),
        retryPre,
      );
      expect(runSqliteBatch(dbPath, retry).committed).toBe(true);
    }

    expect(querySql(dbPath, 'SELECT * FROM qualificacoes_historico;')).toHaveLength(1);
    expect(querySql(dbPath, 'SELECT * FROM lms_matricula_ciclos;')).toHaveLength(1);
    const matricula = querySql(dbPath, 'SELECT * FROM lms_matriculas WHERE id = 6;')[0] as Record<
      string,
      unknown
    >;
    expect(matricula.status).toBe('CONCLUIDO');
  });
});
