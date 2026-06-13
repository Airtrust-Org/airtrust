import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import MroPageShell from './components/MroPageShell';
import MroPageHeader from './components/MroPageHeader';
import MroStatusBadge from './components/MroStatusBadge';
import { MOCK_ESTOQUE } from './data/mroMockData';

export default function MroEstoque() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [almoxFilter, setAlmoxFilter] = useState<string>('todos');
  const almoxarifados = useMemo(() => Array.from(new Set(MOCK_ESTOQUE.map((e) => e.almoxarifado))).sort(), []);
  const filtered = useMemo(() => {
    let items = MOCK_ESTOQUE;
    if (statusFilter !== 'todos') items = items.filter((e) => e.status === statusFilter);
    if (almoxFilter !== 'todos') items = items.filter((e) => e.almoxarifado === almoxFilter);
    if (search) { const q = search.toLowerCase(); items = items.filter((e) => e.partNumber.toLowerCase().includes(q) || e.descricao.toLowerCase().includes(q) || e.lote.toLowerCase().includes(q)); }
    return items;
  }, [search, statusFilter, almoxFilter]);

  return (
    <AppLayout>
      <MroPageShell>
        <MroPageHeader title="Estoque" description={`${MOCK_ESTOQUE.length} itens em estoque`} />
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por PN, descrição ou lote..." className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <option value="todos">Todos os status</option><option value="ok">OK</option>
            <option value="baixo">Baixo</option><option value="critico">Crítico</option><option value="vencido">Vencido</option>
          </select>
          <select value={almoxFilter} onChange={(e) => setAlmoxFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <option value="todos">Todos os almoxarifados</option>
            {almoxarifados.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><tr>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">PN</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Descrição</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Almoxarifado</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Lote</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Validade</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Saldo</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Mínimo</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((e) => {
              const saldoColor = e.status === 'critico' ? 'text-red-600 dark:text-red-400 font-bold' : e.status === 'baixo' ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-700 dark:text-slate-300';
              return (<tr key={e.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{e.partNumber}</td>
                <td className="px-4 py-3 max-w-[200px] truncate text-slate-700 dark:text-slate-300" title={e.descricao}>{e.descricao}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{e.almoxarifado}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{e.lote}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{e.validade}</td>
                <td className={`px-4 py-3 font-mono text-xs font-medium ${saldoColor}`}>{e.saldo} {e.unidade}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{e.estoqueMinimo} {e.unidade}</td>
                <td className="px-4 py-3"><MroStatusBadge status={e.status} /></td>
              </tr>);
            })}
          </tbody>
        </table></div>
        {filtered.length === 0 && <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum item encontrado.</div>}
        </div>
      </MroPageShell>
    </AppLayout>
  );
}
