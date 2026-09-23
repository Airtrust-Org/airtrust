import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, FileDown, FileSearch, RefreshCw } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import ControleVoosRdvWorkflowBadge from './components/ControleVoosRdvWorkflowBadge';
import ControleOperacionalFrmsPanel from './components/ControleOperacionalFrmsPanel';
import { baixarPetrobrasRveXml, useRdvFila, type CvRdvWorkflowStatus } from '@/react-app/hooks/useControleVoos';
import { formatDate, formatDateTime } from './data/controleVoosUtils';
import { flightOperationalRouteLabel, flightPresentationStatus } from './data/controleVoosFlightIdentity';
import { toast } from 'sonner';

const STATUS_OPTIONS: { value: CvRdvWorkflowStatus | ''; label: string }[] = [
  { value: '', label: 'Todos os status' },
  { value: 'devolvido', label: 'Devolvido' },
  { value: 'reaberto', label: 'Reaberto' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'em_revisao', label: 'Em revisão' },
  { value: 'aprovado_coordenacao', label: 'Aprovado (Coordenação)' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'cancelado', label: 'Cancelado' },
];

export default function ControleVoosCoordenacaoFila() {
  const [status, setStatus] = useState<CvRdvWorkflowStatus | ''>('enviado');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [xmlDate, setXmlDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [xmlLoading, setXmlLoading] = useState(false);

  const {
    data: fila = [],
    isLoading,
    isFetching,
    error,
    refetch,
    dataUpdatedAt,
  } = useRdvFila({
    status: status || undefined,
    data_inicio: dataInicio || undefined,
    data_fim: dataFim || undefined,
  });

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Fila da Coordenação"
            description="Relatórios de Voo enviados pelos pilotos — filtre por devolvido, reaberto, enviado, em revisão, aprovado, finalizado ou cancelado"
          />

          <ControleOperacionalFrmsPanel />

          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900/50 dark:bg-cyan-950/20">
            <div className="mr-auto">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Exportação diária Petrobras</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Gera o XML RVE apenas com voos finalizados. Se faltar identificador ou horário, a exportação é bloqueada para correção.</p>
            </div>
            <label className="space-y-1 text-xs">
              <span className="block font-medium text-slate-500 dark:text-slate-400">Data operacional</span>
              <input type="date" value={xmlDate} onChange={(event) => setXmlDate(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
            <button type="button" disabled={!xmlDate || xmlLoading} onClick={async () => { setXmlLoading(true); try { await baixarPetrobrasRveXml(xmlDate); toast.success('XML Petrobras gerado.'); } catch (xmlError) { toast.error(xmlError instanceof Error ? xmlError.message : 'Falha ao gerar XML Petrobras'); } finally { setXmlLoading(false); } }} className="inline-flex min-h-[36px] items-center gap-2 rounded-lg bg-cyan-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">
              <FileDown className="h-4 w-4" /> {xmlLoading ? 'Gerando…' : 'Gerar XML do dia'}
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <label className="space-y-1 text-xs">
              <span className="block font-medium text-slate-500 dark:text-slate-400">Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as CvRdvWorkflowStatus | '')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                data-testid="coordenacao-status-filter"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="block font-medium text-slate-500 dark:text-slate-400">De</span>
              <input
                type="date"
                value={dataInicio}
                onChange={(event) => setDataInicio(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="block font-medium text-slate-500 dark:text-slate-400">Até</span>
              <input
                type="date"
                value={dataFim}
                onChange={(event) => setDataFim(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              {isFetching ? 'Atualizando…' : 'Atualizar fila'}
            </button>
            <span className="ml-auto text-xs text-slate-400 dark:text-slate-500" aria-live="polite">
              Atualização automática a cada 15 s
              {dataUpdatedAt ? ` · última: ${new Date(dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
            </span>
          </div>

          {isLoading && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm text-slate-500 dark:text-slate-400">Carregando fila…</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/20">
              <p className="text-sm text-red-700 dark:text-red-300">
                Erro ao carregar a fila: {error.message}
              </p>
            </div>
          )}

          {!isLoading && !error && fila.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900">
              <ClipboardList className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Nenhum RDV encontrado para os filtros selecionados.
              </p>
            </div>
          )}

          {!isLoading && !error && fila.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                        Data
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                        RDV
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                        Prefixo
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                        Rota operacional
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                        Status RDV
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                        Status do voo
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                        Enviado em
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                        Justificativa
                      </th>
                      <th className="px-4 py-3 w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {fila.map((item) => (
                      <tr
                        key={item.id}
                        className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {formatDate(item.data_voo)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                          {item.numero}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {item.prefixo}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-300">
                          {flightOperationalRouteLabel(item, [])}
                        </td>
                        <td className="px-4 py-3">
                          <ControleVoosRdvWorkflowBadge status={item.workflow_status} />
                        </td>
                        <td className="px-4 py-3">
                          <ControleVoosStatusBadge
                            status={flightPresentationStatus({
                              status: item.flight_status,
                              horario_real_partida: item.horario_real_partida,
                              rdv_workflow_status: item.workflow_status,
                              rdv_enviado_em: item.enviado_em,
                            })}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                          {item.enviado_em ? formatDateTime(item.enviado_em) : '—'}
                        </td>
                        <td className="max-w-[14rem] truncate px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                          {item.motivo_devolucao || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/controle-voos/rdv/${item.voo_id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 hover:underline dark:text-purple-400"
                          >
                            <FileSearch className="h-3.5 w-3.5" /> Revisar
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
            RDV operacional interno N1. Na tela de revisão: alertas, diff, devolução, aprovação e
            reabertura.
          </p>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
