import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileText, Users } from 'lucide-react';
import { toast } from 'sonner';
import { FuncionarioCombobox } from '@/react-app/components/simuladores/FuncionarioCombobox';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import {
  createSharedSession,
  getSharedSession,
  updateSharedSession,
  type SharedSessionPayload,
} from '@/react-app/config/sharedSessions';

export type SharedSessionStep = 'tripulacao' | 'segmentos';

export interface SharedSessionFormHandle {
  triggerPrimaryAction: () => void;
}

export interface SharedSessionFormState {
  activeStep: SharedSessionStep;
  loading: boolean;
}

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
}

interface ModeloSessao {
  id: number;
  codigo: string;
  nome: string;
  tipo?: string | null;
  modelo_aeronave?: string | null;
  tipo_sessao_codigo?: string | null;
  tipo_sessao_nome?: string | null;
  duracao_estimada?: number | null;
  sequencia?: string | null;
  grupo?: string | null;
  gera_qualificacao?: number | null;
}

interface ParticipantState {
  funcionario: Funcionario | null;
  cumpreTreinamento: boolean;
  modeloSessaoId: number | null;
  geraFicha: boolean;
}

interface SegmentAssignment {
  pfId: number | null;
  pmId: number | null;
  curricularIds: number[];
  finalidadeCodigo: SharedSegmentPurpose;
}

interface SegmentState {
  inicio: string;
  fim: string;
  atribuicaoFuncionarioId: number | null;
  atribuicaoFuncionarioIds: number[];
  finalidadeCodigo: SharedSegmentPurpose;
  finalidadeTitulo: string;
  funcoes: Array<{ funcionario_id: number; funcao: 'PF' | 'PM' }>;
}

type SharedSegmentPurpose =
  | 'SOP_NORMAL'
  | 'SOP_ANORMAL_EMERGENCIA'
  | 'ATUACAO_EXAMINADOR'
  | 'OUTRO';

interface SharedSessionFormProps {
  onClose: () => void;
  onSuccess: () => void;
  simuladorId: number | null;
  simuladorModelo: string | null;
  simuladorNome?: string | null;
  data: string;
  horarioInicio: string;
  horarioFim: string;
  instrutorId: number | null;
  instrutorNome?: string | null;
  temaSessao: string;
  observacoes: string;
  funcionarios: Funcionario[];
  editSessionId?: number | null;
  activeStep?: SharedSessionStep;
  onActiveStepChange?: (step: SharedSessionStep) => void;
  hideFooter?: boolean;
  onStateChange?: (state: SharedSessionFormState) => void;
}

interface SharedDetailAssignment {
  id: number;
  funcionario_id: number;
  modelo_sessao_id?: number | null;
  modelo_codigo?: string | null;
  modelo_nome?: string | null;
  gera_ficha?: number | boolean;
}

interface SharedDetailParticipant {
  funcionario_id: number;
  funcionario_nome?: string;
  matricula?: string;
  funcao?: 'PIC' | 'SIC';
}

interface SharedDetailSegment {
  inicio: string;
  fim: string;
  atribuicao_curricular_id?: number | null;
  atribuicao_funcionario_ids?: number[];
  finalidade_codigo?: SharedSegmentPurpose | null;
  finalidade_titulo?: string | null;
  funcoes?: Array<{ funcionario_id: number; funcao: 'PF' | 'PM' }>;
}

interface SharedDetail {
  participantes?: SharedDetailParticipant[];
  atribuicoes?: SharedDetailAssignment[];
  segmentos?: SharedDetailSegment[];
}

const EMPTY_PARTICIPANT: ParticipantState = {
  funcionario: null,
  cumpreTreinamento: true,
  modeloSessaoId: null,
  geraFicha: true,
};

const EMPTY_SEGMENT: SegmentAssignment = {
  pfId: null,
  pmId: null,
  curricularIds: [],
  finalidadeCodigo: 'OUTRO',
};

const SEGMENT_PURPOSE_OPTIONS: Array<{ value: SharedSegmentPurpose; label: string }> = [
  { value: 'SOP_NORMAL', label: 'SOP normal' },
  { value: 'SOP_ANORMAL_EMERGENCIA', label: 'SOP anormal/emergencia' },
  { value: 'ATUACAO_EXAMINADOR', label: 'Atuacao examinador' },
  { value: 'OUTRO', label: 'Outro' },
];

const SEGMENT_PURPOSE_LABELS = SEGMENT_PURPOSE_OPTIONS.reduce<Record<SharedSegmentPurpose, string>>(
  (acc, option) => {
    acc[option.value] = option.label;
    return acc;
  },
  {
    SOP_NORMAL: 'SOP normal',
    SOP_ANORMAL_EMERGENCIA: 'SOP anormal/emergencia',
    ATUACAO_EXAMINADOR: 'Atuacao examinador',
    OUTRO: 'Outro',
  },
);

const STEP_LABELS: Record<SharedSessionStep, string> = {
  tripulacao: '1. Tripulação',
  segmentos: '2. Segmentos',
};

