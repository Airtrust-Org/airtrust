import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Plane } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/react-app/components/AppLayout';
import { apiClient } from '@/react-app/services/apiClient';
import { toast } from 'sonner';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import ControleVoosRdvWorkflowBadge from './components/ControleVoosRdvWorkflowBadge';
import ControleVoosNovoVooDialog from './components/ControleVoosNovoVooDialog';
import { useControleVoosVoos, useControleVoosAeroportos, type CvAeroporto } from '@/react-app/hooks/useControleVoos';
import { formatDate, formatTime } from './data/controleVoosUtils';
import { flightOperationalRouteLabel } from './data/controleVoosFlightIdentity';
import ControleVoosDateControls from './components/ControleVoosDateControls';
import { useControleVoosDate } from './hooks/useControleVoosDate';

export default function ControleVoosVoos() {
  const qc = useQueryClient();
  const [novoVooOpen, setNovoVooOpen] = useState(false);
  const [sharingTomorrow, setSharingTomorrow] = useState(false);
  const { selectedDate, setSelectedDate, setToday } = useControleVoosDate();
  const { data, isLoading, error } = useControleVoosVoos({
    limit: 100,
    data_inicio: selectedDate,
    data_fim: selectedDate,
  });
  const { data: aeroportos = [] } = useControleVoosAeroportos();

  const voos = data?.voos || [];

  const shareTomorrowPlanning = async () => {
    if (sharingTomorrow) return;
    const shareWindow = window.open('', '_blank');
    setSharingTomorrow(true);
    try {
      const response = await apiClient.get<{ message: string; date: string; total: number }>(
        '/controle-voos/whatsapp-share/planejamento-dia-seguinte',
      );
      if (!response.success || !response.data?.message) {
        throw new Error(response.error || 'Não foi possível preparar o planejamento de amanhã');
      }
      const shareUrl = `https://wa.me/?text=${encodeURIComponent(response.data.message)}`;
      if (shareWindow) shareWindow.location.href = shareUrl;
      else window.open(shareUrl, '_blank', 'noopener,noreferrer');
    } catch (shareError) {
      shareWindow?.close();
      toast.error(shareError instanceof Error ? shareError.message : 'Falha ao preparar o planejamento de amanhã');
    } finally {
      setSharingTomorrow(false);
    }
  };

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Voos — Programação"
            description="Voos programados, em execução e realizados com dados reais N1 para uso operacional interno"
          >
            <div className="flex flex-wrap items-center gap-2">
              <ControleVoosDateControls
                value={selectedDate}
                onChange={setSelectedDate}
                onToday={setToday}
              />
              <button
                type="button"
                onClick={() => void shareTomorrowPlanning()}
                disabled={sharingTomorrow}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/20 dark:text-emerald-300"
              >
                <MessageCircle className="h-4 w-4" />
                {sharingTomorrow ? 'Preparando…' : 'Compartilhar planejamento de amanhã'}
              </button>
                            <button
                type="button"
                onClick={() => setNovoVooOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800"
              >
                <Plane className="h-4 w-4" />+ Novo Voo
              </button>
            </div>
          </ControleVoosPageHeader>

          {isLoading && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm text-slate-500 dark:text-slate-400">Carregando voos…</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/20">
              <p className="text-sm text-red-700 dark:text-red-300">Erro ao carregar voos: {error.message}</p>
            </div>
          )}

          {!isLoading && !error && voos.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900">
              <Plane className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Nenhum voo cadastrado.</p>
            </div>
          )}

          {!isLoading && !error && voos.length > 0 && (
            <>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Data</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Aeronave</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Rota operacional</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Prev. saída</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Real saída</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status voo</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status RDV</th>
                        <th className="px-4 py-3 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {voos.map((voo) => {
                        return (
                          <tr key={voo.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(voo.data_programacao)}</td>
                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                              <div>{voo.prefixo}</div>
                              {voo.numero_voo ? <div className="mt-0.5 text-xs font-normal text-slate-500">Voo {voo.numero_voo}</div> : null}
                            </td>
                            <td className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-300">
                              {flightOperationalRouteLabel(voo, aeroportos)}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatTime(voo.horario_previsto_partida)}</td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatTime(voo.horario_real_partida)}</td>
                            <td className="px-4 py-3"><ControleVoosStatusBadge status={voo.status} /></td>
                            <td className="px-4 py-3"><ControleVoosRdvWorkflowBadge status={voo.rdv_workflow_status} /></td>
                            <td className="px-4 py-3">
                              <Link
                                to={`/controle-voos/voos/${voo.id}`}
                                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                              >
                                Abrir
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                {voos.length} voo(s) em {formatDate(selectedDate)} — dados reais N1 · uso operacional interno
              </p>
            </>
          )}
        </ControleVoosPageShell>
      </div>

      <ControleVoosNovoVooDialog
        open={novoVooOpen}
        mode="coordenacao"
        onClose={() => setNovoVooOpen(false)}
        onCreated={(voo) => {
          setSelectedDate(voo.data_programacao);
          void qc.invalidateQueries({ queryKey: ['cv-voos'] });
          void qc.invalidateQueries({ queryKey: ['cv-dashboard'] });
        }}
      />
    </AppLayout>
  );
}
