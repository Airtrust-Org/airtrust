import { useState } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { Plus, Edit, Trash2, Users, Settings, Upload } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import ImportarCSVModal from '../ImportarCSVModal';
import Button from '@/react-app/components/Button';
import Card, { CardContent, CardHeader } from '@/react-app/components/Card';
import { BaseModal as Modal } from '../modals/BaseModal';
import { useApi } from '@/react-app/hooks/useApi';
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal';

interface Funcao {
  id: number;
  nome: string;
  descricao?: string;
  categoria?: string;
  created_at: string;
  updated_at: string;
}

interface FuncaoFormData {
  nome: string;
  descricao: string;
  categoria: string;
}

interface FuncoesManagementProps {
  onMatrizCompliance?: () => void;
}

export default function FuncoesManagement({ onMatrizCompliance }: FuncoesManagementProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingFuncao, setEditingFuncao] = useState<Funcao | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [formData, setFormData] = useState<FuncaoFormData>({
    nome: '',
    descricao: '',
    categoria: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ id: number; nome: string } | null>(
    null,
  );
  const [deletandoId, setDeletandoId] = useState<number | null>(null);

  const {
    data: funcoes = [],
    refetch,
    isLoading: loadingFuncoes,
    error: errorFuncoes,
  } = useQuery({
    queryKey: ['funcoes'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/admin/funcoes`);
      const json = await res.json();
      return json.data || [];
    },
  });

  const handleImportFuncoes = async (dados: any[]) => {
    try {
      const response = await fetch(`${API_BASE_URL}/funcoes/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dados }),
      });
      const result = await response.json();
      if (result.success) {
        refetch();
      }
      return result;
    } catch (error) {
      return {
        success: false,
        importados: 0,
        erros: [(error as Error).message],
      };
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({ nome: '', descricao: '', categoria: '' });
    setError(null);
  };

  const handleAdd = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleEdit = (funcao: Funcao) => {
    setFormData({
      nome: funcao.nome,
      descricao: funcao.descricao || '',
      categoria: funcao.categoria || '',
    });
    setEditingFuncao(funcao);
    setIsEditModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome.trim()) {
      setError('Nome é obrigatório');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const url = editingFuncao ? `/api/funcoes/${editingFuncao.id}` : '/api/funcoes';

      const method = editingFuncao ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Erro HTTP ${response.status}`);
      }

      if (!result.success) {
        throw new Error(result.error || 'Erro desconhecido');
      }

      refetch();
      setIsAddModalOpen(false);
      setIsEditModalOpen(false);
      setEditingFuncao(null);
      resetForm();
    } catch (err) {
      console.error('Erro ao salvar função:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (funcao: Funcao) => {
    setShowConfirmDelete({ id: funcao.id, nome: funcao.nome });
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmDelete) return;

    const { id, nome } = showConfirmDelete;
    setDeletandoId(id);

    try {
      const token = getAccessToken();
      const response = await apiFetch(`/api/funcoes/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Erro HTTP ${response.status}`);
      }

      if (data.success) {
        toast.success(`Funcionário "${nome}" excluído com sucesso!`);
        setShowConfirmDelete(null);

        // Aguardar e recarregar
        await new Promise((resolve) => setTimeout(resolve, 500));
        refetch();
      } else {
        refetch();
        toast.error(data.error || 'Erro ao excluir função');
      }
    } catch (err) {
      console.error('Erro ao remover função:', err);
      toast.error(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setDeletandoId(null);
    }
  };

  const closeModals = () => {
    setIsAddModalOpen(false);
    setIsEditModalOpen(false);
    setEditingFuncao(null);
    resetForm();
  };

  if (loadingFuncoes) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-16 bg-gray-200 rounded mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (errorFuncoes) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">Erro ao carregar funções: {errorFuncoes}</p>
        <Button variant="primary" onClick={refetch}>
          Tentar Novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com Ações */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Gestão de Funções
              </h2>
              <p className="text-sm text-gray-600">
                Configure as funções organizacionais e suas responsabilidades
              </p>
            </div>
            <div className="flex gap-3">
              {onMatrizCompliance && (
                <Button variant="secondary" onClick={onMatrizCompliance} className="text-sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Matriz de Compliance
                </Button>
              )}
              <button
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Importar
              </button>
              <Button variant="primary" onClick={handleAdd}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Função
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Lista de Funções */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">Funções ({funcoes?.length || 0})</h3>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!funcoes || funcoes.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium mb-2">Nenhuma função encontrada</p>
              <Button variant="primary" onClick={handleAdd} className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Primeira Função
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-6 font-medium text-gray-900">Nome</th>
                    <th className="text-left py-3 px-6 font-medium text-gray-900">Categoria</th>
                    <th className="text-left py-3 px-6 font-medium text-gray-900">Descrição</th>
                    <th className="text-center py-3 px-6 font-medium text-gray-900">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {funcoes.map((funcao) => (
                    <tr key={funcao.id} className="hover:bg-gray-50">
                      <td className="py-4 px-6">
                        <div className="font-medium text-gray-900">{funcao.nome}</div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="text-sm text-gray-600">{funcao.categoria || 'N/A'}</span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="text-sm text-gray-600">{funcao.descricao || 'N/A'}</span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex justify-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1"
                            onClick={() => handleEdit(funcao)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1 text-red-600 hover:text-red-800"
                            onClick={() => handleDelete(funcao)}
                            disabled={deletandoId === funcao.id}
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
          )}
        </CardContent>
      </Card>

      {/* Modal de Adicionar */}
      <Modal isOpen={isAddModalOpen} onClose={closeModals} title="Nova Função">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nome *</label>
            <input
              type="text"
              name="nome"
              value={formData.nome}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
              placeholder="Nome da função"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Categoria</label>
            <select
              name="categoria"
              value={formData.categoria}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
            >
              <option value="">Selecione uma categoria</option>
              <option value="OPERACIONAL">Operacional</option>
              <option value="ADMINISTRATIVO">Administrativo</option>
              <option value="TECNICO">Técnico</option>
              <option value="GERENCIAL">Gerencial</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
            <textarea
              name="descricao"
              value={formData.descricao}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
              placeholder="Descrição da função"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" onClick={closeModals} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              Criar Função
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de Editar */}
      <Modal isOpen={isEditModalOpen} onClose={closeModals} title="Editar Função">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nome *</label>
            <input
              type="text"
              name="nome"
              value={formData.nome}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
              placeholder="Nome da função"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Categoria</label>
            <select
              name="categoria"
              value={formData.categoria}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
            >
              <option value="">Selecione uma categoria</option>
              <option value="OPERACIONAL">Operacional</option>
              <option value="ADMINISTRATIVO">Administrativo</option>
              <option value="TECNICO">Técnico</option>
              <option value="GERENCIAL">Gerencial</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
            <textarea
              name="descricao"
              value={formData.descricao}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
              placeholder="Descrição da função"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" onClick={closeModals} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              Salvar Alterações
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de Importação */}
      <ImportarCSVModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImportFuncoes}
      />

      {/* Modal de Confirmação de Delete */}
      <ConfirmDeleteModal
        isOpen={!!showConfirmDelete}
        onClose={() => setShowConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        message="Tem certeza que deseja remover esta função?"
        itemName={showConfirmDelete?.nome || ''}
        loading={deletandoId !== null}
      />
    </div>
  );
}
