import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, Users, Filter, X } from 'lucide-react';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import AppLayout from '@/react-app/components/AppLayout';
import { PageLayout } from '@/react-app/components/layout/PageLayout';
import { SkeletonCard, SkeletonTable } from '@/react-app/components/UI/Skeleton';
import { StatusBadge } from '@/react-app/components/UI/StatusBadge';

function ComplianceLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <SkeletonTable rows={8} />
    </div>
  );
}

export default function ComplianceDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [matriz, setMatriz] = useState<any[]>([]);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [filtros, setFiltros] = useState({ setor: '', funcao: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDashboard();
    carregarAlertas();
  }, []);

  useEffect(() => {
    carregarMatriz();
  }, [filtros]);

  const carregarDashboard = async () => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/compliance/dashboard`);
      const data = await response.json();
      if (data.success) {
        setStats(data);
      }
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
    }
  };

  const carregarMatriz = async () => {
    try {
      const params = new URLSearchParams();
      if (filtros.setor) params.append('setor', filtros.setor);
      if (filtros.funcao) params.append('funcao', filtros.funcao);

      const response = await fetchWithAuth(`${API_BASE_URL}/compliance/matriz?${params}`);
      const data = await response.json();
      if (data.success) {
        setMatriz(data.funcionarios || []);
      }
    } catch (error) {
      console.error('Erro ao carregar matriz:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarAlertas = async () => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/compliance/alertas`);
      const data = await response.json();
      if (data.success) {
        setAlertas(data.alertas || []);
      }
    } catch (error) {
      console.error('Erro ao carregar alertas:', error);
    }
  };

  const getComplianceTaxa = (validas: number, total: number) => {
    if (total === 0) return null;
    return Math.round((validas / total) * 100);
  };

  const getComplianceStatus = (taxa: number | null): 'VALIDA' | 'A_VENCER' | 'VENCIDA' => {
    if (taxa === null) return 'PENDENTE' as any;
    if (taxa >= 80) return 'VALIDA';
    if (taxa >= 50) return 'A_VENCER';
    return 'VENCIDA';
  };

  const metricsCards = [
    {
      label: 'Total Funcionários',
      value: stats?.stats?.total_funcionarios || 0,
      sub: 'Ativos no sistema',
      icon: <Users className="w-6 h-6 text-slate-500" />,
      cardClass: 'card-neutral',
    },
    {
      label: 'Certificações Válidas',
      value: stats?.stats?.total_validas || 0,
      sub: 'Em conformidade',
      icon: <CheckCircle className="w-6 h-6 text-emerald-500" />,
      cardClass: 'card-success',
    },
    {
      label: 'Vencendo (30 dias)',
      value: stats?.stats?.total_vencendo || 0,
      sub: 'Requer atenção',
      icon: <Clock className="w-6 h-6 text-amber-500" />,
      cardClass: 'card-warning',
    },
    {
      label: 'Vencidas',
      value: stats?.stats?.total_vencidas || 0,
      sub: 'Ação urgente',
      icon: <AlertTriangle className="w-6 h-6 text-red-500" />,
      cardClass: 'card-error',
    },
  ];

  return (
    <AppLayout>
      <PageLayout
        title="Compliance Matrix"
        subtitle="Visão consolidada de certificações e vencimentos"
      >
        {loading ? (
          <ComplianceLoadingSkeleton />
        ) : (
          <div className="space-y-4">
            {/* Métricas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
              {metricsCards.map((card) => (
                <div
                  key={card.label}
                  className={`card ${card.cardClass} rounded-2xl p-5 hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 font-medium">{card.label}</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">{card.value}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{card.sub}</p>
                    </div>
                    <div className="w-12 h-12 bg-white/60 rounded-xl flex items-center justify-center">
                      {card.icon}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Filtros */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  Filtros
                </h2>
                {(filtros.setor || filtros.funcao) && (
                  <button
                    onClick={() => setFiltros({ setor: '', funcao: '' })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Limpar
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Filtrar por Setor (ex: Operações)"
                  value={filtros.setor}
                  onChange={(e) => setFiltros({ ...filtros, setor: e.target.value })}
                  className="h-9 px-3 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
                />
                <input
                  type="text"
                  placeholder="Filtrar por Função"
                  value={filtros.funcao}
                  onChange={(e) => setFiltros({ ...filtros, funcao: e.target.value })}
                  className="h-9 px-3 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
                />
              </div>
            </div>

            {/* Matriz de Compliance */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800">
                  Matriz de Compliance por Funcionário
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Matrícula', 'Nome', 'Função', 'Setor', 'Total', 'Válidas', 'Vencendo', 'Vencidas', 'Status'].map((col) => (
                        <th
                          key={col}
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {matriz.map((f: any) => {
                      const taxa = getComplianceTaxa(f.validas, f.total_cert);
                      return (
                        <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm text-slate-600">{f.matricula}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">{f.nome}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">{f.funcao_nome || '—'}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">{f.setor || '—'}</td>
                          <td className="px-4 py-3 text-sm text-center font-medium text-slate-700">{f.total_cert || 0}</td>
                          <td className="px-4 py-3 text-sm text-center font-semibold text-emerald-600">{f.validas || 0}</td>
                          <td className="px-4 py-3 text-sm text-center font-semibold text-amber-600">{f.vencendo || 0}</td>
                          <td className="px-4 py-3 text-sm text-center font-semibold text-red-600">{f.vencidas || 0}</td>
                          <td className="px-4 py-3 text-center">
                            {taxa !== null ? (
                              <StatusBadge
                                status={getComplianceStatus(taxa)}
                                label={`${taxa}%`}
                              />
                            ) : (
                              <span className="text-xs text-slate-400">N/A</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {matriz.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <p className="text-sm">Nenhum funcionário encontrado com os filtros aplicados</p>
                  </div>
                )}
              </div>
            </div>

            {/* Alertas de Vencimento */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Alertas de Vencimento
              </h2>
              <div className="space-y-3">
                {alertas.map((a: any, i: number) => (
                  <div
                    key={i}
                    className={`p-4 rounded-xl border-l-4 ${
                      a.status_compliance === 'VENCIDO'
                        ? 'bg-red-50 border-red-500'
                        : 'bg-amber-50 border-amber-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {a.nome} ({a.matricula}) — {a.setor}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          <span className="font-medium">Certificação:</span> {a.nome_treinamento}
                          {a.codigo_treinamento && ` (${a.codigo_treinamento})`}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          <span className="font-medium">Vencimento:</span>{' '}
                          {new Date(a.data_vencimento).toLocaleDateString('pt-BR')}
                          {a.dias_restantes !== undefined && (
                            <span className="ml-2 text-slate-400">
                              ({Math.floor(a.dias_restantes)} dias{' '}
                              {a.dias_restantes < 0 ? 'atrás' : 'restantes'})
                            </span>
                          )}
                        </p>
                      </div>
                      <StatusBadge
                        status={a.status_compliance === 'VENCIDO' ? 'VENCIDA' : 'A_VENCER'}
                      />
                    </div>
                  </div>
                ))}

                {alertas.length === 0 && (
                  <div className="text-center py-10">
                    <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
                    <p className="text-sm font-medium text-slate-700">
                      Nenhum alerta de vencimento
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Todas as certificações estão em dia!
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </PageLayout>
    </AppLayout>
  );
}
