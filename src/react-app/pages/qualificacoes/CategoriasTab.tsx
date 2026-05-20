import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Search, RotateCcw, SearchX } from 'lucide-react';
import { Card, CardContent, EmptyState, Badge } from '@/react-app/components/UI';
import Button from '@/react-app/components/Button';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface Categoria {
  id: number;
  nome: string;
  codigo: string;
  descricao?: string;
  cor?: string;
}

interface CategoriasTabProps {
  categorias: Categoria[];
  loading?: boolean;
  onAdd?: () => void;
  onEdit?: (cat: Categoria) => void;
  onDelete?: (id: number) => void;
}

export const CategoriasTab: React.FC<CategoriasTabProps> = ({
  categorias = [],
  loading = false,
  onAdd,
  onEdit,
  onDelete,
}) => {
  const [filtroNome, setFiltroNome] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Filtrar categorias
  const categoriasFiltrais = categorias.filter((cat) => {
    if (filtroNome && !cat.nome?.toLowerCase().includes(filtroNome.toLowerCase())) {
      return false;
    }
    return true;
  });

  const limparFiltros = () => {
    setFiltroNome('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (categorias.length === 0) {
    return (
      <EmptyState
        icon={<Plus className="w-12 h-12" />}
        title="Nenhuma categoria"
        description="Não há categorias de qualificação registradas no sistema."
        action={{
          label: 'Adicionar Categoria',
          onClick: () => onAdd?.(),
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER COM BOTÃO E VIEW TOGGLE */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">
          Categorias ({categoriasFiltrais.length})
        </h3>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'grid' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            Grade
          </Button>
          <Button
            variant={viewMode === 'table' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('table')}
          >
            Tabela
          </Button>
          <Button variant="primary" size="md" onClick={() => onAdd?.()}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Categoria
          </Button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Filtros</h3>

        <div className="flex gap-4 items-end">
          {/* Filtro: Nome */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar categoria..."
                value={filtroNome}
                onChange={(e) => setFiltroNome(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Botão Limpar Filtros */}
          {filtroNome && (
            <Button variant="ghost" size="sm" onClick={limparFiltros}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* VISTA EM GRADE */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categoriasFiltrais.map((cat) => (
            <Card key={cat.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-gray-900">{cat.nome}</h4>
                    <Badge variant="default" size="sm" className="mt-2">
                      {cat.codigo}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEdit?.(cat)} title="Editar">
                      <Edit2 className="w-4 h-4 text-indigo-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (await confirmDialog('Tem certeza que deseja deletar?')) {
                          onDelete?.(cat.id);
                        }
                      }}
                      title="Deletar"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>

                {cat.descricao && (
                  <p className="text-xs text-gray-600 mb-4 line-clamp-2">{cat.descricao}</p>
                )}

                {cat.cor && (
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                    <div
                      className="w-4 h-4 rounded border border-gray-300"
                      style={{ backgroundColor: cat.cor }}
                    />
                    <span className="text-xs text-gray-500">{cat.cor}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* VISTA EM TABELA */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-12">
                  Ações
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Código
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Cor
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Descrição
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {categoriasFiltrais.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit?.(cat)}
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4 text-indigo-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (await confirmDialog('Tem certeza que deseja deletar?')) {
                            onDelete?.(cat.id);
                          }
                        }}
                        title="Deletar"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {cat.nome}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="default" size="sm">
                      {cat.codigo}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded border border-gray-300"
                        style={{ backgroundColor: cat.cor || '#6B7280' }}
                      />
                      <span className="text-xs text-gray-500">{cat.cor || '-'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                    {cat.descricao || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {categoriasFiltrais.length === 0 && (
        <div className="py-8">
          <EmptyState
            icon={<SearchX size={48} className="text-slate-300" />}
            title="Nenhum registro"
            description="Nenhum registro encontrado com os filtros aplicados."
          />
        </div>
      )}
    </div>
  );
};

export default CategoriasTab;
