import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, PlaneTakeoff, Plus, TabletSmartphone } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import ControleVoosNovoVooDialog from './components/ControleVoosNovoVooDialog';
import { useMeusVoos, useControleVoosAeroportos, type CvAeroporto } from '@/react-app/hooks/useControleVoos';
import { formatDate, formatTime } from './data/controleVoosUtils';

function buildAeroMap(aeroportos: CvAeroporto[]) {
  return new Map(aeroportos.map((a) => [a.id, a]));
}

export default function ControleVoosMeusVoos() {
  const qc = useQueryClient();
  const [novoVooOpen, setNovoVooOpen] = useState(false);
  const { data: voos = [], isLoading, error } = useMeusVoos();
  const { data: aeroportos = [] } = useControleVoosAeroportos();
  const aeroMap = buildAeroMap(aeroportos);

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Meus voos"
            description="Voos atribuídos a você ou criados por você — preencha o RDV e prepare o voo para uso no tablet"
          >
            <button
              type="button"
              onClick={() => setNovoVooOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800"
            >
              <Plus className="h-4 w-4" /> Criar meu voo
            </button>
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
                Nenhum voo encontrado. Você pode criar seu próprio voo agora ou aguardar um voo atribuído pela Coordenação.
              </p>
            </div>
          )}

          {!isLoading && !error && voos.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Data</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Voo</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Origem → Destino</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Prev. saída</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status voo</th>
                      <th className="px-4 py-3 min-w-56" />
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
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                            {origem?.codigo_icao || `ID:${voo.origem_id}`} → {destino?.codigo_icao || `ID:${voo.destino_id}`}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatTime(voo.horario_previsto_partida)}</td>
                          <td className="px-4 py-3"><ControleVoosStatusBadge status={voo.status} /></td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <Link
                                to={`/controle-voos/rdv/${voo.id}`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 hover:underline dark:text-purple-400"
                              >
                                <FileText className="h-3.5 w-3.5" /> Meu RDV
                              </Link>
                              <a
                                href={`/pilot/?flight=${voo.id}`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-400"
                              >
                                <TabletSmartphone className="h-3.5 w-3.5" /> Abrir no Pilot App
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="mt-4 text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2">
            O voo criado pelo piloto nasce como planejado e vinculado somente ao próprio tripulante. O envio do RDV à Coordenação continua sendo uma ação separada.
          </p>
        </ControleVoosPageShell>
      </div>

      <ControleVoosNovoVooDialog
        open={novoVooOpen}
        mode="pilot"
        onClose={() => setNovoVooOpen(false)}
        onCreated={() => {
          void qc.invalidateQueries({ queryKey: ['cv-meus-voos'] });
        }}
      />
    </AppLayout>
  );
}
