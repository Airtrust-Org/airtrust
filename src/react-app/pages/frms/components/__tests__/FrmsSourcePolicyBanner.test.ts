import { describe, expect, it } from 'vitest';
import { resolveSigvoosOperationalHealth } from '../FrmsSourcePolicyBanner';

const configured = {
  username: 'configured-user',
  password_configured: true,
  auto_sync_enabled: true,
  auto_sync_hora_utc: 21,
  last_sync_at: '2026-08-26 21:01:08',
  last_sync_to: '2026-08-26',
  last_sync_total_importacoes: '2',
};

describe('resolveSigvoosOperationalHealth', () => {
  it('classifica como saudável quando a janela do dia foi concluída', () => {
    const health = resolveSigvoosOperationalHealth({
      config: configured,
      latestEvent: { status: 'SUCESSO', updated_at: '2026-08-26 21:01:08' },
      now: new Date('2026-08-26T22:00:00Z'),
    });

    expect(health).toMatchObject({
      status: 'HEALTHY',
      lastSyncTo: '2026-08-26',
      totalImports: 2,
    });
  });

  it('não marca atraso antes da próxima janela UTC', () => {
    const health = resolveSigvoosOperationalHealth({
      config: configured,
      latestEvent: { status: 'SUCESSO', updated_at: '2026-08-26 21:01:08' },
      now: new Date('2026-08-27T02:00:00Z'),
    });

    expect(health.status).toBe('WAITING_WINDOW');
  });

  it('marca atraso depois da janela e do período de tolerância', () => {
    const health = resolveSigvoosOperationalHealth({
      config: configured,
      latestEvent: { status: 'SUCESSO', updated_at: '2026-08-26 21:01:08' },
      now: new Date('2026-08-27T22:00:00Z'),
    });

    expect(health.status).toBe('DELAYED');
  });

  it('prioriza falha posterior à última sincronização concluída', () => {
    const health = resolveSigvoosOperationalHealth({
      config: configured,
      latestEvent: { status: 'ERRO', updated_at: '2026-08-26 22:10:00' },
      now: new Date('2026-08-26T22:15:00Z'),
    });

    expect(health.status).toBe('FAILURE');
  });

  it('não mantém erro antigo quando houve sucesso posterior', () => {
    const health = resolveSigvoosOperationalHealth({
      config: configured,
      latestEvent: { status: 'ERRO', updated_at: '2026-08-25 21:10:00' },
      now: new Date('2026-08-26T22:00:00Z'),
    });

    expect(health.status).toBe('HEALTHY');
  });

  it('identifica configuração incompleta', () => {
    const health = resolveSigvoosOperationalHealth({
      config: {
        ...configured,
        username: '',
        password_configured: false,
      },
      now: new Date('2026-08-26T22:00:00Z'),
    });

    expect(health.status).toBe('CONFIG_INCOMPLETE');
  });

  it('identifica sincronização automática desativada', () => {
    const health = resolveSigvoosOperationalHealth({
      config: { ...configured, auto_sync_enabled: false },
      now: new Date('2026-08-26T22:00:00Z'),
    });

    expect(health.status).toBe('DISABLED');
  });

  it('usa estado neutro quando o status não pode ser consultado', () => {
    const health = resolveSigvoosOperationalHealth({
      config: null,
      unavailable: true,
      now: new Date('2026-08-26T22:00:00Z'),
    });

    expect(health.status).toBe('UNAVAILABLE');
  });
});
