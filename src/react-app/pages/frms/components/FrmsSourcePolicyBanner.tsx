import { AlertTriangle, CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { useApi } from '@/react-app/hooks/useApi';

export type SigvoosOperationalHealthStatus =
  | 'HEALTHY'
  | 'WAITING_WINDOW'
  | 'PROCESSING'
  | 'DELAYED'
  | 'FAILURE'
  | 'CONFIG_INCOMPLETE'
  | 'DISABLED'
  | 'UNAVAILABLE';

export interface SigvoosOperationalConfig {
  username?: string | null;
  password_configured?: boolean;
  hasPassword?: boolean;
  auto_sync_enabled?: boolean;
  auto_sync_hora_utc?: number;
  last_sync_at?: string | null;
  last_sync_to?: string | null;
  last_sync_total_raw?: string | null;
  last_sync_total_importacoes?: string | null;
}

export interface SigvoosOperationalEvent {
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SigvoosOperationalHealth {
  status: SigvoosOperationalHealthStatus;
  autoSyncHourUtc: number;
  lastSyncAt: string | null;
  lastSyncTo: string | null;
  totalImports: number | null;
}

function clampAutoSyncHour(value: unknown): number {
  const parsed = Number(value ?? 19);
  if (!Number.isFinite(parsed)) return 19;
  return Math.max(0, Math.min(23, Math.trunc(parsed)));
}

function parseOperationalTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCount(value?: string | null): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveSigvoosOperationalHealth({
  config,
  latestEvent,
  now = new Date(),
  unavailable = false,
}: {
  config: SigvoosOperationalConfig | null;
  latestEvent?: SigvoosOperationalEvent | null;
  now?: Date;
  unavailable?: boolean;
}): SigvoosOperationalHealth {
  const autoSyncHourUtc = clampAutoSyncHour(config?.auto_sync_hora_utc);
  const base = {
    autoSyncHourUtc,
    lastSyncAt: config?.last_sync_at ?? null,
    lastSyncTo: config?.last_sync_to ?? null,
    totalImports: parseCount(config?.last_sync_total_importacoes),
  };

  if (unavailable || !config) {
    return { ...base, status: 'UNAVAILABLE' };
  }

  if (config.auto_sync_enabled === false) {
    return { ...base, status: 'DISABLED' };
  }

  const passwordConfigured = Boolean(config.password_configured ?? config.hasPassword);
  if (!String(config.username ?? '').trim() || !passwordConfigured) {
    return { ...base, status: 'CONFIG_INCOMPLETE' };
  }

  const lastSyncMs = parseOperationalTimestamp(config.last_sync_at);
  const eventMs = parseOperationalTimestamp(latestEvent?.updated_at ?? latestEvent?.created_at);
  const eventStatus = String(latestEvent?.status ?? '').toUpperCase();

  if (eventStatus === 'PROCESSANDO' && (!lastSyncMs || eventMs == null || eventMs >= lastSyncMs)) {
    return { ...base, status: 'PROCESSING' };
  }

  if (eventStatus === 'ERRO' && (!lastSyncMs || eventMs == null || eventMs >= lastSyncMs)) {
    return { ...base, status: 'FAILURE' };
  }

  const todayUtc = now.toISOString().slice(0, 10);
  if (config.last_sync_to && config.last_sync_to >= todayUtc) {
    return { ...base, status: 'HEALTHY' };
  }

  const scheduledWindowStartMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    autoSyncHourUtc,
    0,
    0,
  );
  const graceEndMs = scheduledWindowStartMs + 45 * 60 * 1000;

  if (now.getTime() <= graceEndMs) {
    return { ...base, status: 'WAITING_WINDOW' };
  }

  return { ...base, status: 'DELAYED' };
}

function formatDateTime(value?: string | null): string {
  const parsed = parseOperationalTimestamp(value);
  if (parsed == null) return 'sem registro';
  return new Date(parsed).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatIsoDate(value?: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'sem registro';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function buildBannerCopy(health: SigvoosOperationalHealth): {
  title: string;
  message: string;
  tone: 'green' | 'blue' | 'amber' | 'red' | 'slate';
} {
  const lastSync = formatDateTime(health.lastSyncAt);
  const lastDay = formatIsoDate(health.lastSyncTo);
  const importCount = health.totalImports;
  const importsLabel =
    importCount == null
      ? ''
      : ` · ${importCount} ${importCount === 1 ? 'importação processada' : 'importações processadas'}`;

  switch (health.status) {
    case 'HEALTHY':
      return {
        title: 'SIGVOOS conectado',
        message: `Fonte operacional canônica ativa · Última sincronização: ${lastSync} · Dados até ${lastDay}${importsLabel}.`,
        tone: 'green',
      };
    case 'WAITING_WINDOW':
      return {
        title: 'SIGVOOS conectado · aguardando janela',
        message: `Última sincronização: ${lastSync} · Dados até ${lastDay} · Próxima janela automática: ${String(
          health.autoSyncHourUtc,
        ).padStart(2, '0')}:00 UTC.`,
        tone: 'blue',
      };
    case 'PROCESSING':
      return {
        title: 'SIGVOOS sincronizando',
        message: `A sincronização automática está em andamento. Último período concluído: ${lastDay}.`,
        tone: 'blue',
      };
    case 'DELAYED':
      return {
        title: 'Sincronização SIGVOOS atrasada',
        message: `A janela automática de ${String(health.autoSyncHourUtc).padStart(
          2,
          '0',
        )}:00 UTC já passou. Última sincronização: ${lastSync} · Dados até ${lastDay}.`,
        tone: 'amber',
      };
    case 'FAILURE':
      return {
        title: 'Falha recente na integração SIGVOOS',
        message: `A execução mais recente falhou após a última sincronização concluída. Dados confirmados até ${lastDay}.`,
        tone: 'red',
      };
    case 'CONFIG_INCOMPLETE':
      return {
        title: 'Configuração SIGVOOS incompleta',
        message: 'A sincronização automática não pode ser considerada operacional até que as credenciais estejam configuradas.',
        tone: 'amber',
      };
    case 'DISABLED':
      return {
        title: 'Sincronização automática SIGVOOS desativada',
        message: `Última sincronização registrada: ${lastSync} · Dados até ${lastDay}.`,
        tone: 'amber',
      };
    default:
      return {
        title: 'Status SIGVOOS indisponível',
        message: 'Não foi possível consultar agora a saúde da integração. O FRMS não deve inferir descanso ou folga pela ausência de jornada.',
        tone: 'slate',
      };
  }
}

const toneClasses = {
  green: {
    wrapper: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40',
    icon: 'text-emerald-700 dark:text-emerald-300',
    text: 'text-emerald-950 dark:text-emerald-100',
    detail: 'text-emerald-900 dark:text-emerald-200',
  },
  blue: {
    wrapper: 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40',
    icon: 'text-sky-700 dark:text-sky-300',
    text: 'text-sky-950 dark:text-sky-100',
    detail: 'text-sky-900 dark:text-sky-200',
  },
  amber: {
    wrapper: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40',
    icon: 'text-amber-700 dark:text-amber-300',
    text: 'text-amber-950 dark:text-amber-100',
    detail: 'text-amber-900 dark:text-amber-200',
  },
  red: {
    wrapper: 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40',
    icon: 'text-rose-700 dark:text-rose-300',
    text: 'text-rose-950 dark:text-rose-100',
    detail: 'text-rose-900 dark:text-rose-200',
  },
  slate: {
    wrapper: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60',
    icon: 'text-slate-600 dark:text-slate-300',
    text: 'text-slate-900 dark:text-slate-100',
    detail: 'text-slate-700 dark:text-slate-300',
  },
} as const;

/**
 * Estado operacional do SIGVOOS dentro do FRMS.
 *
 * Usa apenas endpoints read-only já existentes. O backend continua sendo a
 * autoridade para cálculo/alertas e SIGVOOS continua sendo a fonte canônica.
 */
export default function FrmsSourcePolicyBanner({ compact = false }: { compact?: boolean }) {
  const {
    data: config,
    loading: configLoading,
    error: configError,
  } = useApi<SigvoosOperationalConfig>('/api/integracoes/sigvoos/config', {
    retry: 0,
    staleTime: 60_000,
  });
  const { data: events, loading: eventsLoading } = useApi<SigvoosOperationalEvent[]>(
    '/api/integracoes/sigvoos/historico?limit=1',
    { retry: 0, staleTime: 60_000 },
  );

  const loading = (configLoading || eventsLoading) && !config;
  const health = loading
    ? null
    : resolveSigvoosOperationalHealth({
        config,
        latestEvent: Array.isArray(events) ? events[0] : null,
        unavailable: !config && Boolean(configError),
      });

  const copy = health
    ? buildBannerCopy(health)
    : {
        title: 'Verificando integração SIGVOOS',
        message: 'Consultando a última sincronização da fonte operacional do FRMS.',
        tone: 'slate' as const,
      };
  const classes = toneClasses[copy.tone];

  const Icon = loading
    ? Loader2
    : health?.status === 'HEALTHY'
      ? CheckCircle2
      : health?.status === 'WAITING_WINDOW' || health?.status === 'PROCESSING'
        ? Clock3
        : health?.status === 'FAILURE'
          ? XCircle
          : AlertTriangle;

  return (
    <div
      className={`rounded-lg border ${classes.wrapper} ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
      role="status"
      aria-live="polite"
      data-sigvoos-status={health?.status ?? 'LOADING'}
    >
      <div className="flex gap-2">
        <Icon
          className={`shrink-0 ${classes.icon} ${compact ? 'mt-0.5 h-4 w-4' : 'mt-0.5 h-5 w-5'} ${
            loading ? 'animate-spin' : ''
          }`}
          aria-hidden
        />
        <div className={`${compact ? 'text-xs' : 'text-sm'} ${classes.text}`}>
          <p className="font-semibold">{copy.title}</p>
          <p className={`${compact ? 'mt-0.5' : 'mt-1'} ${classes.detail}`}>{copy.message}</p>
          {!compact && health?.status !== 'UNAVAILABLE' && (
            <p className={`mt-1 text-xs ${classes.detail}`}>
              Política FRMS: ausência de jornada SIGVOOS não significa automaticamente descanso ou folga.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
