import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '@/react-app/config/api';
import {
  DEPLOYMENT_VERSION,
  readServedFrontendVersionFromDocument,
} from '@/react-app/config/deployment';

interface VersionData {
  version: string;
  environment: string;
  builtAt: string | null;
}

export type RuntimeEnvironment = 'production' | 'staging' | 'development';

export function inferRuntimeEnvironmentFromHostname(hostname: string): RuntimeEnvironment {
  const host = hostname.trim().toLowerCase();
  if (host === 'airtrust.online' || host === 'www.airtrust.online') return 'production';
  if (
    host.includes('airtrust-staging') ||
    host.includes('staging.airtrust') ||
    host.includes('airtrust-api-staging')
  ) {
    return 'staging';
  }
  return 'development';
}

function inferRuntimeEnvironment(): RuntimeEnvironment {
  if (typeof window === 'undefined') return 'development';
  return inferRuntimeEnvironmentFromHostname(window.location.hostname);
}

export function normalizeRuntimeEnvironment(value: string | undefined): RuntimeEnvironment | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'production' || normalized === 'staging' || normalized === 'development') {
    return normalized;
  }
  return null;
}

export function VersionBadge() {
  // Busca versão da API (backend) - usada apenas para buildTime e confirmação de ambiente.
  const { data: apiData } = useQuery<{ success: boolean; data: VersionData }>({
    queryKey: ['version'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/version`);
      if (!response.ok) throw new Error('Failed to fetch version');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Versão REAL do UI servido:
  // 1) meta build-version (carimbado no index.html servido)
  // 2) fallback local (DEPLOYMENT_VERSION) — dev/local
  const metaVersion = readServedFrontendVersionFromDocument();

  const version =
    metaVersion ||
    (DEPLOYMENT_VERSION && DEPLOYMENT_VERSION !== '0.0.0-dev' ? DEPLOYMENT_VERSION : 'unknown');

  // Nunca rotular airtrust.online como development enquanto /api/version ainda carrega.
  // O hostname é a fonte de fallback fail-safe; a API só refina o valor quando coerente.
  const runtimeEnvironment = inferRuntimeEnvironment();
  const apiEnvironment = normalizeRuntimeEnvironment(apiData?.data?.environment);
  const environment =
    runtimeEnvironment === 'production'
      ? 'production'
      : runtimeEnvironment === 'staging'
        ? 'staging'
        : apiEnvironment || runtimeEnvironment;
  const builtAt = apiData?.data?.builtAt ?? null;

  // Cores por ambiente
  const bgColor =
    environment === 'production'
      ? 'bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/30'
      : environment === 'staging'
        ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/30'
        : 'bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30';

  const textColor =
    environment === 'production'
      ? 'text-green-700 dark:text-green-300'
      : environment === 'staging'
        ? 'text-yellow-700 dark:text-yellow-300'
        : 'text-blue-700 dark:text-blue-300';

  const formatBuildTime = (iso: string | null) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const buildTime = formatBuildTime(builtAt);

  return (
    <div
      className={`flex items-center justify-end gap-2 border-t px-4 py-2 text-[10px] font-medium ${bgColor} ${textColor}`}
      title={`Versão: ${version}${buildTime ? ` | Build: ${buildTime}` : ''} | Ambiente: ${environment}`}
    >
      {environment === 'development' && (
        <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-200">
          DEV
        </span>
      )}
      {environment === 'staging' && (
        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-orange-700 dark:bg-orange-500/15 dark:text-orange-200">
          STG
        </span>
      )}
      <span className="opacity-75">ver:</span>
      <span className="font-mono font-bold whitespace-nowrap" title={version}>
        {version}
      </span>
      {buildTime && (
        <>
          <span className="opacity-75">•</span>
          <span className="hidden sm:inline text-[9px]">{buildTime}</span>
        </>
      )}
    </div>
  );
}
