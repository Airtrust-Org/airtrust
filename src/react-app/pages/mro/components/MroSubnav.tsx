import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/mro', label: 'Visão operacional', exact: true },
  { to: '/mro/aeronaves', label: 'Frota' },
  { to: '/mro/os', label: 'OS' },
  { to: '/mro/vencimentos', label: 'Vencimentos' },
  { to: '/mro/componentes', label: 'Componentes' },
  { to: '/mro/estoque', label: 'Estoque' },
  { to: '/mro/registros-tecnicos', label: 'Registros técnicos' },
];

export default function MroSubnav() {
  const { pathname } = useLocation();

  return (
    <nav className="-mx-1 mb-5 overflow-x-auto px-1" aria-label="Navegação da manutenção">
      <div className="flex min-w-max gap-1">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === '/mro' || pathname === '/mro/dashboard'
            : pathname.startsWith(link.to);
          return (
            <Link
              key={link.to}
              to={link.to}
              aria-current={active ? 'page' : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
