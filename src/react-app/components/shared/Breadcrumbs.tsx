import { ChevronRight, Home } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter(x => x);

  const breadcrumbNames: Record<string, string> = {
    'dashboard': 'Dashboard',
    'funcionarios': 'Funcionários',
    'simuladores': 'Simuladores',
    'qualificacoes': 'Qualificações',
    'configuracoes': 'Configurações'
  };

  return (
    <nav className="flex items-center gap-2 text-sm text-gray-600 mb-6">
      <Link to="/dashboard" className="flex items-center hover:text-primary transition-colors">
        <Home className="h-4 w-4" />
      </Link>

      {pathnames.map((name, index) => {
        const routeTo = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === pathnames.length - 1;
        const displayName = breadcrumbNames[name] || name;

        return (
          <div key={name} className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-gray-400" />
            {isLast ? (
              <span className="font-medium text-gray-900">{displayName}</span>
            ) : (
              <Link to={routeTo} className="hover:text-primary transition-colors">
                {displayName}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
