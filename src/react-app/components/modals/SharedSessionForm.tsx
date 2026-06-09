/**
 * SharedSessionForm — Form for creating/editing shared simulator sessions.
 *
 * This component is designed to be embedded inside ModalNovaSessao
 * when the user selects "Sessão compartilhada" modality.
 *
 * It handles:
 *  - Two participants with curricular/support toggle
 *  - Segment editor with PF/PM roles
 *  - Auto-calculated summary
 *  - Submit to the shared session API
 */

import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Users, Clock, FileText, AlertTriangle } from 'lucide-react';
import { FuncionarioCombobox } from '@/react-app/components/simuladores/FuncionarioCombobox';
import { createSharedSession, updateSharedSession, type SharedSessionPayload, type SharedSessionParticipant, type SharedSessionSegment } from '@/react-app/config/sharedSessions';

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
}

interface SharedSessionFormProps {
  /** Modal close callback */
  onClose: () => void;
  /** Success callback (triggers refresh) */
  onSuccess: () => void;
  /** Shared data from parent modal */
  simuladorId: number | null;
  data: string;
  horarioInicio: string;
  horarioFim: string;
  instrutorId: number | null;
  temaSessao: string;
  observacoes: string;
  /** Available funcionarios (passed from parent) */
  funcionarios: Funcionario[];
  /** Available modelos_sessao (passed from parent) */
  modelos: Array<{ id: number; codigo: string; nome: string }>;
  /** Available treinamentos (passed from parent) */
  treinamentos: Array<{ id: number; titulo: string; funcionario_id?: number }>;
  /** Edit mode: existing session id */
  editSessionId?: number | null;
  /** Edit mode: preloaded shared session detail */
  editSessionData?: any;
}

interface ParticipantState {
  funcionario: Funcionario | null;
  cumpreTreinamento: boolean;
  treinamentoId: number | null;
  modeloSessaoId: number | null;
  geraFicha: boolean;
}

interface SegmentState {
  inicio: string;
  fim: string;
  atribuicaoFuncionarioId: number | null;
  funcoes: Array<{ funcionario_id: number; funcao: 'PF' | 'PM' }>;
}

interface SummaryItem {
  funcionarioId: number;
  nome: string;
  totalMinutos: number;
  pfMinutos: number;
  pmMinutos: number;
  curricularMinutos: number;
  cumpreTreinamento: boolean;
  geraFicha: boolean;
}

const EMPTY_PARTICIPANT: ParticipantState = {
  funcionario: null,
  cumpreTreinamento: true,
  treinamentoId: null,
  modeloSessaoId: null,
  geraFicha: true,
};

