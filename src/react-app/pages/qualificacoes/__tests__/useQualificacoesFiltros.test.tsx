import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useQualificacoesFiltros } from '../hooks/useQualificacoesFiltros';
import { readUserPreference } from '@/react-app/utils/userPreferences';

const { tablePreferenceWriteSpy } = vi.hoisted(() => ({
  tablePreferenceWriteSpy: vi.fn(),
}));

vi.mock('@/react-app/utils/userPreferences', () => ({
  readUserPreference: vi.fn(),
}));

vi.mock('@/react-app/hooks/useTablePreferences', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    useTablePreferences: <T extends Record<string, unknown>>(_key: string, defaultValue: T) => {
      const [preferences, setPreferences] = React.useState<T>(defaultValue);
      const updatePreferences = (next: React.SetStateAction<T>) => {
        setPreferences((current) => {
          const resolved = typeof next === 'function'
            ? (next as (value: T) => T)(current)
            : next;
          tablePreferenceWriteSpy(resolved);
          return resolved;
        });
      };
      return {
        preferences,
        setPreferences: updatePreferences,
        ready: true,
        resetPreferences: vi.fn(),
      };
    },
  };
});

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
    ]);
    expect(result.current.isDefaultStatusFilter).toBe(true);
    expect(result.current.effectiveHistoricoStatusFiltro).toEqual([]);
  });

  it('marca seleção explícita por URL como filtro ativo', async () => {
    const { result } = renderHook(() => useQualificacoesFiltros(null), {
      wrapper: createWrapper('/qualificacoes?status=vencida'),
    });

    await waitFor(() => expect([...result.current.statusFiltro]).toEqual(['VENCIDA']));
    expect(result.current.isDefaultStatusFilter).toBe(false);
    expect(result.current.effectiveHistoricoStatusFiltro).toEqual(['VENCIDA']);
  });

  it('aplica status de deep link sem sobrescrever a preferência persistida', async () => {
    vi.mocked(readUserPreference).mockReturnValue({
      statusFiltro: ['VALIDA', 'RENOVADA'],
      searchTerm: 'preferência pessoal',
    });

    const { result } = renderHook(() => useQualificacoesFiltros(null), {
      wrapper: createWrapper('/qualificacoes?status=vencida'),
    });

    await waitFor(() => expect([...result.current.statusFiltro]).toEqual(['VENCIDA']));
    expect(result.current.searchTerm).toBe('preferência pessoal');
    expect(tablePreferenceWriteSpy).not.toHaveBeenCalled();
  });

  it('abre um histórico em foco sem destruir busca, status ou aba preferidos', async () => {
    vi.mocked(readUserPreference).mockReturnValue({
      activeTab: 'tipos',
      searchTerm: 'CRM',
      statusFiltro: ['VALIDA', 'RENOVADA'],
    });

    const { result } = renderHook(() => useQualificacoesFiltros(123), {
      wrapper: createWrapper('/qualificacoes?id=123'),
    });

    await waitFor(() => expect(result.current.activeTab).toBe('historico'));
    expect(result.current.searchTerm).toBe('');
    expect([...result.current.statusFiltro]).toEqual([
      'VALIDA',
      'VENCIDA',
      'VENCENDO_30',
      'RENOVADA',
      'PLANEJADA',
      'CANCELADA',
    ]);
    expect(tablePreferenceWriteSpy).not.toHaveBeenCalled();
  });

  it('restaura e persiste a área de treinamento sem alterar o setor do funcionário', async () => {
    vi.mocked(readUserPreference).mockReturnValue({
      setorFilter: ['10'],
      historicoAreaId: 17,
    });

    const { result } = renderHook(() => useQualificacoesFiltros(null), {
      wrapper: createWrapper('/qualificacoes'),
    });

    expect(result.current.setorFilter).toEqual(['10']);
    expect(result.current.historicoAreaId).toBe(17);

    result.current.setHistoricoAreaId(23);

    await waitFor(() => expect(result.current.historicoAreaId).toBe(23));
    expect(tablePreferenceWriteSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ setorFilter: ['10'], historicoAreaId: 23 }),
    );
  });
});
