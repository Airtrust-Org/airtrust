import { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Loader2,
  Search,
  User,
  X,
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { LmsModuleTabs, LmsPageShell, LmsSummaryTag } from './lmsUi';
import {
  useLmsHistoricoEdApp,
  useLmsEdappLegacySummary,
  type LmsHistoricoEdApp,
} from '@/react-app/hooks/useLms';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  CONCLUIDO: { label: 'Concluído', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  EM_ANDAMENTO: { label: 'Em Andamento', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  NAO_INICIADO: {
    label: 'Não Iniciado',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  PENDENTE_VINCULO: {
    label: 'Pendente Vínculo',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const MATCH_LABELS: Record<string, string> = {
  email: 'e-mail',
  matricula: 'matrícula',
  cpf: 'CPF',
  nome: 'nome',
  edapp_user_id: 'ID EdApp',
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_LABELS[status] ?? {
    label: status,
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function formatDate(str: string | null | undefined) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('pt-BR');
}

function formatDatetime(str: string | null | undefined) {
  if (!str) return '—';
  const d = new Date(str);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function LmsHistoricoEdApp() {
  const navigate = useNavigate();
  const { isAdmin, isGestor } = usePermissions();
  const canManage = isAdmin || isGestor;

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  if (!canManage) {
    return <Navigate to="/lms/dashboard" replace />;
  }

  const { data: summary } = useLmsEdappLegacySummary(canManage);
  const { data, isLoading } = useLmsHistoricoEdApp({
    q: q || undefined,
    status: statusFilter || undefined,
    page,
    limit: LIMIT,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / LIMIT);

  function exportCsv() {
    if (!rows.length) return;
    const header =
      'Funcionário,Matrícula,Função,Curso EdApp,Status,Progresso %,Score,Qualif. Código,Conclusão,ID EdApp User,ID EdApp Course';
    const lines = rows.map(
      (r: LmsHistoricoEdApp) =>
        `"${r.funcionario_nome ?? ''}","${r.funcionario_matricula ?? ''}","${r.funcionario_funcao ?? ''}","${r.curso_titulo ?? ''}",${r.status},${r.progresso_pct ?? ''},"${r.score_final ?? ''}","${r.qualificacao_codigo ?? ''}","${formatDate(r.data_conclusao)}","${r.edapp_user_id ?? ''}","${r.edapp_course_id ?? ''}"`,
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `edapp-historico-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function handleSearch(value: string) {
    setQ(value);
    setPage(1);
  }

  function handleStatus(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <AppLayout>
      <LmsPageShell>
        <PageHeader
          className="mb-6"
          title="Legado EdApp (somente histórico)"
          subtitle="Registro histórico preservado de conclusões e progressos vindos do EdApp para auditoria e compliance."
          actions={
            <>
              <button
                onClick={exportCsv}
                disabled={rows.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar CSV
              </button>
              <button
                onClick={() => navigate('/lms/dashboard')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Voltar ao painel
              </button>
            </>
          }
        />

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <LmsModuleTabs canManage={canManage} />

          <div className="space-y-5 p-5 sm:p-6">
            {/* Resumo stats */}
            {summary && (
              <div className="flex flex-wrap gap-2">
                <LmsSummaryTag
                  label="Total importado"
                  value={summary.total_importado}
                  icon={<BookOpen className="h-4 w-4" />}
                  tone="sky"
                />
                <LmsSummaryTag
                  label="Funcionários"
                  value={summary.total_funcionarios}
                  icon={<User className="h-4 w-4" />}
                  tone="sky"
                />
                <LmsSummaryTag
                  label="Cursos EdApp"
                  value={summary.total_cursos}
                  icon={<BookOpen className="h-4 w-4" />}
                  tone="sky"
                />
                <LmsSummaryTag
                  label="Com qualificação"
                  value={summary.total_com_qualificacao}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  tone="emerald"
                />
                {summary.total_pendentes_vinculo > 0 && (
                  <LmsSummaryTag
                    label="Pendentes vínculo"
                    value={summary.total_pendentes_vinculo}
                    icon={<AlertTriangle className="h-4 w-4" />}
                    tone="rose"
                  />
                )}
                {summary.ultima_conclusao_em && (
                  <LmsSummaryTag
                    label="Última conclusão"
                    value={formatDate(summary.ultima_conclusao_em)}
                    icon={<Clock className="h-4 w-4" />}
                    tone="slate"
                  />
                )}
              </div>
            )}

            {/* Aviso compliance */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Esta tela é <strong>somente histórica</strong>. A integração ativa com EdApp foi
                descontinuada e os registros preservados aqui são imutáveis para evidência de
                treinamento. Use a aba <strong>Relatórios</strong> para análises operacionais atuais
                do LMS.
              </p>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Buscar por funcionário ou curso..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                {q && (
                  <button
                    onClick={() => handleSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <select
                value={statusFilter}
                onChange={(e) => handleStatus(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="">Todos os status</option>
                <option value="CONCLUIDO">Concluído</option>
                <option value="EM_ANDAMENTO">Em Andamento</option>
                <option value="NAO_INICIADO">Não Iniciado</option>
                <option value="PENDENTE_VINCULO">Pendente Vínculo</option>
              </select>

              <p className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                {total.toLocaleString('pt-BR')} registro{total !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Tabela */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-700 dark:bg-slate-900">
              {isLoading ? (
                <div className="flex justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-300 dark:text-slate-600" />
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-12 text-center">
                  <BookOpen className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {q || statusFilter
                      ? 'Nenhum registro encontrado para os filtros aplicados.'
                      : 'Nenhum histórico EdApp importado ainda.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide dark:bg-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="px-6 py-3 text-left">Funcionário</th>
                        <th className="px-4 py-3 text-left">Curso EdApp</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Progresso</th>
                        <th className="px-4 py-3 text-right">Score</th>
                        <th className="px-4 py-3 text-left">Qualificação</th>
                        <th className="px-4 py-3 text-left">Conclusão</th>
                        <th className="px-4 py-3 text-left">Vínculo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {rows.map((row: LmsHistoricoEdApp) => (
                        <tr key={row.id} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/50">
                          <td className="px-6 py-3">
                            {row.funcionario_id ? (
                              <button
                                onClick={() =>
                                  navigate(`/funcionarios/${row.funcionario_id}/ficha`)
                                }
                                className="text-left group"
                              >
                                <p className="font-medium text-slate-900 group-hover:text-primary transition-colors dark:text-slate-100">
                                  {row.funcionario_nome ?? '—'}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {row.funcionario_matricula ?? ''}
                                  {row.funcionario_funcao ? ` · ${row.funcionario_funcao}` : ''}
                                </p>
                              </button>
                            ) : (
                              <div>
                                <p className="font-medium text-rose-700 dark:text-rose-300">
                                  {row.funcionario_nome ?? '—'}
                                </p>
                                <p className="text-xs text-rose-400 dark:text-rose-500">Não vinculado</p>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800 leading-snug dark:text-slate-200">
                              {row.curso_titulo ?? '—'}
                            </p>
                            {row.curso_categoria && (
                              <p className="text-xs text-slate-400">{row.curso_categoria}</p>
                            )}
                            {row.edapp_course_id && (
                              <p className="text-xs text-slate-400 font-mono dark:text-slate-500">
                                ID: {row.edapp_course_id}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {row.progresso_pct != null ? (
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                  {row.progresso_pct}%
                                </span>
                                <div className="w-16 bg-slate-200 rounded-full h-1 dark:bg-slate-700">
                                  <div
                                    className="h-1 rounded-full bg-primary"
                                    style={{ width: `${Math.min(row.progresso_pct, 100)}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {row.score_final != null ? `${row.score_final}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {row.qualificacao_codigo ? (
                              <div>
                                <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                                  {row.qualificacao_codigo}
                                </span>
                                {row.qualificacao_historico_id && (
                                  <p className="mt-0.5 text-xs text-emerald-600">✓ Gerada</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">
                            {formatDate(row.data_conclusao)}
                            {row.completed_at && row.completed_at !== row.data_conclusao && (
                              <p className="text-slate-400">{formatDatetime(row.completed_at)}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {row.funcionario_match_type ? (
                              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                                via{' '}
                                {MATCH_LABELS[row.funcionario_match_type] ??
                                  row.funcionario_match_type}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Paginação */}
            {pages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Página {page} de {pages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page >= pages}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </LmsPageShell>
    </AppLayout>
  );
}
