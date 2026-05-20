import { useEffect, useState } from 'react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  User,
  FileText,
  History,
  Zap,
  CalendarDays,
  Link2,
  Plus,
  Trash2,
  BarChart3,
  Shield,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { toast } from 'sonner';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import AbaDadosPessoais from './AbaDadosPessoais';
import AbaDocumentos from './AbaDocumentos';
import AbaHistorico from './AbaHistorico';
import AbaAcoesRapidas from './AbaAcoesRapidas';
import AbaTreinamentos from './AbaTreinamentos';
import {
  useFuncionarioFeriasQuery,
  useRegistrarFuncionarioFeriasMutation,
  useRemoverFuncionarioFeriasMutation,
} from '../escalas/hooks/queries/useEscalasQuery';

// ─────────────────────────────────────────────────────────────────────────────
// INT-02: Widget de Escalas no Perfil do Funcionário
// ─────────────────────────────────────────────────────────────────────────────

const EVENTO_CORES: Record<string, { bg: string; text: string; label: string }> = {
  voo: { bg: '#E0F2FE', text: '#0369A1', label: 'Voo' },
  ferias: { bg: '#D1FAE5', text: '#065F46', label: 'Férias' },
  folga: { bg: '#DCFCE7', text: '#15803D', label: 'Folga' },
  medico: { bg: '#FEE2E2', text: '#B91C1C', label: 'Médico' },
  cheque: { bg: '#FEF9C3', text: '#92400E', label: 'Cheque' },
  licenca: { bg: '#F1F5F9', text: '#475569', label: 'Licença' },
  treinamento_simulador: { bg: '#EDE9FE', text: '#6D28D9', label: 'Simulador' },
  treinamento_solo: { bg: '#FFEDD5', text: '#C2410C', label: 'Trein.Solo' },
  standby: { bg: '#FEF3C7', text: '#B45309', label: 'Standby' },
  viagem: { bg: '#EDE9FE', text: '#4C1D95', label: 'Viagem' },
  trabalho: { bg: '#F1F5F9', text: '#374151', label: 'Trabalho' },
  reaquisi: { bg: '#CCFBF1', text: '#0F766E', label: 'Reaquisição' },
};

const SITUACAO_LABELS: Record<string, string> = {
  FERIAS: 'Férias',
  SIM: 'Simulador',
  CURSO: 'Curso',
  MED: 'Médico',
  AFT: 'Afastamento',
  STB: 'Standby',
};

const ABAS_PERFIL_FUNCIONARIO = [
  'dados',
  'documentos',
  'historico',
  'treinamentos',
  'acoes',
  'escalas',
] as const;

function normalizarAbaPerfil(tab: string | null) {
  return ABAS_PERFIL_FUNCIONARIO.includes(tab as (typeof ABAS_PERFIL_FUNCIONARIO)[number])
    ? tab
    : 'dados';
}

