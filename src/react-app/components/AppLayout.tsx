import React, { ReactNode, useState, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Settings,
  Bell,
  LogOut,
  MoonStar,
  SunMedium,
  LayoutDashboard,
  Users,
  BadgeCheck,
  Gauge,
  BookOpen,
  CalendarDays,
  Activity,
  ShieldCheck,
  ShieldAlert,
  BarChart2,
  FileText,
  RefreshCcw,
  Wrench,
  Plane,
  ChevronDown,
  GraduationCap,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { VersionBadge } from './VersionBadge';
import { NotificacoesSistema } from './NotificacoesSistema';
import { useSystemSettings } from '../hooks/useSystemSettings';
import { toast } from 'sonner';
import { API_BASE_URL } from '../config/api';
import { useLanguage } from '../i18n/useLanguage';
import { useTheme } from '../theme/ThemeProvider';
import { hardRefreshApp } from '@/react-app/lib/hardRefresh';
import { canAccessModule } from '@/react-app/lib/module-access';
import { apiClient } from '@/react-app/services/apiClient';
import {
  canSeeAdministrativeDashboard,
  canSeeDevelopmentModules,
} from '@/react-app/lib/development-module-nav';
interface AppLayoutProps {
  children: ReactNode;
}

const NAV_ACTIVE = 'whitespace-nowrap bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200';
const NAV_INACTIVE =
  'whitespace-nowrap text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100';
const PREVIEW_BADGE_CLASS =
  'ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';

type SigvoosRefreshPreviewResponse = {
  mode: 'preview';
  enabled: boolean;
  tenantScoped: boolean;
  writesEnabled: boolean;
  realApiCalled: boolean;
  status: 'READY' | 'FEATURE_DISABLED';
  counts: {
    stagingTotal: number;
    stagingPending: number;
    stagingProcessed: number;
    stagingConflict: number;
    openConflicts: number;
    importedFlights: number;
    importedStages: number;
    importedCrew: number;
  };
};

type SigvoosRealPreviewResponse = {
  mode: 'real-preview';
  enabled: boolean;
  tenantScoped: boolean;
  writesEnabled: boolean;
  realApiCalled: boolean;
  status: 'READY' | 'FEATURE_DISABLED';
  summary?: {
    recordsReceived: number;
    candidateFlights: number;
    potentialConflictsEstimated: number;
  };
};

type SigvoosPreviewResponse = SigvoosRefreshPreviewResponse | SigvoosRealPreviewResponse;

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

function isSigvoosRefreshPreviewEnabled(): boolean {
  const importMetaValue = (import.meta as unknown as {
    env?: { VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED?: string };
  }).env?.VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED;
  const processValue =
    typeof process !== 'undefined'
      ? (process.env?.VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED as string | undefined)
      : undefined;
  return importMetaValue === 'true' || processValue === 'true';
}

function isSigvoosRealPreviewEnabled(): boolean {
  const importMetaValue = (import.meta as unknown as {
    env?: { VITE_SIGVOOS_REAL_API_PREVIEW_ENABLED?: string };
  }).env?.VITE_SIGVOOS_REAL_API_PREVIEW_ENABLED;
  const processValue =
    typeof process !== 'undefined'
      ? (process.env?.VITE_SIGVOOS_REAL_API_PREVIEW_ENABLED as string | undefined)
      : undefined;
  return importMetaValue === 'true' || processValue === 'true';
}

function sigvoosPreviewMessage(data: SigvoosPreviewResponse): string {
  if (!data.enabled) return 'Prévia SIGVOOS desativada por flag.';
  if (data.mode === 'real-preview') {
    const summary = data.summary;
    if (!summary) return 'Prévia SIGVOOS real concluída sem gravação.';
    if (summary.potentialConflictsEstimated > 0) {
      return `Prévia SIGVOOS real: ${summary.potentialConflictsEstimated} possível(is) conflito(s), sem gravação.`;
    }
    return `Prévia SIGVOOS real: ${summary.recordsReceived} registro(s), ${summary.candidateFlights} voo(s) candidato(s), sem gravação.`;
  }
  if (data.counts.openConflicts > 0 || data.counts.stagingConflict > 0) {
    return `Prévia SIGVOOS: ${data.counts.openConflicts || data.counts.stagingConflict} conflito(s) encontrado(s).`;
  }
  if (data.counts.stagingPending > 0) {
    return `Prévia SIGVOOS: ${data.counts.stagingPending} payload(s) pendente(s) no tenant atual.`;
  }
  return 'Prévia SIGVOOS: sem novos dados materializados no tenant atual.';
}

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, empresas, empresaAtualId, selectEmpresa } = useAuth();
  const { can, isAdmin, isGestor, isInstrutor, isAluno } = usePermissions();
  const { logoSrc, settings } = useSystemSettings();
  const { t } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hardRefreshLoading, setHardRefreshLoading] = useState(false);
  const [treinamentosOpen, setTreinamentosOpen] = useState(false);
  const [treinamentosMobileOpen, setTreinamentosMobileOpen] = useState(false);
  const treinamentosTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [empresaLogoError, setEmpresaLogoError] = useState<Record<number, boolean>>({});
  const empresaAtual = empresas.find((empresa) => empresa.id === empresaAtualId) || null;
  const modulosAtivos = empresaAtual?.modulos_ativos;
  const canSeeAdminDashboard = canSeeAdministrativeDashboard(user);
  const canSeeRestrictedDevelopmentNav = canSeeDevelopmentModules(user);

  // Flags de acesso a módulos
  const showDashboard = canAccessModule('dashboard', modulosAtivos) && canSeeAdminDashboard;
  const showFuncionarios =
    canAccessModule('funcionarios', modulosAtivos) && can('funcionarios.view');
  const showQualificacoes =
    canAccessModule('qualificacoes', modulosAtivos) && can('qualificacoes.view');
  const showSimuladores =
    canAccessModule('simuladores', modulosAtivos) && can('simuladores.view');
  const showLms = canAccessModule('lms', modulosAtivos);
  const showEscalas =
    canAccessModule('escalas', modulosAtivos) && (can('escalas.view') || can('self.escala'));
  const showFrms = canAccessModule('frms', modulosAtivos) && can('frms.view');
  const showSgso = canAccessModule('sgso', modulosAtivos) && can('sgso.view');
  const showMro =
    canAccessModule('mro', modulosAtivos) &&
    !isAluno &&
    !isInstrutor &&
    canSeeRestrictedDevelopmentNav;
  const showControleVoos =
    canAccessModule('controle_voos', modulosAtivos) &&
    !isAluno &&
    !isInstrutor &&
    canSeeRestrictedDevelopmentNav;
  const showTreinamentosPlanejados =
    canAccessModule('treinamentos_planejados', modulosAtivos) && !isAluno && !isInstrutor;

  // Grupo "Treinamentos" — visível se pelo menos um sub-módulo estiver acessível
  const showTreinamentosGroup =
    !isAluno &&
    !isInstrutor &&
    (showQualificacoes || showSimuladores || showLms || showTreinamentosPlanejados);

  const isActivePath = (path: string, exact = false) => {
    if (exact) return location.pathname === path;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const isInTreinamentosPath =
    isActivePath('/treinamentos') ||
    isActivePath('/qualificacoes') ||
    isActivePath('/lms') ||
    isActivePath('/simuladores');

  const handleTreinamentosMouseEnter = () => {
    if (treinamentosTimerRef.current) clearTimeout(treinamentosTimerRef.current);
    setTreinamentosOpen(true);
  };
  const handleTreinamentosMouseLeave = () => {
    treinamentosTimerRef.current = setTimeout(() => setTreinamentosOpen(false), 120);
  };

  const getUserInitials = () => {
    if (!user?.nome) return 'US';
    const names = user.nome.trim().split(' ');
    if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
  };

  const hasEmpresaLogo = (empresaId: number, logoUrl?: string | null): boolean => {
    return Boolean(getEmpresaLogoUrl(logoUrl) && !empresaLogoError[empresaId]);
  };

  const markEmpresaLogoError = (empresaId: number) => {
    setEmpresaLogoError((prev) => ({ ...prev, [empresaId]: true }));
  };

  const getEmpresaLogoUrl = (logoUrl?: string | null): string | null => {
    if (!logoUrl) return null;
    // Data URLs e absolute URLs passam direto
    if (
      logoUrl.startsWith('data:') ||
      logoUrl.startsWith('http://') ||
      logoUrl.startsWith('https://')
    )
      return logoUrl;
    // Relative API URLs precisam de origin prefix
    if (logoUrl.startsWith('/api/')) {
      const apiOrigin = API_BASE_URL.replace(/\/api$/, '');
      return `${apiOrigin}${logoUrl}`;
    }
    return logoUrl;
  };

  const getEmpresaInitials = (nome?: string): string => {
    if (!nome) return 'EM';
    const parts = nome.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return 'EM';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const handleSelectEmpresa = async (empresaId: number) => {
    if (!empresaId || empresaId === empresaAtualId) return;

    try {
      await selectEmpresa(empresaId);
      toast.success(t('layout.actions.switchCompanySuccess'));
      navigate(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('layout.actions.switchCompanyError'));
    }
  };

  // Expõe altura do header como CSS var para módulos que precisam de layout full-height (ex: FRMS)
  const headerHeightVar = settings.compactHeader
    ? ({ '--header-height': '44px' } as React.CSSProperties)
    : ({ '--header-height': '48px' } as React.CSSProperties);

  const themeActionLabel = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';
  const handleHardRefresh = async () => {
    if (hardRefreshLoading) return;
    setHardRefreshLoading(true);
    try {
      const shouldRunSigvoosPreview =
        isSigvoosRefreshPreviewEnabled() &&
        Boolean(empresaAtualId) &&
        (isAdmin || isGestor) &&
        canAccessModule('controle_voos', modulosAtivos);

      if (shouldRunSigvoosPreview) {
        try {
          const endpoint = isSigvoosRealPreviewEnabled()
            ? '/controle-voos/sigvoos/real-preview'
            : '/controle-voos/sigvoos/sync-preview';
          const response = await apiClient.post<ApiEnvelope<SigvoosPreviewResponse>>(
            endpoint,
            {},
            { retry: 0, skipRequestControl: true },
          );
          const preview = response.data?.data;
          if (preview) {
            toast.info(sigvoosPreviewMessage(preview));
          }
        } catch {
          toast.warning('Falha na prévia SIGVOOS; o app será atualizado sem sincronização.');
        }
      }

      await hardRefreshApp();
    } finally {
      setHardRefreshLoading(false);
    }
  };

  return (
    <div
      className="airtrust-global-standard relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden bg-slate-50 font-display text-slate-800 transition-colors dark:bg-slate-950 dark:text-slate-100"
      style={headerHeightVar}
    >
      {/* Header */}
      <header className="sticky top-0 z-header w-full border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-md transition-colors dark:border-slate-800 dark:bg-slate-950/95">
        <div
          className={`mx-auto flex w-full items-center justify-between px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 ${
            settings.compactHeader ? 'h-11 sm:h-12' : 'h-12 sm:h-13'
          }`}
        >
          <div className="flex items-center gap-4 sm:gap-8">
            {/* Logo */}
            <Link
              to="/"
              aria-label={t('layout.aria.logoHome')}
              title={t('layout.aria.logoHome')}
              className="group flex items-center rounded-lg px-2 py-1 transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <img
                src={logoSrc}
                alt="AirTrust"
                className="h-7 w-[160px] object-contain object-left sm:h-8 sm:w-[172px] md:h-9 md:w-[188px]"
              />
            </Link>

            {/* Navigation — hidden for restricted roles (ALUNO/INSTRUTOR) */}
            <nav className="hidden items-center gap-1 md:flex" data-no-auto-i18n="true">
              {!isAluno && !isInstrutor && showDashboard && (
                <Link
                  to="/"
                  className={`flex h-9 items-center rounded-md px-3 text-sm font-medium ${isActivePath('/', true) ? NAV_ACTIVE : NAV_INACTIVE}`}
                >
                  {t('layout.nav.dashboard')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showFuncionarios && (
                <Link
                  to="/funcionarios"
                  className={`flex h-9 items-center rounded-md px-3 text-sm font-medium ${isActivePath('/funcionarios') ? NAV_ACTIVE : NAV_INACTIVE}`}
                >
                  {t('layout.nav.employees')}
                </Link>
              )}

              {/* ── Treinamentos dropdown ── */}
              {showTreinamentosGroup && (
                <div
                  className="relative"
                  onMouseEnter={handleTreinamentosMouseEnter}
                  onMouseLeave={handleTreinamentosMouseLeave}
                >
                  <button
                    type="button"
                    className={`flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors ${isInTreinamentosPath ? NAV_ACTIVE : NAV_INACTIVE}`}
                  >
                    Treinamentos
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-150 ${treinamentosOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {treinamentosOpen && (
                    <div
                      className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                      onMouseEnter={handleTreinamentosMouseEnter}
                      onMouseLeave={handleTreinamentosMouseLeave}
                    >
                      {showQualificacoes && (
                        <Link
                          to="/qualificacoes"
                          onClick={() => setTreinamentosOpen(false)}
                          className={`flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${isActivePath('/qualificacoes') || isActivePath('/treinamentos/planejados') || isActivePath('/treinamentos/solicitacoes') ? 'font-semibold text-primary dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                          <BadgeCheck className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                          Qualificações
                        </Link>
                      )}
                      {showLms && (
                        <Link
                          to="/lms"
                          onClick={() => setTreinamentosOpen(false)}
                          className={`flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${isActivePath('/lms') ? 'font-semibold text-primary dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                          <BookOpen className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                          LMS / Cursos EAD
                        </Link>
                      )}
                      {showSimuladores && (
                        <Link
                          to="/simuladores"
                          onClick={() => setTreinamentosOpen(false)}
                          className={`flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${isActivePath('/simuladores') ? 'font-semibold text-primary dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                          <Plane className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                          Treinamento de Voo
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* LMS standalone — visível somente para alunos/instrutores (não entram no grupo Treinamentos) */}
              {(isAluno || isInstrutor) && showLms && (
                <Link
                  to="/lms/cursos"
                  className={`flex h-9 items-center rounded-md px-3 text-sm font-medium ${isActivePath('/lms') ? NAV_ACTIVE : NAV_INACTIVE}`}
                >
                  LMS
                </Link>
              )}

              {!isAluno && !isInstrutor && showEscalas && (
                <Link
                  to="/escalas"
                  className={`flex h-9 items-center rounded-md px-3 text-sm font-medium ${isActivePath('/escalas') ? NAV_ACTIVE : NAV_INACTIVE}`}
                >
                  {t('layout.nav.escalas')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showFrms && (
                <Link
                  to="/frms"
                  className={`flex h-9 items-center rounded-md px-3 text-sm font-medium ${isActivePath('/frms') ? NAV_ACTIVE : NAV_INACTIVE}`}
                >
                  {t('layout.nav.frms')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showSgso && (
                <Link
                  to="/sgso"
                  className={`flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium ${isActivePath('/sgso') ? NAV_ACTIVE : NAV_INACTIVE}`}
                >
                  SGSO
                  <span className={PREVIEW_BADGE_CLASS}>PRÉVIA</span>
                </Link>
              )}
              {!isAluno && !isInstrutor && showMro && (
                <Link
                  to="/mro"
                  className={`flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium ${isActivePath('/mro') ? NAV_ACTIVE : NAV_INACTIVE}`}
                >
                  Manutenção
                  <span className={PREVIEW_BADGE_CLASS}>PRÉVIA</span>
                </Link>
              )}
              {!isAluno && !isInstrutor && showControleVoos && (
                <Link
                  to="/controle-voos"
                  className={`flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium ${isActivePath('/controle-voos') ? NAV_ACTIVE : NAV_INACTIVE}`}
                >
                  Controle de Voos
                </Link>
              )}
            </nav>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            {empresaAtual && (
              <div
                className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900/70 md:flex"
                title={empresaAtual.nome}
              >
                {hasEmpresaLogo(empresaAtual.id, empresaAtual.logo_url) ? (
                  <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950">
                    <img
                      src={getEmpresaLogoUrl(empresaAtual.logo_url) || ''}
                      alt={empresaAtual.nome}
                      className="h-full w-full object-contain"
                      onError={() => markEmpresaLogoError(empresaAtual.id)}
                    />
                  </div>
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <span data-no-auto-i18n="true">{getEmpresaInitials(empresaAtual.nome)}</span>
                  </div>
                )}
                <span className="max-w-[110px] truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                  {empresaAtual.nome}
                </span>
              </div>
            )}

            {isAdmin && empresas.length > 1 && (
              <select
                value={empresaAtualId ?? ''}
                onChange={(e) => handleSelectEmpresa(Number(e.target.value))}
                className="hidden h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 md:block"
                title={t('layout.mobile.activeCompany')}
              >
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nome}
                  </option>
                ))}
              </select>
            )}
            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleHardRefresh()}
                disabled={hardRefreshLoading}
                aria-label={hardRefreshLoading ? 'Atualizando app' : 'Atualizar app'}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                title={hardRefreshLoading ? 'Atualizando app' : 'Atualizar app'}
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${hardRefreshLoading ? 'animate-spin' : ''}`} />
              </button>
              {isAdmin && <NotificacoesSistema />}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={themeActionLabel}
                aria-pressed={isDark}
                title={themeActionLabel}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm dark:bg-blue-500/15 dark:text-blue-200">
                  {isDark ? <MoonStar className="h-3.5 w-3.5" /> : <SunMedium className="h-3.5 w-3.5" />}
                </span>
              </button>
              {(isAdmin || isGestor) && (
                <button
                  className="flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  title={t('layout.actions.settings')}
                  onClick={() => navigate('/configuracoes')}
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* User avatar with role badge */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex flex-col items-end">
                <span
                  className="text-xs font-medium leading-none text-slate-700 dark:text-slate-100"
                  data-no-auto-i18n="true"
                >
                  {user?.nome?.split(' ')[0] || t('layout.user.default')}
                </span>
                {user?.role && (
                  <span className="mt-0.5 text-[10px] capitalize leading-none text-slate-400 dark:text-slate-500">
                    {user.role.toLowerCase()}
                  </span>
                )}
              </div>
              <div
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                title={`${user?.nome || t('layout.user.default')} — Clique para sair`}
                onClick={logout}
                data-no-auto-i18n="true"
              >
                {getUserInitials()}
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
              aria-label={t('layout.aria.menu')}
            >
              <svg
                className="h-5 w-5 text-slate-700 dark:text-slate-100"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-sidebar bg-black/30 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Menu Content */}
          <div className="fixed left-0 right-0 bottom-0 top-[48px] z-sidebar overflow-y-auto bg-white shadow-2xl dark:bg-slate-950 md:hidden sm:top-[56px]">
            {/* User Profile Section */}
            <div className="border-b border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 p-4 dark:border-slate-800 dark:from-slate-950 dark:to-slate-900">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-base font-bold text-slate-600 shadow-md dark:bg-slate-800 dark:text-slate-100">
                  <span data-no-auto-i18n="true">{getUserInitials()}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {user?.nome || t('layout.user.default')}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {t('layout.mobile.systemName')}
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="flex flex-col gap-0.5 p-3">
              {!isAluno && !isInstrutor && showDashboard && (
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${isActivePath('/', true) ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  <LayoutDashboard className="h-4 w-4 shrink-0" />
                  {t('layout.nav.dashboard')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showFuncionarios && (
                <Link
                  to="/funcionarios"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${isActivePath('/funcionarios') ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  <Users className="h-4 w-4 shrink-0" />
                  {t('layout.nav.employees')}
                </Link>
              )}
              {/* ── Treinamentos (mobile) ── */}
              {showTreinamentosGroup && (
                <>
                  <button
                    type="button"
                    onClick={() => setTreinamentosMobileOpen((v) => !v)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 font-medium transition-all ${isInTreinamentosPath ? 'bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                  >
                    <div className="flex items-center gap-3">
                      <GraduationCap className="h-4 w-4 shrink-0" />
                      Treinamentos
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform duration-150 ${treinamentosMobileOpen || isInTreinamentosPath ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {(treinamentosMobileOpen || isInTreinamentosPath) && (
                    <div className="ml-7 flex flex-col gap-0.5">
                      {showQualificacoes && (
                        <Link
                          to="/qualificacoes"
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${isActivePath('/qualificacoes') || isActivePath('/treinamentos/planejados') || isActivePath('/treinamentos/solicitacoes') ? 'font-semibold text-primary dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'}`}
                        >
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0" /> Qualificações
                        </Link>
                      )}
                      {showLms && (
                        <Link
                          to="/lms"
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${isActivePath('/lms') ? 'font-semibold text-primary dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'}`}
                        >
                          <BookOpen className="h-3.5 w-3.5 shrink-0" /> LMS / Cursos EAD
                        </Link>
                      )}
                      {showSimuladores && (
                        <Link
                          to="/simuladores"
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${isActivePath('/simuladores') ? 'font-semibold text-primary dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'}`}
                        >
                          <Plane className="h-3.5 w-3.5 shrink-0" /> Treinamento de Voo
                        </Link>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* LMS standalone — alunos/instrutores não entram no grupo Treinamentos */}
              {(isAluno || isInstrutor) && showLms && (
                <>
                  <Link
                    to="/lms/cursos"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${isActivePath('/lms') ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                  >
                    <BookOpen className="h-4 w-4 shrink-0" />
                    LMS
                  </Link>
                </>
              )}
              {!isAluno && !isInstrutor && showEscalas && (
                <Link
                  to="/escalas"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${isActivePath('/escalas') ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  {t('layout.nav.escalas')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showFrms && (
                <>
                  <Link
                    to="/frms"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${isActivePath('/frms') ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                  >
                    <Activity className="h-4 w-4 shrink-0" />
                    {t('layout.nav.frms')}
                  </Link>
                  {isActivePath('/frms') && (
                    <div className="ml-7 flex flex-col gap-0.5">
                      <Link to="/frms" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800">
                        <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Operação
                      </Link>
                      <Link to="/frms/alertas" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800">
                        <Bell className="h-3.5 w-3.5 shrink-0" /> Casos
                      </Link>
                      <Link to="/frms/configuracoes" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800">
                        <Settings className="h-3.5 w-3.5 shrink-0" /> Administração
                      </Link>
                    </div>
                  )}
                </>
              )}
              {!isAluno && !isInstrutor && showSgso && (
                <Link
                  to="/sgso"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${isActivePath('/sgso') ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  SGSO
                  <span className={PREVIEW_BADGE_CLASS}>PRÉVIA</span>
                </Link>
              )}
              {!isAluno && !isInstrutor && showMro && (
                <Link
                  to="/mro"
                  className={`flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium ${isActivePath('/mro') ? NAV_ACTIVE : NAV_INACTIVE}`}
                >
                  Manutenção
                  <span className={PREVIEW_BADGE_CLASS}>PRÉVIA</span>
                </Link>
              )}
              {!isAluno && !isInstrutor && showControleVoos && (
                <Link
                  to="/controle-voos"
                  className={`flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium ${isActivePath('/controle-voos') ? NAV_ACTIVE : NAV_INACTIVE}`}
                >
                  Controle de Voos
                </Link>
              )}
            </nav>

            {/* Mobile Actions */}
            <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => void handleHardRefresh()}
                disabled={hardRefreshLoading}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCcw className={`h-5 w-5 ${hardRefreshLoading ? 'animate-spin' : ''}`} />
                <span className="flex flex-col">
                  <span>{hardRefreshLoading ? 'Atualizando...' : 'Atualizar app'}</span>
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    Use se a tela parecer desatualizada.
                  </span>
                </span>
              </button>
              {isAdmin && empresas.length > 1 && (
                <div className="px-4 py-2">
                  {empresaAtual && (
                    <div className="mb-2 flex items-center gap-2">
                      {hasEmpresaLogo(empresaAtual.id, empresaAtual.logo_url) ? (
                        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950">
                          <img
                            src={getEmpresaLogoUrl(empresaAtual.logo_url) || ''}
                            alt={empresaAtual.nome}
                            className="h-full w-full object-contain"
                            onError={() => markEmpresaLogoError(empresaAtual.id)}
                          />
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {getEmpresaInitials(empresaAtual.nome)}
                        </div>
                      )}
                      <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                        {empresaAtual.nome}
                      </p>
                    </div>
                  )}
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t('layout.mobile.activeCompany')}
                  </label>
                  <select
                    value={empresaAtualId ?? ''}
                    onChange={(e) => handleSelectEmpresa(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {empresas.map((empresa) => (
                      <option key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={themeActionLabel}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {isDark ? <MoonStar className="h-5 w-5" /> : <SunMedium className="h-5 w-5" />}
                {isDark ? 'Modo escuro ativo' : 'Modo claro ativo'}
              </button>
              <button
                onClick={() => {
                  navigate('/configuracoes');
                  setMobileMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Settings className="w-5 h-5" />
                {t('layout.actions.settings')}
              </button>
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <LogOut className="w-5 h-5" />
                {t('layout.mobile.logout')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main content */}
      <main className="mx-auto w-full flex-1 px-4 py-3 sm:px-6 sm:py-4 md:px-8 lg:px-10 lg:py-5 xl:px-12">
        {children}
      </main>

      {/* Version Badge */}
      <footer className="mt-auto">
        <VersionBadge />
      </footer>
    </div>
  );
}
