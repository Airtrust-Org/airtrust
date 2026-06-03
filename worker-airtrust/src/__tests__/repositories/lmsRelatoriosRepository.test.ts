import { describe, expect, it, vi } from 'vitest';

import {
  getConformidadeRows,
  getCursosConformidadeRows,
  getExpiracaoRows,
} from '../../repositories/lmsRelatoriosRepository';

type QueryCall = { query: string; args: unknown[] };

describe('lmsRelatoriosRepository', () => {
  // ── empresaId guard ────────────────────────────────────────────────────────

  it('getConformidadeRows rejeita empresaId invalido', async () => {
    const db = { prepare: vi.fn() } as unknown as D1Database;
    await expect(getConformidadeRows(db, 0)).rejects.toThrow('requires explicit empresaId');
    await expect(getConformidadeRows(db, Number.NaN)).rejects.toThrow('requires explicit empresaId');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('getCursosConformidadeRows rejeita empresaId invalido', async () => {
    const db = { prepare: vi.fn() } as unknown as D1Database;
    await expect(getCursosConformidadeRows(db, -1)).rejects.toThrow('requires explicit empresaId');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('getExpiracaoRows rejeita empresaId invalido', async () => {
    const db = { prepare: vi.fn() } as unknown as D1Database;
    await expect(getExpiracaoRows(db, 0, 30)).rejects.toThrow('requires explicit empresaId');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  // ── tenant isolation ───────────────────────────────────────────────────────

  it('getConformidadeRows aplica filtro empresa_id e soft-delete', async () => {
    const calls: QueryCall[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          return { all: async () => ({ results: [{ funcao: 'Piloto', total_funcionarios: 5 }] }) };
        },
      })),
    } as unknown as D1Database;

    const rows = await getConformidadeRows(db, 42);
    expect(rows).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([42]);
    expect(calls[0]?.query).toContain('f.empresa_id = ?');
    expect(calls[0]?.query).toContain('f.deleted_at IS NULL');
    expect(calls[0]?.query).toContain('m.deleted_at IS NULL');
  });

  it('getCursosConformidadeRows aplica filtro empresa_id e soft-delete', async () => {
    const calls: QueryCall[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          return { all: async () => ({ results: [{ curso_id: 1, curso_titulo: 'CRM' }] }) };
        },
      })),
    } as unknown as D1Database;

    const rows = await getCursosConformidadeRows(db, 7);
    expect(rows).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([7]);
    expect(calls[0]?.query).toContain('c.empresa_id = ?');
    expect(calls[0]?.query).toContain('c.deleted_at IS NULL');
    expect(calls[0]?.query).toContain('f.deleted_at IS NULL');
    expect(calls[0]?.query).toContain('m.deleted_at IS NULL');
    expect(calls[0]?.query).toContain('f.empresa_id = m.empresa_id');
  });

  it('getExpiracaoRows aplica filtro empresa_id, soft-delete e clamped dias', async () => {
    const calls: QueryCall[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          return { all: async () => ({ results: [{ matricula_id: 10, funcionario_nome: 'Joao' }] }) };
        },
      })),
    } as unknown as D1Database;

    // dias > max (180) deve ser clamped para 180
    const rows = await getExpiracaoRows(db, 99, 365);
    expect(rows).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([99, 180]); // clamped
    expect(calls[0]?.query).toContain('m.empresa_id = ?');
    expect(calls[0]?.query).toContain('m.deleted_at IS NULL');
    expect(calls[0]?.query).toContain('f.deleted_at IS NULL');
  });

  it('getExpiracaoRows clamped dias para minimo 1 e ignora NaN', async () => {
    const calls: QueryCall[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          return { all: async () => ({ results: [] }) };
        },
      })),
    } as unknown as D1Database;

    const rows = await getExpiracaoRows(db, 1, Number.NaN);
    expect(rows).toEqual([]);
    // NaN deve ser tratado como default 30
    expect(calls[0]?.args).toEqual([1, 30]);
  });

  it('getExpiracaoRows clamped dias para max 180', async () => {
    const calls: QueryCall[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          return { all: async () => ({ results: [] }) };
        },
      })),
    } as unknown as D1Database;

    await getExpiracaoRows(db, 5, 999);
    expect(calls[0]?.args).toEqual([5, 180]);
  });

  // ── empty results ──────────────────────────────────────────────────────────

  it('getConformidadeRows retorna array vazio quando sem resultados', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: () => ({
          all: async () => ({ results: undefined as unknown as [] }),
        }),
      })),
    } as unknown as D1Database;

    const rows = await getConformidadeRows(db, 1);
    expect(rows).toEqual([]);
  });
});
