/**
 * useAeronavesConfig - Hook para configurações dinâmicas de aeronaves
 * Carrega aeronaves do banco e gera cores consistentes
 *
 * ⚠️  Usar este hook ao invés de cores hardcoded para aeronaves!
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiClient as api } from '@/react-app/services/apiClient';
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
  const [aeronaves, setAeronaves] = useState<AeronaveConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAeronaves = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get<Aeronave[] | { data?: Aeronave[] }>('/modelos-aeronave');
      const aeronavesPayload = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];

      const configuredAeronaves: AeronaveConfig[] = aeronavesPayload.map((aeronave: Aeronave) => ({
        ...aeronave,
        cores: getCorByString(aeronave.codigo || aeronave.modelo || aeronave.nome || 'default'),
      }));

      setAeronaves(configuredAeronaves);
      updateAeronavesCache(configuredAeronaves);
    } catch (err) {
      console.error('Erro ao carregar aeronaves:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar aeronaves');
    } finally {
      setLoading(false);
    }
  }, []);

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

let cachedAeronaves: AeronaveConfig[] = [];

/**
 * Função utilitária para obter cores sem precisar de hook
 * Usa cache interno se disponível, senão gera cor consistente
 */
export function getAeronaveCores(codigo: string): AeronaveCores {
  const cached = cachedAeronaves.find((a) => a.codigo === codigo || a.modelo === codigo);
  if (cached) return cached.cores;

  // Fallback: gera cor consistente baseada no código
  return getCorByString(codigo);
}

/**
 * Atualiza o cache de aeronaves (chamar quando carregar aeronaves)
 */
export function updateAeronavesCache(aeronaves: AeronaveConfig[]) {
  cachedAeronaves = aeronaves;
}
