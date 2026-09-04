/**
 * CRUD DE SIMULADORES - Padrão do Sistema
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { Button } from '@/react-app/components/UI/Button';
import { Input } from '@/react-app/components/UI/Input';
import { Plus, Trash2, Inbox, ArrowLeft } from 'lucide-react';
import { RowActionsMenu } from '@/react-app/components/UI/RowActionsMenu';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface Simulador {
  id: number;
  nome: string;
  modelo?: string;
  tipo: string;
  fabricante?: string;
  localizacao?: string;
  status: 'ATIVO' | 'MANUTENCAO' | 'INATIVO';
  observacoes?: string;
}

interface ModeloAeronave {
  id: number;
  modelo: string;
  nome: string;
}

interface Props {
  onBack?: () => void;
  embedded?: boolean;
}

export default function CrudSimuladores({ embedded = false, onBack }: Props = {}) {
  const [simuladores, setSimuladores] = useState<Simulador[]>([]);
  const [aeronaves, setAeronaves] = useState<ModeloAeronave[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Simulador | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [formData, setFormData] = useState<Partial<Simulador>>({
    nome: '',
    modelo: '',
    tipo: '',
    fabricante: '',
    localizacao: '',
    status: 'ATIVO',
    observacoes: '',
  });

  useEffect(() => {
    carregarSimuladores();
    carregarAeronaves();
  }, []);

  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showModal]);

  const carregarAeronaves = async () => {
    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/modelos-aeronave`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) setAeronaves(data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar aeronaves:', error);
    }
  };

  const carregarSimuladores = async () => {
    try {
      setLoading(true);
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores?_=${Date.now()}`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) setSimuladores(data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar simuladores:', error);
    } finally {
      setLoading(false);
    }
  };

  const abrirModal = (simulador?: Simulador) => {
    if (simulador) {
      setEditando(simulador);
      setFormData(simulador);
    } else {
      setEditando(null);
      setFormData({
        nome: '',
        modelo: '',
        tipo: '',
        fabricante: '',
        localizacao: '',
        status: 'ATIVO',
        observacoes: '',
      });
    }
    setShowModal(true);
  };

  const fecharModal = () => {
    setShowModal(false);
    setEditando(null);
  };

  const salvar = async () => {
    if (!formData.nome || !formData.tipo) {
      toast.warning('Preencha nome e tipo de aeronave');
      return;
    }

    try {
      setSalvando(true);
      const method = editando ? 'PUT' : 'POST';
      const url = editando
        ? `${API_BASE_URL}/simuladores/${editando.id}`
        : `${API_BASE_URL}/simuladores`;

      const token = getAccessToken();
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(editando ? 'Simulador atualizado!' : 'Simulador criado!');
        fecharModal();
        await carregarSimuladores();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erro ao salvar simulador');
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao salvar simulador');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: number) => {
    if (!(await confirmDialog('Excluir este simulador?'))) return;
    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) {
        toast.success('Simulador excluído!');
        setSimuladores((prev) => prev.filter((s) => s.id !== id));
        carregarSimuladores();
      } else {
        const error = await response.json();
        if (response.status === 404 || error?.code === 'SIMULADOR_NOT_FOUND') {
          toast.success('Simulador já estava excluído. Lista atualizada.');
          setSimuladores((prev) => prev.filter((s) => s.id !== id));
          await carregarSimuladores();
          return;
        }
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
          <div className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 grid grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-3 rounded bg-slate-200 dark:bg-slate-700" />
            ))}
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-3.5 grid grid-cols-6 gap-4 border-b border-gray-100 dark:border-slate-800">
              {[...Array(6)].map((_, j) => (
                <div key={j} className="h-4 rounded bg-slate-100 dark:bg-slate-800" style={{ width: `${55 + Math.sin(i + j) * 20}%` }} />
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
            <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors mb-1">
              <ArrowLeft className="w-3 h-3" />
              Gestão
            </button>
          )}
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Simuladores</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Gerencie os simuladores de voo disponíveis</p>
        </div>
        <Button onClick={() => abrirModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Simulador
        </Button>
      </div>

      {/* Tabela */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Nome
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Equipamento
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Localização
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Empresa
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {simuladores.map((sim) => (
              <tr key={sim.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3.5 font-medium text-sm text-gray-900 dark:text-slate-100">{sim.nome}</td>
                <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-slate-400">{sim.tipo}</td>
                <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-slate-400">{sim.localizacao || '-'}</td>
                <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-slate-400">{sim.fabricante || '-'}</td>
                <td className="px-4 py-3.5 text-center">
                  <span
                    className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium ${
                      sim.status === 'ATIVO'
                        ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                        : sim.status === 'MANUTENCAO'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-400'
                    }`}
                  >
                    {sim.status === 'ATIVO' ? 'Ativo' : sim.status === 'MANUTENCAO' ? 'Em Manutenção' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => abrirModal(sim)}
                      className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                    >
                      Editar
                    </Button>
                    <RowActionsMenu
                      label={`Mais ações para ${sim.nome}`}
                      actions={[
                        {
                          label: 'Excluir simulador',
                          destructive: true,
                          icon: Trash2,
                          onSelect: () => excluir(sim.id),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {simuladores.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-800 mb-4">
            <Inbox className="w-8 h-8 text-gray-400 dark:text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-1">Nenhum simulador cadastrado</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 max-w-md">Cadastre seu primeiro simulador para começar a criar sessões de treinamento.</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={fecharModal}>
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-lg w-full animate-scale-in max-h-[calc(100dvh-2rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{editando ? 'Editar' : 'Novo'} Simulador</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Nome <span className="text-red-500">*</span></label>
                <Input
                  value={formData.nome || ''}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Equipamento <span className="text-red-500">*</span></label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                  value={formData.tipo || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, tipo: e.target.value, modelo: e.target.value })
                  }
                >
                  <option value="">Selecione</option>
                  {aeronaves.map((a) => (
                    <option key={a.id} value={a.modelo}>
                      {a.modelo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Localização
                  </label>
                  <Input
                    value={formData.localizacao || ''}
                    onChange={(e) => setFormData({ ...formData, localizacao: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Empresa</label>
                  <Input
                    value={formData.fabricante || ''}
                    onChange={(e) => setFormData({ ...formData, fabricante: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Status</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                  value={formData.status || 'ATIVO'}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as Simulador['status'] })
                  }
                >
                  <option value="ATIVO">Ativo</option>
                  <option value="MANUTENCAO">Em Manutenção</option>
                  <option value="INATIVO">Inativo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Observações</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100"
                  value={formData.observacoes || ''}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={3}
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
