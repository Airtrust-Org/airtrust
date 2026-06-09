/**
 * Header da página de Qualificações
 * Contém título, estatísticas e botões de ação
 */

import { memo } from 'react';
import { Plus, Upload, Settings, Download, LayoutList, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import PageHeader from '../../../components/shared/PageHeader';

interface Stats {
  total: number;
  validas: number;
  vencendo: number;
  vencidas: number;
}

interface QualificacoesHeaderProps {
  stats: Stats;
  onNovaQualificacao: () => void;
  onImportar: () => void;
  onConfigurarColunas: () => void;
  onExportar?: () => void;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
  variant = 'neutral',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  helper: string;
  variant?: 'neutral' | 'success' | 'warning' | 'error';
}) {
  const iconBgMap = {
    neutral: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    error: 'bg-rose-100 text-rose-700',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          <p className="mt-1 text-sm text-slate-500">{helper}</p>
        </div>
        <div className={`rounded-xl p-2 ${iconBgMap[variant]}`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

const QualificacoesHeader = memo(function QualificacoesHeader({
  stats,
  onNovaQualificacao,
  onImportar,
  onConfigurarColunas,
  onExportar,
}: QualificacoesHeaderProps) {
  return (
    <>
      <PageHeader title="Qualificações" subtitle="Gerenciamento de treinamentos, exames e checks" />

      {/* Estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={LayoutList} label="Total" value={stats.total} helper="qualificações registradas" variant="neutral" />
        <KpiCard icon={CheckCircle2} label="Válidas" value={stats.validas} helper="dentro da validade" variant="success" />
        <KpiCard icon={AlertTriangle} label="Vencendo" value={stats.vencendo} helper="em até 30 dias" variant="warning" />
        <KpiCard icon={AlertCircle} label="Vencidas" value={stats.vencidas} helper="ação necessária" variant="error" />
      </div>

      {/* Botões de Ação */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={onNovaQualificacao}
          className="inline-flex min-h-[44px] items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Nova Qualificação
        </button>

        <button
          onClick={onImportar}
          className="inline-flex min-h-[44px] items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 cursor-pointer"
        >
          <Upload className="w-4 h-4" aria-hidden="true" />
          Importar
        </button>

        <button
          onClick={onConfigurarColunas}
          className="inline-flex min-h-[44px] items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 cursor-pointer"
        >
          <Settings className="w-4 h-4" aria-hidden="true" />
          Configurar Colunas
        </button>

        {onExportar && (
          <button
            onClick={onExportar}
            className="inline-flex min-h-[44px] items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 cursor-pointer"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Exportar
          </button>
        )}
      </div>
    </>
  );
});

export default QualificacoesHeader;
