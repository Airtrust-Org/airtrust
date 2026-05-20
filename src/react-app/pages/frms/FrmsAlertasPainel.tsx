/**
 * FRMS — Painel de Alertas (/frms/alertas)
 *
 * Lista paginada e filtrada de alertas FRMS.
 * Ações: visualizar, resolver, filtrar por nível/tipo/tripulante.
 */
import { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Eye,
  CheckCircle2,
  Filter,
  Bell,
  BellOff,
  ChevronDown,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { EmptyState } from '@/react-app/components/ui/EmptyState';
import { useFrmsAlertas, useFrmsMutation } from '@/react-app/hooks/useFrms';
import type { FrmsAlertaRow } from '@/react-app/hooks/useFrms';
import { toast } from 'sonner';

const NIVEIS = ['AVISO', 'ATENCAO', 'CRITICO', 'VIOLACAO'] as const;

const NIVEL_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  AVISO: {
    bg: 'bg-slate-50 border-slate-200',
    text: 'text-slate-700',
    icon: 'text-slate-500',
  },
  ATENCAO: {
    bg: 'bg-yellow-50 border-yellow-200',
    text: 'text-yellow-800',
    icon: 'text-yellow-500',
  },
  CRITICO: {
    bg: 'bg-orange-50 border-orange-200',
    text: 'text-orange-800',
    icon: 'text-orange-500',
  },
  VIOLACAO: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', icon: 'text-red-500' },
};

