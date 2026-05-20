import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Save, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import Button from '../components/Button';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';
import ContentCard from '../components/ContentCard';

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
}

const EditarFicha: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const [ficha, setFicha] = useState<FichaDetalhes | null>(null);
  const [notas, setNotas] = useState<Record<number, string>>({});
  const [observacoes, setObservacoes] = useState<Record<number, string>>({});
  const [observacoesInstrutor, setObservacoesInstrutor] = useState('');
  const [conceito, setConceito] = useState<'APROVADO' | 'REPROVADO' | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
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

      const fichaData = data.ficha;

      if (!podeEditar(fichaData)) {
        toast.warning('Esta ficha não pode ser editada no status atual');
        navigate(-1);
        return;
      }

      setFicha(fichaData);
      setObservacoesInstrutor(fichaData.observacoes_instrutor || '');

      const notasIniciais: Record<number, string> = {};
      const observacoesIniciais: Record<number, string> = {};

      fichaData.manobras?.forEach((manobra: any) => {
        notasIniciais[manobra.id] = manobra.nota?.toString() || '';
        observacoesIniciais[manobra.id] = manobra.observacoes_manobra || '';
      });

      setNotas(notasIniciais);
      setObservacoes(observacoesIniciais);

      calcularConceito(notasIniciais);
    } catch (error) {
      console.error('Erro ao carregar ficha:', error);
      setError(error instanceof Error ? error.message : 'Erro ao carregar ficha');
    } finally {
      setLoading(false);
    }
  };

  const podeEditar = (ficha: FichaDetalhes) => {
    const statusEditaveis = ['RASCUNHO', 'PENDENTE_ALUNO'];
    return statusEditaveis.includes(ficha.status_workflow);
  };

  const handleNotaChange = (manobraId: number, valor: string) => {
    const novasNotas = { ...notas, [manobraId]: valor };
    setNotas(novasNotas);
    calcularConceito(novasNotas);
  };

  const handleObservacaoChange = (manobraId: number, valor: string) => {
    setObservacoes({ ...observacoes, [manobraId]: valor });
  };

  const calcularConceito = (notasAtuais: Record<number, string>) => {
    if (!ficha) return;

    const notasPreenchidas = Object.values(notasAtuais).filter((n) => n !== '' && n !== 'NR');
    const todasPreenchidas = notasPreenchidas.length === ficha.manobras.length;

    if (todasPreenchidas) {
      const notasNumericas = notasPreenchidas
        .filter((n) => n !== 'NR')
        .map(Number)
        .filter((n) => !isNaN(n));

      const temNotaBaixa = notasNumericas.some((nota) => nota < 5);
      setConceito(temNotaBaixa ? 'REPROVADO' : 'APROVADO');
    } else {
      setConceito(null);
    }
  };

  const salvarAvaliacao = async () => {
    if (!ficha || !todasNotasPreenchidas()) {
      toast.warning('Todas as manobras devem ter nota definida');
      return;
    }

    setSalvando(true);
    setError('');

    try {
      const payload = {
        manobras: ficha.manobras.map((manobra) => ({
          manobra_id: manobra.id,
          nota: notas[manobra.id] === 'NR' ? 'NR' : Number(notas[manobra.id]),
          observacoes: observacoes[manobra.id] || undefined,
        })),
        observacoes_instrutor: observacoesInstrutor || undefined,
      };

      const response = await apiFetch(`/api/simulador/ficha/${uuid}/notas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar avaliação');
      }

      navigate(`/simulador/ficha/${uuid}/visualizar`);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      setError(error instanceof Error ? error.message : 'Erro ao salvar avaliação');
    } finally {
      setSalvando(false);
    }
  };

  const todasNotasPreenchidas = () => {
    if (!ficha) return false;
    return ficha.manobras.every((manobra) => notas[manobra.id] !== '');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RASCUNHO':
        return 'bg-gray-100 text-gray-800';
      case 'PENDENTE_ALUNO':
        return 'bg-yellow-100 text-yellow-800';
      case 'PENDENTE_INSTRUTOR_FINAL':
        return 'bg-orange-100 text-orange-800';
      case 'PENDENTE_CHECK':
        return 'bg-purple-100 text-purple-800';
      case 'CONCLUIDA':
        return 'bg-green-100 text-green-800';
      case 'REPROVADA':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
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
    <div>
      <PageHeader 
        title={`Editando: ${ficha.ficha_uuid}`}
        subtitle="Avaliação de Manobras"
      />

      {/* Status Badge */}
      <div className="mb-6">
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
            ficha.status_workflow,
          )}`}
        >
          {ficha.status_workflow}
        </span>
      </div>

      {/* Error Display */}
      {error && (
        <ContentCard>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        </ContentCard>
      )}

      {/* Form Content */}
      <ContentCard>
          </div>
        </Card>
      )}

      {/* Informações Básicas (readonly) */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Dados da Sessão</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Tripulante</label>
            <p className="text-gray-900">{ficha.aluno_nome}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Simulador</label>
            <p className="text-gray-900">{ficha.simulador_nome}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Modelo</label>
            <p className="text-gray-900">{ficha.template_nome}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Instrutor</label>
            <p className="text-gray-900">{ficha.instrutor_nome}</p>
          </div>
        </div>
      </Card>

      {/* Avaliação das Manobras */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Avaliação das Manobras</h2>

        <div className="space-y-4">
          {ficha.manobras.map((manobra) => (
            <div key={manobra.id} className="border border-gray-200 rounded-lg p-4">
              <div className="mb-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-medium text-gray-900">
                    {manobra.manobra_id_codigo} - {manobra.nome_manobra}
                  </h3>
                  <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {manobra.categoria}
                  </span>
                </div>

                <p className="text-sm text-gray-600 mb-2">{manobra.criterios_aprovacao}</p>

                <div className="flex items-center space-x-4 text-sm">
                  <span className="text-gray-500">
                    Nota mínima:{' '}
                    <strong className="text-gray-900">{manobra.pontuacao_minima}</strong>
                  </span>
                  {manobra.nota && (
                    <span className="text-primary">
                      📊 Nota anterior: <strong>{manobra.nota}</strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nova Nota *
                  </label>
                  <select
                    value={notas[manobra.id] || ''}
                    onChange={(e) => handleNotaChange(manobra.id, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                    required
                  >
                    <option value="">Selecione...</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <option key={num} value={num.toString()}>
                        {num} {num < manobra.pontuacao_minima ? '(Reprovado)' : ''}
                      </option>
                    ))}
                    <option value="NR">NR - Não Realizado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Observações da Manobra
                  </label>
                  <textarea
                    value={observacoes[manobra.id] || ''}
                    onChange={(e) => handleObservacaoChange(manobra.id, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                    rows={2}
                    placeholder="Observações específicas desta manobra..."
                  />
                </div>
              </div>

              {/* Preview da nota */}
              {notas[manobra.id] && (
                <div className="mt-3 p-2 bg-gray-50 rounded">
                  <span className="text-sm text-gray-600">Nota: </span>
                  <span
                    className={`font-semibold ${
                      notas[manobra.id] === 'NR'
                        ? 'text-gray-600'
                        : Number(notas[manobra.id]) < manobra.pontuacao_minima
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}
                  >
                    {notas[manobra.id]}
                    {notas[manobra.id] !== 'NR' &&
                      Number(notas[manobra.id]) < manobra.pontuacao_minima &&
                      ' - REPROVADO'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Observações Gerais do Instrutor */}
        <div className="mt-6 border-t pt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Observações Gerais do Instrutor
          </label>
          <textarea
            value={observacoesInstrutor}
            onChange={(e) => setObservacoesInstrutor(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
            rows={4}
            placeholder="Observações gerais sobre a performance do aluno na sessão..."
          />
        </div>

        {/* Preview do Conceito */}
        {conceito && (
          <div
            className={`mt-6 p-4 rounded-lg border-2 ${
              conceito === 'APROVADO' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex items-center space-x-2">
              {conceito === 'APROVADO' ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <XCircle className="w-6 h-6 text-red-500" />
              )}
              <h3
                className={`text-lg font-bold ${
                  conceito === 'APROVADO' ? 'text-green-700' : 'text-red-700'
                }`}
              >
                Conceito: {conceito}
              </h3>
            </div>
            {conceito === 'REPROVADO' && (
              <p className="mt-2 text-sm text-red-700">
                ⚠️ Reprovação identificada: pelo menos uma nota é menor que 5
              </p>
            )}
          </div>
        )}

        {/* Botões de Ação */}
        <div className="flex justify-end space-x-3 mt-6 pt-6 border-t">
          <Button variant="secondary" onClick={() => navigate(-1)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvarAvaliacao} disabled={!todasNotasPreenchidas() || salvando}>
            {salvando ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar Avaliação
              </>
            )}
          </Button>
        </div>
      </ContentCard>
    </div>
  );
};

export default EditarFicha;
