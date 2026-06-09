/**
 * Shared Simulator Sessions — Feature flag & API helpers
 *
 * Feature is server-side guarded by SIMULATOR_SHARED_SESSIONS_ENABLED.
 * This client-side flag controls UI visibility.
 *
 * LOCAL DEV ONLY: Set to true for local development.
 * PRODUCTION: Keep false until feature is fully validated and deployed.
 */

export const SHARED_SESSIONS_ENABLED = import.meta.env.DEV;

/** Check at runtime whether the shared-session feature is enabled for the current environment */
export function isSharedSessionsEnabled(): boolean {
  return SHARED_SESSIONS_ENABLED;
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
  const token = (await import('@/react-app/config/api')).getAccessToken();
  const baseUrl = (await import('@/react-app/config/api')).API_BASE_URL;

  const res = await fetch(`${baseUrl}/simuladores/sessoes/compartilhada`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  return res.json();
}

export async function updateSharedSession(
  id: number,
  payload: SharedSessionPayload,
): Promise<{ success: boolean; data?: any; error?: string }> {
  const token = (await import('@/react-app/config/api')).getAccessToken();
  const baseUrl = (await import('@/react-app/config/api')).API_BASE_URL;

  const res = await fetch(`${baseUrl}/simuladores/sessoes/compartilhada/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  return res.json();
}

export async function getSharedSession(
  id: number,
): Promise<{ success: boolean; data?: any; error?: string }> {
  const token = (await import('@/react-app/config/api')).getAccessToken();
  const baseUrl = (await import('@/react-app/config/api')).API_BASE_URL;

  const res = await fetch(`${baseUrl}/simuladores/sessoes/compartilhada/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.json();
}

export async function cancelSharedAssignment(
  sessaoId: number,
  atribuicaoId: number,
): Promise<{ success: boolean; data?: any; error?: string }> {
  const token = (await import('@/react-app/config/api')).getAccessToken();
  const baseUrl = (await import('@/react-app/config/api')).API_BASE_URL;

  const res = await fetch(
    `${baseUrl}/simuladores/sessoes/compartilhada/${sessaoId}/atribuicoes/${atribuicaoId}/cancelar`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return res.json();
}
