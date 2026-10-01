import { describe, expect, it } from 'vitest';
import {
  getTrainingAlertStage,
  inferTrainingAlertStageCode,
  normalizeTrainingAlertFrequency,
  trainingAlertAudience,
  TRAINING_ALERT_DAILY_CRON,
  TRAINING_ALERT_DELIVERY_PAUSED,
  TRAINING_ALERT_STAGES,
} from '../../services/training-alert-policy';

describe('training alert canonical policy', () => {
  it('fixa o cron canônico diário em 08:00 UTC', () => {
    expect(TRAINING_ALERT_DAILY_CRON).toBe('0 8 * * *');
  });

  it('preserva a régua configurada e pausa todos os canais efetivos durante o hold operacional', () => {
    expect(TRAINING_ALERT_DELIVERY_PAUSED).toBe(true);
    expect(TRAINING_ALERT_STAGES.find((stage) => stage.code === 'QUALIFICACAO_30D')).toMatchObject({
      employeeEmail: true,
      employeeWhatsapp: true,
      managerCheckEmail: true,
    });

    for (const code of [
      'QUALIFICACAO_45D',
      'QUALIFICACAO_30D',
      'QUALIFICACAO_15D',
      'QUALIFICACAO_7D',
      'QUALIFICACAO_VENCIDA',
    ]) {
      expect(getTrainingAlertStage(code)).toMatchObject({
        employeeEmail: false,
        employeeWhatsapp: false,
        managerCheckEmail: false,
      });
    }
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

  it('continua reconhecendo configuração legada sem liberar destinatários durante a pausa', () => {
    expect(
      inferTrainingAlertStageCode({ tipo: 'WHATSAPP', urgencia: 'medium', dias_antes: 30 }),
    ).toBe('QUALIFICACAO_30D');
    expect(trainingAlertAudience('QUALIFICACAO_30D', false)).toEqual({
      funcionario: false,
      gestores: false,
    });
    expect(trainingAlertAudience('QUALIFICACAO_30D', true)).toEqual({
      funcionario: false,
      gestores: false,
    });
  });
});
