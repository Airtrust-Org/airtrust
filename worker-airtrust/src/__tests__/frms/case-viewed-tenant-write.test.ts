import { beforeEach, describe, expect, it, vi } from 'vitest';

const auditSpy = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('../../lib/frms/db-service-shared', () => ({
  now: () => '2026-10-12 22:00:00',
  logAuditoria: (...args: unknown[]) => auditSpy(...args),
}));

import { marcarAlertaVisualizado } from '../../lib/frms/db-service-alertas';

function database(row: object | null, changes = 1) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      const stmt = {
        params: [] as unknown[],
        bind(...args: unknown[]) { stmt.params = args; return stmt; },
        async first() { statements.push({ sql, params: stmt.params }); return row; },
        async run() {
          statements.push({ sql, params: stmt.params });
          return { success: true, meta: { changes } };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, statements };
}

describe('visualização FRMS tenant-scoped', () => {
  beforeEach(() => { auditSpy.mockClear(); });

  it('recusa sem owner no tenant e não escreve nem audita', async () => {
    const { db, statements } = database(null);
    expect(await marcarAlertaVisualizado(db, 'case-9', 'actor-7', 12)).toBe(false);
    expect(statements).toHaveLength(1);
    expect(statements[0].params).toEqual(['case-9', 12]);
    expect(statements[0].sql).toContain('f.empresa_id = ?');
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('escopa SELECT e UPDATE à mesma empresa, auditando somente sucesso', async () => {
    const { db, statements } = database({ id: 'case-9' });
    expect(await marcarAlertaVisualizado(db, 'case-9', 'actor-7', 12)).toBe(true);
    expect(statements).toHaveLength(2);
    expect(statements[0].params).toEqual(['case-9', 12]);
    expect(statements[1].sql).toContain('f.empresa_id = ?');
    expect(statements[1].params).toEqual([
      '2026-10-12 22:00:00', 'actor-7', '2026-10-12 22:00:00', 'case-9', 12,
    ]);
    expect(auditSpy).toHaveBeenCalledTimes(1);
  });

  it('não registra auditoria quando alteração concorrente invalida ownership', async () => {
    const { db, statements } = database({ id: 'case-9' }, 0);
    expect(await marcarAlertaVisualizado(db, 'case-9', 'actor-7', 12)).toBe(false);
    expect(statements).toHaveLength(2);
    expect(auditSpy).not.toHaveBeenCalled();
  });
});
