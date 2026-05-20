// @ts-nocheck
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { Plus, Settings, Edit, Trash2, Eye, Filter, Search } from 'lucide-react';
import Button from '../../components/Button';
import Card from '../../components/Card';
import { BaseModal as Modal } from '../../components/modals/BaseModal';
import EquipamentoForm from '../../components/simuladores/EquipamentoForm';

import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface Simulador {
  id: number;
  nome: string;
  codigo_identificacao: string;
  tipo_simulador: string;
  aeronave_base: string;
  empresa_local?: string;
  fabricante?: string;
  modelo?: string;
  status: string;
  configuracao_tecnica?: any;
  created_at: string;
  updated_at?: string;
}

const Equipamentos: React.FC = () => {
  const [simuladores, setSimuladores] = useState<Simulador[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [equipamentoEditando, setEquipamentoEditando] = useState<Simulador | null>(null);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [equipamentoSelecionado, setEquipamentoSelecionado] = useState<Simulador | null>(null);

  // Filtros
  const [filtros, setFiltros] = useState({
    busca: '',
    tipo_simulador: '',
    status: '',
    aeronave_base: '',
  });

  useEffect(() => {
    carregarSimuladores();
  }, []);

  const carregarSimuladores = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/equipamentos`);
      const data = await response.json();

      if (data.success) {
        setSimuladores(data.data);
      } else {
        console.error('Erro ao carregar simuladores:', data.error);
      }
    } catch (error) {
      console.error('Erro ao carregar simuladores:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSalvarEquipamento = async (dados: any) => {
    try {
      const url = equipamentoEditando
        ? `/api/simuladores/equipamentos/${equipamentoEditando.id}`
        : '/api/simuladores/equipamentos';

      const method = equipamentoEditando ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });

      const result = await response.json();

      if (result.success) {
        await carregarSimuladores();
        setShowForm(false);
        setEquipamentoEditando(null);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Erro ao salvar simulador:', error);
      showAlertDialog(
        `Erro ao ${equipamentoEditando ? 'atualizar' : 'criar'} simulador: ${
          error instanceof Error ? error.message : 'Erro desconhecido'
        }`,
      );
    }
  };

  const handleEditarEquipamento = (equipamento: Simulador) => {
    setEquipamentoEditando(equipamento);
    setShowForm(true);
  };

  const handleVisualizarEquipamento = (equipamento: Simulador) => {
    setEquipamentoSelecionado(equipamento);
    setShowDetalhes(true);
  };

  const handleExcluirEquipamento = async (equipamento: Simulador) => {
    if (
      !(await confirmDialog(`Tem certeza que deseja excluir o simulador "${equipamento.nome}"?`))
    ) {
      return;
    }

    try {
      const response = await apiFetch(`/api/simuladores/equipamentos/${equipamento.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        await carregarSimuladores();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Erro ao excluir simulador:', error);
      showAlertDialog(
        `Erro ao excluir simulador: ${
          error instanceof Error ? error.message : 'Erro desconhecido'
        }`,
      );
    }
  };

  const simuladoresFiltrados = simuladores.filter((sim) => {
    const matchBusca =
      !filtros.busca ||
      sim.nome.toLowerCase().includes(filtros.busca.toLowerCase()) ||
      sim.codigo_identificacao.toLowerCase().includes(filtros.busca.toLowerCase());

    const matchTipo = !filtros.tipo_simulador || sim.tipo_simulador === filtros.tipo_simulador;
    const matchStatus = !filtros.status || sim.status === filtros.status;
    const matchAeronave = !filtros.aeronave_base || sim.aeronave_base === filtros.aeronave_base;

    return matchBusca && matchTipo && matchStatus && matchAeronave;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ATIVO':
        return 'bg-green-100 text-green-800';
      case 'MANUTENCAO':
        return 'bg-yellow-100 text-yellow-800';
      case 'INATIVO':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const tiposSimulador = ['FFS', 'FNPT-I', 'FNPT-II', 'BITD'];
  const statusOptions = ['ATIVO', 'MANUTENCAO', 'INATIVO'];
  const aeronavesUnicas = [...new Set(simuladores.map((s) => s.aeronave_base))];

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-4">
        <Button
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Simulador
        </Button>
      </div>
      {/* Filtros */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar simulador..."
              value={filtros.busca}
              onChange={(e) => setFiltros((prev) => ({ ...prev, busca: e.target.value }))}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <select
            value={filtros.tipo_simulador}
            onChange={(e) => setFiltros((prev) => ({ ...prev, tipo_simulador: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="">Todos os tipos</option>
            {tiposSimulador.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>

          <select
            value={filtros.status}
            onChange={(e) => setFiltros((prev) => ({ ...prev, status: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="">Todos os status</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            value={filtros.aeronave_base}
            onChange={(e) => setFiltros((prev) => ({ ...prev, aeronave_base: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="">Todos os equipamentos</option>
            {aeronavesUnicas.map((aeronave) => (
              <option key={aeronave} value={aeronave}>
                {aeronave}
              </option>
            ))}
          </select>

          <Button
            variant="secondary"
            onClick={() =>
              setFiltros({ busca: '', tipo_simulador: '', status: '', aeronave_base: '' })
            }
          >
            <Filter className="w-4 h-4 mr-2" />
            Limpar
          </Button>
        </div>
      </Card>

      {/* Lista de Simuladores */}
      {loading ? (
        <div className="text-center py-8">
          <div className="text-gray-600">Carregando simuladores...</div>
        </div>
      ) : (
        <div className="grid gap-6">
          {simuladoresFiltrados.map((simulador) => (
            <Card key={simulador.id} className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-primary/20 rounded-lg">
                    <Settings className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{simulador.nome}</h3>
                    <p className="text-gray-600">{simulador.codigo_identificacao}</p>
                    <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                      <span>Tipo: {simulador.tipo_simulador}</span>
                      <span>•</span>
                      <span>Equipamento: {simulador.aeronave_base}</span>
                      {simulador.empresa_local && (
                        <>
                          <span>•</span>
                          <span>{simulador.empresa_local}</span>
                        </>
                      )}
                    </div>
                    {simulador.fabricante && (
                      <div className="mt-1 text-sm text-gray-500">
                        Fabricante: {simulador.fabricante}
                        {simulador.modelo && ` - ${simulador.modelo}`}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                      simulador.status,
                    )}`}
                  >
                    {simulador.status}
                  </span>

                  <div className="flex space-x-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleVisualizarEquipamento(simulador)}
                      title="Visualizar detalhes"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleEditarEquipamento(simulador)}
                      title="Editar simulador"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleExcluirEquipamento(simulador)}
                      title="Excluir simulador"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {simuladoresFiltrados.length === 0 && (
            <Card className="p-8 text-center">
              <Settings className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">
                {filtros.busca || filtros.tipo_simulador || filtros.status || filtros.aeronave_base
                  ? 'Nenhum simulador encontrado com os filtros aplicados'
                  : 'Nenhum simulador cadastrado'}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Modal de Formulário */}
      <Modal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEquipamentoEditando(null);
        }}
        title={equipamentoEditando ? 'Editar Simulador' : 'Novo Simulador'}
        size="2xl"
      >
        <EquipamentoForm
          equipamento={equipamentoEditando}
          onSalvar={handleSalvarEquipamento}
          onCancelar={() => {
            setShowForm(false);
            setEquipamentoEditando(null);
          }}
        />
      </Modal>

      {/* Modal de Detalhes */}
      <Modal
        isOpen={showDetalhes}
        onClose={() => {
          setShowDetalhes(false);
          setEquipamentoSelecionado(null);
        }}
        title="Detalhes do Simulador"
        size="lg"
      >
        {equipamentoSelecionado && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500">Nome</label>
                <p className="mt-1 text-sm text-gray-900">{equipamentoSelecionado.nome}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Código</label>
                <p className="mt-1 text-sm text-gray-900">
                  {equipamentoSelecionado.codigo_identificacao}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Tipo</label>
                <p className="mt-1 text-sm text-gray-900">
                  {equipamentoSelecionado.tipo_simulador}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Equipamento Base</label>
                <p className="mt-1 text-sm text-gray-900">{equipamentoSelecionado.aeronave_base}</p>
              </div>
              {equipamentoSelecionado.empresa_local && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">Empresa/Local</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {equipamentoSelecionado.empresa_local}
                  </p>
                </div>
              )}
              {equipamentoSelecionado.fabricante && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">Fabricante</label>
                  <p className="mt-1 text-sm text-gray-900">{equipamentoSelecionado.fabricante}</p>
                </div>
              )}
            </div>

            {equipamentoSelecionado.configuracao_tecnica && (
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-900 mb-2">Configuração Técnica</h4>
                <div className="bg-gray-50 p-3 rounded">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                    {typeof equipamentoSelecionado.configuracao_tecnica === 'string'
                      ? equipamentoSelecionado.configuracao_tecnica
                      : JSON.stringify(equipamentoSelecionado.configuracao_tecnica, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Equipamentos;
