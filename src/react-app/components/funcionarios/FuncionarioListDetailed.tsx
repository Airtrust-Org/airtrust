import { useState } from 'react';
import { Edit, Trash2, CheckCircle, XCircle, Plus, Settings } from 'lucide-react';
import Button from '../Button';
import Badge from '../Badge';
import { BaseModal as Modal } from '../modals/BaseModal';
import FuncionarioForm from './FuncionarioForm';
import GerenciarAeronavesModal from './GerenciarAeronavesModal';

interface Aeronave {
  codigo: string;
  status: string;
}

interface Funcionario {
  id: number;
  nome: string;
  matricula?: string;
  cpf?: string;
  codigo_anac?: string;
  funcao: string;
  base?: string;
  contrato?: string;
  telefone?: string;
  email?: string;
  status: string;
  is_instrutor: number;
  is_checador: number;
  aeronave_principal?: string;
  anv?: string;
  licenca_aeronautica?: string;
  aeronaves?: Aeronave[];
}

interface FuncionarioListDetailedProps {
  funcionarios: Funcionario[];
  onEdit: (funcionario: Funcionario) => void;
  onDelete: (id: number, nome: string) => void;
  onAdd: (data: any) => void;
}

const FuncionarioListDetailed: React.FC<FuncionarioListDetailedProps> = ({
  funcionarios,
  onEdit,
  onDelete,
  onAdd,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [gerenciarAeronavesModal, setGerenciarAeronavesModal] = useState<{
    isOpen: boolean;
    funcionario?: Funcionario;
  }>({
    isOpen: false,
  });

  const filteredFuncionarios =
    funcionarios?.filter((funcionario) => {
      const matchesSearch =
        !searchTerm ||
        funcionario.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        funcionario.matricula?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        funcionario.email?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = !statusFilter || funcionario.status === statusFilter;

      return matchesSearch && matchesStatus;
    }) || [];

  const handleGerenciarAeronaves = (funcionario: Funcionario) => {
    setGerenciarAeronavesModal({ isOpen: true, funcionario });
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Funcionários</h2>
            <p className="text-sm text-gray-600">{filteredFuncionarios.length} funcionários</p>
          </div>
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Funcionário
          </Button>
        </div>

        {/* Filtros */}
        <div className="mt-4 flex space-x-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por nome, matrícula ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="">Todos os status</option>
            <option value="ATIVO">Ativo</option>
            <option value="INATIVO">Inativo</option>
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Matrícula
              </th>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nome
              </th>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Função
              </th>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Equipamentos
              </th>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="py-3 px-6 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          {filteredFuncionarios.length > 0 && (
            <tbody className="divide-y divide-gray-200">
              {filteredFuncionarios.map((funcionario) => (
                <tr key={funcionario.id} className="hover:bg-gray-50">
                  <td className="py-4 px-6">
                    <div className="font-mono text-sm font-medium text-primary">
                      {funcionario.matricula}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div>
                      <div className="font-medium text-gray-900">
                        {funcionario.nome || 'Nome não informado'}
                      </div>
                      <div className="text-sm text-gray-500">{funcionario.email}</div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <Badge variant="neutral">{funcionario.funcao || 'COLABORADOR'}</Badge>
                  </td>
                  <td className="py-4 px-6">
                    <div className="space-y-1">
                      {/* Equipamentos Habilitados */}
                      <div className="flex flex-wrap gap-1">
                        {funcionario.aeronaves && funcionario.aeronaves.length > 0 ? (
                          funcionario.aeronaves.map((aeronave) => (
                            <Badge
                              key={aeronave.codigo}
                              variant={aeronave.status === 'ATIVO' ? 'success' : 'neutral'}
                            >
                              {aeronave.codigo}
                            </Badge>
                          ))
                        ) : funcionario.anv ? (
                          <Badge variant="success">{funcionario.anv}</Badge>
                        ) : (
                          <span className="text-sm text-gray-500">Sem equipamento</span>
                        )}
                      </div>

                      {/* Licença */}
                      {funcionario.licenca_aeronautica && (
                        <div className="text-xs text-gray-500">
                          {funcionario.licenca_aeronautica}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    {funcionario.status === 'ATIVO' ? (
                      <Badge variant="success">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="danger">
                        <XCircle className="w-3 h-3 mr-1" />
                        Inativo
                      </Badge>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex justify-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1"
                        onClick={() => onEdit(funcionario)}
                        title="Editar funcionário"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 text-primary hover:text-blue-700"
                        onClick={() => handleGerenciarAeronaves(funcionario)}
                        title="Gerenciar equipamentos"
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 text-red-600 hover:text-red-700"
                        onClick={() => onDelete(funcionario.id, funcionario.nome)}
                        title="Excluir funcionário"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>

        {filteredFuncionarios.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {searchTerm
                ? 'Nenhum funcionário encontrado com os filtros aplicados.'
                : 'Nenhum funcionário cadastrado ainda.'}
            </p>
          </div>
        )}
      </div>

      {/* Modais */}
      {showForm && (
        <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Novo Funcionário">
          <FuncionarioForm
            onSubmit={(data: any) => {
              onAdd(data);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}

      {gerenciarAeronavesModal.isOpen && (
        <GerenciarAeronavesModal
          funcionario={gerenciarAeronavesModal.funcionario!}
          isOpen={gerenciarAeronavesModal.isOpen}
          onClose={() => setGerenciarAeronavesModal({ isOpen: false })}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}
    </div>
  );
};

export default FuncionarioListDetailed;
