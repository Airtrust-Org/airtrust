import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounce } from '@/react-app/hooks/useDebounce';
import {
  useAtualizarEtapa,
  useCriarEtapa,
  useDuplicarEtapa,
  useEtapas,
  useRemoverEtapa,
  useReordenarEtapas,
  type CvEtapa,
  type CvRdv,
  type EtapaInput,
} from '@/react-app/hooks/useControleVoos';
import type { RdvSaveStatus } from '../data/rdvPilotFlow';
import {
  clearEtapaPendingRecovery,
  draftFromEtapa,
  draftToEtapaPatch,
  emptyTrecho,
  loadEtapaPendingRecovery,
  saveEtapaPendingRecovery,
  type RdvTrechoDraft,
} from '../data/rdvPilotFlow';

type Options = {
  vooId: string | number | undefined;
  rdv: CvRdv | null | undefined;
  editable: boolean;
  origemIcao?: string;
  destinoIcao?: string;
};

function isVersionConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return (
    message.includes('VERSION_CONFLICT') ||
    message.includes('desatualizada') ||
    message.includes('409')
  );
}

/**
 * Fonte canônica: API `cv_voo_etapas`.
 * sessionStorage só guarda patches pendentes (vooId + versao + timestamp),
 * e nunca sobrescreve silenciosamente uma versão mais nova do servidor.
 */
