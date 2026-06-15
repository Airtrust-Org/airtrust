/**
 * FRMS — Histórico de Importações FIRA (/frms/importacao/fira/historico)
 *
 * Tabela paginada com todos os registros de importação FIRA,
 * com filtros por tripulante, status e período.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import Button from '@/react-app/components/Button';
import { EmptyState } from '@/react-app/components/UI/EmptyState';
import { useApi } from '@/react-app/hooks/useApi';
import { useFrmsMutation } from '@/react-app/hooks/useFrms';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface FiraHistoricoRow {
  id: string;
  tripulante_id: string | null;
  canac: string;
  nome_fira: string;
  ano: number;
  mes: number;
  arquivo_nome: string;
  status: 'REVISAO' | 'IMPORTADO' | 'REJEITADO' | 'ERRO';
  total_dias_extraidos: number;
  total_dias_importados: number;
  total_dias_substituidos: number;
  total_dias_ignorados: number;
  total_dias_erro: number;
  importado_por: string | null;
  importado_em: string | null;
  created_at: string;
  tripulante_nome: string | null;
  operador_nome: string | null;
}

interface ApiHistorico {
  data: FiraHistoricoRow[];
  total: number;
  page: number;
  per_page: number;
}

const MESES = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const STATUS_LABELS: Record<FiraHistoricoRow['status'], { label: string; color: string }> = {
  REVISAO: { label: 'Em Revisão', color: 'bg-amber-100 text-amber-800' },
  IMPORTADO: { label: 'Importado', color: 'bg-emerald-100 text-emerald-800' },
  REJEITADO: { label: 'Rejeitado', color: 'bg-red-100 text-red-700' },
  ERRO: { label: 'Erro', color: 'bg-red-200 text-red-900' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T'));
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ──────────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────────

export default function FrmsHistoricoFira() {
  const navigate = useNavigate();
  const { mutate } = useFrmsMutation();

  const [page, setPage] = useState(1);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroAno, setFiltroAno] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [deletando, setDeletando] = useState<string | null>(null);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('per_page', '20');
  if (filtroStatus) params.set('status', filtroStatus);
  if (filtroAno) params.set('ano', filtroAno);
  if (filtroMes) params.set('mes', filtroMes);

  const {
    data: raw,
    loading,
    error,
    refetch,
  } = useApi<ApiHistorico | FiraHistoricoRow[]>(`/api/frms/importacao/fira?${params.toString()}`);

  const historico: FiraHistoricoRow[] = Array.isArray(raw)
    ? (raw as FiraHistoricoRow[])
    : ((raw as ApiHistorico | undefined)?.data ?? []);
  const total: number = Array.isArray(raw)
    ? (raw as FiraHistoricoRow[]).length
    : ((raw as ApiHistorico | undefined)?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const handleDelete = async (id: string) => {
    if (
      !(await confirmDialog(
        'Excluir este registro de importação? Jornadas já importadas NÃO serão removidas.',
      ))
    )
      return;
    setDeletando(id);
    try {
      await mutate(`/api/frms/importacao/fira/${id}`, { method: 'DELETE' });
      toast.success('Registro removido');
      refetch?.();
    } catch {
      toast.error('Erro ao remover registro');
    } finally {
      setDeletando(null);
    }
  };

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i);

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Histórico de Importações FIRA</h1>
            <p className="mt-1 text-sm text-gray-500">
              Registro de todas as importações de FIRA realizadas
            </p>
          </div>
          <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-600">
            Novas importações agora começam em{' '}
            <a
              href="/importacao#fluxo-frms-fira"
              className="font-semibold text-primary hover:underline"
            >
              Importações e Exportações
            </a>
          </div>
        </div>

        {/* Filtros */}
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
            <div className="relative">
              <select
                value={filtroStatus}
                onChange={(e) => {
                  setFiltroStatus(e.target.value);
                  setPage(1);
                }}
                className="appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 cursor-pointer"
              >
                <option value="">Todos</option>
                <option value="IMPORTADO">Importado</option>
                <option value="REVISAO">Em Revisão</option>
                <option value="REJEITADO">Rejeitado</option>
                <option value="ERRO">Erro</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Ano</label>
            <div className="relative">
              <select
                value={filtroAno}
                onChange={(e) => {
                  setFiltroAno(e.target.value);
                  setPage(1);
                }}
                className="appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 cursor-pointer"
              >
                <option value="">Todos</option>
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Mês</label>
            <div className="relative">
              <select
                value={filtroMes}
                onChange={(e) => {
                  setFiltroMes(e.target.value);
                  setPage(1);
                }}
                className="appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 cursor-pointer"
              >
                <option value="">Todos</option>
                {MESES.slice(1).map((m, i) => (
                  <option key={i + 1} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>
          </div>
          {(filtroStatus || filtroAno || filtroMes) && (
            <Button
              variant="secondary"
              onClick={async () => {
                setFiltroStatus('');
                setFiltroAno('');
                setFiltroMes('');
                setPage(1);
              }}
            >
              Limpar Filtros
            </Button>
          )}
        </div>

        {/* Tabela */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-400">Carregando…</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-red-500">
              <AlertTriangle className="h-5 w-5" />
              Erro ao carregar histórico
            </div>
          ) : historico.length === 0 ? (
            <div className="py-20">
              <EmptyState
                icon={<History size={48} className="text-slate-300" />}
                title="Sem histórico"
                description="Nenhuma importação encontrada de acordo com os filtros. Use o hub central para iniciar uma nova carga FIRA."
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-3 pl-5 text-left">Aeronauta</th>
                  <th className="py-3 text-left">CANAC</th>
                  <th className="py-3 text-left">Período</th>
                  <th className="py-3 text-left">Status</th>
                  <th className="py-3 text-right pr-3">Imp.</th>
                  <th className="py-3 text-right pr-3">Subst.</th>
                  <th className="py-3 text-right pr-3">Erros</th>
                  <th className="py-3 text-left">Operador</th>
                  <th className="py-3 text-left">Data</th>
                  <th className="py-3 pr-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {historico.map((row) => {
                  const statusConf = STATUS_LABELS[row.status] ?? {
                    label: row.status,
                    color: 'bg-gray-100 text-gray-600',
                  };
                  return (
                    <tr key={row.id} className="transition-colors hover:bg-gray-50/50">
                      <td className="py-3 pl-5">
                        <p className="font-medium text-gray-900">
                          {row.tripulante_nome ?? (
                            <span className="text-amber-600">Não vinculado</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">{row.nome_fira}</p>
                      </td>
                      <td className="py-3 font-mono text-xs text-gray-600">{row.canac}</td>
                      <td className="py-3 text-gray-600">
                        {MESES[row.mes]} / {row.ano}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConf.color}`}
                        >
                          {statusConf.label}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right font-semibold text-emerald-700">
                        {row.total_dias_importados}
                      </td>
                      <td className="py-3 pr-3 text-right font-semibold text-amber-700">
                        {row.total_dias_substituidos}
                      </td>
                      <td className="py-3 pr-3 text-right font-semibold text-red-700">
                        {row.total_dias_erro > 0 ? (
                          row.total_dias_erro
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>
                      <td className="py-3 max-w-[120px] truncate text-xs text-gray-500">
                        {row.operador_nome ?? '—'}
                      </td>
                      <td className="py-3 text-xs text-gray-500">
                        {formatDate(row.importado_em ?? row.created_at)}
                      </td>
                      <td className="py-3 pr-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(row.status === 'REVISAO' || row.status === 'ERRO') && (
                            <button
                              title="Corrigir"
                              onClick={() =>
                                navigate(`/frms/importacao/fira?corrigir=${row.id}&from=historico`)
                              }
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                              <Wrench className="h-4 w-4" />
                            </button>
                          )}
                          {(row.status === 'REVISAO' ||
                            row.status === 'REJEITADO' ||
                            row.status === 'ERRO') && (
                            <button
                              title="Excluir"
                              disabled={deletando === row.id}
                              onClick={() => handleDelete(row.id)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <span>
              {total} registro{total !== 1 ? 's' : ''} · página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Back button */}
        <div className="mt-6">
          <button
            onClick={() => navigate('/frms')}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar ao Dashboard FRMS
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
