import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, FileText, PlaneTakeoff, Plus, TabletSmartphone } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import ControleVoosRdvWorkflowBadge from './components/ControleVoosRdvWorkflowBadge';
import ControleVoosNovoVooDialog from './components/ControleVoosNovoVooDialog';
import { useMeusVoos, useControleVoosAeroportos, type CvAeroporto } from '@/react-app/hooks/useControleVoos';
import { formatDate, formatTime } from './data/controleVoosUtils';
import { flightOperationalRouteLabel , flightPresentationStatus } from './data/controleVoosFlightIdentity';


function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function flightDateKey(value: string | null | undefined) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

export default function ControleVoosMeusVoos() {
  const qc = useQueryClient();
  const [novoVooOpen, setNovoVooOpen] = useState(false);
  const { data: voos = [], isLoading, error } = useMeusVoos();
  const { data: aeroportos = [] } = useControleVoosAeroportos();
  const [selectedDate, setSelectedDate] = useState(() => localDateKey());

  const filteredVoos = useMemo(
    () => voos.filter((voo) => flightDateKey(voo.data_programacao) === selectedDate),
    [selectedDate, voos],
  );

  function shiftDate(days: number) {
    const date = new Date(`${selectedDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return;
    date.setDate(date.getDate() + days);
    setSelectedDate(localDateKey(date));
  }

  return (
    <AppLayout>
      <div className="w-full min-w-0 overflow-x-hidden">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Meus voos"
            description="Voos atribuídos a você ou criados por você — abra o Pilot App para fazer o lançamento, inclusive offline"
            className="sm:flex-col sm:items-stretch lg:flex-row lg:items-center"
          >
            <button
              type="button"
              onClick={() => setNovoVooOpen(true)}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800 sm:w-auto"
            >
              <Plus className="h-4 w-4" /> Criar meu voo
            </button>
            <Link
              to="/horas-voo"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <FileText className="h-4 w-4" /> Meu histórico de voo
            </Link>
          </ControleVoosPageHeader>

          <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                  <CalendarDays className="h-4 w-4" />
                  Voos por data
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Por padrão são exibidos somente os voos de hoje.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
                <button
                  type="button"
                  onClick={() => shiftDate(-1)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <ChevronLeft className="h-4 w-4" /> Dia anterior
                </button>
                <label className="col-span-2 text-sm text-slate-600 sm:col-span-1 dark:text-slate-300">
                  Data
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value || localDateKey())}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setSelectedDate(localDateKey())}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => shiftDate(1)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  Próximo dia <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          {isLoading && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm text-slate-500 dark:text-slate-400">Carregando seus voos…</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/20">
              <p className="text-sm text-red-700 dark:text-red-300">Erro ao carregar seus voos: {error.message}</p>
            </div>
          )}

          {!isLoading && !error && filteredVoos.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900">
              <PlaneTakeoff className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Nenhum voo encontrado para {formatDate(selectedDate)}. Você pode criar seu próprio voo ou aguardar uma atribuição da Coordenação.
              </p>
            </div>
          )}

          {!isLoading && !error && filteredVoos.length > 0 && (
            <>
              <div className="space-y-3 lg:hidden" data-testid="meus-voos-mobile-list">
                {filteredVoos.map((voo) => {
                  return (
                    <article
                      key={voo.id}
                      className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(voo.data_programacao)}
                          </p>
                          <h2 className="mt-0.5 break-words text-base font-semibold text-slate-900 dark:text-slate-100">
                            {voo.prefixo}
                          </h2>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <ControleVoosStatusBadge status={flightPresentationStatus(voo)} />
                          <ControleVoosRdvWorkflowBadge status={voo.rdv_workflow_status} />
                        </div>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="min-w-0">
                          <dt className="text-xs text-slate-400">Rota operacional</dt>
                          <dd className="mt-1 break-words text-slate-700 dark:text-slate-200">
                            {flightOperationalRouteLabel(voo, aeroportos)}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-slate-400">Prev. saída</dt>
                          <dd className="mt-1 font-mono text-slate-700 dark:text-slate-200">
                            {formatTime(voo.horario_previsto_partida)}
                          </dd>
                        </div>
                      </dl>

                      <a
                        href={`/pilot/?flight=${voo.id}`}
                        className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        <TabletSmartphone className="h-4 w-4" /> Abrir Pilot App
                      </a>
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block dark:border-slate-700 dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Data</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Aeronave</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Rota operacional</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Prev. saída</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status voo</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status RDV</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredVoos.map((voo) => {
                        return (
                          <tr key={voo.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(voo.data_programacao)}</td>
                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                              <div>{voo.prefixo}</div>
                              {voo.numero_voo ? <div className="mt-0.5 text-xs font-normal text-slate-500">Voo {voo.numero_voo}</div> : null}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                              {flightOperationalRouteLabel(voo, aeroportos)}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatTime(voo.horario_previsto_partida)}</td>
                            <td className="px-4 py-3"><ControleVoosStatusBadge status={flightPresentationStatus(voo)} /></td>
                            <td className="px-4 py-3"><ControleVoosRdvWorkflowBadge status={voo.rdv_workflow_status} /></td>
                            <td className="px-4 py-3 text-right">
                              <a
                                href={`/pilot/?flight=${voo.id}`}
                                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                              >
                                <TabletSmartphone className="h-3.5 w-3.5" /> Abrir Pilot App
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </ControleVoosPageShell>
      </div>

      <ControleVoosNovoVooDialog
        open={novoVooOpen}
        mode="pilot"
        onClose={() => setNovoVooOpen(false)}
        onCreated={(voo) => {
          const createdDate = flightDateKey(voo.data_programacao);
          if (createdDate) setSelectedDate(createdDate);
          void qc.invalidateQueries({ queryKey: ['cv-meus-voos'] });
        }}
      />
    </AppLayout>
  );
}
