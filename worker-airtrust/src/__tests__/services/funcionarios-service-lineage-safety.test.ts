/**
 * FuncionariosService.softDelete — SAFE_BY_CONTRACT para renovacao_de.
 *
 * Fase 4 do Writer Convergence audit. Prova em SQLite real que soft-deletar
 * um funcionário nunca deixa um ponteiro renovacao_de órfão: a cascata
 * soft-deleta TODO o histórico de qualificação do funcionário na mesma
 * operação, e renovacao_de nunca cruza fronteira de funcionário (todo
 * writer da base já convergido escopa a busca de predecessor por
 * funcionario_id/cpf), então não existe cenário onde uma linha ATIVA
 * (deleted_at IS NULL) de OUTRO funcionário aponte para uma linha deste
 * funcionário — e dentro da própria cadeia, predecessor e sucessor saem
 * juntos, nunca um ativo apontando para outro já removido.
 */
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FuncionariosService } from '../../services/funcionarios.service';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

type SqliteValue = string | number | bigint | Uint8Array | null;
function normalize(value: unknown): SqliteValue {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value as SqliteValue;
}

class FakeD1 {
  constructor(private readonly db: DatabaseSync) {}
  prepare(rawSql: string) {
    const db = this.db;
    // node:sqlite is stricter than Cloudflare D1's SQLite about
    // double-quoted string literals (D1 falls back to a string literal
    // when no matching identifier exists; node:sqlite here does not) —
    // normalize datetime("now") to the single-quoted form for this test
    // environment only. Production code is unchanged.
    const sql = rawSql.replace(/datetime\("now"\)/g, "datetime('now')");
    return {
      bind(...values: unknown[]) {
        return {
          async first<T = Record<string, unknown>>(): Promise<T | null> {
            const row = db.prepare(sql).get(...values.map(normalize)) as
              | Record<string, unknown>
              | undefined;
            return (row as T) ?? null;
          },
          async all<T = Record<string, unknown>>() {
            return { results: db.prepare(sql).all(...values.map(normalize)) as T[] };
          },
          async run() {
            const result = db.prepare(sql).run(...values.map(normalize));
            return { meta: { changes: Number(result.changes || 0) } };
          },
        };
      },
      async all<T = Record<string, unknown>>() {
        return { results: db.prepare(sql).all() as T[] };
      },
    };
  }
}

const SCHEMA = `
CREATE TABLE funcionarios (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  nome TEXT,
  deleted_at TEXT,
  updated_at TEXT
);
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  qualificacao_codigo TEXT,
  data_conclusao TEXT,
  renovacao_de INTEGER,
  renovada INTEGER DEFAULT 0,
  status TEXT,
  deleted_at TEXT
);
CREATE TABLE hospedagens (
  id INTEGER PRIMARY KEY,
  funcionario_id INTEGER,
  status TEXT,
  deleted_at TEXT
);
CREATE TABLE registros_frms (
  id INTEGER PRIMARY KEY,
  funcionario_id INTEGER,
  deleted_at TEXT
);
CREATE TABLE sessoes (
  id INTEGER PRIMARY KEY
);
`;

let sqlite: DatabaseSync;
let service: FuncionariosService;

beforeEach(() => {
  sqlite = new NodeDatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  service = new FuncionariosService(new FakeD1(sqlite) as unknown as D1Database);
});

afterEach(() => {
  sqlite.close();
});

describe('FuncionariosService.softDelete — nenhum renovacao_de órfão (SAFE_BY_CONTRACT)', () => {
  it('cadeia completa A<-B<-C do mesmo funcionário: todas as linhas saem juntas, nenhuma ativa aponta para uma deletada', async () => {
    sqlite
      .prepare(`INSERT INTO funcionarios (id, empresa_id, nome) VALUES (1000, 1, 'Fulano')`)
      .run();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, status)
         VALUES (10, 1, 1000, 'CMA', '2022-01-01', 'RENOVADA')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, renovacao_de, status)
         VALUES (11, 1, 1000, 'CMA', '2023-01-01', 10, 'RENOVADA')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, renovacao_de, status)
         VALUES (12, 1, 1000, 'CMA', '2024-01-01', 11, 'CONCLUIDA')`,
      )
      .run();

    const result = await service.softDelete(1000);
    expect(result).not.toBeNull();

    const rows = sqlite
      .prepare('SELECT id, deleted_at FROM qualificacoes_historico WHERE funcionario_id = 1000')
      .all() as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.deleted_at !== null)).toBe(true);

    // Nenhuma linha ATIVA em toda a base aponta (via renovacao_de) para
    // qualquer uma das linhas agora deletadas deste funcionário.
    const danglingPointers = sqlite
      .prepare(
        `SELECT id FROM qualificacoes_historico
          WHERE deleted_at IS NULL AND renovacao_de IN (10, 11, 12)`,
      )
      .all() as Record<string, unknown>[];
    expect(danglingPointers).toHaveLength(0);
  });

  it('outro funcionário nunca é afetado pela cascata (renovacao_de não cruza funcionário)', async () => {
    sqlite
      .prepare(`INSERT INTO funcionarios (id, empresa_id, nome) VALUES (1000, 1, 'Fulano')`)
      .run();
    sqlite
      .prepare(`INSERT INTO funcionarios (id, empresa_id, nome) VALUES (1001, 1, 'Outro')`)
      .run();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, status)
         VALUES (20, 1, 1000, 'CMA', '2023-01-01', 'CONCLUIDA')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, status)
         VALUES (21, 1, 1001, 'CMA', '2023-01-01', 'CONCLUIDA')`,
      )
      .run();

    await service.softDelete(1000);

    const other = sqlite
      .prepare('SELECT deleted_at FROM qualificacoes_historico WHERE id = 21')
      .get() as Record<string, unknown>;
    expect(other.deleted_at).toBeNull();
  });
});
