import { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { useLmsConformidade, useLmsExpiracoes } from '@/react-app/hooks/useLms';
import { LmsModuleTabs, LmsPageShell, LmsSummaryTag } from './lmsUi';

function getConformidadeColor(pct: number): string {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}

function getConformidadeTextColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-700';
  if (pct >= 50) return 'text-amber-700';
  return 'text-rose-700';
}

function getConformidadeBg(pct: number): string {
  if (pct >= 80) return 'bg-emerald-50 border-emerald-200';
  if (pct >= 50) return 'bg-amber-50 border-amber-200';
  return 'bg-rose-50 border-rose-200';
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('pt-BR');
}

const DIAS_OPTIONS = [7, 15, 30, 60, 90];

export default function LmsRelatorios() {
  const navigate = useNavigate();
  const { isAdmin, isGestor } = usePermissions();
  const canManage = isAdmin || isGestor;
  const [tab, setTab] = useState<'conformidade' | 'expiracoes'>('conformidade');
  const [dias, setDias] = useState(30);

  const { data: conformidade, isLoading: loadingConformidade } = useLmsConformidade();
  const { data: expiracoes, isLoading: loadingExpiracoes } = useLmsExpiracoes(dias);

  const totalFuncionarios = conformidade?.reduce((sum, r) => sum + r.total_funcionarios, 0) ?? 0;
  const totalMatriculados = conformidade?.reduce((sum, r) => sum + r.matriculados, 0) ?? 0;
  const totalConcluidos = conformidade?.reduce((sum, r) => sum + r.concluidos, 0) ?? 0;
  const taxaGeral =
    totalMatriculados > 0 ? Math.round((totalConcluidos / totalMatriculados) * 100) : 0;

  function exportConformidadeCsv() {
    if (!conformidade) return;
    const lines = [
      'Função,Total Funcionários,Matriculados,Concluídos,Em Andamento,Não Iniciados,Reprovados,Taxa Conclusão %',
      ...conformidade.map(
        (r) =>
          `"${r.funcao}",${r.total_funcionarios},${r.matriculados},${r.concluidos},${r.em_andamento},${r.nao_iniciados},${r.reprovados},${r.taxa_conclusao_pct}`,
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lms-conformidade-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function exportExpiracoesCsv() {
    if (!expiracoes) return;
    const lines = [
      'Funcionário,Função,Base,Curso,Status,Expiração,Dias Restantes,Progresso %',
      ...expiracoes.map(
        (r) =>
          `"${r.funcionario_nome}","${r.funcao ?? ''}","${r.base ?? ''}","${r.curso_titulo}",${r.status},${r.data_expiracao},${r.dias_restantes},${r.progresso_pct}`,
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lms-expiracoes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <AppLayout>
      <LmsPageShell>
        <PageHeader
          className="mb-6"
          title="Relatórios LMS"
          subtitle="Acompanhe a conformidade de treinamentos por função e alerte sobre prazos vencendo."
          actions={
            <>
              <button
                onClick={() =>
                  tab === 'conformidade' ? exportConformidadeCsv() : exportExpiracoesCsv()
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar CSV
              </button>
              <button
                onClick={() => navigate('/lms/dashboard')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Voltar ao painel
              </button>
            </>
          }
        />
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <LmsModuleTabs canManage={canManage} />
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap gap-2">
              <LmsSummaryTag
                label="Total funcionários"
                value={totalFuncionarios}
                icon={<Users className="h-4 w-4" />}
                tone="sky"
              />
              <LmsSummaryTag
                label="Conclusões totais"
                value={totalConcluidos}
                icon={<CheckCircle2 className="h-4 w-4" />}
                tone="emerald"
              />
              <LmsSummaryTag
                label="Taxa geral"
                value={`${taxaGeral}%`}
                icon={<BarChart3 className="h-4 w-4" />}
                tone={taxaGeral >= 80 ? 'emerald' : taxaGeral >= 50 ? 'amber' : 'rose'}
              />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm w-fit">
              <button
                onClick={() => setTab('conformidade')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  tab === 'conformidade'
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Conformidade por Função
              </button>
              <button
                onClick={() => setTab('expiracoes')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  tab === 'expiracoes'
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Prazos Vencendo
              </button>
            </div>

            {/* Conformidade table */}
            {tab === 'conformidade' && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Conformidade por Função
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Vermelho indica exposição imediata, amarelo atenção e verde aderência
                      saudável.
                    </p>
                  </div>
                  <button
                    onClick={exportConformidadeCsv}
                    disabled={!conformidade || conformidade.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Exportar CSV
                  </button>
                </div>

                {loadingConformidade ? (
                  <div className="flex justify-center p-10">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                  </div>
                ) : !conformidade || conformidade.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 p-10 text-center">
                    <BarChart3 className="h-10 w-10 text-slate-300" />
                    <p className="text-sm text-slate-500">Sem dados de conformidade disponíveis.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                        <tr>
                          <th className="px-6 py-3 text-left">Função</th>
                          <th className="px-4 py-3 text-right">Funcionários</th>
                          <th className="px-4 py-3 text-right">Matriculados</th>
                          <th className="px-4 py-3 text-right">Concluídos</th>
                          <th className="px-4 py-3 text-right">Em Andamento</th>
                          <th className="px-4 py-3 text-right">Não Iniciados</th>
                          <th className="px-6 py-3 text-left">Taxa Conclusão</th>
                          <th className="px-6 py-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {conformidade.map((row) => (
                          <tr key={row.funcao} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 font-medium text-slate-900">{row.funcao}</td>
                            <td className="px-4 py-4 text-right text-slate-600">
                              {row.total_funcionarios}
                            </td>
                            <td className="px-4 py-4 text-right text-slate-600">
                              {row.matriculados}
                            </td>
                            <td className="px-4 py-4 text-right text-emerald-700 font-medium">
                              {row.concluidos}
                            </td>
                            <td className="px-4 py-4 text-right text-amber-700">
                              {row.em_andamento}
                            </td>
                            <td className="px-4 py-4 text-right text-slate-500">
                              {row.nao_iniciados}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-24 bg-slate-200 rounded-full h-1.5 flex-shrink-0">
                                  <div
                                    className={`h-1.5 rounded-full ${getConformidadeColor(row.taxa_conclusao_pct)}`}
                                    style={{ width: `${Math.min(row.taxa_conclusao_pct, 100)}%` }}
                                  />
                                </div>
                                <span
                                  className={`text-xs font-semibold ${getConformidadeTextColor(row.taxa_conclusao_pct)}`}
                                >
                                  {row.taxa_conclusao_pct}%
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(`/funcionarios?funcao=${encodeURIComponent(row.funcao)}`)
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                <Users className="h-3.5 w-3.5" />
                                Ver tripulantes
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Expirações table */}
            {tab === 'expiracoes' && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-slate-900">Prazos Vencendo</h2>
                    <select
                      value={dias}
                      onChange={(e) => setDias(Number(e.target.value))}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
                    >
                      {DIAS_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          Próximos {d} dias
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={exportExpiracoesCsv}
                    disabled={!expiracoes || expiracoes.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Exportar CSV
                  </button>
                </div>

                {loadingExpiracoes ? (
                  <div className="flex justify-center p-10">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                  </div>
                ) : !expiracoes || expiracoes.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 p-10 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-300" />
                    <p className="text-sm text-slate-500">
                      Nenhuma matrícula expirando nos próximos {dias} dias.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                        <tr>
                          <th className="px-6 py-3 text-left">Funcionário</th>
                          <th className="px-4 py-3 text-left">Função</th>
                          <th className="px-4 py-3 text-left">Base</th>
                          <th className="px-4 py-3 text-left">Curso</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-right">Prazo</th>
                          <th className="px-4 py-3 text-right">Dias</th>
                          <th className="px-6 py-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {expiracoes.map((row) => (
                          <tr
                            key={row.matricula_id}
                            className={`hover:bg-slate-50 transition-colors ${
                              row.dias_restantes < 0 ? 'bg-rose-50/40' : ''
                            }`}
                          >
                            <td className="px-6 py-3 font-medium text-slate-900">
                              <FuncionarioLink
                                funcionarioId={row.funcionario_id}
                                nome={row.funcionario_nome}
                                className="hover:text-primary hover:underline"
                              />
                            </td>
                            <td className="px-4 py-3 text-slate-600">{row.funcao ?? '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{row.base ?? '—'}</td>
                            <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">
                              {row.curso_titulo}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                  row.status === 'EM_ANDAMENTO'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {row.status === 'EM_ANDAMENTO' ? 'Em andamento' : 'Não iniciado'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600">
                              {formatDate(row.data_expiracao)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`font-medium ${row.dias_restantes < 0 ? 'text-rose-700' : row.dias_restantes <= 7 ? 'text-amber-700' : 'text-slate-600'}`}
                              >
                                {row.dias_restantes < 0
                                  ? `${Math.abs(row.dias_restantes)}d atrasado`
                                  : `${row.dias_restantes}d restantes`}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(
                                      `/funcionarios/${row.funcionario_id}/ficha?tab=treinamentos`,
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  Ficha 360
                                </button>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/lms/cursos/${row.curso_id}`)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Abrir curso
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </LmsPageShell>
    </AppLayout>
  );
}
