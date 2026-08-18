/**
 * readPreBatchState — seleção de predecessor REAL contra SQLite (não mock).
 *
 * Prova o gap corrigido: a seleção de "anteriorAtiva" usada para setar
 * renovacao_de/renovada não pode escolher uma linha PLANEJADA/CANCELADA nem
 * uma linha datada no futuro em relação à conclusão sendo processada — ela
 * deve escolher o predecessor CONCLUIDA cronologicamente mais próximo.
 */
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readPreBatchState } from '../../services/lms-completion';

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
  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

const SCHEMA = `
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  qualificacao_codigo TEXT,
  data_conclusao TEXT,
  data_vencimento TEXT,
  status TEXT,
  renovada INTEGER DEFAULT 0,
  renovacao_de INTEGER,
  observacoes TEXT,
  deleted_at TEXT
);
CREATE TABLE lms_matricula_ciclos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER,
  matricula_id INTEGER,
  ciclo_atual INTEGER DEFAULT 1,
  numero_ciclo INTEGER,
  deleted_at TEXT
);
`;

let sqlite: DatabaseSync;
let db: FakeD1;

function seedHistorico(row: {
  id: number;
  dataConclusao: string;
  dataVencimento: string;
  status: string;
  renovada?: number;
}) {
  sqlite
    .prepare(
      `INSERT INTO qualificacoes_historico
         (id, empresa_id, funcionario_id, qualificacao_codigo, data_conclusao, data_vencimento, status, renovada, deleted_at)
       VALUES (?, 6, 77, 'QUAL-X', ?, ?, ?, ?, NULL)`,
    )
    .run(row.id, row.dataConclusao, row.dataVencimento, row.status, row.renovada ?? 0);
}

function baseParams(dataConclusao: string) {
  return {
    db: undefined as unknown as D1Database,
    empresaId: 6,
    matriculaId: 1,
    funcionarioId: 77,
    cursoTitulo: 'Curso',
    gerarQualificacaoAoConcluir: true,
    qualificacaoTipoId: 55,
    qualificacaoCodigo: 'QUAL-X',
    qualificacaoNome: 'Qualificação X',
    qualificacaoCategoriaId: 13,
    qualificacaoCategoria: 'TREINAMENTO',
    validade: 12,
    vencimentoFimMes: 0 as const,
    dataConclusao,
    existingHistoricoId: null,
    progressoPct: 100,
    action: 'LMS_MATRICULA_CONCLUIDA',
    actorUserId: 42,
  };
}

beforeEach(() => {
  sqlite = new NodeDatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  db = new FakeD1(sqlite);
});

afterEach(() => {
  sqlite.close();
});

describe('readPreBatchState — seleção de predecessor não escolhe PLANEJADA/CANCELADA nem futuro', () => {
  it('ignora uma linha CANCELADA com data_vencimento alta e escolhe o predecessor CONCLUIDA real', async () => {
    // Linha 500: CANCELADA, mas com data_vencimento no futuro distante (ex-registro
    // cancelado antes de vencer). Linha 501: o predecessor CONCLUIDA verdadeiro,
    // com data_vencimento mais baixa. ORDER BY data_vencimento DESC (o bug antigo)
    // escolheria 500; a versão corrigida (ORDER BY data_conclusao DESC + exclusão
    // de status não-completados) deve escolher 501.
    seedHistorico({
      id: 500,
      dataConclusao: '2024-01-10',
      dataVencimento: '2030-01-10',
      status: 'CANCELADA',
    });
    seedHistorico({
      id: 501,
      dataConclusao: '2025-01-10',
      dataVencimento: '2026-01-10',
      status: 'CONCLUIDA',
    });

    const pre = await readPreBatchState(
      db.asD1(),
      baseParams('2026-07-30'),
      'QUAL-X',
    );

    expect(pre.anteriorAtivaId).toBe(501);
  });

  it('nunca escolhe uma linha PLANEJADA como predecessor', async () => {
    seedHistorico({
      id: 600,
      dataConclusao: '2027-01-10',
      dataVencimento: '2028-01-10',
      status: 'PLANEJADA',
    });
    seedHistorico({
      id: 601,
      dataConclusao: '2025-01-10',
      dataVencimento: '2026-01-10',
      status: 'CONCLUIDA',
    });

    const pre = await readPreBatchState(db.asD1(), baseParams('2026-07-30'), 'QUAL-X');

    expect(pre.anteriorAtivaId).toBe(601);
  });

  it('nunca escolhe uma linha datada depois (ou no mesmo dia) da conclusão sendo processada', async () => {
    // Linha 700 tem data_conclusao POSTERIOR ao evento sendo processado —
    // não pode virar "predecessor" de um evento mais antigo.
    seedHistorico({
      id: 700,
      dataConclusao: '2026-08-01',
      dataVencimento: '2027-08-01',
      status: 'CONCLUIDA',
    });

    const pre = await readPreBatchState(db.asD1(), baseParams('2026-07-30'), 'QUAL-X');

    expect(pre.anteriorAtivaId).toBeNull();
  });

  it('escolhe corretamente o predecessor cronologicamente mais recente quando há múltiplos elegíveis', async () => {
    seedHistorico({
      id: 800,
      dataConclusao: '2023-01-10',
      dataVencimento: '2024-01-10',
      status: 'CONCLUIDA',
    });
    seedHistorico({
      id: 801,
      dataConclusao: '2025-01-10',
      dataVencimento: '2026-01-10',
      status: 'CONCLUIDA',
    });

    const pre = await readPreBatchState(db.asD1(), baseParams('2026-07-30'), 'QUAL-X');

    expect(pre.anteriorAtivaId).toBe(801);
  });
});
