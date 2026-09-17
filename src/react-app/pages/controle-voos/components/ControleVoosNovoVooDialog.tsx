import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { apiClient } from '@/react-app/services/apiClient';
import type { CvAeroporto, CvNaturezaVoo, CvTipoVoo, CvVoo } from '@/react-app/hooks/useControleVoos';

type Props = {
  open: boolean;
  mode: 'coordenacao' | 'pilot';
  onClose: () => void;
  onCreated: (voo: CvVoo) => void;
};

type ApiEnvelope<T> = { success: boolean; data?: { data?: T } | T; error?: string };
type Aeronave = { id: number; codigo?: string | null; prefixo?: string | null; modelo?: string | null; status?: string | null };
type EligibleCrewMember = { id: number; nome: string; matricula: string | null; funcao_codigo: 'PIC' | 'SIC'; funcao_nome: string };
type QuickCatalog = 'aeroportos' | 'tipos' | 'naturezas';
type QuickTarget = 'origem_id' | 'destino_id' | 'tipo_voo_id' | 'natureza_voo_id';
type QuickCreateState = { catalog: QuickCatalog; target: QuickTarget };
type QuickCreated =
  | { catalog: 'aeroportos'; item: CvAeroporto }
  | { catalog: 'tipos'; item: CvTipoVoo }
  | { catalog: 'naturezas'; item: CvNaturezaVoo };

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

function toLocalTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function combineFlightDateAndTime(dateText: string, timeText: string) {
  const [year, month, day] = dateText.split('-').map(Number);
  const [hour, minute] = timeText.split(':').map(Number);
  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  if ([year, month, day, hour, minute].some((part) => !Number.isFinite(part)) || Number.isNaN(value.getTime())) {
    throw new Error('Data ou horário inválido.');
  }
  return value;
}

