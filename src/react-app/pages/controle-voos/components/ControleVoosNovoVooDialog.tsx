import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '@/react-app/services/apiClient';
import type { CvAeroporto, CvNaturezaVoo, CvTipoVoo, CvVoo } from '@/react-app/hooks/useControleVoos';

type Props = {
  open: boolean;
  mode: 'coordenacao' | 'pilot';
  onClose: () => void;
  onCreated: (voo: CvVoo) => void;
};

type ApiEnvelope<T> = { success: boolean; data?: { data?: T } | T; error?: string };

function extract<T>(response: unknown): T {
  const envelope = response as ApiEnvelope<T>;
  if (!envelope?.success) throw new Error(envelope?.error || 'Falha na API');
  const first = envelope.data as { data?: T } | T | undefined;
  if (first && typeof first === 'object' && 'data' in first) return (first as { data: T }).data;
  return first as T;
}

function toLocalInput(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export default function ControleVoosNovoVooDialog({ open, mode, onClose, onCreated }: Props) {
  const now = useMemo(() => new Date(), []);
  const [aeroportos, setAeroportos] = useState<CvAeroporto[]>([]);
  const [tipos, setTipos] = useState<CvTipoVoo[]>([]);
  const [naturezas, setNaturezas] = useState<CvNaturezaVoo[]>([]);
  const [loadingCatalogos, setLoadingCatalogos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    prefixo: '',
    data_programacao: now.toISOString().slice(0, 10),
    origem_id: '',
    destino_id: '',
    tipo_voo_id: '',
    natureza_voo_id: '',
    horario_previsto_partida: toLocalInput(new Date(now.getTime() + 60 * 60_000)),
    horario_previsto_chegada: toLocalInput(new Date(now.getTime() + 2 * 60 * 60_000)),
    observacoes: '',
    funcao: 'PIC' as 'PIC' | 'SIC',
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCatalogos(true);
    setError(null);
    Promise.all([
      apiClient.get<unknown>('/controle-voos/catalogos/aeroportos'),
      apiClient.get<unknown>('/controle-voos/catalogos/tipos'),
      apiClient.get<unknown>('/controle-voos/catalogos/naturezas'),
    ])
      .then(([a, t, n]) => {
        if (cancelled) return;
        setAeroportos(extract<CvAeroporto[]>(a) || []);
        setTipos(extract<CvTipoVoo[]>(t) || []);
        setNaturezas(extract<CvNaturezaVoo[]>(n) || []);
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoadingCatalogos(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.prefixo.trim() || !form.origem_id || !form.destino_id || !form.tipo_voo_id || !form.natureza_voo_id) {
      setError('Preencha prefixo, origem, destino, tipo e natureza do voo.');
      return;
    }
    if (form.origem_id === form.destino_id) {
      setError('Origem e destino devem ser diferentes.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        prefixo: form.prefixo.trim().toUpperCase(),
        data_programacao: form.data_programacao,
        origem_id: Number(form.origem_id),
        destino_id: Number(form.destino_id),
        tipo_voo_id: Number(form.tipo_voo_id),
        natureza_voo_id: Number(form.natureza_voo_id),
        horario_previsto_partida: new Date(form.horario_previsto_partida).toISOString(),
        horario_previsto_chegada: new Date(form.horario_previsto_chegada).toISOString(),
        observacoes: form.observacoes.trim() || null,
        ...(mode === 'pilot' ? { funcao: form.funcao } : {}),
      };
      const endpoint = mode === 'pilot' ? '/controle-voos/voos/meus/criar' : '/controle-voos/voos';
      const response = await apiClient.post<unknown>(endpoint, body);
      onCreated(extract<CvVoo>(response));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o voo.');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{mode === 'pilot' ? 'Criar meu voo' : 'Novo voo'}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{mode === 'pilot' ? 'O voo será criado como planejado e você será incluído automaticamente na tripulação.' : 'Cadastre a programação operacional do voo.'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-sm">Prefixo<input className={fieldClass} value={form.prefixo} onChange={(e) => set('prefixo', e.target.value)} placeholder="PR-ABC" required /></label>
          <label className="text-sm">Data<input type="date" className={fieldClass} value={form.data_programacao} onChange={(e) => set('data_programacao', e.target.value)} required /></label>
          <label className="text-sm">Origem<select className={fieldClass} value={form.origem_id} onChange={(e) => set('origem_id', e.target.value)} required><option value="">Selecione</option>{aeroportos.map((a) => <option key={a.id} value={a.id}>{a.codigo_icao || a.codigo} — {a.nome}</option>)}</select></label>
          <label className="text-sm">Destino<select className={fieldClass} value={form.destino_id} onChange={(e) => set('destino_id', e.target.value)} required><option value="">Selecione</option>{aeroportos.map((a) => <option key={a.id} value={a.id}>{a.codigo_icao || a.codigo} — {a.nome}</option>)}</select></label>
          <label className="text-sm">Tipo de voo<select className={fieldClass} value={form.tipo_voo_id} onChange={(e) => set('tipo_voo_id', e.target.value)} required><option value="">Selecione</option>{tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label>
          <label className="text-sm">Natureza<select className={fieldClass} value={form.natureza_voo_id} onChange={(e) => set('natureza_voo_id', e.target.value)} required><option value="">Selecione</option>{naturezas.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}</select></label>
          <label className="text-sm">Saída prevista<input type="datetime-local" className={fieldClass} value={form.horario_previsto_partida} onChange={(e) => set('horario_previsto_partida', e.target.value)} required /></label>
          <label className="text-sm">Chegada prevista<input type="datetime-local" className={fieldClass} value={form.horario_previsto_chegada} onChange={(e) => set('horario_previsto_chegada', e.target.value)} required /></label>
          {mode === 'pilot' && <label className="text-sm">Minha função<select className={fieldClass} value={form.funcao} onChange={(e) => set('funcao', e.target.value)}><option value="PIC">PIC</option><option value="SIC">SIC</option></select></label>}
          <label className={`text-sm ${mode === 'pilot' ? '' : 'md:col-span-2'}`}>Observações<textarea className={fieldClass} rows={3} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></label>

          {error && <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
          {loadingCatalogos && <p className="md:col-span-2 text-sm text-slate-500">Carregando catálogos…</p>}

          <div className="md:col-span-2 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Cancelar</button>
            <button type="submit" disabled={saving || loadingCatalogos} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Criando…' : mode === 'pilot' ? 'Criar meu voo' : 'Criar voo'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
