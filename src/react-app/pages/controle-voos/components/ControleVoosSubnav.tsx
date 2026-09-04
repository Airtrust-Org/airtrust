import { Link, useLocation, useNavigate } from 'react-router-dom';

export interface ControleVoosNavLink {
  to: string;
  label: string;
  exact?: boolean;
  preview?: boolean;
}

export const CONTROLE_VOOS_NAV_LINKS: ControleVoosNavLink[] = [
  { to: '/controle-voos', label: 'Dashboard', exact: true },
  { to: '/controle-voos/voos', label: 'Voos' },
  { to: '/controle-voos/rdv', label: 'RDV' },
  { to: '/controle-voos/meus-voos', label: 'Meus voos' },
  { to: '/controle-voos/coordenacao/fila', label: 'Fila da Coordenação' },
  { to: '/controle-voos/jornadas', label: 'Jornadas' },
  { to: '/controle-voos/indisponibilidades', label: 'Indisponibilidades', preview: true },
  { to: '/controle-voos/hangaragem', label: 'Hangaragem', preview: true },
  { to: '/controle-voos/relatorios', label: 'Relatórios' },
  { to: '/controle-voos/tabelas', label: 'Tabelas' },
];

export const PREVIEW_BADGE_TITLE = 'Tela em preview - nao usar como fonte operacional';

export function isControleVoosLinkActive(pathname: string, link: ControleVoosNavLink): boolean {
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

  const activeLink = resolveActiveControleVoosLink(pathname);

  return (
    <div className="mb-5">
      {/* Mobile navigation: accessible native select with >=44px touch target, zero horizontal clipping */}
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
            {CONTROLE_VOOS_NAV_LINKS.map((link) => (
              <option key={link.to} value={link.to}>
                {link.label}
                {link.preview ? ' (Preview)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Desktop/tablet navigation: horizontal tab strip with touch targets and full a11y */}
      <nav
        aria-label="Navegação do Controle de Voos"
        className="hidden sm:block -mx-1 overflow-x-auto px-1"
      >
        <div className="flex gap-1 min-w-max">
          {CONTROLE_VOOS_NAV_LINKS.map((link) => {
            const active = isControleVoosLinkActive(pathname, link);
            return (
              <Link
                key={link.to}
                to={`${link.to}${search}`}
                title={link.preview ? PREVIEW_BADGE_TITLE : undefined}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[44px] items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <span>{link.label}</span>
                  {link.preview && (
                    <span
                      title={PREVIEW_BADGE_TITLE}
                      className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                    >
                      Preview
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

