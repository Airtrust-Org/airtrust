import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Search, RotateCcw } from 'lucide-react';
import { Badge, EmptyState } from '@/react-app/components/UI';
import Button from '@/react-app/components/Button';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface Qualificacao {
  id: number;
  nome: string;
  codigo: string;
  descricao?: string;
  categoria_id?: number;
  categoria_nome?: string;
  validade_meses?: number;
}

interface QualificacoesTabProps {
  qualificacoes: Qualificacao[];
  loading?: boolean;
  onAdd?: () => void;
  onEdit?: (qual: Qualificacao) => void;
  onDelete?: (id: number) => void;
}

export const QualificacoesTab: React.FC<QualificacoesTabProps> = ({
  qualificacoes = [],
  loading = false,
  onAdd,
  onEdit,
  onDelete,
}) => {
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  // Debug: Log dados recebidos
  React.useEffect(() => {
    console.log('🔍 [QualificacoesTab] Props received:', {
      count: qualificacoes.length,
      loading,
      sample: qualificacoes.slice(0, 2),
    });
    if (qualificacoes.length > 0) {
    } else {
    }
  }, [qualificacoes, loading]);

  // Filtrar qualificações
  const qualificacoesFiltrais = qualificacoes.filter((qual) => {
    if (filtroNome && !qual.nome?.toLowerCase().includes(filtroNome.toLowerCase())) {
      return false;
    }
    if (filtroCategoria && qual.categoria_nome !== filtroCategoria) {
      return false;
    }
    return true;
  });

  // Categorias únicas
  const categorias = [...new Set(qualificacoes.map((q) => q.categoria_nome).filter(Boolean))];

  const limparFiltros = () => {
    setFiltroNome('');
    setFiltroCategoria('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (qualificacoes.length === 0) {
    return (
      <EmptyState
        icon={<Plus className="w-12 h-12" />}
        title="Nenhuma qualificação"
        description="Não há qualificações registradas no sistema."
        action={{
          label: 'Adicionar Qualificação',
          onClick: () => onAdd?.(),
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER COM BOTÃO */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-900">
          Qualificações ({qualificacoesFiltrais.length})
        </h3>
        <Button variant="primary" size="md" onClick={() => onAdd?.()}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Qualificação
        </Button>
      </div>

      {/* FILTROS */}
      <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">Filtros</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Filtro: Nome */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Nome</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar qualificação..."
                value={filtroNome}
                onChange={(e) => setFiltroNome(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Filtro: Categoria */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Categoria</label>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
            >
              <option value="">Todas as categorias</option>
              {categorias.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Botão Limpar Filtros */}
        {(filtroNome || filtroCategoria) && (
          <Button variant="ghost" size="sm" onClick={limparFiltros}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Limpar Filtros
          </Button>
        )}
      </div>

      {/* TABELA */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider w-12">
                Ações
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Código
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Categoria
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Validade
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Descrição
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {qualificacoesFiltrais.map((qual) => (
              <tr key={qual.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEdit?.(qual)} title="Editar">
                      <Edit2 className="w-4 h-4 text-indigo-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (await confirmDialog('Tem certeza que deseja deletar?')) {
                          onDelete?.(qual.id);
                        }
                      }}
                      title="Deletar"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                  {qual.nome || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge variant="default" size="sm">
                    {qual.codigo || '-'}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {qual.categoria_nome || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {qual.validade_meses ? `${qual.validade_meses} meses` : '-'}
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                  {qual.descricao || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {qualificacoesFiltrais.length === 0 && (
        <div className="text-center py-8">
          <p className="text-slate-600">Nenhum registro encontrado com os filtros aplicados.</p>
        </div>
      )}
    </div>
  );
};

export default QualificacoesTab;
