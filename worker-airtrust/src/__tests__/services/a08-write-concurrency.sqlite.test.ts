/**
 * A-08 — local SQLite proofs for the write boundaries used by production D1.
 *
 * These tests deliberately use the sqlite3 binary, never a remote binding.
 * They model two submissions that both observed the same initial state and
 * verify that only one can claim the write boundary.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCompletionBatchStatements } from '../../services/lms-completion';
import { execSql, querySql, runSqliteBatch } from '../helpers/sqlite-batch-runner';

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'airtrust-a08-concurrency-'));
  dbPath = join(dir, 'test.db');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function scalar(sql: string): number {
  return Number((querySql<{ value: number }>(dbPath, sql)[0] || { value: 0 }).value);
}

describe('A-08 local concurrency boundaries', () => {
  it('production routes consume the same conflict result before side effects', () => {
    const frmsSource = readFileSync(
      decodeURIComponent(new URL('../../routes/frms-fadiga-checkin-legacy.ts', import.meta.url).pathname),
      'utf8',
    );
    const escalasSource = readFileSync(
      decodeURIComponent(new URL('../../routes/escalas-status.ts', import.meta.url).pathname),
      'utf8',
    );

    expect(frmsSource).toContain('INSERT OR IGNORE INTO frms_fadiga_checkin');
    expect(frmsSource).toMatch(/insertResult\.meta\.changes !== 1[\s\S]{0,500}409/);
    expect(escalasSource).toMatch(/AND empresa_id = \?[\s\S]{0,250}AND status = \?[\s\S]{0,250}COALESCE\(numero_revisao, 0\) = \?/);
    expect(escalasSource).toMatch(/updateResult\.meta\.changes !== 1[\s\S]{0,500}409/);
  });

  it('FRMS: the second same-day first submission loses the partial UNIQUE boundary', () => {
    execSql(
      dbPath,
      `CREATE TABLE frms_fadiga_checkin (
         id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, funcionario_id INTEGER NOT NULL,
         data_checkin TEXT NOT NULL, deleted_at TEXT
       );
       CREATE UNIQUE INDEX idx_fadiga_checkin_unique_day
         ON frms_fadiga_checkin (empresa_id, funcionario_id, data_checkin)
         WHERE deleted_at IS NULL;`,
    );

    execSql(
      dbPath,
      "INSERT OR IGNORE INTO frms_fadiga_checkin VALUES ('first', 7, 42, '2026-09-08', NULL);",
    );
    const second = execSql(
      dbPath,
      "INSERT OR IGNORE INTO frms_fadiga_checkin VALUES ('second', 7, 42, '2026-09-08', NULL); SELECT changes() AS value;",
    );

    expect(second.committed).toBe(true);
    expect(scalar('SELECT COUNT(*) AS value FROM frms_fadiga_checkin;')).toBe(1);
    expect(second.stdout.trim()).toBe('0');
  });

  it('Escalas: only one publication can consume the observed status/revision', () => {
    execSql(
      dbPath,
      `CREATE TABLE escalas_mensais (
         id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, status TEXT NOT NULL,
         numero_revisao INTEGER NOT NULL DEFAULT 0
       );
       INSERT INTO escalas_mensais VALUES ('escala-a', 7, 'aprovada', 0);`,
    );
    const cas =
      "UPDATE escalas_mensais SET status = 'publicada', numero_revisao = 0 WHERE id = 'escala-a' AND empresa_id = 7 AND status = 'aprovada' AND COALESCE(numero_revisao, 0) = 0; SELECT changes() AS value;";

    const first = execSql(dbPath, cas);
    const second = execSql(dbPath, cas);

    expect(first.stdout.trim()).toBe('1');
    expect(second.stdout.trim()).toBe('0');
    expect(querySql<{ status: string }>(dbPath, "SELECT status FROM escalas_mensais WHERE id = 'escala-a';")[0]
      .status).toBe('publicada');
  });

  it('Certificados: compare-and-set permits exactly one generated document link', () => {
    execSql(
      dbPath,
      `CREATE TABLE qualificacoes_historico (id INTEGER PRIMARY KEY, certificado_arquivo_id INTEGER);
       INSERT INTO qualificacoes_historico VALUES (99, NULL);`,
    );
    const cas =
      'UPDATE qualificacoes_historico SET certificado_arquivo_id = 501 WHERE id = 99 AND certificado_arquivo_id IS NULL; SELECT changes() AS value;';

    const first = execSql(dbPath, cas);
    const second = execSql(dbPath, cas);

    expect(first.stdout.trim()).toBe('1');
    expect(second.stdout.trim()).toBe('0');
    expect(scalar('SELECT certificado_arquivo_id AS value FROM qualificacoes_historico WHERE id = 99;')).toBe(501);
  });

  it('LMS: duplicate completion rolls back its entire second batch on the active-history UNIQUE index', () => {
    execSql(
      dbPath,
      `CREATE TABLE qualificacoes_historico (
         id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER, funcionario_id INTEGER,
         qualificacao_id INTEGER, qualificacao_codigo TEXT, tipo_codigo TEXT, codigo TEXT,
         categoria_id INTEGER, categoria TEXT, categoria_codigo TEXT, data_conclusao TEXT,
         data_vencimento TEXT, validade_meses INTEGER, observacoes TEXT, tipo TEXT, status TEXT,
         renovada INTEGER DEFAULT 0, renovacao_de INTEGER, lms_matricula_id INTEGER,
         lms_matricula_ciclo_id INTEGER, origem_tipo TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
       );
       CREATE UNIQUE INDEX active_history_unique ON qualificacoes_historico(funcionario_id, qualificacao_codigo, data_conclusao) WHERE deleted_at IS NULL;
       CREATE TABLE lms_matriculas (id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER, status TEXT, progresso_pct INTEGER, score_final INTEGER, data_inicio TEXT, data_conclusao TEXT, qualificacao_historico_id INTEGER, updated_at TEXT);
       CREATE TABLE lms_matricula_ciclos (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER, matricula_id INTEGER, curso_id INTEGER, funcionario_id INTEGER, numero_ciclo INTEGER, origem TEXT, status TEXT, ciclo_atual INTEGER, data_conclusao TEXT, progresso_pct INTEGER, qualificacao_historico_id INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT);
       CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT, entity_type TEXT, entity_id INTEGER, old_values TEXT, new_values TEXT, ip_address TEXT, user_agent TEXT, empresa_id INTEGER, created_at TEXT);
       INSERT INTO lms_matriculas VALUES (1, 7, 42, 'EM_ANDAMENTO', 0, NULL, NULL, NULL, NULL, NULL);`,
    );
    const params = {
      db: {} as D1Database, empresaId: 7, matriculaId: 1, funcionarioId: 42,
      cursoTitulo: 'Teste', gerarQualificacaoAoConcluir: true, qualificacaoTipoId: 1,
      qualificacaoCodigo: 'A08', qualificacaoNome: 'Teste', qualificacaoCategoriaId: 1,
      qualificacaoCategoria: 'TREINAMENTO', validade: 12, vencimentoFimMes: 0 as const,
      dataConclusao: '2026-09-08', existingHistoricoId: null, progressoPct: 100,
      action: 'LMS_MATRICULA_CONCLUIDA', actorUserId: 1,
    };
    const pre = { existingHistoricoId: null, existingHistoricoStatus: null, anteriorAtivaId: null, anteriorAtivaObservacoes: null, currentCycleId: null, nextNumeroCiclo: 1 };
    const statements = buildCompletionBatchStatements(params, pre);

    expect(runSqliteBatch(dbPath, statements).committed).toBe(true);
    const duplicate = runSqliteBatch(dbPath, statements);

    expect(duplicate.committed).toBe(false);
    expect(scalar('SELECT COUNT(*) AS value FROM qualificacoes_historico;')).toBe(1);
    expect(scalar("SELECT COUNT(*) AS value FROM audit_logs WHERE action = 'LMS_MATRICULA_CONCLUIDA';")).toBe(1);
  });
});
