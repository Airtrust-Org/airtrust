/**
 * TabSessoesWrapper - Wrapper para Tab Sessoes com dados dinamicos
 * Padronizado com SimuladoresLayout
 */

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type ComponentProps,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { toast } from 'sonner';
import { SimuladoresCard } from '../components/SimuladoresLayout';
import SessaoCard, { type Sessao } from '@/react-app/components/simuladores/SessaoCard';
import ModalNovaSessao from '@/react-app/components/modals/ModalNovaSessao';
import { Calendar, Plus, BarChart3, Award, X, TrendingUp, Search, Loader2 } from 'lucide-react';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import ConfirmDeleteModal from '@/react-app/components/modals/ConfirmDeleteModal';
import { emitirEventoModulo } from '@/react-app/lib/moduloBus';
import {
  computeSessaoStats,
  filterAndSortSessoes,
  getLocalDateKey,
  getProximasSessoes,
  getSessoesRecentes,
} from './tabSessoesDerived';

type SessaoParaEditar = NonNullable<ComponentProps<typeof ModalNovaSessao>['sessao']>;

export default function TabSessoesWrapper() {
  const navigate = useNavigate();
  const { isAluno, isInstrutor } = usePermissions();
  const readOnly = isAluno || isInstrutor;
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [modalNovaSessaoOpen, setModalNovaSessaoOpen] = useState(false);
  const [sessaoParaEditar, setSessaoParaEditar] = useState<SessaoParaEditar | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ id: number; nome: string } | null>(
    null,
  );
  const [deletandoId, setDeletandoId] = useState<number | null>(null);
  const inFlightRef = useRef(false);

  const fetchSessoes = useCallback(async (showLoader = true) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      if (showLoader) setLoading(true);

      // Primeira carga menor: últimos 30 dias + próximos 90 dias.
      const hoje = new Date();
      const dataInicio = new Date(hoje);
      dataInicio.setDate(dataInicio.getDate() - 30);

      const dataFim = new Date(hoje);
      dataFim.setDate(dataFim.getDate() + 90);

      const params = new URLSearchParams({
        data_inicio: dataInicio.toISOString().split('T')[0],
        data_fim: dataFim.toISOString().split('T')[0],
        limit: '120',
      });

      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/simuladores/sessoes?${params}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (data.success) {
        setSessoes(data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar sessoes:', error);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessoes();
  }, [fetchSessoes]);

  const handleEditarSessao = (id: number) => {
    const sessao = sessoes.find((item) => item.id === id);
    if (!sessao) return;

    const templateId =
      'template_id' in sessao && typeof sessao.template_id === 'number'
        ? sessao.template_id
        : null;

    const sessaoEditavel: SessaoParaEditar = {
      id: sessao.id,
      modo_compartilhado: sessao.modo_compartilhado,
      template_id: templateId,
      simulador_id: sessao.simulador_id,
      simulador_nome: sessao.simulador_nome,
      simulador_modelo: sessao.simulador_modelo,
      data: sessao.data,
      horario_inicio: sessao.horario_inicio,
      horario_fim: sessao.horario_fim,
      instrutor_id: sessao.instrutor_id,
      instrutor_nome: sessao.instrutor_nome,
      examinador_id: sessao.examinador_id ?? null,
      tipo_sessao: sessao.tipo_sessao,
      tema_sessao: sessao.tema_sessao,
      observacoes: sessao.observacoes,
      participantes: sessao.participantes.map((participante) => ({
        funcionario_id: participante.funcionario_id,
        funcao: participante.funcao,
      })),
    };

    setSessaoParaEditar(sessaoEditavel);
    setModalNovaSessaoOpen(true);
  };

  const handleDeletarSessao = (id: number) => {
    const sessao = sessoes.find((item) => item.id === id);
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
        setSessoes((previous) => previous.filter((sessao) => sessao.id !== id));

        emitirEventoModulo({
          modulo: 'simuladores',
          tipo: 'SIMULADOR_ATUALIZADO',
          funcionarioIds: sessaoRemovida?.participantes?.map(
            (participante) => participante.funcionario_id,
          ),
        });

        toast.success('Sessão cancelada com sucesso!');
        setShowConfirmDelete(null);

        await fetchSessoes(false);
      } else {
        // Se falhou, reverter optimistic update (recarregar tudo)
        await fetchSessoes(false);
        toast.error(`Erro ao cancelar sessão: ${data.error}`);
      }
    } catch (error) {
      console.error('Erro ao deletar sessão:', error);
      toast.error('Erro ao cancelar sessão');
    } finally {
      setDeletandoId(null);
    }
  };

  const stats = useMemo(() => computeSessaoStats(sessoes), [sessoes]);
  const sessoesFiltradas = useMemo(
    () => filterAndSortSessoes(sessoes, filtroStatus, busca),
    [sessoes, filtroStatus, busca],
  );
  const todayKey = getLocalDateKey();
  const proximasSessoes = useMemo(
    () => getProximasSessoes(sessoesFiltradas, todayKey),
    [sessoesFiltradas, todayKey],
  );
  const sessoesRecentes = useMemo(
    () => getSessoesRecentes(sessoesFiltradas, todayKey),
    [sessoesFiltradas, todayKey],
  );

  return (
    <div className="space-y-4">
      {/* Cards de Estatisticas */}
      <SimuladoresCard className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            type="button"
            aria-pressed={!filtroStatus}
            className={`rounded-lg border p-4 cursor-pointer text-left transition-all hover:shadow-md ${
              !filtroStatus ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200 bg-white'
            }`}
            onClick={() => setFiltroStatus('')}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-gray-500" aria-hidden="true" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Total</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            aria-pressed={filtroStatus === 'AGENDADO'}
            className={`rounded-lg border p-4 cursor-pointer text-left transition-all hover:shadow-md ${
              filtroStatus === 'AGENDADO'
                ? 'border-blue-500 ring-2 ring-blue-100'
                : 'border-blue-200 bg-blue-50'
            }`}
            onClick={() => setFiltroStatus(filtroStatus === 'AGENDADO' ? '' : 'AGENDADO')}
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" aria-hidden="true" />
              <div>
                <p className="text-xs text-blue-600 font-medium">Agendadas</p>
                <p className="text-2xl font-bold text-blue-700">{stats.agendadas}</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            aria-pressed={filtroStatus === 'EM_ANDAMENTO'}
            className={`rounded-lg border p-4 cursor-pointer text-left transition-all hover:shadow-md ${
              filtroStatus === 'EM_ANDAMENTO'
                ? 'border-amber-500 ring-2 ring-amber-100'
                : 'border-amber-200 bg-amber-50'
            }`}
            onClick={() => setFiltroStatus(filtroStatus === 'EM_ANDAMENTO' ? '' : 'EM_ANDAMENTO')}
          >
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-amber-600" aria-hidden="true" />
              <div>
                <p className="text-xs text-amber-600 font-medium">Em Andamento</p>
                <p className="text-2xl font-bold text-amber-700">{stats.emAndamento}</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            aria-pressed={filtroStatus === 'CONCLUIDO'}
            className={`rounded-lg border p-4 cursor-pointer text-left transition-all hover:shadow-md ${
              filtroStatus === 'CONCLUIDO'
                ? 'border-emerald-500 ring-2 ring-emerald-100'
                : 'border-emerald-200 bg-emerald-50'
            }`}
            onClick={() => setFiltroStatus(filtroStatus === 'CONCLUIDO' ? '' : 'CONCLUIDO')}
          >
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-600" aria-hidden="true" />
              <div>
                <p className="text-xs text-emerald-600 font-medium">Concluídas</p>
                <p className="text-2xl font-bold text-emerald-700">{stats.concluidas}</p>
              </div>
            </div>
          </button>
        </div>
      </SimuladoresCard>

      {/* Busca e Filtros */}
      <SimuladoresCard className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Busca */}
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label="Buscar sessões"
              placeholder="Buscar por simulador, instrutor ou participante..."
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-transparent transition-all"
            />
          </div>

          {/* Botão Limpar */}
          {(filtroStatus || busca) && (
            <div className="flex items-center gap-3">
              <button
                type="button"
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
            <Calendar className="w-16 h-16 text-gray-300 mb-4" aria-hidden="true" />
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
                type="button"
                onClick={() => setModalNovaSessaoOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
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
                    <Calendar className="w-5 h-5 text-blue-600" aria-hidden="true" />
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
                        <Calendar className="w-5 h-5 text-blue-600" aria-hidden="true" />
                      )}
                      {filtroStatus === 'EM_ANDAMENTO' && (
                        <Loader2 className="w-5 h-5 text-amber-600" aria-hidden="true" />
                      )}
                      {filtroStatus === 'CONCLUIDO' && (
                        <Award className="w-5 h-5 text-emerald-600" aria-hidden="true" />
                      )}
                      {filtroStatus === 'CANCELADO' && (
                        <X className="w-5 h-5 text-red-600" aria-hidden="true" />
                      )}
                      Sessões {filtroStatus.replace('_', ' ').toLowerCase()}
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-5 h-5 text-gray-600" aria-hidden="true" />
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
          void fetchSessoes(false);
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
