import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import MroPageShell from './components/MroPageShell';
import MroPageHeader from './components/MroPageHeader';
import MroStatusBadge from './components/MroStatusBadge';
import { MOCK_OS, MOCK_AERONAVES } from './data/mroMockData';

export default function MroOrdensServico() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const filtered = useMemo(() => {
    let items = MOCK_OS;
    if (statusFilter !== 'todos') items = items.filter((o) => o.status === statusFilter);
    if (tipoFilter !== 'todos') items = items.filter((o) => o.tipo === tipoFilter);
    if (search) { const q = search.toLowerCase(); items = items.filter((o) => o.numero.toLowerCase().includes(q) || o.titulo.toLowerCase().includes(q) || o.ata.toLowerCase().includes(q)); }
    return items;
  }, [search, statusFilter, tipoFilter]);

  return (
    <AppLayout>
      <MroPageShell>
        <MroPageHeader title="Ordens de Serviço" description={`${MOCK_OS.length} OS no sistema`} />
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número, título ou ATA..." className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <option value="todos">Todos os status</option>
            <option value="aberta">Aberta</option><option value="em-andamento">Em Andamento</option>
            <option value="aguardando-material">Aguard. Material</option><option value="aguardando-aprovacao">Aguard. Aprovação</option>
            <option value="concluida">Concluída</option><option value="cancelada">Cancelada</option>
          </select>
          <select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <option value="todos">Todos os tipos</option>
            <option value="preventiva">Preventiva</option><option value="corretiva">Corretiva</option>
            <option value="modificacao">Modificação</option><option value="inspecao">Inspeção</option>
            <option value="componente">Componente</option>
          </select>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nº</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Título</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Aeronave</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">ATA</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tipo</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Prioridade</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Emissão</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Prevista</th>
              <th className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-300">Ação</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((os) => {
                const aeronave = MOCK_AERONAVES.find((a) => a.id === os.aeronaveId);
                return (<tr key={os.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3"><Link to={`/mro/os/${os.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">{os.numero}</Link></td>
                  <td className="px-4 py-3 max-w-[220px] truncate text-slate-700 dark:text-slate-300" title={os.titulo}>{os.titulo}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{aeronave?.matricula || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{os.ata}</td>
                  <td className="px-4 py-3"><MroStatusBadge status={os.tipo} /></td>
                  <td className="px-4 py-3"><MroStatusBadge status={os.status} /></td>
                  <td className="px-4 py-3"><MroStatusBadge status={os.prioridade} /></td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{os.dataEmissao}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{os.dataPrevista}</td>
                  <td className="px-4 py-3 text-center"><Link to={`/mro/os/${os.id}`} className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40">Abrir</Link></td>
                </tr>);
              })}
            </tbody>
          </table></div>
          {filtered.length === 0 && <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma OS encontrada.</div>}
        </div>
      </MroPageShell>
    </AppLayout>
  );
}