function nivelBadge(nivel: string) {
  const displayNivel = nivel;
  const s = NIVEL_STYLES[displayNivel] || {
    bg: 'bg-gray-50 border-gray-200',
    text: 'text-gray-700',
    icon: '',
  };
  const label =
    displayNivel === 'AVISO'
      ? 'AVISO'
      : displayNivel === 'ATENCAO'
        ? 'ATENÇÃO'
        : displayNivel === 'CRITICO'
          ? 'CRÍTICO'
          : displayNivel === 'VIOLACAO'
            ? 'VIOLAÇÃO'
            : displayNivel;
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.bg} ${s.text} border`}
    >
      {label}
    </span>
  );
}

function formatAlertaData(createdAt: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(createdAt)) {
    const [ano, mes, dia] = createdAt.split('-').map(Number);
    const dataLocal = new Date(ano, mes - 1, dia);
    return dataLocal.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  const data = new Date(createdAt.replace(' ', 'T'));
  if (Number.isNaN(data.getTime())) return 'dia do fato não informado';

  return data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function FrmsAlertasPainel() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nivelParam = searchParams.get('nivel');
  const { mutate } = useFrmsMutation();

  const [filtroNivel, setFiltroNivel] = useState<string>(
    nivelParam && NIVEIS.includes(nivelParam as (typeof NIVEIS)[number]) ? nivelParam : '',
  );
  const [filtroResolvido, setFiltroResolvido] = useState('false');
  const [page, setPage] = useState(1);
  const limit = 25;

  useEffect(() => {
    if (nivelParam && NIVEIS.includes(nivelParam as (typeof NIVEIS)[number])) {
      setFiltroNivel(nivelParam);
      setPage(1);
    }
  }, [nivelParam]);

  const filtros: Record<string, string> = {
    resolvido: filtroResolvido,
    limit: String(limit),
    page: String(page),
  };
  if (filtroNivel) filtros.nivel = filtroNivel;

  const { data: alertasData, loading, refetch } = useFrmsAlertas(filtros);
  const alertas: FrmsAlertaRow[] = Array.isArray(alertasData) ? alertasData : [];

  const handleVisualizar = useCallback(
    async (id: string) => {
      try {
        await mutate(`/api/frms/alertas/${id}/visualizar`, { method: 'PUT' });
        toast.success('Alerta marcado como visualizado');
        refetch();
      } catch {
        toast.error('Erro ao marcar como visualizado');
      }
    },
    [mutate, refetch],
  );

  const handleResolver = useCallback(
    async (id: string) => {
      try {
        await mutate(`/api/frms/alertas/${id}/resolver`, {
          method: 'PUT',
          body: JSON.stringify({ notas: '' }),
        });
        toast.success('Alerta resolvido');
        refetch();
      } catch {
        toast.error('Erro ao resolver alerta');
      }
    },
    [mutate, refetch],
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/frms')}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Alertas FRMS</h1>
            <p className="text-sm text-gray-500">
              Gestão de alertas de fadiga e limites operacionais
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <Filter className="h-4 w-4 text-gray-400" />

          <div className="relative">
            <select
              value={filtroNivel}
              onChange={(e) => {
                setFiltroNivel(e.target.value);
                setPage(1);
              }}
              className="appearance-none rounded-lg border border-gray-200 pl-3 pr-8 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <option value="">Todos os Níveis</option>
              {NIVEIS.map((n) => (
                <option key={n} value={n}>
                  {n === 'AVISO'
                    ? 'Aviso'
                    : n === 'ATENCAO'
                      ? 'Atenção'
                      : n === 'CRITICO'
                        ? 'Crítico'
                        : n === 'VIOLACAO'
                          ? 'Violação'
                          : n}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          </div>

          <div className="relative">
            <select
              value={filtroResolvido}
              onChange={(e) => {
                setFiltroResolvido(e.target.value);
                setPage(1);
              }}
              className="appearance-none rounded-lg border border-gray-200 pl-3 pr-8 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <option value="false">Apenas Ativos</option>
              <option value="true">Apenas Resolvidos</option>
              <option value="">Todos</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          </div>

          <span className="ml-auto text-xs text-gray-400">
            {alertas.length} resultado(s) — Página {page}
          </span>
        </div>

        {/* List */}
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400">
              Carregando alertas...
            </div>
          ) : alertas.length === 0 ? (
            <div className="py-12 bg-white rounded-xl border border-gray-200">
              <EmptyState
                icon={<BellOff size={48} className="text-slate-300" />}
                title="Sem alertas"
                description="Nenhum alerta encontrado para os filtros aplicados."
              />
            </div>
          ) : (
            alertas.map((a) => {
              const styles = NIVEL_STYLES[a.nivel] || NIVEL_STYLES.AVISO;
              const nome = a.nome_tripulante ?? `Tripulante #${a.tripulante_id}`;
              const fichaUrl = a.tripulante_id ? `/frms/tripulante/${a.tripulante_id}` : null;
              const mensagemBase = a.mensagem
                .replace(/Tripulante #\d+/g, nome)
                .replace(/^[^:]+:\s*/, '');
              const dataFato = a.data_fato || a.data_jornada;
              const dataFatoLabel = dataFato
                ? formatAlertaData(dataFato)
                : 'dia do fato não informado';
              const mensagemCompleta = `${nome}: ${mensagemBase} no dia ${dataFatoLabel}`;
              return (
                <div key={a.id} className={`rounded-xl border p-4 ${styles.bg} transition-colors`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${styles.icon}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {nivelBadge(a.nivel)}
                        <span className="text-xs text-gray-400 ml-auto tabular-nums">
                          {dataFatoLabel}
                        </span>
                      </div>
                      {fichaUrl && (
                        <Link
                          to={fichaUrl}
                          className="inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800 hover:underline"
                        >
                          {nome}
                        </Link>
                      )}
                      <p className={`text-sm font-medium ${styles.text}`}>{mensagemCompleta}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {nome}
                        {a.valor_atual_min != null && (
                          <>
                            {' '}
                            — Valor: <span className="font-semibold">
                              {a.valor_atual_min}
                            </span> / {a.valor_limite_min}
                          </>
                        )}
                      </p>
                      {a.notas_resolucao && (
                        <p className="text-xs text-gray-500 mt-1 italic">
                          Resolução: {a.notas_resolucao}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!a.visualizado_em && a.visualizado === 0 && (
                        <button
                          onClick={() => handleVisualizar(a.id)}
                          title="Marcar como visualizado"
                          className="rounded-lg p-1.5 hover:bg-white/50 transition-colors"
                        >
                          <Eye className="h-4 w-4 text-gray-500" />
                        </button>
                      )}
                      {!a.resolvido_em && a.resolvido === 0 && (
                        <button
                          onClick={() => handleResolver(a.id)}
                          title="Resolver"
                          className="rounded-lg p-1.5 hover:bg-white/50 transition-colors"
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {alertas.length === limit && (
          <div className="flex justify-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
