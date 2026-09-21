import { useState } from 'react';
import { apiClient } from '@/react-app/services/apiClient';
import { toast } from 'sonner';
import type { CvFlightStatus, CvVoo } from '@/react-app/hooks/useControleVoos';

type Props = {
  voo: CvVoo;
  onChanged: () => void;
};

type Motivo = { id: number; nome: string; tipo?: string | null; ativo?: number | boolean | null };
type ApiEnvelope<T> = { success: boolean; data?: { data?: T } | T; error?: string };

function extract<T>(response: unknown): T {
  const envelope = response as ApiEnvelope<T>;
  if (!envelope?.success) throw new Error(envelope?.error || 'Falha na API');
  const first = envelope.data as { data?: T } | T | undefined;
  if (first && typeof first === 'object' && !Array.isArray(first) && 'data' in first) {
    return (first as { data: T }).data;
  }
  return first as T;
}

const NEXT_STATUS: Partial<Record<CvFlightStatus, Array<{ status: CvFlightStatus; label: string }>>> = {
  planejado: [{ status: 'liberado_operacionalmente', label: 'Liberar voo' }],
  liberado_operacionalmente: [{ status: 'em_andamento', label: 'Iniciar voo' }],
  em_andamento: [{ status: 'pousado', label: 'Registrar pouso' }],
  pousado: [{ status: 'concluido_operacionalmente', label: 'Concluir voo' }],
  alternado_divergido: [
    { status: 'pousado', label: 'Registrar pouso' },
    { status: 'concluido_operacionalmente', label: 'Concluir voo' },
  ],
};

const CANCELLABLE = new Set<CvFlightStatus>(['planejado', 'liberado_operacionalmente']);

export default function ControleVoosStatusActions({ voo, onChanged }: Props) {
  const [saving, setSaving] = useState<CvFlightStatus | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [motivoId, setMotivoId] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [loadingMotivos, setLoadingMotivos] = useState(false);

  async function changeStatus(status: CvFlightStatus, extra: Record<string, unknown> = {}) {
    if (saving) return;
    setSaving(status);
    try {
      const response = await apiClient.post<unknown>(`/controle-voos/voos/${voo.id}/status`, {
        status,
        versao: voo.versao,
        descricao:
          status === 'cancelado'
            ? cancelReason.trim() || 'Voo cancelado pela Coordenação'
            : `Status atualizado pela Coordenação: ${status}`,
        ...extra,
      });
      extract<CvVoo>(response);
      toast.success(status === 'cancelado' ? 'Voo cancelado.' : 'Status do voo atualizado.');
      setCancelOpen(false);
      setMotivoId('');
      setCancelReason('');
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar o status do voo.');
    } finally {
      setSaving(null);
    }
  }

  async function openCancel() {
    setCancelOpen(true);
    if (motivos.length > 0 || loadingMotivos) return;
    setLoadingMotivos(true);
    try {
      const response = await apiClient.get<unknown>('/controle-voos/catalogos/motivos');
      const rows = extract<Motivo[]>(response) || [];
      setMotivos(
        rows.filter(
          (row) =>
            (row.ativo === undefined || row.ativo === null || Boolean(row.ativo)) &&
            String(row.tipo || '').trim().toLocaleLowerCase('pt-BR') === 'cancelamento',
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os motivos de cancelamento.');
    } finally {
      setLoadingMotivos(false);
    }
  }

  const next = NEXT_STATUS[voo.status] || [];
  const terminal = next.length === 0 && !CANCELLABLE.has(voo.status);

  return (
    <div className="space-y-2">
      {next.map((action) => (
        <button
          key={action.status}
          type="button"
          onClick={() => void changeStatus(action.status)}
          disabled={saving !== null}
          className="w-full rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-60"
        >
          {saving === action.status ? 'Atualizando…' : action.label}
        </button>
      ))}

      {CANCELLABLE.has(voo.status) ? (
        <button
          type="button"
          onClick={() => void openCancel()}
          disabled={saving !== null}
          className="w-full rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/20"
        >
          Cancelar voo
        </button>
      ) : null}

      {terminal ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          Este voo está em estado terminal; não há nova transição operacional disponível.
        </p>
      ) : null}

      {cancelOpen ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/20">
          <p className="text-sm font-semibold text-red-800 dark:text-red-200">Confirmar cancelamento</p>
          <label className="mt-3 block text-xs font-medium text-slate-700 dark:text-slate-300">
            Motivo operacional
            <select
              value={motivoId}
              onChange={(event) => setMotivoId(event.target.value)}
              disabled={loadingMotivos}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">{loadingMotivos ? 'Carregando…' : 'Selecione'}</option>
              {motivos.map((motivo) => (
                <option key={motivo.id} value={motivo.id}>{motivo.nome}</option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs font-medium text-slate-700 dark:text-slate-300">
            Observação
            <textarea
              rows={2}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              disabled={saving !== null}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium dark:border-slate-700 dark:bg-slate-900"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => void changeStatus('cancelado', { motivo_id: Number(motivoId) })}
              disabled={!motivoId || saving !== null}
              className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving === 'cancelado' ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
