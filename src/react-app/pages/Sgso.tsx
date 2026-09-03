import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GitBranch,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import AppLayout from '../components/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL, getAccessToken } from '../config/api';
import SgsoWorkspace from './SgsoWorkspace';

type WorkspaceTab = 'relatos' | 'dashboard' | 'auditorias' | 'ncs';

interface SgsoResumo {
  ncs_abertas: number;
  backlog_triagem_24h?: number;
  frat_alto_sem_aprovacao?: number;
  barreiras_degradadas?: number;
}

const SGSO_ACTIVE_TAB_KEY = 'airtrust.sgso.activeTab';

const workAreas: Array<{
  tab: WorkspaceTab;
  title: string;
  icon: typeof FileText;
}> = [
  { tab: 'relatos', title: 'Relatos', icon: FileText },
  { tab: 'dashboard', title: 'Indicadores', icon: BarChart3 },
  { tab: 'auditorias', title: 'Auditorias', icon: ClipboardCheck },
  { tab: 'ncs', title: 'Não conformidades', icon: AlertTriangle },
];

const directTools = [
  { title: 'RELPREV', href: '/sgso/relprev', icon: ShieldCheck },
  { title: 'Bowtie', href: '/sgso/bowtie', icon: GitBranch },
  { title: 'FRAT', href: '/sgso/frat', icon: Calculator },
];

function SgsoOperationalEntry() {
  const navigate = useNavigate();
  const { token, refreshToken, logout } = useAuth();
  const [resumo, setResumo] = useState<SgsoResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const openWorkspace = useCallback(
    (tab: WorkspaceTab) => {
      localStorage.setItem(SGSO_ACTIVE_TAB_KEY, tab);
      navigate('/sgso?view=workspace');
    },
    [navigate],
  );

  const loadResumo = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      let accessToken = token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      let response = await fetch(`${API_BASE_URL}/sgso/kpi/spi`, { headers });
      if (response.status === 401) {
        try {
          await refreshToken();
          accessToken = getAccessToken() || token;
          if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
          response = await fetch(`${API_BASE_URL}/sgso/kpi/spi`, { headers });
        } catch {
          logout();
          throw new Error('SESSION_EXPIRED');
        }
      }

      if (!response.ok) throw new Error('SGSO_SUMMARY_HTTP_ERROR');

      const payload = await response.json();
      if (!payload?.success || !payload?.data?.resumo) {
        throw new Error('SGSO_SUMMARY_INVALID_RESPONSE');
      }

      setResumo(payload.data.resumo as SgsoResumo);
    } catch {
      setResumo(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [logout, refreshToken, token]);

  useEffect(() => {
    void loadResumo();
  }, [loadResumo]);

  const pendingItems = resumo
    ? [
        {
          id: 'frat',
          value: resumo.frat_alto_sem_aprovacao ?? 0,
          label: 'FRAT de alto risco sem aprovação',
          detail: 'Avaliações de risco elevado aguardando decisão operacional.',
          action: 'Revisar FRAT',
          icon: ShieldAlert,
          onClick: () => navigate('/sgso/frat'),
        },
        {
          id: 'barreiras',
          value: resumo.barreiras_degradadas ?? 0,
          label: 'Barreiras degradadas',
          detail: 'Controles de risco com degradação registrada no Bowtie.',
          action: 'Revisar barreiras',
          icon: GitBranch,
          onClick: () => navigate('/sgso/bowtie'),
        },
        {
          id: 'triagem',
          value: resumo.backlog_triagem_24h ?? 0,
          label: 'Relatos aguardando triagem há mais de 24 h',
          detail: 'Relatos que ultrapassaram a janela operacional de triagem.',
          action: 'Fazer triagem',
          icon: FileText,
          onClick: () => openWorkspace('relatos'),
        },
        {
          id: 'ncs',
          value: resumo.ncs_abertas ?? 0,
          label: 'Não conformidades abertas',
          detail: 'NCs que permanecem em acompanhamento ou resolução.',
          action: 'Revisar NCs',
          icon: AlertTriangle,
          onClick: () => openWorkspace('ncs'),
        },
      ].filter((item) => item.value > 0)
    : [];

  return (
    <AppLayout>
      <div className="w-full space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="space-y-2">
          <p className="text-sm font-medium text-primary">Segurança operacional</p>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">SGSO</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
            Comece pelo que exige atenção. Áreas, ferramentas e análises detalhadas permanecem
            disponíveis abaixo.
          </p>
        </header>

        <section aria-labelledby="sgso-attention" className="space-y-3">
          <div>
            <h2 id="sgso-attention" className="text-lg font-semibold text-foreground">
              Pendências que exigem atenção
            </h2>
            <p className="text-sm text-muted-foreground">
              Resumo operacional priorizado a partir dos dados atuais do SGSO.
            </p>
          </div>

          {loading && (
            <div
              role="status"
              className="rounded-lg border border-border bg-card px-4 py-5 text-sm text-muted-foreground"
            >
              Carregando resumo operacional…
            </div>
          )}

          {!loading && loadError && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-foreground">Resumo operacional indisponível</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Não foi possível carregar as pendências agora. As áreas do SGSO continuam acessíveis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadResumo()}
                className="inline-flex items-center gap-2 self-start text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:self-auto"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !loadError && pendingItems.length === 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground">Nenhuma pendência crítica no resumo operacional</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Não há alertas ativos de triagem, FRAT de alto risco, barreiras degradadas ou NCs abertas.
                </p>
              </div>
            </div>
          )}

          {!loading && !loadError && pendingItems.length > 0 && (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {pendingItems.map(({ id, value, label, detail, action, icon: Icon, onClick }) => (
                <button
                  key={id}
                  type="button"
                  onClick={onClick}
                  className="group flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:items-center"
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary sm:mt-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
                      <span className="font-medium text-foreground">{label}</span>
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">{detail}</span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary sm:inline-flex">
                    {action}
                    <ArrowRight
                      className="h-4 w-4 transition group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="sgso-areas" className="border-t border-border pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="sgso-areas" className="text-sm font-semibold text-foreground">
                Áreas do SGSO
              </h2>
              <nav aria-label="Áreas do SGSO" className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {workAreas.map(({ tab, title, icon: Icon }) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => openWorkspace(tab)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {title}
                  </button>
                ))}
              </nav>
            </div>

            <button
              type="button"
              onClick={() => openWorkspace('relatos')}
              className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:self-center"
            >
              Abrir workspace completo
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>

        <section aria-labelledby="sgso-tools" className="border-t border-border pt-5">
          <h2 id="sgso-tools" className="text-sm font-semibold text-foreground">
            Ferramentas
          </h2>
          <nav aria-label="Ferramentas do SGSO" className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {directTools.map(({ title, href, icon: Icon }) => (
              <button
                key={href}
                type="button"
                onClick={() => navigate(href)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {title}
              </button>
            ))}
          </nav>
        </section>
      </div>
    </AppLayout>
  );
}

export default function Sgso() {
  const [searchParams] = useSearchParams();

  if (searchParams.get('view') === 'workspace') {
    return <SgsoWorkspace />;
  }

  return <SgsoOperationalEntry />;
}
