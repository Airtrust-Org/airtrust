/**
 * EscalasTabBar — Subnavegação padronizada do módulo Escalas.
 * Usada por EscalasListagemView e EvdPage para manter consistência visual.
 */
import { NavLink } from 'react-router-dom';
import { CalendarDays, ClipboardList, Settings } from 'lucide-react';

const tabs = [
  { to: '/escalas', end: true, icon: CalendarDays, label: 'Escala Mensal' },
  { to: '/escalas/diaria', end: false, icon: ClipboardList, label: 'Escala Diária de Voo' },
  { to: '/escalas/configuracoes', end: false, icon: Settings, label: 'Configurações' },
];

export default function EscalasTabBar() {
  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 dark:border-slate-800">
        <div className="flex overflow-x-auto" role="tablist">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap',
                  isActive
                    ? 'border-primary text-blue-600 dark:text-blue-300'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800',
                ].join(' ')
              }
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
