import { NavLink, useLocation } from 'react-router-dom';

const TABS = [
  { id: 'operacional', label: 'Painel Operacional', to: '/frms/controle-operacional' },
  { id: 'gestao', label: 'Gestão FRMS', to: '/frms' },
  { id: 'analise', label: 'Análise & Evidência', to: '/frms?vista=analise' },
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

export default function FrmsWorkspaceNav() {
  const location = useLocation();

  return (
    <nav
      aria-label="Áreas FRMS"
      className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950"
    >
      {TABS.map((tab) => {
        const active = isActive(location.pathname, location.search, tab.to);
        return (
          <NavLink
            key={tab.id}
            to={tab.to}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? 'bg-primary text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