function AbaFeriasAfastamentos({
  funcionarioId,
  abrirFormularioInicial = false,
}: {
  funcionarioId: string;
  abrirFormularioInicial?: boolean;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [tipo, setTipo] = useState('FERIAS');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const { data, isLoading } = useFuncionarioFeriasQuery(funcionarioId);
  const registrarFerias = useRegistrarFuncionarioFeriasMutation(funcionarioId);
  const removerFerias = useRemoverFuncionarioFeriasMutation(funcionarioId);

  useEffect(() => {
    if (abrirFormularioInicial) {
      setMostrarForm(true);
    }
  }, [abrirFormularioInicial]);

  const itens = data || [];

  async function handleSalvar() {
    if (!dataInicio || !dataFim) {
      toast.error('Preencha o período');
      return;
    }
    if (dataFim < dataInicio) {
      toast.error('Data fim deve ser maior ou igual à data início');
      return;
    }
    try {
      await registrarFerias.mutateAsync({
        tipo,
        data_inicio: dataInicio,
        data_fim: dataFim,
        observacoes: observacoes || null,
      });
      toast.success('Período registrado');
      setMostrarForm(false);
      setTipo('FERIAS');
      setDataInicio('');
      setDataFim('');
      setObservacoes('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar período');
    }
  }

  async function handleRemover(itemId: string, label: string) {
    const confirmou = await confirmDialog(
      `Deseja remover ${label.toLowerCase()} deste tripulante?`,
    );
    if (!confirmou) return;

    try {
      await removerFerias.mutateAsync(itemId);
      toast.success(`${label} removido com sucesso`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Erro ao remover ${label.toLowerCase()}`,
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Férias e Afastamentos</h3>
            <p className="text-xs text-gray-500 mt-1">
              Situações sincronizadas com escalas e registros lançados diretamente pelo RH.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMostrarForm((value) => !value)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
            Novo período
          </button>
        </div>

        {mostrarForm && (
          <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tipo
              </label>
              <select
                value={tipo}
                onChange={(event) => setTipo(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {Object.entries(SITUACAO_LABELS).map(([codigo, label]) => (
                  <option key={codigo} value={codigo}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Início
                </label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(event) => setDataInicio(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Fim
                </label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(event) => setDataFim(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Observações
              </label>
              <textarea
                rows={3}
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMostrarForm(false)}
                className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSalvar()}
                disabled={registrarFerias.isPending}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {registrarFerias.isPending ? 'Salvando...' : 'Salvar período'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        {isLoading ? (
          <p className="text-sm text-gray-400">Carregando períodos...</p>
        ) : itens.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">Nenhum período registrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {itens.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        {SITUACAO_LABELS[item.tipo] || item.tipo}
                      </span>
                      {item.origem === 'escala' && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                          Sincronizado da escala
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      {new Date(`${item.data_inicio}T12:00:00`).toLocaleDateString('pt-BR')} até{' '}
                      {new Date(`${item.data_fim}T12:00:00`).toLocaleDateString('pt-BR')}
                    </p>
                    {item.observacoes && (
                      <p className="mt-1 text-sm text-slate-500">{item.observacoes}</p>
                    )}
                    {item.origem !== 'escala' && (
                      <p className="mt-1 text-xs text-slate-500">
                        Ao excluir este período, o tripulante volta a ficar disponível nas escalas
                        afetadas.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {item.escala_id && (
                      <button
                        type="button"
                        onClick={() => navigate('/escalas')}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        {item.escala_titulo || `Escala ${item.escala_mes}/${item.escala_ano}`}
                      </button>
                    )}
                    {item.origem !== 'escala' && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleRemover(item.id, SITUACAO_LABELS[item.tipo] || item.tipo)
                        }
                        disabled={removerFerias.isPending}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir período
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AbaEscalasFuncionario({ funcionarioId, nome }: { funcionarioId: string; nome: string }) {
  const [escalas, setEscalas] = useState<any[]>([]);
  const [eventos, setEventos] = useState<any[]>([]);
  const [loadingEscalas, setLoadingEscalas] = useState(true);
  const [loadingEventos, setLoadingEventos] = useState(false);
  const [escalaSelId, setEscalaSelId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = getAccessToken();
    fetch(`${API_BASE_URL}/escalas?limit=12`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        const lista: any[] = d?.data?.escalas ?? d?.escalas ?? d?.data ?? [];
        setEscalas(lista);
        // Seleciona a escala do mês atual por padrão
        const now = new Date();
        const auto = lista.find(
          (e: any) => e.mes === now.getMonth() + 1 && e.ano === now.getFullYear(),
        );
        if (auto) setEscalaSelId(auto.id);
        else if (lista[0]) setEscalaSelId(lista[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingEscalas(false));
  }, []);

  useEffect(() => {
    if (!escalaSelId) return;
    setLoadingEventos(true);
    const token = getAccessToken();
    fetch(`${API_BASE_URL}/escalas/${escalaSelId}/calendario`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        const evs: any[] = d?.data?.eventos ?? d?.eventos ?? [];
        setEventos(evs.filter((e: any) => e.funcionario_id === funcionarioId));
      })
      .catch(() => setEventos([]))
      .finally(() => setLoadingEventos(false));
  }, [escalaSelId, funcionarioId]);

  const escalaAtual = escalas.find((e) => e.id === escalaSelId);
  const MESES_NOMES = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ];

  const diasVoo = eventos.filter((e) => e.tipo_evento === 'voo').length;
  const tiposContados = eventos.reduce<Record<string, number>>((acc, e) => {
    acc[e.tipo_evento] = (acc[e.tipo_evento] ?? 0) + 1;
    return acc;
  }, {});

  const eventosPorDia = [...eventos].sort((a, b) =>
    (a.data_inicio ?? '').localeCompare(b.data_inicio ?? ''),
  );

  return (
    <div className="space-y-4">
      <AbaFeriasAfastamentos funcionarioId={funcionarioId} />

      {/* Seletor de escala */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-600" />
          Escalas de {nome}
        </h3>
        {loadingEscalas ? (
          <p className="text-sm text-gray-400">Carregando escalas...</p>
        ) : escalas.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma escala encontrada.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {escalas.map((e) => (
              <button
                key={e.id}
                onClick={() => setEscalaSelId(e.id)}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  escalaSelId === e.id
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
                ].join(' ')}
              >
                {MESES_NOMES[(e.mes ?? 1) - 1]}/{e.ano}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Resumo da escala selecionada */}
      {escalaAtual && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">
              {MESES_NOMES[(escalaAtual.mes ?? 1) - 1]} {escalaAtual.ano}{' '}
              <span className="ml-2 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                {escalaAtual.status ?? '—'}
              </span>
            </h4>
            <button
              onClick={() => navigate('/escalas')}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              Ver grade completa
              <CalendarDays className="w-3 h-3" />
            </button>
          </div>

          {loadingEventos ? (
            <p className="text-sm text-gray-400">Carregando eventos...</p>
          ) : eventos.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-gray-400">Sem eventos nesta escala</p>
              <p className="text-xs text-gray-300 mt-1">
                Este funcionário pode não estar escalado neste mês
              </p>
            </div>
          ) : (
            <>
              {/* Resumo tipos */}
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100">
                  <span className="text-lg">✈</span>
                  <span className="text-sm font-bold text-blue-700">{diasVoo}</span>
                  <span className="text-xs text-blue-500">dias voo</span>
                </div>
                {Object.entries(tiposContados)
                  .filter(([t]) => t !== 'voo')
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([tipo, qtd]) => {
                    const conf = EVENTO_CORES[tipo] ?? {
                      bg: '#F1F5F9',
                      text: '#475569',
                      label: tipo,
                    };
                    return (
                      <div
                        key={tipo}
                        style={{ backgroundColor: conf.bg, borderColor: conf.bg, color: conf.text }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium"
                      >
                        <span className="font-bold">{qtd}</span>
                        <span>{conf.label}</span>
                      </div>
                    );
                  })}
              </div>

              {/* Lista de eventos */}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {eventosPorDia.map((ev) => {
                  const conf = EVENTO_CORES[ev.tipo_evento] ?? {
                    bg: '#F1F5F9',
                    text: '#475569',
                    label: ev.tipo_evento,
                  };
                  const data = ev.data_inicio?.slice(0, 10) ?? '';
                  const dataFmt = data
                    ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                      })
                    : '—';
                  return (
                    <div
                      key={ev.id}
                      className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-xs text-gray-400 w-16 flex-shrink-0">{dataFmt}</span>
                      <span
                        style={{ backgroundColor: conf.bg, color: conf.text }}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold flex-shrink-0"
                      >
                        {conf.label}
                      </span>
                      {ev.observacoes && (
                        <span className="text-xs text-gray-500 truncate">{ev.observacoes}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function PerfilFuncionario() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [funcionario, setFuncionario] = useState<any>(null);
  const [abaAtiva, setAbaAtiva] = useState(normalizarAbaPerfil(searchParams.get('tab')));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tab = normalizarAbaPerfil(searchParams.get('tab'));
    setAbaAtiva(tab);
  }, [searchParams]);

  useEffect(() => {
    carregarFuncionario();
  }, [id]);

  const carregarFuncionario = async () => {
    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/funcionarios/${id}`, {
        cache: 'no-cache',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (response.ok) {
        const data = await response.json();
        setFuncionario(data?.data ?? data);
      }
    } catch (error) {
      console.error('Erro ao carregar funcionário:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-slate-500">Carregando...</div>
      </AppLayout>
    );
  }

  if (!funcionario) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-slate-500">
          Funcionário não encontrado
        </div>
      </AppLayout>
    );
  }

  const abas = [
    { id: 'dados', label: 'Dados Pessoais', icone: User },
    { id: 'documentos', label: 'Documentos', icone: FileText },
    { id: 'historico', label: 'Histórico', icone: History },
    { id: 'treinamentos', label: 'Treinamentos', icone: BookOpen },
    { id: 'acoes', label: 'Ações Rápidas', icone: Zap },
    { id: 'escalas', label: 'Escalas', icone: CalendarDays },
  ];

  const handleChangeAba = (abaId: string) => {
    setAbaAtiva(abaId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', abaId);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <AppLayout>
    <div>
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg mb-6">
        <div className=" py-4">
          <button
            onClick={() => navigate('/funcionarios')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Voltar para lista
          </button>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
                {funcionario.nome
                  ?.split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .substring(0, 2)}
              </div>

              {/* Info Básica */}
              <div>
                <h1 className="text-xl font-bold text-gray-900">{funcionario.nome}</h1>
                <p className="text-gray-600">{funcionario.funcao_nome || funcionario.funcao}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                  <span>📋 {funcionario.matricula}</span>
                  {funcionario.setor_nome && <span>🏢 {funcionario.setor_nome}</span>}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-xl font-bold text-primary">
                  {funcionario.stats?.total_documentos || 0}
                </p>
                <p className="text-xs text-gray-600">Documentos</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-green-600">
                  {funcionario.stats?.total_certificacoes || 0}
                </p>
                <p className="text-xs text-gray-600">Certificações</p>
              </div>
            </div>
          </div>
        </div>

        {/* Abas */}
        <div className="w-full ">
          <div className="flex gap-1 border-b">
            {abas.map((aba) => {
              const Icone = aba.icone;
              return (
                <button
                  key={aba.id}
                  onClick={() => handleChangeAba(aba.id)}
                  className={`flex items-center gap-2 px-6 py-3 font-medium transition ${
                    abaAtiva === aba.id
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icone className="w-5 h-5" />
                  {aba.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Visão Operacional */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Visão Operacional
        </p>
        <p className="mb-3 text-xs text-slate-400">
          Ponto de partida para consultar dados operacionais deste colaborador.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/funcionarios/${id}/ficha`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <FileText className="h-4 w-4 text-blue-500" />
            Ficha Completa
          </Link>
          <Link
            to={`/funcionarios/${id}/ficha?tab=qualificacoes`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <BookOpen className="h-4 w-4 text-emerald-500" />
            Qualificações
          </Link>
          <Link
            to={`/simuladores/desempenho/${id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <BarChart3 className="h-4 w-4 text-violet-500" />
            Desempenho Simulador
          </Link>
          <Link
            to={`/frms/tripulante/${id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Shield className="h-4 w-4 text-amber-500" />
            FRMS / Fadiga
          </Link>
        </div>
      </div>

      {/* Conteúdo das Abas */}
      <div className="w-full  py-6">
        {abaAtiva === 'dados' && <AbaDadosPessoais funcionario={funcionario} />}
        {abaAtiva === 'documentos' && <AbaDocumentos funcionarioId={funcionario.id} />}
        {abaAtiva === 'historico' && <AbaHistorico funcionarioId={funcionario.id} />}
        {abaAtiva === 'treinamentos' && (
          <AbaTreinamentos
            treinamentos={funcionario.treinamentos ?? []}
            funcionarioId={funcionario.id}
          />
        )}
        {abaAtiva === 'acoes' && <AbaAcoesRapidas funcionario={funcionario} />}
        {abaAtiva === 'escalas' && (
          <AbaEscalasFuncionario funcionarioId={funcionario.id} nome={funcionario.nome} />
        )}
      </div>
    </div>
    </AppLayout>
  );
}
