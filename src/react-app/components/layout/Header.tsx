import React, { useEffect, useRef, useState } from 'react';
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
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
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

  const handleMenuKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    closeMenu: () => void,
    triggerRef: React.RefObject<HTMLButtonElement | null>,
  ) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        items[(currentIndex + 1 + items.length) % items.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[(currentIndex - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        items.at(-1)?.focus();
        break;
      case 'Escape':
        event.preventDefault();
        closeMenu();
        triggerRef.current?.focus();
        break;
      case 'Tab':
        closeMenu();
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (profileDropdownOpen) {
      profileMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }
  }, [profileDropdownOpen]);

  useEffect(() => {
    if (mobileMenuOpen) {
      mobileMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }
  }, [mobileMenuOpen]);

  return (
    <>
      <header className="sticky top-0 z-50 flex items-center justify-between whitespace-nowrap border-b border-slate-200 bg-white px-3 py-0 shadow-sm sm:px-4 md:px-8">
        <div className="flex items-center gap-2 text-slate-800 sm:gap-4">
          <div className="h-6 w-6 flex-shrink-0 text-primary sm:h-7 sm:w-7">
            <svg
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M21.435 15.51a8.318 8.318 0 0 1-3.213 1.834l-7.22-7.22 1.834-3.213a8.318 8.318 0 0 1 8.599 8.599Zm-18.87 2.155a8.318 8.318 0 0 1 8.599-8.599l1.834 3.213-7.22 7.22a8.318 8.318 0 0 1-3.213-1.834ZM12 24a12 12 0 1 1 0-24 12 12 0 0 1 0 24Z"></path>
            </svg>
          </div>
          <h2 className="text-base font-bold leading-tight tracking-[-0.015em] text-slate-800 sm:text-lg">
            AirTrust
          </h2>
        </div>

        <div className="hidden flex-1 items-center justify-center gap-2 md:flex">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.path}
              onClick={() => navigate(item.path)}
              className={isActive(item.path) ? 'nav-link-active' : 'nav-link'}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden gap-2 sm:flex">
            <button
              type="button"
              className="flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 sm:h-10 sm:w-10"
              aria-label="Notificações"
              title="Notificações"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/configuracoes/certificado')}
              className="flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 sm:h-10 sm:w-10"
              aria-label="Configurações"
              title="Configurações"
            >
              <Settings className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="relative hidden sm:block">
            <button
              ref={profileButtonRef}
              id="profile-menu-button"
              type="button"
              onClick={() => setProfileDropdownOpen((open) => !open)}
              className="flex aspect-square h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 bg-cover bg-center bg-no-repeat text-xs font-bold text-white transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 sm:h-10 sm:w-10 sm:text-sm"
              aria-label="Menu do perfil"
              title="Menu do perfil"
              aria-expanded={profileDropdownOpen}
              aria-haspopup="menu"
              aria-controls="profile-menu"
            >
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </button>

            {profileDropdownOpen && (
              <div
                ref={profileMenuRef}
                id="profile-menu"
                role="menu"
                aria-orientation="vertical"
                aria-labelledby="profile-menu-button"
                onKeyDown={(event) =>
                  handleMenuKeyDown(event, () => setProfileDropdownOpen(false), profileButtonRef)
                }
                className="absolute right-0 z-50 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-2 shadow-lg"
              >
                <div role="none" className="border-b border-slate-200 px-4 py-2">
                  <p className="text-sm font-medium text-slate-900">{user?.name || 'Usuário'}</p>
                  <p className="text-xs text-slate-500">{user?.email || 'Email'}</p>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    navigate('/configuracoes/certificado');
                    setProfileDropdownOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Configurações
                </button>
                <div
                  role="none"
                  className="mb-2 rounded bg-amber-50 px-4 py-2 text-xs text-amber-600"
                >
                  ⚠️ Login desativado (dev mode)
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-600 hover:bg-gray-100"
                >
                  Reload
                </button>
              </div>
            )}
          </div>
        </div>

        <button
          ref={mobileMenuButtonRef}
          id="mobile-menu-button"
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="ml-2 flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 md:hidden"
          aria-label="Menu principal"
          title="Menu principal"
          aria-expanded={mobileMenuOpen}
          aria-haspopup="menu"
          aria-controls="mobile-navigation-menu"
        >
          <svg
            className="h-5 w-5 text-slate-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
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

      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 md:hidden"
            onClick={() => {
              setMobileMenuOpen(false);
              mobileMenuButtonRef.current?.focus();
            }}
          />
          <div
            ref={mobileMenuRef}
            id="mobile-navigation-menu"
            role="menu"
            aria-orientation="vertical"
            aria-labelledby="mobile-menu-button"
            onKeyDown={(event) =>
              handleMenuKeyDown(event, () => setMobileMenuOpen(false), mobileMenuButtonRef)
            }
            className="fixed bottom-0 left-0 right-0 top-[57px] z-40 overflow-y-auto bg-white shadow-2xl animate-in slide-in-from-top-4 md:hidden"
          >
            <div
              role="none"
              className="border-b border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-base font-bold text-white shadow-md">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{user?.name || 'Usuário'}</p>
                  <p className="text-xs text-slate-600">{user?.email || 'Email'}</p>
                </div>
              </div>
            </div>

            <nav
              role="none"
              className="flex flex-col gap-1 p-3"
              aria-label="Navegação principal móvel"
            >
              {navItems.map((item) => (
                <button
                  type="button"
                  role="menuitem"
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setMobileMenuOpen(false);
                  }}
                  className={`rounded-lg px-4 py-3.5 text-left font-medium transition-all ${
                    isActive(item.path)
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div role="none" className="space-y-2 border-t border-slate-200 p-3">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  navigate('/configuracoes/certificado');
                  setMobileMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200"
              >
                <Settings className="h-5 w-5" aria-hidden="true" />
                Configurações
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  navigate('/configuracoes/certificado');
                  setMobileMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200"
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                Notificações
              </button>
            </div>

            <div role="none" className="p-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600">
                ⚠️ Login desativado (dev mode)
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
