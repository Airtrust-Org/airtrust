import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Mail, MessageCircle, Plus, Send, Trash2, X } from 'lucide-react';
import { fetchWithAuth } from '@/react-app/config/api';
import { showToast } from '@/react-app/utils/toast';

type NoticeStatus = 'NAO_REALIZADO' | 'VENCENDO' | 'VENCIDO';

type PendingNoticeRow = {
  funcionario_id: number;
  funcionario_nome: string;
  qualificacao_tipo_id: number;
  qualificacao_tipo_nome?: string | null;
  status_compliance: NoticeStatus | 'EM_ANDAMENTO' | 'CONFORME';
  tem_email: boolean;
  tem_whatsapp: boolean;
};

type Catalogs = {
  setores: Array<{ id: number; nome: string }>;
  funcoes: Array<{ id: number; nome: string }>;
  funcionarios: Array<{ id: number; nome: string }>;
  setor_funcoes: Array<{ setor_id: number; funcao_id: number }>;
};

type TrainingType = {
  id: string | number;
  nome: string;
  codigo?: string | null;
};

type Scope =
  | { kind: 'TRAINING'; id: number; label: string }
  | { kind: 'PERSON'; id: number; label: string }
  | { kind: 'ROLE'; id: number; label: string }
  | { kind: 'SECTOR'; id: number; label: string }
  | { kind: 'SECTOR_ROLE'; setorId: number; funcaoId: number; label: string }
  | {
      kind: 'CURRENT_FILTER';
      setorId: number | null;
      funcaoId: number | null;
      search: string;
      label: string;
    };

type ScopeKind = Scope['kind'];

type Props = {
  catalogs?: Catalogs;
  trainingTypes: TrainingType[];
  currentFilter?: {
    setorId: number | null;
    funcaoId: number | null;
    search: string;
  };
};

type SendResult = {
  selecionados: number;
  email_sucesso: number;
  whatsapp_sucesso: number;
  email_falha: number;
  whatsapp_falha: number;
  sem_email: number;
  sem_whatsapp: number;
};

const STATUS_OPTIONS: Array<{ status: NoticeStatus; label: string }> = [
  { status: 'NAO_REALIZADO', label: 'Matrícula / não realizado' },
  { status: 'VENCENDO', label: 'Vencendo' },
  { status: 'VENCIDO', label: 'Vencidos' },
];

const SCOPE_KIND_LABELS: Record<ScopeKind, string> = {
  TRAINING: 'Treinamento',
  PERSON: 'Pessoa',
  ROLE: 'Cargo / função',
  SECTOR: 'Setor',
  SECTOR_ROLE: 'Setor + cargo',
  CURRENT_FILTER: 'Filtro atual',
};

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || json.success === false) {
    throw new Error(json.error || 'Erro ao processar envio múltiplo');
  }
  return json.data as T;
}

function scopeKey(scope: Scope) {
  if (scope.kind === 'SECTOR_ROLE') return `${scope.kind}:${scope.setorId}:${scope.funcaoId}`;
  if (scope.kind === 'CURRENT_FILTER') {
    return `${scope.kind}:${scope.setorId || 0}:${scope.funcaoId || 0}:${scope.search}`;
  }
  return `${scope.kind}:${scope.id}`;
}

function buildPendingUrl(scope: Scope) {
  const params = new URLSearchParams();
  params.set('status', 'NAO_REALIZADO,VENCENDO,VENCIDO');
  if (scope.kind === 'TRAINING') params.set('qualificacao_tipo_id', String(scope.id));
  if (scope.kind === 'PERSON') params.set('funcionario_id', String(scope.id));
  if (scope.kind === 'ROLE') params.set('funcao_id', String(scope.id));
  if (scope.kind === 'SECTOR') params.set('setor_id', String(scope.id));
  if (scope.kind === 'SECTOR_ROLE') {
    params.set('setor_id', String(scope.setorId));
    params.set('funcao_id', String(scope.funcaoId));
  }
  if (scope.kind === 'CURRENT_FILTER') {
    if (scope.setorId) params.set('setor_id', String(scope.setorId));
    if (scope.funcaoId) params.set('funcao_id', String(scope.funcaoId));
    if (scope.search.trim()) params.set('q', scope.search.trim());
  }
  return `/api/compliance-treinamentos/pendencias?${params.toString()}`;
}

function chunkTargets<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function findLabel<T extends { id: number; nome: string }>(items: T[], id: number) {
  return items.find((item) => item.id === id)?.nome || `#${id}`;
}

