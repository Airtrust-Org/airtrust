/**
 * LicencasTab - Aba de Licenças no módulo Qualificações
 *
 * Gerencia licenças aeronáuticas (CMA, CANAC, CHT, PP, PC, etc.)
 * com tabela avançada, filtros e status visual
 */

import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { API_BASE_URL } from '@/react-app/config/api';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  Button as UIButton,
} from '@/react-app/components/UI';
import ModalLicenca from '@/react-app/components/licencas/ModalLicenca';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';

interface Licenca {
  id: number;
  funcionario_id: string;
  funcionario_nome?: string;
  tipo: string;
  numero: string;
  data_emissao: string;
  data_vencimento: string;
  observacoes?: string;
}

interface DashboardStats {
  total: number;
  validas: number;
  a_vencer: number;
  vencidas: number;
  por_tipo: Array<{ tipo: string; total: number }>;
}

export function LicencasTab() {
  const [licencas, setLicencas] = useState<Licenca[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    busca: '',
    tipo: '',
    status: '',
  });
  const [modalAberto, setModalAberto] = useState(false);
  const [licencaEditando, setLicencaEditando] = useState<number | undefined>();

  const carregarLicencas = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.tipo) params.append('tipo', filtros.tipo);
      if (filtros.status) params.append('status', filtros.status);

      const response = await fetch(`${API_BASE_URL}/licencas?${params}`);
      const json = await response.json();

      if (json.success) {
        setLicencas(json.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar licenças:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarDashboard = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/licencas`);
      const json = await response.json();

      if (json.success) {
        setStats(json.data);
      }
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
    }
  };

  useEffect(() => {
    carregarLicencas();
    carregarDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.tipo, filtros.status]);

  const calcularStatus = (vencimento: string): 'valida' | 'a_vencer' | 'vencida' => {
    const hoje = new Date();
    const dataVenc = parseISO(vencimento);
    const dias = differenceInDays(dataVenc, hoje);

    if (dias < 0) return 'vencida';
    if (dias <= 60) return 'a_vencer';
    return 'valida';
  };

  const renderStatusBadge = (vencimento: string) => {
    const status = calcularStatus(vencimento);
    const hoje = new Date();
    const dataVenc = parseISO(vencimento);
    const dias = differenceInDays(dataVenc, hoje);

    if (status === 'vencida') {
      return <Badge variant="danger">Vencida</Badge>;
    }
    if (status === 'a_vencer') {
      return <Badge variant="warning">Vence em {dias}d</Badge>;
    }
    return <Badge variant="success">Válida</Badge>;
  };

  const licencasFiltradas = licencas.filter((lic) => {
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase();
      return (
        lic.numero.toLowerCase().includes(busca) ||
        lic.funcionario_nome?.toLowerCase().includes(busca) ||
        lic.tipo.toLowerCase().includes(busca)
      );
    }
    return true;
  });

  const handleAbrirModal = (licencaId?: number) => {
    setLicencaEditando(licencaId);
    setModalAberto(true);
  };

  const handleFecharModal = () => {
    setModalAberto(false);
    setLicencaEditando(undefined);
  };

  const handleSalvar = () => {
    carregarLicencas();
    carregarDashboard();
    handleFecharModal();
  };

  const handleExcluir = async (id: number) => {
    if (!(await confirmDialog('Deseja realmente excluir esta licença?'))) return;

    try {
      const response = await fetch(`${API_BASE_URL}/licencas/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        carregarLicencas();
        carregarDashboard();
      }
    } catch (error) {
      console.error('Erro ao excluir licença:', error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Dashboard Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-border-light p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-light">Total</p>
                <p className="text-2xl font-bold text-text-dark">{stats.total}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-border-light p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-light">Válidas</p>
                <p className="text-2xl font-bold text-green-600">{stats.validas}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-border-light p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-light">A Vencer</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.a_vencer}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-border-light p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-light">Vencidas</p>
                <p className="text-2xl font-bold text-red-600">{stats.vencidas}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros e Ações */}
      <div className="bg-white rounded-lg border border-border-light p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Busca */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-light" />
              <input
                type="text"
                placeholder="Buscar por número, funcionário ou tipo..."
                value={filtros.busca}
                onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-border-light rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          {/* Filtro Tipo */}
          <div className="w-full md:w-48">
            <select
              value={filtros.tipo}
              onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
              className="w-full px-4 py-2 border border-border-light rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">Todos os Tipos</option>
              <option value="CMA">CMA</option>
              <option value="CANAC">CANAC</option>
              <option value="CHT">CHT</option>
              <option value="PP">PP</option>
              <option value="PC">PC</option>
              <option value="PLA">PLA</option>
              <option value="IFR">IFR</option>
              <option value="INVA">INVA</option>
              <option value="INVH">INVH</option>
              <option value="MLTE">MLTE</option>
              <option value="MNTE">MNTE</option>
              <option value="OUTRO">OUTRO</option>
            </select>
          </div>

          {/* Filtro Status */}
          <div className="w-full md:w-48">
            <select
              value={filtros.status}
              onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
              className="w-full px-4 py-2 border border-border-light rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">Todos os Status</option>
              <option value="valida">Válidas</option>
              <option value="a_vencer">A Vencer (60d)</option>
              <option value="vencida">Vencidas</option>
            </select>
          </div>

          {/* Botão Adicionar */}
          <UIButton onClick={() => handleAbrirModal()}>
            <Plus size={16} className="mr-2" />
            Nova Licença
          </UIButton>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg border border-border-light overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-text-light">Carregando licenças...</p>
          </div>
        ) : licencasFiltradas.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhuma licença encontrada</h3>
            <p className="text-sm text-gray-500 mb-4">
              Não há licenças cadastradas ou que correspondam aos filtros aplicados.
            </p>
            <UIButton onClick={() => handleAbrirModal()}>
              <Plus size={16} className="mr-2" />
              Adicionar Licença
            </UIButton>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licencasFiltradas.map((licenca) => (
                <TableRow key={licenca.id}>
                  <TableCell className="font-medium">
                    <FuncionarioLink
                      funcionarioId={licenca.funcionario_id}
                      nome={licenca.funcionario_nome || licenca.funcionario_id}
                      className="hover:text-primary hover:underline"
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">{licenca.tipo}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{licenca.numero}</TableCell>
                  <TableCell>{format(parseISO(licenca.data_emissao), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>{format(parseISO(licenca.data_vencimento), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>{renderStatusBadge(licenca.data_vencimento)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleAbrirModal(licenca.id)}
                        className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleExcluir(licenca.id)}
                        className="px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition"
                      >
                        Excluir
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Modal */}
      {modalAberto && (
        <ModalLicenca
          mode={licencaEditando ? 'edit' : 'create'}
          licencaId={licencaEditando}
          aberto={modalAberto}
          onFechar={handleFecharModal}
          onSalvar={handleSalvar}
        />
      )}
    </div>
  );
}

export default LicencasTab;
