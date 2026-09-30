import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Download,
  FileText,
  History,
  Mail,
  MessageCircle,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import {
  nextComplianceTableSort,
  sortComplianceRows,
  SortableComplianceTableHeader,
  type TableSortState,
} from '@/react-app/components/compliance/SortableComplianceTableHeader';
import {
  buildComplianceNarrative,
  complianceStatusLabel,
  downloadTrainingCompliancePdf,
  generateTrainingCompliancePdf,
  type TrainingCompliancePendingRow,
  type TrainingComplianceReportSummary,
} from '@/react-app/services/training-compliance-report';

type Mode = 'pendencias' | 'relatorios' | 'comunicacoes';

type Catalogs = {
  setores: Array<{ id: number; nome: string }>;
  funcoes: Array<{ id: number; nome: string }>;
  setor_funcoes: Array<{ setor_id: number; funcao_id: number }>;
};

type NoticePreview = {
  selecionados: number;
  com_email: number;
  sem_email: number;
  com_whatsapp: number;
  sem_whatsapp: number;
  vencidos: number;
  nunca_realizados: number;
};

type NoticeResult = {
  selecionados: number;
  email_sucesso: number;
  whatsapp_sucesso: number;
  email_falha: number;
  whatsapp_falha: number;
  sem_email: number;
  sem_whatsapp: number;
};

type Communication = {
  id: number;
  funcionario_id: number;
  funcionario_nome: string | null;
  setor_nome: string | null;
  qualificacao_tipo_id: number | null;
  qualificacao_nome: string | null;
  status_compliance: string | null;
  tipo: string | null;
  destinatario: string | null;
  status_envio: string | null;
  erro: string | null;
  enviado_em: string | null;
  gestor: boolean;
};

type ComplianceTrendPoint = {
  snapshot_date: string;
  setor_id: number;
  funcao_id: number;
  pessoas: number;
  pessoas_com_pendencia: number;
  requisitos_obrigatorios: number;
  conformes: number;
  vencendo: number;
  vencidos: number;
  nao_realizados: number;
  em_andamento: number;
  compliance_pct: number | null;
};

type PendingSortKey = 'person' | 'sector' | 'training' | 'status' | 'notices';
type CommunicationSortKey = 'date' | 'person' | 'training' | 'channel' | 'destination' | 'result';

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || json.success === false) throw new Error(json.error || 'Falha na operação');
  return json.data as T;
}

function rowKey(
  row: Pick<TrainingCompliancePendingRow, 'funcionario_id' | 'qualificacao_tipo_id'>,
) {
  return `${row.funcionario_id}:${row.qualificacao_tipo_id}`;
}

function statusBadge(status: TrainingCompliancePendingRow['status_compliance']) {
  const tones = {
    VENCIDO: 'bg-red-50 text-red-700 border-red-200',
    NAO_REALIZADO: 'bg-orange-50 text-orange-700 border-orange-200',
    VENCENDO: 'bg-amber-50 text-amber-700 border-amber-200',
    EM_ANDAMENTO: 'bg-blue-50 text-blue-700 border-blue-200',
    CONFORME: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  } as const;
  return tones[status];
}

function formatDateTime(value: string | null) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

