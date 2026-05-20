import { useState } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
  categoria?: any;
}

export function ModalNovaCategoria({ isOpen, onClose, onSave, categoria }: Props) {
  const [form, setForm] = useState({
    nome: categoria?.nome || '',
    codigo: categoria?.codigo || '',
    descricao: categoria?.descricao || '',
    cor: categoria?.cor || '#3B82F6',
    ativo: categoria?.ativo !== undefined ? categoria.ativo : 1,
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const method = categoria?.id ? 'PUT' : 'POST';
      const url = categoria?.id
        ? `${API_BASE_URL}/categorias-qualificacoes/${categoria.id}`
        : `${API_BASE_URL}/categorias-qualificacoes`;

      const payload = {
        nome: form.nome?.trim() || null,
        codigo: form.codigo?.trim() || null,
        descricao: form.descricao?.trim() || null,
        cor: form.cor?.trim() || null,
        ativo: form.ativo,
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        onSave?.();
        onClose();
      } else {
        toast.warning('Erro ao salvar categoria');
      }
    } catch {
      toast.warning('Erro ao salvar categoria');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-modal">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">
            {categoria?.id ? 'Editar Categoria' : 'Nova Categoria'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
            <input
              type="text"
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={form.cor}
                onChange={(e) => setForm({ ...form, cor: e.target.value })}
                className="w-12 h-10 border border-gray-300 rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={form.cor}
                onChange={(e) => setForm({ ...form, cor: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={form.ativo === 1}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked ? 1 : 0 })}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm">{form.ativo === 1 ? '✓ Ativa' : '○ Inativa'}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