export function usePersistedEtapas({
  vooId,
  rdv,
  editable,
  origemIcao = '',
  destinoIcao = '',
}: Options) {
  const { data, isLoading, error, refetch } = useEtapas(vooId);
  const criar = useCriarEtapa();
  const atualizar = useAtualizarEtapa();
  const remover = useRemoverEtapa();
  const duplicar = useDuplicarEtapa();
  const reordenar = useReordenarEtapas();

  const [drafts, setDrafts] = useState<RdvTrechoDraft[]>([]);
  const [statusByLocalId, setStatusByLocalId] = useState<Record<string, RdvSaveStatus>>({});
  const [errorByLocalId, setErrorByLocalId] = useState<Record<string, string | null>>({});
  const [versionConflict, setVersionConflict] = useState(false);
  const [knownVersao, setKnownVersao] = useState<number | null>(null);
  const hydratedRef = useRef(false);
  const dirtySerializedRef = useRef<Record<string, string>>({});

  const serverEtapas = data?.etapas;
  const serverVersao = rdv?.versao ?? data?.versao ?? null;
  const serverEtapasKey = serverEtapas
    ? serverEtapas.map((e) => `${e.id}:${e.updated_at ?? e.numero_etapa}`).join('|')
    : '';

  const hydrateFromServer = useCallback(
    (etapas: CvEtapa[], versao: number | null, force = false) => {
      if (!force && hydratedRef.current && Object.keys(dirtySerializedRef.current).length > 0) {
        return;
      }
      const next = etapas.length
        ? etapas.map((e) => draftFromEtapa(e))
        : editable
          ? [emptyTrecho(origemIcao, destinoIcao)]
          : [];
      setDrafts(next);
      setKnownVersao(versao);
      setStatusByLocalId({});
      setErrorByLocalId({});
      dirtySerializedRef.current = {};
      hydratedRef.current = true;

      if (vooId && versao != null) {
        const pending = loadEtapaPendingRecovery(vooId);
        if (pending && pending.versao >= versao && pending.patches.length > 0) {
          // Only apply pending if not older than server
          if (pending.versao === versao) {
            setDrafts((current) => {
              const byId = new Map(current.map((d) => [d.id, d]));
              for (const patch of pending.patches) {
                if (patch.id && byId.has(patch.id)) {
                  byId.set(patch.id, {
                    ...byId.get(patch.id)!,
                    ...patch.fields,
                    saveStatus: 'pendente',
                  });
                }
              }
              return current.map((d) => (d.id && byId.get(d.id)) || d);
            });
          }
        } else if (pending && pending.versao < (versao ?? 0)) {
          clearEtapaPendingRecovery(vooId);
        }
      }
    },
    [editable, origemIcao, destinoIcao, vooId],
  );

  useEffect(() => {
    if (!vooId || data == null || !serverEtapas) return;
    hydrateFromServer(serverEtapas, serverVersao, !hydratedRef.current);
    // serverEtapasKey evita re-hidratar a cada render quando a referência do array muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vooId, serverEtapasKey, serverVersao, hydrateFromServer]);

  const markStatus = (localId: string, status: RdvSaveStatus, err: string | null = null) => {
    setStatusByLocalId((prev) => ({ ...prev, [localId]: status }));
    setErrorByLocalId((prev) => ({ ...prev, [localId]: err }));
  };

  const persistPendingRecovery = useCallback(
    (nextDrafts: RdvTrechoDraft[], versao: number | null) => {
      if (!vooId || versao == null) return;
      const patches = nextDrafts
        .filter((d) => d.id && dirtySerializedRef.current[d.localId])
        .map((d) => ({ id: d.id!, fields: draftToEtapaPatch(d) }));
      if (patches.length === 0) {
        clearEtapaPendingRecovery(vooId);
        return;
      }
      saveEtapaPendingRecovery(vooId, {
        vooId: String(vooId),
        versao,
        timestamp: new Date().toISOString(),
        patches,
      });
    },
    [vooId],
  );

  const updateDraft = useCallback(
    (localId: string, next: RdvTrechoDraft) => {
      setDrafts((prev) => {
        const updated = prev.map((d) => (d.localId === localId ? next : d));
        dirtySerializedRef.current[localId] = JSON.stringify(draftToEtapaPatch(next));
        persistPendingRecovery(updated, knownVersao);
        return updated;
      });
      markStatus(localId, 'pendente');
    },
    [knownVersao, persistPendingRecovery],
  );

  const dirtyPayload = drafts
    .filter((d) => d.id && dirtySerializedRef.current[d.localId])
    .map((d) => ({ localId: d.localId, id: d.id!, patch: draftToEtapaPatch(d) }));
  const debouncedDirty = useDebounce(dirtyPayload, 800);

  useEffect(() => {
    if (!editable || !vooId || knownVersao == null) return;
    for (const item of debouncedDirty) {
      const stillDirty = dirtySerializedRef.current[item.localId];
      if (!stillDirty) continue;
      markStatus(item.localId, 'salvando');
      void atualizar
        .mutateAsync({
          vooId,
          etapaId: item.id,
          versao: knownVersao,
          ...item.patch,
        } as { vooId: string | number; etapaId: number } & EtapaInput)
        .then((result) => {
          if (result.meta.versao != null) setKnownVersao(result.meta.versao);
          delete dirtySerializedRef.current[item.localId];
          markStatus(item.localId, 'salvo');
          setDrafts((prev) =>
            prev.map((d) =>
              d.localId === item.localId ? draftFromEtapa(result.data, d.localId) : d,
            ),
          );
          if (vooId) clearEtapaPendingRecovery(vooId);
          setVersionConflict(false);
        })
        .catch((err) => {
          if (isVersionConflict(err)) {
            setVersionConflict(true);
            void refetch().then((res) => {
              hydrateFromServer(
                res.data?.etapas ?? [],
                res.data?.versao ?? rdv?.versao ?? null,
                true,
              );
            });
          }
          markStatus(item.localId, 'erro', err instanceof Error ? err.message : 'Erro ao salvar');
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDirty, editable, vooId, knownVersao]);

  const addEtapa = async () => {
    if (!vooId || knownVersao == null) return;
    const last = drafts[drafts.length - 1];
    const temp = emptyTrecho(last?.destino || origemIcao, '');
    markStatus(temp.localId, 'salvando');
    setDrafts((prev) => [...prev, temp]);
    try {
      const result = await criar.mutateAsync({
        vooId,
        versao: knownVersao,
        origem_icao: temp.origem || null,
        destino_icao: temp.destino || null,
        horario_decolagem: null,
        horario_pouso: null,
      });
      if (result.meta.versao != null) setKnownVersao(result.meta.versao);
      setDrafts((prev) =>
        prev.map((d) =>
          d.localId === temp.localId ? draftFromEtapa(result.data, temp.localId) : d,
        ),
      );
      markStatus(temp.localId, 'salvo');
    } catch (err) {
      setDrafts((prev) => prev.filter((d) => d.localId !== temp.localId));
      markStatus(temp.localId, 'erro', err instanceof Error ? err.message : 'Erro ao criar');
      if (isVersionConflict(err)) {
        setVersionConflict(true);
        await refetch();
      }
    }
  };

  const duplicateEtapa = async (localId: string) => {
    const source = drafts.find((d) => d.localId === localId);
    if (!source?.id || !vooId || knownVersao == null) return;
    try {
      const result = await duplicar.mutateAsync({
        vooId,
        etapaId: source.id,
        versao: knownVersao,
      });
      if (result.meta.versao != null) setKnownVersao(result.meta.versao);
      setDrafts((prev) => {
        const idx = prev.findIndex((d) => d.localId === localId);
        const copy = [...prev];
        copy.splice(idx + 1, 0, draftFromEtapa(result.data));
        return copy;
      });
    } catch (err) {
      if (isVersionConflict(err)) {
        setVersionConflict(true);
        await refetch();
      }
      throw err;
    }
  };

  const removeEtapa = async (localId: string) => {
    const source = drafts.find((d) => d.localId === localId);
    if (!source || drafts.length <= 1 || !vooId || knownVersao == null) return;
    if (!source.id) {
      setDrafts((prev) => prev.filter((d) => d.localId !== localId));
      return;
    }
    markStatus(localId, 'salvando');
    try {
      const result = await remover.mutateAsync({
        vooId,
        etapaId: source.id,
        versao: knownVersao,
      });
      if (result.meta.versao != null) setKnownVersao(result.meta.versao);
      setDrafts((prev) => prev.filter((d) => d.localId !== localId));
      delete dirtySerializedRef.current[localId];
    } catch (err) {
      markStatus(localId, 'erro', err instanceof Error ? err.message : 'Erro ao remover');
      if (isVersionConflict(err)) {
        setVersionConflict(true);
        await refetch();
      }
    }
  };

  const reorderEtapas = async (ordemLocalIds: string[]) => {
    if (!vooId || knownVersao == null) return;
    const ordem = ordemLocalIds
      .map((lid) => drafts.find((d) => d.localId === lid)?.id)
      .filter((id): id is number => typeof id === 'number');
    if (ordem.length !== drafts.length) return;
    const result = await reordenar.mutateAsync({ vooId, versao: knownVersao, ordem });
    if (result.meta.versao != null) setKnownVersao(result.meta.versao);
    setDrafts(result.data.map((e) => draftFromEtapa(e)));
  };

  const reloadFromServer = async () => {
    const res = await refetch();
    hydrateFromServer(res.data?.etapas ?? [], res.data?.versao ?? rdv?.versao ?? null, true);
    setVersionConflict(false);
  };

  const hasPending = Object.values(statusByLocalId).some(
    (s) => s === 'pendente' || s === 'salvando',
  );

  return {
    drafts,
    isLoading,
    error,
    knownVersao,
    versionConflict,
    statusByLocalId,
    errorByLocalId,
    hasPending,
    programado: data?.programado ?? null,
    updateDraft,
    addEtapa,
    duplicateEtapa,
    removeEtapa,
    reorderEtapas,
    reloadFromServer,
    serverCount: serverEtapas?.length ?? 0,
  };
}
