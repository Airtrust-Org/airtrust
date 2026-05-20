import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import PageHeader from '../../components/PageHeader';
import { useSgsoApi } from './useSgsoApi';

type QueueItem = {
  local_id: string;
  client_submission_id: string;
  payload: Record<string, unknown>;
  queued_at: string;
};

type Submission = {
  id: string;
  numero_protocolo: string;
  tipo: string;
  status: string;
  data_ocorrencia: string;
  canal_origem: string;
  sync_status: string;
  o_que_resumo: string;
  onde_resumo: string;
  quando_resumo: string;
  clareza_status: string | null;
  adrep_codigo_sugerido: string | null;
  sinal_tendencia: string | null;
};

const QUEUE_KEY = 'airtrust.sgso.relprev.queue';

function loadQueue(): QueueItem[] {
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) || '[]') as QueueItem[];
  } catch {
    return [];
  }
}

function saveQueue(items: QueueItem[]) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

function statusTone(status: string | null | undefined): string {
  if (status === 'CRITICO' || status === 'SURTO') return 'bg-red-100 text-red-700';
  if (status === 'ALTO' || status === 'TENDENCIA') return 'bg-amber-100 text-amber-700';
  if (status === 'APROVADO' || status === 'CONCILIADO') return 'bg-green-100 text-green-700';
  return 'bg-slate-100 text-slate-700';
}

