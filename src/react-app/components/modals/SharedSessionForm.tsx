import { useCallback, useEffect, useMemo, useState } from 'react';
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

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
}

interface Treinamento {
  id: number;
  titulo: string;
  qualificacao_tipo_id?: number;
  qualificacao_codigo?: string | null;
  qualificacao_nome?: string | null;
  status: string;
  data_prevista?: string;
}

interface ModeloSessao {
  id: number;
  codigo: string;
  nome: string;
}

interface ParticipantState {
  funcionario: Funcionario | null;
  cumpreTreinamento: boolean;
  treinamentoId: number | null;
  modeloSessaoId: number | null;
  geraFicha: boolean;
}

interface SegmentAssignment {
  pfId: number | null;
  pmId: number | null;
  curricularId: number | null;
}

interface SegmentState {
  inicio: string;
  fim: string;
  atribuicaoFuncionarioId: number | null;
  funcoes: Array<{ funcionario_id: number; funcao: 'PF' | 'PM' }>;
}

interface SharedSessionFormProps {
  onClose: () => void;
  onSuccess: () => void;
  simuladorId: number | null;
  simuladorModelo: string | null;
  data: string;
  horarioInicio: string;
  horarioFim: string;
  instrutorId: number | null;
  temaSessao: string;
  observacoes: string;
  funcionarios: Funcionario[];
  editSessionId?: number | null;
}

interface SharedDetailAssignment {
  id: number;
  funcionario_id: number;
  treinamento_planejado_id?: number | null;
  modelo_sessao_id?: number | null;
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
  treinamentoId: null,
  modeloSessaoId: null,
  geraFicha: true,
};

