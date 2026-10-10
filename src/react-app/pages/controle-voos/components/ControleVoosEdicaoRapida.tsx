import { useEffect, useState, type FormEvent } from 'react';
import { apiClient } from '@/react-app/services/apiClient';
import { useControleVoosAeroportos, type CvVoo } from '@/react-app/hooks/useControleVoos';

function asLocal(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function initialRoute(voo: CvVoo): string[] {
  return voo.rota_pontos?.length
    ? voo.rota_pontos.map((point) => point.id == null ? '' : String(point.id))
    : [String(voo.origem_id), String(voo.destino_id)];
}

export default function ControleVoosEdicaoRapida({ voo, onSaved, onCancel }: {
  voo: CvVoo;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { data: aeroportos = [], isLoading: airportsLoading } = useControleVoosAeroportos();
  const [departure, setDeparture] = useState(asLocal(voo.horario_previsto_partida));
  const [arrival, setArrival] = useState(asLocal(voo.horario_previsto_chegada));
  const [numero, setNumero] = useState(voo.numero_voo || '');
  const [obs, setObs] = useState(voo.observacoes || '');
  const [routeIds, setRouteIds] = useState<string[]>(() => initialRoute(voo));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDeparture(asLocal(voo.horario_previsto_partida));
    setArrival(asLocal(voo.horario_previsto_chegada));
    setNumero(voo.numero_voo || '');
    setObs(voo.observacoes || '');
    setRouteIds(initialRoute(voo));
  }, [voo]);

  const canEditRoute = voo.status === 'planejado';
  async function save(event: FormEvent) {
    event.preventDefault();
    const start = new Date(departure);
    const end = new Date(arrival);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      setError('Informe horários válidos, com chegada igual ou posterior à partida.');
      return;
    }
    if (canEditRoute && (routeIds.length < 2 ||
      routeIds.some((point, index) => !point || (index > 0 && point === routeIds[index - 1])))) {
      setError('Informe a rota completa, sem pontos consecutivos iguais.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await apiClient.patch<CvVoo>(`/controle-voos/voos/${voo.id}`, {
        versao: voo.versao,
        numero_voo: numero.trim() || null,
        // A data operacional vem da partida prevista; a Coordenação não edita o DB.
        data_programacao: departure.slice(0, 10),
        horario_previsto_partida: start.toISOString(),
        horario_previsto_chegada: end.toISOString(),
        observacoes: obs.trim() || null,
        ...(canEditRoute ? { rota_ids: routeIds.map(Number) } : {}),
      });
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

  const cls = 'mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
  return (
    <form onSubmit={(event) => void save(event)} className="mb-4 rounded-lg border border-cyan-200 bg-cyan-50/40 p-3 dark:border-cyan-800 dark:bg-slate-800">
      <p className="mb-3 text-sm font-semibold">Edição rápida dos dados gerais e da rota</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs">Número do voo<input className={cls} value={numero} onChange={(e) => setNumero(e.target.value)} /></label>
        <div className="hidden xl:block" aria-hidden="true" />
        <div className="hidden xl:block" aria-hidden="true" />
        <label className="text-xs">Partida prevista<input type="datetime-local" required className={cls} value={departure} onChange={(e) => setDeparture(e.target.value)} /></label>
        <label className="text-xs">Chegada prevista<input type="datetime-local" required className={cls} value={arrival} onChange={(e) => setArrival(e.target.value)} /></label>
        <div className="hidden xl:block" aria-hidden="true" />
        {canEditRoute && (
          <fieldset className="grid gap-2 rounded-lg border border-cyan-200 p-3 sm:col-span-2 xl:col-span-3">
            <legend className="px-1 text-xs font-semibold">Origem, destinos e pernas do voo</legend>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {routeIds.map((routeId, index) => (
                <div key={index} className="flex min-w-0 items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs">
                    {index === 0 ? 'Origem' : index === routeIds.length - 1 ? 'Destino final' : `Parada ${index}`}
                    <select className={cls} aria-label={`Ponto da rota ${index + 1}`} value={routeId}
                      disabled={airportsLoading}
                      onChange={(e) => setRouteIds((items) => items.map((item, i) => i === index ? e.target.value : item))}>
                      <option value="">Selecione</option>
                      {aeroportos.map((airport) => (
                        <option key={airport.id} value={airport.id}>{airport.codigo_icao || airport.codigo} · {airport.nome}</option>
                      ))}
                    </select>
                  </label>
                  {routeIds.length > 2 && (
                    <button type="button" className="rounded-lg border border-slate-300 px-2 py-2 text-xs"
                      aria-label={`Remover ponto ${index + 1}`}
                      onClick={() => setRouteIds((items) => items.filter((_, i) => i !== index))}>Remover</button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="w-fit rounded-lg border border-cyan-600 px-3 py-1.5 text-xs text-cyan-800"
              disabled={routeIds.length >= 20} onClick={() => setRouteIds((items) => [...items.slice(0, -1), '', items[items.length - 1]])}>
              + Adicionar parada
            </button>
          </fieldset>
        )}
        <label className="text-xs sm:col-span-2 xl:col-span-3">Observações<input className={cls} value={obs} onChange={(e) => setObs(e.target.value)} /></label>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancelar</button>
        <button type="submit" disabled={saving || (canEditRoute && airportsLoading)} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? 'Salvando…' : 'Salvar dados'}
        </button>
      </div>
    </form>
  );
}
