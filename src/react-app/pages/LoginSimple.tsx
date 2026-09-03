import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Lock, Mail } from 'lucide-react';
import { clearActiveSessionRole, useAuth } from '../hooks/useAuth';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useSystemSettings } from '../hooks/useSystemSettings';
import { useLanguage } from '../i18n/useLanguage';
import { logger } from '../utils/logger';
import {
  API_BASE_URL,
  fetchWithAuth,
  getPersistLogin,
  setPersistLogin,
  setTokens,
} from '../config/api';
import { getDevLoginCredentials } from '../utils/devCredentials';

const IS_DEV = import.meta.env.DEV === true || import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';
const IS_STAGING =
  typeof window !== 'undefined' && window.location.hostname === 'main.airtrust.pages.dev';

const DEV_LOGIN_CREDENTIALS = IS_DEV ? getDevLoginCredentials() : { email: '', password: '' };

const DEFAULT_LOGIN_EMAIL = DEV_LOGIN_CREDENTIALS.email;
const DEFAULT_LOGIN_PASSWORD = DEV_LOGIN_CREDENTIALS.password;

const QUICK_LOGIN_GESTOR_EMAIL =
  import.meta.env.VITE_QUICK_LOGIN_GESTOR_EMAIL || 'manager@airtrust.com';
const QUICK_LOGIN_GESTOR_PASSWORD =
  import.meta.env.VITE_QUICK_LOGIN_GESTOR_PASSWORD || DEFAULT_LOGIN_PASSWORD;

const QUICK_LOGIN_INSTRUTOR_EMAIL =
  import.meta.env.VITE_QUICK_LOGIN_INSTRUTOR_EMAIL || 'test.instrutor@airtrust.com';
const QUICK_LOGIN_INSTRUTOR_PASSWORD =
  import.meta.env.VITE_QUICK_LOGIN_INSTRUTOR_PASSWORD || DEFAULT_LOGIN_PASSWORD;

const QUICK_LOGIN_ALUNO_EMAIL =
  import.meta.env.VITE_QUICK_LOGIN_ALUNO_EMAIL || 'test.aluno@airtrust.com';
const QUICK_LOGIN_ALUNO_PASSWORD =
  import.meta.env.VITE_QUICK_LOGIN_ALUNO_PASSWORD || DEFAULT_LOGIN_PASSWORD;

// Perfis de acesso rápido (demo/testes)
const DEV_PROFILES = [
  {
    label: 'Admin',
    email: DEFAULT_LOGIN_EMAIL,
    password: DEFAULT_LOGIN_PASSWORD,
    color: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
  },
  {
    label: 'Gestor',
    email: QUICK_LOGIN_GESTOR_EMAIL,
    password: QUICK_LOGIN_GESTOR_PASSWORD,
    color: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  },
  {
    label: 'Instrutor',
    email: QUICK_LOGIN_INSTRUTOR_EMAIL,
    password: QUICK_LOGIN_INSTRUTOR_PASSWORD,
    color: 'bg-sky-100 text-sky-700 hover:bg-sky-200',
  },
  {
    label: 'Aluno',
    email: QUICK_LOGIN_ALUNO_EMAIL,
    password: QUICK_LOGIN_ALUNO_PASSWORD,
    color: 'bg-green-100 text-green-700 hover:bg-green-200',
  },
];

type SessionRole = 'ADMINISTRADOR' | 'GESTOR' | 'INSTRUTOR' | 'ALUNO' | 'USUARIO';

type SessionProfilesResponse = {
  success: boolean;
  data?: {
    activeRole: SessionRole;
    roles: SessionRole[];
    requiresSelection: boolean;
  };
  error?: string;
};

type SelectProfileResponse = {
  success: boolean;
  data?: {
    accessToken: string;
    activeRole: SessionRole;
  };
  error?: string;
};

const PROFILE_LABELS: Record<SessionRole, string> = {
  ADMINISTRADOR: 'Administrador',
  GESTOR: 'Gestor',
  INSTRUTOR: 'Instrutor',
  ALUNO: 'Aluno',
  USUARIO: 'Usuário',
};

