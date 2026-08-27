import { NavLink, useLocation } from 'react-router-dom';

const ADMIN_PATHS = [
  '/frms/configuracoes',
  '/frms/sigvoos',
  '/frms/checkin',
  '/frms/importacao/fira',
  '/frms/importacao/fira/historico',
  '/frms/escalas',
  '/frms/relatorios',
] as const;

const ADMIN_LINKS = [
  { label: 'Parâmetros', to: '/frms/configuracoes' },
  { label: 'SIGVOOS', to: '/frms/sigvoos' },
  { label: 'Check-in diário', to: '/frms/checkin' },
  { label: 'Importar FIRA', to: '/frms/importacao/fira' },
  { label: 'Histórico FIRA', to: '/frms/importacao/fira/historico' },
  { label: 'Escalas', to: '/frms/escalas' },
  { label: 'Relatórios', to: '/frms/relatorios' },
] as const;

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const primaryClass = (active: boolean) =>
  `rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
    active
      ? 'bg-primary text-white shadow-sm'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`;

const secondaryClass = (active: boolean) =>
  `rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white'
      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
  }`;

export default function FrmsWorkspaceNav() {
  const location = useLocation();
  const adminActive = isAdminPath(location.pathname);

  return (
    <div className="space-y-2">
      <nav
        aria-label="Áreas FRMS"
        className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950"
      >
        <NavLink to="/frms" end className={primaryClass(location.pathname === '/frms')}>
          Operação
        </NavLink>
        <NavLink
          to="/frms/alertas"
          className={primaryClass(location.pathname.startsWith('/frms/alertas'))}
        >
          Casos
        </NavLink>
        <NavLink to="/frms/configuracoes" className={primaryClass(adminActive)}>
          Administração
        </NavLink>
      </nav>

      {adminActive ? (
        <nav
          aria-label="Administração FRMS"
          className="flex flex-wrap gap-1 rounded-lg border border-slate-200/80 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-900/60"
        >
          {ADMIN_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={secondaryClass(
                location.pathname === link.to || location.pathname.startsWith(`${link.to}/`),
              )}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
