import React, { useState } from 'react';
import { Plus, User, Pencil, Eye } from 'lucide-react';
import { Card, CardContent, Badge, EmptyState } from '@/react-app/components/UI';
import Button from '@/react-app/components/Button';
import { DetalhesModal } from './DetalhesModal';

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
  cargo: string;
  departamento?: string;
  status: 'ATIVO' | 'INATIVO' | 'AFASTADO' | 'DEMITIDO';
  admissao: string;
  email?: string;
  avatar_url?: string;
}

interface CadastrosTabProps {
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
    case 'DEMITIDO':
      return 'danger';
    default:
      return 'default';
  }
};

export const CadastrosTab: React.FC<CadastrosTabProps> = ({
  funcionarios = [],
  loading = false,
}) => {
  const [selectedFuncionario, setSelectedFuncionario] = useState<Funcionario | null>(null);

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
        <CardContent className="p-8">
          <EmptyState
            icon={<User size={48} className="text-slate-400 mx-auto" />}
            title="Nenhum funcionário cadastrado"
            description="Comece criando o primeiro registro de funcionário"
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Todos os Funcionários</h3>
          <p className="text-sm text-slate-600 mt-1">
            {funcionarios.length} funcionários cadastrados
          </p>
        </div>
        <Button variant="primary">
          <Plus size={18} />
          Novo Funcionário
        </Button>
      </div>

      {/* Grid de Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {funcionarios.map((func) => (
          <Card key={func.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              {/* Header */}
              <div className="mb-4">
                {/* Nome */}
                <h4 className="font-semibold text-slate-900 text-lg line-clamp-2">{func.nome}</h4>

                {/* Cargo */}
                <p className="text-sm text-slate-600 mt-1 line-clamp-1">{func.cargo}</p>
              </div>

              {/* Divider */}
              <div className="h-px bg-slate-200 my-4"></div>

              {/* Info Grid */}
              <div className="space-y-3 mb-4">
                {/* Matrícula */}
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Matrícula</p>
                  <p className="text-sm font-mono text-slate-900">{func.matricula}</p>
                </div>

                {/* Departamento */}
                {func.departamento && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Departamento</p>
                    <p className="text-sm text-slate-900">{func.departamento}</p>
                  </div>
                )}

                {/* Status Badge */}
                <div className="flex justify-center pt-2">
                  <Badge variant={getStatusBadgeVariant(func.status)} size="sm">
                    {func.status}
                  </Badge>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-slate-200 my-4"></div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedFuncionario(func)}
                  className="flex-1"
                >
                  <Eye size={16} />
                  Ver
                </Button>
                <Button variant="secondary" size="sm" className="flex-1">
                  <Pencil size={16} />
                  Editar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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

export default CadastrosTab;
