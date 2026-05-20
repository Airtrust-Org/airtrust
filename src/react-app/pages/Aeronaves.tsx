import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { Plus, Plane, Edit2, Trash2 } from 'lucide-react';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { clearApiCacheByPattern } from '@/react-app/hooks/useApi';
import { escalasKeys } from '@/react-app/pages/escalas/hooks/queries/useEscalasQuery';

import Button from '@/react-app/components/Button';
import { BaseModal as Modal } from '@/react-app/components/modals/BaseModal';
import Badge from '@/react-app/components/Badge';
import { PageLayout, PageGrid, PageSection } from '@/react-app/components/layout/PageLayout';
import StatCard from '@/react-app/components/StatCard';
import ConfirmDeleteModal from '@/react-app/components/modals/ConfirmDeleteModal';

interface Aeronave {
  id: number;
  modelo: string;
  prefixo?: string;
  ano_fabricacao?: number;
  status?: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
}

interface AeronaveFormData {
  modelo: string;
  prefixo?: string;
  ano_fabricacao?: number;
  status?: string;
  observacoes?: string;
}

export default function Aeronaves() {
  const queryClient = useQueryClient();
  const [aeronaves, setAeronaves] = useState<Aeronave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAeronave, setEditingAeronave] = useState<Aeronave | null>(null);
  const [formData, setFormData] = useState<AeronaveFormData>({
    modelo: '',
    prefixo: '',
    ano_fabricacao: undefined,
    status: 'ATIVO',
    observacoes: '',
  });
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ id: number; nome: string } | null>(
    null,
  );
  const [deletandoId, setDeletandoId] = useState<number | null>(null);

  const syncAeronavesCaches = async () => {
    clearApiCacheByPattern('/aeronaves');
    await queryClient.invalidateQueries({ queryKey: escalasKeys.aeronaves() });
    await queryClient.refetchQueries({ queryKey: escalasKeys.aeronaves(), type: 'active' });
  };

  const fetchAeronaves = async () => {
    try {
      setLoading(true);
      // Cache busting
      const response = await fetch(`${API_BASE_URL}/aeronaves?t=${new Date().getTime()}`, {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      const data = await response.json();
      if (data.success) {
        setAeronaves(data.data || []);
      }
    } catch (error) {
      console.error('Erro ao buscar aeronaves:', error);
      toast.error('Erro ao carregar equipamentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAeronaves();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingAeronave ? `/api/aeronaves/${editingAeronave.id}` : '/api/aeronaves';
      const method = editingAeronave ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao salvar equipamento');
      }

      setIsCreateModalOpen(false);
      setIsEditModalOpen(false);
      setEditingAeronave(null);
      setFormData({
        modelo: '',
        prefixo: '',
        ano_fabricacao: undefined,
        status: 'ATIVO',
        observacoes: '',
      });
      await syncAeronavesCaches();
      fetchAeronaves();
    } catch (err) {
      console.error('Erro ao salvar aeronave:', err);
    }
  };

  const handleEdit = (aeronave: Aeronave) => {
    setEditingAeronave(aeronave);
    setFormData({
      modelo: aeronave.modelo,
      prefixo: aeronave.prefixo || '',
      ano_fabricacao: aeronave.ano_fabricacao,
      status: aeronave.status || 'ATIVO',
      observacoes: aeronave.observacoes || '',
    });
    setIsEditModalOpen(true);
  };

  const handleDelete = (aeronave: Aeronave) => {
    setShowConfirmDelete({ id: aeronave.id, nome: aeronave.modelo });
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmDelete) return;

    const { id, nome } = showConfirmDelete;
    setDeletandoId(id);

    try {
      const token = getAccessToken();
      const response = await apiFetch(`/api/aeronaves/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      // 403: Permissão negada (RBAC)
      if (response.status === 403) {
        toast.warning('❌ Permissão negada. Apenas administradores podem deletar equipamentos.');
        setShowConfirmDelete(null);
        return;
      }

      const data = await response.json();

      if (data.success) {
        // Optimistic update
        setAeronaves((prev) => prev.filter((a) => a.id !== id));

        toast.success(`"${nome}" excluída com sucesso!`);
        setShowConfirmDelete(null);
        await syncAeronavesCaches();

        // Aguardar e recarregar
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchAeronaves();
      } else {
        await syncAeronavesCaches();
        await fetchAeronaves(); // Re-fetch to ensure state consistency if deletion failed
        toast.error(data.error || 'Erro ao excluir equipamento');
      }
    } catch (err) {
      console.error('Erro ao excluir aeronave:', err);
      toast.warning('Erro ao excluir equipamento');
    } finally {
      setDeletandoId(null);
    }
  };

  const openCreateModal = () => {
    setFormData({ codigo: '', nome: '', fabricante: '' });
    setEditingAeronave(null);
    setIsCreateModalOpen(true);
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Erro ao carregar equipamentos: {error}</p>
        <Button variant="primary" onClick={fetchAeronaves} className="mt-4">
          Tentar Novamente
        </Button>
      </div>
    );
  }

  return (
    <PageLayout
      title="Catálogo de Equipamentos"
      subtitle="Gerenciamento centralizado de equipamentos da frota"
    >
      {/* Stats Cards */}
      <PageGrid columns={3} className="mb-8">
        <StatCard
          label="Total de Equipamentos"
          value={loading ? '-' : aeronaves.length.toString()}
          color="blue"
        />
        <StatCard
          label="Prefixos"
          value={
            loading ? '-' : new Set(aeronaves.map((a) => a.prefixo).filter(Boolean)).size.toString()
          }
          color="green"
        />
        <StatCard
          label="Equipamentos Únicos"
          value={loading ? '-' : new Set(aeronaves.map((a) => a.modelo)).size.toString()}
          color="purple"
        />
      </PageGrid>

      {/* Lista de Equipamentos */}
      <PageSection>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-neutral-900">Equipamentos Cadastrados</h3>
          <Button variant="primary" onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Equipamento
          </Button>
        </div>
        {loading ? (
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-neutral-200 rounded"></div>
            ))}
          </div>
        ) : aeronaves.length === 0 ? (
          <div className="text-center py-8">
            <Plane className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
            <p className="text-neutral-500 text-lg font-medium mb-2">
              Nenhum equipamento cadastrado
            </p>
            <p className="text-sm text-neutral-400 mb-4">
              Clique em "Novo Equipamento" para adicionar o primeiro equipamento ao catálogo
            </p>
            <Button variant="primary" onClick={openCreateModal}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Primeiro Equipamento
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className=" py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Código
                  </th>
                  <th className=" py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Nome
                  </th>
                  <th className=" py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Fabricante
                  </th>
                  <th className=" py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {aeronaves.map((aeronave) => (
                  <tr key={aeronave.id} className="hover:bg-neutral-50">
                    <td className=" py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Badge variant="neutral" size="sm">
                          {aeronave.codigo}
                        </Badge>
                      </div>
                    </td>
                    <td className=" py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-neutral-900">{aeronave.nome}</div>
                    </td>
                    <td className=" py-4 whitespace-nowrap">
                      <div className="text-sm text-neutral-500">{aeronave.fabricante || '-'}</div>
                    </td>
                    <td className=" py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(aeronave)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(aeronave)}
                          className="text-red-600 hover:text-red-700"
                          disabled={deletandoId === aeronave.id}
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
      </PageSection>

      {/* Modal de Criação */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Novo Equipamento"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Código *</label>
            <input
              type="text"
              required
              value={formData.codigo}
              onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Ex: A320, B738"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Nome *</label>
            <input
              type="text"
              required
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Ex: Airbus A320"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Fabricante</label>
            <input
              type="text"
              value={formData.fabricante}
              onChange={(e) => setFormData({ ...formData, fabricante: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Ex: Airbus"
            />
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Criar Equipamento
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de Edição */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Editar Equipamento"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Código *</label>
            <input
              type="text"
              required
              value={formData.codigo}
              onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Nome *</label>
            <input
              type="text"
              required
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Fabricante</label>
            <input
              type="text"
              value={formData.fabricante}
              onChange={(e) => setFormData({ ...formData, fabricante: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Salvar Alterações
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de Confirmação de Delete */}
      <ConfirmDeleteModal
        isOpen={!!showConfirmDelete}
        onClose={() => setShowConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        message="Tem certeza que deseja excluir este equipamento?"
        itemName={showConfirmDelete?.nome || ''}
        loading={deletandoId !== null}
      />
    </PageLayout>
  );
}
