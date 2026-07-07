/**
 * @deprecated ÓRFÃO — não há <Route> para esta página em
 * src/react-app/App.tsx. O único componente que navegaria até aqui
 * (src/react-app/components/simuladores/AcoesFicha.tsx) também não é
 * importado por ninguém. Não usar como referência para ficha-modelo
 * V6.2; o caminho ativo é src/react-app/pages/simuladores/fichas/[id]/index.tsx.
 */
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { apiFetch } from '@/react-app/lib/apiFetch';
import { previewPdfBeforeDownload } from '@/react-app/utils/pdfPreview';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Download, User, Settings, CheckCircle, XCircle } from 'lucide-react';
import Button from '../components/Button';
import Card from '../components/Card';

interface FichaDetalhes {
  id: number;
  ficha_uuid: string;
  status_workflow: string;
  funcao_na_sessao: string;
  ciclo_executado: number;
  resultado_final?: string;
  nota?: number;
  data_inicio: string;
  data_fim: string;
  simulador_nome: string;
  instrutor_nome: string;
  checador_nome?: string;
  aluno_nome: string;
  aluno_matricula: string;
  template_nome: string;
  template_descricao?: string;
  observacoes_instrutor?: string;
  observacoes_aluno?: string;
  manobras: {
    id: number;
    manobra_id_codigo: string;
    nome_manobra: string;
    categoria: string;
    criterios_aprovacao: string;
    pontuacao_minima: number;
    nota?: number;
    observacoes_manobra?: string;
  }[];
  assinaturas?: {
    tipo: string;
    nome: string;
    timestamp: string;
    protocolo: string;
  }[];
}

