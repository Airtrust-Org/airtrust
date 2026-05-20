import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import PageHeader from '../../components/PageHeader';
import { useSgsoApi } from './useSgsoApi';

type ScenarioListItem = {
  id: string;
  perigo_titulo: string;
  evento_central: string;
  total_ameacas: number;
  total_consequencias: number;
  total_barreiras: number;
  barreiras_inoperantes: number;
  barreiras_degradadas: number;
};

type ScenarioDetail = {
  id: string;
  perigo_titulo: string;
  perigo_descricao: string | null;
  evento_central: string;
  descricao: string | null;
  nos: Array<{
    id: number;
    tipo_no: 'AMEACA' | 'CONSEQUENCIA';
    codigo: string | null;
    titulo: string;
    descricao: string | null;
  }>;
  barreiras: Array<{
    id: string;
    nome: string;
    codigo: string;
    descricao: string | null;
    tipo_barreira: 'PREVENTIVA' | 'RECUPERACAO';
    status_saude: 'OPERANTE' | 'DEGRADADA' | 'INOPERANTE' | 'EM_REVISAO';
    efetividade_percentual: number | null;
  }>;
  vinculos: Array<{
    barreira_id: string;
    no_id: number;
    tipo_no: string;
    titulo: string;
    codigo: string | null;
  }>;
  historico_barreiras: Array<{
    id: number;
    barreira_id: string;
    status_novo: string;
    motivo_tipo: string | null;
    observacao: string | null;
    alterado_em: string;
  }>;
};

type ScenarioFormState = {
  perigo_titulo: string;
  perigo_descricao: string;
  evento_central: string;
  descricao: string;
  ameacas: Array<{ key: string; titulo: string }>;
  consequencias: Array<{ key: string; titulo: string }>;
  barreiras: Array<{
    nome: string;
    tipo_barreira: 'PREVENTIVA' | 'RECUPERACAO';
    status_saude: 'OPERANTE' | 'DEGRADADA' | 'INOPERANTE' | 'EM_REVISAO';
    links: string;
  }>;
};

