import { describe, expect, it, vi } from 'vitest';
import { sincronizarCheckinComFrms } from '../../lib/frms/fadiga-frms-sync';

function createDb(minutosAntesApresentacao = 90) {
  const updateBinds: unknown[][] = [];
  const eventPayloads: unknown[] = [];

  const db = {
    prepare: vi.fn((query: string) => ({
      all: async () => {
        if (query.includes('FROM frms_configuracao_limites')) {
          return {
            results: [
              { nome: 'MINUTOS_ANTES_APRESENTACAO', valor_numerico: minutosAntesApresentacao },
              { nome: 'HORAS_SONO_PADRAO', valor_numerico: 8 },
            ],
          };
        }
        return { results: [] };
      },
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('FROM frms_jornada')) {
            return { id: 'jornada-1', hora_apresentacao: '07:00' };
          }
          if (query.includes('FROM frms_fatorizacao_jornada')) {
            return {
              id: 'fator-1',
              fator_repouso_pct: 0,
              effectiveness_pct: 90,
            };
          }
          if (query.includes('FROM frms_fadiga_evento')) {
            return null;
          }
          return null;
        },
        run: async () => {
          if (query.includes('UPDATE frms_fatorizacao_jornada')) {
            updateBinds.push(args);
          }
          if (query.includes("VALUES (?, ?, ?, 'FRMS_SYNC'")) {
            eventPayloads.push(args[3]);
          }
          return { success: true };
        },
      }),
    })),
  } as unknown as D1Database;

  return { db, updateBinds, eventPayloads };
}

describe('sincronizarCheckinComFrms', () => {
  it('usa wake_time real do check-in quando disponível', async () => {
    const { db, updateBinds, eventPayloads } = createDb();

    const result = await sincronizarCheckinComFrms(
      db,
      'checkin-1',
      123,
      '2026-05-28',
      6,
      77,
      '04:45',
    );

    expect(result.sincronizado).toBe(true);
    expect(updateBinds[0][1]).toBe('04:45');
    expect(updateBinds[0][2]).toBe('22:45');
    expect(String(eventPayloads[0])).toContain('"wake_time_source":"CREW_REPORTED"');
  });

  it('usa fallback configurável quando wake_time real não existe', async () => {
    const { db, updateBinds, eventPayloads } = createDb();

    await sincronizarCheckinComFrms(db, 'checkin-2', 123, '2026-05-28', 6, 77);

    expect(updateBinds[0][1]).toBe('05:30');
    expect(updateBinds[0][2]).toBe('23:30');
    expect(String(eventPayloads[0])).toContain('FALLBACK_APRESENTACAO_MINUS_CONFIG');
    expect(String(eventPayloads[0])).toContain('"wake_time_fallback_minutos_antes_apresentacao":90');
  });

  it('fallback de wake_time respeita alteração do parâmetro configurável', async () => {
    const { db, updateBinds, eventPayloads } = createDb(75);

    await sincronizarCheckinComFrms(db, 'checkin-3', 123, '2026-05-28', 6, 77);

    expect(updateBinds[0][1]).toBe('05:45');
    expect(updateBinds[0][2]).toBe('23:45');
    expect(String(eventPayloads[0])).toContain('"wake_time_fallback_minutos_antes_apresentacao":75');
  });
});
