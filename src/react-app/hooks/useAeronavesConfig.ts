/**
 * useAeronavesConfig - Hook para configurações dinâmicas de aeronaves
 * Carrega aeronaves do banco e gera cores consistentes
 *
 * ⚠️  Usar este hook ao invés de cores hardcoded para aeronaves!
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiJson } from '@/react-app/lib/api-contract';
import { useAuth } from '@/react-app/hooks/useAuth';
import { LruTtlCache } from '@/react-app/lib/lru-ttl-cache';
import { getCurrentTenantId, registerTenantCacheReset } from '@/react-app/lib/tenant-data-layer';
import { getCorByString } from '@/react-app/constants';

// =====================
// TYPES
// =====================

export interface Aeronave {
  id: number;
  // Fonte: /api/modelos-aeronave (tabela modelos_aeronave)
  modelo?: string;
  codigo?: string;
  nome?: string;
  fabricante?: string;
  tipo?: string;
  categoria?: string;
  descricao?: string;
  ativo?: boolean | number;
  created_at?: string;
  updated_at?: string;
}

export interface AeronaveCores {
  bg: string;
  border: string;
  text: string;
}

export interface AeronaveConfig extends Aeronave {
  cores: AeronaveCores;
}

interface UseAeronavesConfigReturn {
  aeronaves: AeronaveConfig[];
  loading: boolean;
  error: string | null;
  getCoresByAeronave: (codigo: string) => AeronaveCores;
  getAeronaveByCodigo: (codigo: string) => AeronaveConfig | undefined;
  refresh: () => Promise<void>;
}

// =====================
// HOOK
// =====================

export function useAeronavesConfig(): UseAeronavesConfigReturn {
  const { empresaAtualId } = useAuth();
  const [aeronaves, setAeronaves] = useState<AeronaveConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAeronaves = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!empresaAtualId) {
        setAeronaves([]);
        return;
      }
      const response = await apiJson<Aeronave[] | { data?: Aeronave[] }>('/api/modelos-aeronave');
      const aeronavesPayload = Array.isArray(response)
        ? response
        : Array.isArray(response.data)
          ? response.data
          : [];

      const configuredAeronaves: AeronaveConfig[] = aeronavesPayload.map((aeronave: Aeronave) => ({
        ...aeronave,
        cores: getCorByString(aeronave.codigo || aeronave.modelo || aeronave.nome || 'default'),
      }));

      setAeronaves(configuredAeronaves);
      updateAeronavesCache(configuredAeronaves, empresaAtualId);
    } catch (err) {
      console.error('Erro ao carregar aeronaves:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar aeronaves');
    } finally {
      setLoading(false);
    }
  }, [empresaAtualId]);

  useEffect(() => {
    fetchAeronaves();
  }, [fetchAeronaves]);

  // Mapa de cores por código para lookup rápido
  const coresMap = useMemo(() => {
    const map = new Map<string, AeronaveCores>();
    aeronaves.forEach((a) => {
      if (a.codigo) map.set(a.codigo, a.cores);
      if (a.modelo) map.set(a.modelo, a.cores);
      if (a.nome) map.set(a.nome, a.cores);
    });
    return map;
  }, [aeronaves]);

  // Busca cores por código ou modelo
  const getCoresByAeronave = useCallback(
    (codigo: string): AeronaveCores => {
      // Tenta encontrar no mapa
      const cores = coresMap.get(codigo);
      if (cores) return cores;

      // Se não encontrou, gera cor consistente
      return getCorByString(codigo);
    },
    [coresMap],
  );

  // Busca aeronave completa por código
  const getAeronaveByCodigo = useCallback(
    (codigo: string): AeronaveConfig | undefined => {
      return aeronaves.find((a) => a.codigo === codigo || a.modelo === codigo);
    },
    [aeronaves],
  );

  return {
    aeronaves,
    loading,
    error,
    getCoresByAeronave,
    getAeronaveByCodigo,
    refresh: fetchAeronaves,
  };
}

// =====================
// SINGLETON/CACHE (para usar fora de componentes)
// =====================

const cachedAeronaves = new LruTtlCache<number, AeronaveConfig[]>(8, 10 * 60 * 1000);
registerTenantCacheReset('aeronaves', () => cachedAeronaves.clear());

/**
 * Função utilitária para obter cores sem precisar de hook
 * Usa cache interno se disponível, senão gera cor consistente
 */
export function getAeronaveCores(codigo: string): AeronaveCores {
  const tenantId = getCurrentTenantId();
  const cached = tenantId
    ? cachedAeronaves.get(tenantId)?.find((a) => a.codigo === codigo || a.modelo === codigo)
    : undefined;
  if (cached) return cached.cores;

  // Fallback: gera cor consistente baseada no código
  return getCorByString(codigo);
}

/**
 * Atualiza o cache de aeronaves (chamar quando carregar aeronaves)
 */
export function updateAeronavesCache(
  aeronaves: AeronaveConfig[],
  tenantId: number | null = getCurrentTenantId(),
): void {
  if (!tenantId) return;
  cachedAeronaves.set(tenantId, aeronaves);
}
