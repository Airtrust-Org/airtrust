import { useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Search, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import { useApi } from '@/react-app/hooks/useApi';
import { useDebounce } from '@/react-app/hooks/useDebounce';
import { LmsModuleTabs, LmsPageShell } from './lms/lmsUi';

type EnrollmentInProgress = {
  id: number;
  curso_id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_matricula: string | null;
  curso_titulo: string;
  progresso_efetivo: number | null;
  data_matricula: string | null;
  data_expiracao: string | null;
};

type InProgressResponse = {
  success: true;
  data: EnrollmentInProgress[];
  pagination: { page: number; limit: number; total: number };
};

const PAGE_SIZE = 50;

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

export default function LmsEmAndamento() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search.trim(), 300);
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (debouncedSearch) params.set('q', debouncedSearch);
  const { data, loading, error, refetch } = useApi<InProgressResponse>(
    `/api/lms/matriculas/em-andamento?${params.toString()}`,
    { preserveEnvelope: true, staleTime: 15_000 },
  );
  const rows = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <AppLayout>
      <LmsPageShell>
        <PageHeader
          className="mb-6"
          title="Cursos em andamento"
          subtitle="Veja em uma única lista os funcionários com cursos atualmente em andamento."
          actions={
            <button
              type="button"
              onClick={() => navigate('/lms/matriculas')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Matrículas por curso
            </button>
          }
        />

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <LmsModuleTabs canManage />
          <div className="p-5 sm:p-6">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Matrículas em andamento
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {total} matrícula{total === 1 ? '' : 's'} em andamento
                </p>
              </div>
              <div className="flex gap-2">
                <label className="relative block min-w-0 flex-1 sm:w-80 sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => updateSearch(event.target.value)}
                    placeholder="Buscar funcionário ou curso"
                    aria-label="Buscar funcionário ou curso"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-900"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  aria-label="Atualizar lista"
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {error ? (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                Não foi possível carregar as matrículas: {error}
              </div>
            ) : loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-slate-300 dark:text-slate-600" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {debouncedSearch ? 'Nenhuma matrícula encontrada para essa busca.' : 'Nenhum curso em andamento no momento.'}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  A lista reúne matrículas de todos os cursos dentro do seu escopo de acesso.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Funcionário</th>
                        <th className="px-4 py-3">Curso</th>
                        <th className="px-4 py-3">Progresso</th>
                        <th className="hidden px-4 py-3 md:table-cell">Início</th>
                        <th className="hidden px-4 py-3 lg:table-cell">Prazo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {rows.map((row) => {
                        const progress = Math.max(0, Math.min(100, Math.round(row.progresso_efetivo ?? 0)));
                        return (
                          <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-4 py-3">
                              <FuncionarioLink
                                funcionarioId={row.funcionario_id}
                                nome={row.funcionario_nome || `ID ${row.funcionario_id}`}
                                className="font-medium text-slate-900 dark:text-slate-100"
                              />
                              {row.funcionario_matricula && (
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  Matrícula {row.funcionario_matricula}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => navigate(`/lms/matriculas/${row.curso_id}`)}
                                className="text-left font-medium text-blue-700 hover:underline dark:text-blue-300"
                              >
                                {row.curso_titulo}
                              </button>
                            </td>
                            <td className="min-w-36 px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
                                </div>
                                <span className="w-10 text-right text-xs text-slate-600 dark:text-slate-300">{progress}%</span>
                              </div>
                            </td>
                            <td className="hidden px-4 py-3 text-slate-600 dark:text-slate-300 md:table-cell">
                              {formatDate(row.data_matricula)}
                            </td>
                            <td className="hidden px-4 py-3 text-slate-600 dark:text-slate-300 lg:table-cell">
                              {formatDate(row.data_expiracao)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <span>Página {page} de {pageCount}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                    >
                      <ChevronLeft className="h-4 w-4" /> Anterior
                    </button>
                    <button
                      type="button"
                      disabled={page >= pageCount}
                      onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                    >
                      Próxima <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </LmsPageShell>
    </AppLayout>
  );
}
