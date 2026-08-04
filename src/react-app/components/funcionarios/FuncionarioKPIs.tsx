import { useMemo } from 'react';
import { Users, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';

interface FuncionarioUnificado {
  id: number;
  nome: string;
  matricula: string;
  funcao: string;
  email: string;
  telefone?: string;
  status: 'ATIVO' | 'INATIVO';

  compliance_status: 'CONFORME' | 'VENCENDO' | 'VENCIDO' | 'PENDENTE';
  compliance_percentage: number; // 0-100
  dias_para_vencimento: number;
}

interface KPIProps {
  funcionariosUnificados: FuncionarioUnificado[];
}

export default function FuncionarioKPIs({ funcionariosUnificados }: KPIProps) {
  const stats = useMemo(() => {
    const counts = funcionariosUnificados.reduce(
      (acc, funcionario) => {
        if (funcionario.status === 'ATIVO') acc.totalAtivos += 1;
        if (funcionario.compliance_status === 'CONFORME') acc.complianceOK += 1;
        if (
          funcionario.compliance_status === 'VENCIDO' ||
          funcionario.compliance_status === 'VENCENDO' ||
          funcionario.compliance_status === 'PENDENTE'
        ) {
          acc.pendencias += 1;
        }
        acc.totalCompliance += funcionario.compliance_percentage || 0;
        return acc;
      },
      { totalAtivos: 0, complianceOK: 0, pendencias: 0, totalCompliance: 0 },
    );

    return {
      totalAtivos: counts.totalAtivos,
      complianceOK: counts.complianceOK,
      pendencias: counts.pendencias,
      mediaCompliance:
        Math.round(counts.totalCompliance / (funcionariosUnificados.length || 1)) || 0,
    };
  }, [funcionariosUnificados]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      {/* Card 1: Total Ativos (Azul) */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center">
          <div className="p-3 rounded-full bg-primary/20 text-primary">
            <Users className="h-6 w-6" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Total Ativos</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalAtivos}</p>
          </div>
        </div>
      </div>

      {/* Card 2: Compliance OK (Verde) */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center">
          <div className="p-3 rounded-full bg-green-100 text-green-600">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Compliance OK</p>
            <p className="text-2xl font-bold text-gray-900">{stats.complianceOK}</p>
          </div>
        </div>
      </div>

      {/* Card 3: Pendências (Amarelo) */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center">
          <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Pendências</p>
            <p className="text-2xl font-bold text-gray-900">{stats.pendencias}</p>
          </div>
        </div>
      </div>

      {/* Card 4: Média Compliance (Roxo) */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center">
          <div className="p-3 rounded-full bg-purple-100 text-purple-600">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Média Compliance</p>
            <p className="text-2xl font-bold text-gray-900">{stats.mediaCompliance}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
