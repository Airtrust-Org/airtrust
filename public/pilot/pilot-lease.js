import {
  PILOT_OFFLINE_APP_VERSION,
  TRUSTED_PILOT_LEASE_KEYS,
  isTrustedPilotLeaseKeyForOrigin,
} from '/pilot/pilot-lease-trust.js';

function base64UrlToBytes(value) {
  const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function parseVersion(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function versionAtLeast(current, minimum) {
  const a = parseVersion(current);
  const b = parseVersion(minimum);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return true;
    if (a[index] < b[index]) return false;
  }
  return true;
}

function resolveCurrentOrigin() {
  return String(globalThis.location?.origin || '').trim();
}

function findTrustedKey(keyId, origin) {
  return (
    TRUSTED_PILOT_LEASE_KEYS.find((entry) =>
      isTrustedPilotLeaseKeyForOrigin(entry, keyId, origin),
    ) || null
  );
}

export function hasTrustedPilotLeaseKeys() {
  const origin = resolveCurrentOrigin();
  return TRUSTED_PILOT_LEASE_KEYS.some((entry) =>
    isTrustedPilotLeaseKeyForOrigin(entry, entry?.key_id, origin),
  );
}

export async function verifyPilotOfflineLease(envelope, options) {
  if (
    !envelope ||
    envelope.envelope_version !== 1 ||
    envelope.alg !== 'ES256' ||
    !envelope.key_id ||
    !envelope.payload ||
    !envelope.signature
  ) {
    throw new Error('Envelope de lease offline inválido.');
  }

  const expected = options || {};
  const trustedOrigin = resolveCurrentOrigin();
  const trusted = findTrustedKey(envelope.key_id, trustedOrigin);
  if (!trusted?.public_jwk) {
    throw new Error(
      'Chave pública confiável do lease offline não foi provisionada para esta origem.',
    );
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    trusted.public_jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const payloadBytes = base64UrlToBytes(envelope.payload);
  const signatureBytes = base64UrlToBytes(envelope.signature);
  const validSignature = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signatureBytes,
    payloadBytes,
  );
  if (!validSignature) {
    throw new Error('Assinatura do lease offline inválida.');
  }

  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    throw new Error('Payload do lease offline inválido.');
  }

  const now = expected.now instanceof Date ? expected.now : new Date();
  const validFrom = new Date(claims.valid_from || '');
  const validUntil = new Date(claims.valid_until || '');

  if (claims.lease_version !== 1 || claims.purpose !== 'offline_flight_lease') {
    throw new Error('Contrato de lease offline incompatível.');
  }
  if (Number(claims.tenant_id) !== Number(expected.tenantId)) {
    throw new Error('Lease offline pertence a outro tenant.');
  }
  if (Number(claims.user_id) !== Number(expected.userId)) {
    throw new Error('Lease offline pertence a outro usuário.');
  }
  if (String(claims.device_id) !== String(expected.deviceId)) {
    throw new Error('Lease offline pertence a outro tablet.');
  }
  if (
    !Array.isArray(claims.flight_ids) ||
    !claims.flight_ids.map(Number).includes(Number(expected.flightId))
  ) {
    throw new Error('Lease offline não autoriza este voo.');
  }
  if (Number.isNaN(validFrom.getTime()) || now.getTime() < validFrom.getTime()) {
    throw new Error('Lease offline ainda não está válido.');
  }
  if (Number.isNaN(validUntil.getTime()) || now.getTime() >= validUntil.getTime()) {
    throw new Error('Lease offline expirado.');
  }
  if (!versionAtLeast(PILOT_OFFLINE_APP_VERSION, claims.app_min_version)) {
    throw new Error('Pilot App abaixo da versão mínima exigida pelo lease.');
  }
  if (
    !Array.isArray(claims.allowed_local_actions) ||
    !claims.allowed_local_actions.includes('edit_rdv_draft')
  ) {
    throw new Error('Lease offline não autoriza edição de RDV.');
  }

  return {
    verified: true,
    key_id: envelope.key_id,
    claims,
    verified_at: now.toISOString(),
  };
}
