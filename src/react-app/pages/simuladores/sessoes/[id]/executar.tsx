import { API_BASE_URL } from '@/react-app/config/api';
import PageHeader from '@/react-app/components/PageHeader';
import AppLayout from '@/react-app/components/AppLayout';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Save, PlayCircle } from 'lucide-react';
import { SimuladoresCard, EmptyState} from '../../components/SimuladoresLayout';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

export default function ExecutarSessao() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sessao, setSessao] = useState<any>(null);
  const [manobras, setManobras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);


  useEffect(() => {
    carregarDados();
  }, [id]);

  const carregarDados = async () => {
    try {
      const [sessaoResp, manobrasResp] = await Promise.all([
        fetch(`${API_BASE_URL}/simuladores/sessoes/${id}`),
        fetch(`${API_BASE_URL}/simuladores/sessoes/${id}/manobras`),
      ]);

      const sessaoData = await sessaoResp.json();
      const manobrasData = await manobrasResp.json();

      if (sessaoData.success) {
        setSessao(sessaoData.sessao);
      }

      if (manobrasData.success) {
        setManobras(manobrasData.manobras || []);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const atualizarManobra = (manobra_id: string, campo: string, valor: any) => {
    setManobras(manobras.map((m) => (m.manobra_id === manobra_id ? { ...m, [campo]: valor } : m)));
  };

  const salvarManobra = async (manobra: any) => {
    setSalvando(true);
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/sessoes/${id}/manobras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manobra_id: manobra.manobra_id,
          executada: manobra.executada,
          avaliacao: manobra.avaliacao,
          observacoes: manobra.observacoes,
        }),
      });

      const data = await response.json();
      if (data.success) {
      } else {
        toast.warning(`Erro: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao salvar manobra:', error);
    } finally {
      setSalvando(false);
    }
  };

  const finalizarSessao = () => {
    const executadas = manobras.filter((m) => m.executada).length;
    const total = manobras.length;
    const percentual = (executadas / total) * 100;

    if (percentual < 80) {
      if (
        !await confirmDialog(`Apenas ${percentual.toFixed(0)}% das manobras foram executadas. Deseja continuar?`,
        )
      ) {
        return;
      }
    }

    navigate(`/simuladores/sessoes/${id}/aprovar`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const executadas = manobras.filter((m) => m.executada).length;
  const satisfatorias = manobras.filter((m) => m.avaliacao === 'satisfatorio').length;
  const percentualConclusao = manobras.length > 0 ? (executadas / manobras.length) * 100 : 0;

  return (
    <AppLayout>
      <PageHeader className="mb-6" title="Executar Sessão" />
      <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-2xl font-bold text-gray-900">Executar Sessão</h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">
              {sessao?.simulador_nome} • {new Date(sessao?.data).toLocaleDateString('pt-BR')}
            </p>
          </div>

          <button
            onClick={finalizarSessao}
            disabled={executadas === 0}
            className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-5 h-5" />
            Finalizar Sessão
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-6">
        <div className="grid grid-cols-3 sm:flex sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <p className="text-xs sm:text-sm text-gray-600">Progresso</p>
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{percentualConclusao.toFixed(0)}%</p>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-xs sm:text-sm text-gray-600">Executadas</p>
            <p className="text-xl sm:text-2xl font-bold text-gray-900">
              {executadas}/{manobras.length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs sm:text-sm text-gray-600">Satisfatórias</p>
            <p className="text-xl sm:text-2xl font-bold text-green-600">{satisfatorias}</p>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-primary h-3 rounded-full transition-all duration-300"
            style={{ width: `${percentualConclusao}%` }}
          />
        </div>
      </div>

      {/* Checklist Manobras */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Checklist de Manobras</h2>

        <div className="space-y-4">
          {manobras.map((manobra, index) => (
            <div
              key={manobra.manobra_id}
              className={`p-4 rounded-lg border-2 transition-all ${
                manobra.executada ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Checkbox */}
                <div className="flex items-center pt-1">
                  <input
                    type="checkbox"
                    checked={manobra.executada || false}
                    onChange={(e) =>
                      atualizarManobra(manobra.manobra_id, 'executada', e.target.checked)
                    }
                    className="w-6 h-6 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* Conteúdo */}
                <div className="flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                    <div>
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                        {index + 1}. {manobra.nome}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {manobra.codigo} • {manobra.categoria}
                      </p>
                    </div>

                    {manobra.executada && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() =>
                            atualizarManobra(manobra.manobra_id, 'avaliacao', 'satisfatorio')
                          }
                          className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                            manobra.avaliacao === 'satisfatorio'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          <CheckCircle className="w-4 h-4 inline mr-1" />
                          Satisfatório
                        </button>
                        <button
                          onClick={() =>
                            atualizarManobra(manobra.manobra_id, 'avaliacao', 'insatisfatorio')
                          }
                          className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                            manobra.avaliacao === 'insatisfatorio'
                              ? 'bg-red-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          <XCircle className="w-4 h-4 inline mr-1" />
                          Insatisfatório
                        </button>
                      </div>
                    )}
                  </div>

                  {manobra.executada && (
                    <div className="mt-3">
                      <textarea
                        value={manobra.observacoes || ''}
                        onChange={(e) =>
                          atualizarManobra(manobra.manobra_id, 'observacoes', e.target.value)
                        }
                        placeholder="Observações sobre a execução..."
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                      />

                      <button
                        onClick={() => salvarManobra(manobra)}
                        disabled={salvando}
                        className="mt-2 flex items-center gap-2 px-3 py-1 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        Salvar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {manobras.length === 0 && (
          <EmptyState
            icon={<XCircle />}
            title="Nenhuma manobra"
            description="Nenhuma manobra planejada para esta sessão"
          />
        )}
      </div>
          </div>
    </AppLayout>
  );
}
