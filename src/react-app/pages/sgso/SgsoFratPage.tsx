import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import PageHeader from '../../components/PageHeader';
import { useSgsoApi } from './useSgsoApi';

type Employee = { id: number; nome: string };

type FratFactor = {
  id: number;
  codigo: string;
  categoria: string;
  pergunta: string;
  tipo_resposta: 'BINARIA' | 'ESCALA' | 'NUMERICA' | 'LISTA';
  regra_score_json: string | null;
  opcoes_json: string | null;
};

type FratModel = {
  id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  categoria_operacao: string | null;
  fatores: FratFactor[];
};

type FratEvaluationListItem = {
  id: string;
  modelo_nome: string;
  tripulante_nome: string | null;
  data_operacao: string;
  score_total: number;
  nivel_risco: 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';
  status: string;
  exige_aprovacao: number;
  despacho_bloqueado: number;
  aprovador_nome: string | null;
};

type FratEvaluationDetail = FratEvaluationListItem & {
  respostas: Array<{
    id: number;
    codigo: string;
    pergunta: string;
    categoria: string;
    resposta_texto: string | null;
    resposta_numero: number | null;
    score_aplicado: number;
  }>;
  aprovacoes: Array<{
    id: number;
    decisao: string;
    motivo: string | null;
    aprovador_nome: string | null;
    created_at: string;
  }>;
};

type FadigaFratPrefill = {
  checkin_id: string;
  funcionario_id: number;
  data_checkin: string;
  suggestion: {
    nivelRiscoSugerido: 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';
    justificativa: string;
    fatores: Array<{
      codigo: string;
      categoria: string;
      resposta: string;
      score_sugerido: number;
      justificativa: string;
    }>;
  };
};

function riskTone(level: string): string {
  if (level === 'CRITICO') return 'bg-red-100 text-red-700';
  if (level === 'ALTO') return 'bg-amber-100 text-amber-700';
  if (level === 'MEDIO') return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
}

function parseOptions(factor: FratFactor): string[] {
  try {
    if (factor.opcoes_json) {
      const parsed = JSON.parse(factor.opcoes_json) as string[];
      if (Array.isArray(parsed)) return parsed;
    }
    if (factor.regra_score_json) {
      const parsed = JSON.parse(factor.regra_score_json) as Record<string, number>;
      return Object.keys(parsed);
    }
  } catch {
    return [];
  }
  return [];
}

