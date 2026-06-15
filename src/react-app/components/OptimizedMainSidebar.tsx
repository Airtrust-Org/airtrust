import { useState, memo, useMemo } from 'react';
import { useLocation, Link, useNavigate } from 'react-router';
import {
  BarChart3,
  BookOpen,
  Users,
  Calendar,
  Building,
  ChevronDown,
  ChevronRight,
  Settings,
  Shield,
  FileText,
  CheckCircle,
  Database,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/react-app/hooks/useAuth';
import { getVisibleNavigationItems } from '@/react-app/lib/module-access';

const NAVIGATION_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/',
    icon: 'BarChart3',
    expandable: false,
    children: [],
  },
  {
    id: 'pessoas',
    label: 'Pessoas',
    icon: 'Users',
    expandable: true,
    children: [
      { id: 'funcionarios', label: 'Funcionários', path: '/funcionarios' },
      { id: 'funcoes', label: 'Funções', path: '/funcoes' },
    ],
  },
  {
    id: 'treinamentos',
    label: 'Treinamentos',
    icon: 'BookOpen',
    expandable: true,
    children: [
      { id: 'dashboard-treinamentos', label: 'Dashboard', path: '/treinamentos' },
      { id: 'qualificacoes', label: 'Qualificações', path: '/treinamentos/qualificacoes' },
      {
        id: 'matriz-compliance',
        label: 'Matriz Compliance',
        path: '/treinamentos/matriz-compliance',
      },
      {
        id: 'solicitacoes-treinamento',
        label: 'Solicitações',
        path: '/treinamentos/solicitacoes',
      },
      {
        id: 'horas-voo',
        label: 'Horas de Voo',
        path: '/horas-voo',
      },
      {
        id: 'lms-cursos',
        label: 'Cursos E-learning',
        path: '/lms/cursos',
      },
      {
        id: 'lms-dashboard',
        label: 'Dashboard LMS',
        path: '/lms/dashboard',
      },
    ],
  },
  {
    id: 'simuladores',
    label: 'Simuladores & Voo',
    icon: 'Calendar',
    expandable: true,
    children: [
      { id: 'simuladores-home', label: 'Simuladores & Voo', path: '/simuladores' },
      { id: 'simuladores-dashboard', label: 'Dashboard', path: '/simuladores/dashboard' },
    ],
  },
  {
    id: 'aeronaves',
    label: 'Equipamentos',
    path: '/aeronaves',
    icon: 'Building',
    expandable: false,
    children: [],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    path: '/sistema',
    icon: 'Shield',
    expandable: false,
    children: [],
  },
  {
    id: 'backup',
    label: 'Backup & Restore',
    path: '/backup',
    icon: 'Database',
    expandable: false,
    children: [],
  },
];

const iconMap = {
  BarChart3,
  BookOpen,
  Users,
  Calendar,
  Building,
  Settings,
  Shield,
  FileText,
  CheckCircle,
  Database,
};

interface NavItemProps {
  item: (typeof NAVIGATION_ITEMS)[0];
  isExpanded: boolean;
  onToggle: (id: string) => void;
  currentPath: string;
}

const NavItem = memo(({ item, isExpanded, onToggle, currentPath }: NavItemProps) => {
  const Icon = iconMap[item.icon as keyof typeof iconMap];

  const isActive = useMemo(() => {
    if (item.path === '/') {
      return currentPath === '/';
    }
    return item.path ? currentPath.startsWith(item.path) : false;
  }, [item.path, currentPath]);

  const hasActiveChild = useMemo(() => {
    if (!item.children) return false;
    return item.children.some((child) => currentPath.startsWith(child.path));
  }, [item.children, currentPath]);

  const isItemActive = isActive || hasActiveChild;

  if (item.expandable && item.children) {
    return (
      <div>
        <button
          onClick={() => onToggle(item.id)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            isItemActive
              ? 'bg-primary/10 text-blue-700 border border-blue-200'
              : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center space-x-3">
            <Icon className="w-5 h-5" />
            <span>{item.label}</span>
          </div>
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {isExpanded && (
          <div className="ml-4 mt-2 space-y-1">
            {item.children.map((child) => (
              <Link
                key={child.id}
                to={child.path}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                  currentPath.startsWith(child.path)
                    ? 'bg-primary/10 text-blue-700 border border-blue-200 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span>{child.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      to={item.path!}
      className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        isActive
          ? 'bg-primary/10 text-blue-700 border border-blue-200'
          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span>{item.label}</span>
    </Link>
  );
});

NavItem.displayName = 'NavItem';

function OptimizedMainSidebar() {
  const location = useLocation();
  const { user, empresas = [], empresaAtualId = null } = useAuth();
  const [expandedItems, setExpandedItems] = useState<string[]>([
    'treinamentos',
    'pessoas',
    'simuladores',
  ]);
  const empresaAtual = empresas.find((empresa) => empresa.id === empresaAtualId) || null;
  const visibleNavigationItems = getVisibleNavigationItems(
    NAVIGATION_ITEMS,
    empresaAtual?.modulos_ativos,
    { user },
  );

  const toggleExpanded = useMemo(
    () => (itemId: string) => {
      setExpandedItems((prev) =>
        prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
      );
    },
    [],
  );

  return (
    <div className="fixed left-0 top-0 w-64 bg-white shadow-lg border-r border-gray-200 flex flex-col h-screen z-30">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100">
        <Link to="/" className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">AT</span>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              AirTrust
            </h1>
            <p className="text-xs text-gray-500">Gestão Aeronáutica</p>
          </div>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {visibleNavigationItems.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            isExpanded={expandedItems.includes(item.id)}
            onToggle={toggleExpanded}
            currentPath={location.pathname}
          />
        ))}
      </nav>

      {/* Settings and Logout */}
      <div className="p-4 border-t border-gray-100 space-y-2">
        <Link
          to="/configuracoes"
          className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            location.pathname.startsWith('/configuracoes')
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span>Configurações</span>
        </Link>

        <LogoutButton />
      </div>
    </div>
  );
}

function LogoutButton() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div>
      {user && (
        <div className="px-3 py-2 mb-2">
          <p className="text-xs text-gray-500">Logado como</p>
          <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
          <p className="text-xs text-gray-500">{user.perfil}</p>
        </div>
      )}
      <button
        onClick={handleLogout}
        className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-all duration-200"
      >
        <LogOut className="w-5 h-5" />
        <span>Sair</span>
      </button>
    </div>
  );
}

export default memo(OptimizedMainSidebar);