export default function SharedSessionForm({
  onClose,
  onSuccess,
  simuladorId,
  data,
  horarioInicio,
  horarioFim,
  instrutorId,
  temaSessao,
  observacoes,
  funcionarios,
  modelos,
  treinamentos,
  editSessionId,
  editSessionData,
}: SharedSessionFormProps) {
  const [participants, setParticipants] = useState<[ParticipantState, ParticipantState]>([
    { ...EMPTY_PARTICIPANT },
    { ...EMPTY_PARTICIPANT, cumpreTreinamento: true, geraFicha: true },
  ]);
  const [loading, setLoading] = useState(false);

  // --- Time helpers ---
  const timeToMinutes = (t: string): number => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const minutosToTime = (mins: number): string => {
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  // --- Auto-generate segments: split total time into two equal segments ---
  const segments = useMemo((): SegmentState[] => {
    if (!horarioInicio || !horarioFim) return [];
    const start = timeToMinutes(horarioInicio);
    const end = timeToMinutes(horarioFim);
    if (end <= start) return [];

    const mid = Math.floor((start + end) / 2);
    const p0 = participants[0]?.funcionario?.id ?? null;
    const p1 = participants[1]?.funcionario?.id ?? null;

    const seg1: SegmentState = {
      inicio: horarioInicio,
      fim: minutosToTime(mid),
      atribuicaoFuncionarioId: participants[0]?.cumpreTreinamento ? p0 : null,
      funcoes: [
        { funcionario_id: p0 ?? 0, funcao: 'PF' },
        { funcionario_id: p1 ?? 0, funcao: 'PM' },
      ].filter(f => f.funcionario_id > 0),
    };

    const seg2: SegmentState = {
      inicio: minutosToTime(mid),
      fim: horarioFim,
      atribuicaoFuncionarioId: participants[1]?.cumpreTreinamento ? p1 : null,
      funcoes: [
        { funcionario_id: p1 ?? 0, funcao: 'PF' },
        { funcionario_id: p0 ?? 0, funcao: 'PM' },
      ].filter(f => f.funcionario_id > 0),
    };

    return [seg1, seg2];
  }, [horarioInicio, horarioFim, participants]);

  // --- Calculate summary ---
  const summary = useMemo((): SummaryItem[] => {
    return participants
      .filter(p => p.funcionario)
      .map(p => {
        const fid = p.funcionario!.id;
        let totalMin = 0, pfMin = 0, pmMin = 0, curricMin = 0;

        for (const seg of segments) {
          const dur = timeToMinutes(seg.fim) - timeToMinutes(seg.inicio);
          for (const f of seg.funcoes) {
            if (f.funcionario_id === fid) {
              totalMin += dur;
              if (f.funcao === 'PF') pfMin += dur;
              else pmMin += dur;
            }
          }
          if (seg.atribuicaoFuncionarioId === fid) {
            curricMin += dur;
          }
        }

        return {
          funcionarioId: fid,
          nome: p.funcionario!.nome,
          totalMinutos: totalMin,
          pfMinutos: pfMin,
          pmMinutos: pmMin,
          curricularMinutos: curricMin,
          cumpreTreinamento: p.cumpreTreinamento,
          geraFicha: p.geraFicha,
        };
      });
  }, [participants, segments]);

  // --- Update participant ---
  const updateParticipant = useCallback(
    (index: 0 | 1, updates: Partial<ParticipantState>) => {
      setParticipants(prev => {
        const next: [ParticipantState, ParticipantState] = [...prev];
        next[index] = { ...next[index], ...updates };
        // Auto-derive gera_ficha from cumpre_treinamento
        if ('cumpreTreinamento' in updates) {
          next[index].geraFicha = next[index].cumpreTreinamento;
        }
        return next;
      });
    },
    [],
  );

  // --- Validation ---
  const errors = useMemo((): string[] => {
    const errs: string[] = [];
    if (!simuladorId) errs.push('Selecione um simulador');
    if (!instrutorId) errs.push('Selecione um instrutor');
    if (!data) errs.push('Selecione uma data');
    if (!horarioInicio || !horarioFim) errs.push('Defina horário de início e fim');
    if (timeToMinutes(horarioFim) <= timeToMinutes(horarioInicio)) errs.push('Horário inválido');

    participants.forEach((p, i) => {
      if (!p.funcionario) errs.push(`Selecione o participante ${i + 1}`);
      if (p.cumpreTreinamento && !p.modeloSessaoId) errs.push(`Selecione modelo de sessão para ${p.funcionario?.nome || `participante ${i + 1}`}`);
    });

    if (participants[0]?.funcionario?.id === participants[1]?.funcionario?.id && participants[0]?.funcionario) {
      errs.push('Os participantes devem ser diferentes');
    }

    const hasCurricular = participants.some(p => p.cumpreTreinamento);
    if (!hasCurricular) errs.push('Pelo menos um participante deve cumprir treinamento');

    return errs;
  }, [simuladorId, instrutorId, data, horarioInicio, horarioFim, participants]);

  // --- Submit ---
  const handleSubmit = async () => {
    if (errors.length > 0) {
      toast.error(errors[0]);
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
        participantes: participants
          .filter(p => p.funcionario)
          .map(p => ({
            funcionario_id: p.funcionario!.id,
            cumpre_treinamento: p.cumpreTreinamento,
            treinamento_planejado_id: p.treinamentoId,
            modelo_sessao_id: p.modeloSessaoId,
            gera_ficha: p.geraFicha,
          })),
        segmentos: segments.map(seg => ({
          ...seg,
          funcoes: seg.funcoes.filter(f => f.funcionario_id > 0),
        })),
      };

      let result;
      if (editSessionId) {
        result = await updateSharedSession(editSessionId, payload);
      } else {
        result = await createSharedSession(payload);
      }

      if (result.success) {
        toast.success(editSessionId ? 'Sessão compartilhada atualizada' : 'Sessão compartilhada criada');
        onSuccess();
        onClose();
      } else {
        toast.error(result.error || 'Erro ao salvar sessão compartilhada');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  };

  // --- Can't render without basic data ---
  if (!simuladorId || !instrutorId || !data) {
    return (
      <div className="p-4 text-center text-gray-500">
        Preencha simulador, instrutor e data antes de configurar a sessão compartilhada.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm font-medium text-blue-700 bg-blue-50 px-3 py-2 rounded">
        <Users className="w-4 h-4" />
        Sessão Compartilhada — Dois tripulantes na mesma reserva
      </div>

      {/* Participants */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-700">Participantes</h4>
        {participants.map((p, idx) => (
          <div key={idx} className="border rounded-lg p-3 space-y-2 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 w-6">
                {idx === 0 ? 'PIC' : 'SIC'}
              </span>
              <div className="flex-1">
                <FuncionarioCombobox
                  onSelect={(f) => updateParticipant(idx as 0 | 1, { funcionario: f as Funcionario | null })}
                  selected={p.funcionario}
                  placeholder={`Selecionar participante ${idx + 1}...`}
                  required
                />
              </div>
            </div>

            {p.funcionario && (
              <div className="ml-8 space-y-2">
                {/* Curricular / Support toggle */}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={p.cumpreTreinamento}
                    onChange={e => updateParticipant(idx as 0 | 1, { cumpreTreinamento: e.target.checked })}
                    className="rounded"
                  />
                  <span>Cumpre treinamento nesta reserva</span>
                </label>

                {p.cumpreTreinamento && (
                  <>
                    {/* Model selection */}
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Modelo de sessão</label>
                      <select
                        value={p.modeloSessaoId ?? ''}
                        onChange={e => updateParticipant(idx as 0 | 1, { modeloSessaoId: Number(e.target.value) || null })}
                        className="w-full border rounded px-2 py-1 text-sm"
                      >
                        <option value="">Selecionar modelo...</option>
                        {modelos.map(m => (
                          <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* Indicators */}
                <div className="flex gap-3 text-xs">
                  {p.cumpreTreinamento && p.modeloSessaoId && (
                    <span className="flex items-center gap-1 text-green-700">
                      <FileText className="w-3 h-3" /> Ficha será gerada
                    </span>
                  )}
                  {!p.cumpreTreinamento && (
                    <span className="flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="w-3 h-3" /> Apoio — sem ficha
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Segments preview */}
      {segments.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Segmentos</h4>
          <div className="bg-blue-50 rounded-lg p-3 space-y-2">
            {segments.map((seg, idx) => (
              <div key={idx} className="text-sm">
                <div className="font-medium text-blue-800">
                  Segmento {idx + 1}: {seg.inicio}–{seg.fim} ({timeToMinutes(seg.fim) - timeToMinutes(seg.inicio)} min)
                </div>
                <div className="text-blue-600 ml-2">
                  PF: {participants.find(p => seg.funcoes.some(f => f.funcionario_id === p.funcionario?.id && f.funcao === 'PF'))?.funcionario?.nome || '—'}
                  {' '}| PM: {participants.find(p => seg.funcoes.some(f => f.funcionario_id === p.funcionario?.id && f.funcao === 'PM'))?.funcionario?.nome || '—'}
                </div>
                {seg.atribuicaoFuncionarioId && (
                  <div className="text-blue-500 ml-2 text-xs">
                    Conteúdo: {participants.find(p => p.funcionario?.id === seg.atribuicaoFuncionarioId)?.funcionario?.nome || '—'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {summary.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
            <Clock className="w-4 h-4" /> Resumo
          </h4>
          <div className="border rounded-lg divide-y">
            {summary.map(s => (
              <div key={s.funcionarioId} className="p-3 space-y-1">
                <div className="font-medium text-sm">{s.nome}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600">
                  <span>Total: {s.totalMinutos} min ({Math.floor(s.totalMinutos / 60)}h{(s.totalMinutos % 60) > 0 ? `${s.totalMinutos % 60}m` : ''})</span>
                  <span>PF: {s.pfMinutos} min</span>
                  <span>PM: {s.pmMinutos} min</span>
                  <span>Curricular: {s.curricularMinutos} min</span>
                </div>
                <div className="text-xs">
                  {s.cumpreTreinamento ? (
                    <span className="text-green-700">✓ Treinamento • Ficha: Sim</span>
                  ) : (
                    <span className="text-amber-700">Apoio • Ficha: Não</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          {errors.map((err, i) => (
            <div key={i} className="text-sm text-red-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {err}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
          disabled={loading}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || errors.length > 0}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Salvando...' : editSessionId ? 'Atualizar' : 'Criar sessão compartilhada'}
        </button>
      </div>
    </div>
  );
}
