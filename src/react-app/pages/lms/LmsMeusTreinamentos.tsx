import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import { CardMeusEAD } from '@/react-app/components/dashboard/CardMeusEAD';
import { LmsPageShell } from '../../components/lms/lmsUi';

/**
 * Área principal de treinamentos para aluno/instrutor.
 */
export default function LmsMeusTreinamentos() {
  return (
    <AppLayout>
      <LmsPageShell>
        <PageHeader
          className="mb-6"
          title="Meus treinamentos"
          subtitle="Acompanhe cursos não iniciados, em andamento e finalizados em um só lugar."
        />
        <CardMeusEAD showOpenPageLink={false} />
      </LmsPageShell>
    </AppLayout>
  );
}
