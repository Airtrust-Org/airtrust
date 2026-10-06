import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Mail, MessageCircle, Send, X } from 'lucide-react';
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

type SendResult = {
  selecionados: number;
  email_sucesso: number;
  whatsapp_sucesso: number;
  email_falha: number;
  whatsapp_falha: number;
  sem_email: number;
  sem_whatsapp: number;
};

type Props = {
  scopeLabel: string;
  pendingCount: number;
  setorId?: number | null;
  funcaoId?: number | null;
  funcionarioId?: number | null;
  qualificacaoTipoId?: number | null;
  search?: string;
  label?: string;
  className?: string;
};

const STATUS_OPTIONS: Array<{
  status: NoticeStatus;
  label: string;
  description: string;
}> = [
  {
    status: 'NAO_REALIZADO',
    label: 'Matrícula / não realizado',
    description: 'Treinamento obrigatório ainda não realizado.',
  },
  {
    status: 'VENCENDO',
    label: 'Vencendo',
    description: 'Treinamentos dentro da janela de vencimento.',
  },
  {
    status: 'VENCIDO',
    label: 'Vencidos',
    description: 'Treinamentos com validade expirada.',
  },
];

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || json.success === false) {
    throw new Error(json.error || 'Erro ao processar alertas de treinamento');
  }
  return json.data as T;
}

function buildPendingUrl(props: Pick<
  Props,
  'setorId' | 'funcaoId' | 'funcionarioId' | 'qualificacaoTipoId' | 'search'
>) {
  const params = new URLSearchParams();
  params.set('status', 'NAO_REALIZADO,VENCENDO,VENCIDO');
  if (props.setorId) params.set('setor_id', String(props.setorId));
  if (props.funcaoId) params.set('funcao_id', String(props.funcaoId));
  if (props.funcionarioId) params.set('funcionario_id', String(props.funcionarioId));
  if (props.qualificacaoTipoId)
    params.set('qualificacao_tipo_id', String(props.qualificacaoTipoId));
  if (props.search?.trim()) params.set('q', props.search.trim());
  return `/api/compliance-treinamentos/pendencias?${params.toString()}`;
}

function chunkTargets<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function TrainingComplianceNoticeAction({
  scopeLabel,
  pendingCount,
  setorId = null,
  funcaoId = null,
  funcionarioId = null,
  qualificacaoTipoId = null,
  search = '',
  label = 'Alertas',
  className = '',
}: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<Record<NoticeStatus, boolean>>({
    NAO_REALIZADO: true,
    VENCENDO: true,
    VENCIDO: true,
  });
  const [channels, setChannels] = useState({ email: true, whatsapp: true });

  const pending = useQuery({
    queryKey: [
      'training-compliance',
      'notice-action',
      setorId,
      funcaoId,
      funcionarioId,
      qualificacaoTipoId,
      search,
    ],
    enabled: open && pendingCount > 0,
    queryFn: async () =>
      readJson<PendingNoticeRow[]>(
        await fetchWithAuth(
          buildPendingUrl({ setorId, funcaoId, funcionarioId, qualificacaoTipoId, search }),
        ),
      ),
  });

  const rows = pending.data || [];
  const statusCounts = useMemo(
    () =>
      STATUS_OPTIONS.reduce(
        (acc, option) => {
          acc[option.status] = rows.filter(
            (row) => row.status_compliance === option.status,
          ).length;
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

  const targets = useMemo(() => {
    const byKey = new Map<string, { funcionario_id: number; qualificacao_tipo_id: number }>();
    for (const row of selectedRows) {
      const key = `${row.funcionario_id}:${row.qualificacao_tipo_id}`;
      byKey.set(key, {
        funcionario_id: row.funcionario_id,
        qualificacao_tipo_id: row.qualificacao_tipo_id,
      });
    }
    return [...byKey.values()];
  }, [selectedRows]);

  const peopleCount = useMemo(
    () => new Set(selectedRows.map((row) => row.funcionario_id)).size,
    [selectedRows],
  );
  const withEmail = selectedRows.filter((row) => row.tem_email).length;
  const withWhatsApp = selectedRows.filter((row) => row.tem_whatsapp).length;

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
      await queryClient.invalidateQueries({ queryKey: ['training-compliance'] });
    },
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao enviar alertas'),
  });

  return (
    <>
      <button
        type="button"
        disabled={pendingCount <= 0}
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 ${className}`}
        title={
          pendingCount > 0
            ? `Enviar alertas para ${scopeLabel}`
            : `Sem alertas de matrícula ou vencimento para ${scopeLabel}`
        }
      >
        <BellRing className="h-3.5 w-3.5" />
        {label}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Enviar alertas — ${scopeLabel}`}
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900">Enviar alertas</h3>
                <p className="mt-1 text-sm text-slate-500">{scopeLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar envio de alertas"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {pending.isLoading ? (
              <div className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                Carregando pendências deste escopo...
              </div>
            ) : pending.isError ? (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Não foi possível carregar as pendências para envio.
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tipos de alerta
                  </p>
                  {STATUS_OPTIONS.map((option) => (
                    <label
                      key={option.status}
                      className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={statuses[option.status]}
                        disabled={!statusCounts[option.status]}
                        onChange={(event) =>
                          setStatuses((current) => ({
                            ...current,
                            [option.status]: event.target.checked,
                          }))
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-slate-800">
                            {option.label}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                            {statusCounts[option.status]}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>

                <div className="mt-4">
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
                </div>

                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  <strong className="text-slate-900">{targets.length}</strong> alerta(s) para{' '}
                  <strong className="text-slate-900">{peopleCount}</strong> pessoa(s). O envio usa
                  os modelos vigentes de treinamento obrigatório pendente, a vencer e vencido.
                </div>
              </>
            )}

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
                  pending.isLoading ||
                  pending.isError ||
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