const PROFILE_DESCRIPTIONS: Record<SessionRole, string> = {
  ADMINISTRADOR: 'Administração completa da empresa e do sistema.',
  GESTOR: 'Gestão da área, equipe, treinamentos e controles autorizados.',
  INSTRUTOR: 'Atuação como instrutor, com acesso às ferramentas de instrução.',
  ALUNO: 'Acesso aos treinamentos e atividades atribuídas a você.',
  USUARIO: 'Acesso operacional padrão do seu usuário.',
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [lembrar, setLembrar] = useState(getPersistLogin());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [profileOptions, setProfileOptions] = useState<SessionRole[]>([]);

  const { login } = useAuth();
  const { logoSrc } = useSystemSettings();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const loadSessionProfiles = async (): Promise<SessionRole[]> => {
    const response = await fetchWithAuth(`${API_BASE_URL}/me/operational-access/session-profiles`, {
      method: 'GET',
    });
    const payload = (await response.json().catch(() => ({}))) as SessionProfilesResponse;

    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.error || 'Não foi possível identificar os perfis disponíveis.');
    }

    return payload.data.roles || [];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    setPersistLogin(lembrar);
    clearActiveSessionRole();

    try {
      await login({ email, password });
      const roles = await loadSessionProfiles();

      if (roles.length > 1) {
        setProfileOptions(roles);
        return;
      }

      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.login.error'));
      logger.error('Erro no login:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileSelect = async (role: SessionRole) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/me/operational-access/session-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const payload = (await response.json().catch(() => ({}))) as SelectProfileResponse;

      if (!response.ok || !payload.success || !payload.data?.accessToken) {
        throw new Error(payload.error || 'Não foi possível ativar o perfil selecionado.');
      }

      // Troca somente o access token. O refresh token da autenticação original
      // permanece preservado e o backend revalida o perfil ativo em cada request.
      setTokens(payload.data.accessToken);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ativar o perfil selecionado.');
      logger.error('Erro ao selecionar perfil de sessão:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img
            src={logoSrc}
            alt="AirTrust"
            className="mx-auto h-28 w-auto max-w-full object-contain"
          />
        </div>

        {IS_STAGING && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-center">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
              Ambiente de homologação (staging)
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Usuário de teste:{' '}
              <span className="font-mono">admin.staging.test@example.invalid</span>
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-5 shadow-sm shadow-slate-200/70">
          <div className="mb-7">
            <h1 className="text-xl font-bold text-slate-900">
              {profileOptions.length > 1 ? 'Como você quer entrar?' : t('auth.login.title')}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {profileOptions.length > 1
                ? 'Seu usuário possui mais de um perfil. Escolha o perfil ativo para esta sessão.'
                : IS_STAGING
                  ? 'Ambiente de homologação'
                  : 'Acesse sua conta AirTrust'}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {profileOptions.length > 1 ? (
            <div className="space-y-3">
              {profileOptions.map((role) => (
                <button
                  key={role}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void handleProfileSelect(role)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="block text-sm font-semibold text-slate-900">
                    Entrar como {PROFILE_LABELS[role]}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {PROFILE_DESCRIPTIONS[role]}
                  </span>
                </button>
              ))}
              {isLoading && (
                <p className="pt-1 text-center text-xs text-slate-500">Ativando perfil...</p>
              )}
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label={t('auth.login.email')}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  icon={<Mail className="w-4 h-4" />}
                  required
                  disabled={isLoading}
                />

                <Input
                  label={t('auth.login.password')}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  icon={<Lock className="w-4 h-4" />}
                  required
                  disabled={isLoading}
                />

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={lembrar}
                    onChange={(e) => setLembrar(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-primary accent-primary"
                  />
                  <span className="text-sm text-slate-600">Lembrar de mim</span>
                </label>

                <div className="pt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full h-10"
                    disabled={isLoading}
                  >
                    {isLoading ? t('auth.login.submitting') : t('auth.login.submit')}
                  </Button>
                </div>
              </form>

              <div className="mt-5 text-center">
                <a
                  href="/forgot-password"
                  className="text-sm text-primary hover:text-primary-dark transition-colors"
                >
                  {t('auth.login.forgotPassword')}
                </a>
              </div>

              {IS_DEV && (
                <div className="mt-5 pt-5 border-t border-slate-100">
                  <p className="text-xs text-slate-400 text-center mb-2.5">
                    ⚡ Acesso rápido (modo dev.)
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {DEV_PROFILES.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setEmail(p.email);
                          setPassword(p.password);
                        }}
                        className={`text-xs font-medium px-2 py-1.5 rounded-lg transition-colors ${p.color}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © 2026 AirTrust. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
