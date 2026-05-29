import { describe, expect, it } from 'vitest';
import { CheckinCreateSchema } from '../../routes/frms-fadiga-checkin.schema';

describe('frms-fadiga-checkin schema', () => {
  it('aceita payload simplificado mobile-first sem sintomas e sem horas_sono_48h', () => {
    const parsed = CheckinCreateSchema.safeParse({
      reference_date: '2026-05-29',
      data_checkin: '2026-05-29',
      wake_time: '05:30',
      hora_acordou: '05:30',
      horas_sono_24h: 7,
      qualidade_sono: 4,
      kss_score: 3,
      subjective_fatigue_level: 3,
      sleepiness_level: 3,
      fit_for_duty: true,
      meds_ult_12h: null,
      alcool_ult_12h: null,
      aceite_termos: true,
      aceite_privacidade: true,
    });

    expect(parsed.success).toBe(true);
  });

  it('rejeita inaptidao sem motivo', () => {
    const parsed = CheckinCreateSchema.safeParse({
      data_checkin: '2026-05-29',
      wake_time: '05:30',
      horas_sono_24h: 6,
      kss_score: 7,
      fit_for_duty: false,
    });

    expect(parsed.success).toBe(false);
  });

  it('aceita inaptidao com motivo', () => {
    const parsed = CheckinCreateSchema.safeParse({
      data_checkin: '2026-05-29',
      wake_time: '05:30',
      horas_sono_24h: 6,
      kss_score: 7,
      fit_for_duty: false,
      motivo_inaptidao: 'Preciso revisar condicao com a coordenacao.',
    });

    expect(parsed.success).toBe(true);
  });
});
