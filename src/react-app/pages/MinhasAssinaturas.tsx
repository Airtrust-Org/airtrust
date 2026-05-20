import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { PenTool, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import Button from '../components/Button';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import ContentCard from '../components/ContentCard';

interface FichaPendente {
  ficha_uuid: string;
  status_workflow: string;
  funcao_na_sessao: string;
  data_inicio: string;
  data_fim: string;
  simulador_nome: string;
  template_nome: string;
  ciclo_executado: number;
}

const MinhasAssinaturas: React.FC = () => {
  const [fichasPendentes, setFichasPendentes] = useState<FichaPendente[]>([]);
  const [loading, setLoading] = useState(false);
  const [funcionarioId, setFuncionarioId] = useState<number | null>(null);

  useEffect(() => {
    setFuncionarioId(1);
  }, []);

  useEffect(() => {
    if (funcionarioId) {
      loadFichasPendentes();
    }
  }, [funcionarioId]);

  const loadFichasPendentes = async () => {
    if (!funcionarioId) return;

    setLoading(true);
    try {
      const response = await apiFetch(`/api/simulador/fichas-pendentes/${funcionarioId}`);
      const data = await response.json();
      setFichasPendentes(data.fichas || []);
    } catch (error) {
      console.error('Erro ao carregar fichas pendentes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssinar = async (fichaUuid: string) => {
    try {
      const response = await apiFetch(`/api/simulador/ficha/${fichaUuid}/assinar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tipo_assinatura: 'aluno',
        }),
      });

      if (response.ok) {
        await loadFichasPendentes();
      } else {
        throw new Error('Erro na resposta do servidor');
      }
    } catch (error) {
      console.error('Erro ao assinar ficha:', error);
      toast.warning('Erro ao assinar ficha. Tente novamente.');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDENTE_ALUNO':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'CONCLUIDA':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDENTE_ALUNO':
        return 'bg-yellow-100 text-yellow-800';
      case 'CONCLUIDA':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div>
      <PageHeader
        title="Minhas Assinaturas Pendentes"
        subtitle="Fichas de sessões de simulador aguardando sua assinatura"
      />

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-gray-600">Carregando...</p>
        </div>
      ) : (
        <ContentCard>
          {fichasPendentes.length > 0 ? (
            fichasPendentes.map((ficha) => (
              <Card key={ficha.ficha_uuid} className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center mb-2">
                      {getStatusIcon(ficha.status_workflow)}
                      <h3 className="text-lg font-semibold ml-2">{ficha.ficha_uuid}</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <p>
                          <strong>Simulador:</strong> {ficha.simulador_nome}
                        </p>
                        <p>
                          <strong>Função:</strong> {ficha.funcao_na_sessao}
                        </p>
                        <p>
                          <strong>Ciclo:</strong> {ficha.ciclo_executado}
                        </p>
                      </div>
                      <div>
                        <p>
                          <strong>Sessão:</strong> {ficha.template_nome}
                        </p>
                        <p>
                          <strong>Data:</strong>{' '}
                          {new Date(ficha.data_inicio).toLocaleDateString('pt-BR')}
                        </p>
                        <p>
                          <strong>Horário:</strong>{' '}
                          {`${new Date(ficha.data_inicio).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })} - ${new Date(ficha.data_fim).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm ${getStatusColor(
                          ficha.status_workflow,
                        )}`}
                      >
                        {ficha.status_workflow === 'PENDENTE_ALUNO'
                          ? 'Aguardando Assinatura'
                          : ficha.status_workflow}
                      </span>
                    </div>
                  </div>

                  <div className="ml-6 flex flex-col space-y-2">
                    {ficha.status_workflow === 'PENDENTE_ALUNO' && (
                      <Button
                        onClick={() => handleAssinar(ficha.ficha_uuid)}
                        className="flex items-center"
                      >
                        <PenTool className="w-4 h-4 mr-2" />
                        Assinar
                      </Button>
                    )}

                    <Button
                      variant="secondary"
                      onClick={() => {
                        window.open(`/simulador/ficha/${ficha.ficha_uuid}`, '_blank');
                      }}
                    >
                      Visualizar
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 mx-auto text-green-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Nenhuma assinatura pendente
              </h3>
              <p className="text-gray-600">Todas as suas fichas de simulador estão em dia.</p>
            </div>
          )}

          {/* Informações adicionais */}
          <div className="mt-8 p-6 bg-primary/10 border border-blue-200 rounded-lg">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Sobre as Assinaturas</h3>
            <div className="text-sm text-primary space-y-1">
              <p>• As fichas aparecem aqui após a sessão no simulador ser concluída</p>
              <p>• Você deve revisar e assinar para confirmar a participação</p>
              <p>• Após sua assinatura, a ficha segue para validação do instrutor</p>
              <p>• O processo é finalizado com a assinatura do checador</p>
            </div>
          </div>
        </ContentCard>
      )}
    </div>
  );
};

export default MinhasAssinaturas;
