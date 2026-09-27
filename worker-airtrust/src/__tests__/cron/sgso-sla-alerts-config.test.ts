import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { enqueueSlaAlerts } from '../../cron/sgso-notificacoes';

describe('SGSO SLA alerts', () => {
  it('usa horas_alerta_previa para enfileirar pré-alertas de triagem e investigação', async () => {
    const inserts: Array<{ query: string; args: unknown[] }> = [];
    const db = {
      prepare: vi.fn((query: string) => {
        const all = async () => {
          if (query.includes('RELPREV_SLA_TRIAGEM_PREVIA') && query.includes('SELECT r.id')) {
            return {
              results: [
                { relato_id: 'R1', empresa_id: 6, numero_protocolo: 'P1', horas_alerta_previa: 4 },
              ],
            };
          }
          if (query.includes('RELPREV_SLA_INVESTIGACAO_PREVIA') && query.includes('SELECT r.id')) {
            return {
              results: [
                { relato_id: 'R2', empresa_id: 6, numero_protocolo: 'P2', horas_alerta_previa: 12 },
              ],
            };
          }
          if (
            query.includes("template_codigo = 'RELPREV_SLA_TRIAGEM'") &&
            query.includes('SELECT r.id')
          )
            return { results: [] };
          if (
            query.includes("template_codigo = 'RELPREV_SLA_INVESTIGACAO'") &&
            query.includes('SELECT r.id')
          )
            return { results: [] };
          if (
            query.includes('SELECT DISTINCT empresa_id') &&
            query.includes('sgso_bowtie_barreiras')
          )
            return { results: [] };
          return { results: [] };
        };
        const run = async (args: unknown[]) => {
          inserts.push({ query, args });
          return { meta: { changes: 1 } };
        };
        return {
          all,
          first: async () => null,
          run: async () => run([]),
          bind: (...args: unknown[]) => ({
            all,
            first: async () => null,
            run: async () => run(args),
          }),
        };
      }),
    } as unknown as D1Database;
    const env = { DB: db } as Env;

    const result = await enqueueSlaAlerts(env);

    expect(result.alertasTriagemPrevios).toBe(1);
    expect(result.alertasInvestigacaoPrevios).toBe(1);
    expect(result.alertasTriagem).toBe(0);
    expect(result.alertasInvestigacao).toBe(0);
    expect(
      inserts.some(({ query }) => query.includes("VALUES (?, ?, 'RELPREV_SLA_TRIAGEM_PREVIA'")),
    ).toBe(true);
    expect(
      inserts.filter(({ query }) =>
        query.includes("VALUES (?, ?, 'RELPREV_SLA_INVESTIGACAO_PREVIA'"),
      ).length,
    ).toBe(2);
  });
});
