import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  Edit3,
  Layers,
  Loader2,
  MapPin,
  Plane,
  Plus,
  RefreshCw,
  Tag,
  X,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { apiClient } from '@/react-app/services/apiClient';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';

type CatalogName = 'aeroportos' | 'tipos' | 'naturezas' | 'motivos';
type CatalogItem = {
  id: number;
  codigo?: string | null;
  codigo_icao?: string | null;
  codigo_iata?: string | null;
  nome?: string | null;
  cidade?: string | null;
  uf?: string | null;
  tipo?: string | null;
  descricao?: string | null;
  ativo?: number | boolean | null;
  ordem?: number | null;
};

type CatalogState = Record<CatalogName, CatalogItem[]>;
type ApiEnvelope<T> = { success?: boolean; data?: T | { data?: T }; error?: string };

type EditorState = {
  catalog: CatalogName;
  item: CatalogItem | null;
};

const EMPTY_STATE: CatalogState = {
  aeroportos: [],
  tipos: [],
  naturezas: [],
  motivos: [],
};

const CATALOG_META: Record<
  CatalogName,
  { label: string; singular: string; description: string; icon: React.ReactNode }
> = {
  aeroportos: {
    label: 'Aeródromos',
    singular: 'aeródromo',
    description: 'Aeroportos, helipontos e plataformas usados em origem e destino.',
    icon: <MapPin className="h-4 w-4" />,
  },
  tipos: {
    label: 'Tipos de voo',
    singular: 'tipo de voo',
    description: 'Classificações operacionais de tipo de voo da empresa.',
    icon: <Tag className="h-4 w-4" />,
  },
  naturezas: {
    label: 'Naturezas do voo',
    singular: 'natureza do voo',
    description: 'Naturezas operacionais utilizadas na programação dos voos.',
    icon: <Layers className="h-4 w-4" />,
  },
  motivos: {
    label: 'Motivos operacionais',
    singular: 'motivo operacional',
    description: 'Motivos de atraso, cancelamento, alternado e indisponibilidade.',
    icon: <Ban className="h-4 w-4" />,
  },
};

function extract<T>(response: unknown): T {
  const envelope = response as ApiEnvelope<T>;
  if (envelope?.success === false) throw new Error(envelope.error || 'Falha na API');
  const outer = envelope?.data;
  if (outer && typeof outer === 'object' && !Array.isArray(outer) && 'data' in outer) {
    return (outer as { data?: T }).data as T;
  }
  return outer as T;
}

function mergeById(active: CatalogItem[], inactive: CatalogItem[]) {
  const map = new Map<number, CatalogItem>();
  [...active, ...inactive].forEach((item) => map.set(item.id, item));
  return [...map.values()].sort((a, b) => {
    const orderA = Number(a.ordem || 0);
    const orderB = Number(b.ordem || 0);
    if (orderA !== orderB) return orderA - orderB;
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  });
}

function isActive(item: CatalogItem) {
  return item.ativo === true || item.ativo === 1 || item.ativo == null;
}

async function loadCatalog(name: CatalogName) {
  const [activeResponse, inactiveResponse] = await Promise.all([
    apiClient.get<unknown>(`/controle-voos/catalogos/${name}?ativo=true`),
    apiClient.get<unknown>(`/controle-voos/catalogos/${name}?ativo=false`),
  ]);
  return mergeById(
    extract<CatalogItem[]>(activeResponse) || [],
    extract<CatalogItem[]>(inactiveResponse) || [],
  );
}

