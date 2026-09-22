import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/react-app/hooks/useAuth';
import { canSeeControleVoosDevelopmentModule } from '@/react-app/lib/development-module-nav';

export interface ControleVoosNavLink {
  to: string;
  label: string;
  exact?: boolean;
  activePrefixes?: string[];
}

// Navegação orientada ao trabalho: páginas técnicas/legadas continuam roteáveis,
// mas deixam de competir como destinos primários do operador.
export const CONTROLE_VOOS_NAV_LINKS: ControleVoosNavLink[] = [
  {
    to: '/controle-voos',
    label: 'Operação',
    exact: true,
    activePrefixes: ['/controle-voos/voos', '/controle-voos/rdv'],
  },
  { to: '/controle-voos/meus-voos', label: 'Meus voos' },
  { to: '/controle-voos/coordenacao/fila', label: 'Coordenação' },
  {
    to: '/controle-voos/relatorios',
    label: 'Relatórios e exportações',
    activePrefixes: ['/controle-voos/jornadas'],
  },
  { to: '/controle-voos/tabelas', label: 'Cadastros' },
];


export function getVisibleControleVoosNavLinks(
  user?: { email?: string | null; role?: string | null; permissions?: string[] | null } | null,
): ControleVoosNavLink[] {
  if (canSeeControleVoosDevelopmentModule(user)) {
    // "Meus voos" é uma superfície pessoal do piloto. Coordenação/Admin/Gestor
    // operam pela visão de Operação, fila e programação.
    return CONTROLE_VOOS_NAV_LINKS.filter((link) => link.to !== '/controle-voos/meus-voos');
  }
  return CONTROLE_VOOS_NAV_LINKS.filter((link) => link.to === '/controle-voos/meus-voos');
}

export function isControleVoosLinkActive(pathname: string, link: ControleVoosNavLink): boolean {
  if (link.activePrefixes?.some((prefix) => pathname.startsWith(prefix))) return true;
  if (link.exact) {
    return pathname === '/controle-voos' || pathname === '/controle-voos/dashboard';
  }
  return pathname.startsWith(link.to);
}

export function resolveActiveControleVoosLink(pathname: string): ControleVoosNavLink {
  return (
    CONTROLE_VOOS_NAV_LINKS.find((link) => isControleVoosLinkActive(pathname, link)) ||
    CONTROLE_VOOS_NAV_LINKS[0]
  );
}

export default function ControleVoosSubnav() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const visibleLinks = getVisibleControleVoosNavLinks(user);
  const activeLink =
    visibleLinks.find((link) => isControleVoosLinkActive(pathname, link)) || visibleLinks[0];

  return (
    <div className="mb-5">
      <div className="sm:hidden">
        <label htmlFor="controle-voos-mobile-nav" className="sr-only">
          Navegação do Controle de Voos
        </label>
        <div className="relative">
          <select
            id="controle-voos-mobile-nav"
            aria-label="Navegação do Controle de Voos"
            value={activeLink.to}
            onChange={(event) => navigate(`${event.target.value}${search}`)}
            className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {visibleLinks.map((link) => (
              <option key={link.to} value={link.to}>
                {link.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <nav
        aria-label="Navegação do Controle de Voos"
        className="hidden sm:block -mx-1 overflow-x-auto px-1"
      >
        <div className="flex gap-1 min-w-max">
          {visibleLinks.map((link) => {
            const active = isControleVoosLinkActive(pathname, link);
            return (
              <Link
                key={link.to}
                to={`${link.to}${search}`}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[44px] items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
