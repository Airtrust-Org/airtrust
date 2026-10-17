import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import { CardMeusEAD } from '@/react-app/components/dashboard/CardMeusEAD';
import { LmsModuleTabs, LmsPageShell } from './lmsUi';

/**
 * Área de treinamentos própria para aluno/instrutor.
 * O catálogo/lista de cursos tem rota separada e não substitui esta visão.
 */
export default function LmsMeusTreinamentos() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <LmsPageShell>
        <PageHeader
          className="mb-6"
          title="Meus treinamentos"
          subtitle="Acompanhe cursos não iniciados, em andamento e finalizados em um só lugar."
          actions={
            <button
              type="button"
              onClick={() => navigate('/lms/cursos')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-sky-300"
            >
              <BookOpen className="h-4 w-4" />
              Ver cursos em lista
            </button>
          }
        />
        <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <LmsModuleTabs canManage={false} />
        </div>
        <CardMeusEAD showOpenPageLink={false} />
      </LmsPageShell>
    </AppLayout>
  );
}
