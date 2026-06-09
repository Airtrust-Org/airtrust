import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface DropdownMenuProps {
  items: DropdownMenuItem[];
  trigger?: ReactNode;
  ariaLabel?: string;
  align?: 'left' | 'right';
}

/**
 * Accessible dropdown menu for table row actions.
 * Opens on click, closes on click-outside, Escape, or item selection.
 */
export function DropdownMenu({
  items,
  trigger,
  ariaLabel = 'Ações adicionais',
  align = 'right',
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        close();
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, close]);

  const handleItemClick = (item: DropdownMenuItem) => {
    if (item.disabled) return;
    item.onClick();
    close();
  };

  const handleKeyDown = (event: React.KeyboardEvent, item: DropdownMenuItem) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleItemClick(item);
    }
  };

  return (
    <div className="relative inline-flex" ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 cursor-pointer"
      >
        {trigger || <MoreHorizontal className="w-4 h-4" aria-hidden="true" />}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={ariaLabel}
          className={`absolute top-full z-50 mt-1 min-w-[180px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => handleItemClick(item)}
              onKeyDown={(e) => handleKeyDown(e, item)}
              disabled={item.disabled}
              tabIndex={item.disabled ? -1 : 0}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors cursor-pointer ${
                item.disabled
                  ? 'text-slate-300 cursor-not-allowed'
                  : item.danger
                    ? 'text-rose-700 hover:bg-rose-50'
                    : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {item.icon && <span className="w-4 h-4 flex-shrink-0" aria-hidden="true">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default DropdownMenu;
