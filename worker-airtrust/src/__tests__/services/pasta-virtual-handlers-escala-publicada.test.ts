/**
 * TEN-EVENT-004 (Tenant Readiness Matrix V3) — ESCALA_PUBLICADA é um job
 * corporativo, não vinculado a um funcionário específico. origem_usuario_id
 * (o USER que publicou a escala — espaço de id distinto de funcionarios.id,
 * a mesma classe de colisão já corrigida para FRMS em resolveFuncionarioId)
 * deve permanecer só no payload/auditoria do evento (domain_events.payload),
 * nunca ser gravado em pasta_virtual_jobs.funcionario_id.
 *
 * Executa o pipeline real (processarEventosParaModulo → claim → handler →
 * finalize) contra SQLite real (node:sqlite), não mocks — mesmo mecanismo
 * usado em produção, só com um banco descartável.
 */
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { processarEventosParaModulo } from '../../shared/eventProcessor';
import '../../shared/handlers/pastaVirtualHandlers';

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
          async run() {
            const result = db.prepare(sql).run(...values.map(normalize));
            return { meta: { changes: Number(result.changes || 0) } };
          },
          async first<T = Record<string, unknown>>(): Promise<T | null> {
            const row = db.prepare(sql).get(...values.map(normalize)) as
              | Record<string, unknown>
              | undefined;
            return (row as T) ?? null;
          },
          async all<T = Record<string, unknown>>() {
            return { results: db.prepare(sql).all(...values.map(normalize)) as T[] };
          },
        };
      },
    };
  }
}

const SCHEMA = `
CREATE TABLE domain_events (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  modulo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  payload TEXT NOT NULL,
  consumidores TEXT NOT NULL DEFAULT '[]',
  processado INTEGER NOT NULL DEFAULT 0,
  processado_por TEXT DEFAULT '[]',
  ultimo_erro TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT,
  deleted_at TEXT
);
CREATE TABLE pasta_virtual_jobs (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id TEXT,
  referencia_id TEXT,
  referencia_tipo TEXT,
  tipo_documento TEXT,
  nome_arquivo TEXT,
  status_geracao TEXT,
  created_at TEXT,
  updated_at TEXT
);
`;

let sqlite: DatabaseSync;
let db: FakeD1;

beforeEach(() => {
  sqlite = new NodeDatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  db = new FakeD1(sqlite);
});

afterEach(() => {
  sqlite.close();
});

describe('ESCALA_PUBLICADA → pasta_virtual — funcionario_id nunca vem de origem_usuario_id', () => {
  it('processa o evento real e grava funcionario_id NULL mesmo com origem_usuario_id colidindo numericamente com um funcionario.id', async () => {
    // origem_usuario_id=42 é o USER que publicou — poderia colidir
    // numericamente com funcionarios.id=42 de outro tenant.
    const payload = {
      empresa_id: 1,
      escala_id: 'escala-abc123',
      mes: 8,
      ano: 2026,
      origem_usuario_id: 42,
    };

    sqlite
      .prepare(
        `INSERT INTO domain_events (id, empresa_id, modulo, tipo, payload, consumidores)
         VALUES ('evt-1', 1, 'pasta_virtual', 'ESCALA_PUBLICADA', ?, '["pasta_virtual"]')`,
      )
      .run(JSON.stringify(payload));

    const result = await processarEventosParaModulo(db as unknown as D1Database, '1', 'pasta_virtual');
    expect(result.processados).toBe(1);
    expect(result.erros).toBe(0);

    const row = sqlite
      .prepare('SELECT empresa_id, funcionario_id, referencia_tipo FROM pasta_virtual_jobs')
      .get() as Record<string, unknown>;

    expect(row).toBeDefined();
    expect(row.funcionario_id).toBeNull();
    expect(row.empresa_id).toBe(1);
    expect(row.referencia_tipo).toBe('escala');

    // origem_usuario_id continua disponível no payload do evento original
    // (auditoria), mesmo não tendo sido copiado para funcionario_id.
    const evt = sqlite
      .prepare('SELECT payload FROM domain_events WHERE id = ?')
      .get('evt-1') as Record<string, unknown>;
    expect(JSON.parse(String(evt.payload)).origem_usuario_id).toBe(42);
  });
});
