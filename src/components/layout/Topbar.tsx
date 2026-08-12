import React from 'react';

export function Topbar() {
  return (
    <header className="sticky top-0 h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between z-30">
      {/* Lado esquerdo: Breadcrumb/Título */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="text-slate-900 font-medium">AirTrust</span>
      </div>

      {/* Lado direito: Ações */}
      <div className="flex items-center gap-4">
        {/* Busca global (opcional) */}
        <div className="relative hidden md:block">
          <span
            className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg"
            aria-hidden="true"
          >
            search
          </span>
          <input
            type="text"
            placeholder="Buscar..."
            aria-label="Buscar"
            className="w-64 h-10 pl-10 pr-3 border border-gray-300 rounded-lg text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all"
          />
        </div>

        {/* Notificações */}
        <button
          type="button"
          className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-gray-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          aria-label="Notificações"
          title="Notificações"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            notifications
          </span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full">
            <span className="sr-only">Novas notificações</span>
          </span>
        </button>

        {/* Avatar */}
        <button
          type="button"
          className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          aria-label="Menu do usuário"
          title="Menu do usuário"
        >
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-primary-600 text-sm font-semibold">FD</span>
          </div>
          <span className="material-symbols-outlined text-slate-400 text-lg" aria-hidden="true">
            expand_more
          </span>
        </button>
      </div>
    </header>
  );
}
