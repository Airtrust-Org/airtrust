import { describe, expect, it } from 'vitest';
import type { Env } from '../../types';
import {
  buildPilotOfflineLeaseClaims,
  signPilotOfflineLease,
  validatePilotOfflineDeviceId,
} from '../../services/controle-voos/pilot-offline-lease';

function base64UrlToBytes(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

describe('pilot offline lease signing', () => {
  it('assina claims ES256 verificaveis pela chave publica correspondente', async () => {
    const keyPair = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const env = {
      PILOT_OFFLINE_LEASE_PRIVATE_KEY_JWK: JSON.stringify(privateJwk),
      PILOT_OFFLINE_LEASE_KEY_ID: 'pilot-test-key-2026',
      PILOT_OFFLINE_LEASE_TTL_MINUTES: '720',
    } as unknown as Env;

    const claims = buildPilotOfflineLeaseClaims({
      env,
      tenantId: 7,
      userId: 70,
      funcionarioId: 77,
      flightId: 42,
      deviceId: 'device-1234567890',
      now: new Date('2026-09-09T10:00:00.000Z'),
    });
    const envelope = await signPilotOfflineLease(env, claims);

    expect(envelope).toMatchObject({
      envelope_version: 1,
      alg: 'ES256',
      key_id: 'pilot-test-key-2026',
    });

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const payload = base64UrlToBytes(envelope.payload);
    const signature = base64UrlToBytes(envelope.signature);
    await expect(
      crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signature,
        payload,
      ),
    ).resolves.toBe(true);

    const decoded = JSON.parse(new TextDecoder().decode(payload));
    expect(decoded).toMatchObject({
      purpose: 'offline_flight_lease',
      tenant_id: 7,
      user_id: 70,
      funcionario_id: 77,
      flight_ids: [42],
      device_id: 'device-1234567890',
      allowed_local_actions: ['open_package', 'edit_rdv_draft'],
    });
    expect(new Date(decoded.valid_until).getTime()).toBeGreaterThan(
      new Date(decoded.issued_at).getTime(),
    );
  });

  it('falha fechado quando a chave privada nao esta configurada', async () => {
    const env = {
      PILOT_OFFLINE_LEASE_KEY_ID: 'pilot-test-key-2026',
    } as unknown as Env;
    const claims = buildPilotOfflineLeaseClaims({
      env,
      tenantId: 7,
      userId: 70,
      funcionarioId: 77,
      flightId: 42,
      deviceId: 'device-1234567890',
      now: new Date('2026-09-09T10:00:00.000Z'),
    });

    await expect(signPilotOfflineLease(env, claims)).rejects.toThrow(
      'Assinatura de lease offline indisponivel',
    );
  });

  it('rejeita device_id curto ou com caracteres fora do contrato', () => {
    expect(() => validatePilotOfflineDeviceId('curto')).toThrow('device_id offline invalido');
    expect(() => validatePilotOfflineDeviceId('device com espacos e invalido')).toThrow(
      'device_id offline invalido',
    );
  });
});