export default function SgsoRelprevPage() {
  const navigate = useNavigate();
  const apiCall = useSgsoApi();
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    tipo: 'PERIGO',
    anonimo: true,
    data_ocorrencia: new Date().toISOString().slice(0, 16),
    o_que: '',
    onde: '',
    quando: '',
    descricao: '',
    local_icao: '',
    local_descricao: '',
    categoria_adrep: '',
    modo_sigilo: 'CONFIDENCIAL',
    consentimento_contato: false,
  });

  const queueSize = useMemo(() => queue.length, [queue]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setQueue(loadQueue());
    try {
      const response = await apiCall('/sgso/relprev/submissoes?limit=25');
      if (response.success) {
        setSubmissions(response.data ?? []);
      } else {
        setError(response.error ?? 'Erro ao carregar submissões RELPREV');
      }
    } catch {
      setError('Erro ao carregar submissões RELPREV');
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  const flushQueue = useCallback(async () => {
    const currentQueue = loadQueue();
    if (!navigator.onLine || currentQueue.length === 0) return;

    let nextQueue = [...currentQueue];
    for (const item of currentQueue) {
      try {
        const response = await apiCall('/sgso/relprev/submissoes', {
          method: 'POST',
          body: JSON.stringify(item.payload),
        });
        if (response.success) {
          nextQueue = nextQueue.filter((queued) => queued.local_id !== item.local_id);
          saveQueue(nextQueue);
          setQueue(nextQueue);
        }
      } catch {
        break;
      }
    }

    await refreshData();
  }, [apiCall, refreshData]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void flushQueue();
    };
    const onOffline = () => setOnline(false);
    setQueue(loadQueue());
    void refreshData();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushQueue, refreshData]);

  const enqueueCurrentForm = useCallback(() => {
    const clientSubmissionId = crypto.randomUUID();
    const payload = {
      client_submission_id: clientSubmissionId,
      tipo: form.tipo,
      anonimo: form.anonimo,
      data_ocorrencia: new Date(form.data_ocorrencia).toISOString(),
      o_que: form.o_que,
      onde: form.onde,
      quando: form.quando,
      descricao: form.descricao,
      local_icao: form.local_icao || undefined,
      local_descricao: form.local_descricao || form.onde,
      categoria_adrep: form.categoria_adrep || undefined,
      canal_origem: 'WEB',
      offline_capturado_em: new Date().toISOString(),
      privacidade: {
        modo_sigilo: form.modo_sigilo,
        consentimento_contato: form.consentimento_contato,
      },
    };
    const queued: QueueItem[] = [
      {
        local_id: crypto.randomUUID(),
        client_submission_id: clientSubmissionId,
        payload,
        queued_at: new Date().toISOString(),
      },
      ...loadQueue(),
    ];
    saveQueue(queued);
    setQueue(queued);
  }, [form]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (!form.o_que.trim() || !form.onde.trim() || !form.quando.trim()) {
        setError('Preencha o que, onde e quando antes de enviar.');
        return;
      }

      if (!online) {
        enqueueCurrentForm();
        setMessage(
          'Relato salvo na fila offline. Ele será sincronizado automaticamente quando a conexão voltar.',
        );
        return;
      }

      const response = await apiCall('/sgso/relprev/submissoes', {
        method: 'POST',
        body: JSON.stringify({
          client_submission_id: crypto.randomUUID(),
          tipo: form.tipo,
          anonimo: form.anonimo,
          data_ocorrencia: new Date(form.data_ocorrencia).toISOString(),
          o_que: form.o_que,
          onde: form.onde,
          quando: form.quando,
          descricao: form.descricao,
          local_icao: form.local_icao || undefined,
          local_descricao: form.local_descricao || form.onde,
          categoria_adrep: form.categoria_adrep || undefined,
          canal_origem: 'WEB',
          privacidade: {
            modo_sigilo: form.modo_sigilo,
            consentimento_contato: form.consentimento_contato,
          },
        }),
      });

      if (!response.success) {
        throw new Error(response.error ?? 'Erro ao submeter relato RELPREV');
      }

      setMessage(`Relato ${response.data?.numero_protocolo ?? ''} criado com sucesso.`);
      setForm({
        tipo: 'PERIGO',
        anonimo: true,
        data_ocorrencia: new Date().toISOString().slice(0, 16),
        o_que: '',
        onde: '',
        quando: '',
        descricao: '',
        local_icao: '',
        local_descricao: '',
        categoria_adrep: '',
        modo_sigilo: 'CONFIDENCIAL',
        consentimento_contato: false,
      });
      await refreshData();
    } catch (submitError) {
      enqueueCurrentForm();
      setMessage(
        'Não foi possível enviar agora. O relato foi preservado na fila offline para sincronização posterior.',
      );
      setError(
        submitError instanceof Error ? submitError.message : 'Erro ao submeter relato RELPREV',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="RELPREV"
          subtitle="Intake simplificado com operação offline-first e sincronização automática"
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

        <section className="rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,_#e0f2fe,_#f8fafc_42%,_#fff_75%)] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Fluxo operacional
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-sky-200 bg-white p-4">
              <div className="inline-flex rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
                Etapa 1
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">Captura essencial</div>
              <p className="mt-1 text-xs text-slate-500">Registrar o que, onde e quando em poucos cliques.</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-white p-4">
              <div className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                Etapa 2
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">Proteção offline</div>
              <p className="mt-1 text-xs text-slate-500">Quando sem rede, o relato entra em fila segura local.</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <div className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                Etapa 3
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">Sincronização</div>
              <p className="mt-1 text-xs text-slate-500">Publicação automática assim que a conectividade retornar.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Conectividade</div>
              <div
                className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-medium ${online ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
              >
                {online ? 'Online' : 'Offline'}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Fila pendente</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{queueSize}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2 lg:col-span-1">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Submissões recentes
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{submissions.length}</div>
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

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Nova submissão</h2>
                <p className="mt-1 text-sm text-slate-500">
                  O formulário inicial pede apenas o essencial: o que, onde e quando.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void flushQueue()}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-700"
              >
                Sincronizar fila
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
                <span className="font-medium">O que aconteceu?</span>
                <textarea
                  value={form.o_que}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, o_que: event.target.value }))
                  }
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                  placeholder="Descreva o evento de forma objetiva."
                />
              </label>

              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium">Onde?</span>
                <input
                  value={form.onde}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, onde: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                  placeholder="Helideck P-48, pátio, rota, setor"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium">Quando?</span>
                <input
                  value={form.quando}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, quando: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                  placeholder="Durante aproximação final, após briefing, etc."
                />
              </label>

              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium">Data e hora</span>
                <input
                  type="datetime-local"
                  value={form.data_ocorrencia}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, data_ocorrencia: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium">Tipo</span>
                <select
                  value={form.tipo}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, tipo: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                >
                  <option value="PERIGO">Perigo</option>
                  <option value="OCORRENCIA">Ocorrência</option>
                  <option value="INCIDENTE">Incidente</option>
                  <option value="ACIDENTE">Acidente</option>
                </select>
              </label>

              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium">Modo de sigilo</span>
                <select
                  value={form.modo_sigilo}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, modo_sigilo: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                >
                  <option value="CONFIDENCIAL">Confidencial</option>
                  <option value="ANONIMIZADO">Anonimizado</option>
                  <option value="IDENTIFICADO">Identificado</option>
                </select>
              </label>

              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium">ICAO / local</span>
                <input
                  value={form.local_icao}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      local_icao: event.target.value.toUpperCase(),
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                  placeholder="SBJR, SBMI, P-48"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
                <span className="font-medium">Narrativa complementar</span>
                <textarea
                  value={form.descricao}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, descricao: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                  placeholder="Adicione contexto operacional, consequência e ação imediata se já souber."
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.anonimo}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, anonimo: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                Submeter como anônimo
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.consentimento_contato}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      consentimento_contato: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                Aceito retorno do GSO, se necessário
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {submitting
                  ? 'Processando...'
                  : online
                    ? 'Enviar relato'
                    : 'Salvar na fila offline'}
              </button>
              <button
                type="button"
                onClick={enqueueCurrentForm}
                className="rounded-full border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400"
              >
                Guardar rascunho offline
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Fila local</h2>
              <p className="mt-1 text-sm text-slate-500">
                Entradas preservadas no navegador até a sincronização.
              </p>
              <div className="mt-4 space-y-3">
                {queue.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                    Nenhum relato pendente na fila local.
                  </div>
                ) : (
                  queue.map((item) => (
                    <div key={item.local_id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">
                          {String(item.payload.o_que || 'Relato offline')}
                        </div>
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                          Pendente
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Enfileirado em {new Date(item.queued_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Últimas submissões</h2>
              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="text-sm text-slate-500">Carregando submissões...</div>
                ) : submissions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                    Ainda não há submissões RELPREV registradas.
                  </div>
                ) : (
                  submissions.map((submission) => (
                    <div key={submission.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {submission.numero_protocolo}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(submission.sync_status)}`}
                        >
                          {submission.sync_status}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(submission.sinal_tendencia)}`}
                        >
                          {submission.sinal_tendencia || 'SEM_SINAL'}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-slate-700">{submission.o_que_resumo}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        {submission.onde_resumo} · {submission.quando_resumo} ·{' '}
                        {new Date(submission.data_ocorrencia).toLocaleString('pt-BR')}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>Clareza: {submission.clareza_status || 'PENDENTE'}</span>
                        <span>ADREP: {submission.adrep_codigo_sugerido || 'A classificar'}</span>
                        <span>Canal: {submission.canal_origem}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
