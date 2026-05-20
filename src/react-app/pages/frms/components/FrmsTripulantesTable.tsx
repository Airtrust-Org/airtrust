/**
 * FrmsTripulantesTable — Tabela escalável de tripulantes com ordenação e paginação
 */
import { Fragment, Suspense, lazy, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, ChevronDown, Download, ArrowUp, ArrowDown } from 'lucide-react';
import { useFrmsFilters } from './FrmsFilterContext';
import type { FrmsFrotaRow } from '@/react-app/hooks/useFrms';
import { useFrmsJornadasEffectiveness } from '@/react-app/hooks/useFrms';
import type { FrmsEffectivenessJornadaRow } from '@/react-app/hooks/useFrms';
import FrmsJornadaEffectivenessCard from './FrmsJornadaEffectivenessCard';
import {
  getFrmsNivelWeight,
  resolveFrmsDashboardNivelCompleto,
  getComplianceBg,
  getEffectivenessBg,
  getMonthRange,
} from '../frmsUtils';
import { applyFrmsFrotaFilters } from '../frmsFilterUtils';

const FrmsComponentesChart = lazy(() => import('./FrmsComponentesChart'));

// ── Helpers ──────────────────────────

function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function nivelBadge(nivel: string) {
  const styles: Record<string, string> = {
    OK: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30',
    ATENCAO:
      'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-200 dark:border-yellow-500/30',
    CRITICO:
      'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-200 dark:border-orange-500/30',
    VIOLACAO: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/30',
  };
  const labels: Record<string, string> = {
    OK: 'Normal',
    ATENCAO: 'Atenção',
    AVISO: 'Atenção',
    CRITICO: 'Crítico',
    VIOLACAO: 'Violação',
  };
  const key = nivel === 'AVISO' ? 'ATENCAO' : nivel;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${styles[key] || styles.OK}`}
    >
      {labels[key] || key}
    </span>
  );
}

function ProgressBarCompact({ pct, colorClass }: { pct: number; colorClass?: string }) {
  const clamped = Math.min(pct, 120);
  const bg = colorClass || 'bg-slate-400';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-1.5 rounded-full ${bg} transition-all`}
          style={{ width: `${Math.min(clamped, 100)}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">{pct.toFixed(1)}%</span>
    </div>
  );
}

// ── Tipos de ordenação ──────────────

type SortCol = 'nome' | 'pct' | 'status' | 'hv7d' | 'hv28d';
type SortDir = 'asc' | 'desc';

// ── Component ──────────────────────

interface Props {
  frota: FrmsFrotaRow[];
  loading?: boolean;
  alertNivelByTripulante?: Record<string, string>;
  config?: Partial<Record<string, number>> | null;
}

const PAGE_SIZE = 20;

// ── Expanded row panel ────────────────────────────────────────────────────────

function ExpandedPanel({
  tripulanteId,
  frotaRow,
  config,
}: {
  tripulanteId: string;
  frotaRow: FrmsFrotaRow;
  config: Partial<Record<string, number>> | null;
}) {
  const { filters, isMonthMode, periodoNumDias } = useFrmsFilters();
  const monthRange = isMonthMode ? getMonthRange(filters.mesReferencia) : null;
  const range = monthRange ? { inicio: monthRange.start, fim: monthRange.end } : undefined;
  const diasConsulta = monthRange ? monthRange.daysInMonth : periodoNumDias;

  const { data: jornadasRaw, loading: loadingJ } = useFrmsJornadasEffectiveness(
    tripulanteId,
    diasConsulta,
    range,
  );
  const jornadas: FrmsEffectivenessJornadaRow[] = Array.isArray(jornadasRaw)
    ? (jornadasRaw as FrmsEffectivenessJornadaRow[])
    : [];

  const componentes = useMemo(() => {
    return frotaRow.effectiveness_componentes ?? null;
  }, [frotaRow.effectiveness_componentes]);

  return (
    <tr>
      <td colSpan={8} className="border-b border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/70">
        {loadingJ ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">Carregando jornadas...</p>
        ) : (
          <div className="flex flex-wrap gap-4 items-start">
            <div className="flex-1 min-w-[360px]">
              <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                {jornadas.length} jornada(s) no período selecionado
              </p>
              {jornadas.length > 0 ? (
                <div className="flex flex-wrap gap-4 max-h-[560px] overflow-y-auto pr-1">
                  {jornadas.map((j, index) => (
                    <FrmsJornadaEffectivenessCard
                      key={j.id}
                      jornada={j}
                      nextJornada={jornadas[index + 1] ?? null}
                      config={config}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500">Sem jornadas no período selecionado.</p>
              )}
            </div>
            {componentes && (
              <Suspense
                fallback={
                  <div className="h-48 w-[320px] rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
                }
              >
                <FrmsComponentesChart
                  componentes={componentes}
                  config={config}
                  tripulante={frotaRow.nome_guerra || frotaRow.nome}
                />
              </Suspense>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export default function FrmsTripulantesTable({
  frota,
  loading,
  alertNivelByTripulante = {},
  config = null,
}: Props) {
  const navigate = useNavigate();
  const { filters, isMonthMode } = useFrmsFilters();
  const [sortCol, setSortCol] = useState<SortCol>('pct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
    setPage(1);
  };

  const filteredSorted = useMemo(() => {
    const data = applyFrmsFrotaFilters(frota, filters, {
      alertNivelByTripulante,
      config,
      applyQuinzenaClientFilter: !isMonthMode,
    });

    // Sort
    data.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case 'nome':
          cmp = (a.nome_guerra || a.nome).localeCompare(b.nome_guerra || b.nome);
          break;
        case 'pct':
          cmp = Math.max(a.pct_mes, a.pct_7d) - Math.max(b.pct_mes, b.pct_7d);
          break;
        case 'hv7d':
          cmp = a.hv_7d_min - b.hv_7d_min;
          break;
        case 'hv28d':
          cmp = a.hv_mes_min - b.hv_mes_min;
          break;
        case 'status': {
          cmp =
            getFrmsNivelWeight(
              resolveFrmsDashboardNivelCompleto({
                effectivenessPct: a.effectiveness_pct ?? null,
                maxCompliancePct: Math.max(a.pct_mes, a.pct_7d, a.pct_dia, a.pct_365d),
                alertNivel: alertNivelByTripulante[a.tripulante_id],
                config,
              }),
            ) -
            getFrmsNivelWeight(
              resolveFrmsDashboardNivelCompleto({
                effectivenessPct: b.effectiveness_pct ?? null,
                maxCompliancePct: Math.max(b.pct_mes, b.pct_7d, b.pct_dia, b.pct_365d),
                alertNivel: alertNivelByTripulante[b.tripulante_id],
                config,
              }),
            );
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return data;
  }, [alertNivelByTripulante, config, frota, filters, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const pageData = filteredSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCSV = () => {
    const headers = [
      'Nome',
      'Compliance %',
      'Efetividade %',
      'Status',
      'HV 7d',
      'HV 28d',
      'HV 365d',
    ];
    const rows = filteredSorted.map((r) => {
      const pctMax = Math.max(r.pct_mes, r.pct_7d, r.pct_dia).toFixed(1);
      const nivel = resolveFrmsDashboardNivelCompleto({
        effectivenessPct: r.effectiveness_pct ?? null,
        maxCompliancePct: Number(pctMax),
        alertNivel: alertNivelByTripulante[r.tripulante_id],
        config,
      });
      return [
        r.nome,
        pctMax,
        r.effectiveness_pct != null ? r.effectiveness_pct.toFixed(1) : '',
        nivel,
        formatMin(r.hv_7d_min),
        formatMin(r.hv_mes_min),
        formatMin(r.hv_365d_min),
      ];
    });
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frms-tripulantes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ArrowDown className="h-3 w-3 text-slate-300" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-blue-600" />
    ) : (
      <ArrowDown className="h-3 w-3 text-blue-600" />
    );
  };

  const rowBorder = (nivel: string) => {
    if (nivel === 'VIOLACAO')
      return 'bg-red-50/50 border-l-2 border-l-red-500 dark:bg-red-500/12 dark:border-l-red-500/80';
    if (nivel === 'CRITICO')
      return 'bg-orange-50/50 border-l-2 border-l-orange-500 dark:bg-orange-500/12 dark:border-l-orange-500/80';
    if (nivel === 'ATENCAO' || nivel === 'AVISO')
      return 'bg-yellow-50/30 border-l-2 border-l-yellow-400 dark:bg-yellow-500/10 dark:border-l-yellow-500/80';
    return '';
  };

  return (
    <div
      className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      data-testid="frms-tabela-tripulantes"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-100">
            Tripulantes
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Exibindo {(page - 1) * PAGE_SIZE + 1}-
            {Math.min(page * PAGE_SIZE, filteredSorted.length)} de {filteredSorted.length}
          </p>
        </div>
        <button
          data-testid="frms-tabela-btn-exportar"
          onClick={exportCSV}
          className="flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium
                     text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/80">
              <th
                className="px-6 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer"
                onClick={() => toggleSort('nome')}
              >
                <span className="flex items-center gap-1">
                  Tripulante <SortIcon col="nome" />
                </span>
              </th>
              <th
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer"
                onClick={() => toggleSort('pct')}
              >
                <span className="flex items-center gap-1">
                  Compliance % <SortIcon col="pct" />
                </span>
              </th>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Efetividade
              </th>
              <th
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer"
                onClick={() => toggleSort('status')}
              >
                <span className="flex items-center gap-1">
                  Status <SortIcon col="status" />
                </span>
              </th>
              <th
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer text-right"
                onClick={() => toggleSort('hv7d')}
              >
                <span className="flex items-center justify-end gap-1">
                  7 dias <SortIcon col="hv7d" />
                </span>
              </th>
              <th
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer text-right"
                onClick={() => toggleSort('hv28d')}
              >
                <span className="flex items-center justify-end gap-1">
                  {isMonthMode ? 'Mês' : '28 dias'} <SortIcon col="hv28d" />
                </span>
              </th>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">
                365 dias
              </th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                  Carregando...
                </td>
              </tr>
            ) : pageData.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                  Nenhum tripulante encontrado
                </td>
              </tr>
            ) : (
              pageData.map((row) => {
                const pctMax = Math.max(row.pct_mes, row.pct_7d, row.pct_dia);
                const nivel = resolveFrmsDashboardNivelCompleto({
                  effectivenessPct: row.effectiveness_pct ?? null,
                  maxCompliancePct: pctMax,
                  alertNivel: alertNivelByTripulante[row.tripulante_id],
                  config,
                });
                const isExpanded = expandedId === row.tripulante_id;
                return (
                  <Fragment key={row.tripulante_id}>
                    <tr
                      data-testid={`frms-tabela-row-${row.tripulante_id}`}
                      className={`cursor-pointer transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/60 ${rowBorder(nivel)}`}
                      onClick={() => {
                        const mesParam = isMonthMode
                          ? `?mes=${encodeURIComponent(filters.mesReferencia)}`
                          : '';
                        navigate(`/frms/tripulante/${row.tripulante_id}${mesParam}`);
                      }}
                    >
                      <td className="px-6 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                        <Link
                          to={`/frms/tripulante/${row.tripulante_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-blue-700 hover:underline"
                        >
                          {row.nome_guerra || row.nome}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <ProgressBarCompact
                          pct={pctMax}
                          colorClass={getComplianceBg(pctMax, config)}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        {row.effectiveness_pct != null ? (
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`w-2 h-2 rounded-full ${getEffectivenessBg(row.effectiveness_pct, config)}`}
                            />
                            <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300">
                              {row.effectiveness_pct.toFixed(1)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 dark:text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">{nivelBadge(nivel)}</td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMin(row.hv_7d_min)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMin(row.hv_mes_min)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMin(row.hv_365d_min)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="rounded p-1 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(isExpanded ? null : row.tripulante_id);
                            }}
                            title={isExpanded ? 'Recolher' : 'Expandir detalhes'}
                          >
                            <ChevronDown
                              className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </button>
                            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-500" />
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <ExpandedPanel
                        tripulanteId={row.tripulante_id}
                        frotaRow={row}
                        config={config ?? null}
                      />
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 dark:border-slate-800">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600
                         transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5 inline" /> Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600
                         transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Próxima <ChevronRight className="h-3.5 w-3.5 inline" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
