/**
 * ============================================================
 * DASHBOARD QUALIFICAÇÕES - FASE 2
 * ============================================================
 *
 * Componente com cards (total, vencidas, a vencer, válidas)
 * e lista por categoria.
 *
 * Consome GET /api/dashboard/qualificacoes
 */

import React, { useState, useEffect } from 'react';
import { FileCheck, AlertCircle, Clock, CheckCircle2, TrendingUp, RefreshCw } from 'lucide-react';
import { apiClient } from '@/react-app/services/apiClient';
import AppLayout from '@/react-app/components/AppLayout';

type DashboardData = {
  total_ativas: number;
  vencidas: number;
  a_vencer_30_dias: number;
  validas: number;
  renovadas: number;
  por_categoria: Array<{
    categoria: string;
    total: number;
  }>;
};

export default function DashboardQualificacoes() {
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregarDados = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await apiClient.get<unknown>('/dashboard/qualificacoes');
      if (!res.success) throw new Error('Erro ao carregar dashboard');
      const body = res.data as { data?: DashboardData } | DashboardData;
      const data = (body as { data?: DashboardData })?.data ?? (body as DashboardData);

      setDados(data);
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
      setError('Erro ao carregar métricas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-4 text-sm text-gray-600">Carregando dashboard...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !dados) {
    return (
      <AppLayout>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <div>
              <p className="font-medium text-red-900">{error || 'Erro ao carregar dados'}</p>
              <button
                onClick={carregarDados}
                className="mt-2 text-sm text-red-700 underline hover:text-red-800"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Cards: A Vencer, Vencidas, Renovadas (sem Total e Válidas conforme solicitado)
  const cards = [
    {
      titulo: 'A Vencer (30 dias)',
      valor: dados.a_vencer_30_dias,
      icon: Clock,
      color: 'bg-yellow-50 text-yellow-600',
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-700',
    },
    {
      titulo: 'Vencidas',
      valor: dados.vencidas,
      icon: AlertCircle,
      color: 'bg-red-50 text-red-600',
      bgColor: 'bg-red-100',
      textColor: 'text-red-700',
    },
    {
      titulo: 'Renovadas',
      valor: dados.renovadas,
      icon: RefreshCw,
      color: 'bg-purple-50 text-purple-600',
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-700',
    },
  ];

  return (
    <AppLayout>
    <div className="space-y-4">
      {/* Header com botão refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard de Qualificações</h2>
          <p className="mt-1 text-sm text-gray-500">
            Visão geral das qualificações dos funcionários
          </p>
        </div>
        <button
          onClick={carregarDados}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.titulo}
              className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md"
            >
              <div className="flex flex-col">
                <div className={`inline-flex w-fit rounded-xl p-3 ${card.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-600">{card.titulo}</p>
                  <p className={`mt-2 text-2xl font-bold ${card.textColor || 'text-gray-900'}`}>
                    {card.valor.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Gráfico de distribuição por categoria */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Qualificações por Categoria</h3>
        </div>

        {dados.por_categoria.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            Nenhuma qualificação registrada ainda
          </div>
        ) : (
          <div className="space-y-3">
            {dados.por_categoria
              .sort((a, b) => b.total - a.total)
              .map((item, index) => {
                const porcentagem =
                  dados.total_ativas > 0
                    ? ((item.total / dados.total_ativas) * 100).toFixed(1)
                    : '0';

                return (
                  <div key={item.categoria} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">
                        {index + 1}. {item.categoria}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">{item.total}</span>
                        <span className="text-xs text-gray-500">({porcentagem}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${porcentagem}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Indicadores de saúde */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Taxa de Conformidade</p>
              <p className="text-lg font-bold text-gray-900">
                {dados.total_ativas > 0
                  ? (((dados.validas + dados.a_vencer_30_dias) / dados.total_ativas) * 100).toFixed(
                      1,
                    )
                  : '0'}
                %
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Requerem Atenção</p>
              <p className="text-lg font-bold text-gray-900">{dados.a_vencer_30_dias}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Ação Imediata</p>
              <p className="text-lg font-bold text-gray-900">{dados.vencidas}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </AppLayout>
  );
}
