import { ApiError } from '../../middleware/error-handler';
import type { Env } from '../../types';

export const PILOT_OFFLINE_LEASE_VERSION = 1;
export const PILOT_OFFLINE_LEASE_ALGORITHM = 'ES256';
export const PILOT_OFFLINE_LEASE_DEFAULT_TTL_MINUTES = 12 * 60;
export const PILOT_OFFLINE_APP_MIN_VERSION = '1.0.0';

export type PilotOfflineLeaseClaims = {
  lease_version: 1;
  purpose: 'offline_flight_lease';
  tenant_id: number;
  user_id: number;
  funcionario_id: number;
  flight_ids: number[];
  device_id: string;
  issued_at: string;
  valid_from: string;
  valid_until: string;
  app_min_version: string;
  allowed_local_actions: Array<'open_package' | 'edit_rdv_draft'>;
  nonce: string;
};

export type PilotOfflineLeaseEnvelope = {
  envelope_version: 1;
  alg: 'ES256';
  key_id: string;
  payload: string;
  signature: string;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function parsePrivateKey(env: Env): JsonWebKey {
  const raw = env.PILOT_OFFLINE_LEASE_PRIVATE_KEY_JWK?.trim();
  if (!raw) {
    throw new ApiError(
      'Assinatura de lease offline indisponivel neste ambiente',
      503,
      'CONTROLE_VOOS_PILOT_LEASE_SIGNING_UNAVAILABLE',
    );
  }

  try {
    const jwk = JSON.parse(raw) as JsonWebKey;
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y) {
      throw new Error('JWK privado P-256 incompleto');
    }
    return jwk;
  } catch {
    throw new ApiError(
      'Configuracao de assinatura de lease offline invalida',
      503,
      'CONTROLE_VOOS_PILOT_LEASE_SIGNING_INVALID',
    );
  }
}

export function getPilotOfflineLeaseKeyId(env: Env): string {
  const keyId = env.PILOT_OFFLINE_LEASE_KEY_ID?.trim();
  if (!keyId || !/^[A-Za-z0-9._:-]{3,80}$/.test(keyId)) {
    throw new ApiError(
      'Identificador da chave de lease offline indisponivel',
      503,
      'CONTROLE_VOOS_PILOT_LEASE_KEY_ID_UNAVAILABLE',
    );
  }
  return keyId;
}

export function getPilotOfflineLeaseTtlMinutes(env: Env): number {
  const raw = Number(env.PILOT_OFFLINE_LEASE_TTL_MINUTES || PILOT_OFFLINE_LEASE_DEFAULT_TTL_MINUTES);
  if (!Number.isFinite(raw)) return PILOT_OFFLINE_LEASE_DEFAULT_TTL_MINUTES;
  return Math.min(Math.max(Math.trunc(raw), 60), 24 * 60);
}

export function validatePilotOfflineDeviceId(value: unknown): string {
  const deviceId = String(value || '').trim();
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(deviceId)) {
    throw new ApiError(
      'device_id offline invalido',
      400,
      'CONTROLE_VOOS_PILOT_DEVICE_ID_INVALID',
    );
  }
  return deviceId;
}

export function validatePilotOfflineAppVersion(value: unknown): string {
  const version = String(value || '').trim();
  if (!/^[0-9A-Za-z.+_-]{1,64}$/.test(version)) {
    throw new ApiError(
      'app_version offline invalida',
      400,
      'CONTROLE_VOOS_PILOT_APP_VERSION_INVALID',
    );
  }
  return version;
}

export function buildPilotOfflineLeaseClaims(input: {
  env: Env;
  tenantId: number;
  userId: number;
  funcionarioId: number;
  flightId: number;
  deviceId: string;
  now?: Date;
}): PilotOfflineLeaseClaims {
  const now = input.now ?? new Date();
  const ttlMinutes = getPilotOfflineLeaseTtlMinutes(input.env);
  const validFrom = new Date(now.getTime() - 5 * 60_000);
  const validUntil = new Date(now.getTime() + ttlMinutes * 60_000);

  return {
    lease_version: PILOT_OFFLINE_LEASE_VERSION,
    purpose: 'offline_flight_lease',
    tenant_id: input.tenantId,
    user_id: input.userId,
    funcionario_id: input.funcionarioId,
    flight_ids: [input.flightId],
    device_id: input.deviceId,
    issued_at: now.toISOString(),
    valid_from: validFrom.toISOString(),
    valid_until: validUntil.toISOString(),
    app_min_version: PILOT_OFFLINE_APP_MIN_VERSION,
    allowed_local_actions: ['open_package', 'edit_rdv_draft'],
    nonce: crypto.randomUUID(),
  };
}

export async function signPilotOfflineLease(
  env: Env,
  claims: PilotOfflineLeaseClaims,
): Promise<PilotOfflineLeaseEnvelope> {
  const privateJwk = parsePrivateKey(env);
  const keyId = getPilotOfflineLeaseKeyId(env);
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const payloadBytes = new TextEncoder().encode(JSON.stringify(claims));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    payloadBytes,
  );

  return {
    envelope_version: 1,
    alg: PILOT_OFFLINE_LEASE_ALGORITHM,
    key_id: keyId,
    payload: bytesToBase64Url(payloadBytes),
    signature: bytesToBase64Url(new Uint8Array(signature)),
  };
}
