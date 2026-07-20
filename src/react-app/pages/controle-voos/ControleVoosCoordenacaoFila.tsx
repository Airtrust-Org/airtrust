import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, FileSearch } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import { useRdvFila, type CvRdvWorkflowStatus } from '@/react-app/hooks/useControleVoos';
import { formatDate, formatDateTime } from './data/controleVoosUtils';

const STATUS_OPTIONS: { value: CvRdvWorkflowStatus | ''; label: string }[] = [
  { value: '', label: 'Todos os status' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'em_revisao', label: 'Em revisão' },
  { value: 'aprovado_coordenacao', label: 'Aprovado (Coordenação)' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'cancelado', label: 'Cancelado' },
];

const WORKFLOW_LABELS: Record<CvRdvWorkflowStatus, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  em_revisao: 'Em revisão',
  aprovado_coordenacao: 'Aprovado',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

const WORKFLOW_COLORS: Record<CvRdvWorkflowStatus, string> = {
  rascunho: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  enviado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  em_revisao: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  aprovado_coordenacao: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  finalizado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export default function ControleVoosCoordenacaoFila() {
  const [status, setStatus] = useState<CvRdvWorkflowStatus | ''>('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const { data: fila = [], isLoading, error } = useRdvFila({
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
            description="Relatórios de Voo enviados pelos pilotos, aguardando revisão, aprovação ou já finalizados"
          />

          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <label className="space-y-1 text-xs">
              <span className="block font-medium text-slate-500 dark:text-slate-400">Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as CvRdvWorkflowStatus | '')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
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
          </div>

          {isLoading && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm text-slate-500 dark:text-slate-400">Carregando fila…</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/20">
              <p className="text-sm text-red-700 dark:text-red-300">Erro ao carregar a fila: {error.message}</p>
            </div>
          )}

          {!isLoading && !error && fila.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900">
              <ClipboardList className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Nenhum RDV encontrado para os filtros selecionados.</p>
            </div>
          )}

          {!isLoading && !error && fila.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Data</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">RDV</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Prefixo</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Enviado em</th>
                      <th className="px-4 py-3 w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {fila.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(item.data_voo)}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{item.numero}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.prefixo}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${WORKFLOW_COLORS[item.workflow_status]}`}>
                            {WORKFLOW_LABELS[item.workflow_status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                          {item.enviado_em ? formatDateTime(item.enviado_em) : '—'}
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

          <p className="mt-4 text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2">
            RDV operacional interno N1. Uso operacional interno e não regulado.
          </p>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
