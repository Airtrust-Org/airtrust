import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { PageLayout, PageSection } from '@/react-app/components/layout/PageLayout';
import FuncoesManagement from '../components/admin/FuncoesManagement';
import ComplianceMatrix from '../components/compliance/ComplianceMatrix';

export default function Funcoes() {
  const [showMatriz, setShowMatriz] = useState(false);

  const handleMatrizCompliance = () => {
    setShowMatriz(true);
  };

  const handleBackToFuncoes = () => {
    setShowMatriz(false);
  };

  return (
    <PageLayout
      title={showMatriz ? 'Matriz de Compliance' : 'Gestão de Funções'}
      subtitle={
        showMatriz
          ? 'Configure quais treinamentos são obrigatórios para cada função'
          : 'Configure as funções organizacionais e suas responsabilidades'
      }
      action={
        showMatriz ? (
          <button
            onClick={handleBackToFuncoes}
            className="flex items-center gap-2  py-2 text-primary hover:text-primary transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar para Funções
          </button>
        ) : undefined
      }
    >
      {!showMatriz ? (
        <PageSection>
          <FuncoesManagement onMatrizCompliance={handleMatrizCompliance} />
        </PageSection>
      ) : (
        <PageSection>
          <ComplianceMatrix onBack={handleBackToFuncoes} />
        </PageSection>
      )}
    </PageLayout>
  );
}
