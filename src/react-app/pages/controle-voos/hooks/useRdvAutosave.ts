import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounce } from '@/react-app/hooks/useDebounce';
import type { RdvInput } from '@/react-app/hooks/useControleVoos';
import {
  formStateToRdvInput,
  getSalvarRdvErrorMessage,
  type RdvFormState,
  type RdvSaveStatus,
} from '../data/rdvPilotFlow';

type SaveFn = (args: { vooId: string | number; dados: RdvInput }) => Promise<unknown>;

type Options = {
  vooId: string | number | undefined;
  form: RdvFormState | null;
  enabled: boolean;
  debounceMs?: number;
  saveFn: SaveFn;
  onSaved?: (form: RdvFormState) => void;
};

/**
 * Debounced autosave for the pilot RDV draft.
 * Status: idle | pendente | salvando | salvo | erro
 */
export function useRdvAutosave({
  vooId,
  form,
  enabled,
  debounceMs = 800,
  saveFn,
  onSaved,
}: Options) {
  const [status, setStatus] = useState<RdvSaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const lastSerializedRef = useRef<string | null>(null);
  const baselineReadyRef = useRef(false);
  const inFlightRef = useRef(false);
  const pendingAfterFlightRef = useRef(false);

  const serialized = form ? JSON.stringify(form) : null;
  const debouncedSerialized = useDebounce(serialized, debounceMs);

  const markDirty = useCallback(() => {
    if (!enabled || !baselineReadyRef.current) return;
    setStatus((current) => (current === 'salvando' ? current : 'pendente'));
  }, [enabled]);

  const saveNow = useCallback(
    async (sourceForm: RdvFormState) => {
      if (!vooId || !enabled) return false;
      inFlightRef.current = true;
      setStatus('salvando');
      setError(null);
      try {
        await saveFn({ vooId, dados: formStateToRdvInput(sourceForm) });
        lastSerializedRef.current = JSON.stringify(sourceForm);
        baselineReadyRef.current = true;
        setLastSavedAt(new Date().toISOString());
        setStatus('salvo');
        onSaved?.(sourceForm);
        return true;
      } catch (err) {
        setError(getSalvarRdvErrorMessage(err));
        setStatus('erro');
        return false;
      } finally {
        inFlightRef.current = false;
        if (pendingAfterFlightRef.current && form) {
          pendingAfterFlightRef.current = false;
          setStatus('pendente');
        }
      }
    },
    [enabled, form, onSaved, saveFn, vooId],
  );

  useEffect(() => {
    if (!enabled || !form || !debouncedSerialized || !vooId) return;
    if (!baselineReadyRef.current) return;
    if (debouncedSerialized === lastSerializedRef.current) return;

    if (inFlightRef.current) {
      pendingAfterFlightRef.current = true;
      return;
    }

    let cancelled = false;
    const run = async () => {
      const snapshot = JSON.parse(debouncedSerialized) as RdvFormState;
      if (cancelled) return;
      await saveNow(snapshot);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedSerialized, enabled, form, saveNow, vooId]);

  useEffect(() => {
    if (!enabled || !serialized) return;
    if (!baselineReadyRef.current) {
      lastSerializedRef.current = serialized;
      baselineReadyRef.current = true;
      return;
    }
    if (serialized !== lastSerializedRef.current) {
      markDirty();
    }
  }, [enabled, markDirty, serialized]);

  const resetBaseline = useCallback((nextForm: RdvFormState) => {
    lastSerializedRef.current = JSON.stringify(nextForm);
    baselineReadyRef.current = true;
    setStatus('idle');
    setError(null);
  }, []);

  const hasPending =
    status === 'pendente' ||
    status === 'salvando' ||
    status === 'erro' ||
    pendingAfterFlightRef.current;

  return {
    status,
    error,
    lastSavedAt,
    hasPending,
    saveNow: form ? () => saveNow(form) : async () => false,
    resetBaseline,
    setStatus,
    setError,
  };
}
