import { AlertTriangle } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import { MOCK_INDISPONIBILIDADES, getAeronaveById, getCausaById, getGrupoById, getVooById } from './data/controleVoosMockData';
import { formatDateTime } from './data/controleVoosUtils';

export default function ControleVoosIndisponibilidades() {
  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader title="Indisponibilidades de Aeronave — Preview" description="Tela em preview. Ainda não existe schema operacional consolidado para indisponibilidades por causa, grupo e período nesta macroetapa.">
            <button
              disabled
              className="inline-flex items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
              title="Preview - indisponibilidades ainda sem backend/schema operacional"
            >
              <AlertTriangle className="h-4 w-4" />+ Nova
            </button>
          </ControleVoosPageHeader>

          <div className="space-y-4">
            {MOCK_INDISPONIBILIDADES.map((ind) => {
              const aeronave = getAeronaveById(ind.aeronaveId);
              const causa = getCausaById(ind.causaId);
              const grupo = getGrupoById(ind.grupoId);
              return (
                <div key={ind.id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-semibold text-slate-800 dark:text-slate-200">{aeronave?.matricula || '—'}</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">{aeronave?.modelo || ''}</span>
                      <ControleVoosStatusBadge status={ind.status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="bg-slate-100 rounded px-2 py-0.5 dark:bg-slate-800">{grupo?.nome || '—'}</span>
                      <span className="bg-slate-100 rounded px-2 py-0.5 dark:bg-slate-800">{causa?.nome || '—'}</span>
                    </div>
                  </div>
                  <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                    <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Início</dt><dd className="text-slate-700 dark:text-slate-300 font-mono">{formatDateTime(ind.dataInicio)}</dd></div>
                    <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Fim previsto</dt><dd className="text-slate-700 dark:text-slate-300 font-mono">{formatDateTime(ind.dataFimPrevista)}</dd></div>
                    <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Fim real</dt><dd className="text-slate-700 dark:text-slate-300 font-mono">{formatDateTime(ind.dataFimReal)}</dd></div>
                    <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">OS MRO</dt><dd className="text-slate-700 dark:text-slate-300 font-mono">{ind.osMroVinculada || '—'}</dd></div>
                  </dl>
                  {ind.observacao && (
                    <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-3 dark:bg-slate-800 dark:border-slate-700">
                      <p className="text-xs text-slate-600 dark:text-slate-400">{ind.observacao}</p>
                    </div>
                  )}
                  {ind.voosImpactados.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Voos impactados:</p>
                      <div className="flex flex-wrap gap-1">
                        {ind.voosImpactados.map((vooId) => {
                          const voo = getVooById(vooId);
                          return voo ? (
                            <span
                              key={vooId}
                              className="inline-flex items-center rounded bg-red-50 border border-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-300"
                              title="Referência ilustrativa do preview — sem detalhe operacional"
                            >
                              {voo.prefixo}
                            </span>
                          ) : null;
                        })}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        Referências ilustrativas do preview; não abrem registros operacionais.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{MOCK_INDISPONIBILIDADES.length} registros ilustrativos — manter fora do fluxo operacional ate schema real</p>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
