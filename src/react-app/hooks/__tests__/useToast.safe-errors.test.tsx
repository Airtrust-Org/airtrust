import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useToast } from '../useToast';

describe('useToast error safety', () => {
  it('replaces technical error detail before storing a legacy error toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.error('SQLITE_ERROR: no such column: usuarios.secret_token');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.type).toBe('error');
    expect(result.current.toasts[0]?.message).toBe('Não foi possível concluir a operação.');
    expect(result.current.toasts[0]?.message).not.toContain('secret_token');
  });

  it('preserves useful operational error messages', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.error('Selecione pelo menos uma empresa.');
    });

    expect(result.current.toasts[0]?.message).toBe('Selecione pelo menos uma empresa.');
  });
});
