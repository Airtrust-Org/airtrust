/**
 * Dashboard de Desempenho - Simuladores
 * Exibe histórico de notas, alertas de reforço e evolução temporal
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/react-app/components/AppLayout';
import { toast } from 'sonner';
import {
  ArrowLeft,
  AlertTriangle,
  TrendingUp,
  Award,
  Target,
  CheckCircle,
  Clock,
  User,
  BarChart3,
  History,
} from 'lucide-react';
import { Button } from '@/react-app/components/UI/Button';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

interface DashboardData {
  funcionario: {
    id: number;
    nome: string;
    cpf: string;
    matricula: string;
    codigo_anac: string;
  } | null;
  top5_dificuldade: Array<{
    codigo_manobra: string;
    descricao_manobra: string;
    media_nota: number;
    total_tentativas: number;
    pior_nota: number;
    melhor_nota: number;
    ultima_sessao: string;
  }>;
  alertas_ativos: Array<{
    id: number;
    codigo_manobra: string;
    descricao_manobra: string;
    nota_sessao1: number;
    data_sessao1: string;
    nota_sessao2: number;
    data_sessao2: string;
    instrutor_nome: string;
    funcionario_nome: string;
  }>;
  estatisticas: {
    total_fichas: number;
    total_manobras_avaliadas: number;
    media_geral: number;
    pior_nota_geral: number;
    melhor_nota_geral: number;
    total_manobras_unicas: number;
  } | null;
  evolucao_temporal: Array<{
    data_sessao: string;
    media_sessao: number;
    manobras_avaliadas: number;
    tipo_sessao: string;
    tipo_aeronave: string;
  }>;
}

export default function DashboardDesempenho() {
  const { funcionarioId } = useParams<{ funcionarioId: string }>();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    if (!funcionarioId) return;
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/simuladores/dashboard/${funcionarioId}`, {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        setDashboard(result.data);
      } else {
        toast.error('Erro ao carregar dashboard');
      }
    } catch (error) {
      console.error('Erro ao buscar dashboard:', error);
      toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  }, [funcionarioId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const resolverAlerta = async (alertaId: number) => {
    if (!(await confirmDialog('Marcar este alerta como resolvido?'))) return;

    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/alertas/${alertaId}/resolver`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({
          observacoes_resolucao: 'Resolvido manualmente pelo instrutor',
        }),
      });

      if (response.ok) {
        toast.success('Alerta marcado como resolvido');
        fetchDashboard();
      } else {
        toast.error('Erro ao resolver alerta');
      }
    } catch (error) {
      console.error('Erro ao resolver alerta:', error);
      toast.error('Erro ao resolver alerta');
    }
  };

  const getNotaColor = (nota: number) => {
    if (nota >= 9) return 'bg-emerald-100 text-emerald-700';
    if (nota >= 8) return 'bg-green-100 text-green-700';
    if (nota >= 7) return 'bg-yellow-100 text-yellow-700';
    if (nota >= 5) return 'bg-orange-100 text-orange-700';
    return 'bg-red-100 text-red-700';
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-gray-600">Carregando dashboard...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!dashboard) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-gray-600">Nenhum dado disponível</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Dashboard de Desempenho - Simulador
              </h1>
              <div className="flex items-center gap-2 mt-1 text-gray-600">
                <User className="w-4 h-4" />
                <span className="font-medium">
                  {dashboard.funcionario?.nome || `Funcionário #${funcionarioId}`}
                </span>
                {dashboard.funcionario?.codigo_anac && (
                  <span className="text-sm bg-gray-100 px-2 py-0.5 rounded">
                    ANAC: {dashboard.funcionario.codigo_anac}
                  </span>
                )}
              </div>
            </div>

            <Button onClick={fetchDashboard} variant="secondary">
              <History className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Estatísticas Gerais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm text-gray-600">Média Geral</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {dashboard.estatisticas?.media_geral?.toFixed(2) || '0.00'}
            </p>
          </div>

          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm text-gray-600">Fichas Avaliadas</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {dashboard.estatisticas?.total_fichas || 0}
            </p>
          </div>

          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Target className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm text-gray-600">Manobras Únicas</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {dashboard.estatisticas?.total_manobras_unicas || 0}
            </p>
          </div>

          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Award className="w-5 h-5 text-orange-600" />
              </div>
              <span className="text-sm text-gray-600">Avaliações Totais</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {dashboard.estatisticas?.total_manobras_avaliadas || 0}
            </p>
          </div>
        </div>

        {/* Alertas Ativos */}
        {dashboard.alertas_ativos.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-bold text-red-900">
                Alertas de Reforço Necessário ({dashboard.alertas_ativos.length})
              </h2>
            </div>

            <div className="space-y-3">
              {dashboard.alertas_ativos.map((alerta) => (
                <div key={alerta.id} className="bg-white border border-red-100 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900">
                        {alerta.codigo_manobra} - {alerta.descricao_manobra}
                      </h3>
                      <div className="mt-2 text-sm text-gray-600 space-y-1">
                        <p>
                          <strong>Sessão 1:</strong>{' '}
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-medium ${getNotaColor(
                              alerta.nota_sessao1,
                            )}`}
                          >
                            {alerta.nota_sessao1?.toFixed(1)}
                          </span>{' '}
                          em {new Date(alerta.data_sessao1).toLocaleDateString('pt-BR')}
                        </p>
                        <p>
                          <strong>Sessão 2:</strong>{' '}
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-medium ${getNotaColor(
                              alerta.nota_sessao2,
                            )}`}
                          >
                            {alerta.nota_sessao2?.toFixed(1)}
                          </span>{' '}
                          em {new Date(alerta.data_sessao2).toLocaleDateString('pt-BR')}
                        </p>
                        {alerta.instrutor_nome && (
                          <p>
                            <strong>Instrutor:</strong> {alerta.instrutor_nome}
                          </p>
                        )}
                      </div>
                    </div>

                    <Button
                      onClick={() => resolverAlerta(alerta.id)}
                      variant="secondary"
                      className="ml-4 text-green-600 border-green-600 hover:bg-green-50"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Resolver
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top 5 Manobras com Dificuldade */}
          <div className="bg-white border rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <h2 className="text-lg font-bold text-gray-900">
                Top 5 Manobras com Maior Dificuldade
              </h2>
            </div>

            {dashboard.top5_dificuldade.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Nenhuma manobra avaliada ainda.</p>
            ) : (
              <div className="space-y-3">
                {dashboard.top5_dificuldade.map((manobra, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded">
                          {manobra.codigo_manobra}
                        </span>
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {manobra.descricao_manobra}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span>{manobra.total_tentativas} tentativa(s)</span>
                        <span>Pior: {manobra.pior_nota?.toFixed(1)}</span>
                        <span>Melhor: {manobra.melhor_nota?.toFixed(1)}</span>
                      </div>
                    </div>
                    <div
                      className={`px-3 py-1 rounded-lg font-bold text-sm ${getNotaColor(
                        manobra.media_nota,
                      )}`}
                    >
                      {manobra.media_nota?.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evolução Temporal */}
          <div className="bg-white border rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-gray-900">
                Evolução Temporal (Últimas 12 Sessões)
              </h2>
            </div>

            {dashboard.evolucao_temporal.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Nenhuma sessão registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {dashboard.evolucao_temporal.map((sessao, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium">
                          {new Date(sessao.data_sessao).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span>{sessao.tipo_sessao || 'Sessão'}</span>
                        {sessao.tipo_aeronave && (
                          <>
                            <span>•</span>
                            <span>{sessao.tipo_aeronave}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>{sessao.manobras_avaliadas} manobras</span>
                      </div>
                    </div>
                    <div
                      className={`px-3 py-1 rounded-lg font-bold text-sm ${getNotaColor(
                        sessao.media_sessao,
                      )}`}
                    >
                      {sessao.media_sessao?.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Faixa de Notas (legenda) */}
        <div className="mt-6 bg-white border rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Legenda de Notas</h3>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-emerald-100 border border-emerald-200"></div>
              <span className="text-xs text-gray-600">9.0 - 10.0 (Excelente)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-100 border border-green-200"></div>
              <span className="text-xs text-gray-600">8.0 - 8.9 (Bom)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-200"></div>
              <span className="text-xs text-gray-600">7.0 - 7.9 (Satisfatório)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-orange-100 border border-orange-200"></div>
              <span className="text-xs text-gray-600">5.0 - 6.9 (Atenção)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-100 border border-red-200"></div>
              <span className="text-xs text-gray-600">&lt; 5.0 (Reforço Necessário)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </AppLayout>
  );
}