function toneByBarrier(status: string): string {
  if (status === 'INOPERANTE') return 'bg-red-100 text-red-700 border-red-200';
  if (status === 'DEGRADADA') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (status === 'OPERANTE') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function barrierRank(status: string): number {
  if (status === 'INOPERANTE') return 0;
  if (status === 'DEGRADADA') return 1;
  if (status === 'EM_REVISAO') return 2;
  return 3;
}

export default function SgsoBowtiePage() {
  const navigate = useNavigate();
  const apiCall = useSgsoApi();
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScenarioDetail | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ScenarioFormState>({
    perigo_titulo: '',
    perigo_descricao: '',
    evento_central: '',
    descricao: '',
    ameacas: [{ key: 'T1', titulo: '' }],
    consequencias: [{ key: 'C1', titulo: '' }],
    barreiras: [{ nome: '', tipo_barreira: 'PREVENTIVA', status_saude: 'OPERANTE', links: '' }],
  });

  const fetchScenarios = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiCall('/sgso/bowtie/cenarios');
      if (response.success) {
        const data = (response.data ?? []) as ScenarioListItem[];
        setScenarios(data);
        if (!selectedScenarioId && data[0]?.id) {
          setSelectedScenarioId(data[0].id);
        }
      } else {
        setError(response.error ?? 'Erro ao carregar cenários Bowtie');
      }
    } catch {
      setError('Erro ao carregar cenários Bowtie');
    } finally {
      setLoading(false);
    }
  }, [apiCall, selectedScenarioId]);

  const fetchDetail = useCallback(async () => {
    if (!selectedScenarioId) {
      setDetail(null);
      return;
    }

    try {
      const response = await apiCall(`/sgso/bowtie/cenarios/${selectedScenarioId}`);
      if (response.success) {
        setDetail(response.data as ScenarioDetail);
      } else {
        setError(response.error ?? 'Erro ao carregar detalhe do Bowtie');
      }
    } catch {
      setError('Erro ao carregar detalhe do Bowtie');
    }
  }, [apiCall, selectedScenarioId]);

  useEffect(() => {
    void fetchScenarios();
  }, [fetchScenarios]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const threatNodes = useMemo(
    () => detail?.nos.filter((node) => node.tipo_no === 'AMEACA') ?? [],
    [detail],
  );
  const consequenceNodes = useMemo(
    () => detail?.nos.filter((node) => node.tipo_no === 'CONSEQUENCIA') ?? [],
    [detail],
  );

  const healthSummary = useMemo(() => {
    const total = detail?.barreiras.length ?? 0;
    const operantes =
      detail?.barreiras.filter((barreira) => barreira.status_saude === 'OPERANTE').length ?? 0;
    const degradadas =
      detail?.barreiras.filter((barreira) => barreira.status_saude === 'DEGRADADA').length ?? 0;
    const inoperantes =
      detail?.barreiras.filter((barreira) => barreira.status_saude === 'INOPERANTE').length ?? 0;
    const emRevisao =
      detail?.barreiras.filter((barreira) => barreira.status_saude === 'EM_REVISAO').length ?? 0;
    return { total, operantes, degradadas, inoperantes, emRevisao };
  }, [detail]);

  const orderedBarreiras = useMemo(() => {
    const items = [...(detail?.barreiras ?? [])];
    items.sort((a, b) => {
      const rankDelta = barrierRank(a.status_saude) - barrierRank(b.status_saude);
      if (rankDelta !== 0) return rankDelta;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
    return items;
  }, [detail]);

  const createScenario = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        perigo_titulo: form.perigo_titulo,
        perigo_descricao: form.perigo_descricao || undefined,
        evento_central: form.evento_central,
        descricao: form.descricao || undefined,
        ameacas: form.ameacas
          .filter((item) => item.titulo.trim())
          .map((item) => ({ codigo: item.key, titulo: item.titulo })),
        consequencias: form.consequencias
          .filter((item) => item.titulo.trim())
          .map((item) => ({ codigo: item.key, titulo: item.titulo })),
        barreiras: form.barreiras
          .filter((item) => item.nome.trim())
          .map((item, index) => ({
            codigo: `BAR-${index + 1}`,
            nome: item.nome,
            tipo_barreira: item.tipo_barreira,
            status_saude: item.status_saude,
            links: item.links
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean),
          })),
      };
      const response = await apiCall('/sgso/bowtie/cenarios', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.success) {
        throw new Error(response.error ?? 'Erro ao criar cenário Bowtie');
      }

      setMessage('Cenário Bowtie criado com sucesso.');
      setForm({
        perigo_titulo: '',
        perigo_descricao: '',
        evento_central: '',
        descricao: '',
        ameacas: [{ key: 'T1', titulo: '' }],
        consequencias: [{ key: 'C1', titulo: '' }],
        barreiras: [{ nome: '', tipo_barreira: 'PREVENTIVA', status_saude: 'OPERANTE', links: '' }],
      });
      await fetchScenarios();
      setSelectedScenarioId(response.data?.id ?? null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Erro ao criar cenário Bowtie');
    } finally {
      setSaving(false);
    }
  };

  const updateBarrierStatus = async (barreiraId: string, statusSaude: string) => {
    try {
      const response = await apiCall(`/sgso/bowtie/barreiras/${barreiraId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status_saude: statusSaude,
          motivo_tipo: 'MANUAL',
          observacao: 'Atualização manual via visualizador Bowtie',
        }),
      });
      if (!response.success) {
        throw new Error(response.error ?? 'Erro ao atualizar barreira');
      }
      setMessage('Status da barreira atualizado.');
      await fetchDetail();
      await fetchScenarios();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Erro ao atualizar barreira');
    }
  };

  const linkedNodes = (barreiraId: string) =>
    detail?.vinculos.filter((item) => item.barreira_id === barreiraId) ?? [];

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="Bowtie"
          subtitle="Painel tático de ameaças, evento central e saúde de barreiras"
          actions={
            <button
              type="button"
              onClick={() => navigate('/sgso')}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            >
              Voltar ao SGSO
            </button>
          }
        />

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,_#fee2e2,_#fff_45%,_#f8fafc_80%)] p-5 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Bowtie control room
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                Visualize a contenção do risco em toda a cadeia ameaça-evento-consequência.
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Barreiras degradadas e inoperantes ficam em primeiro plano para orientar ação
                imediata e rastreabilidade de decisão.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                  Defesa em camadas
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                  Prioridade por criticidade
                </span>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">
                  Histórico auditável
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/85 p-4 backdrop-blur">
              <div className="text-xs uppercase tracking-wide text-slate-500">Pulso do cenário</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {healthSummary.inoperantes > 0
                  ? 'Ação imediata requerida'
                  : healthSummary.degradadas > 0
                    ? 'Monitoramento reforçado'
                    : 'Condição estável'}
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full ${healthSummary.inoperantes > 0 ? 'bg-red-500' : healthSummary.degradadas > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        15,
                        ((healthSummary.inoperantes * 2 + healthSummary.degradadas + healthSummary.emRevisao * 0.5) /
                          Math.max(healthSummary.total, 1)) *
                          100,
                      ),
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {healthSummary.total} barreiras mapeadas neste cenário selecionado.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Cenários</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{scenarios.length}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-emerald-700">Operantes</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-900">
                {healthSummary.operantes}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-amber-700">Degradadas</div>
              <div className="mt-2 text-2xl font-semibold text-amber-900">
                {healthSummary.degradadas}
              </div>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-red-700">Inoperantes</div>
              <div className="mt-2 text-2xl font-semibold text-red-900">
                {healthSummary.inoperantes}
              </div>
            </div>
          </div>
        </section>

        {message ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Cenários</h2>
                <span className="text-sm text-slate-500">{scenarios.length}</span>
              </div>
              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div
                        key={`scenario-skeleton-${idx}`}
                        className="animate-pulse rounded-2xl border border-slate-200 p-4"
                      >
                        <div className="h-3 w-32 rounded bg-slate-200" />
                        <div className="mt-3 h-4 w-48 rounded bg-slate-200" />
                        <div className="mt-3 h-3 w-40 rounded bg-slate-200" />
                      </div>
                    ))}
                  </div>
                ) : scenarios.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                    Nenhum cenário Bowtie cadastrado.
                  </div>
                ) : (
                  scenarios.map((scenario) => (
                    <button
                      key={scenario.id}
                      type="button"
                      onClick={() => setSelectedScenarioId(scenario.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${selectedScenarioId === scenario.id ? 'border-slate-900 bg-slate-900 text-white shadow-md' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}
                    >
                      <div className="mb-2 h-1.5 w-24 rounded-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500" />
                      <div className="text-xs uppercase tracking-wide opacity-70">
                        {scenario.perigo_titulo}
                      </div>
                      <div className="mt-2 font-semibold">{scenario.evento_central}</div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span>{scenario.total_ameacas} ameaças</span>
                        <span>{scenario.total_barreiras} barreiras</span>
                        <span>{scenario.barreiras_inoperantes} inoperantes</span>
                        <span>{scenario.barreiras_degradadas} degradadas</span>
                      </div>
                      <div className="mt-2 text-xs">
                        {(scenario.barreiras_inoperantes ?? 0) > 0 ? (
                          <span className="rounded-full bg-red-100 px-2 py-1 text-red-700">
                            Risco alto
                          </span>
                        ) : (scenario.barreiras_degradadas ?? 0) > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">
                            Atenção
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                            Saudável
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Novo cenário</h2>
                <button
                  type="button"
                  onClick={() => setShowCreateForm((current) => !current)}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  {showCreateForm ? 'Ocultar' : 'Expandir'}
                </button>
              </div>
              {showCreateForm ? (
                <div className="mt-4 space-y-4 text-sm text-slate-700">
                  <input
                    value={form.perigo_titulo}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, perigo_titulo: event.target.value }))
                    }
                    placeholder="Perigo principal"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-amber-400"
                  />
                  <textarea
                    value={form.perigo_descricao}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, perigo_descricao: event.target.value }))
                    }
                    rows={2}
                    placeholder="Descrição do perigo"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-amber-400"
                  />
                  <input
                    value={form.evento_central}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, evento_central: event.target.value }))
                    }
                    placeholder="Evento central"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-amber-400"
                  />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Ameaças</span>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            ameacas: [
                              ...current.ameacas,
                              { key: `T${current.ameacas.length + 1}`, titulo: '' },
                            ],
                          }))
                        }
                        className="text-xs font-medium text-amber-700"
                      >
                        + adicionar
                      </button>
                    </div>
                    {form.ameacas.map((item, index) => (
                      <input
                        key={item.key}
                        value={item.titulo}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            ameacas: current.ameacas.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, titulo: event.target.value }
                                : entry,
                            ),
                          }))
                        }
                        placeholder={`${item.key} · Ex.: briefing incompleto`}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-amber-400"
                      />
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Consequências</span>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            consequencias: [
                              ...current.consequencias,
                              { key: `C${current.consequencias.length + 1}`, titulo: '' },
                            ],
                          }))
                        }
                        className="text-xs font-medium text-amber-700"
                      >
                        + adicionar
                      </button>
                    </div>
                    {form.consequencias.map((item, index) => (
                      <input
                        key={item.key}
                        value={item.titulo}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            consequencias: current.consequencias.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, titulo: event.target.value }
                                : entry,
                            ),
                          }))
                        }
                        placeholder={`${item.key} · Ex.: aproximação instável`}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-amber-400"
                      />
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Barreiras</span>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            barreiras: [
                              ...current.barreiras,
                              {
                                nome: '',
                                tipo_barreira: 'PREVENTIVA',
                                status_saude: 'OPERANTE',
                                links: '',
                              },
                            ],
                          }))
                        }
                        className="text-xs font-medium text-amber-700"
                      >
                        + adicionar
                      </button>
                    </div>
                    {form.barreiras.map((barreira, index) => (
                      <div
                        key={`barreira-${index}`}
                        className="rounded-2xl border border-slate-200 p-3"
                      >
                        <input
                          value={barreira.nome}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              barreiras: current.barreiras.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, nome: event.target.value }
                                  : entry,
                              ),
                            }))
                          }
                          placeholder="Nome da barreira"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-amber-400"
                        />
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <select
                            value={barreira.tipo_barreira}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                barreiras: current.barreiras.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? {
                                        ...entry,
                                        tipo_barreira: event.target.value as
                                          | 'PREVENTIVA'
                                          | 'RECUPERACAO',
                                      }
                                    : entry,
                                ),
                              }))
                            }
                            className="rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-amber-400"
                          >
                            <option value="PREVENTIVA">Preventiva</option>
                            <option value="RECUPERACAO">Recuperação</option>
                          </select>
                          <input
                            value={barreira.links}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                barreiras: current.barreiras.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, links: event.target.value }
                                    : entry,
                                ),
                              }))
                            }
                            placeholder="Links: T1, C1"
                            className="rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-amber-400"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={createScenario}
                    disabled={saving}
                    className="w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {saving ? 'Salvando...' : 'Criar cenário Bowtie'}
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Formulário recolhido para focar na análise operacional do cenário selecionado.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {!detail ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                Selecione um cenário Bowtie para visualizar ameaças, evento central, consequências e
                barreiras.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
                    {detail.perigo_titulo}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                    {detail.evento_central}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {detail.descricao || detail.perigo_descricao || 'Sem descrição adicional.'}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Barreiras</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {healthSummary.total}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-emerald-700">Operantes</p>
                    <p className="mt-1 text-xl font-semibold text-emerald-900">
                      {healthSummary.operantes}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-amber-700">Degradadas</p>
                    <p className="mt-1 text-xl font-semibold text-amber-900">
                      {healthSummary.degradadas}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-red-700">Inoperantes</p>
                    <p className="mt-1 text-xl font-semibold text-red-900">
                      {healthSummary.inoperantes}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Em revisão</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {healthSummary.emRevisao}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                    Operante
                  </span>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                    Degradada
                  </span>
                  <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">Inoperante</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                    Em revisão
                  </span>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1fr_300px_1fr]">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Ameaças
                    </h3>
                    {threatNodes.map((node) => (
                      <div
                        key={node.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="text-sm font-semibold text-slate-900">
                          {node.codigo || 'AMEAÇA'}
                        </div>
                        <div className="mt-1 text-sm text-slate-700">{node.titulo}</div>
                      </div>
                    ))}
                  </div>

                  <div className="relative rounded-[32px] border border-slate-300 bg-slate-900 px-6 py-10 text-center text-white shadow-inner">
                    <div className="pointer-events-none absolute -left-6 top-1/2 hidden h-px w-6 bg-slate-300 xl:block" />
                    <div className="pointer-events-none absolute -right-6 top-1/2 hidden h-px w-6 bg-slate-300 xl:block" />
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-300">
                      Evento central
                    </div>
                    <div className="mt-4 text-2xl font-semibold leading-tight">
                      {detail.evento_central}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Consequências
                    </h3>
                    {consequenceNodes.map((node) => (
                      <div
                        key={node.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="text-sm font-semibold text-slate-900">
                          {node.codigo || 'CONSEQUÊNCIA'}
                        </div>
                        <div className="mt-1 text-sm text-slate-700">{node.titulo}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Barreiras de segurança
                  </h3>
                  {(healthSummary.inoperantes > 0 || healthSummary.degradadas > 0) && (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Barreiras críticas priorizadas no topo da lista (inoperantes e degradadas).
                    </div>
                  )}
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {orderedBarreiras.map((barreira) => (
                      <div
                        key={barreira.id}
                        className={`rounded-2xl border p-4 ${
                          barreira.status_saude === 'INOPERANTE'
                            ? 'border-red-300 bg-red-50'
                            : barreira.status_saude === 'DEGRADADA'
                              ? 'border-amber-300 bg-amber-50'
                              : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {barreira.nome}
                            </div>
                            <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                              {barreira.tipo_barreira}
                            </div>
                          </div>
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${toneByBarrier(barreira.status_saude)}`}
                          >
                            {barreira.status_saude}
                          </span>
                        </div>
                        <div className="mt-3 text-sm text-slate-600">
                          {barreira.descricao || 'Sem descrição adicional.'}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                          {linkedNodes(barreira.id).map((node) => (
                            <span
                              key={`${barreira.id}-${node.no_id}`}
                              className="rounded-full bg-slate-100 px-3 py-1"
                            >
                              {node.codigo || node.titulo}
                            </span>
                          ))}
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-500">
                            Efetividade {barreira.efetividade_percentual ?? '—'}%
                          </div>
                          <select
                            value={barreira.status_saude}
                            onChange={(event) =>
                              void updateBarrierStatus(barreira.id, event.target.value)
                            }
                            className="rounded-full border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                          >
                            <option value="OPERANTE">Operante</option>
                            <option value="DEGRADADA">Degradada</option>
                            <option value="INOPERANTE">Inoperante</option>
                            <option value="EM_REVISAO">Em revisão</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Histórico de barreiras
                  </h3>
                  <div className="mt-4 space-y-3">
                    {detail.historico_barreiras.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                        Sem mudanças de status registradas.
                      </div>
                    ) : (
                      detail.historico_barreiras.map((item) => (
                        <div
                          key={item.id}
                          className="relative rounded-2xl border border-slate-200 px-4 py-3 pl-6 text-sm text-slate-700"
                        >
                          <span className="absolute left-2.5 top-4 h-2.5 w-2.5 rounded-full bg-slate-400" />
                          <span className="font-medium text-slate-900">{item.status_novo}</span>
                          <span className="mx-2 text-slate-400">·</span>
                          <span>{item.motivo_tipo || 'MANUAL'}</span>
                          <span className="mx-2 text-slate-400">·</span>
                          <span>{new Date(item.alterado_em).toLocaleString('pt-BR')}</span>
                          {item.observacao ? (
                            <div className="mt-1 text-slate-500">{item.observacao}</div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
