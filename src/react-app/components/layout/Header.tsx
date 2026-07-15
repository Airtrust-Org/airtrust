import React, { useState } from 'react';
import { Bell, Settings } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/react-app/hooks/useAuth';
import { canAccessModule } from '@/react-app/lib/module-access';

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, empresas = [], empresaAtualId = null } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const empresaAtual = empresas.find((empresa) => empresa.id === empresaAtualId) || null;
  const modulosAtivos = empresaAtual?.modulos_ativos;

  const navItems = [
    { label: 'Painel', path: '/', moduleKey: 'dashboard' },
    { label: 'Funcionários', path: '/funcionarios', moduleKey: 'funcionarios' },
    { label: 'Qualificações', path: '/qualificacoes', moduleKey: 'qualificacoes' },
    { label: 'Simuladores & Voo', path: '/simuladores', moduleKey: 'simuladores' },
    { label: 'LMS', path: '/lms/cursos', moduleKey: 'lms' },
    { label: 'Escala', path: '/escalas', moduleKey: 'escalas' },
    { label: 'FRMS', path: '/frms', moduleKey: 'frms' },
    { label: 'SGSO', path: '/sgso', moduleKey: 'sgso' },
  ].filter((item) => canAccessModule(item.moduleKey, modulosAtivos));

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/lms/cursos') return location.pathname.startsWith('/lms');
    return location.pathname.startsWith(path);
  };

  const handleLogout = async () => {
    // ⚠️ DESENVOLVIMENTO: Login desativado
    await logout();
    window.location.href = '/';
  };

  return (
    <>
    <header className="sticky top-0 z-50 flex items-center justify-between whitespace-nowrap border-b border-slate-200 px-3 sm:px-4 md:px-8 py-0 bg-white shadow-sm">
      <div className="flex items-center gap-2 sm:gap-4 text-slate-800">
        {/* Logo */}
        <div className="w-6 h-6 sm:w-7 sm:h-7 text-primary flex-shrink-0">
          <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M21.435 15.51a8.318 8.318 0 0 1-3.213 1.834l-7.22-7.22 1.834-3.213a8.318 8.318 0 0 1 8.599 8.599Zm-18.87 2.155a8.318 8.318 0 0 1 8.599-8.599l1.834 3.213-7.22 7.22a8.318 8.318 0 0 1-3.213-1.834ZM12 24a12 12 0 1 1 0-24 12 12 0 0 1 0 24Z"></path>
          </svg>
        </div>
        <h2 className="text-slate-800 text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">
          AirTrust
        </h2>
      </div>

      {/* Desktop Navigation */}
      <div className="hidden md:flex flex-1 justify-center items-center gap-2">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={isActive(item.path) ? 'nav-link-active' : 'nav-link'}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Right side - Icons and Profile */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="hidden sm:flex gap-2">
          <button className="flex cursor-pointer items-center justify-center overflow-hidden rounded-full h-9 w-9 sm:h-10 sm:w-10 bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            <Bell className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate('/configuracoes/certificado')}
            className="flex cursor-pointer items-center justify-center overflow-hidden rounded-full h-9 w-9 sm:h-10 sm:w-10 bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Dropdown */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="bg-center bg-no-repeat aspect-square bg-cover rounded-full w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs sm:text-sm transition-transform hover:scale-105"
          >
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </button>

          {profileDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50">
              <div className="px-4 py-2 border-b border-slate-200">
                <p className="text-sm font-medium text-slate-900">{user?.name || 'Usuário'}</p>
                <p className="text-xs text-slate-500">{user?.email || 'Email'}</p>
              </div>
              <button
                onClick={() => {
                  navigate('/configuracoes/certificado');
                  setProfileDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Configurações
              </button>
              <div className="px-4 py-2 text-xs text-amber-600 bg-amber-50 rounded mb-2">
                ⚠️ Login desativado (dev mode)
              </div>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 flex items-center gap-2"
              >
                Reload
              </button>
            </div>
          )}
        </div>

      </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-100 transition-colors ml-2"
          aria-label="Menu"
        >
          <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
    </header>

    {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/20 z-40 md:hidden" 
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Menu Drawer */}
          <div className="md:hidden fixed top-[57px] left-0 right-0 bottom-0 bg-white z-40 overflow-y-auto shadow-2xl animate-in slide-in-from-top-4">
            {/* User Profile Section - Mobile */}
            <div className="border-b border-slate-200 p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-base shadow-md">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{user?.name || 'Usuário'}</p>
                  <p className="text-xs text-slate-600">{user?.email || 'Email'}</p>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="flex flex-col gap-1 p-3">
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setMobileMenuOpen(false);
                  }}
                  className={`text-left px-4 py-3.5 rounded-lg font-medium transition-all ${
                    isActive(item.path)
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Mobile Actions */}
            <div className="border-t border-slate-200 p-3 space-y-2">
              <button
                onClick={() => {
                  navigate('/configuracoes/certificado');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-100 active:bg-slate-200 rounded-lg flex items-center gap-3 transition-colors"
              >
                <Settings className="w-5 h-5" />
                Configurações
              </button>
              <button
                onClick={() => {
                  navigate('/configuracoes/certificado');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-100 active:bg-slate-200 rounded-lg flex items-center gap-3 transition-colors"
              >
                <Bell className="w-5 h-5" />
                Notificações
              </button>
            </div>

            {/* Dev Mode Warning */}
            <div className="p-3">
              <div className="px-3 py-2 text-xs text-amber-600 bg-amber-50 rounded-lg border border-amber-200">
                ⚠️ Login desativado (dev mode)
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
