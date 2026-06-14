import { Link } from 'react-router-dom';
import { Plane } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import { useControleVoosVoos, useControleVoosAeroportos, type CvAeroporto } from '@/react-app/hooks/useControleVoos';
import { formatDate, formatTime } from './data/controleVoosUtils';

function buildAeroMap(aeroportos: CvAeroporto[]) {
  return new Map(aeroportos.map((a) => [a.id, a]));
}

export default function ControleVoosVoos() {
  const { data, isLoading, error } = useControleVoosVoos({ limit: 100 });
  const { data: aeroportos = [] } = useControleVoosAeroportos();

  const aeroMap = buildAeroMap(aeroportos);
  const voos = data?.voos || [];

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Voos — Programação"
            description="Voos programados, em execução e realizados — dados reais N1"
          >
            <button
              disabled
              className="inline-flex items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
              title="N1 — criação de voo em desenvolvimento"
            >
              <Plane className="h-4 w-4" />+ Novo Voo
            </button>
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
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Voo</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Origem</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Destino</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Prev. saída</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Real saída</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                        <th className="px-4 py-3 w-10" />
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
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400" title={origem?.nome}>
                              {origem?.codigo_icao || `ID:${voo.origem_id}`}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400" title={destino?.nome}>
                              {destino?.codigo_icao || `ID:${voo.destino_id}`}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatTime(voo.horario_previsto_partida)}</td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatTime(voo.horario_real_partida)}</td>
                            <td className="px-4 py-3"><ControleVoosStatusBadge status={voo.status} /></td>
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
                {voos.length} voo(s) — dados reais N1 · uso operacional interno
              </p>
            </>
          )}
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