export default function ControleVoosNovoVooDialog({ open, mode, onClose, onCreated }: Props) {
  const now = useMemo(() => new Date(), []);
  const { isAdmin, isGestor } = usePermissions();
  const canManageCatalogs = mode === 'coordenacao' && (isAdmin || isGestor);
  const [aeroportos, setAeroportos] = useState<CvAeroporto[]>([]);
  const [tipos, setTipos] = useState<CvTipoVoo[]>([]);
  const [naturezas, setNaturezas] = useState<CvNaturezaVoo[]>([]);
  const [aeronaves, setAeronaves] = useState<Aeronave[]>([]);
  const [eligibleCrew, setEligibleCrew] = useState<EligibleCrewMember[]>([]);
  const [loadingCatalogos, setLoadingCatalogos] = useState(false);
  const [loadingCrew, setLoadingCrew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);
  const [form, setForm] = useState({
    aeronave_id: '',
    prefixo: '',
    data_programacao: toLocalInput(now).slice(0, 10),
    origem_id: '',
    destino_id: '',
    tipo_voo_id: '',
    natureza_voo_id: '',
    origem_texto: '',
    destino_texto: '',
    tipo_voo_texto: '',
    natureza_voo_codigo: 'PETROBRAS',
    horario_previsto_partida: mode === 'pilot' ? toLocalTime(new Date(now.getTime() + 60 * 60_000)) : toLocalInput(new Date(now.getTime() + 60 * 60_000)),
    horario_previsto_chegada: mode === 'pilot' ? toLocalTime(new Date(now.getTime() + 2 * 60 * 60_000)) : toLocalInput(new Date(now.getTime() + 2 * 60 * 60_000)),
    observacoes: '',
    funcao: 'PIC' as 'PIC' | 'SIC',
    pic_funcionario_id: '',
    sic_funcionario_id: '',
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCatalogos(true);
    setError(null);
    const load = async () => {
      try {
        if (mode === 'coordenacao') {
          const [a, t, n, ac] = await Promise.all([
            apiClient.get<unknown>('/controle-voos/catalogos/aeroportos'),
            apiClient.get<unknown>('/controle-voos/catalogos/tipos'),
            apiClient.get<unknown>('/controle-voos/catalogos/naturezas'),
            apiClient.get<unknown>('/aeronaves?somente_ativas=1'),
          ]);
          if (cancelled) return;
          setAeroportos(extract<CvAeroporto[]>(a) || []);
          setTipos(extract<CvTipoVoo[]>(t) || []);
          setNaturezas(extract<CvNaturezaVoo[]>(n) || []);
          setAeronaves(extract<Aeronave[]>(ac) || []);
        } else {
          const ac = await apiClient.get<unknown>('/aeronaves?somente_ativas=1');
          if (!cancelled) setAeronaves(extract<Aeronave[]>(ac) || []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar dados do voo.');
      } finally {
        if (!cancelled) setLoadingCatalogos(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || mode !== 'coordenacao' || !form.aeronave_id) {
      setEligibleCrew([]);
      return;
    }
    let cancelled = false;
    setLoadingCrew(true);
    setError(null);
    void apiClient
      .get<unknown>(`/controle-voos/voos/tripulantes-elegiveis?aeronave_id=${form.aeronave_id}`)
      .then((response) => {
        if (!cancelled) setEligibleCrew(extract<EligibleCrewMember[]>(response) || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar tripulação elegível.');
      })
      .finally(() => {
        if (!cancelled) setLoadingCrew(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, form.aeronave_id]);

  if (!open) return null;

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const selectAircraft = (id: string) => {
    const aircraft = aeronaves.find((item) => String(item.id) === id);
    setForm((prev) => ({
      ...prev,
      aeronave_id: id,
      prefixo: aircraft?.prefixo?.trim().toUpperCase() || aircraft?.codigo?.trim().toUpperCase() || '',
      pic_funcionario_id: '',
      sic_funcionario_id: '',
    }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const pilotManualFieldsReady = form.origem_texto.trim() && form.destino_texto.trim() && form.tipo_voo_texto.trim() && form.natureza_voo_codigo;
    const coordinationCatalogFieldsReady = form.origem_id && form.destino_id && form.tipo_voo_id && form.natureza_voo_id;
    const coordinationCrewReady = form.pic_funcionario_id && form.sic_funcionario_id;
    if (!form.aeronave_id || !form.prefixo.trim() || (mode === 'pilot' ? !pilotManualFieldsReady : !coordinationCatalogFieldsReady || !coordinationCrewReady)) {
      setError(mode === 'pilot' ? 'Informe aeronave, origem, destino, tipo e natureza do voo.' : 'Selecione aeronave, PIC, SIC, origem, destino, tipo e natureza do voo.');
      return;
    }
    if (mode === 'coordenacao' && form.pic_funcionario_id === form.sic_funcionario_id) {
      setError('PIC e SIC devem ser tripulantes diferentes.');
      return;
    }
    const origemComparavel = mode === 'pilot' ? form.origem_texto.trim().toUpperCase() : form.origem_id;
    const destinoComparavel = mode === 'pilot' ? form.destino_texto.trim().toUpperCase() : form.destino_id;
    if (origemComparavel === destinoComparavel) {
      setError('Origem e destino devem ser diferentes.');
      return;
    }
    setSaving(true);
    try {
      const partida = mode === 'pilot' ? combineFlightDateAndTime(form.data_programacao, form.horario_previsto_partida) : new Date(form.horario_previsto_partida);
      let chegada = mode === 'pilot' ? combineFlightDateAndTime(form.data_programacao, form.horario_previsto_chegada) : new Date(form.horario_previsto_chegada);
      if (mode === 'pilot' && chegada.getTime() < partida.getTime()) chegada = new Date(chegada.getTime() + 24 * 60 * 60_000);
      const common = {
        aeronave_id: Number(form.aeronave_id),
        prefixo: form.prefixo.trim().toUpperCase(),
        data_programacao: form.data_programacao,
        horario_previsto_partida: partida.toISOString(),
        horario_previsto_chegada: chegada.toISOString(),
        observacoes: form.observacoes.trim() || null,
      };
      const body = mode === 'pilot'
        ? { ...common, origem_texto: form.origem_texto.trim(), destino_texto: form.destino_texto.trim(), tipo_voo_texto: form.tipo_voo_texto.trim(), natureza_voo_codigo: form.natureza_voo_codigo, funcao: form.funcao }
        : {
            ...common,
            origem_id: Number(form.origem_id),
            destino_id: Number(form.destino_id),
            tipo_voo_id: Number(form.tipo_voo_id),
            natureza_voo_id: Number(form.natureza_voo_id),
            pic_funcionario_id: Number(form.pic_funcionario_id),
            sic_funcionario_id: Number(form.sic_funcionario_id),
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
  const labelRowClass = 'flex items-center justify-between gap-2';
  const picOptions = eligibleCrew.filter(
    (member) => member.funcao_codigo === 'PIC' && String(member.id) !== form.sic_funcionario_id,
  );
  const sicOptions = eligibleCrew.filter((member) => String(member.id) !== form.pic_funcionario_id);
  const openQuick = (catalog: QuickCatalog, target: QuickTarget) => setQuickCreate({ catalog, target });

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
          <div className="text-sm">
            <div className={labelRowClass}>
              <label htmlFor="controle-voos-aeronave">Aeronave / Prefixo</label>
              {mode === 'coordenacao' && <Link to="/configuracoes" className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300">Gerenciar frota</Link>}
            </div>
            <select id="controle-voos-aeronave" className={fieldClass} value={form.aeronave_id} onChange={(e) => selectAircraft(e.target.value)} required>
              <option value="">Selecione</option>
              {aeronaves.map((aeronave) => (
                <option key={aeronave.id} value={aeronave.id}>
                  {aeronave.prefixo || aeronave.codigo || 'Sem prefixo'}{aeronave.modelo ? ` · ${aeronave.modelo}` : ''}
                </option>
              ))}
            </select>
          </div>
          <label className="text-sm">Data<input type="date" className={fieldClass} value={form.data_programacao} onChange={(e) => set('data_programacao', e.target.value)} required /></label>

          {mode === 'coordenacao' && (
            <>
              <label className="text-sm">PIC (Comandante)
                <select className={fieldClass} value={form.pic_funcionario_id} onChange={(e) => set('pic_funcionario_id', e.target.value)} disabled={!form.aeronave_id || loadingCrew} required>
                  <option value="">{loadingCrew ? 'Carregando…' : 'Selecione o comandante'}</option>
                  {picOptions.map((member) => <option key={member.id} value={member.id}>{member.nome}{member.matricula ? ` · ${member.matricula}` : ''}</option>)}
                </select>
              </label>
              <label className="text-sm">SIC (Comandante ou Copiloto)
                <select className={fieldClass} value={form.sic_funcionario_id} onChange={(e) => set('sic_funcionario_id', e.target.value)} disabled={!form.aeronave_id || loadingCrew} required>
                  <option value="">{loadingCrew ? 'Carregando…' : 'Selecione o SIC'}</option>
                  {sicOptions.map((member) => <option key={member.id} value={member.id}>{member.nome} · {member.funcao_nome}{member.matricula ? ` · ${member.matricula}` : ''}</option>)}
                </select>
              </label>
            </>
          )}

          {mode === 'pilot' ? (
            <>
              <label className="text-sm">Aeródromo de origem<input id="controle-voos-origem" className={fieldClass} value={form.origem_texto} onChange={(e) => set('origem_texto', e.target.value)} placeholder="Digite o aeródromo ou plataforma" required /></label>
              <label className="text-sm">Aeródromo de destino<input id="controle-voos-destino" className={fieldClass} value={form.destino_texto} onChange={(e) => set('destino_texto', e.target.value)} placeholder="Digite o aeródromo ou plataforma" required /></label>
              <label className="text-sm">Tipo de voo<input id="controle-voos-tipo" className={fieldClass} value={form.tipo_voo_texto} onChange={(e) => set('tipo_voo_texto', e.target.value)} placeholder="Digite o tipo de voo" required /></label>
              <label className="text-sm">Natureza<select id="controle-voos-natureza" className={fieldClass} value={form.natureza_voo_codigo} onChange={(e) => set('natureza_voo_codigo', e.target.value)} required><option value="PETROBRAS">Petrobras</option><option value="MANUTENCAO">Manutenção</option></select></label>
              <label className="text-sm">Saída prevista<input type="time" className={fieldClass} value={form.horario_previsto_partida} onChange={(e) => set('horario_previsto_partida', e.target.value)} required /></label>
              <label className="text-sm">Chegada prevista<input type="time" className={fieldClass} value={form.horario_previsto_chegada} onChange={(e) => set('horario_previsto_chegada', e.target.value)} required /></label>
            </>
          ) : (
            <>
          <div className="text-sm">
                <div className={labelRowClass}>
                  <label htmlFor="controle-voos-origem">Origem</label>
                  {canManageCatalogs && <button type="button" onClick={() => openQuick('aeroportos', 'origem_id')} className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300"><Plus className="h-3 w-3" /> Cadastrar</button>}
                </div>
                <select id="controle-voos-origem" className={fieldClass} value={form.origem_id} onChange={(e) => set('origem_id', e.target.value)} required><option value="">Selecione</option>{aeroportos.map((a) => <option key={a.id} value={a.id}>{a.codigo_icao || a.codigo} — {a.nome}</option>)}</select>
              </div>
              <div className="text-sm">
                <div className={labelRowClass}>
                  <label htmlFor="controle-voos-destino">Destino</label>
                  {canManageCatalogs && <button type="button" onClick={() => openQuick('aeroportos', 'destino_id')} className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300"><Plus className="h-3 w-3" /> Cadastrar</button>}
                </div>
                <select id="controle-voos-destino" className={fieldClass} value={form.destino_id} onChange={(e) => set('destino_id', e.target.value)} required><option value="">Selecione</option>{aeroportos.map((a) => <option key={a.id} value={a.id}>{a.codigo_icao || a.codigo} — {a.nome}</option>)}</select>
              </div>
              <div className="text-sm">
                <div className={labelRowClass}>
                  <label htmlFor="controle-voos-tipo">Tipo de voo</label>
                  {canManageCatalogs && <button type="button" onClick={() => openQuick('tipos', 'tipo_voo_id')} className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300"><Plus className="h-3 w-3" /> Cadastrar</button>}
                </div>
                <select id="controle-voos-tipo" className={fieldClass} value={form.tipo_voo_id} onChange={(e) => set('tipo_voo_id', e.target.value)} required><option value="">Selecione</option>{tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select>
              </div>
              <div className="text-sm">
                <div className={labelRowClass}>
                  <label htmlFor="controle-voos-natureza">Natureza</label>
                  {canManageCatalogs && <button type="button" onClick={() => openQuick('naturezas', 'natureza_voo_id')} className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300"><Plus className="h-3 w-3" /> Cadastrar</button>}
                </div>
                <select id="controle-voos-natureza" className={fieldClass} value={form.natureza_voo_id} onChange={(e) => set('natureza_voo_id', e.target.value)} required><option value="">Selecione</option>{naturezas.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}</select>
              </div>
              <label className="text-sm">Saída prevista<input type="datetime-local" className={fieldClass} value={form.horario_previsto_partida} onChange={(e) => set('horario_previsto_partida', e.target.value)} required /></label>
              <label className="text-sm">Chegada prevista<input type="datetime-local" className={fieldClass} value={form.horario_previsto_chegada} onChange={(e) => set('horario_previsto_chegada', e.target.value)} required /></label>

            </>
          )}
          {mode === 'pilot' && <label className="text-sm">Minha função<select className={fieldClass} value={form.funcao} onChange={(e) => set('funcao', e.target.value)}><option value="PIC">PIC</option><option value="SIC">SIC</option></select></label>}
          <label className={`text-sm ${mode === 'pilot' ? '' : 'md:col-span-2'}`}>Observações<textarea className={fieldClass} rows={3} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></label>

          {aeronaves.length === 0 && !loadingCatalogos && (
            <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
              Nenhuma aeronave ativa está cadastrada para a empresa. {mode === 'coordenacao' ? <Link to="/configuracoes" className="font-medium underline">Cadastre a frota em Configurações.</Link> : 'Solicite o cadastro à Coordenação.'}
            </div>
          )}
          {error && <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
          {loadingCatalogos && <p className="md:col-span-2 text-sm text-slate-500">Carregando cadastros operacionais…</p>}

          <div className="md:col-span-2 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Cancelar</button>
            <button type="submit" disabled={saving || loadingCatalogos || aeronaves.length === 0} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Criando…' : mode === 'pilot' ? 'Criar meu voo' : 'Criar voo'}</button>
          </div>
        </form>
      </div>

      {quickCreate && (
        <QuickCatalogDialog
          state={quickCreate}
          onClose={() => setQuickCreate(null)}
          onCreated={(created) => {
            if (created.catalog === 'aeroportos') setAeroportos((items) => [...items, created.item]);
            if (created.catalog === 'tipos') setTipos((items) => [...items, created.item]);
            if (created.catalog === 'naturezas') setNaturezas((items) => [...items, created.item]);
            set(quickCreate.target, String(created.item.id));
            setQuickCreate(null);
          }}
        />
      )}
    </div>
  );
}

function QuickCatalogDialog({
  state,
  onClose,
  onCreated,
}: {
  state: QuickCreateState;
  onClose: () => void;
  onCreated: (created: QuickCreated) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ codigo: '', nome: '', codigo_icao: '', cidade: '', uf: '', tipo: 'aeroporto', descricao: '' });
  const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';
  const label = state.catalog === 'aeroportos' ? 'aeródromo' : state.catalog === 'tipos' ? 'tipo de voo' : 'natureza do voo';
  const setField = (field: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        codigo: form.codigo.trim().toUpperCase(),
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
      };
      if (state.catalog === 'aeroportos') {
        payload.codigo_icao = form.codigo_icao.trim().toUpperCase() || null;
        payload.cidade = form.cidade.trim() || null;
        payload.uf = form.uf.trim().toUpperCase() || null;
        payload.tipo = form.tipo;
      }
      const response = await apiClient.post<unknown>(`/controle-voos/catalogos/${state.catalog}`, payload);
      if (state.catalog === 'aeroportos') {
        onCreated({ catalog: 'aeroportos', item: extract<CvAeroporto>(response) });
      } else if (state.catalog === 'tipos') {
        onCreated({ catalog: 'tipos', item: extract<CvTipoVoo>(response) });
      } else {
        onCreated({ catalog: 'naturezas', item: extract<CvNaturezaVoo>(response) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cadastrar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Cadastrar {label}</h3>
            <p className="mt-1 text-xs text-slate-500">O novo item ficará disponível imediatamente neste voo.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar cadastro rápido"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">Código<input className={fieldClass} value={form.codigo} onChange={(e) => setField('codigo', e.target.value)} required /></label>
          <label className="text-sm">Nome<input className={fieldClass} value={form.nome} onChange={(e) => setField('nome', e.target.value)} required /></label>
          {state.catalog === 'aeroportos' && (
            <>
              <label className="text-sm">ICAO<input className={fieldClass} value={form.codigo_icao} onChange={(e) => setField('codigo_icao', e.target.value)} /></label>
              <label className="text-sm">Tipo<select className={fieldClass} value={form.tipo} onChange={(e) => setField('tipo', e.target.value)}><option value="aeroporto">Aeroporto</option><option value="heliponto">Heliponto</option><option value="plataforma">Plataforma</option></select></label>
              <label className="text-sm">Cidade<input className={fieldClass} value={form.cidade} onChange={(e) => setField('cidade', e.target.value)} /></label>
              <label className="text-sm">UF<input className={fieldClass} value={form.uf} onChange={(e) => setField('uf', e.target.value)} /></label>
            </>
          )}
          <label className="text-sm sm:col-span-2">Descrição<textarea className={fieldClass} rows={2} value={form.descricao} onChange={(e) => setField('descricao', e.target.value)} /></label>
          {error && <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Salvando…' : 'Cadastrar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
