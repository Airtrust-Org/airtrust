import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpenCheck, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { appFetch } from '@/react-app/lib/app-fetch';
import { Button } from '@/react-app/components/UI/Button';

interface CurriculoResumo {
  id: number;
  codigo: string | null;
  nome: string;
  total_sessoes: number;
  total_minutos: number;
  sessoes_ordenadas: number;
}

interface ModeloCurriculo {
  id: number;
  codigo: string;
  nome: string;
  modelo_aeronave: string | null;
  duracao_estimada: number | null;
  ordem_no_treinamento: number | null;
  gera_qualificacao: number | null;
  qualificacao_tipo_id: number | null;
  qualificacao_tipo_codigo?: string | null;
  qualificacao_tipo_nome?: string | null;
}

interface CurriculoDetalhe {
  qualification: { id: number; codigo: string | null; nome: string };
  sessions: ModeloCurriculo[];
  available_models: ModeloCurriculo[];
  total_sessions: number;
  total_minutes: number;
}

interface CurriculosVooPageProps {
  embedded?: boolean;
  onBack?: () => void;
}

function formatDuration(minutes: number | null | undefined) {
  const total = Math.max(0, Number(minutes || 0));
  if (!total) return 'Duração não definida';
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}min`;
}

export default function CurriculosVooPage({ embedded = false, onBack }: CurriculosVooPageProps) {
  const [curriculos, setCurriculos] = useState<CurriculoResumo[]>([]);
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<CurriculoDetalhe | null>(null);
  const [draftIds, setDraftIds] = useState<number[]>([]);
  const [modeloParaAdicionar, setModeloParaAdicionar] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregarCurriculos = async (preservarSelecao = true) => {
    setLoading(true);
    try {
      const response = await appFetch(`/api/simuladores/curriculos-voo?_=${Date.now()}`, {
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Falha ao carregar currículos');
      const rows = Array.isArray(payload.data) ? payload.data : [];
      setCurriculos(rows);
      if (!preservarSelecao && rows.length > 0) setSelecionadoId(Number(rows[0].id));
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar os currículos de voo');
    } finally {
      setLoading(false);
    }
  };

  const carregarDetalhe = async (qualificacaoId: number) => {
    setLoadingDetail(true);
    try {
      const response = await appFetch(
        `/api/simuladores/curriculos-voo/${qualificacaoId}?_=${Date.now()}`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Falha ao carregar currículo');
      setDetalhe(payload.data);
      setDraftIds((payload.data.sessions || []).map((row: ModeloCurriculo) => Number(row.id)));
      setModeloParaAdicionar('');
    } catch (error) {
      console.error(error);
      setDetalhe(null);
      setDraftIds([]);
      toast.error('Não foi possível carregar o currículo selecionado');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void carregarCurriculos(false);
  }, []);

  useEffect(() => {
    if (selecionadoId) void carregarDetalhe(selecionadoId);
  }, [selecionadoId]);

  const modelById = useMemo(
    () => new Map((detalhe?.available_models || []).map((row) => [Number(row.id), row])),
    [detalhe],
  );

  const draftModels = useMemo(
    () => draftIds.map((id) => modelById.get(id)).filter(Boolean) as ModeloCurriculo[],
    [draftIds, modelById],
  );

  const availableToAdd = useMemo(() => {
    if (!detalhe) return [];
    const selected = new Set(draftIds);
    return detalhe.available_models.filter((row) => {
      if (selected.has(Number(row.id))) return false;
      return !row.qualificacao_tipo_id || Number(row.qualificacao_tipo_id) === detalhe.qualification.id;
    });
  }, [detalhe, draftIds]);

  const totalDraftMinutes = draftModels.reduce(
    (sum, row) => sum + Math.max(0, Number(row.duracao_estimada || 0)),
    0,
  );

  const originalIds = detalhe?.sessions.map((row) => Number(row.id)) || [];
  const dirty = JSON.stringify(originalIds) !== JSON.stringify(draftIds);

  const mover = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draftIds.length) return;
    const next = [...draftIds];
    [next[index], next[target]] = [next[target], next[index]];
    setDraftIds(next);
  };

  const remover = (row: ModeloCurriculo) => {
    if (Number(row.gera_qualificacao || 0) === 1) {
      toast.warning('Esta sessão gera a qualificação. Desative essa geração no Modelo de Sessão antes de removê-la do currículo.');
      return;
    }
    setDraftIds((current) => current.filter((id) => id !== Number(row.id)));
  };

  const adicionar = () => {
    const id = Number(modeloParaAdicionar);
    if (!Number.isInteger(id) || id <= 0) return;
    if (draftIds.includes(id)) return;
    setDraftIds((current) => [...current, id]);
    setModeloParaAdicionar('');
  };

  const salvar = async () => {
    if (!detalhe) return;
    setSaving(true);
    try {
      const response = await appFetch(
        `/api/simuladores/curriculos-voo/${detalhe.qualification.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelo_ids: draftIds }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Falha ao salvar currículo');
      setDetalhe(payload.data);
      setDraftIds((payload.data.sessions || []).map((row: ModeloCurriculo) => Number(row.id)));
      await carregarCurriculos(true);
      toast.success('Currículo de voo atualizado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o currículo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          {embedded && onBack && (
            <button
              onClick={onBack}
              className="mb-1 inline-flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-700"
            >
              <ArrowLeft className="h-3 w-3" />
              Gestão
            </button>
          )}
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Currículos de Voo</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Defina quais modelos de sessão compõem cada treinamento e a ordem S1…SN usada no planejamento.
          </p>
        </div>
        {detalhe && (
          <Button onClick={salvar} disabled={!dirty || saving || loadingDetail}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar currículo'}
          </Button>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-2">
            <BookOpenCheck className="h-4 w-4 text-indigo-600" />
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Treinamentos de voo</p>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-14 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : curriculos.length === 0 ? (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-gray-500 dark:bg-slate-800 dark:text-slate-400">
              Nenhum treinamento ativo da categoria VOO foi encontrado.
            </p>
          ) : (
            <div className="space-y-1.5">
              {curriculos.map((row) => {
                const active = Number(row.id) === selecionadoId;
                const incompleteOrder = Number(row.total_sessoes) > Number(row.sessoes_ordenadas);
                return (
                  <button
                    key={row.id}
                    onClick={() => setSelecionadoId(Number(row.id))}
                    className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/40'
                        : 'border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">
                          {row.codigo ? `${row.codigo} — ` : ''}{row.nome}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                          {Number(row.total_sessoes)} sessões • {formatDuration(Number(row.total_minutos))}
                        </p>
                      </div>
                      {incompleteOrder && (
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          ordenar
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          {!selecionadoId ? (
            <div className="py-12 text-center text-sm text-gray-500">Selecione um treinamento para configurar o currículo.</div>
          ) : loadingDetail ? (
            <div className="space-y-3">
              <div className="h-6 w-64 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : !detalhe ? (
            <div className="py-12 text-center text-sm text-red-600">Não foi possível carregar este currículo.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4 dark:border-slate-800">
                <div>
                  <p className="text-base font-semibold text-gray-900 dark:text-slate-100">
                    {detalhe.qualification.codigo ? `${detalhe.qualification.codigo} — ` : ''}{detalhe.qualification.nome}
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                    {draftIds.length} sessões • {formatDuration(totalDraftMinutes)} de carga total
                  </p>
                </div>
                {dirty && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                    Alterações não salvas
                  </span>
                )}
              </div>

              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={modeloParaAdicionar}
                    onChange={(event) => setModeloParaAdicionar(event.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">Adicionar modelo de sessão...</option>
                    {availableToAdd.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.codigo} — {row.nome} • {row.modelo_aeronave || 'Universal'} • {formatDuration(row.duracao_estimada)}
                      </option>
                    ))}
                  </select>
                  <Button variant="secondary" onClick={adicionar} disabled={!modeloParaAdicionar}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                  Modelos já vinculados a outro treinamento não aparecem como opção de inclusão.
                </p>
              </div>

              {draftModels.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-slate-700">
                  Este treinamento ainda não possui sessões configuradas.
                </div>
              ) : (
                <div className="space-y-2">
                  {draftModels.map((row, index) => (
                    <div
                      key={row.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 dark:border-slate-700"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                        S{index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">
                          {row.codigo} — {row.nome}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                          {row.modelo_aeronave || 'Universal'} • {formatDuration(row.duracao_estimada)}
                          {Number(row.gera_qualificacao || 0) === 1 ? ' • gera/renova a qualificação' : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Mover ${row.codigo} para cima`}
                          disabled={index === 0}
                          onClick={() => mover(index, -1)}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-slate-800"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Mover ${row.codigo} para baixo`}
                          disabled={index === draftModels.length - 1}
                          onClick={() => mover(index, 1)}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-slate-800"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remover ${row.codigo} do currículo`}
                          onClick={() => remover(row)}
                          className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
