import { Navigate, useLocation } from 'react-router-dom';
import { Ban } from 'lucide-react';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useLanguage } from '@/react-app/i18n/useLanguage';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string[]; // Opcional: ['ADMIN', 'GESTOR']
}

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

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
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

  // Verificar role se especificado
  if (requiredRole && requiredRole.length > 0 && user) {
    const currentRole = normalizeRole(user.role);
    const acceptedRoles = requiredRole.map((role) => normalizeRole(role));

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
