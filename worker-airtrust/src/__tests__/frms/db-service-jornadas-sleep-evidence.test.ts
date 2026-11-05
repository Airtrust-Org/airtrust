import { describe, expect, it, vi } from 'vitest';
import { loadDailyCheckinEvidence } from '../../lib/frms/db-service-jornadas';
import { calcularFatorRepouso, calcularSono } from '../../lib/frms/fadiga-score';

function stubCheckin(sleepHours: number | null) {
  const first = vi.fn().mockResolvedValue({
    id: 'checkin-1',
    jornada_inicio_prevista: '05:30',
    wake_time: '04:00',
    horas_sono: sleepHours,
  });
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { db: { prepare } as unknown as D1Database, prepare, bind };
}

describe('FRMS jornada — sono declarado no check-in', () => {
  it('preserva relato real de 0 h com o escopo empresa/tripulante/data', async () => {
    const { db, prepare, bind } = stubCheckin(0);
    const evidence = await loadDailyCheckinEvidence(db, 11, 27, '2026-11-05');
    expect(evidence).toEqual({
      checkinId: 'checkin-1',
      presentationTime: '05:30',
      wakeTime: '04:00',
      sleepHours24h: 0,
    });
    expect(prepare.mock.calls[0][0]).toContain('empresa_id = ?');
    expect(bind).toHaveBeenCalledWith(11, 27, '2026-11-05');
  });

  it('não confunde zero com ausência de informação no recálculo', async () => {
    for (const missingOrInvalid of [null, -1, 25, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { db } = stubCheckin(missingOrInvalid);
      expect(await loadDailyCheckinEvidence(db, 11, 27, '2026-11-05')).toBeNull();
    }
    const { db } = stubCheckin(7.5);
    expect((await loadDailyCheckinEvidence(db, 11, 27, '2026-11-05'))?.sleepHours24h).toBe(7.5);
  });

  it('zero reportado continua INFORMADO, sem crédito de recuperação', () => {
    const result = calcularSono({
      horaApresentacaoMin: 330,
      minutosAntesApresentacao: 90,
      horasSonoPadrao: 8,
      horaAcordou: 240,
      duracaoInformadaMin: 0,
    });
    expect(result.sonoEfetivoMin).toBe(0);
    expect(result.fonteSono).toBe('INFORMADO');
    expect(calcularFatorRepouso(result.sonoEfetivoMin!)).toBeLessThan(0);
  });
});
