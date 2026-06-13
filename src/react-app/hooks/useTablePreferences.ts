import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithAuth } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';

function buildLocalKey(tableKey: string, empresaId: number | null, userId: number | null): string {
  return `@airtrust/table-preferences/${empresaId || 0}/${userId || 0}/${tableKey}`;
}

export function useTablePreferences<T extends Record<string, unknown>>(
  tableKey: string,
  defaultValue: T,
) {
  const { empresaAtualId, user } = useAuth();
  const [preferences, setPreferences] = useState<T>(defaultValue);
  const [ready, setReady] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const localKey = useMemo(
    () => buildLocalKey(tableKey, empresaAtualId, user?.id ?? null),
    [empresaAtualId, tableKey, user?.id],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      setReady(false);

      try {
        const local = localStorage.getItem(localKey);
        if (local && !cancelled) {
          setPreferences({ ...defaultValue, ...JSON.parse(local) });
        }
      } catch (error) {
        console.error('[useTablePreferences] erro ao carregar fallback local:', error);
      }

      try {
        const response = await fetchWithAuth(`/api/preferencias/tabela/${encodeURIComponent(tableKey)}`);
        if (!response.ok) {
          if (!cancelled) setReady(true);
          return;
        }

        const payload = (await response.json().catch(() => ({}))) as { data?: T | null };
        if (!cancelled && payload.data) {
          const merged = { ...defaultValue, ...payload.data };
          setPreferences(merged);
          localStorage.setItem(localKey, JSON.stringify(merged));
        }
      } catch (error) {
        console.error('[useTablePreferences] erro ao carregar backend:', error);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    loadPreferences();

    return () => {
      cancelled = true;
    };
  }, [defaultValue, localKey, tableKey]);

  useEffect(() => {
    if (!ready) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        localStorage.setItem(localKey, JSON.stringify(preferences));
      } catch (error) {
        console.error('[useTablePreferences] erro ao persistir fallback local:', error);
      }

      try {
        await fetchWithAuth(`/api/preferencias/tabela/${encodeURIComponent(tableKey)}`, {
          method: 'PUT',
          body: JSON.stringify({ valor: preferences }),
        });
      } catch (error) {
        console.error('[useTablePreferences] erro ao salvar backend:', error);
      }
    }, 300);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [localKey, preferences, ready, tableKey]);

  function resetPreferences() {
    setPreferences(defaultValue);
  }

  return {
    preferences,
    setPreferences,
    ready,
    resetPreferences,
  };
}

export default useTablePreferences;
