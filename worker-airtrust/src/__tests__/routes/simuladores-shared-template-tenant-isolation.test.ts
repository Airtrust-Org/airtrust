import { describe, expect, it } from 'vitest';
import { resolveTemplateIdSessao, normalizeChecksSessao } from '../../routes/simuladores-shared';

/**
 * Regression coverage for a tenant-isolation gap found during the
 * 2026-07-15 consolidation audit: `resolveTemplateIdSessao` trusted an
 * explicit `template_id`/`modelo_sessao_id` from the request body without
 * checking it belonged to the caller's `empresa_id` (or wasn't archived),
 * and `normalizeChecksSessao` validated check ids against
 * `qualificacoes_tipos` with no tenant scoping at all.
 */

type ModeloSessaoRow = {
  id: number;
  empresa_id: number;
  deleted_at: string | null;
  nome: string;
  codigo?: string | null;
  modelo_aeronave?: string | null;
};

type QualificacaoTipoRow = {
  id: number;
  empresa_id: number;
  codigo: string;
  nome: string;
  descricao?: string | null;
  categoria?: string | null;
  ativo?: number;
  deleted_at: string | null;
};

function fakeDb(modelosSessao: ModeloSessaoRow[], qualificacoesTipos: QualificacaoTipoRow[]) {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('SELECT id FROM modelos_sessao WHERE id = ?')) {
                const [id, empresaId] = args as [number, number];
                const row = modelosSessao.find(
                  (m) => m.id === id && m.empresa_id === empresaId && m.deleted_at === null,
                );
                return (row ? { id: row.id } : null) as T | null;
              }

              if (sql.includes('FROM modelos_sessao ms') && sql.includes('LEFT JOIN tipos_sessao')) {
                const [, empresaId, temaSessao] = args as [number, number, string];
                const row = modelosSessao
                  .filter((m) => m.empresa_id === empresaId && m.deleted_at === null && m.nome === temaSessao)
                  .sort((a, b) => b.id - a.id)[0];
                return (row ? { id: row.id } : null) as T | null;
              }

              return null as T | null;
            },
            async all<T>() {
              if (sql.includes('FROM qualificacoes_tipos')) {
                const scoped = sql.includes('empresa_id = ?');
                const idsCount = args.length - (scoped ? 1 : 0);
                const ids = args.slice(0, idsCount) as number[];
                const empresaId = scoped ? (args[args.length - 1] as number) : undefined;
                const results = qualificacoesTipos.filter(
                  (q) =>
                    ids.includes(q.id) &&
                    q.deleted_at === null &&
                    q.ativo === 1 &&
                    (q.categoria || '').toUpperCase() === 'CHECK' &&
                    (empresaId === undefined || q.empresa_id === empresaId),
                );
                return { results } as unknown as { results: T[] };
              }
              return { results: [] } as unknown as { results: T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('resolveTemplateIdSessao tenant isolation', () => {
  it('trusts an explicit template id that belongs to the caller tenant', async () => {
    const db = fakeDb(
      [{ id: 501, empresa_id: 6, deleted_at: null, nome: 'Tema X' }],
      [],
    );

    const result = await resolveTemplateIdSessao(db, { empresaId: 6, templateId: 501 });
    expect(result).toBe(501);
  });

  it('does not trust an explicit template id belonging to another tenant', async () => {
    const db = fakeDb(
      [{ id: 501, empresa_id: 9, deleted_at: null, nome: 'Tema X' }],
      [],
    );

    const result = await resolveTemplateIdSessao(db, { empresaId: 6, templateId: 501 });
    expect(result).toBeNull();
  });

  it('does not trust an explicit template id that is soft-deleted', async () => {
    const db = fakeDb(
      [{ id: 501, empresa_id: 6, deleted_at: '2026-07-01 00:00:00', nome: 'Tema X' }],
      [],
    );

    const result = await resolveTemplateIdSessao(db, { empresaId: 6, templateId: 501 });
    expect(result).toBeNull();
  });

  it('falls back to by-name resolution scoped to the tenant when the explicit id is rejected', async () => {
    const db = fakeDb(
      [
        { id: 501, empresa_id: 9, deleted_at: null, nome: 'Tema X' },
        { id: 777, empresa_id: 6, deleted_at: null, nome: 'Tema X' },
      ],
      [],
    );

    const result = await resolveTemplateIdSessao(db, {
      empresaId: 6,
      templateId: 501,
      temaSessao: 'Tema X',
    });
    expect(result).toBe(777);
  });
});

describe('normalizeChecksSessao tenant isolation', () => {
  const checks: QualificacaoTipoRow[] = [
    { id: 10, empresa_id: 6, codigo: 'CHK-A', nome: 'Check A', categoria: 'CHECK', ativo: 1, deleted_at: null },
    { id: 11, empresa_id: 9, codigo: 'CHK-B', nome: 'Check B', categoria: 'CHECK', ativo: 1, deleted_at: null },
  ];

  it('accepts check ids that belong to the caller tenant when empresaId is passed', async () => {
    const db = fakeDb([], checks);
    const result = await normalizeChecksSessao(db, [10], null, 6);
    expect(result).toEqual([10]);
  });

  it('rejects a check id belonging to another tenant when empresaId is passed', async () => {
    const db = fakeDb([], checks);
    await expect(normalizeChecksSessao(db, [11], null, 6)).rejects.toThrow(/Tipos de check inválidos/);
  });

  it('is unscoped (legacy behavior) when empresaId is omitted', async () => {
    const db = fakeDb([], checks);
    const result = await normalizeChecksSessao(db, [11], null);
    expect(result).toEqual([11]);
  });
});
