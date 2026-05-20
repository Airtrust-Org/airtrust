import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { Plus, Search, FileText, SearchX } from 'lucide-react';
import { EmptyState } from '@/react-app/components/ui/EmptyState';
// 🚀 LAZY LOADING: XLSX carregado dinamicamente apenas quando necessário (exportarParaExcel)
import { useAuth } from '@/react-app/hooks/useAuth';
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

interface Treinamento {
  id: number;
  funcionario_nome?: string;
  categoria: string;
  numero?: string;
  data_vencimento: string;
  status_calculado?: 'VALIDO' | 'VENCENDO' | 'VENCIDO';
}

const Treinamentos = () => {
  const { token } = useAuth();
  const [treinamentos, setTreinamentos] = useState<Treinamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [filtroFuncionario, setFiltroFuncionario] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [qualificacaoEdicao, setQualificacaoEdicao] = useState<any>(null);

  useEffect(() => {
    carregarTreinamentos();
  }, []);

  const carregarTreinamentos = async () => {
    try {
      setLoading(true);
      const data = await fetchAPI<QualificacoesResponse>('/api/qualificacoes');
      setTreinamentos(data.qualificacoes || []);
    } catch (error) {
      console.error('Erro ao carregar treinamentos:', error);
      toast.warning('Erro ao carregar treinamentos. Verifique se o servidor está rodando.');
    } finally {
      setLoading(false);
    }
  };

  const filtrados = treinamentos.filter((t) => {
    const matchFiltro =
      t.funcionario_nome?.toLowerCase().includes(filtro.toLowerCase()) ||
      t.categoria?.toLowerCase().includes(filtro.toLowerCase());
    const matchFuncionario =
      !filtroFuncionario ||
      t.funcionario_nome?.toLowerCase().includes(filtroFuncionario.toLowerCase());
    return matchFiltro && matchFuncionario;
  });

  const handleNovo = () => {
    setQualificacaoEdicao(null);
    setModalAberto(true);
  };

  const handleEditar = (t: Treinamento) => {
    setQualificacaoEdicao(t);
    setModalAberto(true);
  };

  const handleSalvar = () => {
    setModalAberto(false);
    carregarTreinamentos();
  };

  const handleExcluir = async (id: number) => {
    if (!(await confirmDialog('Deseja excluir?'))) return;
    try {
      await apiFetch(`/api/qualificacoes/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      carregarTreinamentos();
    } catch (error) {
      console.error('Erro:', error);
    }
  };

  const exportarParaExcel = async () => {
    const XLSX = await import('xlsx');

    const dadosExportacao = filtrados.map((t) => ({
      Funcionário: t.funcionario_nome || '-',
      Categoria: t.categoria || '-',
      Número: t.numero || '-',
      Validade: formatarData(t.data_vencimento),
      Status: t.status_calculado || 'VALIDO',
    }));

    const ws = XLSX.utils.json_to_sheet(dadosExportacao);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Treinamentos');

    const hoje = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `treinamentos_${hoje}.xlsx`);
  };

  if (loading) return <div className="text-center py-10">Carregando...</div>;

  return (
    <div>
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex gap-3 flex-1 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar treinamentos..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
            <input
              type="text"
              placeholder="Filtrar por funcionário..."
              value={filtroFuncionario}
              onChange={(e) => setFiltroFuncionario(e.target.value)}
              className="w-64  py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2 ml-4">
            <button
              onClick={exportarParaExcel}
              className="flex items-center gap-2  py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              📊 Exportar Excel
            </button>
            <button
              onClick={handleNovo}
              className="flex items-center gap-2  py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              Novo Treinamento
            </button>
          </div>
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
            {filtrados.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className=" py-4 text-sm font-medium text-gray-900">
                  <FuncionarioLink
                    nome={t.funcionario_nome || 'Sem nome'}
                    className="hover:text-primary hover:underline"
                  />
                </td>
                <td className=" py-4 text-sm text-gray-500">{t.categoria}</td>
                <td className=" py-4 text-sm text-gray-500">{t.numero}</td>
                <td className=" py-4 text-sm text-gray-500">{formatarData(t.data_vencimento)}</td>
                <td className=" py-4">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(
                      t.status_calculado || 'VALIDO',
                    )}`}
                  >
                    {t.status_calculado || 'VALIDO'}
                  </span>
                </td>
                <td className=" py-4 text-sm">
                  <button
                    onClick={() => window.open(`/api/certificados/gerar/${t.id}`, '_blank')}
                    className="text-green-600 hover:text-green-900 mr-3"
                    title="Gerar Certificado"
                  >
                    <FileText className="w-4 h-4 inline" />
                  </button>
                  <button
                    onClick={() => handleEditar(t)}
                    className="text-primary hover:text-blue-900 mr-3"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleExcluir(t.id)}
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
              title="Nenhum treinamento"
              description="Não foram encontrados treinamentos para exibir."
            />
          </div>
        )}
      </div>

      <Modal
        isOpen={modalAberto}
        onClose={() => setModalAberto(false)}
        title={qualificacaoEdicao ? 'Editar Qualificação' : 'Nova Qualificação'}
      >
        <FormularioQualificacao
          qualificacao={qualificacaoEdicao}
          onSave={handleSalvar}
          onCancel={() => setModalAberto(false)}
        />
      </Modal>
    </div>
  );
};

export default Treinamentos;
