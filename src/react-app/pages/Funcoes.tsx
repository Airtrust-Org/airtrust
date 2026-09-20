import { PageLayout, PageSection } from '@/react-app/components/layout/PageLayout';
import FuncoesManagement from '../components/admin/FuncoesManagement';

export default function Funcoes() {
  return (
    <PageLayout
      title="Gestão de Funções"
      subtitle="Configure as funções organizacionais e suas responsabilidades"
    >
      <PageSection>
        <FuncoesManagement />
      </PageSection>
    </PageLayout>
  );
}