export function TrainingComplianceBulkNoticeComposer({
  catalogs,
  trainingTypes,
  currentFilter,
}: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [scopeKind, setScopeKind] = useState<ScopeKind>('TRAINING');
  const [selectedId, setSelectedId] = useState('');
  const [selectedSectorId, setSelectedSectorId] = useState('');
  const [selectedFunctionId, setSelectedFunctionId] = useState('');
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [statuses, setStatuses] = useState<Record<NoticeStatus, boolean>>({
    NAO_REALIZADO: true,
    VENCENDO: true,
    VENCIDO: true,
  });
  const [channels, setChannels] = useState({ email: true, whatsapp: true });

  const sortedTrainingTypes = useMemo(
    () =>
      [...trainingTypes].sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
      ),
    [trainingTypes],
  );
  const sortedPeople = useMemo(
    () =>
      [...(catalogs?.funcionarios || [])].sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
      ),
    [catalogs?.funcionarios],
  );
  const sortedRoles = useMemo(
    () =>
      [...(catalogs?.funcoes || [])].sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
      ),
    [catalogs?.funcoes],
  );
  const sortedSectors = useMemo(
    () =>
      [...(catalogs?.setores || [])].sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
      ),
    [catalogs?.setores],
  );

  const sectorFunctions = useMemo(() => {
    const setorId = Number(selectedSectorId || 0);
    if (!setorId) return sortedRoles;
    const allowed = new Set(
      (catalogs?.setor_funcoes || [])
        .filter((pair) => pair.setor_id === setorId)
        .map((pair) => pair.funcao_id),
    );
    return sortedRoles.filter((item) => allowed.has(item.id));
  }, [catalogs?.setor_funcoes, selectedSectorId, sortedRoles]);

  const currentFilterAvailable = Boolean(
    currentFilter &&
      (currentFilter.setorId || currentFilter.funcaoId || currentFilter.search.trim()),
  );

  const preview = useQuery({
    queryKey: ['training-compliance', 'bulk-notice-preview', scopes.map(scopeKey).sort()],
    enabled: open && scopes.length > 0,
    queryFn: async () => {
      const result = await Promise.all(
        scopes.map(async (scope) => readJson<PendingNoticeRow[]>(await fetchWithAuth(buildPendingUrl(scope)))),
      );
      const byTarget = new Map<string, PendingNoticeRow>();
      for (const row of result.flat()) {
        const key = `${row.funcionario_id}:${row.qualificacao_tipo_id}`;
        if (!byTarget.has(key)) byTarget.set(key, row);
      }
      return [...byTarget.values()];
    },
  });

  const rows = preview.data || [];
  const statusCounts = useMemo(
    () =>
      STATUS_OPTIONS.reduce(
        (acc, option) => {
          acc[option.status] = rows.filter((row) => row.status_compliance === option.status).length;
          return acc;
        },
        { NAO_REALIZADO: 0, VENCENDO: 0, VENCIDO: 0 } as Record<NoticeStatus, number>,
      ),
    [rows],
  );

  const selectedRows = useMemo(
    () =>
      rows.filter(
        (row): row is PendingNoticeRow & { status_compliance: NoticeStatus } =>
          (row.status_compliance === 'NAO_REALIZADO' ||
            row.status_compliance === 'VENCENDO' ||
            row.status_compliance === 'VENCIDO') &&
          statuses[row.status_compliance],
      ),
    [rows, statuses],
  );

  const targets = useMemo(
    () =>
      selectedRows.map((row) => ({
        funcionario_id: row.funcionario_id,
        qualificacao_tipo_id: row.qualificacao_tipo_id,
      })),
    [selectedRows],
  );
  const peopleCount = useMemo(
    () => new Set(selectedRows.map((row) => row.funcionario_id)).size,
    [selectedRows],
  );
  const trainingCount = useMemo(
    () => new Set(selectedRows.map((row) => row.qualificacao_tipo_id)).size,
    [selectedRows],
  );
  const withEmail = selectedRows.filter((row) => row.tem_email).length;
  const withWhatsApp = selectedRows.filter((row) => row.tem_whatsapp).length;

  const addScope = () => {
    if (scopes.length >= 50) {
      showToast.error('Limite de 50 seleções por envio múltiplo.');
      return;
    }

    let next: Scope | null = null;
    const id = Number(selectedId || 0);

    if (scopeKind === 'TRAINING' && id) {
      const item = trainingTypes.find((training) => Number(training.id) === id);
      if (item) next = { kind: 'TRAINING', id, label: item.nome };
    }
    if (scopeKind === 'PERSON' && id && catalogs) {
      next = { kind: 'PERSON', id, label: findLabel(catalogs.funcionarios, id) };
    }
    if (scopeKind === 'ROLE' && id && catalogs) {
      next = { kind: 'ROLE', id, label: findLabel(catalogs.funcoes, id) };
    }
    if (scopeKind === 'SECTOR' && id && catalogs) {
      next = { kind: 'SECTOR', id, label: findLabel(catalogs.setores, id) };
    }
    if (scopeKind === 'SECTOR_ROLE' && catalogs) {
      const setorId = Number(selectedSectorId || 0);
      const funcaoId = Number(selectedFunctionId || 0);
      if (setorId && funcaoId) {
        next = {
          kind: 'SECTOR_ROLE',
          setorId,
          funcaoId,
          label: `${findLabel(catalogs.setores, setorId)} · ${findLabel(catalogs.funcoes, funcaoId)}`,
        };
      }
    }
    if (scopeKind === 'CURRENT_FILTER' && currentFilterAvailable && currentFilter) {
      const parts = [
        currentFilter.setorId && catalogs
          ? findLabel(catalogs.setores, currentFilter.setorId)
          : null,
        currentFilter.funcaoId && catalogs
          ? findLabel(catalogs.funcoes, currentFilter.funcaoId)
          : null,
        currentFilter.search.trim() ? `busca: ${currentFilter.search.trim()}` : null,
      ].filter(Boolean);
      next = {
        kind: 'CURRENT_FILTER',
        setorId: currentFilter.setorId,
        funcaoId: currentFilter.funcaoId,
        search: currentFilter.search,
        label: parts.join(' · '),
      };
    }

    if (!next) {
      showToast.error('Selecione um item para adicionar ao envio.');
      return;
    }

    const key = scopeKey(next);
    if (scopes.some((scope) => scopeKey(scope) === key)) {
      showToast.error('Esta seleção já está no envio múltiplo.');
      return;
    }

    setScopes((current) => [...current, next!]);
    setSelectedId('');
    if (scopeKind === 'SECTOR_ROLE') {
      setSelectedSectorId('');
      setSelectedFunctionId('');
    }
  };

  const send = useMutation({
    mutationFn: async () => {
      if (!targets.length) throw new Error('Nenhum alerta selecionado para envio.');
      if (!channels.email && !channels.whatsapp)
        throw new Error('Selecione e-mail e/ou WhatsApp.');

      const aggregate: SendResult = {
        selecionados: 0,
        email_sucesso: 0,
        whatsapp_sucesso: 0,
        email_falha: 0,
        whatsapp_falha: 0,
        sem_email: 0,
        sem_whatsapp: 0,
      };

      for (const batch of chunkTargets(targets, 200)) {
        const result = await readJson<SendResult>(
          await fetchWithAuth('/api/compliance-treinamentos/avisos/enviar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targets: batch, canais: channels }),
          }),
        );
        for (const key of Object.keys(aggregate) as Array<keyof SendResult>) {
          aggregate[key] += Number(result[key] || 0);
        }
      }
      return aggregate;
    },
    onSuccess: async (result) => {
      showToast.success(
        `${result.selecionados} alerta(s) processado(s): ${result.email_sucesso} e-mail(s) e ${result.whatsapp_sucesso} WhatsApp(s) enviados.`,
      );
      setOpen(false);
      setScopes([]);
      await queryClient.invalidateQueries({ queryKey: ['training-compliance'] });
    },
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao enviar alertas'),
  });

  const primaryOptions =
    scopeKind === 'TRAINING'
      ? sortedTrainingTypes.map((item) => ({
          id: Number(item.id),
          label: item.codigo ? `${item.nome} (${item.codigo})` : item.nome,
        }))
      : scopeKind === 'PERSON'
        ? sortedPeople.map((item) => ({ id: item.id, label: item.nome }))
        : scopeKind === 'ROLE'
          ? sortedRoles.map((item) => ({ id: item.id, label: item.nome }))
          : scopeKind === 'SECTOR'
            ? sortedSectors.map((item) => ({ id: item.id, label: item.nome }))
            : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
      >
        <BellRing className="h-4 w-4" />
        Envio múltiplo
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Envio múltiplo de alertas de treinamento"
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Envio múltiplo de alertas
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Misture treinamentos, pessoas, cargos e setores no mesmo envio. As seleções são
                  somadas e destinatários repetidos são eliminados automaticamente.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar envio múltiplo"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Adicionar grupo ao envio
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-[170px_minmax(0,1fr)_auto]">
                <select
                  aria-label="Tipo de seleção do envio múltiplo"
                  value={scopeKind}
                  onChange={(event) => {
                    setScopeKind(event.target.value as ScopeKind);
                    setSelectedId('');
                    setSelectedSectorId('');
                    setSelectedFunctionId('');
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="TRAINING">Treinamento</option>
                  <option value="PERSON">Pessoa</option>
                  <option value="ROLE">Cargo / função</option>
                  <option value="SECTOR">Setor</option>
                  <option value="SECTOR_ROLE">Setor + cargo</option>
                  {currentFilterAvailable ? <option value="CURRENT_FILTER">Filtro atual</option> : null}
                </select>

                {scopeKind === 'SECTOR_ROLE' ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      aria-label="Setor do envio múltiplo"
                      value={selectedSectorId}
                      onChange={(event) => {
                        setSelectedSectorId(event.target.value);
                        setSelectedFunctionId('');
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Selecione o setor</option>
                      {sortedSectors.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Cargo do envio múltiplo"
                      value={selectedFunctionId}
                      onChange={(event) => setSelectedFunctionId(event.target.value)}
                      disabled={!selectedSectorId}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                    >
                      <option value="">Selecione o cargo</option>
                      {sectorFunctions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : scopeKind === 'CURRENT_FILTER' ? (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    Adiciona o filtro atualmente aplicado nesta tela como mais um grupo.
                  </div>
                ) : (
                  <select
                    aria-label="Item do envio múltiplo"
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {primaryOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={addScope}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar
                </button>
              </div>
            </section>

            <section className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Seleções combinadas ({scopes.length})
                </p>
                {scopes.length ? (
                  <button
                    type="button"
                    onClick={() => setScopes([])}
                    className="text-xs font-semibold text-slate-500 hover:text-red-600"
                  >
                    Limpar tudo
                  </button>
                ) : null}
              </div>
              {scopes.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {scopes.map((scope) => (
                    <span
                      key={scopeKey(scope)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                    >
                      <strong className="font-semibold text-slate-500">
                        {SCOPE_KIND_LABELS[scope.kind]}:
                      </strong>
                      {scope.label}
                      <button
                        type="button"
                        aria-label={`Remover ${scope.label}`}
                        onClick={() =>
                          setScopes((current) =>
                            current.filter((item) => scopeKey(item) !== scopeKey(scope)),
                          )
                        }
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
                  Adicione pelo menos um treinamento, pessoa, cargo ou setor.
                </div>
              )}
            </section>

            {scopes.length ? (
              <>
                <section className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tipos de alerta
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {STATUS_OPTIONS.map((option) => (
                      <label
                        key={option.status}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={statuses[option.status]}
                            disabled={!statusCounts[option.status]}
                            onChange={(event) =>
                              setStatuses((current) => ({
                                ...current,
                                [option.status]: event.target.checked,
                              }))
                            }
                          />
                          <span className="text-sm font-medium text-slate-800">{option.label}</span>
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                          {statusCounts[option.status]}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Canais
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                      <input
                        type="checkbox"
                        checked={channels.email}
                        onChange={(event) =>
                          setChannels((current) => ({ ...current, email: event.target.checked }))
                        }
                      />
                      <Mail className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-800">
                        E-mail <span className="text-slate-400">({withEmail})</span>
                      </span>
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                      <input
                        type="checkbox"
                        checked={channels.whatsapp}
                        onChange={(event) =>
                          setChannels((current) => ({
                            ...current,
                            whatsapp: event.target.checked,
                          }))
                        }
                      />
                      <MessageCircle className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-800">
                        WhatsApp <span className="text-slate-400">({withWhatsApp})</span>
                      </span>
                    </label>
                  </div>
                </section>

                <div className="mt-4 rounded-xl bg-blue-50/70 p-4 text-sm text-blue-900">
                  {preview.isLoading ? (
                    'Calculando destinatários e eliminando duplicidades...'
                  ) : preview.isError ? (
                    'Não foi possível calcular o alcance deste envio.'
                  ) : (
                    <>
                      <strong>{targets.length}</strong> alerta(s) únicos para{' '}
                      <strong>{peopleCount}</strong> pessoa(s), envolvendo{' '}
                      <strong>{trainingCount}</strong> treinamento(s). Sobreposições entre curso,
                      pessoa, cargo e setor não geram envio duplicado.
                    </>
                  )}
                </div>
              </>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  !scopes.length ||
                  preview.isLoading ||
                  preview.isError ||
                  send.isPending ||
                  !targets.length ||
                  (!channels.email && !channels.whatsapp)
                }
                onClick={() => send.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {send.isPending ? 'Enviando...' : `Enviar ${targets.length} alerta(s)`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
