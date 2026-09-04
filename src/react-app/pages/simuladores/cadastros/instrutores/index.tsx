/**
 * CRUD DE INSTRUTORES
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import { SimuladoresCard, EmptyState } from '../../components/SimuladoresLayout';
import { Plus, Users, Trash2 } from 'lucide-react';
import { RowActionsMenu } from '@/react-app/components/UI/RowActionsMenu';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface Instrutor {
  id: number;
  funcionario_id: number;
  funcionario_nome: string;
  habilitacoes?: string;
  observacoes?: string;
}

interface FuncionarioOpcao {
  id: number;
  nome: string;
}

export default function CrudInstrutores() {
  const [instrutores, setInstrutores] = useState<Instrutor[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncionarioOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [instrutorEditando, setInstrutorEditando] = useState<Instrutor | null>(null);
  const [formData, setFormData] = useState({
    funcionario_id: '',
    habilitacoes: '',
    observacoes: '',
  });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarInstrutores();
    carregarFuncionarios();
  }, []);

  const carregarFuncionarios = async () => {
    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/funcionarios?limit=500&status=true`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setFuncionarios(
            (data.data || []).map((f: { id: number; nome: string }) => ({
              id: f.id,
              nome: f.nome,
            })),
          );
        }
      }
    } catch (error) {
      console.error('Erro ao carregar funcionários:', error);
    }
  };

  const carregarInstrutores = async () => {
    try {
      setCarregando(true);
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/instrutores`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) setInstrutores(data.data || []);
      }
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setCarregando(false);
    }
  };

  const abrirModal = (instrutor?: Instrutor) => {
    if (instrutor) {
      setInstrutorEditando(instrutor);
      setFormData({
        funcionario_id: instrutor.funcionario_id.toString(),
        habilitacoes: instrutor.habilitacoes || '',
        observacoes: instrutor.observacoes || '',
      });
    } else {
      setInstrutorEditando(null);
      setFormData({ funcionario_id: '', habilitacoes: '', observacoes: '' });
    }
    setModalAberto(true);
  };

  const salvar = async () => {
    if (!formData.funcionario_id) {
      toast.warning('Por favor, selecione um funcionário');
      return;
    }

    try {
      setSalvando(true);
      const url = instrutorEditando
        ? `${API_BASE_URL}/simuladores/instrutores/${instrutorEditando.id}`
        : `${API_BASE_URL}/simuladores/instrutores`;

      const response = await fetch(url, {
        method: instrutorEditando ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.warning(`Instrutor ${instrutorEditando ? 'atualizado' : 'cadastrado'} com sucesso!`);
        setModalAberto(false);
        carregarInstrutores();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.warning(`Erro ao salvar instrutor: ${errorData.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.warning('Não foi possível salvar o instrutor. Verifique a conexão.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: number) => {
    if (!(await confirmDialog('Tem certeza que deseja remover este instrutor?'))) return;

    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/instrutores/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });

      if (response.ok) {
        toast.warning('Instrutor removido com sucesso!');
        carregarInstrutores();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.warning(`Erro ao remover instrutor: ${errorData.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.warning('Não foi possível remover o instrutor. Verifique a conexão.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-4">
        <button
          onClick={() => abrirModal()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Novo Instrutor
        </button>
      </div>
      {!carregando && (
        <SimuladoresCard padding="none">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Habilitações
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Observações
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {instrutores.map((inst) => (
                <tr key={inst.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    <FuncionarioLink
                      funcionarioId={inst.funcionario_id}
                      nome={inst.funcionario_nome}
                      className="text-sm font-medium text-slate-900"
                    />
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{inst.habilitacoes || '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{inst.observacoes || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => abrirModal(inst)}
                        className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                      >
                        Editar
                      </button>
                      <RowActionsMenu
                        label={`Mais ações para instrutor ${inst.funcionario_nome}`}
                        actions={[
                          {
                            label: 'Remover instrutor',
                            destructive: true,
                            icon: Trash2,
                            onSelect: () => excluir(inst.id),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {instrutores.length === 0 && (
            <EmptyState
              icon={<Users className="w-12 h-12" />}
              title="Nenhum instrutor cadastrado"
              description="Comece adicionando um novo instrutor de simulador."
            />
          )}
        </SimuladoresCard>
      )}

      {/* Modal */}
      {modalAberto && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {instrutorEditando ? 'Editar Instrutor' : 'Novo Instrutor'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Funcionário <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.funcionario_id}
                  onChange={(e) => setFormData({ ...formData, funcionario_id: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Selecione um funcionário</option>
                  {funcionarios.map((f) => (
                    <option key={f.id} value={f.id.toString()}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Habilitações
                </label>
                <input
                  type="text"
                  value={formData.habilitacoes}
                  onChange={(e) => setFormData({ ...formData, habilitacoes: e.target.value })}
                  placeholder="Ex: A320, B737, E195"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Observações</label>
                <textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  rows={3}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setModalAberto(false)}
                disabled={salvando}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
