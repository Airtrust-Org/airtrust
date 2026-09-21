import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '@/react-app/services/apiClient';
import type { CvVoo } from '@/react-app/hooks/useControleVoos';

type Props = {
  open: boolean;
  voo: CvVoo;
  onClose: () => void;
  onSaved: (voo: CvVoo) => void;
};

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

function toLocalInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export default function ControleVoosEditarVooDialog({ open, voo, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    numero_voo: voo.numero_voo || '',
    numero_db: voo.numero_db || '',
    data_programacao: voo.data_programacao.slice(0, 10),
    horario_previsto_partida: toLocalInput(voo.horario_previsto_partida),
    horario_previsto_chegada: toLocalInput(voo.horario_previsto_chegada),
    observacoes: voo.observacoes || '',
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      numero_voo: voo.numero_voo || '',
      numero_db: voo.numero_db || '',
      data_programacao: voo.data_programacao.slice(0, 10),
      horario_previsto_partida: toLocalInput(voo.horario_previsto_partida),
      horario_previsto_chegada: toLocalInput(voo.horario_previsto_chegada),
      observacoes: voo.observacoes || '',
    });
  }, [open, voo]);

  if (!open) return null;

  const fieldClass =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const departure = new Date(form.horario_previsto_partida);
    const arrival = new Date(form.horario_previsto_chegada);
    if (Number.isNaN(departure.getTime()) || Number.isNaN(arrival.getTime())) {
      setError('Informe horários previstos válidos.');
      return;
    }
    if (arrival < departure) {
      setError('A chegada prevista não pode ser anterior à partida prevista.');
      return;
    }

    setSaving(true);
    try {
      const response = await apiClient.patch<unknown>(`/controle-voos/voos/${voo.id}`, {
        versao: voo.versao,
        numero_voo: form.numero_voo.trim() || null,
        numero_db: form.numero_db.trim() || null,
        data_programacao: form.data_programacao,
        horario_previsto_partida: departure.toISOString(),
        horario_previsto_chegada: arrival.toISOString(),
        observacoes: form.observacoes.trim() || null,
      });
      onSaved(extract<CvVoo>(response));
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Não foi possível atualizar o voo. Recarregue os dados e tente novamente.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="editar-voo-title">
      <form
        onSubmit={submit}
        className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="editar-voo-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Editar voo {voo.prefixo}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Atualize a programação. A alteração incrementa a versão do voo para que o Pilot App sinalize a tripulação.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar edição">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Número do voo
            <input className={fieldClass} value={form.numero_voo} onChange={(event) => setForm((prev) => ({ ...prev, numero_voo: event.target.value }))} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Número DB
            <input className={fieldClass} value={form.numero_db} onChange={(event) => setForm((prev) => ({ ...prev, numero_db: event.target.value }))} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Data da programação
            <input type="date" required className={fieldClass} value={form.data_programacao} onChange={(event) => setForm((prev) => ({ ...prev, data_programacao: event.target.value }))} />
          </label>
          <div />
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Partida prevista
            <input type="datetime-local" required className={fieldClass} value={form.horario_previsto_partida} onChange={(event) => setForm((prev) => ({ ...prev, horario_previsto_partida: event.target.value }))} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Chegada prevista
            <input type="datetime-local" required className={fieldClass} value={form.horario_previsto_chegada} onChange={(event) => setForm((prev) => ({ ...prev, horario_previsto_chegada: event.target.value }))} />
          </label>
          <label className="sm:col-span-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Observações
            <textarea rows={3} className={fieldClass} value={form.observacoes} onChange={(event) => setForm((prev) => ({ ...prev, observacoes: event.target.value }))} />
          </label>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-60">
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}
