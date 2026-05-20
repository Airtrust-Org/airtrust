import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import { useState, useEffect } from 'react';
import { Monitor, Clock, TrendingUp, Calendar } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { PageLayout } from '@/react-app/components/layout/PageLayout';
import { SkeletonCard } from '@/react-app/components/UI/Skeleton';
import { StatusBadge } from '@/react-app/components/UI/StatusBadge';
import { EmptyState } from '@/react-app/components/UI/EmptyState';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';

export default function SimuladoresDashboard() {
  const [stats, setStats] = useState({
    total_simuladores: 0,
    sessoes_mes: 0,
    taxa_utilizacao: 0,
    horas_voadas: 0,
  });
  const [proximasSessoes, setProximasSessoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const [simResp, sessoesResp] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/simuladores`),
        fetchWithAuth(`${API_BASE_URL}/simuladores/sessoes?limit=5&status=AGENDADO`),
      ]);

      const simData = await simResp.json();
      const sessoesData = await sessoesResp.json();

      setStats({
        total_simuladores: simData.total || 0,
        sessoes_mes: simData.sessoes_mes || 0,
        taxa_utilizacao: simData.taxa_utilizacao || 0,
        horas_voadas: simData.horas_voadas || 0,
      });

      setProximasSessoes(sessoesData.sessoes || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const metricsCards = [
    {
      label: 'Total Simuladores',
      value: stats.total_simuladores,
      sub: 'Operacionais',
      icon: <Monitor className="w-6 h-6 text-primary" />,
      iconBg: 'bg-primary/10',
    },
    {
      label: 'Sessões no Mês',
      value: stats.sessoes_mes,
      sub: 'Realizadas',
      icon: <Calendar className="w-6 h-6 text-emerald-600" />,
      iconBg: 'bg-emerald-50',
    },
    {
      label: 'Taxa Utilização',
      value: `${stats.taxa_utilizacao}%`,
      sub: 'Média mensal',
      icon: <TrendingUp className="w-6 h-6 text-violet-600" />,
      iconBg: 'bg-violet-50',
    },
    {
      label: 'Horas Voadas',
      value: `${stats.horas_voadas}h`,
      sub: 'Este mês',
      icon: <Clock className="w-6 h-6 text-orange-600" />,
      iconBg: 'bg-orange-50',
    },
  ];

  return (
    <AppLayout>
      <PageLayout title="Dashboard Simuladores" subtitle="Visão geral do sistema de simuladores">
        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
            <div className="h-64 rounded-2xl border border-slate-200 bg-white animate-pulse" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Métricas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
              {metricsCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 font-medium">{card.label}</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">{card.value}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{card.sub}</p>
                    </div>
                    <div
                      className={`w-12 h-12 ${card.iconBg} rounded-xl flex items-center justify-center`}
                    >
                      {card.icon}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Próximas Sessões */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800">
                  Próximas 5 Sessões Agendadas
                </h2>
              </div>

              {proximasSessoes.length === 0 ? (
                <div className="py-12">
                  <EmptyState
                    icon={<Calendar className="w-10 h-10" />}
                    title="Nenhuma sessão agendada"
                    description="Não há sessões agendadas no momento."
                  />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {proximasSessoes.map((sessao: any) => (
                    <div
                      key={sessao.id}
                      className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Monitor className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {sessao.simulador_nome}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {new Date(sessao.data).toLocaleDateString('pt-BR')} •{' '}
                            {sessao.hora_inicio} — {sessao.hora_fim}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-xs text-slate-500 hidden sm:block">
                          <FuncionarioLink
                            funcionarioId={sessao.instrutor_id}
                            nome={sessao.instrutor_nome || 'Sem instrutor'}
                            className="text-xs text-slate-500"
                          />
                        </p>
                        <StatusBadge status={sessao.status || 'ATIVO'} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </PageLayout>
    </AppLayout>
  );
}
