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

interface Exame {
  id: number;
  funcionario_nome?: string;
  categoria: string;
  numero?: string;
  data_vencimento: string;
  status_calculado?: 'VALIDO' | 'VENCENDO' | 'VENCIDO';
}

const Exames = () => {
  const [exames, setExames] = useState<Exame[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [exameEdicao, setExameEdicao] = useState<any>(null);

  useEffect(() => {
    carregarExames();
  }, []);

  const carregarExames = async () => {
    try {
      setLoading(true);
      const data = await fetchAPI<QualificacoesResponse>('/api/qualificacoes');
      const examesData = (data.qualificacoes || []).filter((q) => q.tipo === 'EXAME');
      setExames(examesData);
    } catch (error) {
      console.error('Erro ao carregar exames:', error);
      toast.warning('Erro ao carregar exames. Verifique se o servidor está rodando.');
    } finally {
      setLoading(false);
    }
  };

  const filtrados = exames.filter(
    (e) =>
      e.funcionario_nome?.toLowerCase().includes(filtro.toLowerCase()) ||
      e.categoria?.toLowerCase().includes(filtro.toLowerCase()),
  );

  const handleNovo = () => {
    setExameEdicao({ tipo: 'EXAME' }); // Pre-set tipo como EXAME
    setModalAberto(true);
  };

  const handleEditar = (exame: Exame) => {
    setExameEdicao(exame);
    setModalAberto(true);
  };

  const handleExcluir = async (id: number) => {
    if (!(await confirmDialog('Deseja realmente excluir este exame?'))) return;

    try {
      const response = await apiFetch(`/api/qualificacoes/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        carregarExames();
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.warning('Erro ao excluir exame');
    }
  };

  const handleSalvar = () => {
    setModalAberto(false);
    setExameEdicao(null);
    carregarExames();
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
                placeholder="Buscar exames..."
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
            Novo Exame
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
            {filtrados.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className=" py-4 text-sm font-medium text-gray-900">
                  <FuncionarioLink
                    nome={e.funcionario_nome || 'Sem nome'}
                    className="hover:text-primary hover:underline"
                  />
                </td>
                <td className=" py-4 text-sm text-gray-500">{e.categoria}</td>
                <td className=" py-4 text-sm text-gray-500">{e.numero || '-'}</td>
                <td className=" py-4 text-sm text-gray-500">{formatarData(e.data_vencimento)}</td>
                <td className=" py-4">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(e.status_calculado || 'VALIDO')}`}
                  >
                    {e.status_calculado || 'VALIDO'}
                  </span>
                </td>
                <td className=" py-4 text-sm">
                  <button
                    onClick={() => handleEditar(e)}
                    className="text-primary hover:text-blue-900 mr-3"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleExcluir(e.id)}
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
              title="Nenhum exame"
              description="Não foram encontrados exames para exibir."
            />
          </div>
        )}
      </div>

      <Modal
        isOpen={modalAberto}
        onClose={() => setModalAberto(false)}
        title={exameEdicao?.id ? 'Editar Exame' : 'Novo Exame'}
      >
        <FormularioQualificacao
          qualificacao={exameEdicao}
          onSave={handleSalvar}
          onCancel={() => setModalAberto(false)}
        />
      </Modal>
    </div>
  );
};

export default Exames;
