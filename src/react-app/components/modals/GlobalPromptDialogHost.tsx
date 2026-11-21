import { useEffect, useId, useRef, useState } from 'react';
import { BaseModal } from '@/react-app/components/modals/BaseModal';
import {
  registerPromptDialogHandler,
  type PromptDialogRequest,
} from '@/react-app/utils/confirmDialog';

/**
 * Host global de `promptDialog` (substitui `window.prompt`). Fila de pedidos,
 * campo rotulado, foco automático no campo e Enter confirma (campo de uma linha).
 */
export default function GlobalPromptDialogHost() {
  const queueRef = useRef<PromptDialogRequest[]>([]);
  const [active, setActive] = useState<PromptDialogRequest | null>(null);
  const [value, setValue] = useState('');
  const inputId = useId();
  const helperId = useId();

  useEffect(() => {
    registerPromptDialogHandler((request) => {
      queueRef.current.push(request);
      setActive((current) => {
        if (current) return current;
        const next = queueRef.current.shift() ?? null;
        setValue(next?.defaultValue ?? '');
        return next;
      });
    });
    return () => {
      registerPromptDialogHandler(null);
      queueRef.current = [];
      setActive(null);
    };
  }, []);

  if (!active) return null;

  const settle = (result: string | null) => {
    active.resolve(result);
    setActive(null);
    setTimeout(() => {
      const next = queueRef.current.shift() ?? null;
      setValue(next?.defaultValue ?? '');
      setActive(next);
    }, 0);
  };

  const trimmed = value.trim();
  const minLength = active.minLength ?? (active.required ? 1 : 0);
  const valid = trimmed.length >= minLength;
  const fieldClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <BaseModal
      isOpen
      onClose={() => settle(null)}
      title={active.title ?? 'Informe um valor'}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={() => settle(null)}
            className="at-focus min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {active.cancelText ?? 'Cancelar'}
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => settle(value)}
            className="at-focus min-h-11 cursor-pointer rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {active.confirmText ?? 'Confirmar'}
          </button>
        </>
      }
    >
      <label htmlFor={inputId} className="block whitespace-pre-line text-sm text-slate-700">
        {active.message}
      </label>
      {active.multiline === false ? (
        <input
          id={inputId}
          data-autofocus
          type="text"
          value={value}
          placeholder={active.placeholder}
          aria-describedby={active.helperText ? helperId : undefined}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) {
              e.preventDefault();
              settle(value);
            }
          }}
          className={`mt-3 ${fieldClass}`}
        />
      ) : (
        <textarea
          id={inputId}
          data-autofocus
          rows={4}
          value={value}
          placeholder={active.placeholder}
          aria-describedby={active.helperText ? helperId : undefined}
          onChange={(e) => setValue(e.target.value)}
          className={`mt-3 ${fieldClass}`}
        />
      )}
      {active.helperText && (
        <p id={helperId} className="mt-1.5 text-xs text-slate-600">
          {active.helperText}
        </p>
      )}
    </BaseModal>
  );
}
