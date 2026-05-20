import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';

import { Search, User, Edit2, Mail, Trash2, FolderOpen, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Card,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  EmptyState,
  VirtualTable,
} from '@/react-app/components/UI';
import Button from '@/react-app/components/Button';
import { DetalhesModal } from './DetalhesModal';
import { useDebounce } from '@/react-app/hooks/useDebounce';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
  cargo: string;
  funcao?: string;
  departamento?: string;
  status?: 'ATIVO' | 'INATIVO' | 'AFASTADO' | 'FERIAS' | 'DEMITIDO';
  admissao: string;
  email?: string;
  telefone?: string;
  avatar_url?: string;
  setor?: string;
}

interface ListaTabProps {
  funcionarios?: Funcionario[];
  loading?: boolean;
}

const getStatusBadgeVariant = (
  status: string,
): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
  switch (status) {
    case 'ATIVO':
      return 'success';
    case 'AFASTADO':
      return 'warning';
    case 'INATIVO':
      return 'default';
    case 'FERIAS':
      return 'info';
    case 'DEMITIDO':
      return 'danger';
    default:
      return 'default';
  }
};

export const ListaTab: React.FC<ListaTabProps> = ({ funcionarios = [], loading = false }) => {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cargoFilter, setCargoFilter] = useState<string>('all');
  const [selectedFuncionario, setSelectedFuncionario] = useState<Funcionario | null>(null);

  // ✅ Debounce na busca (300ms)
  const debouncedBusca = useDebounce(busca, 300);

  // ✅ Memoizar filtro para evitar recálculos desnecessários
  const resolveStatus = (f: Funcionario): string => {
    // Backend v2 envia "ativo" boolean; UI antiga espera "status" string
    const ativoBoolean = (f as unknown as { ativo?: boolean })?.ativo;
    if (f.status) {
      const normalizedStatus = f.status.toUpperCase();
      return normalizedStatus === 'DESLIGADO' ? 'INATIVO' : normalizedStatus;
    }
    if (typeof ativoBoolean === 'boolean') return ativoBoolean ? 'ATIVO' : 'INATIVO';
    return 'ATIVO';
  };

  const safeFormatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return format(d, 'dd/MM/yyyy', { locale: ptBR });
  };

  const departamentos = (f: Funcionario) => (f.departamento || f.setor || '-') as string;

  const funcionariosFiltrail = useMemo(() => {
    return funcionarios.filter((func) => {
      if (
        debouncedBusca &&
        !func.nome.toLowerCase().includes(debouncedBusca.toLowerCase()) &&
        !func.matricula.includes(debouncedBusca) &&
        !func.email?.toLowerCase().includes(debouncedBusca.toLowerCase())
      ) {
        return false;
      }
      const st = resolveStatus(func);
      if (statusFilter !== 'all' && st !== statusFilter) {
        return false;
      }
      const cargoOuFuncao = func.funcao || func.cargo;
      if (cargoFilter !== 'all' && cargoOuFuncao !== cargoFilter) {
        return false;
      }
      return true;
    });
  }, [funcionarios, debouncedBusca, statusFilter, cargoFilter]);

  // Cargos únicos para filtro
  const cargosUnicos = [
    ...new Set(funcionarios.map((f) => f.funcao || f.cargo).filter(Boolean) as string[]),
  ];

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-600">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4">Carregando funcionários...</p>
      </div>
    );
  }

  if (funcionarios.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <EmptyState
            icon={<User size={48} className="text-slate-400 mx-auto" />}
            title="Nenhum funcionário encontrado"
            description={busca ? 'Tente buscar por outro termo' : 'Cadastre o primeiro funcionário'}
            action={{
              label: 'Novo Funcionário',
              onClick: () => console.log('Abrir modal de novo funcionário'),
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          {/* Busca */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-2">Buscar</label>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Nome, matrícula, email..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Filtro Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
            >
              <option value="all">Todos os Status</option>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
              <option value="AFASTADO">Afastado</option>
              <option value="FERIAS">Férias</option>
            </select>
          </div>

          {/* Filtro Cargo */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Cargo</label>
            <select
              value={cargoFilter}
              onChange={(e) => setCargoFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
            >
              <option value="all">Todos os Cargos</option>
              {cargosUnicos.map((cargo) => (
                <option key={cargo} value={cargo}>
                  {cargo}
                </option>
              ))}
            </select>
          </div>

          {/* Counter */}
          <div className="flex items-center text-sm text-slate-600 font-medium">
            {funcionariosFiltrail.length} funcionários
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        {/* ✅ Decisão: VirtualTable se > 100 itens, senão Table normal */}
        {funcionariosFiltrail.length > 100 ? (
          <VirtualTable
            data={funcionariosFiltrail}
            rowHeight={72}
            maxHeight="h-[600px]"
            columns={[
              {
                key: 'funcionario',
                header: 'Funcionário',
                width: '30%',
                render: (func: Funcionario) => (
                  <div className="flex flex-col">
                    <p className="font-medium text-slate-900">{func.nome}</p>
                    {func.email && (
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Mail size={12} />
                        {func.email}
                      </p>
                    )}
                  </div>
                ),
              },
              {
                key: 'matricula',
                header: 'Matrícula',
                width: '15%',
                render: (func: Funcionario) => (
                  <span className="text-slate-700">{func.matricula}</span>
                ),
              },
              {
                key: 'cargo',
                header: 'Função',
                width: '15%',
                render: (func: Funcionario) => (
                  <span className="text-slate-700">{func.funcao || func.cargo}</span>
                ),
              },
              {
                key: 'departamento',
                header: 'Departamento',
                width: '15%',
                render: (func: Funcionario) => (
                  <span className="text-slate-600">{departamentos(func)}</span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                width: '12%',
                render: (func: Funcionario) => {
                  const st = resolveStatus(func);
                  return (
                    <Badge variant={getStatusBadgeVariant(st)} size="sm">
                      {st}
                    </Badge>
                  );
                },
              },
              {
                key: 'admissao',
                header: 'Admissão',
                width: '13%',
                render: (func: Funcionario) => (
                  <span className="text-slate-600">{safeFormatDate(func.admissao)}</span>
                ),
              },
            ]}
            onRowClick={(func) => setSelectedFuncionario(func)}
          />
        ) : (
          // ✅ Table normal para < 100 itens
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admissão</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funcionariosFiltrail.map((func) => (
                  <TableRow key={func.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        {/* Nome */}
                        <p className="font-medium text-slate-900">{func.nome}</p>
                        {/* Email - clicável */}
                        {func.email && (
                          <a
                            href={`mailto:${func.email}`}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                            title={`Enviar email para ${func.email}`}
                          >
                            <Mail size={12} />
                            {func.email}
                          </a>
                        )}
                        {/* Telefone - WhatsApp clicável */}
                        {func.telefone && (
                          <a
                            href={`https://wa.me/55${func.telefone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-green-600 hover:underline flex items-center gap-1"
                            title={`Enviar WhatsApp para ${func.telefone}`}
                          >
                            <Phone size={12} />
                            {func.telefone}
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-slate-700">{func.matricula}</span>
                    </TableCell>
                    <TableCell className="text-slate-700">{func.funcao || func.cargo}</TableCell>
                    <TableCell className="text-slate-600">{departamentos(func)}</TableCell>
                    <TableCell>
                      {(() => {
                        const st = resolveStatus(func);
                        return (
                          <Badge variant={getStatusBadgeVariant(st)} size="sm">
                            {st}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {safeFormatDate(func.admissao)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/funcionarios/${func.id}/ficha`)}
                          title="Ficha 360°"
                        >
                          <FolderOpen size={16} className="text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Editar"
                          onClick={() => setSelectedFuncionario(func)}
                        >
                          <Edit2 size={16} className="text-indigo-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Deletar"
                          onClick={async () => {
                            if (
                              !(await confirmDialog(`Tem certeza que deseja deletar ${func.nome}?`))
                            )
                              return;
                            try {
                              const token = getAccessToken();
                              const apiUrl = API_BASE_URL;
                              const response = await fetch(`${apiUrl}/funcionarios/${func.id}`, {
                                method: 'DELETE',
                                headers: {
                                  Authorization: `Bearer ${token}`,
                                },
                                cache: 'no-cache',
                              });
                              if (response.ok) {
                                toast.warning('Funcionário deletado com sucesso!');
                                window.location.reload();
                              } else {
                                toast.warning('Erro ao deletar funcionário');
                              }
                            } catch {
                              toast.warning('Erro ao deletar funcionário');
                            }
                          }}
                        >
                          <Trash2 size={16} className="text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {funcionariosFiltrail.length === 0 && (
        <div className="text-center py-8 text-slate-600">
          Nenhum funcionário encontrado com os filtros aplicados.
        </div>
      )}

      {/* Detalhes Modal */}
      {selectedFuncionario && (
        <DetalhesModal
          funcionario={selectedFuncionario}
          onClose={() => setSelectedFuncionario(null)}
        />
      )}
    </div>
  );
};

export default ListaTab;
