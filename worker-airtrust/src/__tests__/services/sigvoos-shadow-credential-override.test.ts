import { describe, expect, it } from 'vitest';
import { resolveShadowCredentialOverride } from '../../services/sigvoos-shadow-service';

describe('resolveShadowCredentialOverride (SIGVOOS_SHADOW_CREDENTIAL_JSON — Fase 1 staging)', () => {
  it('retorna null quando o secret está ausente', () => {
    expect(resolveShadowCredentialOverride(undefined)).toBeNull();
    expect(resolveShadowCredentialOverride({})).toBeNull();
  });

  it('retorna null quando o secret é JSON inválido', () => {
    expect(
      resolveShadowCredentialOverride({ SIGVOOS_SHADOW_CREDENTIAL_JSON: 'not-json{' }),
    ).toBeNull();
  });

  it('retorna null quando faltam username ou password', () => {
    expect(
      resolveShadowCredentialOverride({
        SIGVOOS_SHADOW_CREDENTIAL_JSON: JSON.stringify({ username: 'only-user' }),
      }),
    ).toBeNull();
    expect(
      resolveShadowCredentialOverride({
        SIGVOOS_SHADOW_CREDENTIAL_JSON: JSON.stringify({ password: 'only-pass' }),
      }),
    ).toBeNull();
  });

  it('resolve username/password quando o JSON é válido, em staging', () => {
    const result = resolveShadowCredentialOverride({
      ENVIRONMENT: 'staging',
      SIGVOOS_SHADOW_CREDENTIAL_JSON: JSON.stringify({ username: 'u', password: 'p' }),
    });
    expect(result).toEqual({ username: 'u', password: 'p', base_url: undefined, system: undefined });
  });

  it('FAIL-CLOSED: nunca resolve quando ENVIRONMENT=production, mesmo com secret presente', () => {
    const result = resolveShadowCredentialOverride({
      ENVIRONMENT: 'production',
      SIGVOOS_SHADOW_CREDENTIAL_JSON: JSON.stringify({ username: 'u', password: 'p' }),
    });
    expect(result).toBeNull();
  });

  it('resolve também em development (não-production) para permitir teste local', () => {
    const result = resolveShadowCredentialOverride({
      ENVIRONMENT: 'development',
      SIGVOOS_SHADOW_CREDENTIAL_JSON: JSON.stringify({ username: 'u', password: 'p' }),
    });
    expect(result).not.toBeNull();
  });

  it('propaga base_url/system opcionais do JSON quando presentes', () => {
    const result = resolveShadowCredentialOverride({
      ENVIRONMENT: 'staging',
      SIGVOOS_SHADOW_CREDENTIAL_JSON: JSON.stringify({
        username: 'u',
        password: 'p',
        base_url: 'https://custom.example/api',
        system: 'custom-system',
      }),
    });
    expect(result).toEqual({
      username: 'u',
      password: 'p',
      base_url: 'https://custom.example/api',
      system: 'custom-system',
    });
  });

  it('nunca inclui o valor do secret bruto no resultado além dos campos parseados (sem vazamento de campos extras)', () => {
    const result = resolveShadowCredentialOverride({
      ENVIRONMENT: 'staging',
      SIGVOOS_SHADOW_CREDENTIAL_JSON: JSON.stringify({
        username: 'u',
        password: 'p',
        extra_unexpected_field: 'should-not-appear',
      }),
    });
    expect(Object.keys(result || {}).sort()).toEqual(['base_url', 'password', 'system', 'username']);
  });
});
