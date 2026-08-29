import { NavLink, useLocation } from 'react-router-dom';
import { HeartPulse } from 'lucide-react';
import FrmsSourcePolicyBanner from './FrmsSourcePolicyBanner';

const ADMIN_PATHS = [
  '/frms/configuracoes',
  '/frms/sigvoos',
  '/frms/importacao/fira',
  '/frms/importacao/fira/historico',
  '/frms/escalas',
  '/frms/relatorios',
] as const;

const ADMIN_GROUPS = [
  {
    label: 'Configuração',
    links: [
      { label: 'Parâmetros', to: '/frms/configuracoes' },
      { label: 'SIGVOOS', to: '/frms/sigvoos' },
    ],
  },
  {
    label: 'Dados de entrada',
    links: [
      { label: 'Importar FIRA', to: '/frms/importacao/fira' },
      { label: 'Histórico FIRA', to: '/frms/importacao/fira/historico' },
      { label: 'Escalas', to: '/frms/escalas' },
    ],
  },
  {
    label: 'Consulta',
    links: [{ label: 'Relatórios', to: '/frms/relatorios' }],
  },
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

const checkinClass = (active: boolean) =>
  `inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 sm:ml-auto ${
    active
      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50'
  }`;

const secondaryClass = (active: boolean) =>
  `rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white'
      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
  }`;

interface FrmsWorkspaceNavProps {
  showOperationsArea?: boolean;
  showMaintenanceArea?: boolean;
}

export default function FrmsWorkspaceNav({
  showOperationsArea = true,
  showMaintenanceArea = false,
}: FrmsWorkspaceNavProps = {}) {
  const location = useLocation();
  const adminActive = isAdminPath(location.pathname);
  const checkinActive =
    location.pathname === '/frms/checkin' || location.pathname.startsWith('/frms/checkin/');
  const area = new URLSearchParams(location.search).get('area');
  const operationsActive = location.pathname === '/frms' && area !== 'manutencao';
  const maintenanceActive = location.pathname === '/frms' && area === 'manutencao';

  return (
    <div className="space-y-2">
      <nav
        aria-label="Áreas FRMS"
        className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950"
      >
        {showOperationsArea ? (
          <NavLink to="/frms?area=operacoes" className={primaryClass(operationsActive)}>
            Operações
          </NavLink>
        ) : null}
        {showMaintenanceArea ? (
          <NavLink to="/frms?area=manutencao" className={primaryClass(maintenanceActive)}>
            Manutenção
          </NavLink>
        ) : null}
        <NavLink
          to="/frms/alertas"
          className={primaryClass(location.pathname.startsWith('/frms/alertas'))}
        >
          Casos
        </NavLink>
        <NavLink to="/frms/configuracoes" className={primaryClass(adminActive)}>
          Administração
        </NavLink>
        <NavLink to="/frms/checkin" className={checkinClass(checkinActive)}>
          <HeartPulse className="h-4 w-4" />
          Check-in de fadiga
        </NavLink>
      </nav>

      {adminActive ? <FrmsSourcePolicyBanner compact /> : null}

      {adminActive ? (
        <nav
          aria-label="Administração FRMS"
          className="grid gap-2 rounded-lg border border-slate-200/80 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/60 lg:grid-cols-[auto_1fr_auto]"
        >
          {ADMIN_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-wrap items-center gap-1">
              <span className="px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                {group.label}
              </span>
              {group.links.map((link) => (
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
            </div>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
