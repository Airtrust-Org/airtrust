import { describe, expect, it, vi } from 'vitest';
import { planLmsHistoricoReconciliation } from '../../services/lms-reconciliation-planner';

function makeDb(options: {
  unlinked: Array<{ id: number; funcionario_id: number; qualificacao_codigo: string | null; data_conclusao: string | null }>;
  historicosByFuncCodigo: Record<string, Array<{ id: number; data_conclusao: string | null }>>;
}) {
  const preparedQueries: string[] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      preparedQueries.push(sql);
      return {
        bind: (...args: unknown[]) => ({
          all: async () => {
            if (sql.includes('FROM lms_matriculas m')) {
              return { results: options.unlinked };
            }
            if (sql.includes('FROM qualificacoes_historico')) {
              const [, funcionarioId, codigo] = args as [number, number, string];
              const key = `${funcionarioId}:${codigo}`;
              return { results: options.historicosByFuncCodigo[key] ?? [] };
            }
            return { results: [] };
          },
        }),
      };
    }),
  } as unknown as D1Database;
  return { db, preparedQueries };
}

describe('planLmsHistoricoReconciliation — planner read-only', () => {
  it('nunca escreve — só usa .prepare(...).bind(...).all(), nenhum .run()', async () => {
    const { db, preparedQueries } = makeDb({
      unlinked: [{ id: 1, funcionario_id: 10, qualificacao_codigo: 'QUAL-A', data_conclusao: '2026-01-01' }],
      historicosByFuncCodigo: { '10:QUAL-A': [{ id: 900, data_conclusao: '2026-01-01' }] },
    });

    await planLmsHistoricoReconciliation(db, 6);

    expect(preparedQueries.every((q) => !/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(q))).toBe(true);
  });

  it('candidato único com data exata: EXACT_DATE_MATCH, com hash e sem nomes no manifest', async () => {
    const { db } = makeDb({
      unlinked: [{ id: 1, funcionario_id: 10, qualificacao_codigo: 'QUAL-A', data_conclusao: '2026-01-01' }],
      historicosByFuncCodigo: { '10:QUAL-A': [{ id: 900, data_conclusao: '2026-01-01' }] },
    });

    const manifest = await planLmsHistoricoReconciliation(db, 6);

    expect(manifest.candidates).toHaveLength(1);
    expect(manifest.candidates[0]).toMatchObject({
      matricula_id: 1,
      candidate_historico_id: 900,
      reason: 'EXACT_DATE_MATCH',
    });
    expect(manifest.candidates[0].entry_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.manifest_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.ambiguities).toHaveLength(0);
    expect(JSON.stringify(manifest)).not.toMatch(/nome|nery|funcionario_nome/i);
  });

  it('múltiplos Históricos com a mesma data exata: ambiguidade, nunca escolhe um', async () => {
    const { db } = makeDb({
      unlinked: [{ id: 1, funcionario_id: 10, qualificacao_codigo: 'QUAL-A', data_conclusao: '2026-01-01' }],
      historicosByFuncCodigo: {
        '10:QUAL-A': [
          { id: 900, data_conclusao: '2026-01-01' },
          { id: 901, data_conclusao: '2026-01-01' },
        ],
      },
    });

    const manifest = await planLmsHistoricoReconciliation(db, 6);

    expect(manifest.candidates).toHaveLength(0);
    expect(manifest.ambiguities).toHaveLength(1);
    expect(manifest.ambiguities[0]).toMatchObject({
      matricula_id: 1,
      candidate_historico_ids: [900, 901],
      reason: 'MULTIPLE_CANDIDATES',
    });
  });

  it('matrícula sem data_conclusao mas com Histórico ativo único: MOST_RECENT_ACTIVE', async () => {
    const { db } = makeDb({
      unlinked: [{ id: 2, funcionario_id: 20, qualificacao_codigo: 'QUAL-B', data_conclusao: null }],
      historicosByFuncCodigo: { '20:QUAL-B': [{ id: 800, data_conclusao: '2025-06-01' }] },
    });

    const manifest = await planLmsHistoricoReconciliation(db, 6);

    expect(manifest.candidates).toHaveLength(1);
    expect(manifest.candidates[0]).toMatchObject({
      matricula_id: 2,
      candidate_historico_id: 800,
      reason: 'MOST_RECENT_ACTIVE',
    });
  });

  it('matrícula sem data_conclusao e múltiplos Históricos ativos: ambiguidade, nunca pega "o mais recente" adivinhando', async () => {
    const { db } = makeDb({
      unlinked: [{ id: 2, funcionario_id: 20, qualificacao_codigo: 'QUAL-B', data_conclusao: null }],
      historicosByFuncCodigo: {
        '20:QUAL-B': [
          { id: 800, data_conclusao: '2025-06-01' },
          { id: 801, data_conclusao: '2024-01-01' },
        ],
      },
    });

    const manifest = await planLmsHistoricoReconciliation(db, 6);

    expect(manifest.candidates).toHaveLength(0);
    expect(manifest.ambiguities).toHaveLength(1);
  });

  it('nenhum Histórico candidato: matrícula não aparece em candidates nem ambiguities', async () => {
    const { db } = makeDb({
      unlinked: [{ id: 3, funcionario_id: 30, qualificacao_codigo: 'QUAL-C', data_conclusao: '2026-01-01' }],
      historicosByFuncCodigo: {},
    });

    const manifest = await planLmsHistoricoReconciliation(db, 6);

    expect(manifest.candidates).toHaveLength(0);
    expect(manifest.ambiguities).toHaveLength(0);
    expect(manifest.total_unlinked_matriculas).toBe(1);
  });

  it('manifest_hash muda se qualquer candidato mudar (integridade)', async () => {
    const { db: db1 } = makeDb({
      unlinked: [{ id: 1, funcionario_id: 10, qualificacao_codigo: 'QUAL-A', data_conclusao: '2026-01-01' }],
      historicosByFuncCodigo: { '10:QUAL-A': [{ id: 900, data_conclusao: '2026-01-01' }] },
    });
    const { db: db2 } = makeDb({
      unlinked: [{ id: 1, funcionario_id: 10, qualificacao_codigo: 'QUAL-A', data_conclusao: '2026-01-01' }],
      historicosByFuncCodigo: { '10:QUAL-A': [{ id: 901, data_conclusao: '2026-01-01' }] },
    });

    const manifest1 = await planLmsHistoricoReconciliation(db1, 6);
    const manifest2 = await planLmsHistoricoReconciliation(db2, 6);

    expect(manifest1.manifest_hash).not.toBe(manifest2.manifest_hash);
  });
});
