import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import MroPageShell from './components/MroPageShell';
import MroPageHeader from './components/MroPageHeader';
import MroStatusBadge from './components/MroStatusBadge';
import { MOCK_REGISTROS_TECNICOS, MOCK_AERONAVES } from './data/mroMockData';

export default function MroRegistrosTecnicos() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const filtered = useMemo(() => {
    let items = MOCK_REGISTROS_TECNICOS;
    if (statusFilter !== 'todos') items = items.filter((r) => r.status === statusFilter);
    if (tipoFilter !== 'todos') items = items.filter((r) => r.tipo === tipoFilter);
    if (search) { const q = search.toLowerCase(); items = items.filter((r) => r.servico.toLowerCase().includes(q) || r.osNumero.toLowerCase().includes(q) || r.liberador.toLowerCase().includes(q) || r.referenciaTecnica.toLowerCase().includes(q)); }
    return items;
  }, [search, statusFilter, tipoFilter]);

  return (
    <AppLayout>
      <MroPageShell>
        <MroPageHeader title="Registros Técnicos" description={`${MOCK_REGISTROS_TECNICOS.length} registros no sistema`} />
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por serviço, OS, liberador ou referência..." className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <option value="todos">Todos os status</option><option value="pendente">Pendente</option>
            <option value="aprovado">Aprovado</option><option value="rejeitado">Rejeitado</option>
          </select>
          <select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <option value="todos">Todos os tipos</option><option value="manutencao">Manutenção</option>
            <option value="inspecao">Inspeção</option><option value="alteracao">Alteração</option><option value="reparo">Reparo</option>
          </select>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><tr>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Aeronave</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">OS</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Data</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Serviço</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Ref. Técnica</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Liberador</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
            <th className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-300">PDF</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((r) => {
              const aeronave = MOCK_AERONAVES.find((a) => a.id === r.aeronaveId);
              return (<tr key={r.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-3">{aeronave && <Link to={`/mro/aeronaves/${aeronave.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">{aeronave.matricula}</Link>}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{r.osNumero}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.data}</td>
                <td className="px-4 py-3 max-w-[280px] truncate text-slate-700 dark:text-slate-300" title={r.servico}>{r.servico}</td>
                <td className="px-4 py-3 max-w-[150px] truncate text-xs text-slate-500 dark:text-slate-400">{r.referenciaTecnica}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400"><span className="font-medium">{r.liberador}</span><br /><span className="text-xs text-slate-400 dark:text-slate-500">{r.crmLiberador}</span></td>
                <td className="px-4 py-3"><MroStatusBadge status={r.status} /></td>
                <td className="px-4 py-3 text-center"><button type="button" disabled onClick={() => toast.info('Protótipo: exportação de PDF não disponível nesta prévia.')} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-500 opacity-50 cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400" title="Funcionalidade não disponível no protótipo"><Download className="h-3 w-3" /> PDF</button></td>
              </tr>);
            })}
          </tbody>
        </table></div>
        {filtered.length === 0 && <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum registro encontrado.</div>}
        </div>
      </MroPageShell>
    </AppLayout>
  );
}