export function TrainingComplianceIntelligence({
  mode,
  setorId,
  funcaoId,
  catalogs,
  summary,
}: {
  mode: Mode;
  setorId: number | null;
  funcaoId: number | null;
  catalogs: Catalogs | undefined;
  summary: TrainingComplianceReportSummary;
}) {
  const queryClient = useQueryClient();
  const { user, empresas, empresaAtualId } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('TODAS');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [windowDays, setWindowDays] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeChannels, setNoticeChannels] = useState({ email: true, whatsapp: true });
  const [pendingSort, setPendingSort] = useState<TableSortState<PendingSortKey>>({
    key: 'person',
    direction: 'asc',
  });
  const [communicationSort, setCommunicationSort] = useState<TableSortState<CommunicationSortKey>>({
    key: 'date',
    direction: 'desc',
  });

  const params = new URLSearchParams();
  if (setorId) params.set('setor_id', String(setorId));
  if (funcaoId) params.set('funcao_id', String(funcaoId));
  const pendingUrl = `/api/compliance-treinamentos/pendencias${params.size ? `?${params.toString()}` : ''}`;

  const pendings = useQuery({
    queryKey: ['training-compliance', 'intelligence-pendings', setorId, funcaoId],
    enabled: mode === 'pendencias' || mode === 'relatorios',
    queryFn: async () => readJson<TrainingCompliancePendingRow[]>(await fetchWithAuth(pendingUrl)),
  });

  const communications = useQuery({
    queryKey: ['training-compliance', 'communications'],
    enabled: mode === 'comunicacoes',
    queryFn: async () =>
      readJson<Communication[]>(
        await fetchWithAuth('/api/compliance-treinamentos/comunicacoes?limit=200'),
      ),
  });

  const trend = useQuery({
    queryKey: ['training-compliance', 'trend', setorId, funcaoId],
    enabled: mode === 'relatorios',
    queryFn: async () => {
      const trendParams = new URLSearchParams({ days: '90' });
      if (setorId) trendParams.set('setor_id', String(setorId));
      if (funcaoId) trendParams.set('funcao_id', String(funcaoId));
      return readJson<ComplianceTrendPoint[]>(
        await fetchWithAuth(`/api/compliance-treinamentos/tendencias?${trendParams.toString()}`),
      );
    },
  });

  const visibleRows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (pendings.data || []).filter((row) => {
      if (status !== 'TODAS' && row.status_compliance !== status) return false;
      if (criticalOnly && !row.critico_operacional) return false;
      if (windowDays) {
        const days = Number(windowDays);
        if (
          row.status_compliance !== 'NAO_REALIZADO' &&
          (row.dias_para_vencer == null || row.dias_para_vencer > days)
        ) {
          return false;
        }
      }
      if (!normalized) return true;
      return [
        row.funcionario_nome,
        row.setor_nome,
        row.funcao_nome,
        row.qualificacao_tipo_nome,
        row.qualificacao_tipo_codigo,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(normalized),
      );
    });
  }, [criticalOnly, pendings.data, search, status, windowDays]);

  const sortedVisibleRows = useMemo(
    () =>
      sortComplianceRows(visibleRows, pendingSort, (row, key) => {
        if (key === 'person') return row.funcionario_nome;
        if (key === 'sector') return `${row.setor_nome || ''} ${row.funcao_nome || ''}`;
        if (key === 'training') return row.qualificacao_tipo_nome || row.qualificacao_tipo_codigo;
        if (key === 'status') return row.status_compliance;
        return row.avisos_enviados;
      }),
    [pendingSort, visibleRows],
  );
  const sortedCommunications = useMemo(
    () =>
      sortComplianceRows(communications.data || [], communicationSort, (row, key) => {
        if (key === 'date') return row.enviado_em ? new Date(row.enviado_em).getTime() : null;
        if (key === 'person') return row.funcionario_nome;
        if (key === 'training') return row.qualificacao_nome;
        if (key === 'channel') return row.tipo;
        if (key === 'destination') return row.destinatario;
        return row.status_envio;
      }),
    [communicationSort, communications.data],
  );

  useEffect(() => {
    const validKeys = new Set(visibleRows.map(rowKey));
    setSelected((old) => new Set([...old].filter((key) => validKeys.has(key))));
  }, [visibleRows]);

  const selectedRows = useMemo(
    () => visibleRows.filter((row) => selected.has(rowKey(row))),
    [selected, visibleRows],
  );

  const requestTargets = selectedRows.map((row) => ({
    funcionario_id: row.funcionario_id,
    qualificacao_tipo_id: row.qualificacao_tipo_id,
  }));

  const preview = useQuery({
    queryKey: ['training-compliance', 'notice-preview', requestTargets],
    enabled: noticeOpen && requestTargets.length > 0,
    queryFn: async () =>
      readJson<NoticePreview>(
        await fetchWithAuth('/api/compliance-treinamentos/avisos/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targets: requestTargets }),
        }),
      ),
  });

  const sendNotices = useMutation({
    mutationFn: async () =>
      readJson<NoticeResult>(
        await fetchWithAuth('/api/compliance-treinamentos/avisos/enviar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targets: requestTargets, canais: noticeChannels }),
        }),
      ),
    onSuccess: (result) => {
      toast.success(
        `Cobrança enviada: ${result.email_sucesso} e-mail(s) e ${result.whatsapp_sucesso} WhatsApp(s).`,
      );
      setNoticeOpen(false);
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ['training-compliance'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar avisos'),
  });

  const empresaNome = useMemo(() => {
    const current = empresas.find((item) => Number(item.id) === Number(empresaAtualId));
    return current?.nome || 'Empresa atual';
  }, [empresaAtualId, empresas]);
  const userName = user?.nome || user?.email || 'Usuário autenticado';
  const setorNome = catalogs?.setores.find((item) => item.id === setorId)?.nome || null;
  const funcaoNome = catalogs?.funcoes.find((item) => item.id === funcaoId)?.nome || null;
  const reportContext = { empresaNome, usuarioNome: userName, setorNome, funcaoNome };

  const exportPdf = async (download: boolean) => {
    const report = await generateTrainingCompliancePdf(visibleRows, reportSummary, reportContext);
    if (download) downloadTrainingCompliancePdf(report.blob, report.filename);
    return report;
  };

  const sendManagerReport = useMutation({
    mutationFn: async () => {
      if (!setorId) throw new Error('Selecione um setor para enviar o relatório ao gestor.');
      const report = await exportPdf(false);
      return readJson<{ enviados: number; setor_nome: string }>(
        await fetchWithAuth('/api/compliance-treinamentos/relatorios/enviar-gestor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            setor_id: setorId,
            pdf_base64: report.base64,
            arquivo_nome: report.filename,
          }),
        }),
      );
    },
    onSuccess: (result) =>
      toast.success(
        `Relatório enviado para ${result.enviados} gestor(es) de ${result.setor_nome}.`,
      ),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar relatório'),
  });

  const reportSummary = useMemo<TrainingComplianceReportSummary>(
    () => ({
      ...summary,
      vencidos: visibleRows.filter((row) => row.status_compliance === 'VENCIDO').length,
      nao_realizados: visibleRows.filter((row) => row.status_compliance === 'NAO_REALIZADO').length,
      vencendo: visibleRows.filter((row) => row.status_compliance === 'VENCENDO').length,
      em_andamento: visibleRows.filter((row) => row.status_compliance === 'EM_ANDAMENTO').length,
    }),
    [summary, visibleRows],
  );

  const aggregations = useMemo(() => {
    const byTraining = new Map<string, number>();
    const byPerson = new Map<string, number>();
    const bySector = new Map<string, number>();
    visibleRows.forEach((row) => {
      const training = row.qualificacao_tipo_nome || row.qualificacao_tipo_codigo || 'Treinamento';
      const sector = row.setor_nome || 'Sem setor';
      byTraining.set(training, (byTraining.get(training) || 0) + 1);
      byPerson.set(row.funcionario_nome, (byPerson.get(row.funcionario_nome) || 0) + 1);
      bySector.set(sector, (bySector.get(sector) || 0) + 1);
    });
    const top = (map: Map<string, number>) =>
      [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { trainings: top(byTraining), people: top(byPerson), sectors: top(bySector) };
  }, [visibleRows]);

  const recurrentPendings = useMemo(
    () =>
      [...visibleRows]
        .filter((row) => row.avisos_enviados >= 2)
        .sort((a, b) => b.avisos_enviados - a.avisos_enviados)
        .slice(0, 5),
    [visibleRows],
  );

  if (mode === 'comunicacoes') {
    return (
      <div className="p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <History className="h-4 w-4 text-primary" /> Histórico de comunicações
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Auditoria de cobranças enviadas aos funcionários e gestores.
            </p>
          </div>
          <button
            type="button"
            onClick={() => communications.refetch()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Atualizar
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <SortableComplianceTableHeader
                  column="date"
                  label="Data"
                  sort={communicationSort}
                  onSort={(key) =>
                    setCommunicationSort((current) => nextComplianceTableSort(current, key))
                  }
                />
                <SortableComplianceTableHeader
                  column="person"
                  label="Pessoa"
                  sort={communicationSort}
                  onSort={(key) =>
                    setCommunicationSort((current) => nextComplianceTableSort(current, key))
                  }
                />
                <SortableComplianceTableHeader
                  column="training"
                  label="Treinamento"
                  sort={communicationSort}
                  onSort={(key) =>
                    setCommunicationSort((current) => nextComplianceTableSort(current, key))
                  }
                />
                <SortableComplianceTableHeader
                  column="channel"
                  label="Canal"
                  sort={communicationSort}
                  onSort={(key) =>
                    setCommunicationSort((current) => nextComplianceTableSort(current, key))
                  }
                />
                <SortableComplianceTableHeader
                  column="destination"
                  label="Destino"
                  sort={communicationSort}
                  onSort={(key) =>
                    setCommunicationSort((current) => nextComplianceTableSort(current, key))
                  }
                />
                <SortableComplianceTableHeader
                  column="result"
                  label="Resultado"
                  sort={communicationSort}
                  onSort={(key) =>
                    setCommunicationSort((current) => nextComplianceTableSort(current, key))
                  }
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {sortedCommunications.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-3 text-slate-500">{formatDateTime(row.enviado_em)}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-900">{row.funcionario_nome || '—'}</div>
                    <div className="text-xs text-slate-400">
                      {row.gestor ? 'cópia/escalonamento ao gestor' : row.setor_nome || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{row.qualificacao_nome || '—'}</td>
                  <td className="px-3 py-3 text-slate-600">
                    {String(row.tipo || '')
                      .replace('_COMPLIANCE', '')
                      .replace('_GESTOR', '')}
                  </td>
                  <td className="px-3 py-3 text-slate-500">{row.destinatario || '—'}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${row.status_envio === 'enviada' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
                    >
                      {row.status_envio === 'enviada' ? 'Enviado' : 'Falha'}
                    </span>
                    {row.erro ? (
                      <div className="mt-1 max-w-xs text-xs text-red-600">{row.erro}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!communications.isLoading && !(communications.data || []).length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Nenhuma cobrança de compliance registrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (mode === 'relatorios') {
    return (
      <div className="space-y-5 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Users className="h-4 w-4" /> Pessoas com pendência
            </div>
            <div className="mt-2 text-3xl font-bold text-slate-950">
              {new Set(visibleRows.map((row) => row.funcionario_id)).size}
            </div>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              <ShieldAlert className="h-4 w-4" /> Pendências críticas
            </div>
            <div className="mt-2 text-3xl font-bold text-red-800">
              {visibleRows.filter((row) => row.critico_operacional).length}
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
              <Bell className="h-4 w-4" /> Avisos já enviados
            </div>
            <div className="mt-2 text-3xl font-bold text-amber-800">
              {visibleRows.reduce((sum, row) => sum + row.avisos_enviados, 0)}
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Evolução do compliance — 90 dias</h2>
              <p className="mt-1 text-xs text-slate-500">
                Histórico real registrado diariamente para o mesmo escopo de setor/função
                selecionado.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <ComplianceTrendChart data={trend.data || []} loading={trend.isLoading} />
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pendências recorrentes
              </h3>
              <div className="space-y-2">
                {recurrentPendings.map((row) => (
                  <div key={rowKey(row)} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">{row.funcionario_nome}</span>
                      <strong className="text-orange-700">{row.avisos_enviados} avisos</strong>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {row.qualificacao_tipo_nome || row.qualificacao_tipo_codigo || 'Treinamento'}{' '}
                      · {complianceStatusLabel(row)}
                    </div>
                  </div>
                ))}
                {!recurrentPendings.length ? (
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    Nenhuma pendência recorrente com duas ou mais cobranças.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-4xl">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                <FileText className="h-4 w-4 text-primary" /> Relatório inteligente
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {buildComplianceNarrative(reportSummary, visibleRows, reportContext)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void exportPdf(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" /> Exportar PDF
              </button>
              <button
                type="button"
                disabled={!setorId || sendManagerReport.isPending}
                onClick={() => sendManagerReport.mutate()}
                title={!setorId ? 'Selecione um setor para enviar ao gestor' : undefined}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Mail className="h-4 w-4" />{' '}
                {sendManagerReport.isPending ? 'Enviando...' : 'Enviar ao gestor'}
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Treinamentos com mais pendências
              </h3>
              <div className="space-y-2">
                {aggregations.trainings.map(([name, count]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span>{name}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
                {!aggregations.trainings.length ? (
                  <p className="text-sm text-emerald-700">Sem pendências.</p>
                ) : null}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Setores que requerem atenção
              </h3>
              <div className="space-y-2">
                {aggregations.sectors.map(([name, count]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span>{name}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
                {!aggregations.sectors.length ? (
                  <p className="text-sm text-emerald-700">Sem pendências.</p>
                ) : null}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pessoas com mais pendências
              </h3>
              <div className="space-y-2">
                {aggregations.people.map(([name, count]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span>{name}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
                {!aggregations.people.length ? (
                  <p className="text-sm text-emerald-700">Sem pendências.</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <PendingFilters
          search={search}
          setSearch={setSearch}
          status={status}
          setStatus={setStatus}
          criticalOnly={criticalOnly}
          setCriticalOnly={setCriticalOnly}
          windowDays={windowDays}
          setWindowDays={setWindowDays}
        />
        <p className="text-xs text-slate-500">
          O PDF e o envio ao gestor respeitam os filtros atualmente aplicados na tela.
        </p>
      </div>
    );
  }

  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selected.has(rowKey(row)));

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <AlertTriangle className="h-4 w-4 text-orange-600" /> Central de pendências
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Fila operacional para identificar, cobrar e acompanhar cada treinamento obrigatório
            pendente.
          </p>
        </div>
        <button
          type="button"
          disabled={!selected.size}
          onClick={() => setNoticeOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Cobrar selecionados ({selected.size})
        </button>
      </div>

      <PendingFilters
        search={search}
        setSearch={setSearch}
        status={status}
        setStatus={setStatus}
        criticalOnly={criticalOnly}
        setCriticalOnly={setCriticalOnly}
        windowDays={windowDays}
        setWindowDays={setWindowDays}
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-3 text-left">
                <input
                  aria-label="Selecionar todas as pendências visíveis"
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) =>
                    setSelected(event.target.checked ? new Set(visibleRows.map(rowKey)) : new Set())
                  }
                />
              </th>
              <SortableComplianceTableHeader
                column="person"
                label="Funcionário"
                sort={pendingSort}
                onSort={(key) => setPendingSort((current) => nextComplianceTableSort(current, key))}
              />
              <SortableComplianceTableHeader
                column="sector"
                label="Setor / função"
                sort={pendingSort}
                onSort={(key) => setPendingSort((current) => nextComplianceTableSort(current, key))}
              />
              <SortableComplianceTableHeader
                column="training"
                label="Treinamento"
                sort={pendingSort}
                onSort={(key) => setPendingSort((current) => nextComplianceTableSort(current, key))}
              />
              <SortableComplianceTableHeader
                column="status"
                label="Situação"
                sort={pendingSort}
                onSort={(key) => setPendingSort((current) => nextComplianceTableSort(current, key))}
              />
              <SortableComplianceTableHeader
                column="notices"
                label="Cobrança"
                sort={pendingSort}
                onSort={(key) => setPendingSort((current) => nextComplianceTableSort(current, key))}
              />
              <th className="px-3 py-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {sortedVisibleRows.map((row) => {
              const key = rowKey(row);
              return (
                <tr key={key} className={row.critico_operacional ? 'bg-red-50/20' : ''}>
                  <td className="px-3 py-3">
                    <input
                      aria-label={`Selecionar ${row.funcionario_nome} — ${row.qualificacao_tipo_nome || 'treinamento'}`}
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={(event) =>
                        setSelected((old) => {
                          const next = new Set(old);
                          if (event.target.checked) next.add(key);
                          else next.delete(key);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5 font-medium text-slate-900">
                      {row.funcionario_nome}
                      {row.critico_operacional ? (
                        <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {row.matricula || 'Sem matrícula'}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    <div>{row.setor_nome || 'Sem setor'}</div>
                    <div className="text-xs text-slate-400">{row.funcao_nome || 'Sem função'}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-800">
                      {row.qualificacao_tipo_nome || row.qualificacao_tipo_codigo || 'Treinamento'}
                    </div>
                    {row.referencia_normativa ? (
                      <div className="mt-0.5 text-xs text-slate-400">
                        {row.referencia_normativa}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadge(row.status_compliance)}`}
                    >
                      {complianceStatusLabel(row)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-xs text-slate-600">
                      {row.avisos_enviados ? `${row.avisos_enviados} aviso(s)` : 'Nenhum aviso'}
                    </div>
                    <div
                      className={`mt-0.5 text-xs ${row.ultimo_status_envio && row.ultimo_status_envio !== 'enviada' ? 'text-red-600' : 'text-slate-400'}`}
                    >
                      {row.ultimo_aviso_em
                        ? `${row.ultimo_status_envio && row.ultimo_status_envio !== 'enviada' ? 'Última tentativa falhou · ' : ''}${formatDateTime(row.ultimo_aviso_em)}`
                        : 'Ainda não cobrado'}
                    </div>
                    <div className="mt-1 flex gap-1">
                      {row.tem_email ? <Mail className="h-3.5 w-3.5 text-slate-400" /> : null}
                      {row.tem_whatsapp ? (
                        <MessageCircle className="h-3.5 w-3.5 text-slate-400" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(new Set([key]));
                        setNoticeOpen(true);
                      }}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {row.avisos_enviados ? 'Reenviar aviso' : 'Enviar aviso'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!pendings.isLoading && !visibleRows.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  Nenhuma pendência encontrada para os filtros atuais.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {noticeOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900">Enviar cobrança de treinamento</h3>
                <p className="mt-1 text-sm text-slate-500">Revise o alcance e escolha os canais.</p>
              </div>
              <button
                type="button"
                onClick={() => setNoticeOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
              <div>
                <span className="text-slate-500">Selecionados</span>
                <strong className="ml-2">
                  {preview.data?.selecionados ?? selectedRows.length}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Vencidos</span>
                <strong className="ml-2 text-red-700">{preview.data?.vencidos ?? '—'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Com e-mail</span>
                <strong className="ml-2">{preview.data?.com_email ?? '—'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Com WhatsApp</span>
                <strong className="ml-2">{preview.data?.com_whatsapp ?? '—'}</strong>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <input
                  type="checkbox"
                  checked={noticeChannels.email}
                  onChange={(event) =>
                    setNoticeChannels((old) => ({ ...old, email: event.target.checked }))
                  }
                />
                <Mail className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium">E-mail</span>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <input
                  type="checkbox"
                  checked={noticeChannels.whatsapp}
                  onChange={(event) =>
                    setNoticeChannels((old) => ({ ...old, whatsapp: event.target.checked }))
                  }
                />
                <MessageCircle className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium">WhatsApp</span>
              </label>
            </div>
            {preview.data?.sem_email || preview.data?.sem_whatsapp ? (
              <p className="mt-3 text-xs text-amber-700">
                Sem contato: {preview.data?.sem_email || 0} sem e-mail ·{' '}
                {preview.data?.sem_whatsapp || 0} sem WhatsApp. Os demais canais válidos continuarão
                sendo enviados.
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoticeOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  sendNotices.isPending || (!noticeChannels.email && !noticeChannels.whatsapp)
                }
                onClick={() => sendNotices.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {sendNotices.isPending ? 'Enviando...' : 'Enviar cobrança'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ComplianceTrendChart({
  data,
  loading,
}: {
  data: ComplianceTrendPoint[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex min-h-52 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
        Carregando tendência...
      </div>
    );
  }
  const valid = data.filter((point) => point.compliance_pct != null);
  if (!valid.length) {
    return (
      <div className="flex min-h-52 items-center justify-center rounded-xl bg-slate-50 px-6 text-center text-sm text-slate-500">
        Ainda não há dados suficientes para a série histórica.
      </div>
    );
  }
  const width = 640;
  const height = 210;
  const left = 34;
  const right = 16;
  const top = 18;
  const bottom = 32;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const points = valid.map((point, index) => {
    const x =
      left + (valid.length === 1 ? plotWidth / 2 : (index / (valid.length - 1)) * plotWidth);
    const y = top + (1 - Number(point.compliance_pct) / 100) * plotHeight;
    return { ...point, x, y };
  });
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  const first = valid[0].compliance_pct;
  const last = valid[valid.length - 1].compliance_pct;
  const delta = first == null || last == null ? null : Math.round((last - first) * 10) / 10;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {valid.length > 1
            ? `${valid[0].snapshot_date.split('-').reverse().join('/')} → ${valid[valid.length - 1].snapshot_date.split('-').reverse().join('/')}`
            : 'Primeiro snapshot registrado hoje'}
        </span>
        <span className="font-semibold text-slate-700">
          Atual: {last == null ? '—' : `${last}%`}
          {delta != null && valid.length > 1 ? ` · ${delta >= 0 ? '+' : ''}${delta} p.p.` : ''}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-52 w-full"
        role="img"
        aria-label="Evolução percentual do compliance de treinamentos"
      >
        {[0, 50, 100].map((value) => {
          const y = top + (1 - value / 100) * plotHeight;
          return (
            <g key={value}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                className="stroke-slate-200"
                strokeWidth="1"
              />
              <text x={left - 6} y={y + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
                {value}%
              </text>
            </g>
          );
        })}
        {valid.length > 1 ? (
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-primary"
          />
        ) : null}
        {points.map((point) => (
          <g key={point.snapshot_date}>
            <circle cx={point.x} cy={point.y} r="4" fill="currentColor" className="text-primary" />
            <title>{`${point.snapshot_date}: ${point.compliance_pct}% · ${point.pessoas_com_pendencia} pessoa(s) com pendência`}</title>
          </g>
        ))}
      </svg>
      {valid.length === 1 ? (
        <p className="mt-1 text-center text-xs text-slate-500">
          A linha de evolução será formada automaticamente à medida que os snapshots diários forem
          registrados.
        </p>
      ) : null}
    </div>
  );
}

function PendingFilters({
  search,
  setSearch,
  status,
  setStatus,
  criticalOnly,
  setCriticalOnly,
  windowDays,
  setWindowDays,
}: {
  search: string;
  setSearch: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  criticalOnly: boolean;
  setCriticalOnly: (value: boolean) => void;
  windowDays: string;
  setWindowDays: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 md:grid-cols-[minmax(220px,1fr)_180px_150px_auto]">
      <label className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar pessoa, setor ou treinamento"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm"
        />
      </label>
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value="TODAS">Todas as situações</option>
        <option value="VENCIDO">Vencidos</option>
        <option value="NAO_REALIZADO">Nunca realizou</option>
        <option value="VENCENDO">Vencendo</option>
        <option value="EM_ANDAMENTO">Em andamento</option>
      </select>
      <select
        value={windowDays}
        onChange={(event) => setWindowDays(event.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value="">Todos os prazos</option>
        <option value="7">Até 7 dias</option>
        <option value="15">Até 15 dias</option>
        <option value="30">Até 30 dias</option>
      </select>
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={criticalOnly}
          onChange={(event) => setCriticalOnly(event.target.checked)}
        />{' '}
        Só críticos
      </label>
    </div>
  );
}

export function TrainingComplianceNotificationSettings() {
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/30 p-4">
      <div className="flex items-start gap-3">
        <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <h3 className="font-semibold text-slate-900">Alertas automáticos centralizados</h3>
          <p className="mt-1 text-sm text-slate-600">
            O módulo de Compliance não mantém uma régua automática paralela. Os alertas de
            treinamento usam exclusivamente a régua de qualificações: CHECK para gestores em
            45/30/15/7 dias e funcionário em 30/15/7 dias, com processamento diário às 05:00
            (horário de Brasília).
          </p>
          <p className="mt-2 text-xs text-slate-500">
            As cobranças manuais desta tela continuam disponíveis e os snapshots diários de
            compliance continuam sendo atualizados para relatórios e tendências.
          </p>
        </div>
      </div>
    </section>
  );
}
