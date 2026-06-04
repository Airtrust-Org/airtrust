import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  currentPath: string;
}

interface MenuItem {
  icon: string;
  label: string;
  path: string;
}

const menuItems: MenuItem[] = [
  { icon: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { icon: 'person', label: 'Funcionários', path: '/funcionarios' },
  { icon: 'badge', label: 'Qualificações', path: '/qualificacoes' },
  { icon: 'flight_takeoff', label: 'Simuladores & Voo', path: '/simuladores' },
  { icon: 'folder', label: 'Pasta 360', path: '/pasta-virtual' },
  { icon: 'settings', label: 'Configurações', path: '/configuracoes' },
];

export function Sidebar({ currentPath }: SidebarProps) {
  const location = useLocation();
  const activePath = currentPath || location.pathname;

  return (
    <aside className="fixed left-0 top-0 h-screen w-72 bg-white border-r border-gray-200 p-6 z-40 overflow-y-auto">
      {/* Logo */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary-600">AirTrust</h1>
        <p className="text-xs text-slate-500 mt-1">Sistema de Gestão</p>
      </div>

      {/* Navegação */}
      <nav className="space-y-1">
        {menuItems.map((item) => {
          const isActive = activePath.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-600 font-medium'
                  : 'text-slate-700 hover:bg-gray-50'
              }`}
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Perfil (rodapé) */}
      <div className="absolute bottom-6 left-6 right-6 border-t border-gray-200 pt-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-primary-600 font-semibold text-sm">FD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">Filipe Daumas</p>
            <p className="text-xs text-slate-500 truncate">Administrador</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
