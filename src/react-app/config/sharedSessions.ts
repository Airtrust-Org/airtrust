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
import { isSameStatus } from '@/react-app/types/simuladores';

let _cachedEnabled: boolean | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 30_000; // Reduced from 60s — operational flags must reflect quickly

export let SHARED_SESSIONS_ENABLED = false;

export interface IsSharedSessionsEnabledOptions {
  /** Bypass both the in-memory cache and the browser HTTP cache. Use when the
   *  flag may have changed operationally (e.g. after a worker deploy). */
  forceRefresh?: boolean;
}

/** Check at runtime whether the shared-session feature is enabled for the current environment.
 *
 *  ⚠️ Browser HTTP cache: the /api/capabilities endpoint may return
 *  `Cache-Control: public, max-age=300`. Without `cache: 'no-cache'`, the
 *  browser can serve a stale `false` from its HTTP cache long after the flag
 *  has been activated on the server. We use `cache: 'no-cache'` to always
 *  revalidate, while still allowing the CDN to cache the response.
 *
 *  The in-memory cache (CACHE_TTL_MS) prevents redundant fetches within a
 *  single page session. Pass `forceRefresh: true` to bypass it. */
export async function isSharedSessionsEnabled(
  options: IsSharedSessionsEnabledOptions = {},
): Promise<boolean> {
  const { forceRefresh = false } = options;
  const now = Date.now();

  if (!forceRefresh && _cachedEnabled !== null && now - _cacheTs < CACHE_TTL_MS) {
    return _cachedEnabled;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/capabilities`, {
      // cache: 'no-cache' tells the browser to always revalidate with the
      // server (sends If-None-Match / If-Modified-Since if available).
      // This prevents serving a stale `false` from the browser's HTTP cache
      // after an operational flag change, while still allowing 304 responses.
      cache: 'no-cache',
    });
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
}

export interface SharedSessionSegmentParticipant {
  funcionario_id: number;
  funcao: 'PF' | 'PM';
  cumpre_treinamento: boolean;
  gera_ficha?: boolean;
  treinamento_planejado_id?: number | null;
}

export interface SharedSessionSegment {
  id?: number | null;
  inicio: string; // HH:MM
  fim: string; // HH:MM
  modelo_sessao_id?: number | null;
  finalidade_codigo?: 'SOP_NORMAL' | 'SOP_ANORMAL_EMERGENCIA' | 'ATUACAO_EXAMINADOR' | 'OUTRO';
  finalidade_titulo?: string | null;
  participantes: SharedSessionSegmentParticipant[];
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

/**
 * Converts an existing PLANNED, evidence-free simple session into a shared
 * session in place. Distinct from updateSharedSession: that call targets
 * PUT /sessoes/compartilhada/:id, which 404s for a session that isn't shared
 * yet (it has no rows in the segment/atribuicao tables). The backend is the
 * sole authority on eligibility — this call can still fail with 409 if the
 * session gained evidence (started, ficha signed, etc.) between the frontend
 * eligibility check and the save.
 */
export async function convertSimpleSessionToShared(
  id: number,
  payload: SharedSessionPayload,
): Promise<{ success: boolean; data?: any; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/simuladores/sessoes/${id}/converter-compartilhada`, {
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

export interface SimpleSessionEvidenceCheck {
  status?: string | null;
  fichas?: Array<{
    status?: string | null;
    assinatura_aluno_timestamp?: string | null;
    assinatura_instrutor_timestamp?: string | null;
    assinatura_tripulante?: number | boolean | null;
    assinatura_instrutor?: number | boolean | null;
    resultado_final?: string | null;
  }> | null;
}

/**
 * Frontend mirror of the backend's assertSimpleSessionConvertible — used
 * only to disable the conversion toggle with an objective reason before the
 * user tries. The backend re-checks this at save time and remains the sole
 * authority; this is UX, not the security boundary.
 */
export function evaluateSharedConversionEligibility(
  sessao: SimpleSessionEvidenceCheck | null | undefined,
): { eligible: boolean; reason: string | null } {
  if (!sessao) {
    return { eligible: false, reason: 'Não foi possível confirmar se esta sessão pode ser convertida.' };
  }

  // Canonical vocabulary is AGENDADO/EM_ANDAMENTO/CONCLUIDO/CANCELADO (see
  // isSameStatus in types/simuladores.ts, which already normalizes legacy
  // casing and masculine/feminine variants). Only AGENDADO (planned, no
  // evidence yet) is convertible.
  const blockingStatuses = ['EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO', 'REALIZADO'];
  if (blockingStatuses.some((blocked) => isSameStatus(sessao.status || undefined, blocked))) {
    return { eligible: false, reason: 'Sessão já iniciada ou concluída não pode ser convertida.' };
  }

  const fichas = Array.isArray(sessao.fichas) ? sessao.fichas : [];
  const hasEvidence = fichas.some((ficha) => {
    if (ficha.assinatura_aluno_timestamp || ficha.assinatura_instrutor_timestamp) return true;
    if (Number(ficha.assinatura_tripulante) === 1 || Number(ficha.assinatura_instrutor) === 1) return true;
    const resultado = String(ficha.resultado_final || '').trim().toUpperCase();
    if (resultado && resultado !== 'PENDENTE') return true;
    const fichaStatus = String(ficha.status || '').trim().toUpperCase();
    if (fichaStatus && fichaStatus !== 'AVALIACAO_PENDENTE' && fichaStatus !== 'ABERTA') return true;
    return false;
  });

  if (hasEvidence) {
    return {
      eligible: false,
      reason: 'Esta sessão já possui ficha com evidência de execução e não pode ser convertida.',
    };
  }

  return { eligible: true, reason: null };
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
