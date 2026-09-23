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

function movePlannedDate(
  dateText: string,
  departureText: string,
  arrivalText: string,
): { departure: string; arrival: string } {
  const departure = new Date(departureText);
  const arrival = new Date(arrivalText);
  const base = new Date(dateText + 'T12:00:00');
  if (
    Number.isNaN(departure.getTime()) ||
    Number.isNaN(arrival.getTime()) ||
    Number.isNaN(base.getTime())
  ) {
    return { departure: departureText, arrival: arrivalText };
  }

  const dayOffset = Math.max(
    0,
    Math.round(
      (new Date(arrival.getFullYear(), arrival.getMonth(), arrival.getDate()).getTime() -
        new Date(departure.getFullYear(), departure.getMonth(), departure.getDate()).getTime()) /
        86_400_000,
    ),
  );
  const nextDeparture = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    departure.getHours(),
    departure.getMinutes(),
  );
  const nextArrival = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + dayOffset,
    arrival.getHours(),
    arrival.getMinutes(),
  );
  return {
    departure: toLocalInput(nextDeparture.toISOString()),
    arrival: toLocalInput(nextArrival.toISOString()),
  };
}

export default function ControleVoosEditarVooDialog({ open, voo, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aeronaves, setAeronaves] = useState<Aeronave[]>([]);
  const [contratos, setContratos] = useState<CatalogItem[]>([]);
  const [tipos, setTipos] = useState<CatalogItem[]>([]);
  const [form, setForm] = useState({
    numero_voo: voo.numero_voo || '',
    numero_db: voo.numero_db || '',
    petrobras_equipamento: voo.petrobras_equipamento || '',
    petrobras_atendimento: voo.petrobras_atendimento || '',
    aeronave_id: voo.aeronave_id ? String(voo.aeronave_id) : '',
    prefixo: voo.prefixo || '',
    contrato_id: voo.contrato_id ? String(voo.contrato_id) : '',
    tipo_voo_id: String(voo.tipo_voo_id),
    data_programacao: voo.data_programacao.slice(0, 10),
    horario_previsto_partida: toLocalInput(voo.horario_previsto_partida),
    horario_previsto_chegada: toLocalInput(voo.horario_previsto_chegada),
    observacoes: voo.observacoes || '',
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setForm({
      numero_voo: voo.numero_voo || '',
      numero_db: voo.numero_db || '',
      petrobras_equipamento: voo.petrobras_equipamento || '',
      petrobras_atendimento: voo.petrobras_atendimento || '',
      aeronave_id: voo.aeronave_id ? String(voo.aeronave_id) : '',
      prefixo: voo.prefixo || '',
      contrato_id: voo.contrato_id ? String(voo.contrato_id) : '',
      tipo_voo_id: String(voo.tipo_voo_id),
      data_programacao: voo.data_programacao.slice(0, 10),
      horario_previsto_partida: toLocalInput(voo.horario_previsto_partida),
      horario_previsto_chegada: toLocalInput(voo.horario_previsto_chegada),
      observacoes: voo.observacoes || '',
    });
    setLoadingCatalogs(true);
    void Promise.all([
      apiClient.get<unknown>('/aeronaves?somente_ativas=1'),
      apiClient.get<unknown>('/controle-voos/catalogos/contratos'),
      apiClient.get<unknown>('/controle-voos/catalogos/tipos'),
    ])
      .then(([aircraftResponse, contractResponse, typeResponse]) => {
        if (cancelled) return;
        setAeronaves(extract<Aeronave[]>(aircraftResponse) || []);
        setContratos(extract<CatalogItem[]>(contractResponse) || []);
        setTipos(extract<CatalogItem[]>(typeResponse) || []);
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

    setSaving(true);
    try {
      const response = await apiClient.patch<unknown>(`/controle-voos/voos/${voo.id}`, {
        versao: voo.versao,
        numero_voo: form.numero_voo.trim() || null,
        numero_db: form.numero_db.trim() || null,
        petrobras_equipamento: form.petrobras_equipamento.trim() || null,
        petrobras_atendimento: form.petrobras_atendimento.trim() || null,
        prefixo: form.prefixo.trim().toUpperCase(),
        aeronave_id: Number(form.aeronave_id),
        contrato_id: Number(form.contrato_id),
        tipo_voo_id: Number(form.tipo_voo_id),
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
              Editar programação — {voo.prefixo}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Atualize os dados da programação, incluindo aeronave, contrato e tipo de voo. A rota é corrigida pelas etapas do RDV e a tripulação fica disponível na própria revisão. A alteração incrementa a versão do voo para que o Pilot App sinalize a tripulação.
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
            Equipamento Petrobras
            <input className={fieldClass} value={form.petrobras_equipamento} onChange={(event) => setForm((prev) => ({ ...prev, petrobras_equipamento: event.target.value }))} placeholder="Ex.: 30131647" />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Atendimento Petrobras
            <input className={fieldClass} value={form.petrobras_atendimento} onChange={(event) => setForm((prev) => ({ ...prev, petrobras_atendimento: event.target.value }))} placeholder="Ex.: 509573593" />
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
            Data da programação
            <input
              type="date"
              required
              className={fieldClass}
              value={form.data_programacao}
              onChange={(event) => {
                const data_programacao = event.target.value;
                setForm((prev) => {
                  const moved = movePlannedDate(
                    data_programacao,
                    prev.horario_previsto_partida,
                    prev.horario_previsto_chegada,
                  );
                  return {
                    ...prev,
                    data_programacao,
                    horario_previsto_partida: moved.departure,
                    horario_previsto_chegada: moved.arrival,
                  };
                });
              }}
            />
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
          <button type="submit" disabled={saving || loadingCatalogs} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-60">
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}