function timeToMinutes(value: string): number {
  if (!/^\d{2}:\d{2}$/.test(value)) return Number.NaN;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number): string {
  const hours = String(Math.floor(value / 60) % 24).padStart(2, '0');
  const minutes = String(value % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatMinutes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0h';
  if (value % 60 === 0) return `${value / 60}h`;
  return `${Math.floor(value / 60)}h${String(value % 60).padStart(2, '0')}`;
}

function arraysEqual(left: SegmentAssignment[], right: SegmentAssignment[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatModelOption(model: ModeloSessao): string {
  const title = [model.codigo, model.nome].filter(Boolean).join(' — ');
  const details = [
    model.tipo_sessao_codigo || model.tipo_sessao_nome || model.tipo,
    model.modelo_aeronave,
    model.duracao_estimada ? `${model.duracao_estimada} min` : null,
    model.sequencia || model.grupo,
  ].filter(Boolean);
  return details.length > 0 ? `${title} (${details.join(' · ')})` : title;
}

const SharedSessionForm = forwardRef<SharedSessionFormHandle, SharedSessionFormProps>(function SharedSessionForm({
  onClose,
  onSuccess,
  simuladorId,
  simuladorModelo,
  simuladorNome,
  data,
  horarioInicio,
  horarioFim,
  instrutorId,
  instrutorNome,
  temaSessao,
  observacoes,
  funcionarios,
  editSessionId,
  activeStep: controlledActiveStep,
  onActiveStepChange,
  hideFooter = false,
  onStateChange,
}, ref) {
  const [internalActiveStep, setInternalActiveStep] = useState<SharedSessionStep>('tripulacao');
  const activeStep = controlledActiveStep || internalActiveStep;
  const setActiveStep = useCallback(
    (step: SharedSessionStep) => {
      setInternalActiveStep(step);
      onActiveStepChange?.(step);
    },
    [onActiveStepChange],
  );

  const [participants, setParticipants] = useState<[ParticipantState, ParticipantState]>([
    { ...EMPTY_PARTICIPANT },
    { ...EMPTY_PARTICIPANT },
  ]);
  const [splitTime, setSplitTime] = useState('');
  const [segmentAssignments, setSegmentAssignments] = useState<[SegmentAssignment, SegmentAssignment]>([
    { ...EMPTY_SEGMENT },
    { ...EMPTY_SEGMENT },
  ]);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(Boolean(editSessionId));
  const [submitted, setSubmitted] = useState(false);
  const [attemptedSteps, setAttemptedSteps] = useState<Set<SharedSessionStep>>(new Set());
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [loadingModelos, setLoadingModelos] = useState<[boolean, boolean]>([false, false]);
  const [modelos, setModelos] = useState<[ModeloSessao[], ModeloSessao[]]>([[], []]);
  const [modelosErro, setModelosErro] = useState<[string | null, string | null]>([null, null]);
  const [fichaConcluida, setFichaConcluida] = useState<[boolean, boolean]>([false, false]);

  const participantIds = participants.map((participant) => participant.funcionario?.id ?? null);

  const reservationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!simuladorModelo) errors.push('Selecione o equipamento.');
    if (!simuladorId) errors.push('Selecione o simulador.');
    if (!data) errors.push('Informe a data.');
    if (!horarioInicio || !horarioFim) errors.push('Informe início e fim da reserva.');
    if (
      horarioInicio &&
      horarioFim &&
      timeToMinutes(horarioFim) <= timeToMinutes(horarioInicio)
    ) {
      errors.push('O fim da reserva deve ser posterior ao início.');
    }
    if (!instrutorId) errors.push('Selecione o instrutor.');
    return errors;
  }, [data, horarioFim, horarioInicio, instrutorId, simuladorId, simuladorModelo]);

  const reservationReady = reservationErrors.length === 0;

  const participantErrors = useMemo(() => {
    const errors: string[] = [];
    participants.forEach((participant, index) => {
      const label = `Piloto ${index + 1}`;
      if (!participant.funcionario) errors.push(`${label}: selecione o piloto.`);
      if (participant.cumpreTreinamento && !participant.modeloSessaoId) {
        errors.push(`${label}: selecione o modelo de sessão.`);
      }
    });
    if (participantIds[0] && participantIds[0] === participantIds[1]) {
      errors.push('Os dois pilotos devem ser pessoas diferentes.');
    }
    if (!participants.some((participant) => participant.cumpreTreinamento)) {
      errors.push('Pelo menos um piloto deve ser curricular.');
    }
    return errors;
  }, [participantIds, participants]);

  const crewReady = reservationReady && participantErrors.length === 0;

  const defaultSplitTime = useMemo(() => {
    if (!reservationReady) return '';
    return minutesToTime(
      Math.floor((timeToMinutes(horarioInicio) + timeToMinutes(horarioFim)) / 2),
    );
  }, [horarioFim, horarioInicio, reservationReady]);

  const effectiveSplitTime = splitTime || defaultSplitTime;

  const segments = useMemo((): SegmentState[] => {
    if (!crewReady || !effectiveSplitTime) return [];
    const split = timeToMinutes(effectiveSplitTime);
    const start = timeToMinutes(horarioInicio);
    const end = timeToMinutes(horarioFim);
    // Nunca constrói segmentos com split inválido (fora da janela ou invertido)
    if (split <= start || split >= end) return [];
    return [
      {
        inicio: horarioInicio,
        fim: effectiveSplitTime,
        atribuicaoFuncionarioId: segmentAssignments[0].curricularIds[0] || null,
        atribuicaoFuncionarioIds: segmentAssignments[0].curricularIds,
        finalidadeCodigo: segmentAssignments[0].finalidadeCodigo,
        finalidadeTitulo: SEGMENT_PURPOSE_LABELS[segmentAssignments[0].finalidadeCodigo],
        funcoes: [
          { funcionario_id: segmentAssignments[0].pfId || 0, funcao: 'PF' },
          { funcionario_id: segmentAssignments[0].pmId || 0, funcao: 'PM' },
        ].filter((role) => role.funcionario_id > 0),
      },
      {
        inicio: effectiveSplitTime,
        fim: horarioFim,
        atribuicaoFuncionarioId: segmentAssignments[1].curricularIds[0] || null,
        atribuicaoFuncionarioIds: segmentAssignments[1].curricularIds,
        finalidadeCodigo: segmentAssignments[1].finalidadeCodigo,
        finalidadeTitulo: SEGMENT_PURPOSE_LABELS[segmentAssignments[1].finalidadeCodigo],
        funcoes: [
          { funcionario_id: segmentAssignments[1].pfId || 0, funcao: 'PF' },
          { funcionario_id: segmentAssignments[1].pmId || 0, funcao: 'PM' },
        ].filter((role) => role.funcionario_id > 0),
      },
    ];
  }, [crewReady, effectiveSplitTime, horarioFim, horarioInicio, segmentAssignments]);

  const segmentErrors = useMemo(() => {
    const errors: string[] = [];
    if (!crewReady) return errors;
    const split = timeToMinutes(effectiveSplitTime);
    const start = timeToMinutes(horarioInicio);
    const end = timeToMinutes(horarioFim);
    if (!effectiveSplitTime || split <= start || split >= end) {
      errors.push('A divisão deve ficar dentro do período da reserva.');
    }
    segmentAssignments.forEach((assignment, index) => {
      const label = `Segmento ${index + 1}`;
      if (!assignment.pfId) errors.push(`${label}: selecione o PF.`);
      if (!assignment.pmId) errors.push(`${label}: selecione o PM.`);
      if (assignment.pfId && assignment.pfId === assignment.pmId) {
        errors.push(`${label}: PF e PM devem ser pessoas diferentes.`);
      }
      if (assignment.curricularIds.length === 0) {
        errors.push(`${label}: selecione ao menos um currículo atendido.`);
      }
    });
    return errors;
  }, [crewReady, effectiveSplitTime, horarioFim, horarioInicio, segmentAssignments]);

  const allErrors = [...reservationErrors, ...participantErrors, ...segmentErrors];

  // Revalida o splitTime sempre que o início ou fim da reserva forem alterados.
  // Se o split atual ficar fora da janela, limpa o estado para que o
  // defaultSplitTime (ponto médio) assuma automaticamente.
  useEffect(() => {
    if (!splitTime) return;
    const splitMin = timeToMinutes(splitTime);
    const startMin = timeToMinutes(horarioInicio);
    const endMin = timeToMinutes(horarioFim);
    if (!horarioInicio || !horarioFim || splitMin <= startMin || splitMin >= endMin) {
      setSplitTime('');
    }
  }, [horarioInicio, horarioFim]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearModelos = useCallback((index: 0 | 1) => {
    setModelos((previous) => {
      const next: [ModeloSessao[], ModeloSessao[]] = [...previous];
      next[index] = [];
      return next;
    });
    setModelosErro((previous) => {
      const next: [string | null, string | null] = [...previous];
      next[index] = null;
      return next;
    });
  }, []);

  const fetchModelos = useCallback(
    async (index: 0 | 1, selectedModelId: number | null = null) => {
      clearModelos(index);
      if (!simuladorModelo || !simuladorId) return;

      setLoadingModelos((previous) => {
        const next: [boolean, boolean] = [...previous];
        next[index] = true;
        return next;
      });
      try {
        const params = new URLSearchParams({
          limit: '200',
          tipo: 'SIMULADOR',
          modelo_aeronave: simuladorModelo,
        });
        const response = await fetch(`${API_BASE_URL}/simuladores/modelos-sessao?${params}`, {
          headers: { Authorization: `Bearer ${getAccessToken()}` },
        });
        if (!response.ok) throw new Error(`Erro ao carregar modelos (${response.status})`);
        const body = await response.json();
        const items = Array.isArray(body?.data) ? body.data : [];
        setModelos((previous) => {
          const next: [ModeloSessao[], ModeloSessao[]] = [...previous];
          next[index] = items;
          return next;
        });
        setParticipants((previous) => {
          const next: [ParticipantState, ParticipantState] = [...previous];
          const currentModel = selectedModelId || next[index].modeloSessaoId;
          if (
            currentModel &&
            !items.some((model: ModeloSessao) => Number(model.id) === Number(currentModel))
          ) {
            next[index] = { ...next[index], modeloSessaoId: null };
          }
          return next;
        });
      } catch (error) {
        setModelosErro((previous) => {
          const next: [string | null, string | null] = [...previous];
          next[index] = error instanceof Error ? error.message : 'Erro ao carregar modelos.';
          return next;
        });
      } finally {
        setLoadingModelos((previous) => {
          const next: [boolean, boolean] = [...previous];
          next[index] = false;
          return next;
        });
      }
    },
    [clearModelos, simuladorId, simuladorModelo],
  );

  const updateParticipant = useCallback(
    (index: 0 | 1, updates: Partial<ParticipantState>) => {
      setParticipants((previous) => {
        const next: [ParticipantState, ParticipantState] = [...previous];
        next[index] = { ...next[index], ...updates };
        if ('cumpreTreinamento' in updates) {
          next[index].geraFicha = Boolean(updates.cumpreTreinamento);
          if (!updates.cumpreTreinamento) {
            next[index].modeloSessaoId = null;
          }
        }
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    participants.forEach((participant, index) => {
      const participantIndex = index as 0 | 1;
      if (participant.funcionario && participant.cumpreTreinamento && reservationReady) {
        void fetchModelos(participantIndex, participant.modeloSessaoId);
      } else if (!reservationReady || !participant.cumpreTreinamento) {
        clearModelos(participantIndex);
      }
    });
    // Revalidate lists when the selected simulator/equipment changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationReady, simuladorId, simuladorModelo]);

  useEffect(() => {
    const validParticipantIds = participants
      .map((participant) => participant.funcionario?.id ?? null)
      .filter((id): id is number => Boolean(id));
    const validCurricularIds = participants
      .filter((participant) => participant.funcionario && participant.cumpreTreinamento)
      .map((participant) => participant.funcionario!.id);
    if (validParticipantIds.length !== 2 || validCurricularIds.length === 0) return;
    const defaults: [SegmentAssignment, SegmentAssignment] = [
      {
        pfId: validParticipantIds[0],
        pmId: validParticipantIds[1],
        curricularIds: validCurricularIds,
        finalidadeCodigo: 'SOP_NORMAL',
      },
      {
        pfId: validParticipantIds[1],
        pmId: validParticipantIds[0],
        curricularIds: validCurricularIds,
        finalidadeCodigo: 'SOP_ANORMAL_EMERGENCIA',
      },
    ];
    setSegmentAssignments((previous) => {
      const normalized = previous.map((assignment, index) => ({
        pfId: validParticipantIds.includes(Number(assignment.pfId))
          ? assignment.pfId
          : defaults[index].pfId,
        pmId: validParticipantIds.includes(Number(assignment.pmId))
          ? assignment.pmId
          : defaults[index].pmId,
        curricularIds: assignment.curricularIds.filter((id) => validCurricularIds.includes(Number(id))).length > 0
          ? assignment.curricularIds.filter((id) => validCurricularIds.includes(Number(id)))
          : defaults[index].curricularIds,
        finalidadeCodigo: assignment.finalidadeCodigo || defaults[index].finalidadeCodigo,
      })) as [SegmentAssignment, SegmentAssignment];
      return arraysEqual(previous, normalized) ? previous : normalized;
    });
  }, [participants]);

  useEffect(() => {
    if (!editSessionId) {
      setHydrating(false);
      return;
    }
    let mounted = true;
    void (async () => {
      try {
        const result = await getSharedSession(editSessionId);
        if (!mounted) return;
        if (!result.success || !result.data) throw new Error(result.error || 'Sessão não encontrada.');
        const detail = result.data as SharedDetail & { fichas?: Array<{ id: number; status: string; colaborador_id_aluno?: number }> };
        const restored: [ParticipantState, ParticipantState] = [
          { ...EMPTY_PARTICIPANT },
          { ...EMPTY_PARTICIPANT },
        ];
        const restoredModelos: [ModeloSessao[], ModeloSessao[]] = [[], []];
        for (const participant of detail.participantes || []) {
          const index = participant.funcao === 'SIC' ? 1 : 0;
          const assignment = (detail.atribuicoes || []).find(
            (item) => Number(item.funcionario_id) === Number(participant.funcionario_id),
          );
          const known = funcionarios.find(
            (item) => Number(item.id) === Number(participant.funcionario_id),
          );
          restored[index] = {
            funcionario: known || {
              id: Number(participant.funcionario_id),
              nome: participant.funcionario_nome || `Funcionário ${participant.funcionario_id}`,
              matricula: participant.matricula || '',
            },
            cumpreTreinamento: Boolean(assignment),
            modeloSessaoId: assignment?.modelo_sessao_id || null,
            geraFicha: Boolean(assignment?.gera_ficha),
          };
          if (assignment?.modelo_sessao_id) {
            restoredModelos[index] = [
              {
                id: Number(assignment.modelo_sessao_id),
                codigo: assignment.modelo_codigo || `Modelo #${assignment.modelo_sessao_id}`,
                nome: assignment.modelo_nome || 'Modelo de sessão',
              },
            ];
          }
        }
        setParticipants(restored);
        setModelos(restoredModelos);
        const protectedStatuses = new Set(['APROVADO', 'NAO_APROVADO', 'CONCLUIDA']);
        setFichaConcluida([
          (detail.fichas || []).some(
            (ficha: any) => Number(ficha.colaborador_id_aluno) === restored[0].funcionario?.id && protectedStatuses.has(String(ficha.status || '').trim().toUpperCase()),
          ),
          (detail.fichas || []).some(
            (ficha: any) => Number(ficha.colaborador_id_aluno) === restored[1].funcionario?.id && protectedStatuses.has(String(ficha.status || '').trim().toUpperCase()),
          ),
        ]);
        restored.forEach((participant, index) => {
          if (participant.funcionario && participant.cumpreTreinamento && reservationReady) {
            void fetchModelos(index as 0 | 1, participant.modeloSessaoId);
          }
        });
        const detailSegments = detail.segmentos || [];
        if (detailSegments.length >= 2) {
          const hydratedSplit = String(detailSegments[0].fim || '').slice(0, 5);
          const reservaInicio = String(detail.sessao?.hora_inicio || detail.sessao?.horario_inicio || '').slice(0, 5);
          const reservaFim = String(detail.sessao?.hora_fim || detail.sessao?.horario_fim || '').slice(0, 5);
          const splitMin = timeToMinutes(hydratedSplit);
          const startMin = timeToMinutes(reservaInicio);
          const endMin = timeToMinutes(reservaFim);
          if (hydratedSplit && splitMin > startMin && splitMin < endMin) {
            setSplitTime(hydratedSplit);
          }
          // Se o split carregado estiver fora da reserva atual, deixa vazio
          // para que o defaultSplitTime (ponto médio) assuma automaticamente.
        }
        const restoredSegments = detailSegments.slice(0, 2).map((segment) => {
          const pf = (segment.funcoes || []).find((role) => role.funcao === 'PF');
          const pm = (segment.funcoes || []).find((role) => role.funcao === 'PM');
          const explicitCurricularIds = (segment.atribuicao_funcionario_ids || [])
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0);
          const legacyCurricular = (detail.atribuicoes || []).find(
            (assignment) => Number(assignment.id) === Number(segment.atribuicao_curricular_id),
          );
          return {
            pfId: pf?.funcionario_id || null,
            pmId: pm?.funcionario_id || null,
            curricularIds: explicitCurricularIds.length > 0
              ? explicitCurricularIds
              : legacyCurricular?.funcionario_id
                ? [Number(legacyCurricular.funcionario_id)]
                : [],
            finalidadeCodigo: segment.finalidade_codigo || 'OUTRO',
          };
        });
        if (restoredSegments.length === 2) {
          setSegmentAssignments(restoredSegments as [SegmentAssignment, SegmentAssignment]);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao carregar sessão compartilhada.');
      } finally {
        if (mounted) setHydrating(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [editSessionId, fetchModelos, funcionarios, reservationReady]);

  const modelById = useMemo(() => {
    const map = new Map<number, ModeloSessao>();
    for (const model of modelos.flat()) {
      map.set(Number(model.id), model);
    }
    return map;
  }, [modelos]);

  const summary = useMemo(() => {
    return participants
      .filter((participant) => participant.funcionario)
      .map((participant) => {
        const funcionarioId = participant.funcionario!.id;
        let total = 0;
        let pf = 0;
        let pm = 0;
        let curricular = 0;
        for (const segment of segments) {
          const duration = Math.max(0, timeToMinutes(segment.fim) - timeToMinutes(segment.inicio));
          for (const role of segment.funcoes) {
            if (role.funcionario_id !== funcionarioId) continue;
            total += duration;
            if (role.funcao === 'PF') pf += duration;
            if (role.funcao === 'PM') pm += duration;
          }
          if (segment.atribuicaoFuncionarioIds.includes(funcionarioId)) curricular += duration;
        }
        // Garantia defensiva: o total nunca pode exceder a duração da reserva
        const reservaDuracao = horarioInicio && horarioFim
          ? Math.max(0, timeToMinutes(horarioFim) - timeToMinutes(horarioInicio))
          : 0;
        if (total > reservaDuracao) total = reservaDuracao;
        const model = participant.modeloSessaoId ? modelById.get(participant.modeloSessaoId) : null;
        return { participant, total, pf, pm, curricular, model };
      });
  }, [modelById, participants, segments, horarioInicio, horarioFim]);

  const markAttempted = useCallback((step: SharedSessionStep) => {
    setAttemptedSteps((previous) => {
      const next = new Set(previous);
      next.add(step);
      return next;
    });
  }, []);

  const requestStep = useCallback(
    (step: SharedSessionStep) => {
      setStepMessage(null);
      if (step === 'tripulacao') {
        if (!reservationReady) {
          markAttempted('tripulacao');
          setStepMessage('Complete os dados da reserva para configurar a tripulação.');
          return;
        }
        setActiveStep('tripulacao');
        return;
      }
      if (!reservationReady) {
        markAttempted('tripulacao');
        setActiveStep('tripulacao');
        setStepMessage('Complete os dados da reserva para configurar a tripulação.');
        return;
      }
      if (!crewReady) {
        markAttempted('tripulacao');
        setActiveStep('tripulacao');
        setStepMessage('Defina a tripulação e os modelos de sessão antes de configurar os segmentos.');
        return;
      }
      setActiveStep('segmentos');
    },
    [crewReady, markAttempted, reservationReady, setActiveStep],
  );

  const handleSubmit = async () => {
    setSubmitted(true);
    setAttemptedSteps(new Set(['tripulacao', 'segmentos']));
    if (allErrors.length > 0) {
      toast.error(allErrors[0]);
      if (participantErrors.length > 0) setActiveStep('tripulacao');
      else setActiveStep('segmentos');
      return;
    }
    setLoading(true);
    try {
      const payload: SharedSessionPayload = {
        data,
        hora_inicio: horarioInicio,
        hora_fim: horarioFim,
        simulador_id: simuladorId!,
        instrutor_id: instrutorId!,
        tema_sessao: temaSessao || undefined,
        observacoes: observacoes || undefined,
        participantes: participants.map((participant) => ({
          funcionario_id: participant.funcionario!.id,
          cumpre_treinamento: participant.cumpreTreinamento,
          modelo_sessao_id: participant.cumpreTreinamento ? participant.modeloSessaoId : null,
          gera_ficha: participant.cumpreTreinamento,
        })),
        segmentos: segments.map((segment) => ({
          inicio: segment.inicio,
          fim: segment.fim,
          atribuicao_funcionario_id: segment.atribuicaoFuncionarioId,
          atribuicao_funcionario_ids: segment.atribuicaoFuncionarioIds,
          finalidade_codigo: segment.finalidadeCodigo,
          finalidade_titulo: segment.finalidadeTitulo,
          funcoes: segment.funcoes,
        })),
      };
      const result = editSessionId
        ? await updateSharedSession(editSessionId, payload)
        : await createSharedSession(payload);
      if (!result.success) throw new Error(result.error || 'Erro ao salvar sessão compartilhada.');
      toast.success(editSessionId ? 'Sessão compartilhada atualizada.' : 'Sessão compartilhada criada.');
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro inesperado ao salvar.');
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      triggerPrimaryAction: () => {
        if (activeStep === 'tripulacao') {
          requestStep('segmentos');
          return;
        }
        void handleSubmit();
      },
    }),
    [activeStep, handleSubmit, requestStep],
  );

  useEffect(() => {
    onStateChange?.({ activeStep, loading });
  }, [activeStep, loading, onStateChange]);

  if (hydrating) {
    return <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">Carregando dados da sessão compartilhada...</div>;
  }

  const showParticipantErrors = submitted || attemptedSteps.has('tripulacao');
  const showSegmentErrors = submitted || attemptedSteps.has('segmentos');

  const stepStatus = (step: SharedSessionStep) => {
    if (activeStep === step) return 'current';
    if (step === 'tripulacao') return crewReady ? 'completed' : showParticipantErrors ? 'error' : 'idle';
    return crewReady && segmentErrors.length === 0 ? 'completed' : showSegmentErrors ? 'error' : 'idle';
  };

  const renderErrorList = (errors: string[]) => (
    <ul className="mt-2 list-disc pl-5 text-xs">
      {errors.map((error) => <li key={error}>{error}</li>)}
    </ul>
  );

  const renderReservationSummary = () => (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="shared-reservation-summary">
      <h3 className="text-sm font-semibold text-slate-800">Dados da reserva</h3>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-3">
        <div><span className="font-medium">Equipamento:</span> {simuladorModelo || '—'}</div>
        <div><span className="font-medium">Simulador:</span> {simuladorNome || (simuladorId ? `#${simuladorId}` : '—')}</div>
        <div><span className="font-medium">Data:</span> {data || '—'}</div>
        <div><span className="font-medium">Início:</span> {horarioInicio || '—'}</div>
        <div><span className="font-medium">Fim:</span> {horarioFim || '—'}</div>
        <div><span className="font-medium">Instrutor:</span> {instrutorNome || (instrutorId ? `#${instrutorId}` : '—')}</div>
      </div>
      {!reservationReady && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Complete os dados da reserva acima para configurar a tripulação.
        </div>
      )}
    </div>
  );

  const renderCrewStep = () => (
    <div className="space-y-3" data-testid="shared-step-tripulacao">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Tripulação</h3>
        <p className="text-xs text-slate-500">Defina quem é curricular e selecione o Modelo de Sessão de cada piloto curricular.</p>
      </div>
      {participants.map((participant, index) => {
        const participantIndex = index as 0 | 1;
        const needsEquipment = !simuladorModelo || !simuladorId;
        return (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Piloto {index + 1}</p>
                <p className="text-xs text-slate-500">{index === 0 ? 'PIC na reserva' : 'SIC na reserva'}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                participant.cumpreTreinamento
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {participant.cumpreTreinamento ? 'Curricular' : 'Apoio'}
              </span>
            </div>
            <FuncionarioCombobox
              onSelect={(selected) => {
                updateParticipant(participantIndex, {
                  funcionario: selected as Funcionario | null,
                  modeloSessaoId: null,
                });
                clearModelos(participantIndex);
                if (selected && participant.cumpreTreinamento && reservationReady) {
                  void fetchModelos(participantIndex);
                }
              }}
              selected={participant.funcionario}
              placeholder={`Buscar piloto ${index + 1}...`}
              required
              disabled={Boolean(editSessionId)}
            />
            {participant.funcionario && (
              <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                <label className={`flex items-start gap-2 text-sm text-slate-700 ${fichaConcluida[index] ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={participant.cumpreTreinamento}
                    disabled={fichaConcluida[index]}
                    aria-disabled={fichaConcluida[index]}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      updateParticipant(participantIndex, { cumpreTreinamento: checked });
                      if (checked && reservationReady) void fetchModelos(participantIndex);
                      else clearModelos(participantIndex);
                    }}
                    className="mt-0.5 rounded"
                  />
                  <span>
                    Cumpre treinamento nesta reserva
                    {fichaConcluida[index] ? (
                      <span className="block text-xs text-red-600 font-medium">
                        A ficha deste piloto já foi concluída. A condição curricular não pode mais ser alterada.
                      </span>
                    ) : (
                      <span className="block text-xs text-slate-500">
                        Desmarque para apoio operacional sem ficha e sem progressão curricular.
                      </span>
                    )}
                  </span>
                </label>

                {participant.cumpreTreinamento && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Modelo de Sessão</label>
                    <select
                      aria-label={`Modelo de sessão do piloto ${index + 1}`}
                      value={participant.modeloSessaoId ?? ''}
                      onChange={(event) => updateParticipant(participantIndex, { modeloSessaoId: Number(event.target.value) || null })}
                      disabled={loadingModelos[index] || needsEquipment}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">
                        {needsEquipment
                          ? 'Selecione o equipamento para carregar os modelos'
                          : loadingModelos[index]
                            ? 'Carregando modelos...'
                            : 'Selecione o modelo de sessão'}
                      </option>
                      {modelos[index].map((model) => (
                        <option key={model.id} value={model.id}>{formatModelOption(model)}</option>
                      ))}
                    </select>
                    {!needsEquipment && !loadingModelos[index] && !modelosErro[index] && modelos[index].length === 0 && (
                      <p className="mt-1 text-xs text-amber-700">Nenhum modelo compatível.</p>
                    )}
                    {modelosErro[index] && (
                      <p className="mt-1 text-xs text-red-700">
                        {modelosErro[index]}{' '}
                        <button type="button" className="underline" onClick={() => void fetchModelos(participantIndex, participant.modeloSessaoId)}>
                          Tentar novamente
                        </button>
                      </p>
                    )}
                  </div>
                )}

                <p className={`flex items-center gap-1 text-xs ${participant.cumpreTreinamento ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {participant.cumpreTreinamento ? <FileText className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {participant.cumpreTreinamento
                    ? (participant.modeloSessaoId && modelById.get(participant.modeloSessaoId)?.gera_qualificacao === 1
                      ? 'Gera ficha e qualificação.'
                      : 'Gera ficha. Este modelo não gera qualificação.')
                    : 'Apoio: não gera ficha nem qualificação. As horas PF/PM continuam registradas.'}
                </p>
              </div>
            )}
          </div>
        );
      })}
      {showParticipantErrors && participantErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          {participantErrors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}
      {!hideFooter && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={() => requestStep('segmentos')} disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            Continuar para Segmentos
          </button>
        </div>
      )}
    </div>
  );

  const renderSegmentsStep = () => (
    <div className="space-y-3" data-testid="shared-step-segmentos">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Segmentos operacionais</h3>
        <p className="text-xs text-slate-500">Ajuste a divisão e confirme PF, PM e conteúdo curricular de cada período.</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <label className="mb-1 block text-xs font-medium text-slate-600">Horário de divisão</label>
        <input
          aria-label="Horário de divisão dos segmentos"
          type="time"
          value={effectiveSplitTime}
          min={horarioInicio}
          max={horarioFim}
          onChange={(event) => setSplitTime(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-slate-500">Reserva: {horarioInicio} até {horarioFim}</p>
        {showSegmentErrors && segmentErrors.some((error) => error.startsWith('A divisão')) && (
          <p className="mt-1 text-xs text-red-700">A divisão deve ficar estritamente entre início e fim.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {segments.map((segment, index) => {
          const curricularParticipants = participants.filter(
            (participant) =>
              participant.funcionario &&
              segmentAssignments[index].curricularIds.includes(participant.funcionario.id),
          );
          return (
            <div key={index} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Segmento {index + 1}</p>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  {segment.inicio} - {segment.fim}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <label className="text-xs font-medium text-slate-600">
                  PF
                  <select
                    aria-label={`PF do segmento ${index + 1}`}
                    value={segmentAssignments[index].pfId ?? ''}
                    onChange={(event) => setSegmentAssignments((previous) => {
                      const next: [SegmentAssignment, SegmentAssignment] = [...previous];
                      next[index] = { ...next[index], pfId: Number(event.target.value) || null };
                      return next;
                    })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="">Selecione o PF</option>
                    {participants.map((participant) => participant.funcionario && (
                      <option key={participant.funcionario.id} value={participant.funcionario.id}>{participant.funcionario.nome}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600">
                  PM
                  <select
                    aria-label={`PM do segmento ${index + 1}`}
                    value={segmentAssignments[index].pmId ?? ''}
                    onChange={(event) => setSegmentAssignments((previous) => {
                      const next: [SegmentAssignment, SegmentAssignment] = [...previous];
                      next[index] = { ...next[index], pmId: Number(event.target.value) || null };
                      return next;
                    })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="">Selecione o PM</option>
                    {participants.map((participant) => participant.funcionario && (
                      <option key={participant.funcionario.id} value={participant.funcionario.id}>{participant.funcionario.nome}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Finalidade do segmento
                  <select
                    aria-label={`Finalidade do segmento ${index + 1}`}
                    value={segmentAssignments[index].finalidadeCodigo}
                    onChange={(event) => setSegmentAssignments((previous) => {
                      const next: [SegmentAssignment, SegmentAssignment] = [...previous];
                      next[index] = {
                        ...next[index],
                        finalidadeCodigo: event.target.value as SharedSegmentPurpose,
                      };
                      return next;
                    })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  >
                    {SEGMENT_PURPOSE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <div className="rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-xs font-medium text-slate-600">Currículos atendidos</p>
                  <div className="mt-2 space-y-2">
                    {participants
                      .filter((participant) => participant.cumpreTreinamento && participant.funcionario)
                      .map((participant) => {
                        const funcionarioId = participant.funcionario!.id;
                        const model = participant.modeloSessaoId ? modelById.get(participant.modeloSessaoId) : null;
                        const checked = segmentAssignments[index].curricularIds.includes(funcionarioId);
                        return (
                          <label key={funcionarioId} className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => setSegmentAssignments((previous) => {
                                const next: [SegmentAssignment, SegmentAssignment] = [...previous];
                                const currentIds = new Set(next[index].curricularIds);
                                if (event.target.checked) currentIds.add(funcionarioId);
                                else currentIds.delete(funcionarioId);
                                next[index] = {
                                  ...next[index],
                                  curricularIds: Array.from(currentIds).sort((left, right) => left - right),
                                };
                                return next;
                              })}
                              className="mt-0.5 rounded"
                            />
                            <span>
                              {participant.funcionario!.nome}
                              <span className="block text-slate-500">{model?.codigo || 'Modelo pendente'}</span>
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Currículos: {curricularParticipants.length > 0
                    ? curricularParticipants.map((participant) => {
                      const model = participant.modeloSessaoId ? modelById.get(participant.modeloSessaoId) : null;
                      return `${participant.funcionario!.nome} - ${model?.codigo || 'Modelo pendente'}`;
                    }).join('; ')
                    : 'Pendente'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {showSegmentErrors && segmentErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          {segmentErrors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}

      {summary.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Clock className="h-4 w-4" />
            Resumo por piloto
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  {['Piloto', 'Condição', 'Modelo de Sessão', 'Total', 'PF', 'PM', 'Curricular', 'Ficha', 'Qualificação'].map((header) => (
                    <th key={header} className="whitespace-nowrap px-3 py-2 font-medium">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {summary.map(({ participant, total, pf, pm, curricular, model }) => (
                  <tr key={participant.funcionario!.id}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{participant.funcionario!.nome}</td>
                    <td className="whitespace-nowrap px-3 py-2">{participant.cumpreTreinamento ? 'Curricular' : 'Apoio'}</td>
                    <td className="max-w-56 px-3 py-2">{participant.cumpreTreinamento ? model?.codigo || 'Pendente' : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMinutes(total)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMinutes(pf)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMinutes(pm)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMinutes(curricular)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{participant.cumpreTreinamento ? 'Sim' : 'Não'}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {participant.cumpreTreinamento
                        ? model?.gera_qualificacao === 1
                          ? 'Sim'
                          : 'Não'
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hideFooter ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
          {submitted && allErrors.length > 0 && (
            <p className="mr-auto text-xs text-red-700">{allErrors.length} pendência(s) precisam ser corrigidas antes de salvar.</p>
          )}
          <button type="button" onClick={() => requestStep('tripulacao')} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Voltar para Tripulação
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
          {submitted && allErrors.length > 0 && (
            <p className="mr-auto text-xs text-red-700">{allErrors.length} pendência(s) precisam ser corrigidas antes de salvar.</p>
          )}
          <button type="button" onClick={() => requestStep('tripulacao')} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Voltar para Tripulação
          </button>
          <button type="button" onClick={handleSubmit} disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {loading ? 'Salvando...' : editSessionId ? 'Salvar sessão compartilhada' : 'Criar sessão compartilhada'}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <section className="space-y-5" aria-label="Configuração da sessão compartilhada">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
          <Users className="h-4 w-4" />
          {editSessionId ? 'Editar sessão compartilhada' : 'Configuração compartilhada'}
        </div>
        <p className="mt-1 text-xs text-indigo-700">
          Uma reserva, dois pilotos e atribuições operacionais independentes por segmento.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="list" aria-label="Etapas da sessão compartilhada">
        {(['tripulacao', 'segmentos'] as SharedSessionStep[]).map((step) => {
          const status = stepStatus(step);
          const isCurrent = activeStep === step;
          const icon = status === 'completed' ? '✓' : status === 'error' ? '!' : isCurrent ? '●' : '○';
          return (
            <button
              key={step}
              type="button"
              onClick={() => requestStep(step)}
              aria-current={isCurrent ? 'step' : undefined}
              aria-disabled={step === 'segmentos' ? !crewReady : undefined}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                status === 'completed'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : status === 'error'
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : isCurrent
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center text-[11px]">{icon}</span>
              <span>{STEP_LABELS[step]}</span>
              {status === 'completed' && <CheckCircle2 className="ml-auto h-4 w-4" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {stepMessage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status" aria-live="polite">
          {stepMessage}
        </div>
      )}

      {editSessionId && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          Edição segura: fichas concluídas bloqueiam mudanças curriculares. Antes da conclusão, modelos, segmentos, PF e PM podem ser ajustados.
        </div>
      )}

      {renderReservationSummary()}

      {activeStep === 'tripulacao' && renderCrewStep()}
      {activeStep === 'segmentos' && renderSegmentsStep()}
    </section>
  );
});

export default SharedSessionForm;
