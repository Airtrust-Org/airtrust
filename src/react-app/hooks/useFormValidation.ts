import { useCallback } from 'react';
import { useForm, UseFormProps, FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ZodSchema } from 'zod';

interface UseFormValidationProps<T extends FieldValues> extends Omit<UseFormProps<T>, 'resolver'> {
  schema: ZodSchema;
}

export function useFormValidation<T extends FieldValues>({
  schema,
  ...props
}: UseFormValidationProps<T>) {
  const form = useForm<T>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    ...props,
  });

  const getFieldError = useCallback(
    (fieldName: keyof T): string | undefined => {
      return form.formState.errors[fieldName]?.message as string | undefined;
    },
    [form.formState.errors],
  );

  const getFieldProps = useCallback(
    (fieldName: keyof T) => ({
      ...form.register(fieldName),
      error: getFieldError(fieldName),
    }),
    [form, getFieldError],
  );

  return {
    ...form,
    getFieldError,
    getFieldProps,
  };
}
