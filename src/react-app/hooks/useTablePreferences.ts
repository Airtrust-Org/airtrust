import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithAuth } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';

interface PreferenceContext {
  localKey: string;
  tableKey: string;
  version: number;
}

interface SaveRequest {
  context: PreferenceContext;
  controller: AbortController;
}

function buildLocalKey(tableKey: string, empresaId: number | null, userId: number | null): string {
  return `@airtrust/table-preferences/${empresaId ?? 0}/${userId ?? 0}/${tableKey}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergePreferences<T extends Record<string, unknown>>(defaults: T, value: unknown): T {
  return isRecord(value) ? ({ ...defaults, ...value } as T) : defaults;
}

function readLocalPreferences<T extends Record<string, unknown>>(
  localKey: string,
  defaults: T,
): T | null {
  try {
    const local = localStorage.getItem(localKey);
    return local ? mergePreferences(defaults, JSON.parse(local)) : null;
  } catch (error) {
    console.error('[useTablePreferences] erro ao carregar fallback local:', error);
    return null;
  }
}

function writeLocalPreferences(localKey: string, preferences: Record<string, unknown>): void {
  try {
    localStorage.setItem(localKey, JSON.stringify(preferences));
  } catch (error) {
    console.error('[useTablePreferences] erro ao persistir fallback local:', error);
  }
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError';
}

function isSameContext(current: PreferenceContext | null, expected: PreferenceContext): boolean {
  return (
    current?.version === expected.version &&
    current.localKey === expected.localKey &&
    current.tableKey === expected.tableKey
  );
}

export function useTablePreferences<T extends Record<string, unknown>>(
  tableKey: string,
  defaultValue: T,
) {
  const { empresaAtualId, user } = useAuth();
  const [preferences, setPreferences] = useState<T>(defaultValue);
  const [ready, setReady] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const saveRequestRef = useRef<SaveRequest | null>(null);
  const defaultValueRef = useRef(defaultValue);
  const lastPersistedValueRef = useRef<string | null>(null);
  // Identifica cada ciclo de empresa, usuário e tabela para neutralizar respostas obsoletas.
  const contextVersionRef = useRef(0);
  const activeContextRef = useRef<PreferenceContext | null>(null);
  const hydratedContextRef = useRef<PreferenceContext | null>(null);
  const localKey = useMemo(
    () => buildLocalKey(tableKey, empresaAtualId, user?.id ?? null),
    [empresaAtualId, tableKey, user?.id],
  );

  useEffect(() => {
    defaultValueRef.current = defaultValue;
  }, [defaultValue]);

  useEffect(() => {
    let cancelled = false;
    const loadController = new AbortController();
    const context: PreferenceContext = {
      localKey,
      tableKey,
      version: ++contextVersionRef.current,
    };

    activeContextRef.current = context;
    hydratedContextRef.current = null;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    saveRequestRef.current?.controller.abort();
    saveRequestRef.current = null;

    const defaults = defaultValueRef.current;
    const localPreferences = readLocalPreferences(localKey, defaults);
    const fallbackPreferences = localPreferences ?? defaults;

    setReady(false);
    setPreferences(fallbackPreferences);
    lastPersistedValueRef.current = JSON.stringify(fallbackPreferences);

    async function loadPreferences() {
      let nextPreferences = fallbackPreferences;

      try {
        const response = await fetchWithAuth(
          `/api/preferencias/tabela/${encodeURIComponent(tableKey)}`,
          { signal: loadController.signal },
        );

        if (response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { data?: T | null };
          if (payload.data) {
            nextPreferences = mergePreferences(defaults, payload.data);
          }
        }
      } catch (error) {
        if (!isAbortError(error)) {
          console.error('[useTablePreferences] erro ao carregar backend:', error);
        }
      } finally {
        if (!cancelled && isSameContext(activeContextRef.current, context)) {
          setPreferences(nextPreferences);
          lastPersistedValueRef.current = JSON.stringify(nextPreferences);
          writeLocalPreferences(localKey, nextPreferences);
          hydratedContextRef.current = context;
          setReady(true);
        }
      }
    }

    void loadPreferences();

    return () => {
      cancelled = true;
      loadController.abort();
      if (isSameContext(activeContextRef.current, context)) {
        activeContextRef.current = null;
      }
      if (isSameContext(hydratedContextRef.current, context)) {
        hydratedContextRef.current = null;
      }
    };
  }, [localKey, tableKey]);

  useEffect(() => {
    const context = activeContextRef.current;
    if (
      !ready ||
      !context ||
      context.localKey !== localKey ||
      context.tableKey !== tableKey ||
      !isSameContext(hydratedContextRef.current, context)
    ) {
      return;
    }

    const serializedPreferences = JSON.stringify(preferences);
    if (serializedPreferences === lastPersistedValueRef.current) return;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    const timerId = window.setTimeout(async () => {
      if (saveTimerRef.current === timerId) {
        saveTimerRef.current = null;
      }

      if (
        !isSameContext(activeContextRef.current, context) ||
        !isSameContext(hydratedContextRef.current, context)
      ) {
        return;
      }

      writeLocalPreferences(localKey, preferences);

      const saveRequest: SaveRequest = {
        context,
        controller: new AbortController(),
      };
      saveRequestRef.current?.controller.abort();
      saveRequestRef.current = saveRequest;

      try {
        const response = await fetchWithAuth(
          `/api/preferencias/tabela/${encodeURIComponent(tableKey)}`,
          {
            method: 'PUT',
            body: JSON.stringify({ valor: preferences }),
            signal: saveRequest.controller.signal,
          },
        );

        if (
          saveRequestRef.current !== saveRequest ||
          !isSameContext(activeContextRef.current, context)
        ) {
          return;
        }

        if (!response.ok) {
          throw new Error(`Falha ao salvar preferências (${response.status})`);
        }

        lastPersistedValueRef.current = serializedPreferences;
      } catch (error) {
        if (
          !isAbortError(error) &&
          saveRequestRef.current === saveRequest &&
          isSameContext(activeContextRef.current, context)
        ) {
          console.error('[useTablePreferences] erro ao salvar backend:', error);
        }
      } finally {
        if (saveRequestRef.current === saveRequest) {
          saveRequestRef.current = null;
        }
      }
    }, 300);

    saveTimerRef.current = timerId;

    return () => {
      if (saveTimerRef.current === timerId) {
        window.clearTimeout(timerId);
        saveTimerRef.current = null;
      }

      const activeSave = saveRequestRef.current;
      if (activeSave && isSameContext(activeSave.context, context)) {
        activeSave.controller.abort();
        saveRequestRef.current = null;
      }
    };
  }, [localKey, preferences, ready, tableKey]);

  function resetPreferences() {
    setPreferences(defaultValueRef.current);
  }

  return {
    preferences,
    setPreferences,
    ready,
    resetPreferences,
  };
}

export default useTablePreferences;
