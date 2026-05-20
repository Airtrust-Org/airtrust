import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';
import { SEM_AERONAVE_VALUE } from '../../alocacao-operacional-constants';
import {
  fmtDateShort,
  getQuinzenaBadgeClasses,
  getQuinzenaShortLabel,
} from '../../quinzena-tokens';
import {
  useAdicionarSituacaoMutation,
  useRemoverSituacaoMutation,
  useAtualizarSituacaoMutation,
  useSituacaoTiposQuery,
  useTripulantesOperacionaisQuery,
  type EscalaAlocacao,
  type QuinzenaEscala,
  type SituacaoTipo,
} from '../../hooks/queries/useEscalasQuery';

const TIPOS_SITUACAO_PADRAO: SituacaoTipo[] = [
  {
    id: 1,
    codigo: 'FERIAS',
    nome: 'Férias',
    cor: '#0F766E',
    icone: '🏖️',
    bloqueia_alocacao: 1,
    ativo: 1,
    ordem: 1,
  },
  {
    id: 2,
    codigo: 'SIM',
    nome: 'Simulador',
    cor: '#2563EB',
    icone: '🛫',
    bloqueia_alocacao: 1,
    ativo: 1,
    ordem: 2,
  },
  {
    id: 3,
    codigo: 'CURSO',
    nome: 'Curso',
    cor: '#7C3AED',
    icone: '🎓',
    bloqueia_alocacao: 1,
    ativo: 1,
    ordem: 3,
  },
  {
    id: 4,
    codigo: 'MED',
    nome: 'Médico',
    cor: '#DC2626',
    icone: '🩺',
    bloqueia_alocacao: 1,
    ativo: 1,
    ordem: 4,
  },
  {
    id: 5,
    codigo: 'AFT',
    nome: 'Afastamento',
    cor: '#EA580C',
    icone: '📝',
    bloqueia_alocacao: 1,
    ativo: 1,
    ordem: 5,
  },
  {
    id: 6,
    codigo: 'STB',
    nome: 'Standby',
    cor: '#475569',
    icone: '⏳',
    bloqueia_alocacao: 0,
    ativo: 1,
    ordem: 6,
  },
];

type SituacaoTipoCodigo = 'FERIAS' | 'SIM' | 'CURSO' | 'MED' | 'AFT' | 'STB';

interface Props {
  escalaId: string;
  mes: number;
  ano: number;
  quinzenas: QuinzenaEscala[];
  situacaoInicial?: EscalaAlocacao | null;
  modoFluxoB?: boolean;
  funcionarioInicialId?: string | null;
  quinzenaInicial?: number;
  dataInicioInicial?: string;
  dataFimInicial?: string;
  fluxo?: 'geral' | 'ferias-afastamento';
  tiposPermitidos?: SituacaoTipoCodigo[];
  situacaoTipoInicial?: SituacaoTipoCodigo;
  onSaved?: () => void | Promise<void>;
  onClose: () => void;
}

function formatarEscala(mes: number, ano: number) {
  return `Escala ${mes}/${ano}`;
}

function getNumeroQuinzenaFixa(quinzena: string | null | undefined): 1 | 2 | null {
  const normalized = String(quinzena || '')
    .trim()
    .toLowerCase();

  if (['primeira', '1', '1q', '1a', '1ª', 'primeira quinzena'].includes(normalized)) return 1;
  if (['segunda', '2', '2q', '2a', '2ª', 'segunda quinzena'].includes(normalized)) return 2;
  return null;
}

