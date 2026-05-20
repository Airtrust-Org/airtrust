/**
 * TabSessoesWrapper - Wrapper para Tab Sessoes com dados dinamicos
 * Padronizado com SimuladoresLayout
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { toast } from 'sonner';
import { isSameStatus } from '@/react-app/types/simuladores';
import { SimuladoresCard } from '../components/SimuladoresLayout';
import SessaoCard, { Sessao } from '@/react-app/components/simuladores/SessaoCard';
import ModalNovaSessao from '@/react-app/components/modals/ModalNovaSessao';
import { Calendar, Plus, BarChart3, Award, X, TrendingUp, Search, Loader2 } from 'lucide-react';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import ConfirmDeleteModal from '@/react-app/components/modals/ConfirmDeleteModal';
import { emitirEventoModulo } from '@/react-app/lib/moduloBus';

export default function TabSessoesWrapper() {
  const navigate = useNavigate();
  const { isAluno, isInstrutor } = usePermissions();
  const readOnly = isAluno || isInstrutor;
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [modalNovaSessaoOpen, setModalNovaSessaoOpen] = useState(false);
  const [sessaoParaEditar, setSessaoParaEditar] = useState<Sessao | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ id: number; nome: string } | null>(
    null,
  );
  const [deletandoId, setDeletandoId] = useState<number | null>(null);

  const fetchSessoes = async () => {
    try {
      setLoading(true);

      // FILTRO: Sessões dos últimos 30 dias até 6 meses no futuro
      const hoje = new Date();
      const dataInicio = new Date(hoje);
      dataInicio.setDate(dataInicio.getDate() - 30); // 30 dias atrás

      const dataFim = new Date(hoje);
      dataFim.setMonth(dataFim.getMonth() + 6); // 6 meses no futuro

      const params = new URLSearchParams({
        data_inicio: dataInicio.toISOString().split('T')[0],
        data_fim: dataFim.toISOString().split('T')[0],
        t: new Date().getTime().toString(), // Cache bust
      });

      const _st = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/simuladores/sessoes?${params}`, {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          ...(_st ? { Authorization: `Bearer ${_st}` } : {}),
        },
      });
      const data = await res.json();
      if (data.success) {
        setSessoes(data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar sessoes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessoes();
  }, []);

  const handleEditarSessao = (id: number) => {
    const sessao = sessoes.find((s) => s.id === id);
    if (sessao) {
      // Converter Sessao para SessaoParaEditar para compatibilidade com ModalNovaSessao
      const sessaoParaEditar = {
        id: sessao.id,
        template_id: (sessao as any).template_id ?? null,
        simulador_id: sessao.simulador_id,
        simulador_nome: sessao.simulador_nome,
        simulador_modelo: sessao.simulador_modelo, // necessário para filtrar checks por modelo de aeronave
        data: sessao.data,
        horario_inicio: sessao.horario_inicio,
        horario_fim: sessao.horario_fim,
        instrutor_id: sessao.instrutor_id,
        instrutor_nome: sessao.instrutor_nome,
        examinador_id: sessao.examinador_id ?? null, // necessário para pré-selecionar examinador e checks
        tipo_sessao: sessao.tipo_sessao,
        tema_sessao: sessao.tema_sessao,
        observacoes: sessao.observacoes,
        participantes: sessao.participantes.map((p) => ({
          funcionario_id: p.funcionario_id,
          funcao: p.funcao as 'PIC' | 'SIC',
        })),
      };
      setSessaoParaEditar(sessaoParaEditar as any);
      setModalNovaSessaoOpen(true);
    }
  };

  const handleDeletarSessao = (id: number) => {
    const sessao = sessoes.find((s) => s.id === id);
    if (sessao) {
      setShowConfirmDelete({
        id: sessao.id,
        nome: `${sessao.tipo_sessao || 'Sessão'} - ${sessao.simulador_nome || ''}`,
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmDelete) return;

    const { id } = showConfirmDelete;
    setDeletandoId(id);

    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/sessoes/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json();

      if (data.success) {
        const sessaoRemovida = sessoes.find((sessao) => sessao.id === id);

        // Optimistic update - remover da lista imediatamente
        setSessoes((prev) => prev.filter((s) => s.id !== id));

        emitirEventoModulo({
          modulo: 'simuladores',
          tipo: 'SIMULADOR_ATUALIZADO',
          funcionarioIds: sessaoRemovida?.participantes?.map(
            (participante) => participante.funcionario_id,
          ),
        });

        toast.success('Sessão cancelada com sucesso!');
        setShowConfirmDelete(null);

        // Aguardar um pouco para garantir que o servidor processou
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSessoes();
      } else {
        // Se falhou, reverter optimistic update (recarregar tudo)
        await fetchSessoes();
        toast.error(`Erro ao cancelar sessão: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao deletar sessão:', error);
      toast.error('Erro ao cancelar sessão');
    } finally {
      setDeletandoId(null);
    }
  };

  // Estatisticas
  const stats = {
    total: sessoes.length,
    agendadas: sessoes.filter((s) => isSameStatus(s.status, 'AGENDADO')).length,
    emAndamento: sessoes.filter((s) => isSameStatus(s.status, 'EM_ANDAMENTO')).length,
    concluidas: sessoes.filter((s) => isSameStatus(s.status, 'CONCLUIDO')).length,
    canceladas: sessoes.filter((s) => isSameStatus(s.status, 'CANCELADO')).length,
  };

  // Sessoes filtradas
  const sessoesFiltradas = sessoes
    .filter((s) => {
      if (filtroStatus && !isSameStatus(s.status, filtroStatus)) return false;
      if (busca) {
        const searchLower = busca.toLowerCase();
        return (
          s.simulador_nome?.toLowerCase().includes(searchLower) ||
          s.instrutor_nome?.toLowerCase().includes(searchLower) ||
          s.tipo_sessao?.toLowerCase().includes(searchLower) ||
          s.participantes?.some((p) => p.funcionario_nome?.toLowerCase().includes(searchLower))
        );
      }
      return true;
    })
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  // Helper para verificar datas
  const isFutureOrToday = (dateStr: string) => {
    if (!dateStr) return false;

    // Obter data de hoje em formato YYYY-MM-DD (local)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    // Comparação de strings funciona bem para formato ISO YYYY-MM-DD
    // Ex: "2026-01-10" >= "2026-01-09"
    return dateStr >= todayStr;
  };

  // Proximas sessoes (Apenas AGENDADO e datas futuras/hoje)
  const proximasSessoes = useMemo(() => {
    return sessoesFiltradas
      .filter((s) => isSameStatus(s.status, 'AGENDADO') && isFutureOrToday(s.data))
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
      .slice(0, 5);
  }, [sessoesFiltradas]);

  // Sessoes recentes (STATUS != AGENDADO ou datas passadas)
  const sessoesRecentes = useMemo(() => {
    return sessoesFiltradas
      .filter((s) => !isSameStatus(s.status, 'AGENDADO') || !isFutureOrToday(s.data))
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
      .slice(0, 10);
  }, [sessoesFiltradas]);

  return (
    <div className="space-y-4">
      {/* Cards de Estatisticas */}
      <SimuladoresCard className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            className={`rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md ${
              !filtroStatus ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200 bg-white'
            }`}
            onClick={() => setFiltroStatus('')}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Total</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </div>

          <div
            className={`rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md ${
              filtroStatus === 'AGENDADO'
                ? 'border-blue-500 ring-2 ring-blue-100'
                : 'border-blue-200 bg-blue-50'
            }`}
            onClick={() => setFiltroStatus(filtroStatus === 'AGENDADO' ? '' : 'AGENDADO')}
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-xs text-blue-600 font-medium">Agendadas</p>
                <p className="text-2xl font-bold text-blue-700">{stats.agendadas}</p>
              </div>
            </div>
          </div>

          <div
            className={`rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md ${
              filtroStatus === 'EM_ANDAMENTO'
                ? 'border-amber-500 ring-2 ring-amber-100'
                : 'border-amber-200 bg-amber-50'
            }`}
            onClick={() => setFiltroStatus(filtroStatus === 'EM_ANDAMENTO' ? '' : 'EM_ANDAMENTO')}
          >
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-amber-600" />
              <div>
                <p className="text-xs text-amber-600 font-medium">Em Andamento</p>
                <p className="text-2xl font-bold text-amber-700">{stats.emAndamento}</p>
              </div>
            </div>
          </div>

          <div
            className={`rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md ${
              filtroStatus === 'CONCLUIDO'
                ? 'border-emerald-500 ring-2 ring-emerald-100'
                : 'border-emerald-200 bg-emerald-50'
            }`}
            onClick={() => setFiltroStatus(filtroStatus === 'CONCLUIDO' ? '' : 'CONCLUIDO')}
          >
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-xs text-emerald-600 font-medium">Concluídas</p>
                <p className="text-2xl font-bold text-emerald-700">{stats.concluidas}</p>
              </div>
            </div>
          </div>
        </div>
      </SimuladoresCard>

      {/* Busca e Filtros */}
      <SimuladoresCard className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Busca */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por simulador, instrutor ou participante..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-transparent transition-all"
            />
          </div>

          {/* Botão Limpar */}
          {(filtroStatus || busca) && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setFiltroStatus('');
                  setBusca('');
                }}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      </SimuladoresCard>

      {/* Conteudo Principal */}
      <SimuladoresCard padding="none">
        {sessoesFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <Calendar className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {filtroStatus || busca ? 'Nenhuma sessão encontrada' : 'Nenhuma sessão agendada'}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {filtroStatus || busca
                ? 'Tente ajustar os filtros'
                : 'Crie uma nova sessão para começar'}
            </p>
            {!filtroStatus && !busca && !readOnly && (
              <button
                onClick={() => setModalNovaSessaoOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nova Sessão
              </button>
            )}
          </div>
        ) : (
          <div className="p-6 grid lg:grid-cols-2 gap-6">
            {/* Proximas Sessoes */}
            {proximasSessoes.length > 0 && !filtroStatus && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    Próximas Sessões
                  </h3>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">
                    {proximasSessoes.length} agendada{proximasSessoes.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-3">
                  {proximasSessoes.map((sessao) => (
                    <SessaoCard
                      key={sessao.id}
                      sessao={sessao}
                      onEdit={readOnly ? undefined : handleEditarSessao}
                      onDelete={readOnly ? undefined : handleDeletarSessao}
                      onVerFichas={(sessaoId) =>
                        navigate(`/simuladores?tab=fichas&sessao=${sessaoId}`)
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Sessoes Recentes */}
            <div
              className={`space-y-4 ${
                !proximasSessoes.length || filtroStatus ? 'lg:col-span-2' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  {filtroStatus ? (
                    <>
                      {filtroStatus === 'AGENDADO' && (
                        <Calendar className="w-5 h-5 text-blue-600" />
                      )}
                      {filtroStatus === 'EM_ANDAMENTO' && (
                        <Loader2 className="w-5 h-5 text-amber-600" />
                      )}
                      {filtroStatus === 'CONCLUIDO' && (
                        <Award className="w-5 h-5 text-emerald-600" />
                      )}
                      {filtroStatus === 'CANCELADO' && <X className="w-5 h-5 text-red-600" />}
                      Sessões {filtroStatus.replace('_', ' ').toLowerCase()}
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-5 h-5 text-gray-600" />
                      Histórico Recente
                    </>
                  )}
                </h3>
                <span className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full font-medium">
                  {filtroStatus ? sessoesFiltradas.length : sessoesRecentes.length} sessões
                </span>
              </div>
              <div
                className={`grid gap-3 ${
                  !proximasSessoes.length || filtroStatus ? 'md:grid-cols-2' : ''
                }`}
              >
                {(filtroStatus ? sessoesFiltradas : sessoesRecentes).map((sessao) => (
                  <SessaoCard
                    key={sessao.id}
                    sessao={sessao}
                    onEdit={readOnly ? undefined : handleEditarSessao}
                    onDelete={readOnly ? undefined : handleDeletarSessao}
                    onVerFichas={(sessaoId) =>
                      navigate(`/simuladores?tab=fichas&sessao=${sessaoId}`)
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </SimuladoresCard>

      {/* Modal Cadastrar Sessao - Fluxo em Cascata */}
      <ModalNovaSessao
        isOpen={modalNovaSessaoOpen}
        onClose={() => {
          setModalNovaSessaoOpen(false);
          setSessaoParaEditar(null);
        }}
        onSuccess={() => {
          setModalNovaSessaoOpen(false);
          setSessaoParaEditar(null);
          fetchSessoes();
          toast.success('Sessão criada/atualizada com sucesso!');
        }}
        sessao={sessaoParaEditar || undefined}
      />

      {/* Modal de Confirmação de Delete */}
      <ConfirmDeleteModal
        isOpen={!!showConfirmDelete}
        onClose={() => setShowConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        message="Tem certeza que deseja cancelar esta sessão?"
        itemName={showConfirmDelete?.nome || ''}
        loading={deletandoId !== null}
      />
    </div>
  );
}
