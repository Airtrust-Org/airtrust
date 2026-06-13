import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import MroPageShell from './components/MroPageShell';
import MroPageHeader from './components/MroPageHeader';
import MroStatusBadge from './components/MroStatusBadge';
import { MOCK_COMPONENTES, MOCK_AERONAVES } from './data/mroMockData';
import { formatFH } from './data/mroUtils';

export default function MroComponentes() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const filtered = useMemo(() => {
    let items = MOCK_COMPONENTES;
    if (statusFilter !== 'todos') items = items.filter((c) => c.status === statusFilter);
    if (search) { const q = search.toLowerCase(); items = items.filter((c) => c.partNumber.toLowerCase().includes(q) || c.serialNumber.toLowerCase().includes(q) || c.descricao.toLowerCase().includes(q) || c.ata.toLowerCase().includes(q)); }
    return items;
  }, [search, statusFilter]);

  return (
    <AppLayout>
      <MroPageShell>
        <MroPageHeader title="Componentes" description={`${MOCK_COMPONENTES.length} componentes cadastrados`} />
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por PN, SN, descrição ou ATA..." className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <option value="todos">Todos os status</option>
            <option value="instalado">Instalado</option><option value="removido">Removido</option>
            <option value="estoque">Estoque</option><option value="oficina">Oficina</option>
          </select>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">PN</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">SN</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Descrição</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">ATA</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Aeronave</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">TSO (FH)</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Criticidade</th>
                <th className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-300">Ação</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((c) => {
                  const aeronave = c.aeronaveId ? MOCK_AERONAVES.find((a) => a.id === c.aeronaveId) : null;
                  return (<tr key={c.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{c.partNumber}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{c.serialNumber}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-slate-700 dark:text-slate-300" title={c.descricao}>{c.descricao}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{c.ata}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{aeronave?.matricula || '—'}</td>
                    <td className="px-4 py-3"><MroStatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{formatFH(c.tso)}</td>
                    <td className="px-4 py-3"><MroStatusBadge status={c.criticidade} /></td>
                    <td className="px-4 py-3 text-center"><button type="button" disabled onClick={() => toast.info('Em breve: detalhe do componente estará disponível na próxima fase.')} className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 opacity-50 cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400" title="Disponível em breve">Em breve</button></td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum componente encontrado.</div>}
        </div>
      </MroPageShell>
    </AppLayout>
  );
}
