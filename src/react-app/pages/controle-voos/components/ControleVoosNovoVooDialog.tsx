import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { apiClient } from '@/react-app/services/apiClient';
import type { CvAeroporto, CvTipoVoo, CvVoo } from '@/react-app/hooks/useControleVoos';

type Props = {
  open: boolean;
  mode: 'coordenacao' | 'pilot';
  onClose: () => void;
  onCreated: (voo: CvVoo) => void;
};

type ApiEnvelope<T> = { success: boolean; data?: { data?: T } | T; error?: string };
type Aeronave = { id: number; codigo?: string | null; prefixo?: string | null; modelo?: string | null; status?: string | null };
type EligibleCrewMember = { id: number; nome: string; matricula: string | null; funcao_codigo: 'PIC' | 'SIC'; funcao_nome: string };
type CatalogItem = { id: number; codigo: string; nome: string; descricao?: string | null };

function extract<T>(response: unknown): T {
  const envelope = response as ApiEnvelope<T>;
  if (!envelope?.success) throw new Error(envelope?.error || 'Falha na API');
  const first = envelope.data as { data?: T } | T | undefined;
  if (first && typeof first === 'object' && !Array.isArray(first) && 'data' in first) {
    return (first as { data: T }).data;
  }
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

function parseDurationMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatDurationMinutes(value: number): string {
  const minutes = Math.max(0, Math.round(value));
  return String(Math.floor(minutes / 60)) + ':' + String(minutes % 60).padStart(2, '0');
}

function plannedDurationFromInputs(startValue: string, endValue: string): string {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return '';
  return formatDurationMinutes((end.getTime() - start.getTime()) / 60_000);
}

function plannedEndFromDuration(startValue: string, durationValue: string): string {
  const start = new Date(startValue);
  const minutes = parseDurationMinutes(durationValue);
  if (Number.isNaN(start.getTime()) || minutes === null) return '';
  return toLocalInput(new Date(start.getTime() + minutes * 60_000));
}

export default function ControleVoosNovoVooDialog({ open, mode, onClose, onCreated }: Props) {
  const now = useMemo(() => new Date(), []);
  const [aeroportos, setAeroportos] = useState<CvAeroporto[]>([]);
  const [tipos, setTipos] = useState<CvTipoVoo[]>([]);
  const [contratos, setContratos] = useState<CatalogItem[]>([]);
  const [funcoesBordo, setFuncoesBordo] = useState<CatalogItem[]>([]);
  const [aeronaves, setAeronaves] = useState<Aeronave[]>([]);
  const [eligibleCrew, setEligibleCrew] = useState<EligibleCrewMember[]>([]);
  const [routeIds, setRouteIds] = useState<string[]>(['', '']);
  const [routeQueries, setRouteQueries] = useState<string[]>(['', '']);
  const [loadingCatalogos, setLoadingCatalogos] = useState(false);
  const [loadingCrew, setLoadingCrew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    aeronave_id: '',
    prefixo: '',
    data_programacao: toLocalInput(now).slice(0, 10),
    numero_voo: '',
    numero_db: '',
    contrato_id: '',
    tipo_voo_id: '',
    funcao_bordo_id: '',
    pic_funcionario_id: '',
    sic_funcionario_id: '',
    pic_funcao_bordo_id: '',
    sic_funcao_bordo_id: '',
    horario_previsto_partida:
      mode === 'pilot' ? toLocalTime(new Date(now.getTime() + 60 * 60_000)) : toLocalInput(new Date(now.getTime() + 60 * 60_000)),
    horario_previsto_chegada:
      mode === 'pilot' ? toLocalTime(new Date(now.getTime() + 2 * 60 * 60_000)) : toLocalInput(new Date(now.getTime() + 2 * 60 * 60_000)),
    tempo_total_voo: '1:00',
    observacoes: '',
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCatalogos(true);
    setError(null);
    setRouteIds(['', '']);
    setRouteQueries(['', '']);
    void Promise.all([
      apiClient.get<unknown>('/controle-voos/catalogos/aeroportos'),
      apiClient.get<unknown>('/controle-voos/catalogos/tipos'),
      apiClient.get<unknown>('/controle-voos/catalogos/contratos'),
      apiClient.get<unknown>('/controle-voos/catalogos/funcoes-bordo'),
      apiClient.get<unknown>('/aeronaves?somente_ativas=1'),
    ])
      .then(([a, t, c, f, ac]) => {
        if (cancelled) return;
        setAeroportos(extract<CvAeroporto[]>(a) || []);
        setTipos(extract<CvTipoVoo[]>(t) || []);
        setContratos(extract<CatalogItem[]>(c) || []);
        const roleRows = extract<CatalogItem[]>(f) || [];
        setFuncoesBordo(roleRows);
        setAeronaves(extract<Aeronave[]>(ac) || []);
        const comandante = roleRows.find((item) => item.codigo === 'COMANDANTE');
        const copiloto = roleRows.find((item) => item.codigo === 'COPILOTO');
        setForm((prev) => ({
          ...prev,
          pic_funcao_bordo_id: prev.pic_funcao_bordo_id || (comandante ? String(comandante.id) : ''),
          sic_funcao_bordo_id: prev.sic_funcao_bordo_id || (copiloto ? String(copiloto.id) : ''),
          funcao_bordo_id: prev.funcao_bordo_id || (comandante ? String(comandante.id) : ''),
        }));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar dados do voo.');
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalogos(false);
      });
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
  const setPlannedDeparture = (value: string) => {
    setForm((prev) => {
      const next = { ...prev, horario_previsto_partida: value };
      if (mode === 'coordenacao' && prev.tempo_total_voo) {
        const computed = plannedEndFromDuration(value, prev.tempo_total_voo);
        if (computed) next.horario_previsto_chegada = computed;
      }
      return next;
    });
  };
  const setPlannedArrival = (value: string) => {
    setForm((prev) => ({
      ...prev,
      horario_previsto_chegada: value,
      ...(mode === 'coordenacao'
        ? { tempo_total_voo: plannedDurationFromInputs(prev.horario_previsto_partida, value) }
        : {}),
    }));
  };
  const setPlannedDuration = (value: string) => {
    setForm((prev) => {
      const next = { ...prev, tempo_total_voo: value };
      const computed = plannedEndFromDuration(prev.horario_previsto_partida, value);
      if (computed) next.horario_previsto_chegada = computed;
      return next;
    });
  };
  const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

  const aeroportoLabel = (item: CvAeroporto) => {
    const icao = item.codigo_icao?.trim();
    const primary = item.codigo?.trim();
    const codes = icao && icao.toUpperCase() !== primary.toUpperCase() ? `${primary} · ICAO ${icao}` : primary;
    return `${codes} — ${item.nome}`;
  };
  const aeroportoMatches = (query: string) => {
    const normalized = query.trim().toLocaleUpperCase('pt-BR');
    const source = normalized
      ? aeroportos.filter((item) => aeroportoLabel(item).toLocaleUpperCase('pt-BR').includes(normalized))
      : aeroportos;
    return source.slice(0, 80);
  };
  const selectRoutePointText = (index: number, value: string) => {
    const normalized = value.trim().toLocaleUpperCase('pt-BR');
    const exactLabel = aeroportos.find((item) => aeroportoLabel(item).toLocaleUpperCase('pt-BR') === normalized);
    const exactPrimary = aeroportos.find((item) => item.codigo?.trim().toLocaleUpperCase('pt-BR') === normalized);
    const exactIcao = aeroportos.filter((item) => item.codigo_icao?.trim().toLocaleUpperCase('pt-BR') === normalized);
    const selected = exactLabel || exactPrimary || (exactIcao.length === 1 ? exactIcao[0] : undefined);
    setRouteQueries((items) => items.map((item, itemIndex) => (itemIndex === index ? value : item)));
    setRouteIds((items) => items.map((item, itemIndex) => (itemIndex === index ? (selected ? String(selected.id) : '') : item)));
  };
  const addRouteStop = () => {
    setRouteIds((items) => [...items.slice(0, -1), '', items[items.length - 1] || '']);
    setRouteQueries((items) => [...items.slice(0, -1), '', items[items.length - 1] || '']);
  };
  const removeRouteStop = (index: number) => {
    setRouteIds((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setRouteQueries((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };
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
    const routeReady = routeIds.length >= 2 && routeIds.every(Boolean);
    const commonReady = form.aeronave_id && form.prefixo && form.contrato_id && form.tipo_voo_id && routeReady;
    const crewReady = mode === 'pilot'
      ? Boolean(form.funcao_bordo_id)
      : Boolean(form.pic_funcionario_id && form.sic_funcionario_id && form.pic_funcao_bordo_id && form.sic_funcao_bordo_id);
    if (!commonReady || !crewReady) {
      setError(mode === 'pilot'
        ? 'Selecione aeronave, rota, contrato, tipo de voo e sua função a bordo.'
        : 'Selecione aeronave, rota, contrato, tipo de voo, tripulação e funções a bordo.');
      return;
    }
    if (routeIds.some((point, index) => index > 0 && point === routeIds[index - 1])) {
      setError('Dois pontos consecutivos da rota não podem ser iguais.');
      return;
    }
    if (mode === 'coordenacao' && form.pic_funcionario_id === form.sic_funcionario_id) {
      setError('Os dois postos de tripulação devem usar pessoas diferentes.');
      return;
    }

    setSaving(true);
    try {
      const partida = mode === 'pilot'
        ? combineFlightDateAndTime(form.data_programacao, form.horario_previsto_partida)
        : new Date(form.horario_previsto_partida);
      let chegada = mode === 'pilot'
        ? combineFlightDateAndTime(form.data_programacao, form.horario_previsto_chegada)
        : new Date(form.horario_previsto_chegada);
      if (mode === 'pilot' && chegada.getTime() < partida.getTime()) chegada = new Date(chegada.getTime() + 24 * 60 * 60_000);

      const common = {
        aeronave_id: Number(form.aeronave_id),
        prefixo: form.prefixo.trim().toUpperCase(),
        data_programacao: form.data_programacao,
        numero_voo: form.numero_voo.trim() || null,
        ...(mode === 'pilot' ? { numero_db: form.numero_db.trim() || null } : {}),
        contrato_id: Number(form.contrato_id),
        tipo_voo_id: Number(form.tipo_voo_id),
        rota_ids: routeIds.map(Number),
        horario_previsto_partida: partida.toISOString(),
        horario_previsto_chegada: chegada.toISOString(),
        observacoes: form.observacoes.trim() || null,
      };
      const body = mode === 'pilot'
        ? { ...common, funcao_bordo_id: Number(form.funcao_bordo_id) }
        : {
            ...common,
            origem_id: Number(routeIds[0]),
            destino_id: Number(routeIds[routeIds.length - 1]),
            pic_funcionario_id: Number(form.pic_funcionario_id),
            sic_funcionario_id: Number(form.sic_funcionario_id),
            pic_funcao_bordo_id: Number(form.pic_funcao_bordo_id),
            sic_funcao_bordo_id: Number(form.sic_funcao_bordo_id),
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

  const picOptions = eligibleCrew.filter((member) => member.funcao_codigo === 'PIC' && String(member.id) !== form.sic_funcionario_id);
  const sicOptions = eligibleCrew.filter((member) => String(member.id) !== form.pic_funcionario_id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{mode === 'pilot' ? 'Criar meu voo' : 'Novo voo'}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A ID interna é gerada automaticamente pelo AirTrust ao salvar.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-sm">Número do voo<input className={fieldClass} value={form.numero_voo} onChange={(e) => set('numero_voo', e.target.value)} placeholder={mode === 'pilot' ? 'Preencha se a Coordenação não informou' : 'Número operacional do voo'} /></label>
          {mode === 'pilot' && (
            <label className="text-sm">Relatório de voo<input className={fieldClass} value={form.numero_db} onChange={(e) => set('numero_db', e.target.value)} placeholder="Número do relatório de voo" /></label>
          )}

          <div className="text-sm">
            <div className="flex items-center justify-between gap-2"><label htmlFor="controle-voos-contrato">Contrato</label><Link to="/controle-voos/tabelas" className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300">Gerenciar</Link></div>
            <select id="controle-voos-contrato" className={fieldClass} value={form.contrato_id} onChange={(e) => set('contrato_id', e.target.value)} required>
              <option value="">Selecione</option>{contratos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </select>
          </div>
          <div className="text-sm">
            <div className="flex items-center justify-between gap-2"><label htmlFor="controle-voos-tipo">Tipo de voo</label><Link to="/controle-voos/tabelas" className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300">Gerenciar</Link></div>
            <select id="controle-voos-tipo" className={fieldClass} value={form.tipo_voo_id} onChange={(e) => set('tipo_voo_id', e.target.value)} required>
              <option value="">Selecione</option>{tipos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </select>
          </div>

          <label className="text-sm">Aeronave / Prefixo
            <select className={fieldClass} value={form.aeronave_id} onChange={(e) => selectAircraft(e.target.value)} required>
              <option value="">Selecione</option>
              {aeronaves.map((aeronave) => <option key={aeronave.id} value={aeronave.id}>{aeronave.prefixo || aeronave.codigo || 'Sem prefixo'}{aeronave.modelo ? ` · ${aeronave.modelo}` : ''}</option>)}
            </select>
          </label>
          <label className="text-sm">Data<input type="date" className={fieldClass} value={form.data_programacao} onChange={(e) => set('data_programacao', e.target.value)} required /></label>

          <div className="md:col-span-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Rota e etapas</h3><p className="mt-1 text-xs text-slate-500">Busque no cadastro de pontos aeronáuticos por aeródromo, ICAO ou nome.</p></div>
              <button type="button" onClick={addRouteStop} className="inline-flex items-center gap-1 rounded-lg bg-cyan-700 px-2.5 py-1.5 text-xs font-medium text-white"><Plus className="h-3 w-3" /> Adicionar parada</button>
            </div>
            <div className="space-y-3">
              {routeIds.map((routeId, index) => {
                const isFirst = index === 0;
                const isLast = index === routeIds.length - 1;
                const label = isFirst ? 'Aeródromo de origem' : isLast ? 'Destino final' : `Parada ${index}`;
                const listId = `controle-voos-rota-opcoes-${index}`;
                return <div key={`route-${index}`} className="flex items-end gap-2">
                  <label className="min-w-0 flex-1 text-sm">{label}
                    <input list={listId} className={fieldClass} value={routeQueries[index] || ''} onChange={(e) => selectRoutePointText(index, e.target.value)} placeholder="Digite código ICAO, aeródromo ou local" autoComplete="off" required />
                    <datalist id={listId}>{aeroportoMatches(routeQueries[index] || '').map((a) => <option key={a.id} value={aeroportoLabel(a)} />)}</datalist>
                  </label>
                  {!isFirst && !isLast && <button type="button" onClick={() => removeRouteStop(index)} className="mb-0.5 rounded-lg border border-slate-300 p-2.5 text-slate-600 dark:border-slate-700 dark:text-slate-300" aria-label={`Remover ${label}`}><X className="h-4 w-4" /></button>}
                </div>;
              })}
            </div>
            {routeIds.every(Boolean) && <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {routeIds.slice(0, -1).map((pointId, index) => {
                const from = aeroportos.find((a) => String(a.id) === pointId);
                const to = aeroportos.find((a) => String(a.id) === routeIds[index + 1]);
                return <span key={`leg-${index}`} className="mr-3 inline-block">Etapa {index + 1}: {from?.codigo_icao || from?.codigo || '—'} → {to?.codigo_icao || to?.codigo || '—'}</span>;
              })}
            </div>}
          </div>

          {mode === 'coordenacao' ? (
            <>
              <label className="text-sm">Tripulante — posto PIC
                <select className={fieldClass} value={form.pic_funcionario_id} onChange={(e) => set('pic_funcionario_id', e.target.value)} disabled={!form.aeronave_id || loadingCrew} required>
                  <option value="">{loadingCrew ? 'Carregando…' : 'Selecione'}</option>{picOptions.map((member) => <option key={member.id} value={member.id}>{member.nome}{member.matricula ? ` · ${member.matricula}` : ''}</option>)}
                </select>
              </label>
              <label className="text-sm">Função a bordo — posto PIC
                <select className={fieldClass} value={form.pic_funcao_bordo_id} onChange={(e) => set('pic_funcao_bordo_id', e.target.value)} required><option value="">Selecione</option>{funcoesBordo.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
              </label>
              <label className="text-sm">Tripulante — posto SIC
                <select className={fieldClass} value={form.sic_funcionario_id} onChange={(e) => set('sic_funcionario_id', e.target.value)} disabled={!form.aeronave_id || loadingCrew} required>
                  <option value="">{loadingCrew ? 'Carregando…' : 'Selecione'}</option>{sicOptions.map((member) => <option key={member.id} value={member.id}>{member.nome} · {member.funcao_nome}{member.matricula ? ` · ${member.matricula}` : ''}</option>)}
                </select>
              </label>
              <label className="text-sm">Função a bordo — posto SIC
                <select className={fieldClass} value={form.sic_funcao_bordo_id} onChange={(e) => set('sic_funcao_bordo_id', e.target.value)} required><option value="">Selecione</option>{funcoesBordo.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
              </label>
            </>
          ) : (
            <div className="text-sm md:col-span-2">
              <div className="flex items-center justify-between gap-2"><label htmlFor="controle-voos-funcao-bordo">Minha função a bordo</label><Link to="/controle-voos/tabelas" className="text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300">Gerenciar funções</Link></div>
              <select id="controle-voos-funcao-bordo" className={fieldClass} value={form.funcao_bordo_id} onChange={(e) => set('funcao_bordo_id', e.target.value)} required><option value="">Selecione</option>{funcoesBordo.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
            </div>
          )}

          <label className="text-sm">{mode === 'coordenacao' ? 'Decolagem estimada' : 'Saída prevista'}<input type={mode === 'pilot' ? 'time' : 'datetime-local'} className={fieldClass} value={form.horario_previsto_partida} onChange={(e) => setPlannedDeparture(e.target.value)} required /></label>
          <label className="text-sm">{mode === 'coordenacao' ? 'Retorno estimado' : 'Chegada prevista'}<input type={mode === 'pilot' ? 'time' : 'datetime-local'} className={fieldClass} value={form.horario_previsto_chegada} onChange={(e) => setPlannedArrival(e.target.value)} required /></label>
          {mode === 'coordenacao' && (
            <label className="text-sm">Tempo total de voo
              <input
                type="text"
                inputMode="numeric"
                className={fieldClass}
                value={form.tempo_total_voo}
                onChange={(e) => setPlannedDuration(e.target.value)}
                onBlur={(e) => {
                  const minutes = parseDurationMinutes(e.target.value);
                  if (minutes !== null) setPlannedDuration(formatDurationMinutes(minutes));
                }}
                placeholder="HH:MM"
                pattern="\d{1,2}:[0-5]\d"
                required
              />
              <span className="mt-1 block text-xs text-slate-500">Preencha a chegada ou a duração; o outro campo é recalculado automaticamente.</span>
            </label>
          )}
          <label className="text-sm md:col-span-2">Observações<textarea className={fieldClass} rows={3} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></label>

          {error && <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
          {loadingCatalogos && <p className="md:col-span-2 text-sm text-slate-500">Carregando cadastros operacionais…</p>}
          <div className="md:col-span-2 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Cancelar</button>
            <button type="submit" disabled={saving || loadingCatalogos || aeronaves.length === 0} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Criando…' : mode === 'pilot' ? 'Criar meu voo' : 'Criar voo'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
