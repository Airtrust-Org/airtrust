import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/module-alert-settings', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/module-alert-settings')>();
  return {
    ...original,
    getModuleAlertSettings: vi.fn(async () => original.DEFAULT_MODULE_ALERT_SETTINGS),
  };
});

vi.mock('../../lib/frms/checkin-obligation', () => ({
  loadDailyCheckinObligations: vi.fn(async () => new Map([
    [1, { status: 'PENDENTE', exigivel: true, base: 'ALOCACAO_OPERACIONAL', rotulo: '', divergencias: [] }],
    [2, { status: 'INDETERMINADO', exigivel: false, base: 'QUINZENA_BASE_SEM_ESCALA', rotulo: '', divergencias: [] }],
    [3, { status: 'DISPENSADO', exigivel: false, base: 'AUSENCIA_PROGRAMADA', rotulo: '', divergencias: [] }],
  ])),
}));

vi.mock('../../cron/frms-daily-check', () => ({
  getSaoPauloOperationalDate: () => '2026-11-15',
}));

import { frmsFadigaReminder } from '../../cron/frms-fadiga-reminder';
import { loadDailyCheckinObligations } from '../../lib/frms/checkin-obligation';

afterEach(() => vi.clearAllMocks());

function makeEnv() {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          calls.push({ sql, args });
          return {
            first: async () => null,
            run: async () => ({ success: true }),
            all: async () => ({
              results: sql.includes('FROM funcionarios f')
                ? [{ id: 1, nome: 'Escalado' }, { id: 2, nome: 'Base presumida' }, { id: 3, nome: 'Ferias' }]
                : [],
            }),
          };
        },
        all: async () => ({ results: sql.includes('frms_fadiga_config_empresa') ? [{ empresa_id: 7 }] : [] }),
      };
    },
  };
  return { env: { DB: db } as never, calls };
}

describe('frmsFadigaReminder — só cobra quem tem obrigação canônica', () => {
  it('não inclui quinzena presumida nem férias e usa a data operacional de São Paulo', async () => {
    const { env, calls } = makeEnv();
    const result = await frmsFadigaReminder(env);

    expect(result.notificacoes).toBe(1);
    expect(loadDailyCheckinObligations).toHaveBeenCalledWith(expect.anything(), 7, '2026-11-15');
    const insert = calls.find((call) => call.sql.includes('INSERT INTO notificacoes_sistema'));
    const payload = JSON.parse(String(insert?.args[2]));
    expect(payload.pendentes).toEqual([{ id: 1, nome: 'Escalado' }]);
    expect(String(insert?.args[1])).toContain('1 tripulante(s)');
    const dedupe = calls.find((call) => call.sql.includes("tipo = 'FRMS_CHECKIN_REMINDER'"));
    expect(dedupe?.args).toEqual(['2026-11-15', 7]);
  });
});
