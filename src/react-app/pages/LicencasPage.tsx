/**
 * ============================================================
 * PÁGINA LICENÇAS - FASE 3
 * ============================================================
 * Página completa de gerenciamento de licenças aeronáuticas
 * - Dashboard com cards (ativas, vencidas, a vencer, válidas)
 * - Filtros por tipo, status e funcionário
 * - Tabela com todas as licenças
 * - Ações: criar, editar, excluir
 * ============================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

import { Plus, Edit2, Trash2, RefreshCw } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import ModalLicenca from '../components/licencas/ModalLicenca';
import { apiClient } from '@/react-app/services/apiClient';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import AppLayout from '@/react-app/components/AppLayout';
import RowActionsMenu from '@/react-app/components/UI/RowActionsMenu';

type Licenca = {
  id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  funcionario_matricula?: string;
  tipo: string;
  numero: string;
  data_emissao: string;
  data_vencimento: string;
  observacoes?: string;
};

type DashboardData = {
  total_ativas: number;
  vencidas: number;
  a_vencer_60_dias: number;
  validas: number;
  por_tipo: Array<{ tipo: string; total: number }>;
};

const TIPOS_LICENCA = [
  'CMA',
  'CANAC',
  'CHT',
  'PP',
  'PC',
  'PLA',
  'IFR',
  'INVA',
  'INVH',
  'MLTE',
  'MNTE',
  'OUTRO',
] as const;

function formatarData(iso?: string | null) {
  if (!iso) return '-';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy');
  } catch {
    return '-';
  }
}

export default function LicencasPage() {
  const [licencas, setLicencas] = useState<Licenca[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | undefined>();

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  const carregarDashboard = useCallback(async () => {
    try {
      const res = await apiClient.get<unknown>('/dashboard/licencas');
      if (!res.success) return;
      const body = res.data as { data?: DashboardData } | DashboardData;
      setDashboard(((body as { data?: DashboardData })?.data ?? body) as DashboardData);
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
    }
  }, []);

  const carregarLicencas = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtroTipo) params.set('tipo', filtroTipo);
      if (filtroStatus) params.set('status', filtroStatus);

      const res = await apiClient.get<unknown>(`/licencas?${params.toString()}`);
      if (!res.success) throw new Error('Erro ao carregar licenças');
      const body = res.data as { data?: Licenca[]; results?: Licenca[] } | Licenca[];
      const data = Array.isArray(body)
        ? body
        : ((body as { data?: Licenca[]; results?: Licenca[] })?.data ??
          (body as { results?: Licenca[] })?.results ??
          []);
      setLicencas(data as Licenca[]);
    } catch (err) {
      console.error('Erro ao carregar licenças:', err);
    } finally {
      setLoading(false);
    }
  }, [filtroTipo, filtroStatus]);

  useEffect(() => {
    carregarDashboard();
  }, [carregarDashboard]);

  useEffect(() => {
    carregarLicencas();
  }, [carregarLicencas]);

  const abrirNova = () => {
    setEditingId(undefined);
    setShowModal(true);
  };

  const abrirEditar = (id: number) => {
    setEditingId(id);
    setShowModal(true);
  };

  const excluir = async (id: number) => {
    if (!(await confirmDialog('Confirma exclusão desta licença?'))) return;

    try {
      const res = await apiClient.delete<{ success?: boolean; error?: string }>(`/licencas/${id}`);
      if (!res.success || res.data?.success === false) {
        throw new Error(res.data?.error || 'Erro ao excluir');
      }

      carregarLicencas();
      carregarDashboard();
    } catch (err) {
      console.error('Erro ao excluir licença:', err);
      toast.warning('Erro ao excluir licença');
    }
  };

  const handleSalvar = () => {
    carregarLicencas();
    carregarDashboard();
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Licenças Aeronáuticas</h1>
            <p className="mt-1 text-sm text-gray-500">
              Gerenciamento de CMA, CANAC, CHT, PP, PC, IFR e outras licenças
            </p>
          </div>
          <button
            onClick={carregarLicencas}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>

        {/* Dashboard Cards */}
        {dashboard && (
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Licenças Ativas</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{dashboard.total_ativas}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-red-700">Vencidas</p>
              <p className="mt-2 text-2xl font-bold text-red-700">{dashboard.vencidas}</p>
            </div>
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-yellow-700">A vencer (60d)</p>
              <p className="mt-2 text-2xl font-bold text-yellow-700">
                {dashboard.a_vencer_60_dias}
              </p>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm">
              <p className="text-sm font-medium text-green-700">Válidas</p>
              <p className="mt-2 text-2xl font-bold text-green-700">{dashboard.validas}</p>
            </div>
          </div>
        )}

        {/* Filtros + Botão Nova Licença */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow">
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Todos os tipos</option>
            {TIPOS_LICENCA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Todos os status</option>
            <option value="valida">Válida</option>
            <option value="a_vencer">A vencer (60d)</option>
            <option value="vencida">Vencida</option>
          </select>

          <div className="flex-1" />

          <button
            type="button"
            onClick={abrirNova}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nova licença
          </button>
        </div>

        {/* Tabela de Licenças */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
                <p className="mt-4 text-sm text-gray-600">Carregando licenças...</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Funcionário</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Matrícula</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Tipo</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Número</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Emissão</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Vencimento</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700">Status</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {licencas.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                        Nenhuma licença encontrada com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    licencas.map((lic) => {
                      const hoje = new Date();
                      const venc = parseISO(lic.data_vencimento);
                      const dias = differenceInDays(venc, hoje);
                      let statusCor = 'bg-green-100 text-green-700';
                      let statusLabel = 'Válida';

                      if (dias < 0) {
                        statusCor = 'bg-red-100 text-red-700';
                        statusLabel = 'Vencida';
                      } else if (dias <= 60) {
                        statusCor = 'bg-yellow-100 text-yellow-700';
                        statusLabel = `Vence em ${dias}d`;
                      }

                      return (
                        <tr key={lic.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <FuncionarioLink
                              funcionarioId={lic.funcionario_id}
                              nome={lic.funcionario_nome || '-'}
                              className="hover:text-primary hover:underline"
                            />
                          </td>
                          <td className="px-4 py-3">{lic.funcionario_matricula || '-'}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              {lic.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium">{lic.numero}</td>
                          <td className="px-4 py-3">{formatarData(lic.data_emissao)}</td>
                          <td className="px-4 py-3">{formatarData(lic.data_vencimento)}</td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCor}`}
                            >
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => abrirEditar(lic.id)}
                                className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                                title="Editar licença"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <RowActionsMenu
                                label={`Ações da licença ${lic.numero}`}
                                actions={[
                                  {
                                    label: 'Excluir licença',
                                    destructive: true,
                                    icon: Trash2,
                                    onSelect: () => excluir(lic.id),
                                  },
                                ]}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Distribuição por tipo */}
        {dashboard && dashboard.por_tipo.length > 0 && (
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Distribuição por Tipo</h3>
            <div className="space-y-3">
              {dashboard.por_tipo.map((item, index) => {
                const porcentagem =
                  dashboard.total_ativas > 0
                    ? ((item.total / dashboard.total_ativas) * 100).toFixed(1)
                    : '0';

                return (
                  <div key={item.tipo} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">
                        {index + 1}. {item.tipo}
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
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <ModalLicenca
          mode={editingId ? 'edit' : 'create'}
          licencaId={editingId}
          aberto={showModal}
          onFechar={() => setShowModal(false)}
          onSalvar={handleSalvar}
        />
      )}
    </AppLayout>
  );
}
