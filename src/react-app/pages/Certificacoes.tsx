import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import {
  FileText,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import Button from '@/react-app/components/Button';
import RowActionsMenu from '@/react-app/components/UI/RowActionsMenu';
import { PageLayout, PageGrid, PageSection } from '@/react-app/components/layout/PageLayout';
import StatCard from '@/react-app/components/StatCard';
import { statusBadges } from '@/react-app/styles/design-tokens';
import { confirmDialog, showAlertDialog } from '@/react-app/utils/confirmDialog';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import { apiFetch } from '@/react-app/lib/apiFetch';

interface Certificacao {
  id: number;
  funcionario_id?: number;
  instrutor_id?: number;
  funcionario_nome: string;
  funcionario_matricula: string;
  treinamento_nome: string;
  treinamento_codigo: string;
  data_conclusao: string;
  data_vencimento?: string;
  status: string;
  instrutor?: string;
  nota?: number;
  funcionario?: {
    nome: string;
    matricula: string;
  };
  nome?: string;
  codigo?: string;
  data_realizado?: string;
  status_calculado?: string;
}

interface CertificacaoStats {
  total: number;
  ativas: number;
  vencidas: number;
  vencendo: number;
}

/**
 * Maps certification status to design system badge styles
 */
const getStatusBadgeClass = (status: string): string => {
  const normalizedStatus = (status || '').toUpperCase();

  if (
    normalizedStatus === 'VALIDA' ||
    normalizedStatus === 'ATIVO' ||
    normalizedStatus === 'VÁLIDO'
  ) {
    return statusBadges.valid;
  }
  if (normalizedStatus === 'VENCIDA' || normalizedStatus === 'VENCIDO') {
    return statusBadges.expired;
  }
  if (normalizedStatus === 'VENCENDO' || normalizedStatus === 'PROXIMO_VENCIMENTO') {
    return statusBadges.expiring;
  }
  if (normalizedStatus === 'REVOGADO' || normalizedStatus === 'REVOGADA') {
    return statusBadges.expired;
  }

  return statusBadges.valid;
};

export default function Certificacoes() {
  const [certificacoes, setCertificacoes] = useState<Certificacao[]>([]);
  const [stats, setStats] = useState<CertificacaoStats>({
    total: 0,
    ativas: 0,
    vencidas: 0,
    vencendo: 0,
  });
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const carregarPagina = async (page: number) => {
    try {
      setLoading(true);
      // A tela representa registros de qualificacoes_historico. Ler do endpoint
      // canônico de histórico garante que o id exibido seja o mesmo recurso
      // aceito pelo DELETE /api/qualificacoes/historico/:id.
      const resp = await apiFetch(
        `/api/qualificacoes/historico?page=${page}&limit=${limit}&stats=true`,
      );
      const result = await resp.json();
      if (resp.ok && result.success) {
        const historico = Array.isArray(result.data) ? result.data : [];
        const normalized: Certificacao[] = historico.map(
          (row: Record<string, unknown>) => ({
            id: Number(row.id),
            funcionario_id:
              row.funcionario_id != null ? Number(row.funcionario_id) : undefined,
            funcionario_nome: String(row.funcionario_nome || ''),
            funcionario_matricula: String(row.funcionario_matricula || ''),
            treinamento_nome: String(row.tipo_nome || row.tipo || ''),
            treinamento_codigo: String(row.tipo_codigo || ''),
            data_conclusao: String(row.data_realizacao || ''),
            data_vencimento:
              row.data_vencimento != null ? String(row.data_vencimento) : undefined,
            status: String(row.status || row.qualificacao_status || ''),
            instrutor: row.instrutor != null ? String(row.instrutor) : undefined,
            nome: String(row.tipo_nome || row.tipo || ''),
            codigo: String(row.tipo_codigo || ''),
            data_realizado: String(row.data_realizacao || ''),
            status_calculado: String(row.status || row.qualificacao_status || ''),
          }),
        );

        const pagination = result.pagination || {};
        const responseStats = result.stats || {};
        const totalRegistros = Number(
          pagination.total ?? result.meta?.total ?? responseStats.total ?? normalized.length,
        );

        setCertificacoes(normalized);
        setTotal(totalRegistros);
        setTotalPages(Math.max(1, Number(pagination.pages ?? 1)));
        setCurrentPage(Number(pagination.page ?? page));
        setStats({
          total: Number(responseStats.total ?? totalRegistros),
          ativas: Number(responseStats.validas ?? 0),
          vencidas: Number(responseStats.vencidas ?? 0),
          vencendo: Number(responseStats.vencendo ?? 0),
        });
      } else {
        setCertificacoes([]);
        setTotal(0);
        setTotalPages(1);
      }
    } catch (e) {
      console.error('[CERTIFICACOES] Erro:', e);
      setCertificacoes([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarPagina(currentPage);
  }, [currentPage]);

  const handleDeleteCertificacao = async (certificacaoId: number) => {
    const cert = certificacoes.find((c) => String(c.id) === String(certificacaoId));
    const nomeDisplay = cert?.treinamento_nome || `Certificação ${certificacaoId}`;
    const funcionarioDisplay = cert?.funcionario_nome || 'Funcionário';

    const confirmacao = await confirmDialog(
      `Tem certeza que deseja excluir a certificação "${nomeDisplay}" do funcionário "${funcionarioDisplay}"?\n\n` +
        'Esta ação não pode ser desfeita.',
    );

    if (!confirmacao) return;

    try {
      const response = await apiFetch(`/api/qualificacoes/historico/${certificacaoId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // 403: Permissão negada (RBAC)
      if (response.status === 403) {
        toast.warning('❌ Permissão negada. Apenas administradores podem deletar certificações.');
        return;
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Erro HTTP ${response.status}`);
      }

      if (!result.success) {
        throw new Error(result.error || 'Erro ao excluir certificação');
      }

      await carregarPagina(1);
    } catch (err) {
      console.error('Erro ao remover certificação:', err);
      showAlertDialog(
        `Erro ao excluir certificação: ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
      );
    }
  };

  if (loading) {
    return (
      <div className="import-container">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <PageLayout
      title="Gestão de Qualificações"
      subtitle="Controle completo do histórico de qualificações da tripulação"
    >
      {/* Stats KPIs */}
      <PageGrid columns={4} className="mb-8">
        <StatCard label="Total de Qualificações" value={stats.total.toString()} color="blue" />
        <StatCard label="Qualificações Ativas" value={stats.ativas.toString()} color="green" />
        <StatCard label="Vencendo em Breve" value={stats.vencendo.toString()} color="yellow" />
        <StatCard label="Qualificações Vencidas" value={stats.vencidas.toString()} color="red" />
      </PageGrid>

      {/* Lista de Certificações */}
      <PageSection>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Histórico de Qualificações</h3>
            <p className="text-sm text-gray-600 mt-1">
              Mostrando {certificacoes.length} de {total} registros (Página {currentPage} de{' '}
              {totalPages})
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-600">
            Importação e template movidos para{' '}
            <a
              href="/importacao#fluxo-certificacoes"
              className="font-semibold text-primary hover:underline"
            >
              Importações e Exportações
            </a>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Este módulo segue como consulta e manutenção do histórico. Novas cargas em lote agora
          começam pelo hub central.
        </div>

        {certificacoes.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <FileText className="w-12 h-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhuma qualificação encontrada
            </h3>
            <p className="text-gray-600 mb-4">
              Use o hub central para importar qualificações ou continue registrando manualmente.
            </p>
            <a
              href="/importacao#fluxo-certificacoes"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Abrir hub de importações e exportações
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className=" py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Funcionário
                  </th>
                  <th className=" py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Treinamento
                  </th>
                  <th className=" py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data Conclusão
                  </th>
                  <th className=" py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data Vencimento
                  </th>
                  <th className=" py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className=" py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Instrutor
                  </th>
                  <th className=" py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {certificacoes.map((cert) => (
                  <tr key={cert.id} className="hover:bg-gray-50">
                    <td className=" py-4 whitespace-nowrap">
                      <div>
                        <FuncionarioLink
                          funcionarioId={cert.funcionario_id}
                          nome={cert.funcionario_nome || cert.funcionario?.nome || '-'}
                          className="text-sm font-medium text-gray-900"
                        />
                        <div className="text-sm text-gray-500">
                          {cert.funcionario_matricula || cert.funcionario?.matricula}
                        </div>
                      </div>
                    </td>
                    <td className=" py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {cert.treinamento_nome || cert.nome}
                        </div>
                        <div className="text-sm text-gray-500">
                          {cert.treinamento_codigo || cert.codigo}
                        </div>
                      </div>
                    </td>
                    <td className=" py-4 whitespace-nowrap text-sm text-gray-900">
                      {cert.data_conclusao || cert.data_realizado
                        ? new Date(
                            cert.data_conclusao || cert.data_realizado || 0,
                          ).toLocaleDateString('pt-BR')
                        : '-'}
                    </td>
                    <td className=" py-4 whitespace-nowrap text-sm text-gray-900">
                      {cert.data_vencimento
                        ? new Date(cert.data_vencimento).toLocaleDateString('pt-BR')
                        : '-'}
                    </td>
                    <td className=" py-4 whitespace-nowrap">
                      <span
                        className={getStatusBadgeClass(cert.status || cert.status_calculado || '')}
                      >
                        {cert.status || cert.status_calculado}
                      </span>
                    </td>
                    <td className=" py-4 whitespace-nowrap text-sm text-gray-900">
                      <FuncionarioLink
                        funcionarioId={cert.instrutor_id}
                        nome={cert.instrutor || '-'}
                        className="text-sm text-gray-900"
                      />
                    </td>
                    <td className=" py-4 whitespace-nowrap text-center">
                      <RowActionsMenu
                        label={`Ações da certificação ${cert.treinamento_nome || cert.nome || cert.id}`}
                        actions={[
                          {
                            label: 'Excluir certificação',
                            destructive: true,
                            icon: Trash2,
                            onSelect: () => handleDeleteCertificacao(cert.id),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Controles de paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-700">
              Mostrando {Math.max(1, (currentPage - 1) * limit + 1)} até{' '}
              {Math.min(currentPage * limit, total)} de {total} registros
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => currentPage > 1 && setCurrentPage(1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
                title="Primeira página"
              >
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <div className="flex items-center space-x-1">
                <span className="px-3 py-1 text-sm font-medium text-gray-900">
                  Página {currentPage} de {totalPages}
                </span>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0"
                title="Próxima página"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => currentPage < totalPages && setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0"
                title="Última página"
              >
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </PageSection>
    </PageLayout>
  );
}
