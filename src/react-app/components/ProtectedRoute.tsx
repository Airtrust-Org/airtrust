import { Navigate, useLocation } from 'react-router-dom';
import { Ban } from 'lucide-react';
import { useAuth } from '@/react-app/hooks/useAuth';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { useOperationalAccess, type OperationalDomain } from '@/react-app/hooks/useOperationalAccess';
import { useLanguage } from '@/react-app/i18n/useLanguage';
import { canSeeDevelopmentModules } from '@/react-app/lib/development-module-nav';
import {
  canAccessModule,
  getModuleKeyForPath,
  requiresRestrictedDevelopmentModuleAccess,
} from '@/react-app/lib/module-access';

const DOMAIN_GATED_MODULES: Record<string, OperationalDomain> = {
  mro: 'MANUTENCAO',
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string[];
  requiredPermission?: string | string[];
}

const ADMIN_ONLY_PATH_PREFIXES = ['/admin'];
const MANAGEMENT_PATH_PREFIXES = ['/configuracoes', '/sistema', '/importacao'];

function normalizeRole(role?: string | null): string {
  const normalized = String(role ?? '')
    .trim()
    .toUpperCase();

  switch (normalized) {
    case 'ADMIN':
      return 'ADMINISTRADOR';
    case 'MANAGER':
      return 'GESTOR';
    case 'INSTRUCTOR':
      return 'INSTRUTOR';
    case 'STUDENT':
      return 'ALUNO';
    default:
      return normalized;
  }
}

function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveImplicitRequiredRole(pathname: string): string[] | undefined {
  const normalizedPathname = normalizePathname(pathname);

  if (ADMIN_ONLY_PATH_PREFIXES.some((prefix) => matchesPathPrefix(normalizedPathname, prefix))) {
    return ['ADMINISTRADOR'];
  }

  if (MANAGEMENT_PATH_PREFIXES.some((prefix) => matchesPathPrefix(normalizedPathname, prefix))) {
    return ['ADMINISTRADOR', 'GESTOR'];
  }

  return undefined;
}

function ProtectedRouteLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--at-bg-app)] text-[var(--at-text-primary)]">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[var(--at-accent)] border-r-transparent" />
        <p className="mt-3 text-sm text-[var(--at-text-secondary)]">{label}</p>
      </div>
    </div>
  );
}

function RouteStatusScreen({
  title,
  description,
  backHref,
  backLabel,
  tone = 'critical',
}: {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  tone?: 'attention' | 'critical';
}) {
  const iconClass = tone === 'attention' ? 'text-[var(--at-attention)]' : 'text-[var(--at-critical)]';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--at-bg-app)] p-4 text-[var(--at-text-primary)]">
      <div className="w-full max-w-md rounded-xl border border-[var(--at-border)] bg-[var(--at-bg-surface)] p-5 text-center shadow-sm">
        <Ban className={`mx-auto mb-4 h-14 w-14 ${iconClass}`} />
        <h2 className="mb-2 text-xl font-semibold text-[var(--at-text-primary)]">{title}</h2>
        <p className="mb-6 text-sm text-[var(--at-text-secondary)]">{description}</p>
        <a
          href={backHref}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--at-accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--at-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--at-focus)]"
        >
          {backLabel}
        </a>
      </div>
    </div>
  );
}

export default function ProtectedRoute({
  children,
  requiredRole,
  requiredPermission,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user, empresas = [], empresaAtualId = null } = useAuth();
  const { can } = usePermissions();
  const operationalAccess = useOperationalAccess();
  const location = useLocation();
  const { t } = useLanguage();

  if (isLoading) {
    return <ProtectedRouteLoading label={t('protected.loading')} />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const empresaAtual = empresas.find((empresa) => empresa.id === empresaAtualId) || null;
  const moduleKey = getModuleKeyForPath(location.pathname);
  const effectiveRequiredRole =
    requiredRole && requiredRole.length > 0
      ? requiredRole
      : resolveImplicitRequiredRole(location.pathname);

  if (moduleKey && !canAccessModule(moduleKey, empresaAtual?.modulos_ativos)) {
    return (
      <RouteStatusScreen
        title="Módulo indisponível"
        description="Este módulo não está ativo para a empresa selecionada."
        backHref="/"
        backLabel="Voltar ao início"
        tone="attention"
      />
    );
  }

  const gatedDomain = moduleKey ? DOMAIN_GATED_MODULES[moduleKey] : undefined;
  if (gatedDomain && operationalAccess.enabled && !operationalAccess.hasDomain(gatedDomain)) {
    return (
      <RouteStatusScreen
        title={t('protected.denied.title')}
        description={t('protected.denied.description')}
        backHref="/"
        backLabel={t('protected.denied.backHome')}
      />
    );
  }

  if (
    moduleKey &&
    requiresRestrictedDevelopmentModuleAccess(moduleKey) &&
    !canSeeDevelopmentModules(user)
  ) {
    return (
      <RouteStatusScreen
        title={t('protected.denied.title')}
        description={t('protected.denied.description')}
        backHref="/funcionarios"
        backLabel={t('protected.denied.backHome')}
      />
    );
  }

  if (requiredPermission && !can(requiredPermission)) {
    return (
      <RouteStatusScreen
        title={t('protected.denied.title')}
        description={t('protected.denied.description')}
        backHref="/"
        backLabel={t('protected.denied.backHome')}
      />
    );
  }

  if (effectiveRequiredRole && effectiveRequiredRole.length > 0 && user) {
    const currentRole = normalizeRole(user.role);
    const acceptedRoles = effectiveRequiredRole.map((role) => normalizeRole(role));

    if (!acceptedRoles.includes(currentRole)) {
      return (
        <RouteStatusScreen
          title={t('protected.denied.title')}
          description={t('protected.denied.description')}
          backHref="/funcionarios"
          backLabel={t('protected.denied.backHome')}
        />
      );
    }
  }

  return <>{children}</>;
}
