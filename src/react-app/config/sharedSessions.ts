/**
 * Shared Simulator Sessions — Feature flag & API helpers
 *
 * Feature is server-side guarded by SIMULATOR_SHARED_SESSIONS_ENABLED.
 * The client checks the backend /api/capabilities endpoint at runtime.
 *
 * LOCAL DEV: Backend returns true when .dev.vars has the flag.
 * PRODUCTION: Backend returns false (flag absent), feature hidden.
 */

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

let _cachedEnabled: boolean | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 60_000;

export let SHARED_SESSIONS_ENABLED = false;

/** Check at runtime whether the shared-session feature is enabled for the current environment */
export async function isSharedSessionsEnabled(): Promise<boolean> {
  const now = Date.now();
  if (_cachedEnabled !== null && now - _cacheTs < CACHE_TTL_MS) {
    return _cachedEnabled;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/capabilities`);
    if (res.ok) {
      const body = await res.json();
      _cachedEnabled = body?.data?.simulador_shared_sessions === true;
    } else {
      _cachedEnabled = false;
    }
  } catch {
    // Fail-closed: any error reaching the capability endpoint hides the feature.
    // The backend must respond explicitly with simulador_shared_sessions: true.
    _cachedEnabled = false;
  }

  _cacheTs = now;
  SHARED_SESSIONS_ENABLED = _cachedEnabled;
  return _cachedEnabled;
}

/** Synchronous check using cached value. Call isSharedSessionsEnabled() first. */
export function isSharedSessionsEnabledSync(): boolean {
  return SHARED_SESSIONS_ENABLED;
}

/** Resets the capability cache. For use in tests only. */
export function _resetCacheForTesting(): void {
  _cachedEnabled = null;
  _cacheTs = 0;
  SHARED_SESSIONS_ENABLED = false;
}

export interface SharedSessionParticipant {
  funcionario_id: number;
  cumpre_treinamento: boolean;
  treinamento_planejado_id?: number | null;
  modelo_sessao_id?: number | null;
  gera_ficha: boolean;
}

export interface SharedSessionSegmentRole {
  funcionario_id: number;
  funcao: 'PF' | 'PM';
}

export interface SharedSessionSegment {
  inicio: string; // HH:MM
  fim: string; // HH:MM
  atribuicao_funcionario_id?: number | null;
  funcoes: SharedSessionSegmentRole[];
}

export interface SharedSessionPayload {
  data: string;
  hora_inicio: string;
  hora_fim: string;
  simulador_id: number;
  instrutor_id: number;
  tema_sessao?: string | null;
  observacoes?: string | null;
  participantes: SharedSessionParticipant[];
  segmentos: SharedSessionSegment[];
}

export async function createSharedSession(
  payload: SharedSessionPayload,
): Promise<{ success: boolean; data?: any; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/simuladores/sessoes/compartilhada`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function updateSharedSession(
  id: number,
  payload: SharedSessionPayload,
): Promise<{ success: boolean; data?: any; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/simuladores/sessoes/compartilhada/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function getSharedSession(
  id: number,
): Promise<{ success: boolean; data?: any; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/simuladores/sessoes/compartilhada/${id}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  return res.json();
}

export async function cancelSharedAssignment(
  sessaoId: number,
  atribuicaoId: number,
): Promise<{ success: boolean; data?: any; error?: string }> {
  const res = await fetch(
    `${API_BASE_URL}/simuladores/sessoes/compartilhada/${sessaoId}/atribuicoes/${atribuicaoId}/cancelar`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    },
  );
  return res.json();
}
