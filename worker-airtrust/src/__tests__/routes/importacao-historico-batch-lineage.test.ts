/**
 * executarImportacaoHistoricoEmLotes — idempotência de retry + lineage.
 *
 * Prova dois gaps corrigidos:
 * 1. Retry-duplication: reenviar o mesmo lote (mesmo cpf+código+data) não
 *    duplicava a linha — `modo` nunca era usado para checar existência.
 * 2. Lineage: linhas importadas nunca ganhavam renovacao_de/RENOVADA —
 *    agora uma passada de encadeamento fail-closed roda ao final do lote.
 *
 * Executa contra SQLite real (node:sqlite), não mocks.
 */
import type { Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { executarImportacaoHistoricoEmLotes } from '../../routes/importacao';

let sqlite: SqliteD1Database;

beforeEach(() => {
  sqlite = new SqliteD1Database();
  // O helper compartilhado modela funcionario_id como NOT NULL, mas o
  // schema real permite NULL (os importadores cpf-based nunca o
  // preenchem) — recria a tabela sem essa restrição para o teste, mais a
  // coluna funcionario_cpf ausente do helper compartilhado.
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
  sqlite.database
    .prepare(
      `INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, categoria, dominio_codigo, validade)
       VALUES (1000, 1, 'CMA', 'MANUTENCAO', 'MANUTENCAO', 12)`,
    )
    .run();
  sqlite.database
    .prepare(`INSERT INTO funcionarios (id, empresa_id, cpf, nome) VALUES (5000, 1, '111', 'Fulano')`)
    .run();
});

afterEach(() => {
  sqlite.close();
});

function fakeContext(): Context {
  const jsonCalls: Array<{ body: unknown; status?: number }> = [];
  const c = {
    env: { DB: sqlite.asD1() },
    json: (body: unknown, status?: number) => {
      jsonCalls.push({ body, status });
      return { body, status } as unknown as Response;
    },
  } as unknown as Context;
  return c;
}

function historicoRows(cpf: string, codigo: string) {
  return sqlite.database
    .prepare(
      `SELECT * FROM qualificacoes_historico
        WHERE funcionario_cpf = ? AND UPPER(COALESCE(qualificacao_codigo, '')) = ?`,
    )
    .all(cpf, codigo) as Record<string, unknown>[];
}

describe('executarImportacaoHistoricoEmLotes — idempotência + lineage', () => {
  it('primeira importação: insere a linha normalmente', async () => {
    const c = fakeContext();
    const response = (await executarImportacaoHistoricoEmLotes(
      c,
      [{ funcionario_cpf: '111', qualificacao_codigo: 'CMA', data_conclusao: '2026-01-10', data_vencimento: '2027-01-10' }],
      'INSERT',
      1,
    )) as unknown as { body: { inserted: number; skipped: number } };

    expect(response.body.inserted).toBe(1);
    expect(response.body.skipped).toBe(0);
    expect(historicoRows('111', 'CMA')).toHaveLength(1);
  });

  it('retry do mesmo lote: não duplica, reporta como skipped', async () => {
    const c1 = fakeContext();
    await executarImportacaoHistoricoEmLotes(
      c1,
      [{ funcionario_cpf: '111', qualificacao_codigo: 'CMA', data_conclusao: '2026-01-10', data_vencimento: '2027-01-10' }],
      'INSERT',
      1,
    );

    const c2 = fakeContext();
    const retry = (await executarImportacaoHistoricoEmLotes(
      c2,
      [{ funcionario_cpf: '111', qualificacao_codigo: 'CMA', data_conclusao: '2026-01-10', data_vencimento: '2027-01-10' }],
      'INSERT',
      1,
    )) as unknown as { body: { inserted: number; skipped: number } };

    expect(retry.body.inserted).toBe(0);
    expect(retry.body.skipped).toBe(1);
    expect(historicoRows('111', 'CMA')).toHaveLength(1); // não duplicou
  });

  it('duas conclusões cronológicas no mesmo lote: encadeia renovacao_de após o import', async () => {
    const c = fakeContext();
    await executarImportacaoHistoricoEmLotes(
      c,
      [
        { funcionario_cpf: '111', qualificacao_codigo: 'CMA', data_conclusao: '2023-01-10', data_vencimento: '2024-01-10' },
        { funcionario_cpf: '111', qualificacao_codigo: 'CMA', data_conclusao: '2024-06-10', data_vencimento: '2025-06-10' },
      ],
      'INSERT',
      1,
    );

    const rows = historicoRows('111', 'CMA').sort(
      (a, b) => String(a.data_conclusao).localeCompare(String(b.data_conclusao)),
    );
    expect(rows).toHaveLength(2);
    const [older, newer] = rows;
    expect(newer.renovacao_de).toBe(older.id);
    expect(older.status).toBe('RENOVADA');
  });

  it('empate de data_conclusao no lote: fail-closed, nenhum encadeamento aplicado', async () => {
    const c = fakeContext();
    await executarImportacaoHistoricoEmLotes(
      c,
      [
        { funcionario_cpf: '111', qualificacao_codigo: 'CMA', data_conclusao: '2024-01-10', data_vencimento: '2025-01-10' },
      ],
      'INSERT',
      1,
    );
    // Segunda linha com A MESMA data — só possível via um segundo tipo de
    // registro pré-existente simulando um empate real de importação prévia.
    sqlite.database
      .prepare(
        `INSERT INTO qualificacoes_historico (funcionario_id, funcionario_cpf, qualificacao_codigo, qualificacao_id, data_conclusao, data_vencimento, empresa_id)
         VALUES (9999, '111', 'CMA', 1000, '2024-01-10', '2025-06-10', 1)`,
      )
      .run();

    const c2 = fakeContext();
    await executarImportacaoHistoricoEmLotes(
      c2,
      [
        { funcionario_cpf: '111', qualificacao_codigo: 'CMA', data_conclusao: '2026-01-10', data_vencimento: '2027-01-10' },
      ],
      'INSERT',
      1,
    );

    const rows = historicoRows('111', 'CMA');
    expect(rows).toHaveLength(3);
    // Nenhuma linha do grupo foi encadeada — o grupo inteiro tem empate.
    expect(rows.every((r) => r.renovacao_de === null)).toBe(true);
  });

  it('funcionário de outro tenant: rejeitado com erro, nenhuma linha criada', async () => {
    sqlite.database
      .prepare(`INSERT INTO funcionarios (id, empresa_id, cpf, nome) VALUES (6000, 2, '222', 'Outro Tenant')`)
      .run();

    const c = fakeContext();
    const response = (await executarImportacaoHistoricoEmLotes(
      c,
      [{ funcionario_cpf: '222', qualificacao_codigo: 'CMA', data_conclusao: '2026-01-10', data_vencimento: '2027-01-10' }],
      'INSERT',
      1, // importando no tenant 1, mas o cpf pertence ao tenant 2
    )) as unknown as { body: { inserted: number; failed: number } };

    expect(response.body.inserted).toBe(0);
    expect(response.body.failed).toBe(1);
    expect(historicoRows('222', 'CMA')).toHaveLength(0);
  });
});
