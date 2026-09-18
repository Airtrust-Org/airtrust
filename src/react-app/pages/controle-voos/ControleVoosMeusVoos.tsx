import { Link } from 'react-router-dom';
import { FileText, PlaneTakeoff, TabletSmartphone } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import { useMeusVoos, useControleVoosAeroportos, type CvAeroporto } from '@/react-app/hooks/useControleVoos';
import { formatDate, formatTime } from './data/controleVoosUtils';

function buildAeroMap(aeroportos: CvAeroporto[]) {
  return new Map(aeroportos.map((a) => [a.id, a]));
}

export default function ControleVoosMeusVoos() {
  const { data: voos = [], isLoading, error } = useMeusVoos();
  const { data: aeroportos = [] } = useControleVoosAeroportos();
  const aeroMap = buildAeroMap(aeroportos);

  return (
    <AppLayout>
      <div className="w-full min-w-0 overflow-x-hidden">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Meus voos"
            description="Voos atribuídos a você pela Coordenação — abra o Pilot App para fazer o lançamento, inclusive offline"
          >
            <Link
              to="/horas-voo"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <FileText className="h-4 w-4" /> Meu histórico de voo
            </Link>
          </ControleVoosPageHeader>

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

          {!isLoading && !error && voos.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900">
              <PlaneTakeoff className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Nenhum voo atribuído a você. Os voos são criados e atribuídos pela Coordenação.
              </p>
            </div>
          )}

          {!isLoading && !error && voos.length > 0 && (
            <>
              <div className="space-y-3 sm:hidden" data-testid="meus-voos-mobile-list">
                {voos.map((voo) => {
                  const origem = aeroMap.get(voo.origem_id);
                  const destino = aeroMap.get(voo.destino_id);
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
                        <ControleVoosStatusBadge status={voo.status} />
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="min-w-0">
                          <dt className="text-xs text-slate-400">Rota</dt>
                          <dd className="mt-1 break-words text-slate-700 dark:text-slate-200">
                            {origem?.codigo_icao || `ID:${voo.origem_id}`} →{' '}
                            {destino?.codigo_icao || `ID:${voo.destino_id}`}
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

              <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block dark:border-slate-700 dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Data</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Voo</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Origem → Destino</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Prev. saída</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status voo</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {voos.map((voo) => {
                        const origem = aeroMap.get(voo.origem_id);
                        const destino = aeroMap.get(voo.destino_id);
                        return (
                          <tr key={voo.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(voo.data_programacao)}</td>
                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{voo.prefixo}</td>
                            <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                              {origem?.codigo_icao || `ID:${voo.origem_id}`} → {destino?.codigo_icao || `ID:${voo.destino_id}`}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatTime(voo.horario_previsto_partida)}</td>
                            <td className="px-4 py-3"><ControleVoosStatusBadge status={voo.status} /></td>
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
    </AppLayout>
  );
}
