import React, { cloneElement, isValidElement, useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';

interface FormFieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  labelClassName?: string;
  /**
   * Id do controle quando o filho não é um único elemento (ex.: controle dentro
   * de um wrapper). O consumidor precisa aplicar este mesmo id ao controle real.
   */
  controlId?: string;
}

const FORM_CONTROL_TAGS = new Set(['input', 'select', 'textarea']);

function joinIds(...ids: Array<string | undefined | false>) {
  const joined = ids.filter(Boolean).join(' ');
  return joined || undefined;
}

/**
 * Campo de formulário com rótulo associado ao controle.
 *
 * Quando o filho é um único elemento (`<input>`, `<select>`, `<textarea>` ou um
 * componente que repasse `id` ao controle, como `Input`/`Select`/`TextArea`),
 * o FormField injeta `id`, `aria-describedby`, `aria-invalid` e `aria-required`.
 * Um `id` informado pelo consumidor no filho é respeitado.
 */
export function FormField({
  label,
  error,
  hint,
  required,
  children,
  className,
  labelClassName,
  controlId,
}: FormFieldProps) {
  const generatedId = useId();
  const onlyChild =
    React.Children.count(children) === 1 ? React.Children.toArray(children)[0] : null;
  const canEnhanceChild =
    isValidElement(onlyChild) &&
    (typeof onlyChild.type !== 'string' || FORM_CONTROL_TAGS.has(onlyChild.type));

  const childProps = canEnhanceChild
    ? ((onlyChild as React.ReactElement<Record<string, unknown>>).props as Record<string, unknown>)
    : undefined;
  const resolvedId =
    (childProps?.id as string | undefined) ?? controlId ?? `${generatedId}-control`;

  const errorId = error ? `${resolvedId}-error` : undefined;
  const hintId = hint && !error ? `${resolvedId}-hint` : undefined;

  const injectedProps: Record<string, unknown> = { id: resolvedId };
  const describedBy = joinIds(
    childProps?.['aria-describedby'] as string | undefined,
    errorId,
    hintId,
  );
  // Só injeta o que tem valor: uma chave `undefined` sobrescreveria os `aria-*`
  // calculados internamente por `Input`/`Select`/`TextArea`.
  if (describedBy) injectedProps['aria-describedby'] = describedBy;
  if (error) injectedProps['aria-invalid'] = true;
  if (required) injectedProps['aria-required'] = true;

  const control =
    canEnhanceChild && isValidElement(onlyChild)
      ? cloneElement(onlyChild as React.ReactElement<Record<string, unknown>>, injectedProps)
      : children;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={resolvedId}
          className={cn('text-sm font-medium text-slate-700', labelClassName)}
        >
          {label}
          {required && (
            <>
              <span aria-hidden="true" className="ml-0.5 text-red-700">
                *
              </span>
              <span className="sr-only"> (obrigatório)</span>
            </>
          )}
        </label>
      )}
      {control}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1 text-xs font-medium text-red-700"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-600">
          {hint}
        </p>
      )}
    </div>
  );
}
