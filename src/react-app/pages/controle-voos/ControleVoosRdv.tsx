import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import { MOCK_RDVS, getVooById, getAeroportoById, getAeronaveById } from './data/controleVoosMockData';
import { formatDate, formatTime, formatHours } from './data/controleVoosUtils';

export default function ControleVoosRdv() {
  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader title="RDVs — Relatórios Diários de Voo" description="Lista de todos os relatórios diários de voo">
            <button
              disabled
              className="inline-flex items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
              title="Funcionalidade em desenvolvimento"
            >
              <FileText className="h-4 w-4" />+ Novo RDV
            </button>
          </ControleVoosPageHeader>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nº RDV</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Voo</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Data</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Aeronave</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Comandante</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Origem → Destino</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Decolagem</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Pouso</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Horas</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Pousos</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {MOCK_RDVS.map((rdv) => {
                    const voo = getVooById(rdv.vooId);
                    const origem = voo ? getAeroportoById(voo.origemId) : undefined;
                    const destino = voo ? getAeroportoById(voo.destinoId) : undefined;
                    const aeronave = voo ? getAeronaveById(voo.aeronaveId) : undefined;
                    return (
                      <tr key={rdv.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{rdv.numero}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{voo?.prefixo || '—'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(rdv.dataVoo)}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{aeronave?.matricula || '—'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{rdv.assinaturaCmdteNome || '—'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{origem?.codigoIcao || '—'} → {destino?.codigoIcao || '—'}</td>
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatTime(rdv.horarioDecolagemReal)}</td>
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatTime(rdv.horarioPousoReal)}</td>
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{formatHours(rdv.horasVoadas)}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{rdv.numeroPousos ?? '—'}</td>
                        <td className="px-4 py-3"><ControleVoosStatusBadge status={rdv.status} /></td>
                        <td className="px-4 py-3">
                          <Link to={`/controle-voos/rdv/${rdv.id}`} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">Abrir</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{MOCK_RDVS.length} RDVs — dados demonstrativos</p>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
