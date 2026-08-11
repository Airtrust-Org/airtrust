import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plane } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import MroPageShell from './components/MroPageShell';
import MroPageHeader from './components/MroPageHeader';
import MroStatusBadge from './components/MroStatusBadge';
import { MOCK_AERONAVES, MroAeronave } from './data/mroMockData';
import { formatFH, formatCiclos } from './data/mroUtils';

export default function MroAeronaves() {
  const [search, setSearch] = useState('');

  // ⚡ Bolt: Cache array filtering to prevent O(N) operations on unrelated re-renders.
  // ⚡ Bolt: Hoist search.toLowerCase() to avoid O(N*3) redundant string allocations.
  const filtered = useMemo(() => {
    if (!search) return MOCK_AERONAVES;
    const q = search.toLowerCase();
    return MOCK_AERONAVES.filter(
      (a) =>
        a.matricula.toLowerCase().includes(q) ||
        a.modelo.toLowerCase().includes(q) ||
        a.base.toLowerCase().includes(q),
    );
  }, [search]);

  return (
    <AppLayout>
      <MroPageShell>
        <MroPageHeader
          title="Aeronaves"
          description={`${MOCK_AERONAVES.length} aeronaves na frota`}
        />
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por matrícula, modelo ou base..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <AeronaveCard key={a.id} aeronave={a} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-xl border border-slate-200 bg-white px-4 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
              <Plane className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Nenhuma aeronave encontrada.
              </p>
            </div>
          )}
        </div>
      </MroPageShell>
    </AppLayout>
  );
}

function AeronaveCard({ aeronave }: { aeronave: MroAeronave }) {
  return (
    <Link
      to={`/mro/aeronaves/${aeronave.id}`}
      className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-600"
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {aeronave.matricula}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{aeronave.modelo}</p>
        </div>
        <MroStatusBadge status={aeronave.status} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-slate-500 dark:text-slate-400">Base:</span>{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">{aeronave.base}</span>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Ano:</span>{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {aeronave.anoFabricacao}
          </span>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Horas:</span>{' '}
          <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
            {formatFH(aeronave.totalHoras)} FH
          </span>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Ciclos:</span>{' '}
          <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
            {formatCiclos(aeronave.totalCiclos)}
          </span>
        </div>
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            Próx. manut.: {aeronave.proximaManutencao}
          </span>
          <span className="font-medium text-blue-600 dark:text-blue-400">Ver detalhes →</span>
        </div>
      </div>
    </Link>
  );
}
