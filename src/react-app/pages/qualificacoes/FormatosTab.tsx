import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Search, SearchX, X } from 'lucide-react';
import { Card, CardContent, EmptyState, Badge } from '@/react-app/components/UI';
import Button from '@/react-app/components/Button';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { resolveClassificationTagColor } from '@/react-app/pages/qualificacoes/classificacaoColors';

export interface Formato {
  id: number;
  nome: string;
  codigo: string;
  descricao?: string | null;
  cor?: string | null;
  ativo: number;
  total_tipos?: number | null;
}

interface FormatosTabProps {
  formatos: Formato[];
  loading?: boolean;
  canManage?: boolean;
  onAdd?: () => void;
  onEdit?: (fmt: Formato) => void;
  onDelete?: (id: number) => void;
}

export const FormatosTab: React.FC<FormatosTabProps> = ({
  formatos = [],
  loading = false,
  canManage = false,
  onAdd,
  onEdit,
  onDelete,
}) => {
  const [filtroNome, setFiltroNome] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const formatosFiltrados = formatos.filter((f) => {
    if (filtroNome && !f.nome?.toLowerCase().includes(filtroNome.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (formatos.length === 0) {
    return (
      <EmptyState
        icon={<Plus className="w-12 h-12" />}
        title="Nenhum formato"
        description="Não há formatos de qualificação registrados. Os formatos são criados automaticamente ao aplicar a migration 0412."
        action={
          canManage
            ? { label: 'Adicionar Formato', onClick: () => onAdd?.() }
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold text-slate-900">
          Formatos ({formatosFiltrados.length})
        </h3>

        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar formato..."
            value={filtroNome}
            onChange={(e) => setFiltroNome(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary-600"
          />
        </div>

        {filtroNome && (
          <Button variant="ghost" size="sm" onClick={() => setFiltroNome('')} aria-label="Limpar filtros" className="min-h-[44px]">
            <X className="w-4 h-4 mr-2" aria-hidden="true" />
            Limpar
          </Button>
        )}

        <div className="flex gap-2 ml-auto">
          <Button
            variant={viewMode === 'grid' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className="min-h-[44px]"
          >
            Grade
          </Button>
          <Button
            variant={viewMode === 'table' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('table')}
            className="min-h-[44px]"
          >
            Tabela
          </Button>
          {canManage && (
            <Button variant="primary" size="md" onClick={() => onAdd?.()} className="min-h-[44px]">
              <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
              Novo Formato
            </Button>
          )}
        </div>
      </div>

      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {formatosFiltrados.map((fmt) => (
            <Card key={fmt.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-slate-900 truncate">{fmt.nome}</h4>
                    <Badge variant="default" size="sm" className="mt-1.5">
                      {fmt.codigo}
                    </Badge>
                  </div>
                  {canManage && (
                    <div className="flex gap-0.5 flex-shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => onEdit?.(fmt)}
                        title="Editar"
                        aria-label="Editar formato"
                        className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                      >
                        <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (await confirmDialog('Tem certeza que deseja remover este formato?')) {
                            onDelete?.(fmt.id);
                          }
                        }}
                        title="Remover"
                        aria-label="Remover formato"
                        className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>

                {fmt.descricao && (
                  <p className="text-xs text-slate-500 mb-3 line-clamp-2">{fmt.descricao}</p>
                )}

                <div className="flex items-center gap-3 pt-2.5 border-t border-slate-100">
                  {fmt.cor && (
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-4 h-4 rounded border border-slate-300 flex-shrink-0"
                        style={{ backgroundColor: fmt.cor }}
                      />
                      <span className="text-xs text-slate-400">{fmt.cor}</span>
                    </div>
                  )}
                  {typeof fmt.total_tipos === 'number' && (
                    <span className="text-xs text-slate-400 ml-auto">
                      {fmt.total_tipos} modelo{fmt.total_tipos !== 1 ? 's' : ''}
                    </span>
                  )}
                  {fmt.ativo === 0 && (
                    <Badge variant="danger" size="sm">Inativo</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {viewMode === 'table' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {canManage && (
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">
                    Ações
                  </th>
                )}
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Código
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Cor
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">
                  Modelos
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Descrição
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {formatosFiltrados.map((fmt) => (
                <tr key={fmt.id} className={`hover:bg-slate-50 transition-colors${fmt.ativo === 0 ? ' opacity-60' : ''}`}>
                  {canManage && (
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => onEdit?.(fmt)}
                          title="Editar"
                          aria-label="Editar formato"
                          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                        >
                          <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (await confirmDialog('Tem certeza que deseja remover este formato?')) {
                              onDelete?.(fmt.id);
                            }
                          }}
                          title="Remover"
                          aria-label="Remover formato"
                          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm font-medium text-slate-900">
                    {fmt.nome}
                    {fmt.ativo === 0 && <Badge variant="danger" size="sm" className="ml-2">Inativo</Badge>}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <Badge variant="default" size="sm">{fmt.codigo}</Badge>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-5 h-5 rounded border border-slate-300 flex-shrink-0"
                        style={{ backgroundColor: resolveClassificationTagColor({
                          variant: 'format',
                          code: fmt.codigo,
                          color: fmt.cor || null,
                        }) }}
                      />
                      <span className="text-xs text-slate-500">
                        {resolveClassificationTagColor({
                          variant: 'format',
                          code: fmt.codigo,
                          color: fmt.cor || null,
                        })}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm text-slate-600">
                    {fmt.total_tipos ?? 0}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-slate-600 max-w-xs truncate">
                    {fmt.descricao || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formatosFiltrados.length === 0 && formatos.length > 0 && (
        <div className="py-8">
          <EmptyState
            icon={<SearchX size={48} className="text-slate-300" />}
            title="Nenhum registro"
            description="Nenhum formato encontrado com os filtros aplicados."
          />
        </div>
      )}
    </div>
  );
};

export default FormatosTab;
