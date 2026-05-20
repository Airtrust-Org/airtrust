import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import FormularioAgendamento from '../components/simuladores/FormularioAgendamento';
import { PageLayout, PageSection } from '@/react-app/components/layout/PageLayout';

const Agendamento: React.FC = () => {
  const navigate = useNavigate();
  const [sucesso, setSucesso] = useState(false);

  if (sucesso) {
    // Auto-redirect after a delay
    setTimeout(() => {
      navigate('/simuladores');
    }, 2000);

    return (
      <PageLayout
        title="Agendar Sessão"
        subtitle="Configure uma nova sessão de treinamento em simulador"
      >
        <PageSection>
          <div className="max-w-md mx-auto text-center p-8">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="text-green-600" size={32} />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Sessão Agendada!</h2>
              <p className="text-gray-600">
                Sua sessão foi agendada com sucesso. Redirecionando para o dashboard...
              </p>
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-green-600 border-t-transparent"></div>
            </div>
          </div>
        </PageSection>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Agendar Sessão"
      subtitle="Configure uma nova sessão de treinamento em simulador"
    >
      <PageSection>
        <FormularioAgendamento
          onCancelar={() => navigate('/simuladores')}
          onSucesso={() => setSucesso(true)}
        />
      </PageSection>
    </PageLayout>
  );
};

export default Agendamento;
