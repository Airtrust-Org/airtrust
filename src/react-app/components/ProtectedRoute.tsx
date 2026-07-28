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

// Modules whose visibility is additionally narrowed by operational domain
// once a tenant's operational_domain_rbac_enabled flag is on — see
// docs/rbac/gestor-operational-autonomy.md. MRO is a frontend prototype
// (mocked data, no backend persistence — see src/react-app/pages/mro/) that
// is nonetheless classified MANUTENCAO for this gate: a gestor without the
// MANUTENCAO domain should not see it, even though nothing there writes
// real operational data. This map stays intentionally tiny — extend it only
// for modules with a real, decided domain classification, not speculatively.
const DOMAIN_GATED_MODULES: Record<string, OperationalDomain> = {
  mro: 'MANUTENCAO',
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string[]; // Opcional: ['ADMIN', 'GESTOR']
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
    return (
      <div
        className="flex items-center justify-center min-h-screen bg-gray-100"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f3f4f6',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '4px solid #0052cc',
              borderRightColor: 'transparent',
              animation: 'spin 0.75s linear infinite',
              display: 'inline-block',
            }}
          />
          <p
            className="mt-4 text-sm text-slate-600"
            style={{ marginTop: 12, fontSize: 14, color: '#475569' }}
          >
            {t('protected.loading')}
          </p>
        </div>
      </div>
    );
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
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm max-w-md w-full text-center">
          <Ban className="w-14 h-14 text-amber-500 mb-4 mx-auto" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Modulo indisponivel</h2>
          <p className="text-sm text-slate-600 mb-6">
            Este modulo nao esta ativo para a empresa selecionada.
          </p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Voltar ao dashboard
          </a>
        </div>
      </div>
    );
  }

  const gatedDomain = moduleKey ? DOMAIN_GATED_MODULES[moduleKey] : undefined;
  if (gatedDomain && operationalAccess.enabled && !operationalAccess.hasDomain(gatedDomain)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm max-w-md w-full text-center">
          <Ban className="w-14 h-14 text-red-500 mb-4 mx-auto" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            {t('protected.denied.title')}
          </h2>
          <p className="text-sm text-slate-600 mb-6">{t('protected.denied.description')}</p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            {t('protected.denied.backHome')}
          </a>
        </div>
      </div>
    );
  }

  if (
    moduleKey &&
    requiresRestrictedDevelopmentModuleAccess(moduleKey) &&
    !canSeeDevelopmentModules(user)
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm max-w-md w-full text-center">
          <Ban className="w-14 h-14 text-red-500 mb-4 mx-auto" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            {t('protected.denied.title')}
          </h2>
          <p className="text-sm text-slate-600 mb-6">{t('protected.denied.description')}</p>
          <a
            href="/funcionarios"
            className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            {t('protected.denied.backHome')}
          </a>
        </div>
      </div>
    );
  }

  if (requiredPermission && !can(requiredPermission)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm max-w-md w-full text-center">
          <Ban className="w-14 h-14 text-red-500 mb-4 mx-auto" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            {t('protected.denied.title')}
          </h2>
          <p className="text-sm text-slate-600 mb-6">{t('protected.denied.description')}</p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            {t('protected.denied.backHome')}
          </a>
        </div>
      </div>
    );
  }

  // Verificar role se especificado
  if (effectiveRequiredRole && effectiveRequiredRole.length > 0 && user) {
    const currentRole = normalizeRole(user.role);
    const acceptedRoles = effectiveRequiredRole.map((role) => normalizeRole(role));

    if (!acceptedRoles.includes(currentRole)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm max-w-md w-full text-center">
            <Ban className="w-14 h-14 text-red-500 mb-4 mx-auto" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              {t('protected.denied.title')}
            </h2>
            <p className="text-sm text-slate-600 mb-6">{t('protected.denied.description')}</p>
            <a
              href="/funcionarios"
              className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              {t('protected.denied.backHome')}
            </a>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
