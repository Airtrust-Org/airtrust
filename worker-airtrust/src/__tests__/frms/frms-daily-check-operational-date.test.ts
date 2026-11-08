import { describe, expect, it, vi, afterEach } from 'vitest';
import { getSaoPauloOperationalDate, notificarCheckinFadigaPendente } from '../../cron/frms-daily-check';

afterEach(() => vi.useRealTimers());

describe('FRMS cron — data operacional e deduplicação', () => {
  it('mantém dia anterior em São Paulo quando UTC já avançou', () => {
    expect(getSaoPauloOperationalDate(new Date('2026-11-09T01:30:00.000Z'))).toBe('2026-11-08');
    expect(getSaoPauloOperationalDate(new Date('2026-11-09T03:30:00.000Z'))).toBe('2026-11-09');
  });

  it('usa data operacional BRT no filtro de jornada, check-in e dedupe, sem depender do dia UTC de criação', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T01:30:00.000Z'));
    const queries: Array<{ sql: string; binds: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...binds: unknown[]) {
            queries.push({ sql, binds });
            return {
              all: async () => ({ results: [{ id: 31, nome: 'Tripulante Sintético' }] }),
              first: async () => ({ id: 77 }),
              run: async () => ({ success: true }),
            };
          },
        };
      },
    } as unknown as D1Database;
    expect(await notificarCheckinFadigaPendente(db, 42)).toBe(0);
    expect(queries[0].binds).toEqual([42, '2026-11-08', 42, '2026-11-08']);
    expect(queries[1].sql).toContain("json_extract(dados, '$.data_checkin') = ?");
    expect(queries[1].binds).toEqual(['2026-11-08', 42, 31]);
    expect(queries).toHaveLength(2);
  });
});
