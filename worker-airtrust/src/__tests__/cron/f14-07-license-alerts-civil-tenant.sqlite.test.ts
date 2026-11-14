import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

const send = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../cron/notificacoes', () => ({
  enviarEmailAlert: send,
  normalizeEmailRecipients: (values: string[]) => [...new Set(values)],
}));
vi.mock('../../services/setores-gestores', () => ({
  getSetorGestoresBySetor: async () => [],
}));
vi.mock('../../services/module-alert-settings', () => ({
  getModuleAlertSettings: async () => ({
    licenses: {
      enabled: true, thresholds: [7], expired_frequency: 'DAILY',
      expired_interval_days: 1, subject_template: '{{licenca}}',
      message_template: '{{funcionario}}', expired_subject_template: '{{licenca}}',
      expired_message_template: '{{funcionario}}',
    },
  }),
  renderAlertTemplate: (template: string) => template,
}));

import { getLicenseAlertTodaySaoPaulo, processLicenseAlerts } from '../../cron/license-alerts';

function fixture() {
  const db = new SqliteD1Database();
  db.database.exec(`
    ALTER TABLE empresas ADD COLUMN ativo INTEGER DEFAULT 1;
    ALTER TABLE empresas ADD COLUMN deleted_at TEXT;
    ALTER TABLE funcionarios ADD COLUMN email TEXT;
    ALTER TABLE funcionarios ADD COLUMN ativo INTEGER DEFAULT 1;
    ALTER TABLE funcionarios ADD COLUMN status TEXT DEFAULT 'ATIVO';
    CREATE TABLE licencas (
      id INTEGER PRIMARY KEY, funcionario_id INTEGER, empresa_id INTEGER,
      tipo TEXT, numero TEXT, data_vencimento TEXT, deleted_at TEXT
    );
    CREATE TABLE notificacoes_log (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, config_id INTEGER,
      qualificacao_historico_id INTEGER, funcionario_cpf TEXT, tipo TEXT,
      destinatario TEXT, assunto TEXT, corpo TEXT, status TEXT,
      erro_mensagem TEXT, enviado_em TEXT
    );
    INSERT INTO funcionarios (id,empresa_id,nome,email)
      VALUES (6100,1,'Tenant 1','a@example.test'),(7100,2,'Tenant 2','b@example.test');
    INSERT INTO licencas VALUES
      (1,6100,1,'CMA','A','2026-11-14',NULL),
      (2,7100,2,'CMA','B','2026-11-14',NULL),
      (3,6100,2,'CMA','C','2026-11-14',NULL);
  `);
  return db;
}

afterEach(() => { vi.useRealTimers(); send.mockClear(); });

describe('F14-07 — cron licenças civil SP e isolamento entre empresas', () => {
  it('troca o dia operacional apenas à meia-noite de São Paulo', () => {
    expect(getLicenseAlertTodaySaoPaulo(new Date('2026-11-15T02:30:00Z'))).toBe('2026-11-14');
    expect(getLicenseAlertTodaySaoPaulo(new Date('2026-11-15T03:30:00Z'))).toBe('2026-11-15');
  });

  it('seleciona cada licença apenas no próprio tenant e classifica vencimento pela data local', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T02:30:00Z'));
    const db = fixture();
    try {
      const result = await processLicenseAlerts({ DB: db.asD1() } as Env);
      expect(result).toEqual({ avaliadas: 2, enviadas: 2, erros: 0 });
      expect(send).toHaveBeenCalledTimes(2);
      const logs = db.database.prepare('SELECT empresa_id, assunto FROM notificacoes_log ORDER BY empresa_id').all();
      expect(logs).toEqual([
        expect.objectContaining({ empresa_id: 1, assunto: '[LICENCA:1:7]' }),
        expect.objectContaining({ empresa_id: 2, assunto: '[LICENCA:2:7]' }),
      ]);
    } finally { db.close(); }
  });

  it('não reenvia licença vencida DAILY no mesmo dia civil, mesmo após 00h UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T02:30:00Z'));
    const db = fixture();
    try {
      db.database.exec(`
        UPDATE licencas SET data_vencimento='2026-11-13' WHERE id=1;
        INSERT INTO notificacoes_log (empresa_id, assunto, status, enviado_em)
          VALUES (1,'[LICENCA:1:VENCIDA]','enviada','2026-11-15 00:30:00');
      `);
      const result = await processLicenseAlerts({ DB: db.asD1() } as Env);
      expect(result.enviadas).toBe(1);
      expect(send).toHaveBeenCalledTimes(1);
    } finally { db.close(); }
  });
});
