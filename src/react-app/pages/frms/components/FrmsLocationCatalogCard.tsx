import { useEffect, useState } from 'react';
import { MapPin, Plus, Save, Trash2 } from 'lucide-react';
import { useFrmsLocationCatalog, useFrmsMutation, type FrmsLocationCatalogRow } from '@/react-app/hooks/useFrms';
import { clearApiCacheByPattern } from '@/react-app/hooks/useApi';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

type FormState = {
  code: string;
  operational_class: FrmsLocationCatalogRow['operational_class'];
  name: string;
  timezone_iana: string;
  weather_source_kind: FrmsLocationCatalogRow['weather_source_kind'];
  redemet_station_icao: string;
  latitude: string;
  longitude: string;
  source_reference: string;
};

const EMPTY: FormState = {
  code: '', operational_class: 'AERODROME', name: '', timezone_iana: '',
  weather_source_kind: 'NONE', redemet_station_icao: '', latitude: '', longitude: '', source_reference: '',
};

const OPERATIONAL_CLASS_LABELS: Record<FrmsLocationCatalogRow['operational_class'], string> = {
  AERODROME: 'Aeródromo',
  HELIDECK: 'Helideck',
  PLATFORM: 'Plataforma',
  OTHER: 'Outro',
};

const WEATHER_SOURCE_LABELS: Record<FrmsLocationCatalogRow['weather_source_kind'], string> = {
  NONE: 'Sem fonte meteorológica',
  REDEMET: 'REDEMET',
  HELIDECK_FEED: 'Feed do helideck',
  MANUAL_MEASURED: 'Medição manual',
};
function formFrom(row: FrmsLocationCatalogRow): FormState {
  return {
    code: row.code,
    operational_class: row.operational_class,
    name: row.name ?? '',
    timezone_iana: row.timezone_iana ?? '',
    weather_source_kind: row.weather_source_kind,
    redemet_station_icao: row.redemet_station_icao ?? '',
    latitude: row.latitude == null ? '' : String(row.latitude),
    longitude: row.longitude == null ? '' : String(row.longitude),
    source_reference: row.source_reference ?? '',
  };
}

function nullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function FrmsLocationCatalogCard() {
  const { data, loading, refetch } = useFrmsLocationCatalog();
  const locations = data ?? [];
  const { mutate } = useFrmsMutation();
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!selected) return;
    const row = locations.find((item) => item.code === selected);
    if (row) setForm(formFrom(row));
  }, [locations, selected]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
  };

  const startNew = () => {
    setSelected(null);
    setForm(EMPTY);
    setMessage(null);
  };

  const save = async () => {
    const code = form.code.trim().toUpperCase();
    if (!code || !form.source_reference.trim()) {
      setMessage('Código e referência controlada são obrigatórios.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await mutate(`/api/frms/configuracoes/localidades/${encodeURIComponent(code)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code, operational_class: form.operational_class, name: form.name.trim() || null,
          timezone_iana: form.timezone_iana.trim() || null,
          weather_source_kind: form.weather_source_kind,
          redemet_station_icao: form.redemet_station_icao.trim().toUpperCase() || null,
          latitude: nullableNumber(form.latitude), longitude: nullableNumber(form.longitude),
          source_reference: form.source_reference.trim(),
        }),
      });
      clearApiCacheByPattern('/api/frms/configuracoes/localidades');
      await refetch();
      setSelected(code);
      setMessage('Localidade salva com trilha de auditoria.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a localidade.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!(await confirmDialog(`Desativar a localidade ${selected}? O histórico será preservado.`))) return;
    setSaving(true);
    try {
      await mutate(`/api/frms/configuracoes/localidades/${encodeURIComponent(selected)}`, { method: 'DELETE' });
      clearApiCacheByPattern('/api/frms/configuracoes/localidades');
      await refetch();
      startNew();
      setMessage('Localidade desativada; histórico preservado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível desativar a localidade.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-5 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><MapPin className="h-4 w-4" /> Catálogo operacional de localidades</h3>
          <p className="mt-1 max-w-3xl text-xs text-slate-600">
            Fonte auditável para classificação offshore, timezone e meteorologia. O FRMS não infere plataforma, helideck, aeródromo ou estação REDEMET pelo formato do código.
          </p>
        </div>
        <button type="button" onClick={startNew} className="flex items-center gap-1 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-50">
          <Plus className="h-3.5 w-3.5" /> Nova localidade
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="max-h-72 overflow-y-auto rounded-lg border border-sky-100 bg-white">
          {loading ? <p className="p-3 text-xs text-slate-500">Carregando localidades...</p> : null}
          {!loading && locations.length === 0 ? <p className="p-3 text-xs text-slate-500">Nenhuma localidade ativa cadastrada.</p> : null}
          {locations.map((row) => (
            <button key={row.id} type="button" onClick={() => setSelected(row.code)}
              className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-xs last:border-0 ${selected === row.code ? 'bg-sky-100 text-sky-950' : 'hover:bg-slate-50'}`}>
              <span className="font-semibold">{row.code}</span>{row.name ? ` · ${row.name}` : ''}
              <span className="mt-0.5 block text-[11px] text-slate-500">{OPERATIONAL_CLASS_LABELS[row.operational_class]} · {WEATHER_SOURCE_LABELS[row.weather_source_kind]}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-700">Código
            <input value={form.code} disabled={Boolean(selected)} onChange={(e) => update('code', e.target.value.toUpperCase())}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100" />
          </label>
          <label className="text-xs font-medium text-slate-700">Classe operacional
            <select value={form.operational_class} onChange={(e) => update('operational_class', e.target.value as FormState['operational_class'])}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
              <option value="AERODROME">Aeródromo</option><option value="HELIDECK">Helideck</option><option value="PLATFORM">Plataforma</option><option value="OTHER">Outro</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-700">Nome
            <input value={form.name} onChange={(e) => update('name', e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-700">Timezone IANA
            <input value={form.timezone_iana} onChange={(e) => update('timezone_iana', e.target.value)} placeholder="Ex.: America/Sao_Paulo"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-700">Fonte meteorológica
            <select value={form.weather_source_kind} onChange={(e) => update('weather_source_kind', e.target.value as FormState['weather_source_kind'])}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
              <option value="NONE">Sem fonte</option><option value="REDEMET">REDEMET</option><option value="HELIDECK_FEED">Feed helideck</option><option value="MANUAL_MEASURED">Medição manual</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-700">Estação REDEMET ICAO
            <input value={form.redemet_station_icao} disabled={form.weather_source_kind !== 'REDEMET'} maxLength={4}
              onChange={(e) => update('redemet_station_icao', e.target.value.toUpperCase())}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100" />
          </label>
          <label className="text-xs font-medium text-slate-700">Latitude
            <input type="number" step="any" value={form.latitude} onChange={(e) => update('latitude', e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-700">Longitude
            <input type="number" step="any" value={form.longitude} onChange={(e) => update('longitude', e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" />
          </label>
          <label className="sm:col-span-2 text-xs font-medium text-slate-700">Referência controlada
            <input value={form.source_reference} onChange={(e) => update('source_reference', e.target.value)} placeholder="Documento, cadastro aeronáutico ou fonte operacional verificada"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" />
          </label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={save} disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> {saving ? 'Salvando...' : 'Salvar localidade'}
            </button>
            {selected ? (
              <button type="button" onClick={remove} disabled={saving}
                className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" /> Desativar
              </button>
            ) : null}
            {message ? <span className="text-xs text-slate-600">{message}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
