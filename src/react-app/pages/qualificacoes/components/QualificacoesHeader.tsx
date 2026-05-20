/**
 * Header da página de Qualificações
 * Contém título, estatísticas e botões de ação
 */

import { memo } from 'react';
import { Plus, Upload, Settings, Download } from 'lucide-react';
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card card-neutral rounded-lg p-4">
          <div className="text-sm text-gray-600">Total</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="card card-success rounded-lg p-4">
          <div className="text-sm text-gray-600">Válidas</div>
          <div className="text-2xl font-bold text-gray-900">{stats.validas}</div>
        </div>
        <div className="card card-warning rounded-lg p-4">
          <div className="text-sm text-gray-600">Vencendo</div>
          <div className="text-2xl font-bold text-gray-900">{stats.vencendo}</div>
        </div>
        <div className="card card-error rounded-lg p-4">
          <div className="text-sm text-gray-600">Vencidas</div>
          <div className="text-2xl font-bold text-gray-900">{stats.vencidas}</div>
        </div>
      </div>

      {/* Botões de Ação */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={onNovaQualificacao}
          className="flex items-center gap-2  py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Qualificação
        </button>

        <button
          onClick={onImportar}
          className="flex items-center gap-2  py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Importar (usar módulo /importacao)
        </button>

        <button
          onClick={onConfigurarColunas}
          className="flex items-center gap-2  py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Configurar Colunas
        </button>

        {onExportar && (
          <button
            onClick={onExportar}
            className="flex items-center gap-2 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
        )}
      </div>
    </>
  );
});

export default QualificacoesHeader;
