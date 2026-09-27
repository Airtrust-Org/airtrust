import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MODULE_ALERT_SETTINGS,
  getModuleAlertSettings,
  normalizeModuleAlertSettings,
  renderAlertTemplate,
  saveModuleAlertSettings,
} from '../../services/module-alert-settings';

describe('module alert settings', () => {
  it('preserva defaults e normaliza limites configuráveis', () => {
    const result = normalizeModuleAlertSettings({
      lms_completion: { thresholds: [30, 7, 7, -1, 500] },
      simulator_upcoming: { days_before: 21 },
      licenses: {
        thresholds: [60, 30, 5],
        expired_frequency: 'EVERY_N_DAYS',
        expired_interval_days: 4,
      },
    });

    expect(result.lms_completion.thresholds).toEqual([30, 7]);
    expect(result.simulator_upcoming.days_before).toBe(21);
    expect(result.licenses.thresholds).toEqual([60, 30, 5]);
    expect(result.licenses.expired_frequency).toBe('EVERY_N_DAYS');
    expect(result.licenses.expired_interval_days).toBe(4);
    expect(result.sgso_barriers.stale_hours).toBe(
      DEFAULT_MODULE_ALERT_SETTINGS.sgso_barriers.stale_hours,
    );
  });

  it('renderiza variáveis de templates sem executar conteúdo', () => {
    expect(
      renderAlertTemplate('Olá {{nome}}, faltam {{dias}} dias.', { nome: 'Teste', dias: 7 }),
    ).toBe('Olá Teste, faltam 7 dias.');
  });

  it('salva apenas moduleAlertSettings preservando outras system_settings', async () => {
    let savedJson = '';
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () =>
            query.includes('SELECT cores_tema')
              ? {
                  cores_tema: JSON.stringify({
                    system_settings: { existing: { keep: true } },
                    palette: 'x',
                  }),
                }
              : null,
          run: async () => {
            if (query.includes('INSERT INTO empresas_config')) savedJson = String(args[1]);
            return { meta: { changes: 1 } };
          },
        }),
      })),
    } as unknown as D1Database;

    await saveModuleAlertSettings(db, 6, { licenses: { thresholds: [90, 45] } });
    const saved = JSON.parse(savedJson) as Record<string, any>;

    expect(saved.palette).toBe('x');
    expect(saved.system_settings.existing.keep).toBe(true);
    expect(saved.system_settings.moduleAlertSettings.licenses.thresholds).toEqual([90, 45]);
  });

  it('lê a política tenant-scoped de empresas_config', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: () => ({
          first: async () => ({
            cores_tema: JSON.stringify({
              system_settings: { moduleAlertSettings: { simulator_upcoming: { days_before: 9 } } },
            }),
          }),
        }),
      })),
    } as unknown as D1Database;

    const result = await getModuleAlertSettings(db, 6);
    expect(result.simulator_upcoming.days_before).toBe(9);
  });
});
