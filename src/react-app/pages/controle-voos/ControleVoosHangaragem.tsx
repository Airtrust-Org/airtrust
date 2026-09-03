import { Warehouse, Link as LinkIcon } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import { MOCK_HANGARAGENS, getAeronaveById } from './data/controleVoosMockData';
import { formatDateTime } from './data/controleVoosUtils';

export default function ControleVoosHangaragem() {
  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader title="Hangaragem" description="Ainda não existe tabela operacional real para hangaragem nem integração confiável com MRO nesta macroetapa.">
            <button
              disabled
              className="inline-flex items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
              title="Preview - hangaragem ainda sem backend/schema operacional"
            >
              <Warehouse className="h-4 w-4" />+ Nova Hangaragem
            </button>
          </ControleVoosPageHeader>

          <div className="space-y-4">
            {MOCK_HANGARAGENS.map((hang) => {
              const aeronave = getAeronaveById(hang.aeronaveId);
              return (
                <div key={hang.id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <Warehouse className="h-5 w-5 text-orange-500" />
                      <span className="text-base font-semibold text-slate-800 dark:text-slate-200">{aeronave?.matricula || '—'}</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">{aeronave?.modelo || ''}</span>
                      <ControleVoosStatusBadge status={hang.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      {hang.osMroVinculada && (
                        <span className="inline-flex items-center gap-1 rounded bg-purple-50 border border-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-950/20 dark:border-purple-800 dark:text-purple-300">
                          <LinkIcon className="h-3 w-3" />{hang.osMroVinculada}
                        </span>
                      )}
                    </div>
                  </div>
                  <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                    <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Data entrada</dt><dd className="text-slate-700 dark:text-slate-300 font-mono">{formatDateTime(hang.dataEntrada)}</dd></div>
                    <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Data saída</dt><dd className="text-slate-700 dark:text-slate-300 font-mono">{formatDateTime(hang.dataSaida)}</dd></div>
                    <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Motivo</dt><dd className="text-slate-700 dark:text-slate-300">{hang.motivo}</dd></div>
                    <div><dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Status</dt><dd><ControleVoosStatusBadge status={hang.status} /></dd></div>
                  </dl>
                </div>
              );
            })}
          </div>

          {MOCK_HANGARAGENS.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center dark:border-slate-700 dark:bg-slate-900">
              <Warehouse className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Nenhuma hangaragem registrada.</p>
            </div>
          )}

          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{MOCK_HANGARAGENS.length} registros ilustrativos — manter fora do fluxo operacional ate schema real</p>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