export default function ModalNovaSituacao({
  escalaId,
  mes,
  ano,
  quinzenas,
  situacaoInicial,
  modoFluxoB = false,
  funcionarioInicialId,
  quinzenaInicial,
  dataInicioInicial,
  dataFimInicial,
  fluxo = 'geral',
  tiposPermitidos,
  situacaoTipoInicial,
  onSaved,
  onClose,
}: Props) {
  const possuiTripulanteFixado = Boolean(situacaoInicial?.funcionario_id || funcionarioInicialId);
  const quinzenasMes = useMemo(
    () =>
      [...quinzenas]
        .filter((item) => item.mes === mes && item.ano === ano)
        .sort((a, b) => a.numero - b.numero),
    [ano, mes, quinzenas],
  );

  const [situacaoTipo, setSituacaoTipo] = useState<string>(
    situacaoInicial?.situacao_tipo || situacaoTipoInicial || '',
  );
  const [dataInicio, setDataInicio] = useState(
    situacaoInicial?.data_inicio || dataInicioInicial || '',
  );
  const [dataFim, setDataFim] = useState(situacaoInicial?.data_fim || dataFimInicial || '');
  const [dataFimAuto, setDataFimAuto] = useState(false);
  const [funcionarioId, setFuncionarioId] = useState(
    situacaoInicial?.funcionario_id || funcionarioInicialId || '',
  );
  const [observacoes, setObservacoes] = useState(situacaoInicial?.observacoes || '');
  const [busca, setBusca] = useState('');
  const [mostrarSeletorTripulante, setMostrarSeletorTripulante] = useState(!possuiTripulanteFixado);

  const { data: tiposSituacao, isLoading: carregandoTipos } = useSituacaoTiposQuery();
  const adicionarSituacao = useAdicionarSituacaoMutation(escalaId);
  const atualizarSituacao = useAtualizarSituacaoMutation(escalaId);
  const removerSituacao = useRemoverSituacaoMutation(escalaId);

  useEffect(() => {
    if (situacaoInicial?.id) return;
    if (funcionarioInicialId) setFuncionarioId(funcionarioInicialId);
    if (dataInicioInicial) setDataInicio(dataInicioInicial);
    if (dataFimInicial) setDataFim(dataFimInicial);
    if (quinzenaInicial) {
      const q = quinzenasMes.find((item) => item.id === quinzenaInicial);
      if (q && !dataInicioInicial && !dataFimInicial) {
        setDataInicio(q.data_inicio);
        setDataFim(q.data_fim);
      }
    }
  }, [
    modoFluxoB,
    funcionarioInicialId,
    dataInicioInicial,
    dataFimInicial,
    quinzenaInicial,
    quinzenasMes,
    situacaoInicial?.id,
  ]);

  useEffect(() => {
    setMostrarSeletorTripulante(!possuiTripulanteFixado);
  }, [possuiTripulanteFixado, situacaoInicial?.id]);

  const quinzenaSelecionada = useMemo(() => {
    if (dataInicio && dataFim) {
      return (
        quinzenasMes.find((item) => !(dataFim < item.data_inicio || dataInicio > item.data_fim)) ||
        null
      );
    }
    if (situacaoInicial?.quinzena_id) {
      return quinzenasMes.find((item) => item.id === situacaoInicial.quinzena_id) || null;
    }
    if (quinzenaInicial) {
      return quinzenasMes.find((item) => item.id === quinzenaInicial) || null;
    }
    return null;
  }, [dataFim, dataInicio, quinzenaInicial, quinzenasMes, situacaoInicial?.quinzena_id]);

  useEffect(() => {
    if (situacaoTipo !== 'FERIAS' || !dataInicio) return;
    if (dataFim && !dataFimAuto) return;

    const data = new Date(`${dataInicio}T00:00:00`);
    data.setDate(data.getDate() + 30);
    setDataFim(data.toISOString().slice(0, 10));
    setDataFimAuto(true);
  }, [dataFim, dataFimAuto, dataInicio, situacaoTipo]);

  const { data: tripulantesResponse, isLoading: carregandoTripulantes } =
    useTripulantesOperacionaisQuery(
      SEM_AERONAVE_VALUE,
      escalaId,
      true,
      null,
      dataInicio || null,
      dataFim || null,
      null,
    );

  const tripulantes = useMemo(() => {
    const listaBase = tripulantesResponse?.tripulantes || [];
    if (
      situacaoInicial?.funcionario_id &&
      !listaBase.some((item) => item.funcionario_id === situacaoInicial.funcionario_id)
    ) {
      return [
        {
          funcionario_id: situacaoInicial.funcionario_id,
          nome:
            situacaoInicial.funcionario_nome || situacaoInicial.funcionario?.nome || 'Tripulante',
          nome_guerra:
            situacaoInicial.funcionario_guerra || situacaoInicial.funcionario?.nome_guerra || null,
          matricula:
            situacaoInicial.funcionario_matricula || situacaoInicial.funcionario?.matricula || '',
          empresa_id: 0,
          role:
            situacaoInicial.funcionario_role || situacaoInicial.funcionario?.role || 'Tripulante',
          cma_valido: true,
          cma_dias_restantes: null,
          cma_validade_fim: null,
          frms_score: null,
          frms_status: 'ok' as const,
          frms_avaliacao_data: null,
          simuladores_pendentes: 0,
          proximo_simulador_data: null,
          habilitacoes: [],
          status_operacional: 'APTO' as const,
          pode_ser_alocado: true,
          motivo_bloqueio: null,
          quinzena: null,
        },
        ...listaBase,
      ];
    }
    return listaBase;
  }, [situacaoInicial, tripulantesResponse?.tripulantes]);

  const tiposFiltrados = useMemo(() => {
    const tiposBase =
      tiposSituacao && tiposSituacao.length > 0 ? tiposSituacao : TIPOS_SITUACAO_PADRAO;

    if (!tiposPermitidos || tiposPermitidos.length === 0) {
      return tiposBase;
    }

    return tiposBase.filter((tipo) => tiposPermitidos.includes(tipo.codigo as SituacaoTipoCodigo));
  }, [tiposPermitidos, tiposSituacao]);

  useEffect(() => {
    if (situacaoInicial?.id || tiposFiltrados.length === 0) return;

    const tipoAtualValido = tiposFiltrados.some((tipo) => tipo.codigo === situacaoTipo);
    if (tipoAtualValido) return;

    const tipoPreferencial =
      situacaoTipoInicial && tiposFiltrados.some((tipo) => tipo.codigo === situacaoTipoInicial)
        ? situacaoTipoInicial
        : tiposFiltrados[0]?.codigo;

    if (tipoPreferencial) {
      setSituacaoTipo(tipoPreferencial);
    }
  }, [situacaoInicial?.id, situacaoTipo, situacaoTipoInicial, tiposFiltrados]);
  const tripulantesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return tripulantes.filter((item) => {
      if (!termo) return true;
      return [item.nome, item.nome_guerra || '', item.matricula]
        .join(' ')
        .toLowerCase()
        .includes(termo);
    });
  }, [busca, tripulantes]);

  const tripulanteFluxoB = useMemo(
    () =>
      modoFluxoB && funcionarioId
        ? (tripulantes.find((item) => item.funcionario_id === funcionarioId) ?? null)
        : null,
    [modoFluxoB, funcionarioId, tripulantes],
  );

  const tripulanteSelecionado = useMemo(
    () => tripulantes.find((item) => item.funcionario_id === funcionarioId) ?? null,
    [funcionarioId, tripulantes],
  );

  const tripulanteEmFoco = tripulanteSelecionado || tripulanteFluxoB;

  const quinzenaFixaTripulante = useMemo(() => {
    const numeroQuinzena = getNumeroQuinzenaFixa(tripulanteSelecionado?.quinzena);
    if (!numeroQuinzena) return null;
    return quinzenasMes.find((item) => item.numero === numeroQuinzena) || null;
  }, [quinzenasMes, tripulanteSelecionado?.quinzena]);

  useEffect(() => {
    if (situacaoInicial?.id) return;
    if (dataInicio || dataFim) return;
    if (dataInicioInicial || dataFimInicial) return;
    if (!quinzenaFixaTripulante) return;

    setDataInicio(quinzenaFixaTripulante.data_inicio);
    setDataFim(quinzenaFixaTripulante.data_fim);
  }, [
    dataFim,
    dataFimInicial,
    dataInicio,
    dataInicioInicial,
    quinzenaFixaTripulante,
    situacaoInicial?.id,
  ]);

  useEffect(() => {
    if (situacaoTipo !== 'STB' || !quinzenaFixaTripulante) return;

    const inicioFixo = quinzenaFixaTripulante.data_inicio;
    const fimFixo = quinzenaFixaTripulante.data_fim;
    const inicioInvalido = !dataInicio || dataInicio < inicioFixo || dataInicio > fimFixo;
    const fimInvalido = !dataFim || dataFim < inicioFixo || dataFim > fimFixo;

    if (!inicioInvalido && !fimInvalido) return;

    setDataInicio(inicioFixo);
    setDataFim(fimFixo);
    setDataFimAuto(false);
  }, [dataFim, dataInicio, quinzenaFixaTripulante, situacaoTipo]);

  const standbyRestrito = situacaoTipo === 'STB';
  const ajudaPeriodo = standbyRestrito
    ? quinzenaFixaTripulante
      ? `Standby s/ Aeronave fica restrito à ${getQuinzenaShortLabel(quinzenaFixaTripulante.numero) || 'quinzena fixa'} do tripulante.`
      : 'Defina a quinzena do tripulante para registrar Standby s/ Aeronave.'
    : quinzenaFixaTripulante
      ? 'A quinzena do tripulante serve só como sugestão inicial. Ajuste livremente as datas reais do evento.'
      : 'Selecione as datas reais do evento. A quinzena não fecha o lançamento.';

  const tipoSelecionado = tiposFiltrados.find((item) => item.codigo === situacaoTipo);
  const tituloModal =
    fluxo === 'ferias-afastamento'
      ? situacaoInicial?.id
        ? 'Editar Férias / Afastamento'
        : 'Registrar Férias / Afastamento'
      : situacaoInicial?.id
        ? 'Editar Situação'
        : modoFluxoB
          ? '📋 Registrar Situação'
          : 'Registrar Situação';
  const submitLabel =
    fluxo === 'ferias-afastamento'
      ? situacaoInicial?.id
        ? 'Salvar período'
        : 'Registrar período'
      : situacaoInicial?.id
        ? 'Salvar Situação'
        : 'Confirmar Situação';

  async function handleSubmit() {
    if (!situacaoTipo) {
      toast.error('Selecione o tipo de situação');
      return;
    }
    if (!dataInicio || !dataFim) {
      toast.error('Preencha o período');
      return;
    }
    if (dataFim < dataInicio) {
      toast.error('Data fim deve ser maior ou igual à data início');
      return;
    }
    if (standbyRestrito && !quinzenaFixaTripulante) {
      toast.error('Defina a quinzena do tripulante para registrar Standby s/ Aeronave');
      return;
    }
    if (
      standbyRestrito &&
      quinzenaFixaTripulante &&
      (dataInicio < quinzenaFixaTripulante.data_inicio || dataFim > quinzenaFixaTripulante.data_fim)
    ) {
      toast.error('Standby s/ Aeronave deve ficar dentro da quinzena de trabalho do tripulante');
      return;
    }
    if (!funcionarioId) {
      toast.error('Selecione um funcionário');
      return;
    }

    try {
      const quinzenaIdPayload = standbyRestrito
        ? quinzenaFixaTripulante?.id ||
          quinzenaSelecionada?.id ||
          situacaoInicial?.quinzena_id ||
          null
        : quinzenaSelecionada?.id || situacaoInicial?.quinzena_id || null;

      const payload = {
        funcionario_id: funcionarioId,
        situacao_tipo: situacaoTipo as 'FERIAS' | 'SIM' | 'CURSO' | 'MED' | 'AFT' | 'STB',
        quinzena_id: quinzenaIdPayload,
        data_inicio: dataInicio,
        data_fim: dataFim,
        observacoes: observacoes || null,
      };

      if (situacaoInicial?.id) {
        await atualizarSituacao.mutateAsync({ situacaoId: situacaoInicial.id, body: payload });
      } else {
        await adicionarSituacao.mutateAsync(payload);
      }

      await onSaved?.();

      const funcionario = tripulantes.find((item) => item.funcionario_id === funcionarioId);
      toast.success(
        `${tipoSelecionado?.nome || 'Situação'} ${situacaoInicial?.id ? 'atualizada' : 'registrada'} para ${
          funcionario?.nome_guerra || funcionario?.nome || 'tripulante'
        }`,
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar situação');
    }
  }

  async function handleRemover() {
    if (!situacaoInicial?.id) return;
    if (!window.confirm('Remover esta situação da escala?')) return;

    try {
      await removerSituacao.mutateAsync(situacaoInicial.id);
      await onSaved?.();
      toast.success('Situação removida');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover situação');
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={tituloModal}
      size="4xl"
      footer={
        <>
          {situacaoInicial?.id && (
            <Button variant="danger" onClick={handleRemover} isLoading={removerSituacao.isPending}>
              Excluir
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={
              adicionarSituacao.isPending ||
              atualizarSituacao.isPending ||
              removerSituacao.isPending
            }
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-col gap-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">{formatarEscala(mes, ano)}</p>
          {fluxo === 'ferias-afastamento' && (
            <p className="mt-1 text-xs text-slate-500">
              Este lançamento bloqueia o tripulante na escala e mantém o período sincronizado com a
              indisponibilidade operacional.
            </p>
          )}
          {situacaoInicial?.id && (
            <p className="mt-1 text-xs text-slate-500">
              Para cancelar férias, afastamento ou outro evento já lançado, abra a situação e use
              Excluir.
            </p>
          )}
        </div>

        <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(300px,0.95fr)_minmax(0,1.05fr)]">
          <div className="flex min-h-0 flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {fluxo === 'ferias-afastamento' ? 'Tipo de período' : 'Tipo de Situação'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {carregandoTipos && (!tiposSituacao || tiposSituacao.length === 0) && (
                  <div className="col-span-2 text-sm text-slate-400">Carregando tipos...</div>
                )}
                {!carregandoTipos && (!tiposSituacao || tiposSituacao.length === 0) && (
                  <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Tipos padrão carregados localmente.
                  </div>
                )}
                {tiposFiltrados.map((tipo) => {
                  const ativo = situacaoTipo === tipo.codigo;
                  return (
                    <button
                      key={tipo.codigo}
                      type="button"
                      onClick={() => setSituacaoTipo(tipo.codigo)}
                      className={`rounded-xl border px-3 py-3 text-left transition-transform ${ativo ? 'scale-[1.02] border-2 shadow-sm' : 'border-slate-200 hover:bg-slate-50'}`}
                      style={{
                        borderColor: ativo ? tipo.cor : undefined,
                        backgroundColor: ativo ? `${tipo.cor}18` : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{tipo.nome}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Período
              </label>
              <div className="mb-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                {quinzenaFixaTripulante && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getQuinzenaBadgeClasses(quinzenaFixaTripulante.numero)}`}
                    >
                      {getQuinzenaShortLabel(quinzenaFixaTripulante.numero) || 'Quinzena fixa'}
                    </span>
                    <span className="text-xs text-slate-500">Período base do tripulante</span>
                  </div>
                )}
                <p className="text-xs text-slate-500">{ajudaPeriodo}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(event) => {
                      const novaDataInicio = event.target.value;
                      setDataInicio(novaDataInicio);
                      if (!novaDataInicio) {
                        if (dataFimAuto) {
                          setDataFim('');
                          setDataFimAuto(false);
                        }
                        return;
                      }

                      if (situacaoTipo === 'FERIAS' && (!dataFim || dataFimAuto)) {
                        const d = new Date(`${novaDataInicio}T00:00:00`);
                        d.setDate(d.getDate() + 30);
                        setDataFim(d.toISOString().slice(0, 10));
                        setDataFimAuto(true);
                      }
                    }}
                    min={standbyRestrito ? quinzenaFixaTripulante?.data_inicio : undefined}
                    max={standbyRestrito ? quinzenaFixaTripulante?.data_fim : undefined}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  {dataInicio && (
                    <span className="mt-1 block px-1 text-[11px] font-medium text-slate-500">
                      {fmtDateShort(dataInicio)}
                    </span>
                  )}
                </div>
                <div>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(event) => {
                      setDataFim(event.target.value);
                      setDataFimAuto(false);
                    }}
                    min={standbyRestrito ? quinzenaFixaTripulante?.data_inicio : undefined}
                    max={standbyRestrito ? quinzenaFixaTripulante?.data_fim : undefined}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  {dataFim && (
                    <span className="mt-1 block px-1 text-[11px] font-medium text-slate-500">
                      {fmtDateShort(dataFim)}
                    </span>
                  )}
                </div>
              </div>
              {standbyRestrito && quinzenaFixaTripulante && (
                <p className="mt-2 text-xs text-amber-700">
                  Standby s/ Aeronave: {fmtDateShort(quinzenaFixaTripulante.data_inicio)} →{' '}
                  {fmtDateShort(quinzenaFixaTripulante.data_fim)}.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Observação
              </label>
              <textarea
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder="Observações operacionais ou administrativas..."
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-4">
            {funcionarioId && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-600">
                    Tripulante selecionado
                  </p>
                  <button
                    type="button"
                    onClick={() => setMostrarSeletorTripulante((value) => !value)}
                    className="rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    {mostrarSeletorTripulante ? 'Ocultar lista' : 'Trocar tripulante'}
                  </button>
                </div>
                {tripulanteEmFoco ? (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-900">
                        {tripulanteEmFoco.nome_guerra || tripulanteEmFoco.nome}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {tripulanteEmFoco.nome_guerra
                          ? tripulanteEmFoco.nome
                          : tripulanteEmFoco.matricula
                            ? `Matrícula ${tripulanteEmFoco.matricula}`
                            : ''}
                      </div>
                      {quinzenaFixaTripulante && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getQuinzenaBadgeClasses(quinzenaFixaTripulante.numero)}`}
                          >
                            {getQuinzenaShortLabel(quinzenaFixaTripulante.numero) ||
                              'Quinzena fixa'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Base sugerida: {fmtDateShort(quinzenaFixaTripulante.data_inicio)} →{' '}
                            {fmtDateShort(quinzenaFixaTripulante.data_fim)}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                      {tripulanteEmFoco.role || '—'}
                    </span>
                  </div>
                ) : carregandoTripulantes ? (
                  <p className="text-sm text-slate-400">Carregando tripulante...</p>
                ) : (
                  <p className="text-sm text-slate-500">Tripulante não encontrado.</p>
                )}
              </div>
            )}
            <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {funcionarioId ? 'Selecionar outro tripulante' : 'Tripulante'}
              </label>
              {mostrarSeletorTripulante && (
                <>
                  <input
                    type="text"
                    value={busca}
                    onChange={(event) => setBusca(event.target.value)}
                    placeholder="Busca por nome ou matrícula..."
                    className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  <div className="flex-1 min-h-[260px] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                    {carregandoTripulantes && (
                      <div className="px-2 py-3 text-sm text-slate-400">
                        Carregando funcionários...
                      </div>
                    )}
                    {tripulantesFiltrados.map((tripulante) => {
                      const selecionado = funcionarioId === tripulante.funcionario_id;
                      const indisponivel =
                        tripulante.pode_ser_alocado === false &&
                        tripulante.funcionario_id !== situacaoInicial?.funcionario_id;
                      return (
                        <button
                          key={tripulante.funcionario_id}
                          type="button"
                          disabled={indisponivel}
                          onClick={() => {
                            setFuncionarioId(tripulante.funcionario_id);
                            setMostrarSeletorTripulante(false);
                          }}
                          className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${selecionado ? 'border-sky-700 bg-sky-700 text-white' : indisponivel ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">
                                {tripulante.nome_guerra || tripulante.nome}
                              </div>
                              <div
                                className={`text-xs ${selecionado ? 'text-white/80' : 'text-slate-500'}`}
                              >
                                {tripulante.nome}
                                {tripulante.matricula ? ` · ${tripulante.matricula}` : ''}
                              </div>
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${selecionado ? 'bg-white/15 text-white' : indisponivel ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
                            >
                              {indisponivel ? 'Indisponível' : 'Disponível'}
                            </span>
                          </div>
                          {tripulante.motivo_bloqueio && (
                            <div
                              className={`mt-1 text-[11px] ${selecionado ? 'text-white/80' : 'text-slate-500'}`}
                            >
                              {tripulante.motivo_bloqueio}
                            </div>
                          )}
                        </button>
                      );
                    })}
                    {!carregandoTripulantes && tripulantesFiltrados.length === 0 && (
                      <div className="px-2 py-3 text-sm text-slate-400">
                        Nenhum funcionário encontrado.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
