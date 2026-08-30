import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calculator,
  ClipboardCheck,
  FileText,
  GitBranch,
  ShieldCheck,
} from 'lucide-react';
import AppLayout from '../components/AppLayout';
import SgsoWorkspace from './SgsoWorkspace';

type WorkspaceTab = 'relatos' | 'dashboard' | 'auditorias' | 'ncs';

const SGSO_ACTIVE_TAB_KEY = 'airtrust.sgso.activeTab';

const workAreas: Array<{
  tab: WorkspaceTab;
  title: string;
  description: string;
  icon: typeof FileText;
}> = [
  {
    tab: 'relatos',
    title: 'Relatos de segurança',
    description: 'Registrar, localizar e acompanhar ocorrências, perigos e investigações.',
    icon: FileText,
  },
  {
    tab: 'dashboard',
    title: 'Indicadores e tendências',
    description: 'Analisar os indicadores de desempenho e acompanhar tendências de segurança.',
    icon: BarChart3,
  },
  {
    tab: 'auditorias',
    title: 'Auditorias',
    description: 'Planejar e acompanhar auditorias e seus resultados.',
    icon: ClipboardCheck,
  },
  {
    tab: 'ncs',
    title: 'Não conformidades',
    description: 'Acompanhar não conformidades, responsáveis e prazos de resolução.',
    icon: AlertTriangle,
  },
];

const directTools = [
  {
    title: 'RELPREV',
    description: 'Preencher e consultar relatos de prevenção.',
    href: '/sgso/relprev',
    icon: ShieldCheck,
  },
  {
    title: 'Bowtie',
    description: 'Estruturar ameaças, consequências e barreiras de controle.',
    href: '/sgso/bowtie',
    icon: GitBranch,
  },
  {
    title: 'FRAT',
    description: 'Avaliar o risco operacional antes da atividade.',
    href: '/sgso/frat',
    icon: Calculator,
  },
];

export default function Sgso() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  if (searchParams.get('view') === 'workspace') {
    return <SgsoWorkspace />;
  }

  const openWorkspace = (tab: WorkspaceTab) => {
    localStorage.setItem(SGSO_ACTIVE_TAB_KEY, tab);
    navigate('/sgso?view=workspace');
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="space-y-2">
          <p className="text-sm font-medium text-primary">Segurança operacional</p>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">SGSO</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
            Escolha o trabalho que precisa realizar. Os painéis e controles detalhados continuam
            disponíveis dentro de cada área.
          </p>
        </header>

        <section aria-labelledby="sgso-work-areas" className="space-y-3">
          <div>
            <h2 id="sgso-work-areas" className="text-lg font-semibold text-foreground">
              Áreas de trabalho
            </h2>
            <p className="text-sm text-muted-foreground">Acesse diretamente a atividade desejada.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {workAreas.map(({ tab, title, description, icon: Icon }) => (
              <button
                key={tab}
                type="button"
                onClick={() => openWorkspace(tab)}
                className="group flex min-h-28 items-start gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="rounded-lg bg-muted p-2.5 text-foreground" aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-foreground">{title}</span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="sgso-tools" className="space-y-3">
          <div>
            <h2 id="sgso-tools" className="text-lg font-semibold text-foreground">Ferramentas</h2>
            <p className="text-sm text-muted-foreground">Acessos diretos para avaliações específicas.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {directTools.map(({ title, description, href, icon: Icon }) => (
              <button
                key={href}
                type="button"
                onClick={() => navigate(href)}
                className="flex min-h-24 items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block font-semibold text-foreground">{title}</span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