export default function SgsoFratPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const apiCall = useSgsoApi();
  const [models, setModels] = useState<FratModel[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [evaluations, setEvaluations] = useState<FratEvaluationListItem[]>([]);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(null);
  const [evaluationDetail, setEvaluationDetail] = useState<FratEvaluationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fadigaPrefill, setFadigaPrefill] = useState<FadigaFratPrefill | null>(null);
  const [form, setForm] = useState({
    modelo_id: '',
    tripulante_id: '',
    data_operacao: new Date().toISOString().slice(0, 10),
    justificativa: '',
    respostas: {} as Record<number, string>,
  });

  const selectedModel = useMemo(
    () => models.find((model) => String(model.id) === form.modelo_id) ?? null,
    [form.modelo_id, models],
  );

  const loadBaseData = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsResponse, employeesResponse, evaluationsResponse] = await Promise.all([
        apiCall('/sgso/frat/modelos'),
        apiCall('/funcionarios?limit=200'),
        apiCall('/sgso/frat/avaliacoes'),
      ]);

      if (modelsResponse.success) setModels(modelsResponse.data ?? []);
      if (employeesResponse.success) setEmployees(employeesResponse.data ?? []);
      if (evaluationsResponse.success) {
        const items = (evaluationsResponse.data ?? []) as FratEvaluationListItem[];
        setEvaluations(items);
        if (!selectedEvaluationId && items[0]?.id) {
          setSelectedEvaluationId(items[0].id);
        }
      }
    } catch {
      setError('Erro ao carregar workflow FRAT');
    } finally {
      setLoading(false);
    }
  }, [apiCall, selectedEvaluationId]);

  const loadEvaluationDetail = useCallback(async () => {
    if (!selectedEvaluationId) {
      setEvaluationDetail(null);
      return;
    }
    try {
      const response = await apiCall(`/sgso/frat/avaliacoes/${selectedEvaluationId}`);
      if (response.success) {
        setEvaluationDetail(response.data as FratEvaluationDetail);
      }
    } catch {
      setError('Erro ao carregar detalhe da avaliação FRAT');
    }
  }, [apiCall, selectedEvaluationId]);

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  useEffect(() => {
    void loadEvaluationDetail();
  }, [loadEvaluationDetail]);

  useEffect(() => {
    const shouldPrefill = searchParams.get('prefill') === 'fadiga';
    if (!shouldPrefill) return;

    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const funcionarioId = searchParams.get('funcionario_id');
    const query = new URLSearchParams({ date });
    if (funcionarioId) query.set('funcionario_id', funcionarioId);

    const run = async () => {
      try {
        const response = await apiCall(`/frms/fadiga-checkin/frat-prefill?${query.toString()}`);
        if (!response.success || !response.data?.suggestion) return;
        const prefill = response.data as FadigaFratPrefill;
        setFadigaPrefill(prefill);
        setForm((current) => ({
          ...current,
          tripulante_id: String(prefill.funcionario_id),
          data_operacao: prefill.data_checkin,
          justificativa:
            current.justificativa ||
            `Origem FRMS Fadiga Check-in (${prefill.data_checkin}): ${prefill.suggestion.justificativa}`,
        }));
      } catch {
        // Falha de prefill não deve bloquear o uso manual do FRAT.
      }
    };

    void run();
  }, [apiCall, searchParams]);

  const applyFadigaFactors = useCallback(() => {
    if (!selectedModel || !fadigaPrefill?.suggestion?.fatores?.length) return;

    const byCode = new Map(
      fadigaPrefill.suggestion.fatores.map((item) => [item.codigo.toUpperCase(), item]),
    );

    const respostas: Record<number, string> = {};
    for (const factor of selectedModel.fatores) {
      const match = byCode.get(factor.codigo.toUpperCase());
      if (!match) continue;

      if (factor.tipo_resposta === 'BINARIA') {
        respostas[factor.id] = 'true';
        continue;
      }

      if (factor.tipo_resposta === 'NUMERICA') {
        const numeric = Number.parseFloat(
          match.resposta.replace(',', '.').match(/\d+(\.\d+)?/)?.[0] || '0',
        );
        respostas[factor.id] = Number.isFinite(numeric) ? String(numeric) : '0';
        continue;
      }

      const options = parseOptions(factor);
      const suggested = options.find((option) =>
        match.resposta.toLowerCase().includes(option.toLowerCase()),
      );
      if (suggested) respostas[factor.id] = suggested;
    }

    setForm((current) => ({ ...current, respostas }));
    setMessage('Prefill de fadiga aplicado aos fatores compatíveis do modelo selecionado.');
  }, [fadigaPrefill, selectedModel]);

  const submitEvaluation = async () => {
    if (!selectedModel) {
      setError('Selecione um modelo FRAT para continuar.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const respostas = selectedModel.fatores.map((factor) => ({
        fator_id: factor.id,
        resposta:
          factor.tipo_resposta === 'NUMERICA'
            ? Number(form.respostas[factor.id] || 0)
            : factor.tipo_resposta === 'BINARIA'
              ? form.respostas[factor.id] === 'true'
              : form.respostas[factor.id] || '',
      }));

      const response = await apiCall('/sgso/frat/avaliacoes', {
        method: 'POST',
        body: JSON.stringify({
          modelo_id: Number(form.modelo_id),
          tripulante_id: form.tripulante_id ? Number(form.tripulante_id) : undefined,
          data_operacao: form.data_operacao,
          origem_vinculo: fadigaPrefill ? 'FADIGA_CHECKIN' : 'MANUAL',
          frms_fadiga_checkin_id: fadigaPrefill?.checkin_id,
          justificativa: form.justificativa || undefined,
          respostas,
        }),
      });

      if (!response.success) {
        throw new Error(response.error ?? 'Erro ao criar avaliação FRAT');
      }

      setMessage(`Avaliação FRAT criada com risco ${response.data?.nivel_risco}.`);
      setForm((current) => ({ ...current, justificativa: '', respostas: {} }));
      await loadBaseData();
      setSelectedEvaluationId(response.data?.id ?? null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro ao criar avaliação FRAT');
    } finally {
      setSubmitting(false);
    }
  };

  const approveEvaluation = async (decision: 'APROVAR' | 'REJEITAR' | 'SOLICITAR_REVISAO') => {
    if (!selectedEvaluationId) return;
    try {
      const response = await apiCall(`/sgso/frat/avaliacoes/${selectedEvaluationId}/aprovacoes`, {
        method: 'POST',
        body: JSON.stringify({
          decisao: decision,
          motivo: 'Decisão registrada via workflow FRAT',
        }),
      });
      if (!response.success) {
        throw new Error(response.error ?? 'Erro ao registrar decisão FRAT');
      }
      setMessage(`Decisão ${decision} registrada.`);
      await loadBaseData();
      await loadEvaluationDetail();
    } catch (approvalError) {
      setError(
        approvalError instanceof Error ? approvalError.message : 'Erro ao registrar decisão FRAT',
      );
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="FRAT"
          subtitle="Avaliação de risco pré-voo com fluxo de aprovação operacional"
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

        <section className="rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,_#ffe4e6,_#f8fafc_42%,_#fff_75%)] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Linha de decisão FRAT
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-rose-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Passo 1</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">Avaliar fatores</div>
              <p className="mt-1 text-xs text-slate-500">Modelo aplica score objetivo por fator operacional.</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Passo 2</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">Classificar risco</div>
              <p className="mt-1 text-xs text-slate-500">Risco médio, alto ou crítico direciona o gate de despacho.</p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Passo 3</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">Aprovar ou bloquear</div>
              <p className="mt-1 text-xs text-slate-500">Gestor registra decisão com trilha completa de auditoria.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Avaliações</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{evaluations.length}</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-amber-700">
                Risco alto/crítico
              </div>
              <div className="mt-2 text-2xl font-semibold text-amber-900">
                {
                  evaluations.filter(
                    (item) => item.nivel_risco === 'ALTO' || item.nivel_risco === 'CRITICO',
                  ).length
                }
              </div>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-red-700">Despacho bloqueado</div>
              <div className="mt-2 text-2xl font-semibold text-red-900">
                {evaluations.filter((item) => item.despacho_bloqueado === 1).length}
              </div>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-blue-700">Exigem aprovação</div>
              <div className="mt-2 text-2xl font-semibold text-blue-900">
                {evaluations.filter((item) => item.exige_aprovacao === 1).length}
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

        {fadigaPrefill ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            FRAT em modo prefill de fadiga para{' '}
            {new Date(fadigaPrefill.data_checkin).toLocaleDateString('pt-BR')}. Revise e ajuste
            fatores antes de enviar.
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Nova avaliação</h2>
              <div className="mt-4 space-y-4 text-sm text-slate-700">
                <select
                  value={form.modelo_id}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      modelo_id: event.target.value,
                      respostas: {},
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-rose-400"
                >
                  <option value="">Selecione um modelo FRAT</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.nome}
                    </option>
                  ))}
                </select>

                <select
                  value={form.tripulante_id}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, tripulante_id: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-rose-400"
                >
                  <option value="">Tripulante</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.nome}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  value={form.data_operacao}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, data_operacao: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-rose-400"
                />

                <textarea
                  value={form.justificativa}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, justificativa: event.target.value }))
                  }
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-rose-400"
                  placeholder="Contexto da missão, janela operacional e observações do gestor."
                />
              </div>

              {selectedModel ? (
                <div className="mt-6 space-y-4">
                  {fadigaPrefill ? (
                    <button
                      type="button"
                      onClick={applyFadigaFactors}
                      className="w-full rounded-full border border-amber-300 bg-amber-100 px-5 py-3 text-sm font-medium text-amber-800 transition hover:bg-amber-200"
                    >
                      Aplicar prefill de fadiga
                    </button>
                  ) : null}
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">{selectedModel.nome}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {selectedModel.descricao || 'Sem descrição adicional.'}
                    </div>
                  </div>
                  {selectedModel.fatores.map((factor) => {
                    const options = parseOptions(factor);
                    return (
                      <div key={factor.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          {factor.categoria}
                        </div>
                        <div className="mt-1 text-sm font-medium text-slate-900">
                          {factor.pergunta}
                        </div>
                        <div className="mt-3">
                          {factor.tipo_resposta === 'BINARIA' ? (
                            <select
                              value={form.respostas[factor.id] || ''}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  respostas: {
                                    ...current.respostas,
                                    [factor.id]: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-rose-400"
                            >
                              <option value="">Selecione</option>
                              <option value="false">Não</option>
                              <option value="true">Sim</option>
                            </select>
                          ) : factor.tipo_resposta === 'NUMERICA' ? (
                            <input
                              type="number"
                              value={form.respostas[factor.id] || ''}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  respostas: {
                                    ...current.respostas,
                                    [factor.id]: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-rose-400"
                            />
                          ) : (
                            <select
                              value={form.respostas[factor.id] || ''}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  respostas: {
                                    ...current.respostas,
                                    [factor.id]: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-rose-400"
                            >
                              <option value="">Selecione</option>
                              {options.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={submitEvaluation}
                    disabled={submitting}
                    className="w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {submitting ? 'Calculando score...' : 'Gerar avaliação FRAT'}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Avaliações recentes</h2>
                <span className="text-sm text-slate-500">{evaluations.length}</span>
              </div>
              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="text-sm text-slate-500">Carregando avaliações...</div>
                ) : evaluations.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                    Nenhuma avaliação FRAT registrada.
                  </div>
                ) : (
                  evaluations.map((evaluation) => (
                    <button
                      key={evaluation.id}
                      type="button"
                      onClick={() => setSelectedEvaluationId(evaluation.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${selectedEvaluationId === evaluation.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">
                          {evaluation.tripulante_nome || 'Tripulante não informado'}
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${riskTone(evaluation.nivel_risco)}`}
                        >
                          {evaluation.nivel_risco}
                        </span>
                      </div>
                      <div className="mt-2 text-xs opacity-70">
                        {evaluation.modelo_nome} ·{' '}
                        {new Date(evaluation.data_operacao).toLocaleDateString('pt-BR')}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs opacity-80">
                        <span>Score {evaluation.score_total}</span>
                        <span>Status {evaluation.status}</span>
                        <span>
                          {evaluation.despacho_bloqueado
                            ? 'Despacho bloqueado'
                            : 'Despacho liberado'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {!evaluationDetail ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                Selecione uma avaliação FRAT para ver fatores, score e workflow de aprovação.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-rose-700">
                      {evaluationDetail.modelo_nome}
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                      {evaluationDetail.tripulante_nome || 'Tripulante não informado'}
                    </h2>
                    <div className="mt-2 text-sm text-slate-500">
                      Operação em{' '}
                      {new Date(evaluationDetail.data_operacao).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-4 py-2 text-sm font-medium ${riskTone(evaluationDetail.nivel_risco)}`}
                    >
                      {evaluationDetail.nivel_risco}
                    </span>
                    <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
                      Score {evaluationDetail.score_total}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Status</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      {evaluationDetail.status}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Aprovação exigida
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      {evaluationDetail.exige_aprovacao ? 'Sim' : 'Não'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Despacho</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      {evaluationDetail.despacho_bloqueado ? 'Bloqueado' : 'Liberado'}
                    </div>
                  </div>
                </div>

                {evaluationDetail.exige_aprovacao ? (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void approveEvaluation('APROVAR')}
                      className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-500"
                    >
                      Aprovar despacho
                    </button>
                    <button
                      type="button"
                      onClick={() => void approveEvaluation('REJEITAR')}
                      className="rounded-full bg-red-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-500"
                    >
                      Rejeitar despacho
                    </button>
                    <button
                      type="button"
                      onClick={() => void approveEvaluation('SOLICITAR_REVISAO')}
                      className="rounded-full border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                    >
                      Solicitar revisão
                    </button>
                  </div>
                ) : null}

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Fatores respondidos
                  </h3>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {evaluationDetail.respostas.map((answer) => (
                      <div key={answer.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          {answer.categoria}
                        </div>
                        <div className="mt-1 text-sm font-medium text-slate-900">
                          {answer.pergunta}
                        </div>
                        <div className="mt-3 text-sm text-slate-700">
                          Resposta: {answer.resposta_texto ?? answer.resposta_numero ?? '—'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Score aplicado: {answer.score_aplicado}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Histórico de decisão
                  </h3>
                  <div className="mt-4 space-y-3">
                    {evaluationDetail.aprovacoes.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                        Nenhuma decisão registrada até agora.
                      </div>
                    ) : (
                      evaluationDetail.aprovacoes.map((approval) => (
                        <div
                          key={approval.id}
                          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                        >
                          <span className="font-medium text-slate-900">{approval.decisao}</span>
                          <span className="mx-2 text-slate-400">·</span>
                          <span>{approval.aprovador_nome || 'Aprovador não identificado'}</span>
                          <span className="mx-2 text-slate-400">·</span>
                          <span>{new Date(approval.created_at).toLocaleString('pt-BR')}</span>
                          {approval.motivo ? (
                            <div className="mt-1 text-slate-500">{approval.motivo}</div>
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
