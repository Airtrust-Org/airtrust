import type { ComponentType } from 'react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { MoreHorizontal } from 'lucide-react';

export type RowAction = {
  label: string;
  onSelect: () => void | Promise<void>;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  destructive?: boolean;
  disabled?: boolean;
};

type RowActionsMenuProps = {
  actions: RowAction[];
  label?: string;
  align?: 'left' | 'right';
};

export function RowActionsMenu({
  actions,
  label = 'Mais ações',
  align = 'right',
}: RowActionsMenuProps) {
  const availableActions = actions.filter(Boolean);

  if (availableActions.length === 0) return null;

  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        aria-label={label}
        title={label}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </MenuButton>

      <MenuItems
        transition
        className={`absolute z-50 mt-2 w-52 origin-top rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg outline-none transition data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-slate-700 dark:bg-slate-900 ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        {availableActions.map((action) => {
          const Icon = action.icon;
          return (
            <MenuItem key={action.label} disabled={action.disabled}>
              {({ focus, disabled }) => (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void action.onSelect()}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    action.destructive
                      ? `${focus ? 'bg-red-50 dark:bg-red-950/30' : ''} text-red-700 dark:text-red-300`
                      : `${focus ? 'bg-slate-100 dark:bg-slate-800' : ''} text-slate-700 dark:text-slate-200`
                  }`}
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                  <span>{action.label}</span>
                </button>
              )}
            </MenuItem>
          );
        })}
      </MenuItems>
    </Menu>
  );
}

export default RowActionsMenu;
