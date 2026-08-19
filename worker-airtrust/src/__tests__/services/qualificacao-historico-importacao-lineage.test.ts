/**
 * QualificacaoHistoricoImportacaoService.import — idempotência real +
 * encadeamento de lineage (Fase 3 do Writer Convergence audit).
 * Executa contra SQLite real (node:sqlite), não mocks.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { QualificacaoHistoricoImportacaoService } from '../../services/importacao/QualificacaoHistoricoImportacao';

let sqlite: SqliteD1Database;

beforeEach(() => {
  sqlite = new SqliteD1Database();
  // funcionario_id é NOT NULL no helper compartilhado, mas o schema real
  // permite NULL — este importador (identidade por cpf) nunca o preenche.
  sqlite.database.exec('DROP INDEX IF EXISTS idx_qh_unique_active');
  sqlite.database.exec('DROP TABLE qualificacoes_historico');
  sqlite.database.exec(`
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      funcionario_cpf TEXT,
      qualificacao_id INTEGER,
      qualificacao_codigo TEXT,
      categoria TEXT,
      data_conclusao TEXT,
      data_vencimento TEXT,
      validade_meses INTEGER,
      numero_certificado TEXT,
      instrutor TEXT,
      observacoes TEXT,
      status TEXT,
      renovada INTEGER NOT NULL DEFAULT 0,
      carga_horaria REAL,
      tipo_treinamento TEXT,
      empresa_id INTEGER NOT NULL,
      renovacao_de INTEGER,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
  `);
  sqlite.database.exec('ALTER TABLE qualificacoes_tipos ADD COLUMN nome TEXT');
  sqlite.database.exec('ALTER TABLE qualificacoes_tipos ADD COLUMN vencimento_fim_mes INTEGER DEFAULT 0');
  sqlite.database
    .prepare(
      `INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, categoria, dominio_codigo, validade)
       VALUES (5000, 1, 'CMA', 'CMA', 'MANUTENCAO', 'MANUTENCAO', 12)`,
    )
    .run();
  sqlite.database
    .prepare(`INSERT INTO funcionarios (id, empresa_id, cpf, nome) VALUES (7000, 1, '11122233344', 'Fulano')`)
    .run();
});

afterEach(() => {
  sqlite.close();
});

function historicoRows(cpf: string, codigo: string) {
  return sqlite.database
    .prepare(
      `SELECT * FROM qualificacoes_historico
        WHERE funcionario_cpf = ? AND UPPER(COALESCE(qualificacao_codigo, '')) = ?`,
    )
    .all(cpf, codigo) as Record<string, unknown>[];
}

describe('QualificacaoHistoricoImportacaoService.import — idempotência + lineage', () => {
  it('modo INSERT: primeira importação cria a linha', async () => {
    const service = new QualificacaoHistoricoImportacaoService(sqlite.asD1(), 1);
    const result = await service.import(
      [{ funcionario_cpf: '11122233344', qualificacao_codigo: 'CMA', data_conclusao: '2026-01-10' }],
      'INSERT',
    );

    expect(result.success).toBe(true);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(historicoRows('11122233344', 'CMA')).toHaveLength(1);
  });

  it('modo INSERT: retry do mesmo arquivo (mesma linha) não duplica, conta como skipped', async () => {
    const service = new QualificacaoHistoricoImportacaoService(sqlite.asD1(), 1);
    const rows = [{ funcionario_cpf: '11122233344', qualificacao_codigo: 'CMA', data_conclusao: '2026-01-10' }];

    await service.import(rows, 'INSERT');
    const retry = await service.import(rows, 'INSERT');

    expect(retry.inserted).toBe(0);
    expect(retry.skipped).toBe(1);
    expect(historicoRows('11122233344', 'CMA')).toHaveLength(1);
  });

  it('duas linhas cronológicas no mesmo arquivo: encadeia renovacao_de', async () => {
    const service = new QualificacaoHistoricoImportacaoService(sqlite.asD1(), 1);
    const result = await service.import(
      [
        { funcionario_cpf: '11122233344', qualificacao_codigo: 'CMA', data_conclusao: '2023-01-10' },
        { funcionario_cpf: '11122233344', qualificacao_codigo: 'CMA', data_conclusao: '2024-06-10' },
      ],
      'INSERT',
    );

    expect(result.inserted).toBe(2);
    const rows = historicoRows('11122233344', 'CMA').sort((a, b) =>
      String(a.data_conclusao).localeCompare(String(b.data_conclusao)),
    );
    const [older, newer] = rows;
    expect(newer.renovacao_de).toBe(older.id);
    expect(older.status).toBe('RENOVADA');
  });

  it('importação retroativa em arquivo separado: encadeia com o predecessor já existente sem duplicar', async () => {
    const service = new QualificacaoHistoricoImportacaoService(sqlite.asD1(), 1);
    await service.import(
      [{ funcionario_cpf: '11122233344', qualificacao_codigo: 'CMA', data_conclusao: '2024-06-10' }],
      'INSERT',
    );
    // Segundo arquivo, meses depois, com um exame retroativo mais antigo.
    await service.import(
      [{ funcionario_cpf: '11122233344', qualificacao_codigo: 'CMA', data_conclusao: '2023-01-10' }],
      'INSERT',
    );

    const rows = historicoRows('11122233344', 'CMA').sort((a, b) =>
      String(a.data_conclusao).localeCompare(String(b.data_conclusao)),
    );
    expect(rows).toHaveLength(2);
    const [older, newer] = rows;
    expect(newer.renovacao_de).toBe(older.id);
  });

  it('modo UPSERT: linha existente é atualizada, não duplicada, e continua fora da lineage se só o vencimento mudou', async () => {
    const service = new QualificacaoHistoricoImportacaoService(sqlite.asD1(), 1);
    await service.import(
      [{ funcionario_cpf: '11122233344', qualificacao_codigo: 'CMA', data_conclusao: '2026-01-10' }],
      'INSERT',
    );

    const result = await service.import(
      [{ funcionario_cpf: '11122233344', qualificacao_codigo: 'CMA', data_conclusao: '2026-01-10' }],
      'UPSERT',
    );

    expect(result.updated).toBe(1);
    expect(historicoRows('11122233344', 'CMA')).toHaveLength(1);
  });

  it('tenant A/B: cpf existente em outro tenant nunca é usado como predecessor', async () => {
    sqlite.database
      .prepare(`INSERT INTO funcionarios (id, empresa_id, cpf, nome) VALUES (7001, 2, '11122233344', 'Mesmo CPF outro tenant')`)
      .run();
    sqlite.database
      .prepare(
        `INSERT INTO qualificacoes_historico (funcionario_id, funcionario_cpf, qualificacao_codigo, qualificacao_id, data_conclusao, empresa_id)
         VALUES (7001, '11122233344', 'CMA', 5000, '2020-01-10', 2)`,
      )
      .run();

    const service = new QualificacaoHistoricoImportacaoService(sqlite.asD1(), 1);
    await service.import(
      [{ funcionario_cpf: '11122233344', qualificacao_codigo: 'CMA', data_conclusao: '2026-01-10' }],
      'INSERT',
    );

    const t1Row = historicoRows('11122233344', 'CMA').find((r) => r.empresa_id === 1)!;
    expect(t1Row.renovacao_de).toBeNull(); // não a linha do tenant 2
  });

  it('CPF inexistente: rejeitado, nenhuma linha criada', async () => {
    const service = new QualificacaoHistoricoImportacaoService(sqlite.asD1(), 1);
    const result = await service.import(
      [{ funcionario_cpf: '999999999', qualificacao_codigo: 'CMA', data_conclusao: '2026-01-10' }],
      'INSERT',
    );

    expect(result.success).toBe(false);
    expect(result.inserted).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
