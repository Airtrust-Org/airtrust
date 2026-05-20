import React, { useState, useMemo } from 'react';
import { Search, Plus, Edit2, Trash2, RotateCcw } from 'lucide-react';
import { Badge, EmptyState, VirtualTable } from '@/react-app/components/UI';
import Button from '@/react-app/components/Button';
import { useDebounce } from '@/react-app/hooks/useDebounce';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface Funcao {
  id: number;
  codigo: string;
  nome: string;
  descricao?: string;
  nivel: 'OPERACIONAL' | 'SUPERVISAO' | 'GERENCIAL' | 'DIRETORIA';
  ativo: boolean;
  funcionarios_count: number;
  created_at: string;
}

interface FuncoesTapProps {
  funcoes?: Funcao[];
  loading?: boolean;
  onEdit?: (funcao: Funcao) => void;
  onDelete?: (id: number) => void;
  onNew?: () => void;
}

const getNivelBadgeVariant = (
  nivel: string,
): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
  switch (nivel) {
    case 'OPERACIONAL':
      return 'info';
    case 'SUPERVISAO':
      return 'warning';
    case 'GERENCIAL':
      return 'warning';
    case 'DIRETORIA':
      return 'danger';
    default:
      return 'default';
  }
};

export const FuncoesTab: React.FC<FuncoesTapProps> = ({
  funcoes = [],
  loading = false,
  onEdit,
  onDelete,
  onNew,
}) => {
  const [busca, setBusca] = useState('');
  const [filtroNivel, setFiltroNivel] = useState('all');
  const [filtroAtivo, setFiltroAtivo] = useState('all');

  const debouncedBusca = useDebounce(busca, 300);

  const funcoesFiltrais = useMemo(() => {
    return funcoes.filter((f) => {
      if (
        debouncedBusca &&
        !f.nome.toLowerCase().includes(debouncedBusca.toLowerCase()) &&
        !f.codigo.includes(debouncedBusca)
      ) {
        return false;
      }
      if (filtroNivel !== 'all' && f.nivel !== filtroNivel) {
        return false;
      }
      if (filtroAtivo !== 'all') {
        const ativo = filtroAtivo === 'true';
        if (f.ativo !== ativo) {
          return false;
        }
      }
      return true;
    });
  }, [funcoes, debouncedBusca, filtroNivel, filtroAtivo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (funcoes.length === 0) {
    return (
      <EmptyState
        icon={<Search className="w-12 h-12" />}
        title="Nenhuma função"
        description="Crie a primeira função corporativa"
        action={onNew ? { label: 'Nova Função', onClick: onNew } : undefined}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros e Botão Nova */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Filtros</h3>
          <Button variant="primary" size="sm" onClick={onNew}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Função
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Busca */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Código ou nome..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Nível */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nível</label>
            <select
              value={filtroNivel}
              onChange={(e) => setFiltroNivel(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
            >
              <option value="all">Todos</option>
              <option value="OPERACIONAL">Operacional</option>
              <option value="SUPERVISAO">Supervisão</option>
              <option value="GERENCIAL">Gerencial</option>
              <option value="DIRETORIA">Diretoria</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={filtroAtivo}
              onChange={(e) => setFiltroAtivo(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
            >
              <option value="all">Todos</option>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
        </div>

        {/* Botão Limpar */}
        {(busca || filtroNivel !== 'all' || filtroAtivo !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              setBusca('');
              setFiltroNivel('all');
              setFiltroAtivo('all');
            }}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Limpar Filtros
          </Button>
        )}
      </div>

      {/* Tabela */}
      {funcoesFiltrais.length > 100 ? (
        <VirtualTable
          data={funcoesFiltrais}
          rowHeight={64}
          maxHeight="h-[600px]"
          columns={[
            {
              key: 'acoes',
              header: 'Ações',
              width: '10%',
              render: (f: Funcao) => (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onEdit?.(f)} title="Editar">
                    <Edit2 className="w-4 h-4 text-indigo-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (await confirmDialog('Tem certeza que deseja deletar?')) {
                        onDelete?.(f.id);
                      }
                    }}
                    title="Deletar"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              ),
            },
            {
              key: 'codigo',
              header: 'Código',
              width: '12%',
              render: (f: Funcao) => (
                <span className="font-mono font-medium text-gray-900">{f.codigo}</span>
              ),
            },
            {
              key: 'nome',
              header: 'Nome',
              width: '25%',
              render: (f: Funcao) => <span className="text-gray-900">{f.nome}</span>,
            },
            {
              key: 'nivel',
              header: 'Nível',
              width: '12%',
              render: (f: Funcao) => (
                <Badge variant={getNivelBadgeVariant(f.nivel)} size="sm">
                  {f.nivel}
                </Badge>
              ),
            },
            {
              key: 'funcionarios_count',
              header: 'Funcionários',
              width: '12%',
              render: (f: Funcao) => (
                <span className="font-medium text-gray-900 bg-blue-50 px-2 py-1 rounded">
                  {f.funcionarios_count}
                </span>
              ),
            },
            {
              key: 'ativo',
              header: 'Status',
              width: '10%',
              render: (f: Funcao) => (
                <Badge variant={f.ativo ? 'success' : 'default'} size="sm">
                  {f.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              ),
            },
            {
              key: 'descricao',
              header: 'Descrição',
              width: '19%',
              render: (f: Funcao) => (
                <span className="text-gray-600 text-xs truncate">{f.descricao || '-'}</span>
              ),
            },
          ]}
        />
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-12">
                  Ações
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Código
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Nível
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Funcionários
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Descrição
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {funcoesFiltrais.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onEdit?.(f)} title="Editar">
                        <Edit2 className="w-4 h-4 text-indigo-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (await confirmDialog('Tem certeza que deseja deletar?')) {
                            onDelete?.(f.id);
                          }
                        }}
                        title="Deletar"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono font-medium text-gray-900">{f.codigo}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-900">{f.nome}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant={getNivelBadgeVariant(f.nivel)} size="sm">
                      {f.nivel}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium text-gray-900 bg-blue-50 px-2 py-1 rounded">
                      {f.funcionarios_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant={f.ativo ? 'success' : 'default'} size="sm">
                      {f.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 truncate">{f.descricao || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {funcoesFiltrais.length === 0 && (
        <div className="text-center py-8 text-gray-600">
          Nenhuma função encontrada com os filtros aplicados.
        </div>
      )}
    </div>
  );
};

export default FuncoesTab;
