import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { AlertTriangle, CheckCircle2, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { FuncionarioCombobox } from '@/react-app/components/simuladores/FuncionarioCombobox';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import {
  convertSimpleSessionToShared,
  createSharedSession,
  getSharedSession,
  updateSharedSession,
  type SharedSessionPayload,
} from '@/react-app/config/sharedSessions';
import {
  EXAMINER_PRACTICAL_TRAINING_PROGRAM,
  findProgramByCodigo,
  SHARED_SESSION_PROGRAM_GENERICO,
  SHARED_SESSION_PROGRAMS,
  type SharedSessionProgramId,
} from '@/react-app/config/sharedSessionPrograms';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

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
}

type SharedSegmentPurpose =
  | 'SOP_NORMAL'
  | 'SOP_ANORMAL_EMERGENCIA'
  | 'ATUACAO_EXAMINADOR'
  | 'OUTRO';

interface SegmentAssignment {
  id?: number | null;
  pfId: number | null;
  pmId: number | null;
  curricularIds: number[];
  modeloSessaoId: number | null;
  finalidadeCodigo: SharedSegmentPurpose;
}

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
  /**
   * Present only when converting an existing PLANNED simple session into a
   * shared one (modo_compartilhado: false -> true). Mutually exclusive with
   * editSessionId: there is no shared detail to GET yet, so the form seeds
   * its first participant/segment from the simple session's own data instead
   * of fetching, and submits via PUT /sessoes/:id/converter-compartilhada
   * rather than POST/PUT /sessoes/compartilhada.
   */
  conversionSeed?: {
    sessaoId: number;
    participanteId: number | null;
    modeloSessaoId: number | null;
  } | null;
  activeStep?: SharedSessionStep;
  onActiveStepChange?: (step: SharedSessionStep) => void;
  hideFooter?: boolean;
  onStateChange?: (state: SharedSessionFormState) => void;
}

interface SharedDetailParticipant {
  funcionario_id: number;
  funcionario_nome?: string;
  matricula?: string;
  funcao?: 'PIC' | 'SIC';
}

interface SharedDetailSegment {
  id?: number;
  inicio: string;
  fim: string;
  modelo_sessao_id?: number | null;
  finalidade_codigo?: SharedSegmentPurpose | null;
  participantes?: Array<{
    funcionario_id: number;
    funcao: 'PF' | 'PM';
    cumpre_treinamento?: boolean;
  }>;
}

interface SharedDetail {
  participantes?: SharedDetailParticipant[];
  segmentos?: SharedDetailSegment[];
  fichas?: Array<{ id: number; status: string; colaborador_id_aluno?: number }>;
}

const EMPTY_PARTICIPANT: ParticipantState = {
  funcionario: null,
};

