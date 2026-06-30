import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/controle-voos', label: 'Dashboard', exact: true },
  { to: '/controle-voos/voos', label: 'Voos' },
  { to: '/controle-voos/rdv', label: 'RDV' },
  { to: '/controle-voos/jornadas', label: 'Jornadas', preview: true },
  { to: '/controle-voos/indisponibilidades', label: 'Indisponibilidades', preview: true },
  { to: '/controle-voos/hangaragem', label: 'Hangaragem', preview: true },
  { to: '/controle-voos/relatorios', label: 'Relatórios' },
  { to: '/controle-voos/tabelas', label: 'Tabelas' },
];

const PREVIEW_BADGE_TITLE = 'Tela em preview - nao usar como fonte operacional';

export default function ControleVoosSubnav() {
  const { pathname, search } = useLocation();

  return (
    <nav className="-mx-1 mb-5 overflow-x-auto px-1">
      <div className="flex gap-1 min-w-max">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === '/controle-voos' || pathname === '/controle-voos/dashboard'
            : pathname.startsWith(link.to);
          return (
            <Link
              key={link.to}
              to={`${link.to}${search}`}
              title={link.preview ? PREVIEW_BADGE_TITLE : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
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
  );
}
