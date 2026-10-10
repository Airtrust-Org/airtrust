import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '@/react-app/services/apiClient';
import { DualWeightInput } from './ControleVoosNovoVooDialog';
import type { CvVoo } from '@/react-app/hooks/useControleVoos';

type Props = {
  open: boolean;
  voo: CvVoo;
  onClose: () => void;
  onSaved: (voo: CvVoo) => void;
};

type ApiEnvelope<T> = { success: boolean; data?: { data?: T } | T; error?: string };
type CatalogItem = { id: number; codigo: string; nome: string };
type Aeronave = {
  id: number;
  codigo?: string | null;
  prefixo?: string | null;
  modelo?: string | null;
  status?: string | null;
};

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

function initialRoute(voo: CvVoo): string[] {
  return voo.rota_pontos?.length
    ? voo.rota_pontos.map(point => point.id == null ? '' : String(point.id))
    : [String(voo.origem_id), String(voo.destino_id)];
}

export default function ControleVoosEditarVooDialog({ open, voo, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aeronaves, setAeronaves] = useState<Aeronave[]>([]);
  const [contratos, setContratos] = useState<CatalogItem[]>([]);
  const [tipos, setTipos] = useState<CatalogItem[]>([]);
  const [aeroportos, setAeroportos] = useState<CatalogItem[]>([]);
  const [routeIds, setRouteIds] = useState<string[]>(voo.rota_pontos?.length ? voo.rota_pontos.map(point => point.id == null ? '' : String(point.id)) : [String(voo.origem_id), String(voo.destino_id)]);
  const [form, setForm] = useState({
    numero_voo: voo.numero_voo || '',
    aeronave_id: voo.aeronave_id ? String(voo.aeronave_id) : '',
    prefixo: voo.prefixo || '',
    contrato_id: voo.contrato_id ? String(voo.contrato_id) : '',
    tipo_voo_id: String(voo.tipo_voo_id),
    horario_previsto_partida: toLocalInput(voo.horario_previsto_partida),
    horario_previsto_chegada: toLocalInput(voo.horario_previsto_chegada),
    peso_passageiros: voo.peso_passageiros_planejado == null ? '' : String(voo.peso_passageiros_planejado),
    peso_bagagem: voo.peso_bagagem_planejado == null ? '' : String(voo.peso_bagagem_planejado),
    peso_carga: voo.peso_carga_planejado == null ? '' : String(voo.peso_carga_planejado),
    observacoes: voo.observacoes || '',
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setForm({
      numero_voo: voo.numero_voo || '',
      aeronave_id: voo.aeronave_id ? String(voo.aeronave_id) : '',
      prefixo: voo.prefixo || '',
      contrato_id: voo.contrato_id ? String(voo.contrato_id) : '',
      tipo_voo_id: String(voo.tipo_voo_id),
      horario_previsto_partida: toLocalInput(voo.horario_previsto_partida),
      horario_previsto_chegada: toLocalInput(voo.horario_previsto_chegada),
      peso_passageiros: voo.peso_passageiros_planejado == null ? '' : String(voo.peso_passageiros_planejado),
      peso_bagagem: voo.peso_bagagem_planejado == null ? '' : String(voo.peso_bagagem_planejado),
      peso_carga: voo.peso_carga_planejado == null ? '' : String(voo.peso_carga_planejado),
      observacoes: voo.observacoes || '',
    });
    setRouteIds(voo.rota_pontos?.length ? voo.rota_pontos.map(point => point.id == null ? '' : String(point.id)) : [String(voo.origem_id), String(voo.destino_id)]);
    setLoadingCatalogs(true);
    void Promise.all([
      apiClient.get<unknown>('/aeronaves?somente_ativas=1'),
      apiClient.get<unknown>('/controle-voos/catalogos/contratos'),
      apiClient.get<unknown>('/controle-voos/catalogos/tipos'),
      apiClient.get<unknown>('/controle-voos/catalogos/aeroportos'),
    ])
      .then(([aircraftResponse, contractResponse, typeResponse, airportResponse]) => {
        if (cancelled) return;
        setAeronaves(extract<Aeronave[]>(aircraftResponse) || []);
        setContratos(extract<CatalogItem[]>(contractResponse) || []);
        setTipos(extract<CatalogItem[]>(typeResponse) || []);
        setAeroportos(extract<CatalogItem[]>(airportResponse) || []);
      })
      .catch((catalogError) => {
        if (!cancelled) {
          setError(
            catalogError instanceof Error
              ? catalogError.message
              : 'Não foi possível carregar os cadastros da programação.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalogs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, voo]);

  if (!open) return null;

  const fieldClass =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

  const canEditPlanning = voo.status === 'planejado' || voo.status === 'liberado_operacionalmente';

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
    if (!form.aeronave_id || !form.contrato_id || !form.tipo_voo_id) {
      setError('Selecione aeronave, contrato e tipo de voo.');
      return;
    }

    const originalRoute = initialRoute(voo);
    const routeChanged = canEditPlanning && (routeIds.length !== originalRoute.length ||
      routeIds.some((id, index) => id !== originalRoute[index]));
    if (routeChanged && (routeIds.length < 2 || routeIds.some((id, index) => !id || (index > 0 && id === routeIds[index - 1])))) {
      setError('Para alterar a rota, informe pontos válidos sem duplicação consecutiva.');
      return;
    }
    setSaving(true);
    try {
      const response = await apiClient.patch<unknown>(`/controle-voos/voos/${voo.id}`, {
        versao: voo.versao,
        numero_voo: form.numero_voo.trim() || null,
        prefixo: form.prefixo.trim().toUpperCase(),
        aeronave_id: Number(form.aeronave_id),
        contrato_id: Number(form.contrato_id),
        tipo_voo_id: Number(form.tipo_voo_id),
        data_programacao: form.horario_previsto_partida.slice(0, 10),
        horario_previsto_partida: departure.toISOString(),
        horario_previsto_chegada: arrival.toISOString(),
        observacoes: form.observacoes.trim() || null,
        ...(canEditPlanning ? {
          ...(routeChanged ? { rota_ids: routeIds.map(Number) } : {}),
          peso_passageiros: form.peso_passageiros === '' ? null : Number(form.peso_passageiros),
          peso_bagagem: form.peso_bagagem === '' ? null : Number(form.peso_bagagem),
          peso_carga: form.peso_carga === '' ? null : Number(form.peso_carga),
          unidade_peso_planejado: 'LB',
        } : {}),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="editar-voo-title">
      <form
        onSubmit={submit}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl min-h-0 flex-col overflow-hidden rounded-2xl bg-white p-4 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:p-5 dark:bg-slate-900"
      >
        <div className="mb-3 flex shrink-0 items-start justify-between gap-4">
          <div>
            <h2 id="editar-voo-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Editar programação — {voo.prefixo}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Atualize aeronave, contrato, horários, rota e pesos do planejamento. As revisões aumentam a versão do voo e ficam disponíveis para atualização no Pilot App.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar edição">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" data-testid="flight-edit-scroll-region">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Número do voo
            <input className={fieldClass} value={form.numero_voo} onChange={(event) => setForm((prev) => ({ ...prev, numero_voo: event.target.value }))} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Aeronave
            <select
              aria-label="Aeronave"
              required
              disabled={loadingCatalogs}
              className={fieldClass}
              value={form.aeronave_id}
              onChange={(event) => {
                const aeronave_id = event.target.value;
                const selected = aeronaves.find((item) => String(item.id) === aeronave_id);
                setForm((prev) => ({
                  ...prev,
                  aeronave_id,
                  prefixo:
                    selected?.prefixo?.trim().toUpperCase() ||
                    selected?.codigo?.trim().toUpperCase() ||
                    prev.prefixo,
                }));
              }}
            >
              <option value="">{loadingCatalogs ? 'Carregando…' : 'Selecione'}</option>
              {aeronaves.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.prefixo || item.codigo || `Aeronave ${item.id}`}
                  {item.modelo ? ` · ${item.modelo}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Contrato
            <select
              aria-label="Contrato"
              required
              disabled={loadingCatalogs}
              className={fieldClass}
              value={form.contrato_id}
              onChange={(event) => setForm((prev) => ({ ...prev, contrato_id: event.target.value }))}
            >
              <option value="">{loadingCatalogs ? 'Carregando…' : 'Selecione'}</option>
              {contratos.map((item) => (
                <option key={item.id} value={item.id}>{item.codigo} · {item.nome}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Tipo de voo
            <select
              aria-label="Tipo de voo"
              required
              disabled={loadingCatalogs}
              className={fieldClass}
              value={form.tipo_voo_id}
              onChange={(event) => setForm((prev) => ({ ...prev, tipo_voo_id: event.target.value }))}
            >
              <option value="">{loadingCatalogs ? 'Carregando…' : 'Selecione'}</option>
              {tipos.map((item) => (
                <option key={item.id} value={item.id}>{item.codigo} · {item.nome}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Partida prevista
            <input type="datetime-local" required className={fieldClass} value={form.horario_previsto_partida} onChange={(event) => setForm((prev) => ({ ...prev, horario_previsto_partida: event.target.value }))} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Chegada prevista
            <input type="datetime-local" required className={fieldClass} value={form.horario_previsto_chegada} onChange={(event) => setForm((prev) => ({ ...prev, horario_previsto_chegada: event.target.value }))} />
          </label>
          {canEditPlanning ? (
            <div className="sm:col-span-2 lg:col-span-3 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="text-sm font-semibold">Rota programada (origem, paradas e destino)</h3>
              <p className="text-xs text-slate-500">Rota e pesos podem ser completados após a liberação, antes da execução. Não é necessário alterar a rota para corrigir apenas os pesos.</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {routeIds.map((routeId, index) => (
                <div key={index} className="flex gap-2 items-end">
                  <label className="flex-1 text-xs">Ponto {index + 1}
                    <select className={fieldClass} aria-label={`Ponto da rota ${index + 1}`} value={routeId}
                      onChange={event => setRouteIds(items => items.map((item, i) => i === index ? event.target.value : item))}>
                      <option value="">Selecione</option>
                      {aeroportos.map(item => <option key={item.id} value={item.id}>{item.codigo} · {item.nome}</option>)}
                    </select>
                  </label>
                  {routeIds.length > 2 ? <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setRouteIds(items => items.filter((_, i) => i !== index))}>Remover</button> : null}
                </div>
              ))}
              </div>
              <button type="button" className="rounded-lg border border-cyan-600 px-3 py-2 text-sm text-cyan-700"
                onClick={() => setRouteIds(items => [...items, ''])} disabled={routeIds.length >= 20}>+ Ponto da rota</button>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <DualWeightInput label="Peso dos passageiros" valueLb={form.peso_passageiros}
                  onChangeLb={value => setForm(state => ({ ...state, peso_passageiros: value }))} fieldClass={fieldClass} />
                <DualWeightInput label="Peso da bagagem" valueLb={form.peso_bagagem}
                  onChangeLb={value => setForm(state => ({ ...state, peso_bagagem: value }))} fieldClass={fieldClass} />
                <DualWeightInput label="Peso da carga" valueLb={form.peso_carga}
                  onChangeLb={value => setForm(state => ({ ...state, peso_carga: value }))} fieldClass={fieldClass} />
              </div>
            </div>
          ) : null}
          <label className="sm:col-span-2 lg:col-span-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            Observações
            <textarea rows={2} className={fieldClass} value={form.observacoes} onChange={(event) => setForm((prev) => ({ ...prev, observacoes: event.target.value }))} />
          </label>
        </div>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            Cancelar
          </button>
          <button type="submit" disabled={saving || loadingCatalogs} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-60">
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}
