import { useState } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { Edit, Trash2, FolderOpen, Users } from 'lucide-react';
import Button from '../Button';
import Badge from '../Badge';
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal';

interface FuncionarioUnificado {
  id: number;
  nome: string;
  matricula: string;
  funcao: string;
  email: string;
  telefone?: string;
  status: 'ATIVO' | 'INATIVO';
  compliance_status: 'CONFORME' | 'VENCENDO' | 'VENCIDO' | 'PENDENTE';
  compliance_percentage: number;
  dias_para_vencimento: number;
}

interface FuncionarioListProps {
  funcionariosUnificados: FuncionarioUnificado[];
  onEdit: (funcionario: FuncionarioUnificado) => void;
  onDelete: () => void;
  onViewFolder: (id: number) => void;
}

export default function FuncionarioList({
  funcionariosUnificados,
  onEdit,
  onDelete,
  onViewFolder,
}: FuncionarioListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ id: number; nome: string } | null>(
    null,
  );
  const [deletandoId, setDeletandoId] = useState<number | null>(null);

  const handleDeleteClick = (funcionario: FuncionarioUnificado) => {
    setShowConfirmDelete({ id: funcionario.id, nome: funcionario.nome });
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmDelete) return;

    const { id } = showConfirmDelete;
    setDeletandoId(id);

    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/funcionarios/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Funcionário "${showConfirmDelete.nome}" excluído com sucesso!`);
        setShowConfirmDelete(null);

        // Aguardar e notificar pai
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (onDelete) {
          await onDelete();
        }
      } else {
        if (onDelete) await onDelete();
        toast.error(data.error || 'Erro ao excluir funcionário');
      }
    } catch (error) {
      toast.warning(`Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setDeletandoId(null);
    }
  };

  const filteredFuncionarios = funcionariosUnificados.filter(
    (funcionario) =>
      funcionario.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      funcionario.cargo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      funcionario.matricula?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const getComplianceBadgeVariant = (status: string) => {
    switch (status) {
      case 'CONFORME':
        return 'success';
      case 'VENCENDO':
        return 'warning';
      case 'VENCIDO':
        return 'danger';
      case 'PENDENTE':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    return status === 'ATIVO' ? 'success' : 'danger';
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header com ações */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Lista de Funcionários</h2>
            <p className="text-sm text-gray-600">
              {filteredFuncionarios.length} funcionários encontrados
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4">
          <input
            type="text"
            placeholder="Buscar por nome, função ou matrícula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Funcionário
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Função
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Compliance
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contato
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredFuncionarios.map((funcionario) => (
              <tr key={funcionario.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{funcionario.nome}</div>
                    <div className="text-sm text-gray-500">{funcionario.matricula}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{funcionario.funcao}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge variant={getStatusBadgeVariant(funcionario.status)}>
                    {funcionario.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col">
                    <Badge
                      variant={getComplianceBadgeVariant(funcionario.compliance_status)}
                      size="sm"
                    >
                      {funcionario.compliance_status}
                    </Badge>
                    <div className="text-xs text-gray-500 mt-1">
                      {funcionario.compliance_percentage}% • {funcionario.dias_para_vencimento}d
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {funcionario.email && (
                      <a
                        href={`mailto:${funcionario.email}`}
                        className="text-primary hover:text-primary underline"
                      >
                        {funcionario.email}
                      </a>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {funcionario.telefone && (
                      <a
                        href={`https://wa.me/55${funcionario.telefone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-600 hover:text-green-800 underline flex items-center"
                      >
                        {funcionario.telefone}
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewFolder(funcionario.id)}
                      className="p-2 h-auto"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(funcionario)}
                      className="p-2 h-auto"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(funcionario)}
                      className="p-2 h-auto text-red-600 hover:text-red-700"
                      disabled={deletandoId === funcionario.id}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {filteredFuncionarios.length === 0 && (
        <div className="p-12 text-center">
          <div className="text-gray-400 mb-4">
            <Users className="w-12 h-12 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? 'Nenhum funcionário encontrado' : 'Nenhum funcionário cadastrado'}
          </h3>
          <p className="text-gray-600">
            {searchTerm
              ? 'Tente ajustar os termos de busca.'
              : 'Comece cadastrando o primeiro funcionário do sistema.'}
          </p>
        </div>
      )}

      {/* Modal de Confirmação de Delete */}
      <ConfirmDeleteModal
        isOpen={!!showConfirmDelete}
        onClose={() => setShowConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        message="Tem certeza que deseja excluir este funcionário?"
        itemName={showConfirmDelete?.nome || ''}
        loading={deletandoId !== null}
      />
    </div>
  );
}
