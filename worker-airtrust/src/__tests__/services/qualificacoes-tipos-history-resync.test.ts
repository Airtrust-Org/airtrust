/**
 * #1492: importadores de tipos alteravam `validade` sem refletir nos historicos
 * vinculados. SQLite real (node:sqlite), sem mocks.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  resyncTipoHistoricoValidity,
  shouldResyncTipoValidity,
} from '../../services/qualificacoes-tipos-history-resync';
import { QualificacaoTipoImportacaoService } from '../../services/importacao/QualificacaoTipoImportacao';

let sqlite: SqliteD1Database;

beforeEach(() => {
  sqlite = new SqliteD1Database();
  sqlite.database.exec(`
    ALTER TABLE qualificacoes_tipos ADD COLUMN nome TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN vencimento_fim_mes INTEGER DEFAULT 0;
    ALTER TABLE qualificacoes_tipos ADD COLUMN tipo TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN descricao TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN observacoes TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN updated_at TEXT;
    INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, categoria, validade, vencimento_fim_mes)
      VALUES (10, 6, 'NR35', 'NR-35', 'Geral', 12, 0), (11, 7, 'NR35', 'NR-35', 'Geral', 12, 0);
  `);
});
afterEach(() => sqlite.close());

function addHistory(
  id: number,
  empresaId: number,
  status: string,
  conclusao: string,
  venc: string,
  tipoId = 10,
  deleted: string | null = null,
) {
  sqlite.database
    .prepare(
      `INSERT INTO qualificacoes_historico
         (id, funcionario_id, qualificacao_id, qualificacao_codigo, data_conclusao, data_vencimento,
          validade_meses, status, empresa_id, deleted_at)
       VALUES (?, ?, ?, 'NR35', ?, ?, 12, ?, ?, ?)`,
    )
    .run(id, id, tipoId, conclusao, venc, status, empresaId, deleted);
}
const row = (id: number) => {
  const r = sqlite.database
    .prepare('SELECT validade_meses v, data_vencimento d FROM qualificacoes_historico WHERE id=?')
    .get(id) as { v: number; d: string };
  return { v: r.v, d: r.d };
};

describe('resyncTipoHistoricoValidity', () => {
  it('reflete nova validade so nos historicos vigentes do tenant/tipo', async () => {
    addHistory(1, 6, 'CONCLUIDA', '2025-01-15', '2026-01-15');
    addHistory(2, 6, 'CANCELADA', '2025-01-15', '2026-01-15');
    addHistory(3, 6, 'CONCLUIDA', '2025-01-15', '2026-01-15', 10, '2026-02-01');
    addHistory(4, 7, 'CONCLUIDA', '2025-01-15', '2026-01-15', 11);
    sqlite.database.exec('UPDATE qualificacoes_tipos SET validade = 24 WHERE id IN (10, 11)');
    const out = await resyncTipoHistoricoValidity(sqlite.asD1(), 6, 10);
    expect(out.updated).toBe(1);
    expect(row(1)).toEqual({ v: 24, d: '2027-01-15' });
    expect(row(2)).toEqual({ v: 12, d: '2026-01-15' });
    expect(row(3)).toEqual({ v: 12, d: '2026-01-15' });
    expect(row(4)).toEqual({ v: 12, d: '2026-01-15' });
  });

  it('ignora vencimento_fim_mes legado (vence no dia) e e idempotente', async () => {
    addHistory(1, 6, 'CONCLUIDA', '2025-01-15', '2026-01-15');
    sqlite.database.exec(
      'UPDATE qualificacoes_tipos SET validade = 6, vencimento_fim_mes = 1 WHERE id = 10',
    );
    expect((await resyncTipoHistoricoValidity(sqlite.asD1(), 6, 10)).updated).toBe(1);
    expect(row(1)).toEqual({ v: 6, d: '2025-07-15' });
    expect((await resyncTipoHistoricoValidity(sqlite.asD1(), 6, 10)).updated).toBe(0);
  });

  it('nunca apaga vencimento quando a validade nova e vazia/zero', () => {
    expect(shouldResyncTipoValidity(12, null)).toBe(false);
    expect(shouldResyncTipoValidity(12, 0)).toBe(false);
    expect(shouldResyncTipoValidity(12, '')).toBe(false);
    expect(shouldResyncTipoValidity(12, 12)).toBe(false);
    expect(shouldResyncTipoValidity(12, '24')).toBe(true);
    expect(shouldResyncTipoValidity(null, 6)).toBe(true);
  });
});

describe('QualificacaoTipoImportacaoService.import', () => {
  it('UPDATE de validade pelo importador reflete nos historicos do tipo', async () => {
    addHistory(1, 6, 'CONCLUIDA', '2025-01-15', '2026-01-15');
    const service = new QualificacaoTipoImportacaoService(sqlite.asD1(), 6);
    const out = await service.import(
      [{ tipo: 'Curso', codigo: 'NR35', nome: 'NR-35', categoria: 'Geral', validade: 24 }],
      'UPDATE',
    );
    expect(out.errors).toEqual([]);
    expect(out.updated).toBe(1);
    expect(row(1)).toEqual({ v: 24, d: '2027-01-15' });
  });
});
