import React, { useState, useMemo } from 'react';
import { Search, Edit2, Download, FileUp, Trash2, RotateCcw, FileText, X, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { EmptyState, VirtualTable } from '@/react-app/components/UI';
import Button from '@/react-app/components/Button';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import { useDebounce } from '@/react-app/hooks/useDebounce';
import { statusBadges } from '@/react-app/styles/design-tokens';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface Habilitacao {
  id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  categoria_id?: number;
  categoria_nome?: string;
  qualificacao_id?: number;
  qualificacao_nome?: string;
  qualificacao_codigo?: string;
  data_vencimento: string;
  data_conclusao?: string;
  validade_meses?: number;
  validade_calculada?: string;
  dias_restantes?: number;
  certificado_url?: string;
  total_certificados?: number;
  renovada?: boolean;
  status?: 'VIGENTE' | 'VENCIDO' | 'PROXIMO_VENCIMENTO' | 'RENOVADA';
}

interface HistoricoTabProps {
  habilitacoes: Habilitacao[];
  loading?: boolean;
  onEdit?: (hab: Habilitacao) => void;
  onDelete?: (id: number) => void;
  onUploadCertificado?: (hab: Habilitacao) => void;
  onDownload?: (url: string) => void;
  onRenovar?: (hab: Habilitacao) => void; // Novo para renovação
}

/**
 * Maps status values to design system badge styles
 */
const getStatusBadgeClass = (status: string): string => {
  switch (status) {
    case 'VIGENTE':
      return statusBadges.valid;
    case 'PROXIMO_VENCIMENTO':
      return statusBadges.expiring;
    case 'VENCIDO':
      return statusBadges.expired;
    case 'RENOVADA':
      return statusBadges.valid;
    default:
      return statusBadges.valid;
  }
};

const formatarDataBR = (data?: string) => {
  if (!data) return '-';
  try {
    return new Date(data).toLocaleDateString('pt-BR');
  } catch {
    return data;
  }
};

const tableActionButtonClass =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400';

const tableActionDangerButtonClass =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 shadow-sm transition hover:bg-rose-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400';

export const HistoricoTab: React.FC<HistoricoTabProps> = ({
  habilitacoes = [],
  loading = false,
  onEdit,
  onDelete,
  onUploadCertificado,
  onDownload,
  onRenovar,
}) => {
  const [filtroFuncionario, setFiltroFuncionario] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [sortColuna, setSortColuna] = useState<string | null>(null);
  const [sortDirecao, setSortDirecao] = useState<'asc' | 'desc'>('asc');

  // ✅ Debounce no filtro de funcionário (300ms)
  const debouncedFiltroFuncionario = useDebounce(filtroFuncionario, 300);

  // ✅ Memoizar filtro e ordenação
  const habilitacoesFiltrais = useMemo(() => {
    return habilitacoes
      .filter((hab) => {
        if (
          debouncedFiltroFuncionario &&
          !hab.funcionario_nome?.toLowerCase().includes(debouncedFiltroFuncionario.toLowerCase())
        ) {
          return false;
        }
        if (filtroStatus && hab.status !== filtroStatus) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (!sortColuna) return 0;
        const aVal = a[sortColuna as keyof Habilitacao];
        const bVal = b[sortColuna as keyof Habilitacao];
        if (aVal === bVal || aVal === undefined || bVal === undefined) return 0;
        const comparison = String(aVal) < String(bVal) ? -1 : 1;
        return sortDirecao === 'asc' ? comparison : -comparison;
      });
  }, [habilitacoes, debouncedFiltroFuncionario, filtroStatus, sortColuna, sortDirecao]);

  const handleSort = (coluna: string) => {
    if (sortColuna === coluna) {
      setSortDirecao(sortDirecao === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColuna(coluna);
      setSortDirecao('asc');
    }
  };

  const limparFiltros = () => {
    setFiltroFuncionario('');
    setFiltroStatus('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!loading && habilitacoes.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="w-12 h-12" />}
        title="Nenhuma qualificação"
        description="Não há qualificações registradas para este funcionário."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* FILTROS */}
      <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">Filtros</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Filtro: Funcionário */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Funcionário</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar funcionário..."
                value={filtroFuncionario}
                onChange={(e) => setFiltroFuncionario(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Filtro: Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
            >
              <option value="">Todos os status</option>
              <option value="VIGENTE">Vigente</option>
              <option value="PROXIMO_VENCIMENTO">Próximo Vencimento</option>
              <option value="VENCIDO">Vencido</option>
              <option value="RENOVADA">Renovada</option>
            </select>
          </div>
        </div>

        {/* Botão Limpar Filtros */}
        {(filtroFuncionario || filtroStatus) && (
          <Button variant="ghost" size="sm" onClick={limparFiltros} aria-label="Limpar filtros">
            <X className="w-4 h-4 mr-2" aria-hidden="true" />
            Limpar Filtros
          </Button>
        )}
      </div>

      {/* TABELA */}
      {habilitacoesFiltrais.length > 100 ? (
        // ✅ VirtualTable para > 100 itens
        <VirtualTable
          data={habilitacoesFiltrais}
          rowHeight={64}
          maxHeight="h-[600px]"
          columns={[
            {
              key: 'acoes',
              header: 'Ações',
              width: '12%',
              render: (hab: Habilitacao) => (
                <div className="flex gap-1">
                  {/* Botão renovar */}
                  {hab.status !== 'RENOVADA' && (
                    <button
                      type="button"
                      onClick={() => onRenovar?.(hab)}
                      title="Renovar"
                      aria-label="Renovar qualificação"
                      className={tableActionButtonClass}
                    >
                      <RotateCcw className="w-4 h-4 text-purple-600" aria-hidden="true" />
                    </button>
                  )}
                  {hab.certificado_url && (
                    <button
                      type="button"
                      onClick={() => onDownload?.(hab.certificado_url!)}
                      title="Download Certificado"
                      aria-label="Download certificado"
                      className={tableActionButtonClass}
                    >
                      <Download className="w-4 h-4 text-primary" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onUploadCertificado?.(hab)}
                    title="Upload/Gerir Certificado"
                    aria-label="Gerenciar certificado"
                    className={tableActionButtonClass}
                  >
                    <FileUp
                      className={`w-4 h-4 ${
                        hab.total_certificados && hab.total_certificados > 0
                          ? 'text-green-600'
                          : 'text-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit?.(hab)}
                    title="Editar"
                    aria-label="Editar qualificação"
                    className={tableActionButtonClass}
                  >
                    <Edit2 className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (await confirmDialog('Tem certeza que deseja deletar?')) {
                        onDelete?.(hab.id);
                      }
                    }}
                    title="Deletar"
                    aria-label="Excluir qualificação"
                    className={tableActionDangerButtonClass}
                  >
                    <Trash2 className="w-4 h-4 text-red-600" aria-hidden="true" />
                  </button>
                </div>
              ),
            },
            {
              key: 'funcionario_nome',
              header: 'Funcionário',
              width: '20%',
              render: (hab: Habilitacao) => (
                <FuncionarioLink
                  funcionarioId={hab.funcionario_id}
                  nome={hab.funcionario_nome || '-'}
                  className="font-medium text-slate-900"
                />
              ),
            },
            {
              key: 'categoria_nome',
              header: 'Categoria',
              width: '15%',
              render: (hab: Habilitacao) => (
                <span className="text-slate-600">{hab.categoria_nome || '-'}</span>
              ),
            },
            {
              key: 'qualificacao_codigo',
              header: 'Código',
              width: '10%',
              render: (hab: Habilitacao) => (
                <span className="text-slate-600">{hab.qualificacao_codigo || '-'}</span>
              ),
            },
            {
              key: 'qualificacao_nome',
              header: 'Qualificação',
              width: '18%',
              render: (hab: Habilitacao) => (
                <span className="text-slate-900">{hab.qualificacao_nome || '-'}</span>
              ),
            },
            {
              key: 'data_conclusao',
              header: 'Conclusão',
              width: '12%',
              render: (hab: Habilitacao) => (
                <span className="text-slate-600">{formatarDataBR(hab.data_conclusao)}</span>
              ),
            },
            {
              key: 'validade_calculada',
              header: 'Validade',
              width: '12%',
              render: (hab: Habilitacao) => (
                <span className="text-slate-600">{formatarDataBR(hab.validade_calculada)}</span>
              ),
            },
            {
              key: 'dias_restantes',
              header: 'Dias Restantes',
              width: '12%',
              render: (hab: Habilitacao) => {
                const dias = hab.dias_restantes;
                if (dias === null || dias === undefined) {
                  return <span className="text-sm text-slate-400">-</span>;
                }
                const isVencido = dias < 0;
                const isProximo = dias <= 30 && dias >= 0;
                return (
                  <span
                    className={`inline-flex items-center gap-1 text-sm font-medium ${
                      isVencido ? 'text-red-600' : isProximo ? 'text-yellow-600' : 'text-green-600'
                    }`}
                  >
                    {isVencido ? (
                      <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : isProximo ? (
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    {isVencido ? `Vencido há ${Math.abs(dias)} d` : `${dias} d`}
                  </span>
                );
              },
            },
            {
              key: 'status',
              header: 'Status',
              width: '12%',
              render: (hab: Habilitacao) => (
                <span className={getStatusBadgeClass(hab.status || 'VIGENTE')}>
                  {hab.status || 'N/A'}
                </span>
              ),
            },
          ]}
        />
      ) : (
        // ✅ Table normal para < 100 itens
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider w-12">
                  Ações
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort('funcionario_nome')}
                >
                  <div className="flex items-center gap-2">
                    Funcionário
                    {sortColuna === 'funcionario_nome' && (
                      <span className="text-xs">{sortDirecao === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Categoria
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Código
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Qualificação
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Conclusão
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Validade
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Dias Restantes
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {habilitacoesFiltrais.map((hab) => (
                <tr key={hab.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-1">
                      {hab.certificado_url && (
                        <button
                          type="button"
                          onClick={() => onDownload?.(hab.certificado_url!)}
                          title="Download Certificado"
                          aria-label="Download certificado"
                          className={tableActionButtonClass}
                        >
                          <Download className="w-4 h-4 text-primary" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onUploadCertificado?.(hab)}
                        title="Upload/Gerir Certificado"
                        aria-label="Gerenciar certificado"
                        className={tableActionButtonClass}
                      >
                        <FileUp
                          className={`w-4 h-4 ${
                            hab.total_certificados && hab.total_certificados > 0
                              ? 'text-green-600'
                              : 'text-slate-400'
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit?.(hab)}
                        title="Editar"
                        aria-label="Editar qualificação"
                        className={tableActionButtonClass}
                      >
                        <Edit2 className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (await confirmDialog('Tem certeza que deseja deletar?')) {
                            onDelete?.(hab.id);
                          }
                        }}
                        title="Deletar"
                        aria-label="Excluir qualificação"
                        className={tableActionDangerButtonClass}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    <FuncionarioLink
                      funcionarioId={hab.funcionario_id}
                      nome={hab.funcionario_nome || '-'}
                      className="font-medium text-slate-900"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {hab.categoria_nome || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {hab.qualificacao_codigo || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-900">
                    {hab.qualificacao_nome || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {formatarDataBR(hab.data_conclusao)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {formatarDataBR(hab.validade_calculada)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(() => {
                      const dias = hab.dias_restantes;
                      if (dias === null || dias === undefined) {
                        return <span className="text-sm text-slate-400">-</span>;
                      }
                      const isVencido = dias < 0;
                      const isProximo = dias <= 30 && dias >= 0;
                      return (
                        <span
                          className={`inline-flex items-center gap-1 text-sm font-medium ${
                            isVencido ? 'text-red-600' : isProximo ? 'text-yellow-600' : 'text-green-600'
                          }`}
                        >
                          {isVencido ? (
                            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : isProximo ? (
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          {isVencido ? `Vencido há ${Math.abs(dias)} d` : `${dias} d`}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={getStatusBadgeClass(hab.status || 'VIGENTE')}>
                      {hab.status || 'N/A'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && habilitacoesFiltrais.length === 0 && (
        <div className="py-8">
          <EmptyState
            icon={<FileText size={48} className="text-slate-300" />}
            title="Nenhum registro"
            description="Nenhum registro encontrado com os filtros aplicados."
          />
        </div>
      )}
    </div>
  );
};

export default HistoricoTab;
