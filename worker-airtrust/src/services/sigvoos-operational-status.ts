import type { SanitizedSigvoosConfig } from './sigvoos-frms';

export type SigvoosOperationalStatus =
  | 'not_configured'
  | 'inactive'
  | 'healthy'
  | 'stale'
  | 'partial'
  | 'failed'
  | 'awaiting_window';

export interface SigvoosOperationalStatusResult {
  status: SigvoosOperationalStatus;
  configured: boolean;
  usable_for_frms: boolean;
  reason: string;
  last_sync_at: string | null;
  pending_count: number;
}

function parseSigvoosTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveSigvoosOperationalStatus(
  config: SanitizedSigvoosConfig,
  latestEvent?: Record<string, unknown> | null,
  pendingCount = 0,
  nowMs = Date.now(),
): SigvoosOperationalStatusResult {
  const configured = Boolean(config.username?.trim()) && config.password_configured;
  const lastSyncAt = config.last_sync_at ?? null;
  const eventStatus = String(latestEvent?.status ?? '').toUpperCase();

  if (!configured) {
    return {
      status: 'not_configured',
      configured: false,
      usable_for_frms: false,
      reason: 'Credenciais SIGVOOS não estão completas para este tenant.',
      last_sync_at: lastSyncAt,
      pending_count: pendingCount,
    };
  }

  if (!config.auto_sync_enabled) {
    return {
      status: 'inactive',
      configured: true,
      usable_for_frms: false,
      reason: 'Sincronização automática SIGVOOS está desativada para este tenant.',
      last_sync_at: lastSyncAt,
      pending_count: pendingCount,
    };
  }

  if (eventStatus === 'ERRO') {
    return {
      status: 'failed',
      configured: true,
      usable_for_frms: false,
      reason: String(latestEvent?.erro_ultima || 'A execução SIGVOOS mais recente terminou com erro.'),
      last_sync_at: lastSyncAt,
      pending_count: pendingCount,
    };
  }

  if (eventStatus === 'PROCESSANDO') {
    return {
      status: 'partial',
      configured: true,
      usable_for_frms: false,
      reason: 'Existe uma execução SIGVOOS ainda em processamento.',
      last_sync_at: lastSyncAt,
      pending_count: pendingCount,
    };
  }

  let latestSummary: Record<string, unknown> | null = null;
  if (typeof latestEvent?.resposta_json === 'string') {
    try {
      latestSummary = JSON.parse(latestEvent.resposta_json) as Record<string, unknown>;
    } catch {
      latestSummary = null;
    }
  }
  const totalErros = Number(latestSummary?.totalErros ?? latestSummary?.total_erros ?? 0);
  if (pendingCount > 0 || (Number.isFinite(totalErros) && totalErros > 0)) {
    return {
      status: 'partial',
      configured: true,
      usable_for_frms: false,
      reason:
        pendingCount > 0
          ? `Existem ${pendingCount} jornada(s) SIGVOOS pendente(s) de vínculo ou revisão.`
          : `A execução SIGVOOS mais recente registrou ${totalErros} erro(s).`,
      last_sync_at: lastSyncAt,
      pending_count: pendingCount,
    };
  }

  const lastSyncMs = parseSigvoosTimestamp(lastSyncAt);
  if (lastSyncMs == null) {
    return {
      status: 'awaiting_window',
      configured: true,
      usable_for_frms: false,
      reason: 'Integração configurada e ativa, mas ainda não há sincronização concluída registrada.',
      last_sync_at: lastSyncAt,
      pending_count: pendingCount,
    };
  }

  const ageHours = Math.max(0, (nowMs - lastSyncMs) / 3_600_000);
  if (ageHours > 48) {
    return {
      status: 'stale',
      configured: true,
      usable_for_frms: false,
      reason: `Última sincronização SIGVOOS ocorreu há aproximadamente ${Math.floor(ageHours)} horas.`,
      last_sync_at: lastSyncAt,
      pending_count: pendingCount,
    };
  }

  return {
    status: 'healthy',
    configured: true,
    usable_for_frms: true,
    reason: 'SIGVOOS configurado, sincronização recente e sem pendências conhecidas.',
    last_sync_at: lastSyncAt,
    pending_count: pendingCount,
  };
}

