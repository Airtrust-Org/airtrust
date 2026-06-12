import { useState, useCallback } from 'react';

/**
 * Hook que persiste estado no localStorage com prefixo @airtrust/.
 * Mantém os filtros e preferências do usuário entre sessões.
 *
 * Uso:
 *   const [filters, setFilters] = useLocalStorage('@airtrust/filters-modulo', defaultValue);
 *
 * Para aplicar em outros módulos, siga o padrão:
 *   - Chave: @airtrust/filters-<nome-do-modulo>
 *   - Valor: objeto com todos os filtros do módulo
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return initialValue;
      const parsed = JSON.parse(item);
      // Merge com initialValue para garantir que novas chaves tenham default
      if (typeof initialValue === 'object' && initialValue !== null && !Array.isArray(initialValue)) {
        return { ...initialValue, ...parsed };
      }
      return parsed;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const nextValue = value instanceof Function ? value(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(nextValue));
        } catch (error) {
          console.error(`[useLocalStorage] Erro ao salvar em ${key}:`, error);
        }
        return nextValue;
      });
    },
    [key],
  );

  return [storedValue, setValue];
}

export default useLocalStorage;
