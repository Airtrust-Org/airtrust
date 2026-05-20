/**
 * CRUD DE CATEGORIAS DE MANOBRAS - Padrão do Sistema
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { Button } from '@/react-app/components/UI/Button';
import { Input } from '@/react-app/components/UI/Input';
import { Plus, Trash2 } from 'lucide-react';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface Categoria {
  id: number;
  nome: string;
  descricao?: string;
  cor?: string;
}

interface Props {
  onBack?: () => void;
  embedded?: boolean;
}

export default function CrudCategorias({ embedded = false }: Props = {}) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [formData, setFormData] = useState({ nome: '', descricao: '', cor: '#3b82f6' });

  useEffect(() => {
    carregarCategorias();
  }, []);

  const _authH = () => {
    const t = getAccessToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const carregarCategorias = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/simuladores/categorias`, { headers: _authH() });
      if (response.ok) {
        const data = await response.json();
        if (data.success) setCategorias(data.data || []);
      }
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  const abrirModal = (categoria?: Categoria) => {
    if (categoria) {
      setEditando(categoria);
      setFormData({
        nome: categoria.nome,
        descricao: categoria.descricao || '',
        cor: categoria.cor || '#3b82f6',
      });
    } else {
      setEditando(null);
      setFormData({ nome: '', descricao: '', cor: '#3b82f6' });
    }
    setShowModal(true);
  };

  const fecharModal = () => {
    setShowModal(false);
    setEditando(null);
  };

  const salvar = async () => {
    if (!formData.nome) {
      toast.warning('Preencha o nome');
      return;
    }

    try {
      setSalvando(true);
      const method = editando ? 'PUT' : 'POST';
      const url = editando
        ? `${API_BASE_URL}/simuladores/categorias/${editando.id}`
        : `${API_BASE_URL}/simuladores/categorias`;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ..._authH() },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(editando ? 'Categoria atualizada!' : 'Categoria criada!');
        fecharModal();
        await carregarCategorias();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erro ao salvar');
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: number) => {
    if (!(await confirmDialog('Excluir esta categoria?'))) return;
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/categorias/${id}`, {
        method: 'DELETE',
        headers: _authH(),
      });
      if (response.ok) {
        toast.success('Categoria excluída!');
        setCategorias((prev) => prev.filter((c) => c.id !== id));
        carregarCategorias();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erro ao excluir');
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao excluir');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Categorias de Manobras</h2>
          <p className="text-sm text-gray-500 mt-1">Classificação de manobras e exercícios</p>
        </div>
        <Button onClick={() => abrirModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Categoria
        </Button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Cor
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Nome
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Descrição
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {categorias.map((cat) => (
              <tr key={cat.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <div
                    className="w-6 h-6 rounded-full border"
                    style={{ backgroundColor: cat.cor || '#3b82f6' }}
                  />
                </td>
                <td className="px-4 py-3 font-medium text-sm">{cat.nome}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{cat.descricao || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => abrirModal(cat)}
                      className="text-xs px-3 py-1"
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => excluir(cat.id)}
                      className="text-red-600 hover:bg-red-50 px-2 py-1"
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

      {categorias.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>Nenhuma categoria cadastrada</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">{editando ? 'Editar' : 'Nova'} Categoria</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome*</label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.cor}
                    onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                    className="w-12 h-10 rounded border cursor-pointer"
                  />
                  <span className="text-sm text-gray-500">{formData.cor}</span>
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="secondary" onClick={fecharModal}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