const EMPTY_SEGMENT: SegmentAssignment = {
  pfId: null,
  pmId: null,
  curricularId: null,
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

function inferTipoSessaoFromTraining(training: Treinamento | null): string | null {
  if (!training) return null;
  const text = [training.titulo, training.qualificacao_nome, training.qualificacao_codigo]
    .map((value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase(),
    )
    .join(' ');

  if (text.includes('INICIAL') || /\bINI\b/.test(text)) return 'INI';
  if (text.includes('PERIODIC') || /\bPER\b/.test(text)) return 'PER';
  if (text.includes('SEMESTR')) return 'SEM';
  if (text.includes('RECORR')) return 'REC';
  if (text.includes('UPGRADE') || /\bUPG\b/.test(text)) return 'UPG';
  if (text.includes('INSTRUTOR') || /\bINS\b/.test(text)) return 'INS';
  if (text.includes('EXAMINADOR') || /\bEXA\b/.test(text)) return 'EXA';
  if (text.includes('CHECK') || /\bCHK\b/.test(text)) return 'CHK';
  return null;
}

function arraysEqual(left: SegmentAssignment[], right: SegmentAssignment[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export default function SharedSessionForm({
  onClose,
  onSuccess,
  simuladorId,
  simuladorModelo,
  data,
  horarioInicio,
  horarioFim,
  instrutorId,
  temaSessao,
  observacoes,
  funcionarios,
  editSessionId,
}: SharedSessionFormProps) {
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
  const [loadingTreinamentos, setLoadingTreinamentos] = useState<[boolean, boolean]>([false, false]);
  const [treinamentos, setTreinamentos] = useState<[Treinamento[], Treinamento[]]>([[], []]);
  const [treinamentosErro, setTreinamentosErro] = useState<[string | null, string | null]>([null, null]);
  const [loadingModelos, setLoadingModelos] = useState<[boolean, boolean]>([false, false]);
  const [modelos, setModelos] = useState<[ModeloSessao[], ModeloSessao[]]>([[], []]);
  const [modelosErro, setModelosErro] = useState<[string | null, string | null]>([null, null]);

  const participantIds = participants.map((participant) => participant.funcionario?.id ?? null);

  const reservationErrors = useMemo(() => {
    const errors: string[] = [];
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
  }, [data, horarioFim, horarioInicio, instrutorId, simuladorId]);

  const reservationReady = reservationErrors.length === 0;

  const participantErrors = useMemo(() => {
    const errors: string[] = [];
    participants.forEach((participant, index) => {
      const label = `Piloto ${index + 1}`;
      if (!participant.funcionario) errors.push(`${label}: selecione o tripulante.`);
      if (participant.cumpreTreinamento && !participant.treinamentoId) {
        errors.push(`${label}: selecione o treinamento planejado.`);
      }
      if (participant.cumpreTreinamento && !participant.modeloSessaoId) {
        errors.push(`${label}: selecione o modelo de sessão.`);
      }
    });
    if (participantIds[0] && participantIds[0] === participantIds[1]) {
      errors.push('Os dois pilotos devem ser pessoas diferentes.');
    }
    if (!participants.some((participant) => participant.cumpreTreinamento)) {
      errors.push('Pelo menos um piloto deve cumprir treinamento.');
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
    return [
      {
        inicio: horarioInicio,
        fim: effectiveSplitTime,
        atribuicaoFuncionarioId: segmentAssignments[0].curricularId,
        funcoes: [
          { funcionario_id: segmentAssignments[0].pfId || 0, funcao: 'PF' },
          { funcionario_id: segmentAssignments[0].pmId || 0, funcao: 'PM' },
        ].filter((role) => role.funcionario_id > 0),
      },
      {
        inicio: effectiveSplitTime,
        fim: horarioFim,
        atribuicaoFuncionarioId: segmentAssignments[1].curricularId,
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
      if (!assignment.curricularId) {
        errors.push(`${label}: selecione a atribuição curricular.`);
      }
    });
    return errors;
  }, [crewReady, effectiveSplitTime, horarioFim, horarioInicio, segmentAssignments]);

  const allErrors = [...reservationErrors, ...participantErrors, ...segmentErrors];

  const clearParticipantLists = useCallback((index: 0 | 1) => {
    setTreinamentos((previous) => {
      const next: [Treinamento[], Treinamento[]] = [...previous];
      next[index] = [];
      return next;
    });
    setTreinamentosErro((previous) => {
      const next: [string | null, string | null] = [...previous];
      next[index] = null;
      return next;
    });
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
    async (index: 0 | 1, training: Treinamento | null) => {
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
      if (!training) return;

      setLoadingModelos((previous) => {
        const next: [boolean, boolean] = [...previous];
        next[index] = true;
        return next;
      });
      try {
        const params = new URLSearchParams({ limit: '200', tipo: 'SIMULADOR' });
        if (simuladorModelo) params.set('modelo_aeronave', simuladorModelo);
        if (training.qualificacao_tipo_id) {
          params.set('qualificacao_tipo_id', String(training.qualificacao_tipo_id));
        }
        const tipoSessaoCodigo = inferTipoSessaoFromTraining(training);
        if (tipoSessaoCodigo) params.set('tipo_sessao_codigo', tipoSessaoCodigo);

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
          if (
            next[index].modeloSessaoId &&
            !items.some((model: ModeloSessao) => Number(model.id) === Number(next[index].modeloSessaoId))
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
    [simuladorModelo],
  );

  const fetchTreinamentos = useCallback(
    async (index: 0 | 1, funcionarioId: number, selectedTrainingId: number | null = null) => {
      setLoadingTreinamentos((previous) => {
        const next: [boolean, boolean] = [...previous];
        next[index] = true;
        return next;
      });
      setTreinamentosErro((previous) => {
        const next: [string | null, string | null] = [...previous];
        next[index] = null;
        return next;
      });
      try {
        const response = await fetch(
          `${API_BASE_URL}/treinamentos/planejados?funcionario_id=${funcionarioId}&source=TURMA&limit=50`,
          { headers: { Authorization: `Bearer ${getAccessToken()}` } },
        );
        if (!response.ok) throw new Error(`Erro ao carregar treinamentos (${response.status})`);
        const body = await response.json();
        const items = Array.isArray(body?.data?.items) ? body.data.items : [];
        setTreinamentos((previous) => {
          const next: [Treinamento[], Treinamento[]] = [...previous];
          next[index] = items;
          return next;
        });
        if (selectedTrainingId) {
          const selected = items.find(
            (training: Treinamento) => Number(training.id) === Number(selectedTrainingId),
          );
          if (selected) await fetchModelos(index, selected);
        }
      } catch (error) {
        setTreinamentosErro((previous) => {
          const next: [string | null, string | null] = [...previous];
          next[index] = error instanceof Error ? error.message : 'Erro ao carregar treinamentos.';
          return next;
        });
      } finally {
        setLoadingTreinamentos((previous) => {
          const next: [boolean, boolean] = [...previous];
          next[index] = false;
          return next;
        });
      }
    },
    [fetchModelos],
  );

  const updateParticipant = useCallback(
    (index: 0 | 1, updates: Partial<ParticipantState>) => {
      setParticipants((previous) => {
        const next: [ParticipantState, ParticipantState] = [...previous];
        next[index] = { ...next[index], ...updates };
        if ('cumpreTreinamento' in updates) {
          next[index].geraFicha = Boolean(updates.cumpreTreinamento);
          if (!updates.cumpreTreinamento) {
            next[index].treinamentoId = null;
            next[index].modeloSessaoId = null;
          }
        }
        if ('treinamentoId' in updates) next[index].modeloSessaoId = null;
        return next;
      });
    },
    [],
  );

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
        curricularId: validCurricularIds[0],
      },
      {
        pfId: validParticipantIds[1],
        pmId: validParticipantIds[0],
        curricularId: validCurricularIds[1] || validCurricularIds[0],
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
        curricularId: validCurricularIds.includes(Number(assignment.curricularId))
          ? assignment.curricularId
          : defaults[index].curricularId,
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
        const detail = result.data as SharedDetail;
        const restored: [ParticipantState, ParticipantState] = [
          { ...EMPTY_PARTICIPANT },
          { ...EMPTY_PARTICIPANT },
        ];
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
            treinamentoId: assignment?.treinamento_planejado_id || null,
            modeloSessaoId: assignment?.modelo_sessao_id || null,
            geraFicha: Boolean(assignment?.gera_ficha),
          };
        }
        setParticipants(restored);
        const detailSegments = detail.segmentos || [];
        if (detailSegments.length >= 2) setSplitTime(String(detailSegments[0].fim || '').slice(0, 5));
        const restoredSegments = detailSegments.slice(0, 2).map((segment) => {
          const pf = (segment.funcoes || []).find((role) => role.funcao === 'PF');
          const pm = (segment.funcoes || []).find((role) => role.funcao === 'PM');
          const curricular = (detail.atribuicoes || []).find(
            (assignment) =>
              Number(assignment.id) === Number(segment.atribuicao_curricular_id),
          );
          return {
            pfId: pf?.funcionario_id || null,
            pmId: pm?.funcionario_id || null,
            curricularId: curricular?.funcionario_id || null,
          };
        });
        if (restoredSegments.length === 2) {
          setSegmentAssignments(restoredSegments as [SegmentAssignment, SegmentAssignment]);
        }
        restored.forEach((participant, index) => {
          if (participant.funcionario && participant.cumpreTreinamento) {
            void fetchTreinamentos(
              index as 0 | 1,
              participant.funcionario.id,
              participant.treinamentoId,
            );
          }
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao carregar sessão compartilhada.');
      } finally {
        if (mounted) setHydrating(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [editSessionId, fetchTreinamentos, funcionarios]);

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
          if (segment.atribuicaoFuncionarioId === funcionarioId) curricular += duration;
        }
        const training = treinamentos.flat().find(
          (item) => Number(item.id) === Number(participant.treinamentoId),
        );
        const model = modelos.flat().find(
          (item) => Number(item.id) === Number(participant.modeloSessaoId),
        );
        return { participant, total, pf, pm, curricular, training, model };
      });
  }, [modelos, participants, segments, treinamentos]);

  const handleSubmit = async () => {
    setSubmitted(true);
    if (allErrors.length > 0) {
      toast.error(allErrors[0]);
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
          treinamento_planejado_id: participant.treinamentoId,
          modelo_sessao_id: participant.modeloSessaoId,
          gera_ficha: participant.geraFicha,
        })),
        segmentos: segments.map((segment) => ({
          inicio: segment.inicio,
          fim: segment.fim,
          atribuicao_funcionario_id: segment.atribuicaoFuncionarioId,
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

  if (hydrating) {
    return <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">Carregando dados da sessão compartilhada...</div>;
  }

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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          ['1. Reserva', reservationReady],
          ['2. Tripulação', crewReady],
          ['3. Segmentos', crewReady && segmentErrors.length === 0],
        ].map(([label, ready]) => (
          <div
            key={String(label)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
              ready
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            {ready ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border border-current" />}
            {label}
          </div>
        ))}
      </div>

      {editSessionId && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          Edição segura: horários, observações, divisão, PF, PM e atribuição por segmento podem ser ajustados. Tripulação, treinamentos, modelos e fichas permanecem preservados.
        </div>
      )}

      {!reservationReady ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Complete equipamento, simulador, data, horários e instrutor acima para configurar a tripulação.
          {submitted && (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {reservationErrors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Tripulação</h3>
            <p className="text-xs text-slate-500">Defina quem cumpre treinamento e quem atua somente como apoio.</p>
          </div>
          {participants.map((participant, index) => {
            const participantIndex = index as 0 | 1;
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
                      treinamentoId: null,
                      modeloSessaoId: null,
                    });
                    clearParticipantLists(participantIndex);
                    if (selected && participant.cumpreTreinamento) {
                      void fetchTreinamentos(participantIndex, selected.id);
                    }
                  }}
                  selected={participant.funcionario}
                  placeholder={`Buscar piloto ${index + 1}...`}
                  required
                  disabled={Boolean(editSessionId)}
                />
                {participant.funcionario && (
                  <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={participant.cumpreTreinamento}
                        disabled={Boolean(editSessionId)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          updateParticipant(participantIndex, { cumpreTreinamento: checked });
                          if (checked) void fetchTreinamentos(participantIndex, participant.funcionario!.id);
                          else clearParticipantLists(participantIndex);
                        }}
                        className="mt-0.5 rounded"
                      />
                      <span>
                        Cumpre treinamento nesta reserva
                        <span className="block text-xs text-slate-500">
                          Desmarque para apoio operacional sem ficha e sem progressão curricular.
                        </span>
                      </span>
                    </label>

                    {participant.cumpreTreinamento && (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Treinamento planejado</label>
                          <select
                            aria-label={`Treinamento planejado do piloto ${index + 1}`}
                            value={participant.treinamentoId ?? ''}
                            onChange={(event) => {
                              const trainingId = Number(event.target.value) || null;
                              updateParticipant(participantIndex, { treinamentoId: trainingId });
                              const selected = treinamentos[index].find(
                                (item) => Number(item.id) === Number(trainingId),
                              );
                              void fetchModelos(participantIndex, selected || null);
                            }}
                            disabled={Boolean(editSessionId) || loadingTreinamentos[index]}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          >
                            <option value="">{loadingTreinamentos[index] ? 'Carregando...' : 'Selecione o treinamento'}</option>
                            {treinamentos[index].map((training) => (
                              <option key={training.id} value={training.id}>
                                {training.titulo || training.qualificacao_nome || `Treinamento #${training.id}`}
                              </option>
                            ))}
                          </select>
                          {!loadingTreinamentos[index] && !treinamentosErro[index] && treinamentos[index].length === 0 && (
                            <p className="mt-1 text-xs text-amber-700">Nenhum treinamento planejado de turma disponível.</p>
                          )}
                          {treinamentosErro[index] && (
                            <p className="mt-1 text-xs text-red-700">
                              {treinamentosErro[index]}{' '}
                              <button type="button" className="underline" onClick={() => void fetchTreinamentos(participantIndex, participant.funcionario!.id)}>
                                Tentar novamente
                              </button>
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Modelo de sessão compatível</label>
                          <select
                            aria-label={`Modelo de sessão do piloto ${index + 1}`}
                            value={participant.modeloSessaoId ?? ''}
                            onChange={(event) => updateParticipant(participantIndex, { modeloSessaoId: Number(event.target.value) || null })}
                            disabled={Boolean(editSessionId) || loadingModelos[index] || !participant.treinamentoId}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          >
                            <option value="">
                              {loadingModelos[index]
                                ? 'Carregando...'
                                : participant.treinamentoId
                                  ? 'Selecione o modelo'
                                  : 'Selecione o treinamento primeiro'}
                            </option>
                            {modelos[index].map((model) => (
                              <option key={model.id} value={model.id}>{model.codigo} - {model.nome}</option>
                            ))}
                          </select>
                          {participant.treinamentoId && !loadingModelos[index] && !modelosErro[index] && modelos[index].length === 0 && (
                            <p className="mt-1 text-xs text-amber-700">Nenhum modelo compatível com qualificação, sequência e equipamento.</p>
                          )}
                          {modelosErro[index] && <p className="mt-1 text-xs text-red-700">{modelosErro[index]}</p>}
                        </div>
                      </div>
                    )}

                    <p className={`flex items-center gap-1 text-xs ${participant.cumpreTreinamento ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {participant.cumpreTreinamento ? <FileText className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                      {participant.cumpreTreinamento ? 'Gera ficha e progressão conforme o segmento curricular.' : 'Apoio: não gera ficha nem progressão.'}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
          {submitted && participantErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
              {participantErrors.map((error) => <p key={error}>{error}</p>)}
            </div>
          )}
        </div>
      )}

      {crewReady && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Segmentos operacionais</h3>
            <p className="text-xs text-slate-500">Ajuste a divisão e confirme PF, PM e a atribuição curricular de cada período.</p>
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
            {segmentErrors.some((error) => error.startsWith('A divisão')) && (
              <p className="mt-1 text-xs text-red-700">A divisão deve ficar estritamente entre início e fim.</p>
            )}
          </div>

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
                    Atribuição curricular
                    <select
                      aria-label={`Atribuição curricular do segmento ${index + 1}`}
                      value={segmentAssignments[index].curricularId ?? ''}
                      onChange={(event) => setSegmentAssignments((previous) => {
                        const next: [SegmentAssignment, SegmentAssignment] = [...previous];
                        next[index] = { ...next[index], curricularId: Number(event.target.value) || null };
                        return next;
                      })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="">Selecione a atribuição</option>
                      {participants
                        .filter((participant) => participant.cumpreTreinamento && participant.funcionario)
                        .map((participant) => (
                          <option key={participant.funcionario!.id} value={participant.funcionario!.id}>{participant.funcionario!.nome}</option>
                        ))}
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </div>
          {submitted && segmentErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
              {segmentErrors.map((error) => <p key={error}>{error}</p>)}
            </div>
          )}
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
                  {['Piloto', 'Condição', 'Treinamento / modelo', 'Total', 'PF', 'PM', 'Curricular', 'Ficha / progressão'].map((header) => (
                    <th key={header} className="whitespace-nowrap px-3 py-2 font-medium">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {summary.map(({ participant, total, pf, pm, curricular, training, model }) => (
                  <tr key={participant.funcionario!.id}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{participant.funcionario!.nome}</td>
                    <td className="whitespace-nowrap px-3 py-2">{participant.cumpreTreinamento ? 'Curricular' : 'Apoio'}</td>
                    <td className="max-w-56 px-3 py-2">{participant.cumpreTreinamento ? `${training?.titulo || 'Pendente'} / ${model?.codigo || 'Pendente'}` : 'Não se aplica'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{total} min</td>
                    <td className="whitespace-nowrap px-3 py-2">{pf} min</td>
                    <td className="whitespace-nowrap px-3 py-2">{pm} min</td>
                    <td className="whitespace-nowrap px-3 py-2">{curricular} min</td>
                    <td className="whitespace-nowrap px-3 py-2">{participant.cumpreTreinamento ? 'Sim / Sim' : 'Não / Não'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
        {submitted && allErrors.length > 0 && (
          <p className="mr-auto text-xs text-red-700">{allErrors.length} pendência(s) precisam ser corrigidas antes de salvar.</p>
        )}
        <button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Cancelar
        </button>
        <button type="button" onClick={handleSubmit} disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {loading ? 'Salvando...' : editSessionId ? 'Salvar sessão compartilhada' : 'Criar sessão compartilhada'}
        </button>
      </div>
    </section>
  );
}
