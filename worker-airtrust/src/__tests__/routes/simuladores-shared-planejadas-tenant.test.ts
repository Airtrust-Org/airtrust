/**
 * criarQualificacoesPlanejadas — o path de reuso de registro CANCELADA
 * órfão é tenant-scoped (defense-in-depth).
 *
 * Fase 5 (tree-wide re-verification) do Writer Convergence audit: a
 * auditoria anterior classificou este ponto como AMBIGUOUS_REQUIRES_FOLLOWUP
 * — a SELECT que localiza o conflito de UNIQUE e a UPDATE que soft-deleta o
 * registro CANCELADA órfão para reabrir a vaga não tinham `empresa_id` no
 * WHERE. Na prática não era explorável hoje (funcionario_id já escopa
 * implicitamente a um único tenant), mas o fix adiciona o filtro
 * explicitamente para não depender dessa garantia indireta. Executa contra
 * SQLite real (node:sqlite), não mocks.
 */
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarQualificacoesPlanejadas } from '../../routes/simuladores-shared';

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
  prepare(sql: string) {
    const db = this.db;
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
    };
  }
  async batch(statements: { run: () => Promise<unknown> }[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const s of statements) results.push(await s.run());
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

const SCHEMA = `
CREATE TABLE modelos_sessao (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  gera_qualificacao INTEGER,
  qualificacao_tipo_id INTEGER,
  duracao_estimada REAL,
  deleted_at TEXT
);
CREATE TABLE qualificacoes_tipos (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  codigo TEXT,
  categoria TEXT,
  validade INTEGER,
  deleted_at TEXT
);
CREATE TABLE modelos_sessao_requisitos (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER,
  modelo_sessao_id INTEGER,
  requisito_modelo_sessao_id INTEGER,
  obrigatorio INTEGER DEFAULT 0,
  ordem INTEGER,
  deleted_at TEXT
);
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER,
  qualificacao_codigo TEXT,
  categoria TEXT,
  data_conclusao TEXT,
  validade_meses INTEGER,
  status TEXT,
  renovada INTEGER DEFAULT 0,
  carga_horaria REAL,
  tipo_treinamento TEXT,
  sessao_id INTEGER,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);
`;

let sqlite: DatabaseSync;
let db: FakeD1;

beforeEach(() => {
  sqlite = new NodeDatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  db = new FakeD1(sqlite);

  sqlite
    .prepare(
      `INSERT INTO modelos_sessao (id, empresa_id, gera_qualificacao, qualificacao_tipo_id, duracao_estimada)
       VALUES (500, 1, 1, 900, 4)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, categoria, validade)
       VALUES (900, 1, 'PER', 'MANUTENCAO', 12)`,
    )
    .run();
});

afterEach(() => {
  sqlite.close();
});

const futureDate = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
};

describe('criarQualificacoesPlanejadas — reuso de CANCELADA órfão é tenant-scoped', () => {
  it('nunca reaproveita (nem soft-deleta) um registro CANCELADA de outro tenant com o mesmo funcionario_id/código/data', async () => {
    const data = futureDate();
    // Um registro CANCELADA "órfão" no tenant 2, coincidentemente com o
    // mesmo funcionario_id (globalmente único, mas o teste prova que o
    // filtro empresa_id agora está lá independentemente disso).
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico
           (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, status)
         VALUES (1, 2, 3000, 'PER', ?, 'CANCELADA')`,
      )
      .run(data);

    const result = await criarQualificacoesPlanejadas(db as unknown as D1Database, {
      sessaoId: 700,
      modeloId: 500,
      tipoSessao: 'PER',
      data,
      participantes: [{ funcionario_id: 3000 }],
      empresaId: 1,
    });

    // A linha do tenant 2 nunca é vista/tocada pela busca de conflito
    // porque agora é filtrada por empresa_id — logo não é reconhecida como
    // "conflito CANCELADA reaproveitável" e permanece intacta.
    const otherTenantRow = sqlite
      .prepare('SELECT deleted_at FROM qualificacoes_historico WHERE id = 1')
      .get() as Record<string, unknown>;
    expect(otherTenantRow.deleted_at).toBeNull();

    // A nova PLANEJADA é criada normalmente no tenant 1.
    expect(result.criadas).toBe(1);
    const created = sqlite
      .prepare('SELECT empresa_id, status FROM qualificacoes_historico WHERE empresa_id = 1')
      .get() as Record<string, unknown>;
    expect(created.status).toBe('PLANEJADA');
  });

  it('reaproveita corretamente um CANCELADA órfão do MESMO tenant, soft-deletando-o antes de criar a nova PLANEJADA', async () => {
    const data = futureDate();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico
           (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, status)
         VALUES (2, 1, 4000, 'PER', ?, 'CANCELADA')`,
      )
      .run(data);

    const result = await criarQualificacoesPlanejadas(db as unknown as D1Database, {
      sessaoId: 701,
      modeloId: 500,
      tipoSessao: 'PER',
      data,
      participantes: [{ funcionario_id: 4000 }],
      empresaId: 1,
    });

    expect(result.criadas).toBe(1);
    const archived = sqlite
      .prepare('SELECT deleted_at FROM qualificacoes_historico WHERE id = 2')
      .get() as Record<string, unknown>;
    expect(archived.deleted_at).not.toBeNull();
  });
});
