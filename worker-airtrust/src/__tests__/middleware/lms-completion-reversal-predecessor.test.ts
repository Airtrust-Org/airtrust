/**
 * enforceLmsCompletionReversal — restauração do predecessor ao reverter.
 *
 * Prova o gap corrigido: reverter uma conclusão LMS que havia marcado um
 * predecessor como RENOVADA (via renovacao_de) deve restaurar esse
 * predecessor para CONCLUIDA/renovada=0 — não deixá-lo permanentemente
 * órfão como RENOVADA sem sucessor vivo.
 */
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enforceLmsCompletionReversal } from '../../middleware/lms-completion-reversal';

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
CREATE TABLE lms_matriculas (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER,
  status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
  progresso_pct INTEGER DEFAULT 0,
  score_final INTEGER,
  data_conclusao TEXT,
  qualificacao_historico_id INTEGER,
  observacoes TEXT,
  deleted_at TEXT,
  updated_at TEXT
);
CREATE TABLE lms_matricula_ciclos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER,
  matricula_id INTEGER,
  ciclo_atual INTEGER DEFAULT 1,
  status TEXT,
  data_conclusao TEXT,
  progresso_pct INTEGER,
  score_final INTEGER,
  qualificacao_historico_id INTEGER,
  observacoes TEXT,
  deleted_at TEXT,
  updated_at TEXT
);
CREATE TABLE lms_progresso_scorm (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula_id INTEGER,
  empresa_id INTEGER,
  lesson_status TEXT,
  completion_status TEXT,
  success_status TEXT,
  score_raw REAL,
  score_max REAL,
  score_min REAL,
  score_scaled REAL,
  session_time TEXT,
  total_time TEXT,
  session_count INTEGER DEFAULT 1,
  suspend_data TEXT,
  launch_data TEXT,
  cmi_json TEXT,
  last_commit_at TEXT,
  updated_at TEXT
);
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  qualificacao_codigo TEXT,
  data_conclusao TEXT,
  status TEXT,
  renovada INTEGER DEFAULT 0,
  renovacao_de INTEGER,
  certificado_arquivo_id INTEGER,
  observacoes TEXT,
  deleted_at TEXT,
  updated_at TEXT
);
CREATE TABLE documentos (
  id INTEGER PRIMARY KEY,
  deleted_at TEXT,
  updated_at TEXT
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

let sqlite: DatabaseSync;
let db: FakeD1;

type TestVariables = { empresaId: number; userId: number; userRole: string };

async function callReversal(matriculaId: number) {
  const app = new Hono<{ Variables: TestVariables }>();
  app.post('/api/lms/matriculas/:id/reverter', async (c) => {
    c.set('empresaId', 6);
    c.set('userId', 900);
    c.set('userRole', 'admin');
    c.env = { DB: db } as never;
    const response = await enforceLmsCompletionReversal(c as never);
    return response ?? c.json({ error: 'not handled' }, 500);
  });

  return app.request(`/api/lms/matriculas/${matriculaId}/reverter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'Correção de conclusão indevida', classification: 'CORRECAO' }),
  });
}

beforeEach(() => {
  sqlite = new NodeDatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  db = new FakeD1(sqlite);
});

afterEach(() => {
  sqlite.close();
});

describe('enforceLmsCompletionReversal — restaura o predecessor ao reverter', () => {
  it('restaura o predecessor RENOVADA para CONCLUIDA/renovada=0 ao reverter o sucessor', async () => {
    // Predecessor: já renovado por uma conclusão LMS anterior.
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, status, renovada, renovacao_de, deleted_at)
         VALUES (500, 6, 77, 'QUAL-X', '2025-01-10', 'RENOVADA', 1, NULL, NULL)`,
      )
      .run();
    // Sucessor: aponta para o predecessor via renovacao_de.
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, status, renovada, renovacao_de, deleted_at)
         VALUES (501, 6, 77, 'QUAL-X', '2026-01-10', 'CONCLUIDA', 0, 500, NULL)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO lms_matriculas (id, empresa_id, funcionario_id, status, qualificacao_historico_id)
         VALUES (10, 6, 77, 'CONCLUIDO', 501)`,
      )
      .run();

    const response = await callReversal(10);
    expect(response.status).toBe(200);

    const successor = sqlite
      .prepare('SELECT status, deleted_at FROM qualificacoes_historico WHERE id = 501')
      .get() as Record<string, unknown>;
    expect(successor.status).toBe('CANCELADA');
    expect(successor.deleted_at).not.toBeNull();

    const predecessor = sqlite
      .prepare('SELECT status, renovada FROM qualificacoes_historico WHERE id = 500')
      .get() as Record<string, unknown>;
    expect(predecessor.status).toBe('CONCLUIDA');
    expect(predecessor.renovada).toBe(0);
  });

  it('não restaura nada quando o sucessor não tinha renovacao_de (primeira qualificação)', async () => {
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, status, renovada, renovacao_de, deleted_at)
         VALUES (600, 6, 77, 'QUAL-Y', '2026-01-10', 'CONCLUIDA', 0, NULL, NULL)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO lms_matriculas (id, empresa_id, funcionario_id, status, qualificacao_historico_id)
         VALUES (11, 6, 77, 'CONCLUIDO', 600)`,
      )
      .run();

    const response = await callReversal(11);
    expect(response.status).toBe(200);

    const successor = sqlite
      .prepare('SELECT status FROM qualificacoes_historico WHERE id = 600')
      .get() as Record<string, unknown>;
    expect(successor.status).toBe('CANCELADA');
  });

  it('não restaura um predecessor que já não está RENOVADA (guarda contra sobrescrever estado divergente)', async () => {
    // Predecessor foi reclassificado/alterado por outro fluxo após a renovação
    // original — não deve ser tocado por uma reversão tardia.
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, status, renovada, renovacao_de, deleted_at)
         VALUES (700, 6, 77, 'QUAL-Z', '2025-01-10', 'CANCELADA', 0, NULL, NULL)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, status, renovada, renovacao_de, deleted_at)
         VALUES (701, 6, 77, 'QUAL-Z', '2026-01-10', 'CONCLUIDA', 0, 700, NULL)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO lms_matriculas (id, empresa_id, funcionario_id, status, qualificacao_historico_id)
         VALUES (12, 6, 77, 'CONCLUIDO', 701)`,
      )
      .run();

    const response = await callReversal(12);
    expect(response.status).toBe(200);

    const predecessor = sqlite
      .prepare('SELECT status FROM qualificacoes_historico WHERE id = 700')
      .get() as Record<string, unknown>;
    expect(predecessor.status).toBe('CANCELADA');
  });
});
