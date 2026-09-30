import { describe, expect, it } from 'vitest';
import {
  getTrainingAlertStage,
  inferTrainingAlertStageCode,
  normalizeTrainingAlertFrequency,
  trainingAlertAudience,
  TRAINING_ALERT_DAILY_CRON,
} from '../../services/training-alert-policy';

describe('training alert canonical policy', () => {
  it('fixa o cron canônico diário em 08:00 UTC', () => {
    expect(TRAINING_ALERT_DAILY_CRON).toBe('0 8 * * *');
  });

  it('mantém uma única régua 45/30/15/7/vencida com públicos explícitos', () => {
    expect(getTrainingAlertStage('QUALIFICACAO_45D')).toMatchObject({
      defaultDays: 45,
      employeeEmail: false,
      employeeWhatsapp: false,
      managerCheckEmail: true,
    });
    for (const code of ['QUALIFICACAO_30D', 'QUALIFICACAO_15D', 'QUALIFICACAO_7D']) {
      expect(getTrainingAlertStage(code)).toMatchObject({
        employeeEmail: true,
        employeeWhatsapp: true,
        managerCheckEmail: true,
      });
    }
    expect(getTrainingAlertStage('QUALIFICACAO_VENCIDA')).toMatchObject({
      employeeEmail: true,
      employeeWhatsapp: false,
      managerCheckEmail: false,
      expired: true,
    });
  });

  it('força alerta vencido para uma única entrega mesmo com configuração legada DAILY', () => {
    expect(normalizeTrainingAlertFrequency('QUALIFICACAO_VENCIDA', 'DAILY', 1)).toEqual({
      frequency: 'ONCE',
      intervalDays: null,
    });
    expect(normalizeTrainingAlertFrequency('QUALIFICACAO_30D', 'EVERY_N_DAYS', 5)).toEqual({
      frequency: 'EVERY_N_DAYS',
      intervalDays: 5,
    });
  });

  it('normaliza WhatsApp legado para o mesmo estágio e resolve público CHECK', () => {
    expect(
      inferTrainingAlertStageCode({ tipo: 'WHATSAPP', urgencia: 'medium', dias_antes: 30 }),
    ).toBe('QUALIFICACAO_30D');
    expect(trainingAlertAudience('QUALIFICACAO_30D', false)).toEqual({
      funcionario: true,
      gestores: false,
    });
    expect(trainingAlertAudience('QUALIFICACAO_30D', true)).toEqual({
      funcionario: true,
      gestores: true,
    });
  });
});
