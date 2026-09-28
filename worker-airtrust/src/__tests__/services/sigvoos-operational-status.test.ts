import { describe, expect, it } from 'vitest';
import {
  resolveSigvoosOperationalStatus,
  type SanitizedSigvoosConfig,
} from '../../services/sigvoos-frms';

function config(overrides: Partial<SanitizedSigvoosConfig> = {}): SanitizedSigvoosConfig {
  return {
    base_url: 'https://api.sigvoos.test',
    username: 'tenant-user',
    system: 'sigtrip',
    last_sync_at: '2026-09-28T15:00:00.000Z',
    last_sync_from: '2026-09-27',
    last_sync_to: '2026-09-28',
    last_sync_total_raw: '10',
    last_sync_total_importacoes: '2',
    auto_sync_enabled: true,
    auto_sync_hora_utc: 19,
    password_configured: true,
    hasPassword: true,
    notificar_falha_email: null,
    ...overrides,
  };
}

const NOW = Date.parse('2026-09-28T16:00:00.000Z');

describe('resolveSigvoosOperationalStatus', () => {
  it('não apresenta tenant sem credenciais como conectado', () => {
    expect(
      resolveSigvoosOperationalStatus(
        config({ username: null, password_configured: false, hasPassword: false }),
        null,
        0,
        NOW,
      ),
    ).toMatchObject({ status: 'not_configured', configured: false, usable_for_frms: false });
  });

  it('classifica configuração ativa sem primeira sincronização como aguardando janela', () => {
    expect(
      resolveSigvoosOperationalStatus(config({ last_sync_at: null }), null, 0, NOW),
    ).toMatchObject({ status: 'awaiting_window', configured: true, usable_for_frms: false });
  });

  it('falha fechado quando a execução mais recente terminou em erro', () => {
    expect(
      resolveSigvoosOperationalStatus(
        config(),
        { status: 'ERRO', erro_ultima: 'provider timeout' },
        0,
        NOW,
      ),
    ).toMatchObject({ status: 'failed', usable_for_frms: false });
  });

  it('classifica pendências como fonte parcial e não apta para cálculo conclusivo', () => {
    expect(resolveSigvoosOperationalStatus(config(), { status: 'SUCESSO' }, 3, NOW)).toMatchObject({
      status: 'partial',
      usable_for_frms: false,
      pending_count: 3,
    });
  });

  it('classifica sincronização antiga como desatualizada', () => {
    expect(
      resolveSigvoosOperationalStatus(
        config({ last_sync_at: '2026-09-25T12:00:00.000Z' }),
        { status: 'SUCESSO' },
        0,
        NOW,
      ),
    ).toMatchObject({ status: 'stale', usable_for_frms: false });
  });

  it('só considera saudável quando configurado, recente e sem erro ou pendência', () => {
    expect(resolveSigvoosOperationalStatus(config(), { status: 'SUCESSO' }, 0, NOW)).toMatchObject({
      status: 'healthy',
      usable_for_frms: true,
    });
  });
});
