import PageHeader from '@/react-app/components/PageHeader';
import AppLayout from '@/react-app/components/AppLayout';
import React, { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { apiClient } from '@/react-app/services/apiClient';
import { SimuladoresCard } from '../components/SimuladoresLayout';

interface RelatorioUsoItem {
  simulador_id: number;
  codigo: string;
  tipo_aeronave: string;
  horas: number;
  total_sessoes: number;
}

interface RelatorioUsoResponse {
  periodo: { data_inicio: string | null; data_fim: string | null };
  total_horas: number;
  por_simulador: RelatorioUsoItem[];
  por_tipo_sessao: Array<{ tipo_sessao: string; sessoes: number; horas: number }>;
  por_status?: Array<{ status: string; sessoes: number }>;
}

interface RelatorioTripulante {
  funcionario_id: number;
  nome: string;
  matricula: string;
  funcao: string;
  sessoes_totais: number;
  horas: number;
  aprovados: number;
  reprovados: number;
  faltas: number;
}

interface RelatorioDesempenho {
  tipo_sessao: string;
  sessoes: number;
  aprovados: number;
  reprovados: number;
  aprovacao_percent: number;
}

export function RelatoriosSimuladores() {
  const [loading, setLoading] = useState(false);
  const [relatorioUso, setRelatorioUso] = useState<RelatorioUsoItem[]>([]);
  const [relatorioTripulantes, setRelatorioTripulantes] = useState<RelatorioTripulante[]>([]);
  const [relatorioDesempenho, setRelatorioDesempenho] = useState<RelatorioDesempenho[]>([]);

  useEffect(() => {
    carregarRelatorios();
  }, []);

  const carregarRelatorios = async () => {
    setLoading(true);
    try {
      const [uso, tripulantes, desempenho] = await Promise.all([
        apiClient<RelatorioUsoResponse>('/simuladores/relatorios/uso'),
        apiClient<RelatorioTripulante[]>('/simuladores/relatorios/tripulantes'),
        apiClient<RelatorioDesempenho[]>('/simuladores/relatorios/desempenho'),
      ]);

      // uso.data é um objeto estruturado com por_simulador, por_tipo_sessao, etc.
      const usoData = uso.data as RelatorioUsoResponse | undefined;
      setRelatorioUso(usoData?.por_simulador || []);
      setRelatorioTripulantes((tripulantes.data as RelatorioTripulante[]) || []);
      setRelatorioDesempenho((desempenho.data as RelatorioDesempenho[]) || []);
    } catch (error) {
      console.error('Erro ao carregar relatórios:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        className="mb-6"
        title="Relatórios de Simuladores"
        subtitle="Analytics e métricas de utilização do sistema de treinamento"
      />
      <div className="space-y-4">
        <div className="space-y-5">
          {/* Relatório de Uso */}
          <SimuladoresCard padding="lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Uso de Simuladores</h2>
                <p className="text-sm text-slate-600">Taxa de ocupação e horas utilizadas</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Simulador
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                      Sessões
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                      Horas
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                      Equipamento
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {relatorioUso.length > 0 ? (
                    relatorioUso.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm text-slate-900">{item.codigo}</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-700">
                          {item.total_sessoes}
                        </td>
                        <td className="py-3 px-4 text-sm text-center text-slate-700">
                          {Number(item.horas || 0).toFixed(1)}h
                        </td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                            {item.tipo_aeronave || '—'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500">
                        Nenhum dado disponível
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SimuladoresCard>

          {/* Relatório de Tripulantes */}
          <SimuladoresCard padding="lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Desempenho de Tripulantes</h2>
                <p className="text-sm text-slate-600">Aprovações e taxas de sucesso</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Tripulante
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                      Sessões
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                      Aprovações
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                      Reprovações
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                      Taxa
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {relatorioTripulantes.length > 0 ? (
                    relatorioTripulantes.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm text-slate-900">{item.nome}</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-700">
                          {item.sessoes_totais}
                        </td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className="text-green-600 font-medium">{item.aprovados}</span>
                        </td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className="text-red-600 font-medium">{item.reprovados}</span>
                        </td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                            {item.sessoes_totais > 0
                              ? ((item.aprovados / item.sessoes_totais) * 100).toFixed(0) + '%'
                              : '0%'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        Nenhum dado disponível
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SimuladoresCard>

          {/* Relatório de Desempenho por Manobra */}
          <SimuladoresCard padding="lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Desempenho por Manobra</h2>
                <p className="text-sm text-slate-600">Médias de notas e taxas de aprovação</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Tipo Sessão
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                      Total
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                      Aprovação %
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                      Aprovações
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                      Reprovações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {relatorioDesempenho.length > 0 ? (
                    relatorioDesempenho.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm text-slate-900">{item.tipo_sessao}</td>
                        <td className="py-3 px-4 text-sm text-center text-slate-700">
                          {item.sessoes}
                        </td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className="font-semibold text-slate-900">
                            {Number(item.aprovacao_percent || 0).toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className="text-green-600 font-medium">{item.aprovados}</span>
                        </td>
                        <td className="py-3 px-4 text-sm text-center">
                          <span className="text-red-600 font-medium">{item.reprovados}</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        Nenhum dado disponível
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SimuladoresCard>
        </div>
      </div>
    </AppLayout>
  );
}

export default RelatoriosSimuladores;
