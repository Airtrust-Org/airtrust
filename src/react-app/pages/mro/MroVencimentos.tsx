import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import MroPageShell from './components/MroPageShell';
import MroPageHeader from './components/MroPageHeader';
import MroStatusBadge from './components/MroStatusBadge';
import { MOCK_VENCIMENTOS, MOCK_AERONAVES } from './data/mroMockData';
import { formatTipoControle, formatBrNumber } from './data/mroUtils';

export default function MroVencimentos() {
  const [search, setSearch] = useState('');
  const [criticidadeFilter, setCriticidadeFilter] = useState<string>('todos');
  const filtered = useMemo(() => {
    let items = MOCK_VENCIMENTOS;
    if (criticidadeFilter !== 'todos') items = items.filter((v) => v.criticidade === criticidadeFilter);
    if (search) { const q = search.toLowerCase(); items = items.filter((v) => v.tarefa.toLowerCase().includes(q) || v.ata.toLowerCase().includes(q) || v.referencia.toLowerCase().includes(q)); }
    return items;
  }, [search, criticidadeFilter]);

  return (
    <AppLayout>
      <MroPageShell>
        <MroPageHeader title="Vencimentos" description={`${MOCK_VENCIMENTOS.length} tarefas programadas de manutenção`} />
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por tarefa, ATA ou referência..." className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500" />
          </div>
          <select value={criticidadeFilter} onChange={(e) => setCriticidadeFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <option value="todos">Todas as criticidades</option>
            <option value="critica">Crítica</option><option value="alta">Alta</option>
            <option value="media">Média</option><option value="baixa">Baixa</option>
          </select>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Aeronave</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">ATA</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tarefa</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tipo Controle</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Limite</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Saldo</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Próx. Venc.</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Criticidade</th>
                <th className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-300">Ação</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((v) => {
                  const aeronave = MOCK_AERONAVES.find((a) => a.id === v.aeronaveId);
                  const saldoColor = v.saldo <= 10 ? 'text-red-600 dark:text-red-400 font-bold' : v.saldo <= 30 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-600 dark:text-slate-400';
                  return (<tr key={v.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">{aeronave && <Link to={`/mro/aeronaves/${aeronave.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">{aeronave.matricula}</Link>}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{v.ata}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-slate-700 dark:text-slate-300" title={v.tarefa}>{v.tarefa}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{formatTipoControle(v.tipoControle)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{v.limite} {v.unidade}</td>
                    <td className={`px-4 py-3 font-mono text-xs ${saldoColor}`}>{v.saldo} {v.unidade}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{v.proximoVencimento}</td>
                    <td className="px-4 py-3"><MroStatusBadge status={v.criticidade} /></td>
                    <td className="px-4 py-3 text-center"><button type="button" disabled onClick={() => toast.info('Protótipo: geração de OS não disponível nesta prévia.')} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-500 opacity-50 cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400" title="Funcionalidade não disponível no protótipo"><Wrench className="h-3 w-3" /> Gerar OS</button></td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum vencimento encontrado.</div>}
        </div>
      </MroPageShell>
    </AppLayout>
  );
}
