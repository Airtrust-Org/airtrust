import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft,
  ClipboardCheck,
  Save,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  TrendingUp,
} from 'lucide-react';
import Button from '../components/Button';
import { PageLayout, PageSection, PageGrid } from '@/react-app/components/layout/PageLayout';
import StatCard from '@/react-app/components/StatCard';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface Manobra {
  id: number;
  nome: string;
  pontuacao: number | null;
  status: string;
  observacoes?: string;
  categoria?: string;
  criterios?: string;
}

interface FichaAvaliacao {
  uuid: string;
  participante_nome: string;
  template_nome: string;
  instrutor_nome: string;
  status: string;
  manobras: Manobra[];
  observacoes_gerais?: string;
  nota?: number;
  data_sessao?: string;
}

const AvaliarFicha: React.FC = () => {
  const { fichaUuid } = useParams<{ fichaUuid: string }>();
  const navigate = useNavigate();
  const [ficha, setFicha] = useState<FichaAvaliacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [observacoesGerais, setObservacoesGerais] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODAS');

  const carregarFicha = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/simulador/fichas/${fichaUuid}`);
      const data = await response.json();

      if (data.success) {
        const fichaData = data.data;
        setFicha(fichaData);
        setObservacoesGerais(fichaData.observacoes_gerais || '');
      } else {
        showAlertDialog('Erro ao carregar ficha: ' + (data.error || 'Ficha não encontrada'));
      }
    } catch (error) {
      console.error('Erro ao carregar ficha:', error);
      toast.warning('Erro de conexão ao carregar ficha');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fichaUuid) {
      carregarFicha();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaUuid]);

  const atualizarPontuacaoManobra = (manobraId: number, pontuacao: number) => {
    if (!ficha) return;

    setFicha((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        manobras: prev.manobras.map((manobra) =>
          manobra.id === manobraId
            ? {
                ...manobra,
                pontuacao,
                status: pontuacao >= 5 ? 'APROVADO' : 'REPROVADO',
              }
            : manobra,
        ),
      };
    });
  };

  const atualizarObservacaoManobra = (manobraId: number, observacao: string) => {
    if (!ficha) return;

    setFicha((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        manobras: prev.manobras.map((manobra) =>
          manobra.id === manobraId ? { ...manobra, observacoes: observacao } : manobra,
        ),
      };
    });
  };

  const calcularNotaFinal = () => {
    if (!ficha) return 0;

    const manobrasPontuadas = ficha.manobras.filter((m) => m.pontuacao !== null);
    if (manobrasPontuadas.length === 0) return 0;

    const soma = manobrasPontuadas.reduce((acc, m) => acc + (m.pontuacao || 0), 0);
    return Number((soma / manobrasPontuadas.length).toFixed(1));
  };

  const salvarRascunho = async () => {
    if (!ficha) return;

    try {
      setSalvando(true);

      const rascunhoData = {
        manobras: ficha.manobras.map((m) => ({
          id: m.id,
          pontuacao: m.pontuacao,
          observacoes: m.observacoes,
        })),
        observacoes_gerais: observacoesGerais,
        status: 'RASCUNHO',
      };

      const response = await apiFetch(`/api/simulador/fichas/${fichaUuid}/rascunho`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rascunhoData),
      });

      if (response.ok) {
        toast.warning('✅ Rascunho salvo com sucesso!');
      }
    } catch (error) {
      console.error('Erro ao salvar rascunho:', error);
      toast.warning('Erro ao salvar rascunho');
    } finally {
      setSalvando(false);
    }
  };

  const finalizarAvaliacao = async () => {
    if (!ficha) return;

    const manobrasPendentes = ficha.manobras.filter((m) => m.pontuacao === null);
    if (manobrasPendentes.length > 0) {
      showAlertDialog(
        `❌ Ainda há ${manobrasPendentes.length} manobra(s) sem pontuação.\n\nAvalie todas antes de finalizar.`,
      );
      return;
    }

    const notaFinal = calcularNotaFinal();
    const statusFinal = notaFinal >= 7 ? 'APROVADO' : 'REPROVADO';

    if (
      !await confirmDialog(`Finalizar avaliação com nota ${notaFinal}?\nStatus: ${statusFinal}\n\nEsta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    try {
      setSalvando(true);

      const avaliacaoData = {
        nota: notaFinal,
        observacoes: observacoesGerais,
        manobras: ficha.manobras.map((m) => ({
          id: m.id,
          pontuacao: m.pontuacao,
          observacoes: m.observacoes,
        })),
        status_final: statusFinal,
      };

      const response = await apiFetch(`/api/simulador/fichas/${fichaUuid}/avaliar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(avaliacaoData),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast.warning(`✅ Avaliação finalizada!\nNota: ${notaFinal}\nStatus: ${statusFinal}`);
        navigate('/simuladores');
      } else {
        toast.warning(`❌ Erro ao finalizar: ${result.error || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao finalizar avaliação:', error);
      toast.warning('❌ Erro de conexão ao finalizar avaliação');
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full px-4 md: py-6 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div>
          <p className="text-gray-600 font-medium">Carregando ficha de avaliação...</p>
        </div>
      </div>
    );
  }

  if (!ficha) {
    return (
      <div className="w-full">
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ficha não encontrada</h2>
          <p className="text-gray-600 mb-6">
            A ficha de avaliação solicitada não foi encontrada no sistema.
          </p>
          <Button onClick={() => navigate('/simuladores')} variant="primary">
            <ArrowLeft size={16} className="mr-2" />
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const notaFinal = calcularNotaFinal();
  const statusFinal = notaFinal >= 7 ? 'APROVADO' : 'REPROVADO';
  const manobrasPendentes = ficha.manobras.filter((m) => m.pontuacao === null).length;
  const manobrasConcluidas = ficha.manobras.length - manobrasPendentes;

  // Agrupar manobras por categoria
  const categorias = [...new Set(ficha.manobras.map((m) => m.categoria || 'SEM CATEGORIA'))];
  const manobrasPorCategoria = categorias.reduce((acc, cat) => {
    acc[cat] = ficha.manobras.filter((m) => (m.categoria || 'SEM CATEGORIA') === cat);
    return acc;
  }, {} as Record<string, Manobra[]>);

  const manobrasFiltradas =
    filtroCategoria === 'TODAS' ? ficha.manobras : manobrasPorCategoria[filtroCategoria] || [];

  const getNotaColor = (nota: number | null) => {
    if (nota === null) return 'text-gray-400';
    if (nota >= 8) return 'text-green-600 font-bold';
    if (nota >= 5) return 'text-amber-600 font-semibold';
    return 'text-red-600 font-bold';
  };

  return (
    <PageLayout
      title="Avaliar Ficha"
      subtitle={`${ficha.participante_nome} • ${ficha.template_nome}`}
    >
      <PageGrid>
        <StatCard
          label="Participante"
          value={ficha.participante_nome}
          icon={ClipboardCheck}
          color="blue"
        />
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <p className="text-gray-600 text-sm font-medium">Progresso</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{
                  width: `${(manobrasConcluidas / ficha.manobras.length) * 100}%`,
                }}
              />
            </div>
            <span className="text-sm font-semibold text-gray-700">
              {manobrasConcluidas}/{ficha.manobras.length}
            </span>
          </div>
        </div>
        <StatCard
          label="Nota Média"
          value={notaFinal.toFixed(1)}
          icon={TrendingUp}
          color={notaFinal >= 8 ? 'green' : notaFinal >= 5 ? 'yellow' : 'red'}
        />
        <StatCard
          label="Status"
          value={statusFinal}
          icon={statusFinal === 'APROVADO' ? CheckCircle : AlertTriangle}
          color={statusFinal === 'APROVADO' ? 'green' : 'red'}
        />
      </PageGrid>

      {categorias.length > 1 && (
        <PageSection>
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Filtrar por Categoria:</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFiltroCategoria('TODAS')}
                className={`px-4 py-2 rounded-lg transition-all text-sm font-medium ${
                  filtroCategoria === 'TODAS'
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todas ({ficha.manobras.length})
              </button>
              {categorias.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFiltroCategoria(cat)}
                  className={`px-4 py-2 rounded-lg transition-all text-sm font-medium ${
                    filtroCategoria === cat
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat} ({manobrasPorCategoria[cat].length})
                </button>
              ))}
            </div>
          </div>
        </PageSection>
      )}

      <PageSection>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <BarChart3 size={24} className="text-primary" />
            Avaliação das Manobras
          </h2>

          <div className="space-y-4">
            {manobrasFiltradas.map((manobra) => (
              <div
                key={manobra.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors bg-white"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Coluna 1: Dados da Manobra */}
                  <div className="md:col-span-1">
                    <h3 className="font-semibold text-gray-900 text-sm md:text-base mb-1">
                      {manobra.nome}
                    </h3>
                    {manobra.categoria && (
                      <p className="text-xs text-gray-500">Categoria: {manobra.categoria}</p>
                    )}
                    {manobra.criterios && (
                      <p className="text-xs text-gray-600 mt-1">{manobra.criterios}</p>
                    )}
                  </div>

                  {/* Coluna 2: Pontuação */}
                  <div className="md:col-span-1">
                    <label className="block text-xs md:text-sm font-medium text-gray-700 mb-2">
                      Pontuação (0-10)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.5"
                        value={manobra.pontuacao ?? 5}
                        onChange={(e) =>
                          atualizarPontuacaoManobra(manobra.id, parseFloat(e.target.value))
                        }
                        disabled={salvando}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={manobra.pontuacao ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseFloat(e.target.value) : null;
                          if (val !== null && val >= 0 && val <= 10) {
                            atualizarPontuacaoManobra(manobra.id, val);
                          }
                        }}
                        disabled={salvando}
                        className="w-12 md:w-16 px-2 py-1 border border-gray-300 rounded text-center font-semibold text-sm"
                      />
                    </div>
                    {manobra.pontuacao !== null && (
                      <p className={`text-xs mt-1 font-medium ${getNotaColor(manobra.pontuacao)}`}>
                        {manobra.pontuacao >= 5 ? '✅ APROVADO' : '❌ REPROVADO'}
                      </p>
                    )}
                  </div>

                  {/* Coluna 3: Status e Observações (mobile) */}
                  <div className="md:col-span-1">
                    <label className="block text-xs md:text-sm font-medium text-gray-700 mb-2">
                      Observações
                    </label>
                    <textarea
                      value={manobra.observacoes || ''}
                      onChange={(e) => atualizarObservacaoManobra(manobra.id, e.target.value)}
                      disabled={salvando}
                      placeholder="Observações específicas..."
                      className="w-full px-3 py-2 border border-gray-300 rounded text-xs md:text-sm focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PageSection>

      <PageSection>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Observações Gerais</h2>
          <textarea
            value={observacoesGerais}
            onChange={(e) => setObservacoesGerais(e.target.value)}
            disabled={salvando}
            placeholder="Adicione comentários sobre o desempenho geral do participante..."
            className="w-full  py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none"
            rows={4}
          />
        </div>
      </PageSection>

      <PageSection>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            onClick={salvarRascunho}
            disabled={salvando}
            variant="secondary"
            className="flex-1"
          >
            {salvando ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2 inline-block"></div>
                Salvando...
              </>
            ) : (
              <>
                <Save size={16} className="mr-2" />
                Salvar Rascunho
              </>
            )}
          </Button>

          <Button
            onClick={finalizarAvaliacao}
            disabled={salvando || manobrasPendentes > 0}
            className={`flex-1 ${
              statusFinal === 'APROVADO'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {salvando ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2 inline-block"></div>
                Finalizando...
              </>
            ) : (
              <>
                <CheckCircle size={16} className="mr-2" />
                Finalizar Avaliação
              </>
            )}
          </Button>
        </div>

        {manobrasPendentes > 0 && (
          <div className="bg-yellow-50 border-2 border-yellow-200 p-4 rounded-lg mt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-yellow-800">
                  Ainda faltam {manobrasPendentes} manobra(s)
                </p>
                <p className="text-sm text-yellow-700">
                  Avalie todas as manobras antes de finalizar a avaliação.
                </p>
              </div>
            </div>
          </div>
        )}
      </PageSection>
    </PageLayout>
  );
};

export default AvaliarFicha;
