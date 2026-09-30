export interface QualificacoesPrefs {
  activeTab?: 'historico' | 'planejados' | 'tipos' | 'categorias';
  plannedView?: 'lista' | 'calendario' | 'turmas';
  limit?: number;
  searchTerm?: string;
  sortColumn?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  aeronaveFilter?: string;
  categoriaFilter?: string;
  statusFiltro?: string[];
  setorFilter?: string[];
  categoriasSetorFilter?: string[];
  historicoAreaId?: number | null;
}

export interface QualificacoesModelosPrefs {
  searchTerm: string;
  categoriaFilter: string;
  areaFilter: string;
}
