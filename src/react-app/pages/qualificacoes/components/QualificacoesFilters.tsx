/**
 * Filtros da página de Qualificações
 */

import { memo } from 'react';
import { Search, Filter, X } from 'lucide-react';

interface QualificacoesFiltersProps {
  busca: string;
  onBuscaChange: (value: string) => void;
  tipoFiltro: string;
  onTipoChange: (value: string) => void;
  statusFiltro: string;
  onStatusChange: (value: string) => void;
  aeronaveFiltro: string;
  onAeronaveChange: (value: string) => void;
  aeronaves: { id: number; nome: string; codigo: string }[];
  incluirRenovadas: boolean;
  onIncluirRenovadasChange: (value: boolean) => void;
  onLimparFiltros: () => void;
}

const QualificacoesFilters = memo(function QualificacoesFilters({
  busca,
  onBuscaChange,
  tipoFiltro,
  onTipoChange,
  statusFiltro,
  onStatusChange,
  aeronaveFiltro,
  onAeronaveChange,
  aeronaves,
  incluirRenovadas,
  onIncluirRenovadasChange,
  onLimparFiltros,
}: QualificacoesFiltersProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-5 h-5 text-gray-600" />
        <h3 className="text-lg font-semibold">Filtros</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, código..."
            value={busca}
            onChange={(e) => onBuscaChange(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>

        {/* Tipo */}
        <select
          value={tipoFiltro}
          onChange={(e) => onTipoChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          <option value="">Todos os tipos</option>
          <option value="TREINAMENTO">Treinamento</option>
          <option value="EXAME">Exame</option>
          <option value="CHECK">Check</option>
        </select>

        {/* Equipamento */}
        <select
          value={aeronaveFiltro}
          onChange={(e) => onAeronaveChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          <option value="">Todos os equipamentos</option>
          {aeronaves.map((aeronave) => (
            <option key={aeronave.id} value={aeronave.id}>
              {aeronave.nome} {aeronave.codigo ? `- ${aeronave.codigo}` : ''}
            </option>
          ))}
        </select>

        {/* Status */}
        <select
          value={statusFiltro}
          onChange={(e) => onStatusChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          <option value="">Todos os status</option>
          <option value="VALIDA">Válida</option>
          <option value="VENCENDO">Vencendo</option>
          <option value="VENCIDA">Vencida</option>
        </select>

        {/* Incluir Renovadas */}
        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={incluirRenovadas}
            onChange={(e) => onIncluirRenovadasChange(e.target.checked)}
            className="w-4 h-4 text-primary rounded focus:ring-2 focus:ring-primary"
          />
          <span className="text-sm text-gray-700">Incluir renovadas</span>
        </label>
      </div>

      {/* Limpar Filtros */}
      {(busca || tipoFiltro || statusFiltro || aeronaveFiltro || incluirRenovadas) && (
        <button
          onClick={onLimparFiltros}
          className="mt-4 flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
          Limpar filtros
        </button>
      )}
    </div>
  );
});

export default QualificacoesFilters;