const EMPTY_SEGMENT: SegmentAssignment = {
  id: null,
  pfId: null,
  pmId: null,
  curricularIds: [],
  modeloSessaoId: null,
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

/**
 * Canonical identifiers for the examiner practical-training curriculum,
 * sourced from sharedSessionPrograms.ts (the single versioned catalog of
 * program -> codigo mappings). Detection is by `codigo`, never by
 * title/substring — these are stable curricular codes (see migration
 * 0424_examiner_universal_training_fichas), universal across aircraft
 * (modelo_aeronave NULL). Importantly, the *panel* below only appears when
 * the user has explicitly selected this program (or it's already reflected
 * by persisted/seeded segment data) — never merely because these models
 * exist in the tenant's catalog.
 */
const EXAMINER_EVENT_1_CODES = EXAMINER_PRACTICAL_TRAINING_PROGRAM.evento1Codigos;
const EXAMINER_EVENT_2_CODES = EXAMINER_PRACTICAL_TRAINING_PROGRAM.evento2Codigos;
const EXAMINER_MODEL_CODES = new Set([...EXAMINER_EVENT_1_CODES, ...EXAMINER_EVENT_2_CODES]);
const EXAMINER_SEGMENT_MINUTES = 60;
const EXAMINER_RESERVATION_MINUTES = EXAMINER_SEGMENT_MINUTES * 2;

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

function formatModelOption(model: ModeloSessao): string {
  const title = [model.codigo, model.nome].filter(Boolean).join(' - ');
  const details = [
    model.tipo_sessao_codigo || model.tipo_sessao_nome || model.tipo,
    model.modelo_aeronave,
    model.duracao_estimada ? `${model.duracao_estimada} min` : null,
    model.sequencia || model.grupo,
  ].filter(Boolean);
  return details.length > 0 ? `${title} (${details.join(' | ')})` : title;
}

function normalizeCodigo(codigo: string | null | undefined): string {
  return String(codigo || '').trim().toUpperCase();
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
  conversionSeed,
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
  const [hydrating, setHydrating] = useState(Boolean(editSessionId) || Boolean(conversionSeed));
  const [conversionSeeded, setConversionSeeded] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [attemptedSteps, setAttemptedSteps] = useState<Set<SharedSessionStep>>(new Set());
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [modelos, setModelos] = useState<ModeloSessao[]>([]);
  const [loadingModelos, setLoadingModelos] = useState(false);
  const [modelosErro, setModelosErro] = useState<string | null>(null);
  const [hasProtectedFicha, setHasProtectedFicha] = useState(false);
  // null = "not yet explicitly chosen by the user" — the effective program
  // (see effectiveProgramId below) then follows whatever is already
  // reflected by the segments (hydrated or seeded), defaulting to generic.
  // Once the user touches the selector, their choice is authoritative and
  // no longer overridden by segment contents.
  const [userSelectedProgramId, setUserSelectedProgramId] = useState<SharedSessionProgramId | null>(null);

  const participantIds = useMemo(
    () => participants.map((participant) => participant.funcionario?.id ?? null) as [number | null, number | null],
    [participants],
  );

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
      if (!participant.funcionario) {
        errors.push(`Piloto ${index + 1}: selecione o piloto.`);
      }
    });
    if (participantIds[0] && participantIds[0] === participantIds[1]) {
      errors.push('Os dois pilotos devem ser pessoas diferentes.');
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

  const segments = useMemo(() => {
    if (!crewReady || !effectiveSplitTime) return [];
    const split = timeToMinutes(effectiveSplitTime);
    const start = timeToMinutes(horarioInicio);
    const end = timeToMinutes(horarioFim);
    if (split <= start || split >= end) return [];
    return [
      {
        id: segmentAssignments[0].id || undefined,
        inicio: horarioInicio,
        fim: effectiveSplitTime,
        modeloSessaoId: segmentAssignments[0].modeloSessaoId,
        curricularIds: segmentAssignments[0].curricularIds,
        finalidadeCodigo: segmentAssignments[0].finalidadeCodigo,
        participantes: [
          { funcionario_id: segmentAssignments[0].pfId || 0, funcao: 'PF' as const },
          { funcionario_id: segmentAssignments[0].pmId || 0, funcao: 'PM' as const },
        ].filter((role) => role.funcionario_id > 0),
      },
      {
        id: segmentAssignments[1].id || undefined,
        inicio: effectiveSplitTime,
        fim: horarioFim,
        modeloSessaoId: segmentAssignments[1].modeloSessaoId,
        curricularIds: segmentAssignments[1].curricularIds,
        finalidadeCodigo: segmentAssignments[1].finalidadeCodigo,
        participantes: [
          { funcionario_id: segmentAssignments[1].pfId || 0, funcao: 'PF' as const },
          { funcionario_id: segmentAssignments[1].pmId || 0, funcao: 'PM' as const },
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
    segmentAssignments.forEach((segment, index) => {
      const label = `Segmento ${index + 1}`;
      if (!segment.pfId) errors.push(`${label}: selecione o PF.`);
      if (!segment.pmId) errors.push(`${label}: selecione o PM.`);
      if (segment.pfId && segment.pfId === segment.pmId) {
        errors.push(`${label}: PF e PM devem ser pessoas diferentes.`);
      }
      if (segment.curricularIds.length === 0) {
        errors.push(`${label}: selecione ao menos um currículo atendido.`);
      }
      if (segment.curricularIds.length > 0 && !segment.modeloSessaoId) {
        errors.push(`${label}: selecione o modelo de sessão do segmento.`);
      }
    });
    return errors;
  }, [crewReady, effectiveSplitTime, horarioFim, horarioInicio, segmentAssignments]);

  const allErrors = [...reservationErrors, ...participantErrors, ...segmentErrors];

  useEffect(() => {
    if (!splitTime) return;
    const splitMin = timeToMinutes(splitTime);
    const startMin = timeToMinutes(horarioInicio);
    const endMin = timeToMinutes(horarioFim);
    if (!horarioInicio || !horarioFim || splitMin <= startMin || splitMin >= endMin) {
      setSplitTime('');
    }
  }, [horarioInicio, horarioFim, splitTime]);

  const fetchModelos = useCallback(async () => {
    setModelos([]);
    setModelosErro(null);
    if (!simuladorModelo || !simuladorId) return;

    setLoadingModelos(true);
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
      setModelos(Array.isArray(body?.data) ? body.data : []);
    } catch (error) {
      setModelosErro(error instanceof Error ? error.message : 'Erro ao carregar modelos.');
    } finally {
      setLoadingModelos(false);
    }
  }, [simuladorId, simuladorModelo]);

  useEffect(() => {
    if (reservationReady) {
      void fetchModelos();
    } else {
      setModelos([]);
      setModelosErro(null);
    }
  }, [fetchModelos, reservationReady]);

  useEffect(() => {
    const validParticipantIds = participantIds.filter((id): id is number => Boolean(id));
    if (validParticipantIds.length !== 2) return;
    setSegmentAssignments((previous) => {
      const next: [SegmentAssignment, SegmentAssignment] = previous.map((segment, index) => ({
        ...segment,
        pfId: validParticipantIds.includes(Number(segment.pfId))
          ? segment.pfId
          : index === 0
            ? validParticipantIds[0]
            : validParticipantIds[1],
        pmId: validParticipantIds.includes(Number(segment.pmId))
          ? segment.pmId
          : index === 0
            ? validParticipantIds[1]
            : validParticipantIds[0],
        curricularIds: segment.curricularIds.filter((id) => validParticipantIds.includes(Number(id))),
      })) as [SegmentAssignment, SegmentAssignment];
      const unchanged = next.every((segment, index) => {
        const current = previous[index];
        return (
          current.pfId === segment.pfId &&
          current.pmId === segment.pmId &&
          current.modeloSessaoId === segment.modeloSessaoId &&
          current.finalidadeCodigo === segment.finalidadeCodigo &&
          current.id === segment.id &&
          current.curricularIds.length === segment.curricularIds.length &&
          current.curricularIds.every((value, arrayIndex) => value === segment.curricularIds[arrayIndex])
        );
      });
      return unchanged ? previous : next;
    });
  }, [participantIds]);

  // Seeds the first participant/segment from the simple session being
  // converted — runs once (conversionSeeded guard) so it never re-applies
  // and clobbers edits the user already made in this modal session.
  useEffect(() => {
    if (!conversionSeed || conversionSeeded) return;
    setConversionSeeded(true);

    if (conversionSeed.participanteId) {
      const known = funcionarios.find((item) => Number(item.id) === Number(conversionSeed.participanteId));
      if (known) {
        setParticipants((previous) => {
          const next: [ParticipantState, ParticipantState] = [...previous];
          next[0] = { funcionario: known };
          return next;
        });
      }
    }

    if (conversionSeed.modeloSessaoId || conversionSeed.participanteId) {
      const curricularIds = conversionSeed.participanteId ? [conversionSeed.participanteId] : [];
      setSegmentAssignments((previous) => {
        const next: [SegmentAssignment, SegmentAssignment] = [...previous];
        next[0] = { ...next[0], modeloSessaoId: conversionSeed.modeloSessaoId, curricularIds };
        // Segment 2 keeps the same trainee by default (matches "preservar
        // participante" from the simple session) but no modelo — the user
        // picks one when they add the second segment's curriculum, exactly
        // as the reservation-split UI already prompts for.
        next[1] = { ...next[1], curricularIds };
        return next;
      });
    }

    setHydrating(false);
  }, [conversionSeed, conversionSeeded, funcionarios]);

  useEffect(() => {
    if (!editSessionId || conversionSeed) {
      setHydrating(false);
      return;
    }

    let mounted = true;
    void (async () => {
      try {
        const result = await getSharedSession(editSessionId);
        if (!mounted) return;
        if (!result.success || !result.data) throw new Error(result.error || 'Sessão não encontrada.');
        const detail = result.data as SharedDetail;
        const restoredParticipants: [ParticipantState, ParticipantState] = [
          { ...EMPTY_PARTICIPANT },
          { ...EMPTY_PARTICIPANT },
        ];

        for (const participant of detail.participantes || []) {
          const index = participant.funcao === 'SIC' ? 1 : 0;
          const known = funcionarios.find((item) => Number(item.id) === Number(participant.funcionario_id));
          restoredParticipants[index] = {
            funcionario: known || {
              id: Number(participant.funcionario_id),
              nome: participant.funcionario_nome || `Funcionário ${participant.funcionario_id}`,
              matricula: participant.matricula || '',
            },
          };
        }

        setParticipants(restoredParticipants);

        const protectedStatuses = new Set(['APROVADO', 'NAO_APROVADO', 'CONCLUIDA']);
        setHasProtectedFicha(
          (detail.fichas || []).some((ficha) =>
            protectedStatuses.has(String(ficha.status || '').trim().toUpperCase()),
          ),
        );

        const detailSegments = detail.segmentos || [];
        if (detailSegments.length >= 2) {
          const hydratedSplit = String(detailSegments[0].fim || '').slice(0, 5);
          const splitMin = timeToMinutes(hydratedSplit);
          const startMin = timeToMinutes(horarioInicio);
          const endMin = timeToMinutes(horarioFim);
          if (hydratedSplit && splitMin > startMin && splitMin < endMin) {
            setSplitTime(hydratedSplit);
          }
        }

        const restoredSegments = detailSegments.slice(0, 2).map((segment) => {
          const pf = (segment.participantes || []).find((item) => item.funcao === 'PF');
          const pm = (segment.participantes || []).find((item) => item.funcao === 'PM');
          return {
            id: Number(segment.id || 0) || null,
            pfId: pf?.funcionario_id || null,
            pmId: pm?.funcionario_id || null,
            curricularIds: (segment.participantes || [])
              .filter((item) => Boolean(item.cumpre_treinamento))
              .map((item) => Number(item.funcionario_id))
              .sort((left, right) => left - right),
            modeloSessaoId: Number(segment.modelo_sessao_id || 0) || null,
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
  }, [editSessionId, funcionarios, horarioFim, horarioInicio]);

  const modelById = useMemo(() => {
    const map = new Map<number, ModeloSessao>();
    for (const model of modelos) {
      map.set(Number(model.id), model);
    }
    return map;
  }, [modelos]);

  const examinerModelByCode = useMemo(() => {
    const map = new Map<string, ModeloSessao>();
    for (const model of modelos) {
      const codigo = String(model.codigo || '').trim().toUpperCase();
      if (
        (EXAMINER_EVENT_1_CODES as readonly string[]).includes(codigo) ||
        (EXAMINER_EVENT_2_CODES as readonly string[]).includes(codigo)
      ) {
        map.set(codigo, model);
      }
    }
    return map;
  }, [modelos]);

  const examinerEvent1Available =
    examinerModelByCode.has(EXAMINER_EVENT_1_CODES[0]) && examinerModelByCode.has(EXAMINER_EVENT_1_CODES[1]);
  const examinerEvent2Available =
    examinerModelByCode.has(EXAMINER_EVENT_2_CODES[0]) && examinerModelByCode.has(EXAMINER_EVENT_2_CODES[1]);

  // Pure reflection of what the current segments already carry — never used
  // to *decide* the program on its own, only to (a) hydrate the program
  // selector when opening an existing/converting session whose segments
  // already are examiner segments, and (b) know which of a segment's two
  // slots is still safe to clear on an explicit program switch-away.
  const appliedExaminerEvent = useMemo(() => {
    const codes = segmentAssignments
      .map((segment) => (segment.modeloSessaoId ? modelById.get(segment.modeloSessaoId)?.codigo : null))
      .map((codigo) => String(codigo || '').trim().toUpperCase());
    if (codes.includes(EXAMINER_EVENT_1_CODES[0]) || codes.includes(EXAMINER_EVENT_1_CODES[1])) return 1;
    if (codes.includes(EXAMINER_EVENT_2_CODES[0]) || codes.includes(EXAMINER_EVENT_2_CODES[1])) return 2;
    return null;
  }, [modelById, segmentAssignments]);

  // The program actually in effect: the user's explicit choice once made,
  // otherwise whatever the segments already reflect (existing/seeded
  // examiner segments), otherwise generic. Catalog availability
  // (examinerEvent1Available/2Available) never feeds into this — a tenant
  // having EXA-V01..V04 does not, by itself, select this program.
  const effectiveProgramId: SharedSessionProgramId =
    userSelectedProgramId ??
    (appliedExaminerEvent ? EXAMINER_PRACTICAL_TRAINING_PROGRAM.id : SHARED_SESSION_PROGRAM_GENERICO);
  const examinerTemplateVisible = effectiveProgramId === EXAMINER_PRACTICAL_TRAINING_PROGRAM.id;
  const visibleModelos = useMemo(() => {
    const selectedModelIds = new Set(
      segmentAssignments
        .map((segment) => Number(segment.modeloSessaoId || 0))
        .filter((modelId) => modelId > 0),
    );

    return modelos.filter((model) => {
      if (selectedModelIds.has(Number(model.id))) return true;

      const isExaminerModel = EXAMINER_MODEL_CODES.has(normalizeCodigo(model.codigo));
      return effectiveProgramId === EXAMINER_PRACTICAL_TRAINING_PROGRAM.id
        ? isExaminerModel
        : !isExaminerModel;
    });
  }, [effectiveProgramId, modelos, segmentAssignments]);

  const handleProgramSelect = useCallback(
    async (nextProgramId: SharedSessionProgramId) => {
      if (nextProgramId === effectiveProgramId) {
        setUserSelectedProgramId(nextProgramId);
        return;
      }

      if (effectiveProgramId === EXAMINER_PRACTICAL_TRAINING_PROGRAM.id && nextProgramId !== EXAMINER_PRACTICAL_TRAINING_PROGRAM.id) {
        const unpersistedExaminerSegmentIndexes = segmentAssignments
          .map((segment, index) => ({ segment, index }))
          .filter(({ segment }) => !segment.id && findProgramByCodigo(modelById.get(segment.modeloSessaoId ?? -1)?.codigo));

        if (unpersistedExaminerSegmentIndexes.length > 0) {
          const confirmed = await confirmDialog(
            'Trocar o programa remove os segmentos do treinamento de examinador ainda não salvos deste agendamento. Segmentos já salvos não são afetados. Continuar?',
            { title: 'Trocar programa da sessão', confirmText: 'Trocar e remover', cancelText: 'Manter examinador' },
          );
          if (!confirmed) return;

          setSegmentAssignments((previous) => {
            const next = [...previous] as [SegmentAssignment, SegmentAssignment];
            for (const { index } of unpersistedExaminerSegmentIndexes) {
              next[index] = { ...next[index], modeloSessaoId: null, curricularIds: [], finalidadeCodigo: 'OUTRO' };
            }
            return next;
          });
        }
      }

      setUserSelectedProgramId(nextProgramId);
    },
    [effectiveProgramId, modelById, segmentAssignments],
  );

  const reservationMinutes =
    reservationReady && horarioInicio && horarioFim
      ? timeToMinutes(horarioFim) - timeToMinutes(horarioInicio)
      : 0;
  const examinerReservationMatches = reservationMinutes === EXAMINER_RESERVATION_MINUTES;

  const applyExaminerTemplate = useCallback(
    (event: 1 | 2) => {
      const codes = event === 1 ? EXAMINER_EVENT_1_CODES : EXAMINER_EVENT_2_CODES;
      const firstModel = examinerModelByCode.get(codes[0]);
      const secondModel = examinerModelByCode.get(codes[1]);
      if (!firstModel || !secondModel || !reservationReady || !examinerReservationMatches) return;

      const split = minutesToTime(timeToMinutes(horarioInicio) + EXAMINER_SEGMENT_MINUTES);
      setSplitTime(split);

      const traineeId =
        segmentAssignments[0].curricularIds[0] ??
        segmentAssignments[1].curricularIds[0] ??
        participants[0].funcionario?.id ??
        null;
      const traineeIds = traineeId ? [traineeId] : [];

      setSegmentAssignments([
        {
          ...segmentAssignments[0],
          modeloSessaoId: firstModel.id,
          finalidadeCodigo: 'ATUACAO_EXAMINADOR',
          curricularIds: traineeIds,
        },
        {
          ...segmentAssignments[1],
          modeloSessaoId: secondModel.id,
          finalidadeCodigo: 'ATUACAO_EXAMINADOR',
          curricularIds: traineeIds,
        },
      ]);
    },
    [examinerModelByCode, examinerReservationMatches, horarioInicio, participants, reservationReady, segmentAssignments],
  );

  const summary = useMemo(() => {
    return participants
      .filter((participant) => participant.funcionario)
      .map((participant) => {
        const funcionarioId = participant.funcionario!.id;
        let total = 0;
        let pf = 0;
        let pm = 0;
        let curricular = 0;
        const models = new Set<string>();
        for (const segment of segments) {
          const duration = Math.max(0, timeToMinutes(segment.fim) - timeToMinutes(segment.inicio));
          for (const role of segment.participantes) {
            if (role.funcionario_id !== funcionarioId) continue;
            total += duration;
            if (role.funcao === 'PF') pf += duration;
            if (role.funcao === 'PM') pm += duration;
          }
          if (segment.curricularIds.includes(funcionarioId)) {
            curricular += duration;
            const model = segment.modeloSessaoId ? modelById.get(segment.modeloSessaoId) : null;
            if (model?.codigo) models.add(model.codigo);
          }
        }
        return {
          participant,
          total,
          pf,
          pm,
          curricular,
          modelos: Array.from(models),
        };
      });
  }, [modelById, participants, segments]);

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
        setStepMessage('Defina a tripulação antes de configurar os segmentos.');
        return;
      }
      setActiveStep('segmentos');
    },
    [crewReady, markAttempted, reservationReady, setActiveStep],
  );

  const updateParticipant = useCallback((index: 0 | 1, funcionario: Funcionario | null) => {
    setParticipants((previous) => {
      const next: [ParticipantState, ParticipantState] = [...previous];
      next[index] = { funcionario };
      return next;
    });
  }, []);

  const updateSegment = useCallback((index: 0 | 1, updates: Partial<SegmentAssignment>) => {
    setSegmentAssignments((previous) => {
      const next: [SegmentAssignment, SegmentAssignment] = [...previous];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }, []);

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
        })),
        segmentos: segments.map((segment) => ({
          id: segment.id || undefined,
          inicio: segment.inicio,
          fim: segment.fim,
          modelo_sessao_id: segment.modeloSessaoId,
          finalidade_codigo: segment.finalidadeCodigo,
          finalidade_titulo: SEGMENT_PURPOSE_LABELS[segment.finalidadeCodigo],
          participantes: segment.participantes.map((role) => ({
            funcionario_id: role.funcionario_id,
            funcao: role.funcao,
            cumpre_treinamento: segment.curricularIds.includes(role.funcionario_id),
            gera_ficha: segment.curricularIds.includes(role.funcionario_id),
          })),
        })),
      };

      const result = conversionSeed
        ? await convertSimpleSessionToShared(conversionSeed.sessaoId, payload)
        : editSessionId
          ? await updateSharedSession(editSessionId, payload)
          : await createSharedSession(payload);

      if (!result.success) throw new Error(result.error || 'Erro ao salvar sessão compartilhada.');
      toast.success(
        conversionSeed
          ? 'Sessão convertida em compartilhada.'
          : editSessionId
            ? 'Sessão compartilhada atualizada.'
            : 'Sessão compartilhada criada.',
      );
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro inesperado ao salvar.');
    } finally {
      setLoading(false);
    }
  };

  // No deps array (intentional): re-exposes on every render so
  // triggerPrimaryAction always calls the current handleSubmit/requestStep
  // closures. A restricted deps array here previously froze the exposed
  // handle at whatever segment/crew state existed when the user first
  // reached the "segmentos" step — activeStep and requestStep's identity
  // don't change as the user fills in segment fields, so any edit made
  // after that point was silently validated against stale data when this
  // form is driven externally via hideFooter (its only real integration —
  // ModalNovaSessao's own footer button is the sole submit path).
  useImperativeHandle(ref, () => ({
    triggerPrimaryAction: () => {
      if (activeStep === 'tripulacao') {
        requestStep('segmentos');
        return;
      }
      void handleSubmit();
    },
  }));

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
    </div>
  );

  const renderCrewStep = () => (
    <div className="space-y-3" data-testid="shared-step-tripulacao">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Tripulação</h3>
        <p className="text-xs text-slate-500">Defina os dois participantes físicos da reserva. O vínculo curricular será configurado em cada segmento.</p>
      </div>
      {participants.map((participant, index) => (
        <div key={index} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-900">Piloto {index + 1}</p>
            <p className="text-xs text-slate-500">{index === 0 ? 'PIC na reserva' : 'SIC na reserva'}</p>
          </div>
          <FuncionarioCombobox
            onSelect={(selected) => updateParticipant(index as 0 | 1, selected as Funcionario | null)}
            selected={participant.funcionario}
            placeholder={`Buscar piloto ${index + 1}...`}
            required
            disabled={Boolean(editSessionId) || (Boolean(conversionSeed) && index === 0)}
          />
        </div>
      ))}
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
        <p className="text-xs text-slate-500">Cada segmento define PF, PM, modelo curricular e quais participantes cumprem aquele currículo.</p>
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
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <label className="mb-1 block text-xs font-medium text-slate-600">Programa desta sessão</label>
        <select
          aria-label="Programa desta sessão"
          value={effectiveProgramId}
          onChange={(event) => void handleProgramSelect(event.target.value as SharedSessionProgramId)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value={SHARED_SESSION_PROGRAM_GENERICO}>Genérico</option>
          {SHARED_SESSION_PROGRAMS.map((program) => (
            <option key={program.id} value={program.id}>{program.label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          A estrutura de segmentos do treinamento de examinador só aparece quando este programa é
          selecionado — a existência dos modelos EXA-V0X no tenant não a mostra sozinha.
        </p>
      </div>

      {examinerTemplateVisible && (
        <div
          className="rounded-lg border border-indigo-200 bg-indigo-50 p-4"
          data-testid="examiner-template-panel"
        >
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-indigo-900">Treinamento prático de examinador</p>
            {appliedExaminerEvent && (
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white">
                Evento {appliedExaminerEvent} de 2 aplicado
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-indigo-700">
            Cada agendamento físico representa um evento. Aplique a estrutura de 60 minutos por
            segmento no evento correspondente — o segundo evento é configurado em um agendamento
            separado.
          </p>
          {!examinerEvent1Available && !examinerEvent2Available && (
            <p className="mt-2 text-xs text-amber-800" role="status">
              Os modelos EXA-V01..V04 não estão disponíveis neste tenant. A estrutura de examinador
              não pode ser aplicada até que esses modelos existam no catálogo.
            </p>
          )}
          {!examinerReservationMatches && (
            <p className="mt-2 text-xs text-amber-800">
              A reserva precisa ter exatamente {EXAMINER_RESERVATION_MINUTES} minutos (2 × {EXAMINER_SEGMENT_MINUTES} min) para aplicar a estrutura do examinador.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyExaminerTemplate(1)}
              disabled={!examinerEvent1Available || !examinerReservationMatches}
              title={
                !examinerEvent1Available
                  ? 'EXA-V01/EXA-V02 não disponíveis neste tenant'
                  : !examinerReservationMatches
                    ? `Reserva precisa ter exatamente ${EXAMINER_RESERVATION_MINUTES} minutos`
                    : undefined
              }
              className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Aplicar Evento 1 de 2 (EXA-V01 + EXA-V02)
            </button>
            <button
              type="button"
              onClick={() => applyExaminerTemplate(2)}
              disabled={!examinerEvent2Available || !examinerReservationMatches}
              title={
                !examinerEvent2Available
                  ? 'EXA-V03/EXA-V04 não disponíveis neste tenant'
                  : !examinerReservationMatches
                    ? `Reserva precisa ter exatamente ${EXAMINER_RESERVATION_MINUTES} minutos`
                    : undefined
              }
              className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Aplicar Evento 2 de 2 (EXA-V03 + EXA-V04)
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {segments.map((segment, index) => (
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
                  onChange={(event) => updateSegment(index as 0 | 1, { pfId: Number(event.target.value) || null })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                  onChange={(event) => updateSegment(index as 0 | 1, { pmId: Number(event.target.value) || null })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                  onChange={(event) => updateSegment(index as 0 | 1, {
                    finalidadeCodigo: event.target.value as SharedSegmentPurpose,
                  })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {SEGMENT_PURPOSE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-medium text-slate-600">
                Modelo de sessão do segmento
                <select
                  aria-label={`Modelo do segmento ${index + 1}`}
                  value={segmentAssignments[index].modeloSessaoId ?? ''}
                  onChange={(event) => updateSegment(index as 0 | 1, { modeloSessaoId: Number(event.target.value) || null })}
                  disabled={loadingModelos || !simuladorModelo || !simuladorId}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">
                    {!simuladorModelo || !simuladorId
                      ? 'Selecione o equipamento para carregar os modelos'
                      : loadingModelos
                        ? 'Carregando modelos...'
                        : 'Selecione o modelo do segmento'}
                  </option>
                  {visibleModelos.map((model) => (
                    <option key={model.id} value={model.id}>{formatModelOption(model)}</option>
                  ))}
                </select>
                {modelosErro && (
                  <p className="mt-1 text-xs text-red-700">
                    {modelosErro}{' '}
                    <button type="button" className="underline" onClick={() => void fetchModelos()}>
                      Tentar novamente
                    </button>
                  </p>
                )}
              </label>

              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-xs font-medium text-slate-600">Currículos atendidos neste segmento</p>
                <div className="mt-2 space-y-2">
                  {participants.map((participant) => {
                    if (!participant.funcionario) return null;
                    const funcionarioId = participant.funcionario.id;
                    const checked = segmentAssignments[index].curricularIds.includes(funcionarioId);
                    return (
                      <label key={funcionarioId} className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const currentIds = new Set(segmentAssignments[index].curricularIds);
                            if (event.target.checked) currentIds.add(funcionarioId);
                            else currentIds.delete(funcionarioId);
                            updateSegment(index as 0 | 1, {
                              curricularIds: Array.from(currentIds).sort((left, right) => left - right),
                            });
                          }}
                          className="mt-0.5 rounded"
                        />
                        <span>{participant.funcionario.nome}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
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
                  {['Piloto', 'Total', 'PF', 'PM', 'Curricular', 'Modelos curriculares'].map((header) => (
                    <th key={header} className="whitespace-nowrap px-3 py-2 font-medium">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {summary.map(({ participant, total, pf, pm, curricular, modelos }) => (
                  <tr key={participant.funcionario!.id}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{participant.funcionario!.nome}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMinutes(total)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMinutes(pf)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMinutes(pm)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMinutes(curricular)}</td>
                    <td className="px-3 py-2">{modelos.length > 0 ? modelos.join(', ') : '—'}</td>
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
            {loading
              ? 'Salvando...'
              : conversionSeed
                ? 'Converter em sessão compartilhada'
                : editSessionId
                  ? 'Salvar sessão compartilhada'
                  : 'Criar sessão compartilhada'}
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
          {conversionSeed
            ? 'Converter em sessão compartilhada'
            : editSessionId
              ? 'Editar sessão compartilhada'
              : 'Configuração compartilhada'}
        </div>
        <p className="mt-1 text-xs text-indigo-700">
          Uma reserva, dois pilotos e vínculos curriculares independentes por segmento.
        </p>
        {conversionSeed && (
          <p className="mt-1 text-xs text-indigo-700">
            O piloto 1 e o equipamento/horário/observações da sessão original são preservados. A
            conversão só é gravada ao salvar — cancelar não altera a sessão original.
          </p>
        )}
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

      {hasProtectedFicha && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Existem fichas concluídas nesta sessão.
          </div>
          <p className="mt-1">
            O backend preserva segmentos concluídos e pode bloquear alterações incompatíveis com esse histórico.
          </p>
        </div>
      )}

      {renderReservationSummary()}
      {activeStep === 'tripulacao' && renderCrewStep()}
      {activeStep === 'segmentos' && renderSegmentsStep()}
    </section>
  );
});

export default SharedSessionForm;
