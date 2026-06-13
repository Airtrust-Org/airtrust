import { Link } from 'react-router-dom';
import { BadgeCheck, BookOpen, Plane, ArrowRight } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { useAuth } from '@/react-app/hooks/useAuth';
import { canAccessModule } from '@/react-app/lib/module-access';

interface ModuleCard {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  moduleKey: string;
  requiresNotRestricted?: boolean;
}

const MODULES: ModuleCard[] = [
  {
    id: 'qualificacoes',
    label: 'Qualificações',
    description:
      'Visão geral de conformidade, histórico de qualificações, alertas de vencimento e planejamento.',
    path: '/qualificacoes',
    icon: <BadgeCheck className="h-6 w-6" />,
    moduleKey: 'qualificacoes',
    requiresNotRestricted: true,
  },
  {
    id: 'lms',
    label: 'LMS / Cursos EAD',
    description: 'Catálogo de cursos, matrículas, relatórios de progresso e administração.',
    path: '/lms',
    icon: <BookOpen className="h-6 w-6" />,
    moduleKey: 'lms',
  },
  {
    id: 'treinamento-voo',
    label: 'Treinamento de Voo',
    description:
      'Sessões em simulador e aeronave, fichas de avaliação, desempenho, relatórios e cadastros.',
    path: '/simuladores',
    icon: <Plane className="h-6 w-6" />,
    moduleKey: 'simuladores',
    requiresNotRestricted: true,
  },
];

export default function TreinamentosPainel() {
  const { isAluno, isInstrutor } = usePermissions();
  const { empresas, empresaAtualId } = useAuth();
  const empresaAtual = empresas.find((e) => e.id === empresaAtualId) || null;
  const modulosAtivos = empresaAtual?.modulos_ativos;
  const isRestricted = isAluno || isInstrutor;

  const visibleModules = MODULES.filter((m) => {
    if (m.requiresNotRestricted && isRestricted) return false;
    return canAccessModule(m.moduleKey, modulosAtivos);
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Treinamentos"
          subtitle="Central de treinamentos — acesso rápido a todos os módulos de capacitação."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleModules.map((mod) => (
            <Link
              key={mod.id}
              to={mod.path}
              className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500/40"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-300">
                  {mod.icon}
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-primary dark:text-slate-600 dark:group-hover:text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {mod.label}
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {mod.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
