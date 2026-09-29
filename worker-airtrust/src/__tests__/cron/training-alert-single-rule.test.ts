import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('single automatic training alert rule', () => {
  it('agenda somente a régua canônica diária para comunicação de treinamento', () => {
    const legacy = source('src/cron/scheduled-handler.ts');
    const router = source('src/cron/resilient/scheduled-router.ts');

    expect(legacy).toContain('if (event.cron === TRAINING_ALERT_DAILY_CRON)');
    expect(legacy).toContain('await processarNotificacoes(env);');
    expect(legacy).not.toContain('processLmsCompletionReminders');
    expect(legacy).not.toContain('processTrainingComplianceNotifications');
    expect(router).toContain("await runStep('training-alerts'");
    expect(router).toContain('processarNotificacoes(env)');
    expect(router).not.toContain("runStep('lms-reminders'");
  });

  it('renovação EAD só cria/reabre matrícula e não comunica em paralelo', () => {
    const renewal = source('src/cron/resilient/ead-renewal.ts');
    const legacy = source('src/cron/scheduled-handler.ts');

    expect(renewal).not.toContain('sendEmail(');
    expect(renewal).not.toContain('INSERT OR IGNORE INTO notificacoes_inapp');
    expect(legacy).not.toContain("'lms_renovacao_automatica'");
    expect(legacy).not.toContain('Treinamento disponível:');
  });

  it('sincroniza os estágios canônicos de e-mail e WhatsApp pela mesma configuração', () => {
    const routes = source('src/routes/notificacoes.ts');

    expect(routes).toContain('syncQualificationWhatsappStage');
    expect(routes).toContain('getTrainingAlertStage(params.codigo)');
    expect(routes).toContain("tipo = 'WHATSAPP'");
    expect(routes).toContain('await syncQualificationWhatsappStage(c.env.DB');
  });

  it('mantém snapshots de compliance sem restaurar uma segunda régua de envio', () => {
    const complianceCron = source('src/cron/training-compliance-notifications.ts');
    const router = source('src/cron/resilient/scheduled-router.ts');

    expect(complianceCron).toContain('refreshTrainingComplianceSnapshots');
    expect(complianceCron).toContain('persistTrainingComplianceDailySnapshots');
    expect(complianceCron).not.toContain('sendComplianceNotification');
    expect(complianceCron).not.toContain('notifySectorManagersForOverdue');
    expect(router).toContain("await runStep('training-compliance-snapshots'");
  });
});
