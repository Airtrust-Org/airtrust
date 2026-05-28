/**
 * FRMS — Relatórios (/frms/relatorios)
 *
 * Seletor de tipo de relatório + preview + export stub (PDF/Excel)
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Download,
  BarChart3,
  Shield,
  AlertTriangle,
  Printer,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { useApi } from '@/react-app/hooks/useApi';

function toDateKeyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type TipoRelatorio = 'compliance' | 'mapa-fadiga' | 'alertas-historico';

const TIPOS: { key: TipoRelatorio; label: string; desc: string; icon: typeof BarChart3 }[] = [
  {
    key: 'compliance',
    label: 'Compliance',
    desc: 'Visão geral de conformidade de todos tripulantes com limites RBAC 135',
    icon: Shield,
  },
  {
    key: 'mapa-fadiga',
    label: 'Mapa FRMS',
    desc: 'Mapa de calor da fadiga dos últimos 90 dias para toda a frota',
    icon: BarChart3,
  },
  {
    key: 'alertas-historico',
    label: 'Histórico de Alertas',
    desc: 'Todos os alertas gerados com filtros por período e nível',
    icon: AlertTriangle,
  },
];

function formatMin(min: number | null | undefined): string {
  if (!min) return '0h00';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

const TIPO_LIMITE_LABEL: Record<string, string> = {
  FDP_DIARIO: 'FDP Diário',
  HV_DIARIA: 'HV Diária',
  HV_7D: 'HV 7 Dias',
  HV_MES: 'HV Mês',
  HV_365D: 'HV 365 Dias',
  REPOUSO: 'Repouso Mínimo',
};

export default function FrmsRelatorios() {
  const navigate = useNavigate();
  const [tipo, setTipo] = useState<TipoRelatorio>('compliance');
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateKeyLocal(d);
  });
  const [periodoFim, setPeriodoFim] = useState(() => toDateKeyLocal(new Date()));

  const endpoint = useMemo(() => {
    if (tipo === 'compliance') {
      // Backend espera ?mes=YYYY-MM
      const mes = periodoInicio.slice(0, 7);
      return `/api/frms/relatorios/compliance?mes=${mes}`;
    }
    if (tipo === 'mapa-fadiga') {
      return `/api/frms/relatorios/mapa-fadiga`;
    }
    // alertas-historico — backend espera ?data_inicio= &data_fim=
    return `/api/frms/relatorios/alertas-historico?data_inicio=${periodoInicio}&data_fim=${periodoFim}`;
  }, [tipo, periodoInicio, periodoFim]);

  const { data, loading } = useApi<any>(endpoint, { requireAuth: true });

  const handleExportPDF = () => {
    if (!data || (Array.isArray(data) && data.length === 0)) return;
    const tipoLabel = TIPOS.find((t) => t.key === tipo)?.label ?? tipo;
    const reportEl = document.getElementById('frms-report-content');
    if (!reportEl) return;

    const printWin = window.open('', '_blank', 'width=1000,height=700');
    if (!printWin) return;
    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>FRMS — ${tipoLabel} — ${periodoInicio} a ${periodoFim}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #111; padding: 32px; }
    h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
    p.subtitle { font-size: 11px; color: #666; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #f3f4f6; }
    th { padding: 8px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
    td { padding: 7px 12px; border-bottom: 1px solid #f3f4f6; }
    tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; border-radius: 9999px; padding: 2px 8px; font-size: 10px; font-weight: 700; }
    .red { background: #fee2e2; color: #991b1b; }
    .amber { background: #fef3c7; color: #92400e; }
    .green { background: #d1fae5; color: #065f46; }
    .gray { background: #f3f4f6; color: #6b7280; }
  </style>
</head>
<body>
  <h1>FRMS — Relatório ${tipoLabel}</h1>
  <p class="subtitle">Período: ${periodoInicio} a ${periodoFim} — Gerado em ${new Date().toLocaleString('pt-BR')}</p>
  ${reportEl.innerHTML}
</body>
</html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
      printWin.close();
    }, 350);
  };

  const handleExportCSV = () => {
    if (!data) return;

    let csvContent = '';
    if (tipo === 'compliance' && Array.isArray(data)) {
      csvContent = 'Tripulante,Violações,Críticos,Atenção,Avisos\n';
      for (const row of data) {
        csvContent += `${row.nome || row.tripulante_id},${row.violacoes ?? 0},${row.alertas_criticos ?? 0},${row.alertas_atencao ?? 0},${row.alertas_aviso ?? 0}\n`;
      }
    } else if (tipo === 'mapa-fadiga' && Array.isArray(data)) {
      csvContent = 'Tripulante,HV 7d%,HV Mês%,HV 365d%,Nível Max,Repouso OK\n';
      for (const row of data) {
        csvContent += `${row.nome || row.tripulante_id},${row.pct_7d ?? ''},${row.pct_mes ?? ''},${row.pct_365d ?? ''},${row.nivel_max ?? ''},${row.repouso_suficiente ? 'Sim' : 'Não'}\n`;
      }
    } else if (tipo === 'alertas-historico' && Array.isArray(data)) {
      csvContent = 'Data,Tripulante,Nível,Tipo Limite,Mensagem,Resolvido\n';
      for (const row of data) {
        const dataStr = row.created_at ? row.created_at.slice(0, 10) : '';
        csvContent += `${dataStr},${row.tripulante_id},${row.nivel},${row.tipo_limite},"${row.mensagem}",${row.resolvido_em ? 'Sim' : 'Não'}\n`;
      }
    }

    if (!csvContent) return;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frms-${tipo}-${periodoInicio}-${periodoFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/frms')}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Relatórios FRMS</h1>
            <p className="text-sm text-gray-500">Análises de compliance e fadiga operacional</p>
          </div>
          <button
            onClick={handleExportCSV}
            disabled={!data}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
          <button
            onClick={handleExportPDF}
            disabled={!data || (Array.isArray(data) && data.length === 0)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> PDF
          </button>
        </div>

        {/* Type selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIPOS.map((t) => {
            const Icon = t.icon;
            const selected = tipo === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTipo(t.key)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  selected
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Icon className={`h-5 w-5 ${selected ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span
                    className={`font-semibold text-sm ${selected ? 'text-blue-800' : 'text-gray-700'}`}
                  >
                    {t.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{t.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Period filter */}
        <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-xs font-medium text-gray-500">Período:</span>
          <input
            type="date"
            value={periodoInicio}
            onChange={(e) => setPeriodoInicio(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <span className="text-gray-400">até</span>
          <input
            type="date"
            value={periodoFim}
            onChange={(e) => setPeriodoFim(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Report view */}
        <div
          id="frms-report-content"
          className="rounded-xl border border-gray-200 bg-white overflow-hidden"
        >
          {loading ? (
            <div className="p-12 text-center text-gray-400">Carregando relatório...</div>
          ) : !data || (Array.isArray(data) && data.length === 0) ? (
            <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-2">
              <FileText className="h-8 w-8" />
              Nenhum dado encontrado para o período selecionado
            </div>
          ) : tipo === 'compliance' ? (
            <ComplianceTable data={data} />
          ) : tipo === 'mapa-fadiga' ? (
            <MapaFadigaTable data={data} />
          ) : (
            <AlertasHistoricoTable data={data} />
          )}
        </div>
      </div>
    </AppLayout>
  );
}

/* ── Sub-tables ── */

function ComplianceTable({ data }: { data: any[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50/50">
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Tripulante</th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500 text-center">
            Violações
          </th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500 text-center">
            Críticos
          </th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500 text-center">
            Atenção
          </th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500 text-center">
            Avisos
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {data.map((r: any, i: number) => (
          <tr key={i} className="hover:bg-gray-50/50">
            <td className="px-4 py-2.5 font-medium text-gray-700">
              {r.nome || `#${r.tripulante_id}`}
            </td>
            <td className="px-4 py-2.5 text-center">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                  (r.violacoes ?? 0) > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {r.violacoes ?? 0}
              </span>
            </td>
            <td className="px-4 py-2.5 text-center">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                  (r.alertas_criticos ?? 0) > 0
                    ? 'bg-red-50 text-red-600'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {r.alertas_criticos ?? 0}
              </span>
            </td>
            <td className="px-4 py-2.5 text-center">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                  (r.alertas_atencao ?? 0) > 0
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {r.alertas_atencao ?? 0}
              </span>
            </td>
            <td className="px-4 py-2.5 text-center">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                  (r.alertas_aviso ?? 0) > 0
                    ? 'bg-yellow-50 text-yellow-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {r.alertas_aviso ?? 0}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MapaFadigaTable({ data }: { data: any[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50/50">
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Tripulante</th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500 text-right">
            HV 7d%
          </th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500 text-right">
            HV Mês%
          </th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500 text-right">
            HV 365d%
          </th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500 text-center">
            Nível
          </th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500 text-center">
            Repouso
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {data.map((r: any, i: number) => {
          const nivelColor =
            r.nivel_max === 'VIOLACAO'
              ? 'bg-red-200 text-red-900'
              : r.nivel_max === 'CRITICO'
                ? 'bg-red-100 text-red-700'
                : r.nivel_max === 'ATENCAO'
                  ? 'bg-amber-100 text-amber-800'
                  : r.nivel_max === 'AVISO'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-green-100 text-green-800';
          return (
            <tr key={i} className="hover:bg-gray-50/50">
              <td className="px-4 py-2.5 font-medium text-gray-700">
                {r.nome || `#${r.tripulante_id}`}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                {r.pct_7d?.toFixed(1) ?? '—'}%
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                {r.pct_mes?.toFixed(1) ?? '—'}%
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                {r.pct_365d?.toFixed(1) ?? '—'}%
              </td>
              <td className="px-4 py-2.5 text-center">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${nivelColor}`}
                >
                  {r.nivel_max || 'OK'}
                </span>
              </td>
              <td className="px-4 py-2.5 text-center">
                {r.repouso_suficiente ? (
                  <span className="text-emerald-500 text-xs font-bold">✓</span>
                ) : (
                  <span className="text-red-500 text-xs font-bold">✗</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AlertasHistoricoTable({ data }: { data: any[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50/50">
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Data</th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Tripulante</th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Nível</th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Tipo Limite</th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Mensagem</th>
          <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500 text-center">
            Resolvido
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {data.map((r: any, i: number) => (
          <tr key={i} className="hover:bg-gray-50/50">
            <td className="px-4 py-2.5 text-gray-600 tabular-nums">
              {r.created_at ? r.created_at.slice(0, 10) : '—'}
            </td>
            <td className="px-4 py-2.5 text-gray-700">
              {r.nome_tripulante ?? `#${r.tripulante_id}`}
            </td>
            <td className="px-4 py-2.5">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  r.nivel === 'VIOLACAO'
                    ? 'bg-red-200 text-red-900'
                    : r.nivel === 'CRITICO'
                      ? 'bg-red-100 text-red-800'
                      : r.nivel === 'ATENCAO'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {r.nivel}
              </span>
            </td>
            <td className="px-4 py-2.5 text-gray-500 text-xs">
              {TIPO_LIMITE_LABEL[r.tipo_limite] ?? r.tipo_limite}
            </td>
            <td className="px-4 py-2.5 text-gray-700 truncate max-w-xs">{r.mensagem}</td>
            <td className="px-4 py-2.5 text-center">
              {r.resolvido_em ? (
                <span className="text-emerald-500 text-xs font-bold">Sim</span>
              ) : (
                <span className="text-gray-400 text-xs">Não</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
