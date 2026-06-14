import { Link } from 'react-router-dom';
import { Plane } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import { MOCK_VOOS, getAeroportoById, getAeronaveById, getTripulacaoByVooId } from './data/controleVoosMockData';
import { formatDate, formatTime } from './data/controleVoosUtils';

export default function ControleVoosVoos() {
  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader title="Voos — Programação" description="Lista completa de voos programados, em execução e realizados">
            <button
              disabled
              className="inline-flex items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
              title="Protótipo — criação de voo indisponível nesta prévia"
            >
              <Plane className="h-4 w-4" />+ Novo Voo
            </button>
          </ControleVoosPageHeader>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Data</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Voo</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Origem</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Destino</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Previsto</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Real</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Aeronave</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tripulação</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {MOCK_VOOS.map((voo) => {
                  const origem = getAeroportoById(voo.origemId);
                  const destino = getAeroportoById(voo.destinoId);
                  const aeronave = getAeronaveById(voo.aeronaveId);
                  const tripulacao = getTripulacaoByVooId(voo.id);
                  const tripSummary = tripulacao.length > 0
                    ? `${tripulacao.filter((t) => t.funcao === 'PIC').map((t) => t.tripulante.nome.split(' ').pop()).join(', ') || '—'} +${tripulacao.length - 1}`
                    : '—';
                  return (
                    <tr key={voo.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(voo.dataProgramacao)}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{voo.prefixo}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400" title={origem?.nome}>{origem?.codigoIcao || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400" title={destino?.nome}>{destino?.codigoIcao || '—'}</td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatTime(voo.horarioPrevisto)}</td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatTime(voo.horarioRealPartida)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{aeronave?.matricula || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{tripSummary}</td>
                      <td className="px-4 py-3"><ControleVoosStatusBadge status={voo.status} /></td>
                      <td className="px-4 py-3">
                        <Link to={`/controle-voos/voos/${voo.id}`} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">Abrir</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{MOCK_VOOS.length} voos cadastrados — dados demonstrativos</p>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
