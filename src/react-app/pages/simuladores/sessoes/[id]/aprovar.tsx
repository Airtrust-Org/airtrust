import { API_BASE_URL } from '@/react-app/config/api';
import PageHeader from '@/react-app/components/PageHeader';
import AppLayout from '@/react-app/components/AppLayout';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

import { confirmDialog } from '@/react-app/utils/confirmDialog';

export default function AprovarSessao() {
  const { id } = useParams();
  const [sessao, setSessao] = useState<any>(null);
  const [manobras, setManobras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [observacoes, setObservacoes] = useState('');


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

  const aprovar = async () => {
    if (!await confirmDialog('Confirma a aprovação desta sessão?')) return;

    setProcessando(true);
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/sessoes/${id}/aprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacoes }),
      });

      const data = await response.json();
      if (data.success) {
        toast.warning('✅ Sessão aprovada com sucesso!');
        window.location.href = `/simuladores/sessoes/${id}`;
      } else {
        toast.warning(`Erro: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao aprovar:', error);
      toast.warning('Erro ao aprovar sessão');
    } finally {
      setProcessando(false);
    }
  };

  const reprovar = async () => {
    if (!motivo.trim()) {
      toast.warning('Por favor, informe o motivo da reprovação');
      return;
    }

    if (!await confirmDialog('Confirma a reprovação desta sessão?')) return;

    setProcessando(true);
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/sessoes/${id}/reprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo, observacoes }),
      });

      const data = await response.json();
      if (data.success) {
        toast.warning('❌ Sessão reprovada');
        window.location.href = `/simuladores/sessoes/${id}`;
      } else {
        toast.warning(`Erro: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao reprovar:', error);
      toast.warning('Erro ao reprovar sessão');
    } finally {
      setProcessando(false);
    }
  };

  const executadas = manobras.filter((m) => m.executada).length;
  const satisfatorias = manobras.filter((m) => m.avaliacao === 'satisfatorio').length;
  const percentualSatisfatorio = executadas > 0 ? (satisfatorias / executadas) * 100 : 0;
  const podeAprovar = percentualSatisfatorio >= 80;

  return (
    <AppLayout>
      <PageHeader className="mb-6" title="Avaliação Final da Sessão" subtitle={`${sessao?.simulador_nome || 'Simulador'} • ${
        sessao?.data ? new Date(sessao.data).toLocaleDateString('pt-BR') : ''
      }`} />
      <div className="space-y-4">
      <div className="space-y-4">
        {/* Resumo */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Resumo da Sessão</h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-primary/10 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Total Manobras</p>
              <p className="text-2xl font-bold text-primary">{manobras.length}</p>
            </div>

            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Executadas</p>
              <p className="text-2xl font-bold text-purple-600">{executadas}</p>
            </div>

            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Satisfatórias</p>
              <p className="text-2xl font-bold text-green-600">{satisfatorias}</p>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Taxa de Aproveitamento</span>
              <span className="text-2xl font-bold text-gray-900">
                {percentualSatisfatorio.toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  percentualSatisfatorio >= 80 ? 'bg-green-600' : 'bg-red-600'
                }`}
                style={{ width: `${percentualSatisfatorio}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">Mínimo necessário: 80%</p>
          </div>
        </div>

        {/* Alerta */}
        {!podeAprovar && (
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-yellow-900">Atenção!</p>
              <p className="text-sm text-yellow-800 mt-1">
                A taxa de aproveitamento está abaixo de 80%. Recomenda-se reprovar a sessão ou
                revisar as avaliações.
              </p>
            </div>
          </div>
        )}

        {/* Manobras Detalhadas */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Manobras Avaliadas</h2>

          <div className="space-y-3">
            {manobras
              .filter((m) => m.executada)
              .map((manobra: any) => (
                <div
                  key={manobra.manobra_id}
                  className={`p-3 rounded-lg border-l-4 ${
                    manobra.avaliacao === 'satisfatorio'
                      ? 'bg-green-50 border-green-500'
                      : 'bg-red-50 border-red-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{manobra.nome}</p>
                      {manobra.observacoes && (
                        <p className="text-sm text-gray-600 mt-1">{manobra.observacoes}</p>
                      )}
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        manobra.avaliacao === 'satisfatorio'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {manobra.avaliacao}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Formulário Aprovação/Reprovação */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Decisão Final</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Observações Gerais
              </label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                placeholder="Comentários sobre o desempenho geral do aluno..."
                className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Motivo da Reprovação (se aplicável)
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Descreva os motivos caso vá reprovar..."
                className="w-full  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reprovar}
            disabled={processando}
            className="flex items-center gap-2  py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <XCircle className="w-5 h-5" />
            {processando ? 'Processando...' : 'Reprovar Sessão'}
          </button>

          <button
            onClick={aprovar}
            disabled={processando || !podeAprovar}
            className="flex items-center gap-2  py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-5 h-5" />
            {processando ? 'Processando...' : 'Aprovar Sessão'}
          </button>
        </div>

        {!podeAprovar && (
          <p className="text-center text-sm text-gray-500 mt-4">
            * Aprovação desabilitada: taxa de aproveitamento abaixo de 80%
          </p>
        )}
      </div>
          </div>
    </AppLayout>
  );
}
