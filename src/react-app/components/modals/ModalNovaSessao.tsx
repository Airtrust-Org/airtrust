/**
 * MODAL: Nova Sessão de Treinamento
 * Versão: 4.0 - Gestão Completa via Calendário
 * Data: 14/01/2026
 *
 * FLUXO:
 * 1. Aeronave → 2. Simulador → 3. Tipo de Sessão → 4. Modelo de Sessão
 *
 * MUDANÇAS v4.0:
 * - ✅ Adicionado envio por Email e WhatsApp (modo edição)
 * - ✅ Adicionado botão para excluir sessão (modo edição)
 * - ✅ Adicionado acesso às fichas geradas (modo edição)
 * - ✅ Mensagens pré-configuradas com dados da sessão
 * - ✅ Destinatários automáticos (participantes + instrutor)
 */

import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Mail, MessageCircle, FileText, Users } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import TimeInput from '@/react-app/components/TimeInput';
import AlertModal from '@/react-app/components/modals/AlertModal';
import ConfirmDeleteModal from '@/react-app/components/modals/ConfirmDeleteModal';
import { emitirEventoModulo, escutarEventosModulo } from '@/react-app/lib/moduloBus';
import { normalizeTimeInput } from '@/react-app/lib/time-input';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import {
  filterCompatibleCheckIds,
  filterCompatibleChecks,
} from '@/react-app/utils/checkCompatibility';
import {
  applyModelChangeDefaults,
  deriveSpecialFichaFlags,
  filterModelosSessaoForModal,
  resolveEditModeloSelection,
} from './modalNovaSessaoRules';
import { enviarNotificacaoSessao, montarResumoCanal } from '@/react-app/utils/sessaoNotificacoes';
import { isSharedSessionsEnabled } from '@/react-app/config/sharedSessions';
import SharedSessionForm, { type SharedSessionStep } from './SharedSessionForm';

interface ModeloAeronave {
  id: number;
  modelo: string;
  fabricante?: string;
}

interface AeronaveReal {
  id: number;
  prefixo: string;
  modelo: string;
  fabricante?: string;
}

interface Simulador {
  id: number;
  nome: string;
  modelo: string;
  modelo_aeronave?: string;
  tipo?: string; // Tipo de aeronave (ex: AW139)
  fabricante?: string;
  aeronave_codigo?: string; // FK para aeronaves.codigo
}

interface TipoSessao {
  id: number;
  codigo: string;
  nome: string;
}

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
}

interface TipoCheck {
  id: number;
  codigo: string;
  nome: string;
  descricao?: string | null;
}

interface Participante {
  funcionario_id: number | null;
  funcao?: 'PIC' | 'SIC';
}

interface ModeloSessao {
  id: number;
  codigo: string;
  nome: string;
  tipo_sessao_id: number;
  tipo_aeronave: string;
  tipo?: string | null;
  modelo_aeronave?: string | null;
  codigo_aeronave?: string | null;
  tipo_sessao_codigo?: string | null;
  tipo_sessao_nome?: string | null;
  checks?: Array<{ id: number }>;
}

interface SessaoParaEditar {
  id: number;
  modo_compartilhado?: number | boolean;
  template_id?: number | null;
  simulador_id?: number | null; // null for AERONAVE sessions
  simulador_nome?: string;
  simulador_modelo?: string;
  data: string;
  horario_inicio: string;
  horario_fim: string;
  instrutor_id: number;
  instrutor_nome?: string;
  tipo_sessao: string;
  tipo_sessao_id?: number | null; // FK canônica (via template_id JOIN no backend)
  tipo_sessao_codigo?: string | null; // Código do tipo (via template_id JOIN no backend)
  tipo_aeronave?: string; // Código da aeronave
  tipo_dispositivo?: 'SIMULADOR' | 'AERONAVE';
  aeronave_id?: number | null;
  aeronave_prefixo?: string;
  aeronave_modelo?: string;
  tema_sessao?: string;
  observacoes?: string;
  examinador_id?: number | null;
  participantes?: Array<{
    funcionario_id: number;
    funcao?: 'PIC' | 'SIC';
  }>;
  fichas?: Array<{ id: number }>; // Array de fichas geradas
}

interface ModalNovaSessaoProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sessao?: SessaoParaEditar | null; // Para edição
  onDelete?: (id: number) => void; // Callback para excluir
  onVerFichas?: (sessaoId: number) => void; // Callback para ver fichas
}

