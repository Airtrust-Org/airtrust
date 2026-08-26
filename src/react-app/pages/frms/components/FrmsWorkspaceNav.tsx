import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

const PRIMARY_TABS = [
  { id: 'operacional', label: 'Operação agora', to: '/frms/controle-operacional' },
  { id: 'monitoramento', label: 'Monitoramento', to: '/frms' },
  { id: 'analise', label: 'Análise & Evidências', to: '/frms?vista=analise' },
] as const;

const ADMIN_PATHS = [
  '/frms/importacao/fira',
  '/frms/importacao/fira/historico',
  '/frms/escalas',
  '/frms/configuracoes',
] as const;

function isActive(pathname: string, search: string, to: string): boolean {
  if (to === '/frms/controle-operacional') {
    return pathname.startsWith('/frms/controle-operacional');
  }
  if (to === '/frms?vista=analise') {
    return pathname === '/frms' && new URLSearchParams(search).get('vista') === 'analise';
  }
  return pathname === '/frms' && new URLSearchParams(search).get('vista') !== 'analise';
}

function isAdministrationPath(pathname: string): boolean {
  return ADMIN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const itemClass = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
    active
      ? 'bg-primary text-white shadow-sm'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`;

export default function FrmsWorkspaceNav() {
  const location = useLocation();
  const adminActive = isAdministrationPath(location.pathname);

  return (
    <nav
      aria-label="Áreas FRMS"
      className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950"
    >
      {PRIMARY_TABS.map((tab) => {
        const active = isActive(location.pathname, location.search, tab.to);
        return (
          <NavLink key={tab.id} to={tab.to} className={itemClass(active)}>
            {tab.label}
          </NavLink>
        );
      })}

      <details className="group relative">
        <summary
          className={`${itemClass(adminActive)} flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden`}
          aria-label="Abrir Administração FRMS"
        >
          Administração
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="absolute right-0 z-40 mt-2 min-w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <NavLink
            to="/frms/importacao/fira"
            className="block rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Importar FIRA
          </NavLink>
          <NavLink
            to="/frms/importacao/fira/historico"
            className="block rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Histórico de FIRA
          </NavLink>
          <NavLink
            to="/frms/escalas"
            className="block rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Escalas quinzenais
          </NavLink>
          <NavLink
            to="/frms/configuracoes"
            className="block rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Configurações e políticas
          </NavLink>
        </div>
      </details>
    </nav>
  );
}