const VisualizarFicha: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const [ficha, setFicha] = useState<FichaDetalhes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (uuid) {
      carregarFicha();
    }
  }, [uuid]);

  const carregarFicha = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/simulador/ficha/${uuid}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar ficha');
      }

      setFicha(data.ficha);
    } catch (error) {
      console.error('Erro ao carregar ficha:', error);
      setError(error instanceof Error ? error.message : 'Erro ao carregar ficha');
    } finally {
      setLoading(false);
    }
  };

  const gerarPDF = async () => {
    try {
      await previewPdfBeforeDownload({
        fileName: `${ficha?.ficha_uuid || 'ficha'}.pdf`,
        title: `Ficha ${ficha?.ficha_uuid || ''}`.trim(),
        fetcher: () => apiFetch(`/api/simulador/ficha/${uuid}/pdf`),
      });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.warning('Erro ao gerar PDF');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RASCUNHO': return 'bg-gray-100 text-gray-800';
      case 'PENDENTE_ALUNO': return 'bg-yellow-100 text-yellow-800';
      case 'PENDENTE_INSTRUTOR_FINAL': return 'bg-orange-100 text-orange-800';
      case 'PENDENTE_CHECK': return 'bg-purple-100 text-purple-800';
      case 'CONCLUIDA': return 'bg-green-100 text-green-800';
      case 'REPROVADA': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getNotaColor = (nota: number) => {
    if (nota < 5) return 'text-red-600 font-bold';
    if (nota < 7) return 'text-yellow-600 font-semibold';
    return 'text-green-600 font-semibold';
  };

  if (loading) {
    return (
      <div className="max-w-[1280px] mx-auto p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando ficha...</p>
        </div>
      </div>
    );
  }

  if (error || !ficha) {
    return (
      <div className="max-w-[1280px] mx-auto p-6">
        <Card className="p-8 text-center">
          <XCircle className="w-16 h-16 mx-auto text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Erro ao carregar ficha</h2>
          <p className="text-gray-600 mb-4">{error || 'Ficha não encontrada'}</p>
          <Button onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-4">
          <Button variant="secondary" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{ficha.ficha_uuid}</h1>
            <p className="text-gray-600">Ficha de Sessão de Simulador</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(ficha.status_workflow)}`}>
            {ficha.status_workflow}
          </span>
          <Button onClick={gerarPDF}>
            <Download className="w-4 h-4 mr-2" />
            Gerar PDF
          </Button>
        </div>
      </div>

      {/* Informações Básicas */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Settings className="w-5 h-5 mr-2" />
          Dados da Sessão
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Tripulante</label>
            <p className="text-gray-900">{ficha.aluno_nome}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Matrícula</label>
            <p className="text-gray-900">{ficha.aluno_matricula}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Simulador</label>
            <p className="text-gray-900">{ficha.simulador_nome}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Função na Sessão</label>
            <p className="text-gray-900">{ficha.funcao_na_sessao}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Modelo</label>
            <p className="text-gray-900">{ficha.template_nome}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Ciclo</label>
            <p className="text-gray-900">Ciclo {ficha.ciclo_executado}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Data/Hora</label>
            <p className="text-gray-900">
              {new Date(ficha.data_inicio).toLocaleString('pt-BR')}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Instrutor</label>
            <p className="text-gray-900">{ficha.instrutor_nome}</p>
          </div>
          {ficha.checador_nome && (
            <div>
              <label className="text-sm font-medium text-gray-500">Checador</label>
              <p className="text-gray-900">{ficha.checador_nome}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Resultado Final */}
      {ficha.resultado_final && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Resultado Final</h2>
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              {ficha.resultado_final === 'APROVADO' ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <XCircle className="w-6 h-6 text-red-500" />
              )}
              <span className={`text-lg font-bold ${
                ficha.resultado_final === 'APROVADO' ? 'text-green-600' : 'text-red-600'
              }`}>
                {ficha.resultado_final}
              </span>
            </div>
            {ficha.nota && (
              <div>
                <span className="text-sm text-gray-500">Nota Final: </span>
                <span className={`text-lg font-semibold ${getNotaColor(ficha.nota)}`}>
                  {ficha.nota.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Manobras Avaliadas */}
      {ficha.manobras && ficha.manobras.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Manobras Avaliadas</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">Código</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">Descrição</th>
                  <th className="text-center py-2 px-3 text-sm font-medium text-gray-600">Nota Mínima</th>
                  <th className="text-center py-2 px-3 text-sm font-medium text-gray-600">Nota Obtida</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">Observações</th>
                </tr>
              </thead>
              <tbody>
                {ficha.manobras.map((manobra) => (
                  <tr key={manobra.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3 text-sm font-mono">{manobra.manobra_id_codigo}</td>
                    <td className="py-3 px-3 text-sm">
                      <div>
                        <p className="font-medium">{manobra.nome_manobra}</p>
                        <p className="text-gray-500 text-xs">{manobra.categoria}</p>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center text-sm">
                      <span className="px-2 py-1 bg-gray-100 rounded text-gray-700">
                        {manobra.pontuacao_minima}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center text-sm">
                      {manobra.nota ? (
                        <span className={`px-2 py-1 rounded font-semibold ${
                          manobra.nota < manobra.pontuacao_minima 
                            ? 'bg-red-100 text-red-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {manobra.nota}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-sm text-gray-600">
                      {manobra.observacoes_manobra || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Observações */}
      {(ficha.observacoes_instrutor || ficha.observacoes_aluno) && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Observações</h2>
          
          {ficha.observacoes_instrutor && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Observações do Instrutor</h3>
              <p className="text-gray-900 bg-gray-50 p-3 rounded">{ficha.observacoes_instrutor}</p>
            </div>
          )}
          
          {ficha.observacoes_aluno && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Observações do Aluno</h3>
              <p className="text-gray-900 bg-gray-50 p-3 rounded">{ficha.observacoes_aluno}</p>
            </div>
          )}
        </Card>
      )}

      {/* Assinaturas */}
      {ficha.assinaturas && ficha.assinaturas.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <User className="w-5 h-5 mr-2" />
            Assinaturas Digitais
          </h2>
          
          <div className="space-y-3">
            {ficha.assinaturas.map((assinatura, index) => (
              <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <div>
                  <p className="font-medium text-gray-900">{assinatura.nome}</p>
                  <p className="text-sm text-gray-600">{assinatura.tipo}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-900">
                    {new Date(assinatura.timestamp).toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">{assinatura.protocolo}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default VisualizarFicha;
