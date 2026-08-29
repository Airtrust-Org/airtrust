import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useQualificacoesFiltros } from '../hooks/useQualificacoesFiltros';
import { readUserPreference, writeUserPreference } from '@/react-app/utils/userPreferences';

vi.mock('@/react-app/utils/userPreferences', () => ({
  readUserPreference: vi.fn(),
  writeUserPreference: vi.fn(),
}));

function createWrapper(initialEntry: string) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

describe('useQualificacoesFiltros', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readUserPreference).mockReturnValue({});
  });

  it('considera a seleção operacional inicial como filtro padrão', () => {
    const { result } = renderHook(() => useQualificacoesFiltros(null), {
      wrapper: createWrapper('/qualificacoes'),
    });

    expect([...result.current.statusFiltro]).toEqual([
      'VALIDA',
      'VENCIDA',
      'VENCENDO_30',
      'PLANEJADA',
    ]);
    expect(result.current.isDefaultStatusFilter).toBe(true);
    expect(writeUserPreference).toHaveBeenCalled();
  });

  it('marca seleção explícita por URL como filtro ativo', async () => {
    const { result } = renderHook(() => useQualificacoesFiltros(null), {
      wrapper: createWrapper('/qualificacoes?status=vencida'),
    });

    await waitFor(() => expect([...result.current.statusFiltro]).toEqual(['VENCIDA']));
    expect(result.current.isDefaultStatusFilter).toBe(false);
  });
});
