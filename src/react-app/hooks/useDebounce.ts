import { useState, useEffect } from 'react';

/**
 * Hook para debounce de valores
 * Útil para campos de busca - evita chamadas excessivas de API
 * 
 * @param value - Valor a ser debounced
 * @param delay - Delay em ms (padrão: 500ms)
 * @returns Valor debounced
 * 
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useDebounce(searchTerm, 500);
 * 
 * useEffect(() => {
 *   // Só executa após 500ms sem mudanças
 *   fetchData(debouncedSearch);
 * }, [debouncedSearch]);
 */
export function useDebounce<T>(value: T, delay = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
