/**
 * CRUD DE TIPOS DE SESSÃO - Padrão do Sistema
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { Button } from '@/react-app/components/UI/Button';
import { Input } from '@/react-app/components/UI/Input';
import { ArrowLeft, Plus, Trash2, Inbox } from 'lucide-react';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { getColorByIndex, getAllColors } from '@/react-app/utils/colorPalette';
import { RowActionsMenu } from '@/react-app/components/UI/RowActionsMenu';

interface TipoSessao {
  id: number;
  codigo: string;
  nome: string;
  descricao?: string;
  cor?: string;
}

interface Props {
  onBack?: () => void;
  embedded?: boolean;
}

export default function CrudTiposSessao({ embedded = false, onBack }: Props = {}) {
  const [tipos, setTipos] = useState<TipoSessao[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<TipoSessao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [formData, setFormData] = useState({ codigo: '', nome: '', descricao: '', cor: '#3B82F6' });

  useEffect(() => {
    carregarTipos();
  }, []);

  const _authH = () => {
    const t = getAccessToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const carregarTipos = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/simuladores/tipos-sessao`, {
        headers: { ..._authH(), 'Cache-Control': 'no-cache' },
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) setTipos(data.data || []);
      }
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  const abrirModal = (tipo?: TipoSessao) => {
    if (tipo) {
      setEditando(tipo);
      setFormData({
        codigo: tipo.codigo,
        nome: tipo.nome,
        descricao: tipo.descricao || '',
        cor: tipo.cor || getColorByIndex(tipo.id),
      });
    } else {
      // Generate next ID for color prediction (simplified: use total count + 1)
      const proximaCorIndex = (tipos.length + 1) % getAllColors().length;
      const proximaCor = getAllColors()[proximaCorIndex];
      setEditando(null);
      setFormData({ codigo: '', nome: '', descricao: '', cor: proximaCor });
    }
    setShowModal(true);
  };

  const fecharModal = () => {
    setShowModal(false);
    setEditando(null);
  };

  const salvar = async () => {
    if (!formData.codigo || !formData.nome) {
      toast.warning('Preencha código e nome');
      return;
    }

    try {
      setSalvando(true);
      const method = editando ? 'PUT' : 'POST';
      const url = editando
        ? `${API_BASE_URL}/simuladores/tipos-sessao/${editando.id}`
        : `${API_BASE_URL}/simuladores/tipos-sessao`;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ..._authH() },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(editando ? 'Tipo atualizado!' : 'Tipo criado!');
        fecharModal();
        await carregarTipos();
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
    if (!(await confirmDialog('Excluir este tipo de sessão?'))) return;
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/tipos-sessao/${id}`, {
        method: 'DELETE',
        headers: _authH(),
      });
      if (response.ok) {
        toast.success('Tipo excluído!');
        setTipos((prev) => prev.filter((t) => t.id !== id));
        carregarTipos();
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
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-7 w-40 rounded bg-slate-200 mb-2" />
          <div className="h-4 w-64 rounded bg-slate-100" />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-3 rounded bg-slate-200 dark:bg-slate-700" />
            ))}
          </div>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="px-4 py-3.5 grid grid-cols-4 gap-4 border-b border-gray-100 dark:border-slate-800"
            >
              {[...Array(4)].map((_, j) => (
                <div
                  key={j}
                  className="h-4 rounded bg-slate-100 dark:bg-slate-800"
                  style={{ width: `${55 + Math.sin(i + j) * 20}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {embedded && onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors mb-1"
            >
              <ArrowLeft className="w-3 h-3" />
              Gestão
            </button>
          )}
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">
            Tipos de Sessão
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Classificação de sessões de treinamento
          </p>
        </div>
        <Button onClick={() => abrirModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Tipo
        </Button>
      </div>

      {/* Tabela */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Código
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Nome
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Descrição
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {tipos.map((tipo) => {
              const corTipo = tipo.cor || getColorByIndex(tipo.id);
              return (
                <tr
                  key={tipo.id}
                  className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full border border-gray-300 dark:border-slate-600"
                        style={{ backgroundColor: corTipo }}
                      />
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: corTipo }}
                      >
                        {tipo.codigo}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-sm text-gray-900 dark:text-slate-100">
                    {tipo.nome}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-slate-400">
                    {tipo.descricao || '-'}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => abrirModal(tipo)}
                        className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                      >
                        Editar
                      </Button>
                      <RowActionsMenu
                        label={`Mais ações para ${tipo.codigo}`}
                        actions={[
                          {
                            label: 'Excluir tipo de sessão',
                            destructive: true,
                            icon: Trash2,
                            onSelect: () => excluir(tipo.id),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tipos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-800 mb-4">
            <Inbox className="w-8 h-8 text-gray-400 dark:text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-1">
            Nenhum tipo de sessão cadastrado
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 max-w-md">
            Cadastre tipos de sessão para classificar os modelos de treinamento.
          </p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={fecharModal}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-lg max-w-md w-full animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                {editando ? 'Editar' : 'Novo'} Tipo de Sessão
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Código <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.codigo}
                  onChange={(e) =>
                    setFormData({ ...formData, codigo: e.target.value.toUpperCase() })
                  }
                  placeholder="Ex: INI, PADRAO, OPC"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Treinamento Inicial"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Descrição
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Cor da Tag
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.cor}
                      onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                      className="w-12 h-10 border border-gray-300 dark:border-slate-600 rounded cursor-pointer"
                    />
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                      {formData.cor}
                    </span>
                  </div>
                </div>
                <div
                  className="w-20 h-10 rounded border-2"
                  style={{
                    backgroundColor: formData.cor,
                    borderColor: formData.cor,
                  }}
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3">
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
