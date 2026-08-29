import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import {
  Award,
  Briefcase,
  ChevronRight,
  FileText,
  List,
  Plane,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type ConfigItem = {
  title: string;
  description: string;
  route: string;
  icon: LucideIcon;
};

const CONFIG_ITEMS: ConfigItem[] = [
  {
    title: 'Simuladores',
    description: 'Cadastre e gerencie os simuladores de voo disponíveis.',
    route: '/simuladores/cadastros/simuladores',
    icon: Plane,
  },
  {
    title: 'Manobras',
    description: 'Configure as manobras e exercícios usados nas avaliações.',
    route: '/simuladores/cadastros/manobras',
    icon: List,
  },
  {
    title: 'Categorias',
    description: 'Organize as categorias de manobras e avaliação.',
    route: '/simuladores/cadastros/categorias',
    icon: Briefcase,
  },
  {
    title: 'Tipos de sessão',
    description: 'Gerencie os tipos de sessão, como LPC, OPC e LOFT.',
    route: '/simuladores/cadastros/tipos-sessao',
    icon: FileText,
  },
  {
    title: 'Modelos de sessão',
    description: 'Configure os modelos usados na preparação das sessões.',
    route: '/simuladores/cadastros/modelos-sessao',
    icon: Award,
  },
];

export default function ConfiguracoesCadastros() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <PageHeader
        className="mb-5"
        title="Configurações de Simuladores"
        subtitle="Cadastros que definem como as sessões de treinamento são planejadas e avaliadas."
      />

      <section className="overflow-hidden rounded-lg border border-[var(--at-border)] bg-[var(--at-bg-surface)]">
        <div className="border-b border-[var(--at-border)] px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--at-text-primary)]">Cadastros operacionais</h2>
          <p className="mt-1 text-sm text-[var(--at-text-secondary)]">
            Selecione o cadastro que deseja administrar. Os números operacionais ficam nos relatórios,
            não nesta área de configuração.
          </p>
        </div>

        <div className="divide-y divide-[var(--at-border)]">
          {CONFIG_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => navigate(item.route)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--at-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset sm:px-5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--at-bg-muted)] text-[var(--at-text-secondary)]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--at-text-primary)]">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-[var(--at-text-secondary)]">
                    {item.description}
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-[var(--at-text-subtle)]"
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </section>
    </AppLayout>
  );
}
