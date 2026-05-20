import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Award,
  Monitor,
  Database,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { toast } from 'sonner';

import SidebarFooter from './SidebarFooter';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { useSystemSettings } from '../hooks/useSystemSettings';

const menuItems = [
  {
    title: 'Dashboard',
    icon: LayoutDashboard,
    path: '/',
  },
  {
    title: 'Funcionários',
    icon: Users,
    path: '/funcionarios',
  },
  {
    title: 'Simuladores & Voo',
    icon: Monitor,
    path: '/simuladores',
  },
  {
    title: 'Qualificações',
    icon: Award,
    path: '/qualificacoes',
  },
  {
    title: 'Reclassificação',
    icon: RefreshCw,
    path: '/qualificacoes/reclassificacao',
  },
  {
    title: 'Relatórios',
    icon: TrendingUp,
    path: '/relatorios',
  },
  {
    title: 'Backup',
    icon: Database,
    path: '/backup',
  },
  {
    title: 'Configurações',
    icon: Settings,
    path: '/configuracoes',
  },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logoSrc } = useSystemSettings();
  const [refreshing, setRefreshing] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleHardRefresh = async () => {
    if (
      !(await confirmDialog(
        '⚠️ Isso irá limpar TODO o cache do navegador e recarregar a página. Continuar?',
      ))
    ) {
      return;
    }

    setRefreshing(true);

    try {
      localStorage.clear();

      sessionStorage.clear();

      document.cookie.split(';').forEach((c) => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
      });

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      if ('indexedDB' in window) {
        try {
          const databases = await indexedDB.databases();
          await Promise.all(
            databases.map((db) => {
              if (db.name) {
                return new Promise((resolve) => {
                  const request = indexedDB.deleteDatabase(db.name!);
                  request.onsuccess = () => resolve(true);
                  request.onerror = () => resolve(false);
                });
              }
              return Promise.resolve(false);
            }),
          );
        } catch (e) {
          console.warn('IndexedDB cleanup failed:', e);
        }
      }

      const timestamp = Date.now();
      const url = new URL(window.location.href);
      url.searchParams.set('_t', timestamp.toString());
      window.location.replace(url.toString());
    } catch (error) {
      console.error('Erro ao limpar cache:', error);
      toast.warning('Erro ao limpar cache. Tente fechar e reabrir o navegador.');
      setRefreshing(false);
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <Link
          to="/"
          className="inline-flex items-center mb-4 rounded-lg p-1 hover:bg-gray-50 transition-colors"
        >
          <img src={logoSrc} alt="AirTrust" className="h-10 w-[180px] object-contain object-left" />
        </Link>

        {/* Hard Refresh Button */}
        <button
          onClick={handleHardRefresh}
          disabled={refreshing}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50 rounded-lg font-medium transition-colors disabled:opacity-50"
          title="Limpar cache e recarregar"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Limpando...' : 'Hard Refresh'}
        </button>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 px-3 py-6 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group
                ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium shadow-sm'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              <Icon
                className={`w-5 h-5 ${
                  isActive ? 'text-primary' : 'text-gray-500 group-hover:text-gray-700'
                }`}
              />
              <span className="text-sm">{item.title}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-gray-600 text-sm font-semibold">A</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">Administrador</p>
            <p className="text-xs text-gray-500">ADMIN</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>

      {/* Version Footer */}
      <SidebarFooter />
    </aside>
  );
}
