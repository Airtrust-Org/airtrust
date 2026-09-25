import { describe, expect, it, vi } from 'vitest';
import {
  frmsActivityDurationMinutes,
  loadFrmsActivityRows,
  summarizeFrmsActivities,
} from '../../lib/frms/activity-context';

describe('FRMS activity context', () => {
  it('conta simulador atravessando meia-noite como atividade e HV equivalente FRMS', () => {
    expect(frmsActivityDurationMinutes('23:30', '02:00')).toBe(150);
    const summary = summarizeFrmsActivities([
      {
        data_operacional: '2026-09-25',
        funcionario_id: 20,
        activity_type: 'SIMULADOR',
        hora_inicio: '23:30',
        hora_fim: '02:00',
        titulo: 'Emergências AW139',
        source_id: 99,
      },
    ]);

    expect(summary.activity_type).toBe('SIMULADOR');
    expect(summary.activity_minutes).toBe(150);
    expect(summary.simulator_minutes).toBe(150);
    expect(summary.training_minutes).toBe(0);
    expect(summary.start_time).toBe('23:30');
    expect(summary.end_time).toBe('02:00');
  });

  it('mantém treinamento em sala como carga de atividade sem transformá-lo em simulador', () => {
    const summary = summarizeFrmsActivities([
      {
        data_operacional: '2026-09-25',
        funcionario_id: 20,
        activity_type: 'TREINAMENTO',
        hora_inicio: '08:00',
        hora_fim: '17:00',
        titulo: 'Treinamento em sala',
        source_id: 10,
      },
    ]);

    expect(summary.activity_type).toBe('TREINAMENTO');
    expect(summary.activity_minutes).toBe(540);
    expect(summary.training_minutes).toBe(540);
    expect(summary.simulator_minutes).toBe(0);
  });

  it('faz todas as leituras tenant-scoped e deduplica a mesma sessão de simulador', async () => {
    const queries: Array<{ sql: string; binds: unknown[] }> = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...binds: unknown[]) => ({
          all: async () => {
            queries.push({ sql, binds });
            if (sql.includes('FROM treinamentos_dias td')) {
              return {
                results: [{
                  data_operacional: '2026-09-25',
                  funcionario_id: 20,
                  activity_type: 'SIMULADOR',
                  hora_inicio: '23:00',
                  hora_fim: '01:00',
                  titulo: 'Sessão noturna',
                  source_id: 7,
                  dedupe_key: 'SIM:42:20',
                }],
              };
            }
            if (sql.includes('FROM treinamentos_planejados t')) return { results: [] };
            return {
              results: [{
                data_operacional: '2026-09-25',
                funcionario_id: 20,
                activity_type: 'SIMULADOR',
                hora_inicio: '23:00',
                hora_fim: '01:00',
                titulo: 'Sessão noturna',
                source_id: 42,
                dedupe_key: 'SIM:42:20',
              }],
            };
          },
        }),
      })),
    } as unknown as D1Database;

    const rows = await loadFrmsActivityRows(db, 63, '2026-09-23', '2026-09-30');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.activity_type).toBe('SIMULADOR');
    expect(queries).toHaveLength(3);
    for (const query of queries) {
      expect(query.binds[0]).toBe(63);
      expect(query.sql).toContain('empresa_id');
    }
  });
});
