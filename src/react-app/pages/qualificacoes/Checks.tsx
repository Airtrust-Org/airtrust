import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { Plus, Search, SearchX } from 'lucide-react';
import { EmptyState } from '@/react-app/components/ui/EmptyState';
import { BaseModal as Modal } from '../../components/modals/BaseModal';
import FormularioQualificacao from './FormularioQualificacao';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import {
  fetchAPI,
  getStatusBadgeClass,
  formatarData,
  QualificacoesResponse,
} from '@/react-app/utils/qualificacoesUtils';

interface Check {
  id: number;
  funcionario_nome?: string;
  categoria: string;
  numero?: string;
  data_vencimento: string;
  status_calculado?: 'VALIDO' | 'VENCENDO' | 'VENCIDO';
}

const Checks = () => {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [checkEdicao, setCheckEdicao] = useState<any>(null);

  useEffect(() => {
    carregarChecks();
  }, []);

  const carregarChecks = async () => {
    try {
      setLoading(true);
      const data = await fetchAPI<QualificacoesResponse>('/api/qualificacoes');
      const checksData = (data.qualificacoes || []).filter((q) => q.tipo === 'CHECK');
      setChecks(checksData);
    } catch (error) {
      console.error('Erro ao carregar checks:', error);
      toast.warning('Erro ao carregar checks. Verifique se o servidor está rodando.');
    } finally {
      setLoading(false);
    }
  };

  const filtrados = checks.filter(
    (c) =>
      c.funcionario_nome?.toLowerCase().includes(filtro.toLowerCase()) ||
      c.categoria?.toLowerCase().includes(filtro.toLowerCase()),
  );

  const handleNovo = () => {
    setCheckEdicao({ tipo: 'CHECK' }); // Pre-set tipo como CHECK
    setModalAberto(true);
  };

  const handleEditar = (check: Check) => {
    setCheckEdicao(check);
    setModalAberto(true);
  };

  const handleExcluir = async (id: number) => {
    if (!(await confirmDialog('Deseja realmente excluir este check?'))) return;

    try {
      const response = await apiFetch(`/api/qualificacoes/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        carregarChecks();
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.warning('Erro ao excluir check');
    }
  };

  const handleSalvar = () => {
    setModalAberto(false);
    setCheckEdicao(null);
    carregarChecks();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar checks..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <button
            onClick={handleNovo}
            className="flex items-center gap-2  py-2 bg-primary text-white rounded-lg hover:bg-primary/90 ml-4"
          >
            <Plus className="w-4 h-4" />
            Novo Check
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className=" py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Funcionário
              </th>
              <th className=" py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Categoria
              </th>
              <th className=" py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Número
              </th>
              <th className=" py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Validade
              </th>
              <th className=" py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className=" py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtrados.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className=" py-4 text-sm font-medium text-gray-900">
                  <FuncionarioLink
                    nome={c.funcionario_nome || 'Sem nome'}
                    className="hover:text-primary hover:underline"
                  />
                </td>
                <td className=" py-4 text-sm text-gray-500">{c.categoria}</td>
                <td className=" py-4 text-sm text-gray-500">{c.numero || '-'}</td>
                <td className=" py-4 text-sm text-gray-500">{formatarData(c.data_vencimento)}</td>
                <td className=" py-4">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(c.status_calculado || 'VALIDO')}`}
                  >
                    {c.status_calculado || 'VALIDO'}
                  </span>
                </td>
                <td className=" py-4 text-sm">
                  <button
                    onClick={() => handleEditar(c)}
                    className="text-primary hover:text-blue-900 mr-3"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleExcluir(c.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtrados.length === 0 && (
          <div className="py-10">
            <EmptyState
              icon={<SearchX size={48} className="text-slate-300" />}
              title="Nenhum check"
              description="Não foram encontrados checks para exibir."
            />
          </div>
        )}
      </div>

      <Modal
        isOpen={modalAberto}
        onClose={() => setModalAberto(false)}
        title={checkEdicao?.id ? 'Editar Check' : 'Novo Check'}
      >
        <FormularioQualificacao
          qualificacao={checkEdicao}
          onSave={handleSalvar}
          onCancel={() => setModalAberto(false)}
        />
      </Modal>
    </div>
  );
};

export default Checks;