export default function ControleVoosTabelas() {
  const { isAdmin, isGestor } = usePermissions();
  const canManage = isAdmin || isGestor;
  const [activeCatalog, setActiveCatalog] = useState<CatalogName>('aeroportos');
  const [data, setData] = useState<CatalogState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aeroportos, tipos, naturezas, motivos] = await Promise.all([
        loadCatalog('aeroportos'),
        loadCatalog('tipos'),
        loadCatalog('naturezas'),
        loadCatalog('motivos'),
      ]);
      setData({ aeroportos, tipos, naturezas, motivos });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar cadastros operacionais.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const counts = useMemo(
    () =>
      (Object.keys(CATALOG_META) as CatalogName[]).reduce(
        (acc, key) => ({
          ...acc,
          [key]: data[key].filter(isActive).length,
        }),
        {} as Record<CatalogName, number>,
      ),
    [data],
  );

  async function toggleActive(item: CatalogItem) {
    if (!canManage) return;
    setError(null);
    try {
      await apiClient.patch(`/controle-voos/catalogos/${activeCatalog}/${item.id}`, {
        ativo: isActive(item) ? 0 : 1,
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar o status.');
    }
  }

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Cadastros Operacionais"
            description="Cadastros usados exclusivamente na programação e execução dos voos. Aeronaves e modelos continuam como cadastros mestres em Configurações."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/configuracoes"
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Plane className="h-4 w-4" />
                Gerenciar frota
              </Link>
              <button
                type="button"
                onClick={() => void reload()}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
            </div>
          </ControleVoosPageHeader>

          <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200">
            <strong>Fonte única de dados:</strong> aeronaves, prefixos e modelos não são duplicados aqui. O Controle de Voos referencia a frota cadastrada em Configurações.
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(CATALOG_META) as CatalogName[]).map((key) => {
              const meta = CATALOG_META[key];
              const selected = activeCatalog === key;
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setActiveCatalog(key)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    selected
                      ? 'border-cyan-500 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                      {meta.icon}
                      {meta.label}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {counts[key] || 0}
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{meta.description}</p>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
              {error}
            </div>
          )}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-700">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">{CATALOG_META[activeCatalog].label}</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Itens inativos permanecem no histórico, mas não aparecem em novos voos.
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setEditor({ catalog: activeCatalog, item: null })}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-800"
                >
                  <Plus className="h-4 w-4" />
                  Novo {CATALOG_META[activeCatalog].singular}
                </button>
              )}
            </div>

            {loading ? (
              <div className="p-10 text-center">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-400" />
                <p className="mt-2 text-sm text-slate-500">Carregando cadastros…</p>
              </div>
            ) : data[activeCatalog].length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                Nenhum cadastro encontrado nesta empresa.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Código</th>
                      {activeCatalog === 'aeroportos' && (
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">ICAO / IATA</th>
                      )}
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nome</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tipo / Localidade</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                      {canManage && <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data[activeCatalog].map((item) => (
                      <tr key={item.id} className={!isActive(item) ? 'opacity-60' : ''}>
                        <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{item.codigo || '—'}</td>
                        {activeCatalog === 'aeroportos' && (
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                            {[item.codigo_icao, item.codigo_iata].filter(Boolean).join(' / ') || '—'}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-white">{item.nome || '—'}</div>
                          {item.descricao && <div className="mt-0.5 text-xs text-slate-500">{item.descricao}</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {activeCatalog === 'aeroportos'
                            ? [item.tipo, item.cidade, item.uf].filter(Boolean).join(' · ') || '—'
                            : item.tipo || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${isActive(item) ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {isActive(item) ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditor({ catalog: activeCatalog, item })}
                                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                              >
                                <Edit3 className="h-3.5 w-3.5" /> Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleActive(item)}
                                className="min-h-[36px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                              >
                                {isActive(item) ? 'Inativar' : 'Reativar'}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {editor && (
            <CatalogEditor
              state={editor}
              onClose={() => setEditor(null)}
              onSaved={async () => {
                setEditor(null);
                await reload();
              }}
            />
          )}
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}

function CatalogEditor({
  state,
  onClose,
  onSaved,
}: {
  state: EditorState;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const item = state.item;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    codigo: item?.codigo || '',
    codigo_icao: item?.codigo_icao || '',
    codigo_iata: item?.codigo_iata || '',
    nome: item?.nome || '',
    cidade: item?.cidade || '',
    uf: item?.uf || '',
    tipo:
      item?.tipo ||
      (state.catalog === 'aeroportos' ? 'aeroporto' : state.catalog === 'motivos' ? 'geral' : ''),
    descricao: item?.descricao || '',
    ordem: String(item?.ordem ?? 0),
  });

  const set = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        codigo: form.codigo.trim().toUpperCase(),
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        ordem: Number(form.ordem || 0),
      };
      if (state.catalog === 'aeroportos') {
        payload.codigo_icao = form.codigo_icao.trim().toUpperCase() || null;
        payload.codigo_iata = form.codigo_iata.trim().toUpperCase() || null;
        payload.cidade = form.cidade.trim() || null;
        payload.uf = form.uf.trim().toUpperCase() || null;
        payload.tipo = form.tipo;
      }
      if (state.catalog === 'motivos') payload.tipo = form.tipo;

      if (item) {
        await apiClient.patch(`/controle-voos/catalogos/${state.catalog}/${item.id}`, payload);
      } else {
        await apiClient.post(`/controle-voos/catalogos/${state.catalog}`, payload);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o cadastro.');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {item ? 'Editar' : 'Novo'} {CATALOG_META[state.catalog].singular}
            </h3>
            <p className="mt-1 text-sm text-slate-500">Cadastro válido somente para a empresa ativa.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm">Código<input className={fieldClass} value={form.codigo} onChange={(e) => set('codigo', e.target.value)} required /></label>
          <label className="text-sm">Nome<input className={fieldClass} value={form.nome} onChange={(e) => set('nome', e.target.value)} required /></label>

          {state.catalog === 'aeroportos' && (
            <>
              <label className="text-sm">ICAO<input className={fieldClass} maxLength={8} value={form.codigo_icao} onChange={(e) => set('codigo_icao', e.target.value)} /></label>
              <label className="text-sm">IATA<input className={fieldClass} maxLength={8} value={form.codigo_iata} onChange={(e) => set('codigo_iata', e.target.value)} /></label>
              <label className="text-sm">Tipo<select className={fieldClass} value={form.tipo} onChange={(e) => set('tipo', e.target.value)}><option value="aeroporto">Aeroporto</option><option value="heliponto">Heliponto</option><option value="plataforma">Plataforma</option></select></label>
              <label className="text-sm">Cidade<input className={fieldClass} value={form.cidade} onChange={(e) => set('cidade', e.target.value)} /></label>
              <label className="text-sm">UF<input className={fieldClass} maxLength={3} value={form.uf} onChange={(e) => set('uf', e.target.value)} /></label>
            </>
          )}

          {state.catalog === 'motivos' && (
            <label className="text-sm">Tipo<select className={fieldClass} value={form.tipo} onChange={(e) => set('tipo', e.target.value)}><option value="geral">Geral</option><option value="atraso">Atraso</option><option value="cancelamento">Cancelamento</option><option value="alternado_divergido">Alternado / divergido</option><option value="indisponibilidade">Indisponibilidade</option></select></label>
          )}

          <label className="text-sm">Ordem<input type="number" min={0} className={fieldClass} value={form.ordem} onChange={(e) => set('ordem', e.target.value)} /></label>
          <label className="text-sm sm:col-span-2">Descrição<textarea rows={3} className={fieldClass} value={form.descricao} onChange={(e) => set('descricao', e.target.value)} /></label>

          {error && <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">{error}</div>}

          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