export default function ModalNovaSessao({
  isOpen,
  onClose,
  onSuccess,
  sessao,
  onDelete,
  onVerFichas,
}: ModalNovaSessaoProps) {
  const participantesIniciais = (): Participante[] => [
    { funcionario_id: null },
    { funcionario_id: null },
  ];

  const getFuncaoParticipante = (index: number): 'PIC' | 'SIC' => (index === 0 ? 'PIC' : 'SIC');

  const isEditMode = !!sessao?.id;
  // ========== STATES ==========
  const [loading, setLoading] = useState(false);
  const [sendingChannel, setSendingChannel] = useState<'email' | 'whatsapp' | null>(null);
  const [aeronaves, setAeronaves] = useState<ModeloAeronave[]>([]);
  const [simuladores, setSimuladores] = useState<Simulador[]>([]);
  const [simuladoresFiltrados, setSimuladoresFiltrados] = useState<Simulador[]>([]);
  const [tiposSessao, setTiposSessao] = useState<TipoSessao[]>([]);
  const [instrutores, setInstrutores] = useState<Funcionario[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [examinadores, setExaminadores] = useState<Funcionario[]>([]);
  const [tiposCheck, setTiposCheck] = useState<TipoCheck[]>([]);
  const [modelos, setModelos] = useState<ModeloSessao[]>([]);
  const [loadingModelos, setLoadingModelos] = useState(false);
  const [erroModelosSessao, setErroModelosSessao] = useState<string | null>(null);
  const [conflitoModal, setConflitoModal] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editHydrating, setEditHydrating] = useState(false); // Loading state for edit mode hydration
  const [sessaoDetalhe, setSessaoDetalhe] = useState<any>(null); // Complete session data from GET /sessoes/:id
  const phase1MergedRef = useRef<any>(null); // merged edit payload across hydration phases
  const modelosRequestSeqRef = useRef(0);
  const modelosInFlightRef = useRef<{
    requestId: number;
    comboKey: string;
    controller: AbortController;
  } | null>(null);
  const modelosLoadedComboRef = useRef<string | null>(null);

  // ========== FLUXO EM CASCATA ==========
  const [tipoDispositivo, setTipoDispositivo] = useState<'SIMULADOR' | 'AERONAVE'>('SIMULADOR');
  const [aeronaveId, setAeronaveId] = useState<number | null>(null);
  const [aeronaveCodigo, setAeronaveCodigo] = useState<string>('');
  const [simuladorId, setSimuladorId] = useState<number | null>(null);
  const [aeronaveRealId, setAeronaveRealId] = useState<number | null>(null);
  const [aeronavesReais, setAeronavesReais] = useState<AeronaveReal[]>([]);
  const [aeronavesReaisFiltradas, setAeronavesReaisFiltradas] = useState<AeronaveReal[]>([]);
  const [tipoSessaoId, setTipoSessaoId] = useState<number | null>(null);
  const [modeloSessaoId, setModeloSessaoId] = useState<number | null>(null);

  // Campos do formulário
  const [temaSessao, setTemaSessao] = useState<string>('');
  const [data, setData] = useState<string>('');
  const [dataInvalida, setDataInvalida] = useState<boolean>(false);
  const [horarioInicio, setHorarioInicio] = useState<string>('');
  const [horarioFim, setHorarioFim] = useState<string>('');
  const [horarioFimFoiEditado, setHorarioFimFoiEditado] = useState<boolean>(false);
  const [instrutorId, setInstrutorId] = useState<number | null>(null);
  const [examinadorId, setExaminadorId] = useState<number | null>(null);
  const [checksSelecionados, setChecksSelecionados] = useState<number[]>([]);
  // Fichas especiais: podem ser acionadas pelos checks FAP07/FAP13 ou manualmente
  const [gerarFichaInstrutor, setGerarFichaInstrutor] = useState(false);
  const [gerarFichaExaminador, setGerarFichaExaminador] = useState(false);
  const [observacoes, setObservacoes] = useState<string>('');
  const [participantes, setParticipantes] = useState<Participante[]>(participantesIniciais());
  const [modoCompartilhado, setModoCompartilhado] = useState(false);
  const [sharedSessionsEnabled, setSharedSessionsEnabled] = useState(false);
  const [sharedSessionStep, setSharedSessionStep] = useState<SharedSessionStep>('reserva');

  const {
    hasFap07Selecionada,
    hasFap13Selecionada,
    gerarFichaInstrutorEfetivo,
    gerarFichaExaminadorEfetivo,
  } = deriveSpecialFichaFlags({
    checksSelecionados,
    tiposCheck,
    gerarFichaInstrutorManual: gerarFichaInstrutor,
    gerarFichaExaminadorManual: gerarFichaExaminador,
  });

  function addMinutesToTimeHHMM(timeHHMM: string, minutesToAdd: number): string {
    const horarioNormalizado = normalizeTimeInput(timeHHMM);
    if (!horarioNormalizado) return '';
    const [hStr, mStr] = horarioNormalizado.split(':');
    const h = Number(hStr);
    const m = Number(mStr);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
    const total = h * 60 + m + minutesToAdd;
    // Allow overflow to next day: if total >= 24*60, use modulo to get time of next day
    const normalizedMinutes = total >= 0 ? total : 0;
    const hh = String(Math.floor((normalizedMinutes / 60) % 24)).padStart(2, '0');
    const mm = String(normalizedMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function getModelosComboKey(
    tipoSessaoIdParam: number,
    codigoAeronave: string,
    tipo?: 'SIMULADOR' | 'AERONAVE',
  ) {
    return `${tipo || tipoDispositivo}:${codigoAeronave}:${tipoSessaoIdParam}`;
  }

  function invalidateModelosCache() {
    modelosInFlightRef.current?.controller.abort();
    modelosInFlightRef.current = null;
    modelosLoadedComboRef.current = null;
    setLoadingModelos(false);
  }

  // ========== LOAD DATA INICIAL ==========
  useEffect(() => {
    if (isOpen) {
      invalidateModelosCache();
      setTiposSessao([]);
      setModelos([]);
      setErroModelosSessao(null);
      setSimuladoresFiltrados([]);
      setTipoSessaoId(null);
      setModeloSessaoId(null);
      setSessaoDetalhe(null);
      phase1MergedRef.current = null;
      // forceRefresh: true — bypass browser HTTP cache. The flag may have
      // changed operationally (worker deploy) since the last page load.
      isSharedSessionsEnabled({ forceRefresh: true })
        .then(setSharedSessionsEnabled)
        .catch(() => setSharedSessionsEnabled(false));
      fetchAeronaves();
      fetchAeronavesReais();
      fetchSimuladores();
      fetchTiposSessao();
      fetchInstrutores();
      setFuncionarios([]);
      fetchExaminadores();
      fetchTiposCheck();

      // Em edição: buscar detalhe completo da sessão via endpoint dedicado
      if (isEditMode && sessao?.id) {
        setEditHydrating(true);
        fetchSessaoDetalhe(sessao.id);
      } else if (!isEditMode) {
        // Em criação: pré-preencher com data de hoje
        setData(new Date().toISOString().split('T')[0]);
        setEditHydrating(false);
      }

      // Em criação: auto +2h; em edição: preservar valor existente
      setHorarioFimFoiEditado(isEditMode);
    } else {
      // Modal fechando: limpar estado de hidratação
      invalidateModelosCache();
      setEditHydrating(false);
      phase1MergedRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (!aeronaveCodigo) {
      setFuncionarios([]);
      return;
    }

    fetchFuncionarios(aeronaveCodigo);
  }, [isOpen, aeronaveCodigo]);

  useEffect(() => {
    if (!isOpen || !tipoSessaoId || !aeronaveCodigo) return;

    const recarregarModelos = () => {
      void fetchModelosComCodigo(tipoSessaoId, aeronaveCodigo);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recarregarModelos();
      }
    };

    const unsubscribe = escutarEventosModulo((evento) => {
      if (evento.modulo === 'simuladores' && evento.tipo === 'SIMULADOR_ATUALIZADO') {
        recarregarModelos();
      }
    });

    window.addEventListener('focus', recarregarModelos);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', recarregarModelos);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOpen, tipoSessaoId, aeronaveCodigo]);

  // Se estiver em modo edição, tentar pré-carregar checks vinculados (se houver)
  useEffect(() => {
    if (!isOpen || !isEditMode || !sessao?.id) return;

    // Preencher examinador_id se o objeto vier com esse campo
    if (typeof sessao.examinador_id === 'number') {
      setExaminadorId(sessao.examinador_id);
    }

    (async () => {
      try {
        const token = getAccessToken();
        const res = await fetch(`${API_BASE_URL}/simuladores/sessoes/${sessao.id}/checks`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.success || !Array.isArray(data?.data)) return;
        const ids = data.data
          .map((c: { qualificacao_tipo_id?: number }) => c.qualificacao_tipo_id)
          .filter((v: unknown): v is number => typeof v === 'number');
        setChecksSelecionados(ids);
      } catch (e) {
        // silencioso: edição continua funcional mesmo sem checks
      }
    })();
  }, [isOpen, isEditMode, sessao?.id, sessao?.examinador_id]);

  // Pré-preencher data quando abrindo modo criação via click no calendário
  useEffect(() => {
    if (isOpen && !isEditMode && sessao?.data) {
      setData(sessao.data.split('T')[0]);
    }
  }, [isOpen, isEditMode, sessao?.data]);

  // ========== PREENCHER DADOS PARA EDIÇÃO ==========
  // PHASE 1: Hydrate non-cascading fields (date, times, instructor, participants, etc.)
  // Runs as soon as session detail is available — does NOT wait for cascading list fetches.
  // This ensures basic fields are always populated even if a supporting endpoint fails.
  useEffect(() => {
    if (!isOpen || !isEditMode || !sessao) return;
    if (sessaoDetalhe === null) return; // detail not yet fetched (or _fallback not yet set)

    const detailIsFallback = sessaoDetalhe?._fallback === true;
    const merged = sessaoDetalhe && !detailIsFallback
      ? {
          ...sessao,
          data: sessaoDetalhe.data || sessao!.data,
          horario_inicio: sessaoDetalhe.hora_inicio || sessao!.horario_inicio,
          horario_fim: sessaoDetalhe.hora_fim || sessao!.horario_fim,
          tipo_sessao_id: sessaoDetalhe.tipo_sessao_id ?? sessao!.tipo_sessao_id,
          tipo_sessao_codigo: sessaoDetalhe.tipo_sessao_codigo ?? sessao!.tipo_sessao_codigo,
          tema_sessao: sessaoDetalhe.nome || sessao!.tema_sessao,
          aeronave_id: sessaoDetalhe.aeronave_id ?? sessao!.aeronave_id,
          aeronave_prefixo: sessaoDetalhe.aeronave_prefixo || sessao!.aeronave_prefixo,
          aeronave_modelo: sessaoDetalhe.aeronave_modelo || sessao!.aeronave_modelo,
          examinador_nome: sessaoDetalhe.examinador_nome || sessao!.examinador_nome,
          observacoes: sessaoDetalhe.observacoes ?? sessao!.observacoes,
          modo_compartilhado:
            sessaoDetalhe.modo_compartilhado ?? sessao!.modo_compartilhado,
          participantes:
            sessaoDetalhe.alunos?.length > 0
              ? sessaoDetalhe.alunos.map((a: any) => ({
                  funcionario_id: a.id as number,
                  funcao: (a.funcao as 'PIC' | 'SIC') || 'PIC',
                }))
              : sessao!.participantes,
          tipo_aeronave:
            sessaoDetalhe.aeronave_modelo ||
            sessaoDetalhe.simulador_aeronave_codigo ||
            sessaoDetalhe.simulador_tipo ||
            sessao!.tipo_aeronave,
        }
      : sessao!;

    const detailLabel = sessaoDetalhe && !detailIsFallback ? 'detail' : 'prop';
    console.log('🔧 [PHASE 1] Hydrating non-cascading fields from', detailLabel, {
      id: merged.id,
      data: merged.data,
      horario_inicio: merged.horario_inicio,
      horario_fim: merged.horario_fim,
      instrutor_id: merged.instrutor_id,
      participantes: merged.participantes?.length || 0,
    });

    // Always set non-cascading fields — no list dependency
    setData((merged.data || '').split('T')[0]);
    setHorarioInicio(merged.horario_inicio?.substring(0, 5) || '');
    setHorarioFim(merged.horario_fim?.substring(0, 5) || '');
    setHorarioFimFoiEditado(true);
    setInstrutorId(merged.instrutor_id);
    setObservacoes(merged.observacoes || '');
    setModoCompartilhado(Boolean(merged.modo_compartilhado));
    if (merged.tema_sessao) {
      setTemaSessao(merged.tema_sessao);
    }
    if (merged.participantes && merged.participantes.length > 0) {
      setParticipantes(
        merged.participantes.slice(0, 2).map((p: any) => ({
          funcionario_id: p.funcionario_id,
          funcao: p.funcao,
        })),
      );
    }
    setTipoDispositivo(sessao?.tipo_dispositivo || 'SIMULADOR');

    // Store merged data for Phase 2 to use when lists arrive (without mutating sessaoDetalhe)
    // to avoid re-hydration loops while editing.
    phase1MergedRef.current = merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEditMode, sessao, sessaoDetalhe]);

  // PHASE 2: Hydrate cascading fields (equipment, simulator, session type, model)
  // Runs only when supporting lists are loaded. Uses merged data stored in sessaoDetalhe
  // from Phase 1, or builds it from prop if Phase 1 hasn't stored it yet.
  useEffect(() => {
    if (!isOpen || !isEditMode || !sessao) return;
    if (!sessaoDetalhe) return;

    const tipoDisp = sessao?.tipo_dispositivo || 'SIMULADOR';
    const detailIsFallback = sessaoDetalhe?._fallback === true;

    // Build merged from stored Phase 1 data or fallback
    const phase1Merged = phase1MergedRef.current;
    const merged = phase1Merged || (detailIsFallback ? sessao : {
      ...sessao,
      data: sessaoDetalhe.data || sessao!.data,
      horario_inicio: sessaoDetalhe.hora_inicio || sessao!.horario_inicio,
      horario_fim: sessaoDetalhe.hora_fim || sessao!.horario_fim,
      tipo_sessao_id: sessaoDetalhe.tipo_sessao_id ?? sessao!.tipo_sessao_id,
      tipo_sessao_codigo: sessaoDetalhe.tipo_sessao_codigo ?? sessao!.tipo_sessao_codigo,
      tema_sessao: sessaoDetalhe.nome || sessao!.tema_sessao,
      aeronave_id: sessaoDetalhe.aeronave_id ?? sessao!.aeronave_id,
      aeronave_prefixo: sessaoDetalhe.aeronave_prefixo || sessao!.aeronave_prefixo,
      aeronave_modelo: sessaoDetalhe.aeronave_modelo || sessao!.aeronave_modelo,
      examinador_nome: sessaoDetalhe.examinador_nome || sessao!.examinador_nome,
      observacoes: sessaoDetalhe.observacoes ?? sessao!.observacoes,
      modo_compartilhado:
        sessaoDetalhe.modo_compartilhado ?? sessao!.modo_compartilhado,
      participantes:
        sessaoDetalhe.alunos?.length > 0
          ? sessaoDetalhe.alunos.map((a: any) => ({
              funcionario_id: a.id as number,
              funcao: (a.funcao as 'PIC' | 'SIC') || 'PIC',
            }))
          : sessao!.participantes,
      tipo_aeronave:
        sessaoDetalhe.aeronave_modelo ||
        sessaoDetalhe.simulador_aeronave_codigo ||
        sessaoDetalhe.simulador_tipo ||
        sessao!.tipo_aeronave,
    });

    // Guard: need at least aeronaves + tiposSessao for cascading lookups.
    // simuladores list is optional (AERONAVE mode doesn't need it; SIMULADOR
    // mode handles missing simulador gracefully via legacy option).
    if (aeronaves.length === 0 || tiposSessao.length === 0) return;

    console.log('🔧 [PHASE 2] Hydrating cascading fields', {
      id: merged.id,
      tipoDisp,
      simulador_id: merged.simulador_id,
      simuladores_loaded: simuladores.length,
      aeronaves_loaded: aeronaves.length,
      tiposSessao_loaded: tiposSessao.length,
    });

    let aeronaveEncontrada: ModeloAeronave | undefined;
    let modeloDirecto: string | null =
      (merged as any).aeronave_modelo ||
      (merged as any).simulador_aeronave_codigo ||
      (merged as any).simulador_tipo ||
      (merged as any).simulador_modelo ||
      null;

    if (tipoDisp === 'AERONAVE') {
      modeloDirecto = merged.aeronave_modelo || merged.tipo_aeronave || null;
      aeronaveEncontrada = aeronaves.find(
        (a) => a.modelo === modeloDirecto || a.modelo === merged.tipo_aeronave,
      );

      if (aeronaveEncontrada) {
        setAeronaveId(aeronaveEncontrada.id);
        setAeronaveCodigo(aeronaveEncontrada.modelo);
        const filtradosReais = aeronavesReais.filter(
          (a) => a.modelo === aeronaveEncontrada!.modelo,
        );
        setAeronavesReaisFiltradas(filtradosReais);
      } else if (modeloDirecto) {
        // Legacy AERONAVE: model code known but not in current aeronaves list
        setAeronaveCodigo(modeloDirecto);
      }

      if (merged.aeronave_id) {
        setAeronaveRealId(merged.aeronave_id);
      }
    } else {
      // Modo SIMULADOR
      const simulador = simuladores.find((s) => s.id === merged.simulador_id);

      if (simulador) {
        console.log('🔧 [PHASE 2] Simulador encontrado:', simulador);
        modeloDirecto =
          simulador.aeronave_codigo || simulador.tipo || simulador.modelo || modeloDirecto || null;

        aeronaveEncontrada = aeronaves.find(
          (a) =>
            a.modelo === modeloDirecto ||
            a.modelo === simulador.modelo_aeronave ||
            a.modelo === (merged as any).tipo_aeronave,
        );

        if (aeronaveEncontrada) {
          setAeronaveId(aeronaveEncontrada.id);
          setAeronaveCodigo(aeronaveEncontrada.modelo);
        } else if (modeloDirecto) {
          // Legacy: model code known but not in current aeronaves list.
          // Set aeronaveCodigo so cascading selects (tipo/modelo) can work.
          // aeronaveId stays null — the equipment select will show empty
          // but the user can still edit other fields.
          setAeronaveCodigo(modeloDirecto);
        }

        const modeloFinal = aeronaveEncontrada?.modelo ?? modeloDirecto ?? '';
        if (modeloFinal) {
          const filtrados = simuladores.filter(
            (s) =>
              s.aeronave_codigo === modeloFinal ||
              s.tipo === modeloFinal ||
              s.modelo === modeloFinal ||
              s.modelo_aeronave === modeloFinal,
          );
          setSimuladoresFiltrados(filtrados);
        }

        setSimuladorId(merged.simulador_id);
      } else if (merged.simulador_id) {
        // Simulador not found in current list — add legacy placeholder so
        // the dropdown shows the stored value instead of appearing empty.
        console.warn('⚠️ [PHASE 2] Simulador ID', merged.simulador_id, 'não está na lista carregada — adicionando opção legada');
        setSimuladorId(merged.simulador_id);
        // Add legacy placeholder so select shows the stored value
        const legadoSim: Simulador = {
          id: merged.simulador_id,
          nome: `Simulador #${merged.simulador_id} (legado)`,
          modelo: modeloDirecto || '',
        };
        setSimuladoresFiltrados((prev) => {
          if (prev.some((s) => s.id === merged.simulador_id)) return prev;
          return [legadoSim, ...prev];
        });
        // Also try aeronave lookup from merged data for this legacy simulador
        if (modeloDirecto) {
          const aeronaveLegada = aeronaves.find(
            (a) =>
              a.modelo === modeloDirecto ||
              a.modelo === (merged as any).tipo_aeronave,
          );
          if (aeronaveLegada) {
            setAeronaveId(aeronaveLegada.id);
            setAeronaveCodigo(aeronaveLegada.modelo);
          } else {
            // Set the aeronave codigo even if not in the loaded list
            setAeronaveCodigo(modeloDirecto);
          }
        }
      }
    }

    // Encontrar tipo de sessão: tentar FK primeiro, depois código TEXT
    let tipoSessao = tiposSessao.find((t) => t.id === merged.tipo_sessao_id);
    let tipoSessaoSource = 'tipo_sessao_id';

    if (!tipoSessao && merged.tipo_sessao_codigo) {
      tipoSessao = tiposSessao.find((t) => t.codigo === merged.tipo_sessao_codigo);
      tipoSessaoSource = 'tipo_sessao_codigo';
    }

    if (!tipoSessao && merged.tipo_sessao) {
      tipoSessao = tiposSessao.find((t) => t.codigo === merged.tipo_sessao);
      tipoSessaoSource = 'tipo_sessao (TEXT fallback)';
    }

    if (tipoSessao) {
      console.log(`🔧 [PHASE 2] Tipo sessão encontrado via ${tipoSessaoSource}:`, tipoSessao);
      setTipoSessaoId(tipoSessao.id);

      const codigoParaModelos = aeronaveEncontrada?.modelo ?? modeloDirecto;
      if (codigoParaModelos) {
        fetchModelosComCodigo(tipoSessao.id, codigoParaModelos, tipoDisp);
      } else {
        // There is no way to load model options without equipment code.
        setEditHydrating(false);
      }
    } else {
      console.warn('⚠️ [PHASE 2] Tipo de sessão NÃO encontrado:', {
        tipo_sessao_id: merged.tipo_sessao_id,
        tipo_sessao_codigo: merged.tipo_sessao_codigo,
        tipo_sessao_text: merged.tipo_sessao,
        tipos_disponiveis: tiposSessao.map((t) => ({ id: t.id, codigo: t.codigo })),
      });
      // Non-cascading fields are already populated from Phase 1.
      // User will see tipo select empty and can choose manually.
      setEditHydrating(false);
    }

    // Finish hydration if no session type info to trigger model loading
    if (!merged.tipo_sessao_id && !merged.tipo_sessao_codigo && !merged.tipo_sessao) {
      setEditHydrating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEditMode, sessao, sessaoDetalhe, simuladores, aeronaves, aeronavesReais, tiposSessao]);

  function _authHeaders(): HeadersInit {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchJsonComTimeout(
    url: string,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ) {
    const timeoutMs = options?.timeoutMs ?? 12000;
    const controller = new AbortController();
    const externalSignal = options?.signal;
    const abortFromExternal = () => controller.abort();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', abortFromExternal, { once: true });
      }
    }

    try {
      const res = await fetch(url, {
        headers: _authHeaders(),
        cache: 'no-store',
        signal: controller.signal,
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error('Resposta inválida ao carregar modelos de sessão.');
      }

      if (!res.ok) {
        throw new Error(
          data?.error || `Falha ao carregar modelos de sessão (HTTP ${res.status}).`,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(
          'Tempo esgotado ao carregar modelos de sessão. Tente novamente.',
        );
      }
      throw error;
    } finally {
      if (externalSignal) {
        externalSignal.removeEventListener('abort', abortFromExternal);
      }
      window.clearTimeout(timeoutId);
    }
  }

  async function fetchAeronaves() {
    try {
      const res = await fetch(`${API_BASE_URL}/modelos-aeronave`, { headers: _authHeaders() });
      const data = await res.json();
      setAeronaves(data.data || []);
    } catch (error) {
      console.error('Erro ao buscar modelos de aeronave:', error);
    }
  }

  async function fetchAeronavesReais() {
    try {
      const res = await fetch(`${API_BASE_URL}/aeronaves`, { headers: _authHeaders() });
      const data = await res.json();
      setAeronavesReais(data.data || []);
    } catch (error) {
      console.error('Erro ao buscar aeronaves:', error);
    }
  }

  async function fetchSimuladores() {
    try {
      const res = await fetch(`${API_BASE_URL}/simuladores`, { headers: _authHeaders() });
      const data = await res.json();
      setSimuladores(data.data || []);
    } catch (error) {
      console.error('Erro ao buscar simuladores:', error);
    }
  }

  async function fetchTiposSessao() {
    try {
      const res = await fetch(`${API_BASE_URL}/simuladores/tipos-sessao`, {
        headers: _authHeaders(),
      });
      const data = await res.json();
      setTiposSessao(
        (data.data || []).filter(
          (tipo: TipoSessao & { deleted_at?: string | null }) => !tipo.deleted_at,
        ),
      );
    } catch (error) {
      console.error('Erro ao buscar tipos de sessão:', error);
    }
  }

  useEffect(() => {
    if (!tipoSessaoId) return;
    // Guard: never reset cascading fields during edit hydration
    if (editHydrating) return;
    if (tiposSessao.some((tipo) => tipo.id === tipoSessaoId)) return;

    invalidateModelosCache();
    setTipoSessaoId(null);
    setModeloSessaoId(null);
    setModelos([]);
    setTemaSessao('');
  }, [tipoSessaoId, tiposSessao, editHydrating]);

  async function fetchInstrutores() {
    try {
      const res = await fetch(`${API_BASE_URL}/funcionarios`, { headers: _authHeaders() });
      const data = await res.json();
      const todosFunc = data.data || [];
      const somenteInstrutores = todosFunc.filter(
        (f: Funcionario & { is_instrutor?: number; cargo?: string }) =>
          f.is_instrutor === 1 || f.cargo?.toLowerCase().includes('instrutor'),
      );
      setInstrutores(somenteInstrutores);
    } catch (error) {
      console.error('Erro ao buscar instrutores:', error);
    }
  }

  async function fetchFuncionarios(modeloAeronave?: string) {
    try {
      const params = new URLSearchParams({
        limit: '100',
        orderBy: 'nome',
        order: 'ASC',
      });

      if (modeloAeronave) {
        params.set('aeronave', modeloAeronave);
      }

      const res = await fetch(`${API_BASE_URL}/funcionarios?${params.toString()}`, {
        headers: _authHeaders(),
      });
      const data = await res.json();
      setFuncionarios(data.data || []);
    } catch (error) {
      console.error('Erro ao buscar funcionários:', error);
    }
  }

  async function fetchExaminadores() {
    try {
      const token = getAccessToken();
      console.log('🔍 [MODAL] Buscando examinadores...', { token: token ? 'presente' : 'AUSENTE' });
      const res = await fetch(`${API_BASE_URL}/funcionarios?examinador=true`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      console.log('🔍 [MODAL] Response status:', res.status, res.statusText);
      const data = await res.json();
      console.log('🔍 [MODAL] Response data:', data);
      console.log('🔍 [MODAL] Examinadores encontrados:', data.data?.length || 0, data.data);
      setExaminadores(data.data || []);
    } catch (error) {
      console.error('❌ [MODAL] Erro ao buscar examinadores:', error);
    }
  }

  async function fetchTiposCheck() {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/simuladores/tipos-check`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setTiposCheck(data.data || []);
    } catch (error) {
      console.error('Erro ao buscar tipos de check:', error);
    }
  }

  /** Fetch complete session detail from GET /sessoes/:id for edit mode hydration */
  async function fetchSessaoDetalhe(sessaoId: number) {
    try {
      const res = await fetch(`${API_BASE_URL}/simuladores/sessoes/${sessaoId}`, {
        headers: _authHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) {
        console.error('[fetchSessaoDetalhe] Erro HTTP:', res.status, '— fallback to calendar data');
        setSessaoDetalhe({ _fallback: true }); // signal to use prop data
        return;
      }
      const data = await res.json();
      if (!data?.success || !data?.sessao) {
        console.error('[fetchSessaoDetalhe] Resposta inválida — fallback to calendar data');
        setSessaoDetalhe({ _fallback: true }); // signal to use prop data
        return;
      }
      console.log('✅ [fetchSessaoDetalhe] Detalhe carregado:', {
        id: data.sessao.id,
        template_id: data.sessao.template_id,
        tipo_sessao_id: data.sessao.tipo_sessao_id,
        tipo_sessao_codigo: data.sessao.tipo_sessao_codigo,
        simulador_id: data.sessao.simulador_id,
        aeronave_id: data.sessao.aeronave_id,
      });
      setSessaoDetalhe(data.sessao);
    } catch (error) {
      console.error('[fetchSessaoDetalhe] Erro:', error, '— fallback to calendar data');
      setSessaoDetalhe({ _fallback: true }); // signal to use prop data
    }
  }

  async function fetchChecksPadraoModelo(modeloId: number): Promise<number[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/simuladores/modelos-sessao/${modeloId}/checks`, {
        headers: _authHeaders(),
      });
      const data = await res.json();
      if (!data?.success || !Array.isArray(data?.data)) {
        return [];
      }
      return filterCompatibleChecks(data.data, aeronaveCodigo)
        .map((check: { id?: number }) => check.id)
        .filter((id: unknown): id is number => typeof id === 'number');
    } catch (error) {
      console.error('Erro ao carregar checks padrão do modelo:', error);
      return [];
    }
  }

  /**
   * Filtra a lista de tipos de check pelo modelo de aeronave da sessão.
   * Checks com sufixo "-139" → apenas AW139; "-76" → apenas SK76.
   * Checks sem sufixo de modelo (ex: FAP14) → exibidos para todos.
   */
  function filtrarChecksPorModelo(checks: typeof tiposCheck): typeof tiposCheck {
    return filterCompatibleChecks(checks, aeronaveCodigo);
  }

  // ========== FLUXO 1: SELECIONAR AERONAVE ==========
  function handleAeronaveChange(id: number, modelo: string) {
    setAeronaveId(id);
    setAeronaveCodigo(modelo);
    invalidateModelosCache();

    // Reset cascata
    setSimuladorId(null);
    setAeronaveRealId(null);
    setTipoSessaoId(null);
    setModeloSessaoId(null);
    setTemaSessao('');
    setModelos([]);
    setErroModelosSessao(null);
    setChecksSelecionados([]);
    setGerarFichaInstrutor(false);
    setGerarFichaExaminador(false);
    setParticipantes(participantesIniciais());

    // Filtrar simuladores por modelo de aeronave (com fallback legados)
    const filtrados = simuladores.filter(
      (s) =>
        s.modelo_aeronave === modelo ||
        s.aeronave_codigo === modelo ||
        s.tipo === modelo ||
        s.modelo === modelo,
    );
    setSimuladoresFiltrados(filtrados);

    // Filtrar aeronaves reais pelo modelo selecionado
    const filtradosReais = aeronavesReais.filter((a) => a.modelo === modelo);
    setAeronavesReaisFiltradas(filtradosReais);

    console.log('🔍 Filtro simuladores:', {
      modelo,
      total: simuladores.length,
      filtrados: filtrados.length,
    });
  }

  // ========== FLUXO 2b: SELECIONAR AERONAVE REAL (modo AERONAVE) ==========
  function handleAeronaveRealChange(id: number) {
    setAeronaveRealId(id);
    invalidateModelosCache();

    // Reset cascata
    setTipoSessaoId(null);
    setModeloSessaoId(null);
    setTemaSessao('');
    setModelos([]);
    setErroModelosSessao(null);
    setChecksSelecionados([]);
    setGerarFichaInstrutor(false);
    setGerarFichaExaminador(false);
  }

  function handleTipoDispositivoChange(tipo: 'SIMULADOR' | 'AERONAVE') {
    setTipoDispositivo(tipo);
    invalidateModelosCache();
    setSimuladorId(null);
    setAeronaveRealId(null);
    setTipoSessaoId(null);
    setModeloSessaoId(null);
    setTemaSessao('');
    setModelos([]);
    setErroModelosSessao(null);
    setChecksSelecionados([]);
    setGerarFichaInstrutor(false);
    setGerarFichaExaminador(false);
  }

  // ========== FLUXO 2: SELECIONAR SIMULADOR ==========
  function handleSimuladorChange(id: number) {
    setSimuladorId(id);
    invalidateModelosCache();

    // Reset cascata
    setTipoSessaoId(null);
    setModeloSessaoId(null);
    setTemaSessao('');
    setModelos([]);
    setErroModelosSessao(null);
    setChecksSelecionados([]);
    setGerarFichaInstrutor(false);
    setGerarFichaExaminador(false);
  }

  // ========== FLUXO 3: SELECIONAR TIPO DE SESSÃO ==========
  function handleTipoSessaoChange(id: number) {
    setTipoSessaoId(id);
    invalidateModelosCache();

    // Reset cascata
    setModeloSessaoId(null);
    setTemaSessao('');
    setErroModelosSessao(null);
    setChecksSelecionados([]);
    setGerarFichaInstrutor(false);
    setGerarFichaExaminador(false);

    // Carregar modelos filtrados
    fetchModelos(id);
  }

  function buildModelosSessaoUrl(
    tipoSessaoIdParam: number,
    codigoAeronave: string,
    tipo?: 'SIMULADOR' | 'AERONAVE',
    includeFilters = true,
  ) {
    const params = new URLSearchParams({ t: String(Date.now()) });

    if (includeFilters) {
      const tipoSessaoObj = tiposSessao.find((item) => item.id === tipoSessaoIdParam);
      params.set('tipo_sessao_id', String(tipoSessaoIdParam));
      if (tipoSessaoObj?.codigo) params.set('tipo_sessao_codigo', tipoSessaoObj.codigo);
      if (tipoSessaoObj?.nome) params.set('tipo_sessao_nome', tipoSessaoObj.nome);
      params.set('modelo_aeronave', codigoAeronave);
      if (tipo) params.set('tipo', tipo);
    }

    return `${API_BASE_URL}/simuladores/modelos-sessao?${params.toString()}`;
  }

  function filtrarModelosSessaoModal(
    modelosRecebidos: ModeloSessao[],
    tipoSessaoIdParam: number,
    codigoAeronave: string,
    tipo?: 'SIMULADOR' | 'AERONAVE',
  ) {
    return filterModelosSessaoForModal({
      modelos: modelosRecebidos,
      tipoSessao: tiposSessao.find((item) => item.id === tipoSessaoIdParam) || {
        id: tipoSessaoIdParam,
      },
      equipamento: codigoAeronave,
      tipoDispositivo: tipo || tipoDispositivo,
    });
  }

  async function carregarModelosSessao(
    tipoSessaoIdParam: number,
    codigoAeronave: string,
    origem: 'fetchModelos' | 'fetchModelosComCodigo',
    tipo?: 'SIMULADOR' | 'AERONAVE',
  ) {
    const tipoEfetivo = tipo || tipoDispositivo;
    const comboKey = getModelosComboKey(tipoSessaoIdParam, codigoAeronave, tipoEfetivo);

    if (modelosInFlightRef.current?.comboKey === comboKey) {
      console.log(`⏭️ [${origem}] Requisição já em andamento para`, comboKey);
      return;
    }

    if (modelosLoadedComboRef.current === comboKey && !erroModelosSessao) {
      console.log(`⏭️ [${origem}] Modelos já carregados para`, comboKey);
      return;
    }

    modelosInFlightRef.current?.controller.abort();
    const controller = new AbortController();
    const requestId = ++modelosRequestSeqRef.current;
    modelosInFlightRef.current = { requestId, comboKey, controller };

    try {
      setLoadingModelos(true);
      setErroModelosSessao(null);
      const url = buildModelosSessaoUrl(tipoSessaoIdParam, codigoAeronave, tipoEfetivo);

      console.log(`🔍 [${origem}] Buscando modelos:`, {
        requestId,
        tipoSessaoIdParam,
        modelo_aeronave: codigoAeronave,
        url,
      });

      const data = await fetchJsonComTimeout(url, { signal: controller.signal });

      if (modelosInFlightRef.current?.requestId !== requestId) {
        return;
      }

      console.log(`📦 [${origem}] Resposta recebida:`, data);

      if (data.success) {
        const respostaFiltradaBackend = Array.isArray(data.data) ? data.data : [];
        let modelosAtualizados = filtrarModelosSessaoModal(
          respostaFiltradaBackend,
          tipoSessaoIdParam,
          codigoAeronave,
          tipoEfetivo,
        );

        // Se o backend já retornou itens para a combinação solicitada, mas o filtro local
        // zerou por divergência de metadados legados, priorizamos a resposta filtrada do
        // endpoint para não esconder modelos válidos (sem abrir lista global).
        if (modelosAtualizados.length === 0 && respostaFiltradaBackend.length > 0) {
          modelosAtualizados = respostaFiltradaBackend;
        }

        if (modelosAtualizados.length === 0) {
          const fallbackUrl = buildModelosSessaoUrl(
            tipoSessaoIdParam,
            codigoAeronave,
            tipoEfetivo,
            false,
          );
          const fallbackData = await fetchJsonComTimeout(fallbackUrl, {
            signal: controller.signal,
          });

          if (modelosInFlightRef.current?.requestId !== requestId) {
            return;
          }

          if (fallbackData.success) {
            modelosAtualizados = filtrarModelosSessaoModal(
              fallbackData.data || [],
              tipoSessaoIdParam,
              codigoAeronave,
              tipoEfetivo,
            );
          }
        }

        // Ensure the session's saved template model is always present in the list,
        // even if client-side filtering would exclude it. This fixes the case where
        // a model exists in Gestão but is not returned by the filtered endpoint
        // due to mismatched equipamento/tipo fields.
        const savedTemplateId = isEditMode ? sessao?.template_id : null;
        if (
          savedTemplateId &&
          !modelosAtualizados.some((m: ModeloSessao) => m.id === savedTemplateId)
        ) {
          try {
            const singleRes = await fetch(
              `${API_BASE_URL}/simuladores/modelos-sessao/${savedTemplateId}`,
              { headers: _authHeaders(), cache: 'no-store' },
            );
            if (singleRes.ok) {
              const singleData = await singleRes.json();
              if (singleData?.success && singleData?.data) {
                const fetched = singleData.data;
                // Normalize to the shape expected by the dropdown (ModeloSessao interface):
                // { id, codigo, nome, tipo_sessao_id, tipo_aeronave, tipo, modelo_aeronave,
                //   codigo_aeronave, tipo_sessao_codigo, tipo_sessao_nome }
                const injected: ModeloSessao = {
                  id: fetched.id,
                  codigo: fetched.codigo || '',
                  nome: fetched.nome || '',
                  tipo_sessao_id: fetched.tipo_sessao_id ?? tipoSessaoIdParam,
                  tipo_aeronave: fetched.tipo_aeronave || fetched.modelo_aeronave || codigoAeronave,
                  tipo: fetched.tipo || null,
                  modelo_aeronave: fetched.modelo_aeronave || codigoAeronave || null,
                  codigo_aeronave: fetched.codigo_aeronave || null,
                  tipo_sessao_codigo: fetched.tipo_sessao_codigo || null,
                  tipo_sessao_nome: fetched.tipo_sessao_nome || null,
                };
                modelosAtualizados = [injected, ...modelosAtualizados];
                console.log(`🔧 [${origem}] Modelo salvo #${savedTemplateId} injetado na lista`);
              }
            }
          } catch (e) {
            console.warn(`⚠️ [${origem}] Falha ao buscar modelo #${savedTemplateId}:`, e);
          }
        }

        modelosLoadedComboRef.current = comboKey;
        setModelos(modelosAtualizados);

        if (
          modeloSessaoId &&
          !modelosAtualizados.some((modelo: ModeloSessao) => modelo.id === modeloSessaoId)
        ) {
          // Clear the FK reference (model no longer exists/matches) but PRESERVE
          // temaSessao — the saved theme name is still valid even when the template
          // is not in the current filtered list. Clearing it causes false
          // "Nenhum modelo cadastrado" for sessions that already have a theme.
          setModeloSessaoId(null);
          // Do NOT setTemaSessao('') — legacy theme name stays visible and editable.
        }

        console.log(`✅ [${origem}] ${modelosAtualizados.length} modelos carregados`);
      } else {
        console.error(`❌ [${origem}] API retornou success=false`);
        modelosLoadedComboRef.current = null;
        setErroModelosSessao(
          data?.error || 'Não foi possível carregar os modelos de sessão para esta combinação.',
        );
        // Preserve existing modelos on error to avoid flashing empty state
        // that triggers the legacy warning prematurely
        if (modelos.length === 0) {
          setModelos([]);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        console.log(`🛑 [${origem}] Request ${requestId} abortada (obsoleta)`);
        return;
      }
      console.error(`❌ [${origem}] Erro:`, error);
      modelosLoadedComboRef.current = null;
      setErroModelosSessao(
        error instanceof Error
          ? error.message
          : 'Erro ao carregar modelos de sessão.',
      );
      // Same: only clear if there were no models before
      if (modelos.length === 0) {
        setModelos([]);
      }
    } finally {
      if (modelosInFlightRef.current?.requestId === requestId) {
        modelosInFlightRef.current = null;
        setLoadingModelos(false);
      }
    }
  }

  // ========== FLUXO 4: CARREGAR MODELOS DE SESSÃO ==========
  async function fetchModelos(tipoSessaoIdParam: number) {
    if (!aeronaveCodigo) {
      console.warn('⚠️ [fetchModelos] aeronaveCodigo vazio!');
      // Only clear models if they were never loaded — preserves existing list
      if (modelos.length === 0) setModelos([]);
      return;
    }

    await carregarModelosSessao(tipoSessaoIdParam, aeronaveCodigo, 'fetchModelos', tipoDispositivo);
  }

  // ========== CARREGAR MODELOS COM CÓDIGO DIRETO (PARA MODO EDIÇÃO) ==========
  async function fetchModelosComCodigo(
    tipoSessaoIdParam: number,
    codigoAeronave: string,
    tipo?: 'SIMULADOR' | 'AERONAVE',
  ) {
    if (!codigoAeronave) {
      console.error('❌ [fetchModelosComCodigo] codigoAeronave vazio!');
      // Only clear models if they were never loaded — preserves existing list
      if (modelos.length === 0) setModelos([]);
      return;
    }

    await carregarModelosSessao(tipoSessaoIdParam, codigoAeronave, 'fetchModelosComCodigo', tipo);
  }

  // ========== AUTO-SELECIONAR MODELO BASEADO NO TEMA (EDIÇÃO) ==========
  useEffect(() => {
    if (!isEditMode) return;

    const resolved = resolveEditModeloSelection({
      modelos,
      modeloSessaoId,
      isEditMode,
      templateId: sessao?.template_id,
      temaSessao,
    });

    if (!resolved) {
      // Only finish hydration if we've passed the initial loading phase.
      // sessaoDetalhe !== null means the detail fetch has completed (or fallback was set).
      const detailDone = sessaoDetalhe !== null;
      if (!detailDone) return; // still waiting for detail fetch

      // If models loaded but no match found, finish hydration so form is usable
      if (modelos.length > 0 && !loadingModelos) {
        setEditHydrating(false);
      }
      // If models are empty and no fetch is in flight, finish hydration ONLY if the
      // cascade has actually triggered a model load. tipoSessaoId !== null means Phase 2
      // has identified the session type and called fetchModelosComCodigo.
      // Without this guard, editHydrating can end prematurely (before models have a
      // chance to load), which causes the legacy warning to flash or stick.
      const cascadeTriggeredFetch = tipoSessaoId !== null && aeronaveCodigo !== '';
      if (modelos.length === 0 && !loadingModelos && detailDone && cascadeTriggeredFetch) {
        setEditHydrating(false);
      }
      return;
    }

    setModeloSessaoId(resolved.id);

    if (resolved.temaSessao) {
      setTemaSessao(resolved.temaSessao);
    }

    // Model resolved — hydration complete
    setEditHydrating(false);

    if (resolved.source === 'tema') {
      console.log('✅ [AUTO-SELECT] Modelo selecionado automaticamente:', {
        id: resolved.id,
        nome: resolved.temaSessao,
      });
    } else {
      console.log('✅ [AUTO-SELECT] Modelo selecionado por template_id:', {
        id: resolved.id,
        nome: resolved.temaSessao,
      });
    }
  }, [modelos, temaSessao, modeloSessaoId, isEditMode, sessao?.template_id, loadingModelos]);

  useEffect(() => {
    if (!aeronaveCodigo || checksSelecionados.length === 0 || tiposCheck.length === 0) {
      return;
    }

    const checksNormalizados = filterCompatibleCheckIds(
      checksSelecionados,
      tiposCheck,
      aeronaveCodigo,
    );

    if (checksNormalizados.length !== checksSelecionados.length) {
      setChecksSelecionados(checksNormalizados);
    }
  }, [aeronaveCodigo, checksSelecionados, tiposCheck]);

  useEffect(() => {
    if (
      !isEditMode ||
      !isOpen ||
      !modeloSessaoId ||
      !examinadorId ||
      checksSelecionados.length > 0
    ) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const checksPadrao = await fetchChecksPadraoModelo(modeloSessaoId);
      if (!cancelled && checksPadrao.length > 0) {
        setChecksSelecionados(checksPadrao);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, isOpen, modeloSessaoId, examinadorId, checksSelecionados.length]);

  // ========== FLUXO 5: SELECIONAR MODELO ==========
  async function handleModeloChange(id: string) {
    if (!id) {
      setModeloSessaoId(null);
      setTemaSessao('');
      setChecksSelecionados([]);
      setGerarFichaInstrutor(false);
      setGerarFichaExaminador(false);
      return;
    }

    const modeloId = Number(id);
    const modelo = modelos.find((m) => m.id === modeloId);

    if (modelo) {
      setModeloSessaoId(modeloId);
      setTemaSessao(modelo.nome);

      const checksPadrao = await fetchChecksPadraoModelo(modeloId);
      const nextState = applyModelChangeDefaults({
        modeloAnteriorId: modeloSessaoId,
        modeloId,
        checksPadrao,
      });

      if (nextState) {
        setChecksSelecionados(nextState.checksSelecionados);
        setGerarFichaInstrutor(nextState.gerarFichaInstrutor);
        setGerarFichaExaminador(nextState.gerarFichaExaminador);
      }
    }
  }

  // ========== PARTICIPANTES ==========
  function adicionarParticipante() {
    if (participantes.length < 2) {
      setParticipantes([...participantes, { funcionario_id: null }]);
    }
  }

  function removerParticipante(index: number) {
    setParticipantes(participantes.filter((_, i) => i !== index));
  }

  function atualizarParticipante(
    index: number,
    campo: keyof Participante,
    valor: number | string | null,
  ) {
    const novos = [...participantes];
    (novos[index][campo] as number | string | null) = valor;
    setParticipantes(novos);
  }

  // ========== VALIDAÇÃO ==========
  function validarFormulario(): string | null {
    if (!aeronaveId) return 'Selecione o equipamento';
    if (tipoDispositivo === 'SIMULADOR') {
      if (!simuladorId) return 'Selecione o simulador';
    } else {
      if (!aeronaveRealId) return 'Selecione a aeronave';
    }
    if (!tipoSessaoId) return 'Selecione o tipo de sessão';
    // Modelo só é obrigatório ao criar nova sessão
    if (!isEditMode && !modeloSessaoId) return 'Selecione um modelo de sessão cadastrado';
    if (!temaSessao.trim()) return 'Erro ao carregar tema do modelo';
    if (dataInvalida) return 'Data não existente';
    if (!data) return 'Selecione a data';
    if (!horarioInicio) return 'Informe o horário de início';
    if (!horarioFim) return 'Informe o horário de fim';
    const horarioInicioNormalizado = normalizeTimeInput(horarioInicio);
    const horarioFimNormalizado = normalizeTimeInput(horarioFim);
    if (!horarioInicioNormalizado || !horarioFimNormalizado) {
      return 'Informe horários válidos no formato HH:mm (00:00 até 23:59)';
    }
    if (!instrutorId) return 'Selecione o instrutor';

    // Se selecionou examinador, exige ao menos 1 check
    if (examinadorId && checksSelecionados.length === 0) {
      return 'Selecione pelo menos 1 check para a sessão';
    }

    // Validar pelo menos 1 participante
    const participantesValidos = participantes.filter((p) => p.funcionario_id);
    if (participantesValidos.length === 0) {
      return 'Adicione pelo menos 1 participante';
    }

    // Validar participantes duplicados
    const ids = participantesValidos.map((p) => p.funcionario_id);
    if (new Set(ids).size !== ids.length) {
      return 'Não é permitido o mesmo tripulante duas vezes';
    }

    // Validar horários: apenas garanta que não sejam iguais
    // Permite horarioInicio > horarioFim (significa que passa para próximo dia)
    if (horarioInicioNormalizado === horarioFimNormalizado) {
      return 'Horário de fim deve ser diferente do horário de início';
    }

    return null;
  }

  // ========== SUBMIT ==========
  async function handleSubmit() {
    const erro = validarFormulario();
    if (erro) {
      toast.error(erro);
      return;
    }

    if (isEditMode) {
      const confirmado = await confirmDialog(
        'Ao salvar a sessão novamente, todas as fichas vinculadas voltarão para o início do fluxo. As avaliações, notas e assinaturas atuais serão limpas e o status retornará para "Avaliar tripulante". Deseja continuar?',
        {
          title: 'Confirmar regravação da sessão',
          confirmText: 'Salvar e resetar fichas',
          cancelText: 'Cancelar',
        },
      );

      if (!confirmado) {
        return;
      }
    }

    setLoading(true);

    try {
      const horarioInicioNormalizado = normalizeTimeInput(horarioInicio);
      const horarioFimNormalizado = normalizeTimeInput(horarioFim);
      if (!horarioInicioNormalizado || !horarioFimNormalizado) {
        throw new Error('Horários inválidos. Informe HH:mm.');
      }
      const [hIni, mIni] = horarioInicioNormalizado.split(':').map(Number);
      const [hFim, mFim] = horarioFimNormalizado.split(':').map(Number);
      let duracaoMinutos = hFim * 60 + mFim - (hIni * 60 + mIni);
      // Se duração é negativa, significa que passou para o dia seguinte
      if (duracaoMinutos < 0) {
        duracaoMinutos += 24 * 60; // Adiciona 24 horas
      }

      const tipoSessaoObj = tiposSessao.find((t) => t.id === tipoSessaoId);

      console.log('💾 [SUBMIT] Preparando payload:', {
        tipoSessaoId,
        tipoSessaoObj,
        modeloSessaoId,
        temaSessao,
        aeronaveCodigo,
      });

      const payload = {
        tipo_dispositivo: tipoDispositivo,
        simulador_id: tipoDispositivo === 'SIMULADOR' ? simuladorId : null,
        aeronave_id: tipoDispositivo === 'AERONAVE' ? aeronaveRealId : null,
        modelo_sessao_id: modeloSessaoId,
        data: data,
        horario_inicio: horarioInicioNormalizado,
        horario_fim: horarioFimNormalizado,
        duracao_minutos: duracaoMinutos,
        instrutor_id: instrutorId,
        tipo_sessao: tipoSessaoObj?.codigo || 'TREINAMENTO',
        tipo_aeronave: aeronaveCodigo,
        tema_sessao: temaSessao,
        observacoes: observacoes || null,
        participantes: participantes
          .filter((p) => p.funcionario_id)
          .map((p, index) => ({
            funcionario_id: p.funcionario_id,
            funcao: getFuncaoParticipante(index),
          })),
        ...(examinadorId
          ? {
              examinador_id: examinadorId,
              checks: checksSelecionados,
            }
          : {
              examinador_id: null,
              checks: [],
            }),
        // Fichas especiais: flags independentes (também auto-setados por FAP07/FAP13)
        gerar_ficha_instrutor: gerarFichaInstrutorEfetivo,
        gerar_ficha_examinador: gerarFichaExaminadorEfetivo,
        ...(isEditMode ? { resetar_fluxo_fichas: true } : {}),
      };

      console.log('💾 [SUBMIT] Payload completo:', payload);

      // Se for edição, usar PUT, senão POST
      const url = isEditMode
        ? `${API_BASE_URL}/simuladores/sessoes/${sessao!.id}`
        : `${API_BASE_URL}/simuladores/sessoes`;

      const method = isEditMode ? 'PUT' : 'POST';

      console.log(`💾 [SUBMIT] Enviando ${method} para:`, url);

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        if (error?.code === 'SCHEDULE_CONFLICT') {
          setConflitoModal({
            isOpen: true,
            message:
              error?.error ||
              'Conflito de agendamento detectado. Já existe uma sessão neste horário. Escolha outro horário.',
          });
          return;
        }
        throw new Error(error?.error || `Erro ao ${isEditMode ? 'atualizar' : 'criar'} sessão`);
      }

      const responseData = await res.json();

      console.log('✅ [RESPOSTA] Dados salvos no servidor:', {
        tipo_sessao: responseData.data?.tipo_sessao,
        nome: responseData.data?.nome,
      });

      if (responseData.success) {
        toast.success(sessao ? 'Sessão atualizada com sucesso!' : 'Sessão criada com sucesso!');
        emitirEventoModulo({
          modulo: 'simuladores',
          tipo: 'SIMULADOR_ATUALIZADO',
          funcionarioIds: payload.participantes.map((participante) => participante.funcionario_id),
        });

        // Aguardar para garantir que o servidor processou
        await new Promise((resolve) => setTimeout(resolve, 500));

        onSuccess();
      } else {
        throw new Error(responseData.error || 'Erro ao processar sessão');
      }

      onClose();
      resetForm();
    } catch (error) {
      console.error('Erro ao criar sessão:', error);
      const message = error instanceof Error ? error.message : 'Erro ao criar sessão';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    invalidateModelosCache();
    setTipoDispositivo('SIMULADOR');
    setAeronaveId(null);
    setAeronaveCodigo('');
    setSimuladorId(null);
    setAeronaveRealId(null);
    setAeronavesReaisFiltradas([]);
    setSimuladoresFiltrados([]);
    setTipoSessaoId(null);
    setModeloSessaoId(null);
    setModelos([]);
    setErroModelosSessao(null);
    setTemaSessao('');
    setData('');
    setDataInvalida(false);
    setHorarioInicio('');
    setHorarioFim('');
    setInstrutorId(null);
    setExaminadorId(null);
    setChecksSelecionados([]);
    setGerarFichaInstrutor(false);
    setGerarFichaExaminador(false);
    setObservacoes('');
    setParticipantes(participantesIniciais());
    setModoCompartilhado(false);
    setSharedSessionStep('reserva');
  }

  // ========== AÇÕES EXTRAS (EMAIL, WHATSAPP, DELETE, FICHAS) ==========
  async function handleEnviarEmail() {
    if (!sessao) return;

    try {
      setSendingChannel('email');
      const alertas = await enviarNotificacaoSessao(sessao.id, {
        enviarEmail: true,
        enviarWhatsApp: false,
      });
      const resumo = montarResumoCanal('email', alertas);
      if (resumo.tipo === 'success') toast.success(resumo.mensagem);
      if (resumo.tipo === 'warning') toast.warning(resumo.mensagem);
      if (resumo.tipo === 'error') toast.error(resumo.mensagem);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao enviar notificação por e-mail';
      toast.error(message);
    } finally {
      setSendingChannel(null);
    }
  }

  async function handleEnviarWhatsApp() {
    if (!sessao) return;

    try {
      setSendingChannel('whatsapp');
      const alertas = await enviarNotificacaoSessao(sessao.id, {
        enviarEmail: false,
        enviarWhatsApp: true,
      });
      const resumo = montarResumoCanal('whatsapp', alertas);
      if (resumo.tipo === 'success') toast.success(resumo.mensagem);
      if (resumo.tipo === 'warning') toast.warning(resumo.mensagem);
      if (resumo.tipo === 'error') toast.error(resumo.mensagem);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao enviar notificação por WhatsApp';
      toast.error(message);
    } finally {
      setSendingChannel(null);
    }
  }

  function handleDelete() {
    if (!sessao?.id) return;
    setShowDeleteModal(true);
  }

  function handleConfirmDelete() {
    if (!sessao?.id) return;
    onDelete?.(sessao.id);
    setShowDeleteModal(false);
    onClose();
    resetForm();
  }

  function handleVerFichas() {
    if (!sessao?.id) return;
    onVerFichas?.(sessao.id);
  }

  if (!isOpen) return null;

  const showSharedReservationFields = !modoCompartilhado || sharedSessionStep === 'reserva';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-modal p-4">
      <AlertModal
        isOpen={conflitoModal.isOpen}
        onClose={() => setConflitoModal({ isOpen: false, message: '' })}
        title="Conflito de Agendamento"
        message={conflitoModal.message}
        confirmText="Entendi"
        backdrop={false}
      />
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-2 sm:mx-0">
        {/* ========== HEADER ========== */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isEditMode ? 'Editar Sessão de Treinamento' : 'Nova Sessão de Treinamento'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {isEditMode
                ? 'Atualize os dados da sessão de treinamento'
                : 'Configure a sessão e as manobras serão carregadas automaticamente'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        {/* ========== FORM ========== */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* MODALITY TOGGLE — only in create mode, only when feature is enabled */}
          {!isEditMode && sharedSessionsEnabled && !editHydrating && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Modalidade da sessão
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModoCompartilhado(false);
                    setSharedSessionStep('reserva');
                  }}
                  disabled={loading}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all ${
                    !modoCompartilhado
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Sessão simples
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModoCompartilhado(true);
                    setSharedSessionStep('reserva');
                    if (tipoDispositivo !== 'SIMULADOR') {
                      handleTipoDispositivoChange('SIMULADOR');
                    }
                  }}
                  disabled={loading}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-1 ${
                    modoCompartilhado
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Sessão compartilhada
                </button>
              </div>
            </div>
          )}

          {showSharedReservationFields && (
          <>
          {/* 0️⃣ TIPO DE DISPOSITIVO */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tipo de Sessão de Voo <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleTipoDispositivoChange('SIMULADOR')}
                disabled={loading}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all ${
                  tipoDispositivo === 'SIMULADOR'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                🖥️ Simulador
              </button>
              <button
                type="button"
                onClick={() => handleTipoDispositivoChange('AERONAVE')}
                disabled={loading || modoCompartilhado}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all ${
                  tipoDispositivo === 'AERONAVE'
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                ✈️ Aeronave Real
              </button>
            </div>
            {modoCompartilhado && (
              <p className="mt-1 text-xs text-slate-500">
                Sessões compartilhadas usam uma única reserva de simulador.
              </p>
            )}
          </div>

          {/* 1️⃣ EQUIPAMENTO */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              1. Equipamento <span className="text-red-500">*</span>
            </label>
            <select
              value={aeronaveId || ''}
              onChange={(e) => {
                const id = Number(e.target.value);
                const aeronave = aeronaves.find((a) => a.id === id);
                if (aeronave) handleAeronaveChange(id, aeronave.modelo);
              }}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
              disabled={loading}
            >
              <option value="">Selecione o equipamento</option>
              {aeronaves.map((aer) => (
                <option key={aer.id} value={aer.id}>
                  {aer.modelo} {aer.fabricante ? `(${aer.fabricante})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 2️⃣ SIMULADOR ou AERONAVE REAL */}
          {tipoDispositivo === 'SIMULADOR' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                2. Simulador <span className="text-red-500">*</span>
              </label>
              <select
                value={simuladorId || ''}
                onChange={(e) => handleSimuladorChange(Number(e.target.value))}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
                disabled={loading || !aeronaveId}
              >
                <option value="">
                  {aeronaveId ? 'Selecione o simulador' : 'Selecione o equipamento primeiro'}
                </option>
                {simuladoresFiltrados.map((sim) => (
                  <option key={sim.id} value={sim.id}>
                    {sim.nome} - {sim.modelo}
                  </option>
                ))}
              </select>
              {aeronaveId && simuladoresFiltrados.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ Nenhum simulador disponível para este equipamento
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                2. Aeronave <span className="text-red-500">*</span>
              </label>
              <select
                value={aeronaveRealId || ''}
                onChange={(e) => handleAeronaveRealChange(Number(e.target.value))}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
                disabled={loading || !aeronaveId}
              >
                <option value="">
                  {aeronaveId ? 'Selecione a aeronave' : 'Selecione o equipamento primeiro'}
                </option>
                {aeronavesReaisFiltradas.map((aer) => (
                  <option key={aer.id} value={aer.id}>
                    {aer.prefixo} — {aer.modelo}
                  </option>
                ))}
              </select>
              {aeronaveId && aeronavesReaisFiltradas.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ Nenhuma aeronave cadastrada para este modelo
                </p>
              )}
            </div>
          )}
          </>
          )}

          {!modoCompartilhado && (
          <>
          {/* 3️⃣ TIPO DE SESSÃO */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              3. Tipo de Sessão <span className="text-red-500">*</span>
            </label>
            <select
              value={tipoSessaoId || ''}
              onChange={(e) => handleTipoSessaoChange(Number(e.target.value))}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
              disabled={
                loading ||
                (tipoDispositivo === 'SIMULADOR' ? !simuladorId : !aeronaveRealId)
              }
            >
              <option value="">
                {tipoDispositivo === 'SIMULADOR'
                  ? simuladorId
                    ? 'Selecione o tipo de sessão'
                    : 'Selecione o simulador primeiro'
                  : aeronaveRealId
                    ? 'Selecione o tipo de sessão'
                    : 'Selecione a aeronave primeiro'}
              </option>
              {tiposSessao.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.codigo} - {tipo.nome}
                </option>
              ))}
            </select>
          </div>

          {/* 4️⃣ TEMA DA SESSÃO - SELECIONAR MODELO */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              4. Tema da Sessão <span className="text-red-500">*</span>
            </label>

            {loadingModelos || editHydrating ? (
              <div className="w-full px-4 py-3 border border-slate-300 rounded-lg bg-slate-50 text-slate-500 text-sm">
                🔄 {editHydrating ? 'Carregando dados da sessão...' : 'Carregando modelos disponíveis...'}
              </div>
            ) : modelos.length > 0 ? (
              // Dropdown com modelos disponíveis
              <select
                value={modeloSessaoId || ''}
                onChange={(e) => handleModeloChange(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
                disabled={loading}
              >
                <option value="">Selecione um modelo de sessão</option>
                {modelos.map((modelo) => (
                  <option key={modelo.id} value={modelo.id}>
                    {modelo.codigo} - {modelo.nome}
                  </option>
                ))}
              </select>
            ) : erroModelosSessao ? (
              <div className="w-full px-4 py-3 border border-red-300 rounded-lg bg-red-50 text-red-700 text-sm">
                ⚠️ {erroModelosSessao}
              </div>
            ) : isEditMode && temaSessao ? (
              // Edit mode: session has a saved theme name but the matching template
              // is not in the loaded list (e.g. template filtered out or deleted).
              // Show an editable text input so the user can see/change the theme
              // without a false "no models" error blocking the form.
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={temaSessao}
                  onChange={(e) => setTemaSessao(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary text-sm"
                  placeholder="Tema da sessão"
                  disabled={loading}
                  data-testid="tema-sessao-legado-input"
                />
                <p className="text-xs text-amber-600">
                  ⚠️ Tema preservado da sessão. Modelo original não encontrado nos cadastros atuais — verifique
                  em <strong>Gestão → Modelos de Sessão</strong>.
                </p>
              </div>
            ) : (
              // No models and no saved theme
              <div className="w-full px-4 py-3 border border-amber-300 rounded-lg bg-amber-50 text-amber-700 text-sm">
                {tipoSessaoId
                  ? '⚠️ Nenhum modelo cadastrado para esta combinação. Cadastre um modelo primeiro em '
                  : 'Selecione o tipo de sessão e equipamento para carregar os modelos disponíveis.'}
                {tipoSessaoId && <strong>Gestão → Modelos de Sessão</strong>}
              </div>
            )}
          </div>
          </>
          )}

          {showSharedReservationFields && (
          <>
          {/* 4. DATA E HORÁRIOS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Data <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={data}
                onChange={(e) => {
                  if (e.target.value === '' && e.target.validity.badInput) {
                    setDataInvalida(true);
                    setData('');
                  } else {
                    setDataInvalida(false);
                    setData(e.target.value);
                  }
                }}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary ${
                  dataInvalida ? 'border-red-400 bg-red-50' : 'border-slate-300'
                }`}
                disabled={loading}
              />
              {dataInvalida && <p className="text-xs text-red-600 mt-1">⚠️ Data não existente</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Horário Início <span className="text-red-500">*</span>
              </label>
              <TimeInput
                value={horarioInicio}
                onChange={(v) => {
                  setHorarioInicio(v);
                  if (!horarioFimFoiEditado) {
                    const autoFim = addMinutesToTimeHHMM(v, 120);
                    if (autoFim) setHorarioFim(autoFim);
                  }
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Horário Fim <span className="text-red-500">*</span>
              </label>
              <TimeInput
                value={horarioFim}
                onChange={(v) => {
                  setHorarioFim(v);
                  setHorarioFimFoiEditado(!!v);
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
                disabled={loading}
              />
            </div>
          </div>

          {/* 5. INSTRUTOR */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Instrutor <span className="text-red-500">*</span>
            </label>
            <select
              value={instrutorId || ''}
              onChange={(e) => setInstrutorId(Number(e.target.value))}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
              disabled={loading}
            >
              <option value="">Selecione o instrutor</option>
              {instrutores.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.nome} ({inst.matricula})
                </option>
              ))}
            </select>
            {instrutores.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ Nenhum instrutor encontrado. Configure instrutores em Configurações.
              </p>
            )}
          </div>
          </>
          )}

          {!modoCompartilhado && (
          <>
          {/* 5.1 EXAMINADOR (OPCIONAL) + CHECKS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Examinador (opcional)
              </label>
              <select
                value={examinadorId || ''}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setExaminadorId(v);
                  // Reset checks se remover examinador
                  if (!v) setChecksSelecionados([]);
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
                disabled={loading}
              >
                <option value="">Sem examinador</option>
                {examinadores.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.nome} ({exam.matricula})
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Ao selecionar examinador, esta sessão passa a ser um check.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Checks vinculados
              </label>
              <div
                className={`w-full px-4 py-3 border rounded-lg text-sm ${
                  examinadorId
                    ? 'border-slate-300 bg-white'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                {!examinadorId ? (
                  <span>Selecione um examinador para habilitar</span>
                ) : tiposCheck.length === 0 ? (
                  <span>Nenhum tipo de check disponível</span>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {filtrarChecksPorModelo(tiposCheck).map((check) => (
                      <label key={check.id} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checksSelecionados.includes(check.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setChecksSelecionados([...checksSelecionados, check.id]);
                            } else {
                              setChecksSelecionados(
                                checksSelecionados.filter((id) => id !== check.id),
                              );
                            }
                          }}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-primary/30 focus:ring-1"
                        />
                        <span className="leading-5">
                          <strong>{check.codigo}</strong> — {check.nome}
                          {check.descricao ? (
                            <span className="block text-xs text-slate-500">{check.descricao}</span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {examinadorId && checksSelecionados.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  ⚠️ Se há examinador, selecione ao menos 1 check.
                </p>
              )}
            </div>
          </div>

          {/* 5b. FICHAS ESPECIAIS (Instrutor / Examinador) — visível quando há examinador */}
          {examinadorId && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-800 mb-2 uppercase tracking-wide">
                Fichas adicionais para esta sessão
              </p>
              <p className="text-xs text-blue-700 mb-3">
                Marcando abaixo, uma ficha extra será criada tendo o <strong>instrutor</strong> da
                sessão como avaliado.
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gerarFichaInstrutorEfetivo}
                    onChange={(e) => setGerarFichaInstrutor(e.target.checked)}
                    disabled={hasFap07Selecionada}
                    className="h-4 w-4 rounded border-blue-400 text-blue-600 focus:ring-primary/30"
                  />
                  <span className="text-sm text-blue-900">
                    <strong>Treinamento de Instrutor de Voo</strong>
                    <span className="block text-xs text-blue-600">
                      Gera ficha modelo "TREINAMENTO DE INSTRUTOR DE VOO" — auto-ativado com FAP 07
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gerarFichaExaminadorEfetivo}
                    onChange={(e) => setGerarFichaExaminador(e.target.checked)}
                    disabled={hasFap13Selecionada}
                    className="h-4 w-4 rounded border-blue-400 text-blue-600 focus:ring-primary/30"
                  />
                  <span className="text-sm text-blue-900">
                    <strong>Credenciamento de Examinador</strong>
                    <span className="block text-xs text-blue-600">
                      Gera ficha modelo "CREDENCIAMENTO DE EXAMINADOR" — auto-ativado com FAP 13
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* 6. PARTICIPANTES */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-700">
                Participantes da Sessão <span className="text-red-500">*</span>
              </label>
              {participantes.length < 2 && (
                <button
                  type="button"
                  onClick={adicionarParticipante}
                  disabled={loading}
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium"
                >
                  <Plus size={16} />
                  Adicionar Participante
                </button>
              )}
            </div>

            <div className="space-y-3">
              {participantes.map((part, index) => (
                <div key={index} className="flex items-end gap-3 p-4 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Tripulante {index + 1}
                    </label>
                    <select
                      value={part.funcionario_id || ''}
                      onChange={(e) =>
                        atualizarParticipante(
                          index,
                          'funcionario_id',
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      disabled={loading || !aeronaveId}
                    >
                      <option value="">
                        {aeronaveId ? 'Selecione o tripulante...' : 'Selecione o equipamento primeiro'}
                      </option>
                      {funcionarios.map((func) => (
                        <option key={func.id} value={func.id}>
                          {func.nome} ({func.matricula})
                        </option>
                      ))}
                    </select>
                  </div>

                  {participantes.length > 1 && (
                    <button
                      onClick={() => removerParticipante(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      disabled={loading}
                      title="Remover participante"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500 mt-2">
              Ao escolher a aeronave, a lista mostra apenas os tripulantes cadastrados para ela.
            </p>
          </div>
          </>
          )}

          {showSharedReservationFields && (
          <div>
          {/* 7. OBSERVAÇÕES (OPCIONAL) */}
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Observações (opcional)
            </label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Informações adicionais sobre a sessão..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary resize-none"
              rows={3}
              disabled={loading}
            />
          </div>
          )}

          {modoCompartilhado && (
            <SharedSessionForm
              onClose={onClose}
              onSuccess={onSuccess}
              simuladorId={simuladorId}
              simuladorModelo={aeronaveCodigo || null}
              data={data}
              horarioInicio={horarioInicio}
              horarioFim={horarioFim}
              instrutorId={instrutorId}
              temaSessao={temaSessao}
              observacoes={observacoes}
              funcionarios={funcionarios}
              editSessionId={isEditMode ? sessao?.id : null}
              activeStep={sharedSessionStep}
              onActiveStepChange={setSharedSessionStep}
            />
          )}
        </div>

          {/* ========== FOOTER ========== */}
          {!modoCompartilhado && (
        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center gap-2">
          {isEditMode && (
            <>
              <button
                onClick={handleEnviarEmail}
                disabled={loading || sendingChannel !== null}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-700 bg-white border border-slate-200 hover:bg-emerald-50 rounded-lg transition disabled:opacity-50"
              >
                <Mail size={14} />
                {sendingChannel === 'email' ? 'Enviando...' : 'Email'}
              </button>
              <button
                onClick={handleEnviarWhatsApp}
                disabled={loading || sendingChannel !== null}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 bg-white border border-slate-200 hover:bg-green-50 rounded-lg transition disabled:opacity-50"
              >
                <MessageCircle size={14} />
                {sendingChannel === 'whatsapp' ? 'Enviando...' : 'WhatsApp'}
              </button>
              <button
                onClick={handleVerFichas}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 bg-white border border-slate-200 hover:bg-blue-50 rounded-lg transition disabled:opacity-50"
              >
                <FileText size={14} />
                Fichas
                {sessao?.fichas && sessao.fichas.length > 0 ? ` (${sessao.fichas.length})` : ''}
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
              >
                <Trash2 size={14} />
                Excluir
              </button>
            </>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition disabled:opacity-50"
          >
            {loading
              ? isEditMode
                ? 'Atualizando...'
                : 'Criando sessão...'
              : isEditMode
                ? 'Salvar Alterações'
                : 'Criar Sessão'}
          </button>
        </div>
          )}
      </div>

      {/* Modal de confirmação de exclusão */}
      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        title="Excluir Sessão"
        message="Tem certeza que deseja excluir esta sessão de treinamento? Esta ação não pode ser desfeita."
      />
    </div>
  );
}
