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
  cumpre_treinamento: boolean;
  treinamento_planejado_id: number | null;
  modelo_sessao_id: number | null;
  gera_ficha: boolean;
}

interface SegmentAssignment {
  id?: number | null;
  pfId: number | null;
  pmId: number | null;
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
  cumpre_treinamento: true,
  treinamento_planejado_id: null,
  modelo_sessao_id: null,
  gera_ficha: true,
};

const EMPTY_SEGMENT: SegmentAssignment = {
  id: null,
  pfId: null,
  pmId: null,
};

const STEP_LABELS: Record<SharedSessionStep, string> = {
  tripulacao: '1. Tripulação e Fichas',
  segmentos: '2. Distribuição PF/PM',
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
        errors.push(`Tripulante ${index + 1}: selecione o tripulante.`);
      }
      if (participant.cumpre_treinamento && !participant.modelo_sessao_id) {
        errors.push(`Tripulante ${index + 1}: selecione o modelo da ficha.`);
      }
    });
    if (participantIds[0] && participantIds[0] === participantIds[1]) {
      errors.push('Os dois tripulantes devem ser pessoas diferentes.');
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
        participantes: [
          { funcionario_id: segmentAssignments[0].pfId || 0, funcao: 'PF' as const },
          { funcionario_id: segmentAssignments[0].pmId || 0, funcao: 'PM' as const },
        ].filter((role) => role.funcionario_id > 0),
      },
      {
        id: segmentAssignments[1].id || undefined,
        inicio: effectiveSplitTime,
        fim: horarioFim,
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
      errors.push('O horário da troca deve ficar dentro do período da reserva.');
    }
    segmentAssignments.forEach((segment, index) => {
      const label = `Período ${index + 1}`;
      if (!segment.pfId) errors.push(`${label}: selecione o PF.`);
      if (!segment.pmId) errors.push(`${label}: selecione o PM.`);
      if (segment.pfId && segment.pfId === segment.pmId) {
        errors.push(`${label}: PF e PM devem ser pessoas diferentes.`);
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
        ativo: '1',
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
      })) as [SegmentAssignment, SegmentAssignment];
      const unchanged = next.every((segment, index) => {
        const current = previous[index];
        return (
          current.pfId === segment.pfId &&
          current.pmId === segment.pmId &&
          current.id === segment.id
        );
      });
      return unchanged ? previous : next;
    });
  }, [participantIds]);

  useEffect(() => {
    if (!conversionSeed || conversionSeeded) return;
    setConversionSeeded(true);

    if (conversionSeed.participanteId) {
      const known = funcionarios.find((item) => Number(item.id) === Number(conversionSeed.participanteId));
      if (known) {
        setParticipants((previous) => {
          const next: [ParticipantState, ParticipantState] = [...previous];
          next[0] = { ...next[0], funcionario: known, modelo_sessao_id: conversionSeed.modeloSessaoId || null };
          return next;
        });
      }
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
          
          let cumpre = false;
          let modeloId = null;
          let geraFicha = false;
          
          for (const seg of detail.segmentos || []) {
             const p = (seg.participantes || []).find(x => Number(x.funcionario_id) === Number(participant.funcionario_id));
             if (p?.cumpre_treinamento) {
               cumpre = true;
               geraFicha = true;
               if (seg.modelo_sessao_id) {
                 modeloId = seg.modelo_sessao_id;
               }
             }
          }

          restoredParticipants[index] = {
            funcionario: known || {
              id: Number(participant.funcionario_id),
              nome: participant.funcionario_nome || `Funcionário ${participant.funcionario_id}`,
              matricula: participant.matricula || '',
            },
            cumpre_treinamento: cumpre,
            modelo_sessao_id: modeloId,
            gera_ficha: geraFicha,
            treinamento_planejado_id: null,
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
        }
        
        if (participant.cumpre_treinamento) {
          curricular = total;
          const model = participant.modelo_sessao_id ? modelById.get(participant.modelo_sessao_id) : null;
          if (model?.codigo) models.add(model.codigo);
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

  const updateParticipant = useCallback((index: 0 | 1, updates: Partial<ParticipantState>) => {
    setParticipants((previous) => {
      const next: [ParticipantState, ParticipantState] = [...previous];
      next[index] = { ...next[index], ...updates };
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
          cumpre_treinamento: participant.cumpre_treinamento,
          treinamento_planejado_id: participant.treinamento_planejado_id,
          modelo_sessao_id: participant.modelo_sessao_id,
          gera_ficha: participant.gera_ficha,
        })),
        segmentos: segments.map((segment) => ({
          id: segment.id || undefined,
          inicio: segment.inicio,
          fim: segment.fim,
          funcoes: segment.participantes.map((role) => ({
            funcionario_id: role.funcionario_id,
            funcao: role.funcao,
          })),
          atribuicao_funcionario_ids: participants
             .filter(p => p.cumpre_treinamento)
             .map(p => p.funcionario!.id),
          finalidade_codigo: 'OUTRO',
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
        setStepMessage('Defina a tripulação e seus currículos antes de configurar a distribuição operacional.');
        return;
      }
      setActiveStep('segmentos');
    },
    [crewReady, markAttempted, reservationReady, setActiveStep],
  );

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
        <h3 className="text-sm font-semibold text-slate-800">Tripulação e Currículos</h3>
        <p className="text-xs text-slate-500">Cada tripulante recebe um modelo de sessão, que abrange todo o tempo da reserva.</p>
      </div>
      {participants.map((participant, index) => (
        <div key={index} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-900">Tripulante {index + 1}</p>
          </div>
          <FuncionarioCombobox
            onSelect={(selected) => updateParticipant(index as 0 | 1, { funcionario: selected as Funcionario | null })}
            selected={participant.funcionario}
            placeholder={`Buscar tripulante ${index + 1}...`}
            required
            disabled={Boolean(editSessionId) || (Boolean(conversionSeed) && index === 0)}
          />

          {participant.funcionario && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">
                Cumpre treinamento
                <select
                  value={participant.cumpre_treinamento ? 'sim' : 'nao'}
                  onChange={(e) => {
                     const cumpre = e.target.value === 'sim';
                     updateParticipant(index as 0 | 1, { 
                       cumpre_treinamento: cumpre, 
                       gera_ficha: cumpre ? participant.gera_ficha : false, 
                       modelo_sessao_id: cumpre ? participant.modelo_sessao_id : null 
                     });
                  }}
                  disabled={hasProtectedFicha}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="sim">Sim</option>
                  <option value="nao">Não, atua apenas como apoio</option>
                </select>
              </label>

              {participant.cumpre_treinamento && (
                <>
                  <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                    Modelo da ficha
                    <select
                      value={participant.modelo_sessao_id || ''}
                      onChange={(e) => updateParticipant(index as 0 | 1, { modelo_sessao_id: Number(e.target.value) || null })}
                      disabled={loadingModelos || !simuladorModelo || !simuladorId || hasProtectedFicha}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Selecione o modelo</option>
                      {modelos.map(model => (
                        <option key={model.id} value={model.id}>{formatModelOption(model)}</option>
                      ))}
                    </select>
                  </label>

                  <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-600">
                      <span className="font-medium">Período curricular:</span>{' '}
                      {reservationReady ? `${horarioInicio} às ${horarioFim}` : '—'}
                      <span className="mx-2">•</span>
                      <span className="font-medium">Carga:</span>{' '}
                      {reservationReady ? formatMinutes(timeToMinutes(horarioFim) - timeToMinutes(horarioInicio)) : '—'}
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={participant.gera_ficha}
                        onChange={(e) => updateParticipant(index as 0 | 1, { gera_ficha: e.target.checked })}
                        disabled={hasProtectedFicha}
                        className="rounded"
                      />
                      Gera ficha
                    </label>
                  </div>
                </>
              )}
            </div>
          )}
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
        <h3 className="text-sm font-semibold text-slate-800">Distribuição Operacional PF/PM</h3>
        <p className="text-xs text-slate-500">Defina o momento da troca entre PF e PM. A carga curricular das fichas não será dividida, ela abrangerá todo o período.</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <label className="mb-1 block text-xs font-medium text-slate-600">Horário da troca (divisão PF/PM)</label>
        <input
          aria-label="Horário da troca"
          type="time"
          value={effectiveSplitTime}
          min={horarioInicio}
          max={horarioFim}
          onChange={(event) => setSplitTime(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-slate-500">Reserva: {horarioInicio} até {horarioFim}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {segments.map((segment, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Período {index + 1}</p>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                {segment.inicio} - {segment.fim}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <label className="text-xs font-medium text-slate-600">
                PF
                <select
                  aria-label={`PF do período ${index + 1}`}
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
                  aria-label={`PM do período ${index + 1}`}
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
        <div className="space-y-2 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Clock className="h-4 w-4" />
            Resumo final
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Tripulante</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Total</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">PF</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">PM</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Curricular</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Modelo da ficha</th>
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
            Voltar para Tripulação e Fichas
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
          {submitted && allErrors.length > 0 && (
            <p className="mr-auto text-xs text-red-700">{allErrors.length} pendência(s) precisam ser corrigidas antes de salvar.</p>
          )}
          <button type="button" onClick={() => requestStep('tripulacao')} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Voltar para Tripulação e Fichas
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
          Uma reserva, dois tripulantes e vínculos curriculares cobrindo todo o período da sessão.
        </p>
        {conversionSeed && (
          <p className="mt-1 text-xs text-indigo-700">
            O tripulante 1 e o equipamento/horário/observações da sessão original são preservados. A
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
            O sistema bloqueia alterações na estrutura de segmentos se houver conflito com o histórico já preenchido e assinado.
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
