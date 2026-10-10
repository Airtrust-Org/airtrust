import { useEffect, useState } from 'react';
import { apiClient } from '@/react-app/services/apiClient';
import type { CvVoo } from '@/react-app/hooks/useControleVoos';

function asLocal(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function ControleVoosEdicaoRapida({ voo, onSaved, onCancel }: {
  voo: CvVoo;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [departure, setDeparture] = useState(asLocal(voo.horario_previsto_partida));
  const [arrival, setArrival] = useState(asLocal(voo.horario_previsto_chegada));
  const [numero, setNumero] = useState(voo.numero_voo || '');
  const [numeroDb, setNumeroDb] = useState(voo.numero_db || '');
  const [obs, setObs] = useState(voo.observacoes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDeparture(asLocal(voo.horario_previsto_partida));
    setArrival(asLocal(voo.horario_previsto_chegada));
    setNumero(voo.numero_voo || '');
    setNumeroDb(voo.numero_db || '');
    setObs(voo.observacoes || '');
  }, [voo]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const start = new Date(departure);
    const end = new Date(arrival);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      setError('Informe horários válidos, com chegada igual ou posterior à partida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await apiClient.patch<CvVoo>(`/controle-voos/voos/${voo.id}`, {
        versao: voo.versao,
        horario_previsto_partida: start.toISOString(),
        horario_previsto_chegada: end.toISOString(),
        numero_voo: numero.trim() || null,
        numero_db: numeroDb.trim() || null,
        observacoes: obs.trim() || null,
      });
      // The modern client wraps the server's envelope. Do not treat a server-side
      // business error as success even when the HTTP request itself succeeded.
      const envelope: unknown = response.data;
      const result = envelope && typeof envelope === 'object' && 'success' in envelope
        ? envelope as { success?: boolean; error?: string }
        : undefined;
      if (!response.success || result?.success === false) {
        throw new Error(result?.error || response.error || 'Falha ao salvar os dados.');
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar alterações.');
    } finally { setSaving(false); }
  }

  const cls = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
  return (
    <form onSubmit={(event) => void save(event)} className="mb-4 rounded-lg border border-cyan-200 bg-cyan-50/40 p-3 dark:border-cyan-800 dark:bg-slate-800">
      <p className="mb-2 text-sm font-semibold">Edição rápida dos dados gerais</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs">Número do voo<input className={cls} value={numero} onChange={(e) => setNumero(e.target.value)} /></label>
        <label className="text-xs">Número DB<input className={cls} value={numeroDb} onChange={(e) => setNumeroDb(e.target.value)} /></label>
        <label className="text-xs">Partida prevista<input type="datetime-local" required className={cls} value={departure} onChange={(e) => setDeparture(e.target.value)} /></label>
        <label className="text-xs">Chegada prevista<input type="datetime-local" required className={cls} value={arrival} onChange={(e) => setArrival(e.target.value)} /></label>
        <label className="text-xs sm:col-span-2">Observações<input className={cls} value={obs} onChange={(e) => setObs(e.target.value)} /></label>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancelar</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar dados'}</button>
      </div>
    </form>
  );
}
