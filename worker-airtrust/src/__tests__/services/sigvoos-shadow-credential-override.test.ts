import { describe, expect, it } from 'vitest';
import {
  resolveShadowCredentialOverride,
  diagnoseShadowCredentialEnv,
} from '../../services/sigvoos-shadow-service';

describe('resolveShadowCredentialOverride (SIGVOOS_SHADOW_CREDENTIAL_JSON — Fase 1 staging)', () => {
  it('retorna null quando o secret está ausente', () => {
    expect(resolveShadowCredentialOverride(undefined)).toBeNull();
    expect(resolveShadowCredentialOverride({})).toBeNull();
  });

  it('FAIL-CLOSED: secret não-JSON sem SIGVOOS_SHADOW_USERNAME nunca resolve (não inventa username)', () => {
    expect(
      resolveShadowCredentialOverride({ SIGVOOS_SHADOW_CREDENTIAL_JSON: 'bare-password-string' }),
    ).toBeNull();
  });

  it('password-only: secret não-JSON + SIGVOOS_SHADOW_USERNAME resolve com o conteúdo inteiro como password', () => {
    const result = resolveShadowCredentialOverride({
      ENVIRONMENT: 'staging',
      SIGVOOS_SHADOW_CREDENTIAL_JSON: 'bare-password-string',
      SIGVOOS_SHADOW_USERNAME: 'someone@example.com',
    });
    expect(result).toEqual({ username: 'someone@example.com', password: 'bare-password-string' });
  });

  it('password-only FAIL-CLOSED em production, mesmo com username configurado', () => {
    const result = resolveShadowCredentialOverride({
      ENVIRONMENT: 'production',
      SIGVOOS_SHADOW_CREDENTIAL_JSON: 'bare-password-string',
      SIGVOOS_SHADOW_USERNAME: 'someone@example.com',
    });
    expect(result).toBeNull();
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

describe('diagnoseShadowCredentialEnv (secret-free diagnosis, never leaks values)', () => {
  it('ENV_SECRET_ABSENT quando não há secret', () => {
    expect(diagnoseShadowCredentialEnv(undefined)).toEqual({ diagnosis: 'ENV_SECRET_ABSENT' });
  });

  it('PRODUCTION_BLOCKED quando ENVIRONMENT=production, mesmo com secret presente', () => {
    expect(
      diagnoseShadowCredentialEnv({
        ENVIRONMENT: 'production',
        SIGVOOS_SHADOW_CREDENTIAL_JSON: JSON.stringify({ username: 'u', password: 'p' }),
      }),
    ).toEqual({ diagnosis: 'PRODUCTION_BLOCKED' });
  });

  it('PASSWORD_ONLY_MISSING_USERNAME quando o secret não é JSON e falta SIGVOOS_SHADOW_USERNAME', () => {
    expect(
      diagnoseShadowCredentialEnv({ SIGVOOS_SHADOW_CREDENTIAL_JSON: 'bare-password-string' }),
    ).toEqual({ diagnosis: 'PASSWORD_ONLY_MISSING_USERNAME' });
  });

  it('OK_PASSWORD_ONLY quando o secret não é JSON e SIGVOOS_SHADOW_USERNAME está presente (nunca revela o valor)', () => {
    const result = diagnoseShadowCredentialEnv({
      SIGVOOS_SHADOW_CREDENTIAL_JSON: 'bare-password-string',
      SIGVOOS_SHADOW_USERNAME: 'someone@example.com',
    });
    expect(result).toEqual({ diagnosis: 'OK_PASSWORD_ONLY' });
    expect(JSON.stringify(result)).not.toMatch(/bare-password-string|someone@example\.com/);
  });

  it('MISSING_USERNAME_OR_PASSWORD reporta apenas nomes de chaves presentes, nunca valores', () => {
    const result = diagnoseShadowCredentialEnv({
      SIGVOOS_SHADOW_CREDENTIAL_JSON: JSON.stringify({ SIGVOOS_USERNAME: 'u', SIGVOOS_PASSWORD: 'p' }),
    });
    expect(result.diagnosis).toBe('MISSING_USERNAME_OR_PASSWORD');
    expect(result.presentKeys).toEqual(['SIGVOOS_USERNAME', 'SIGVOOS_PASSWORD']);
    expect(JSON.stringify(result)).not.toMatch(/\bu\b|\bp\b/);
  });

  it('OK quando username/password estão presentes', () => {
    const result = diagnoseShadowCredentialEnv({
      SIGVOOS_SHADOW_CREDENTIAL_JSON: JSON.stringify({ username: 'u', password: 'p' }),
    });
    expect(result.diagnosis).toBe('OK');
    expect(result.presentKeys).toEqual(['username', 'password']);
  });
});

describe('secret vazio e sanitização adicional', () => {
  it('secret vazio (string vazia) é tratado como ausente', () => {
    expect(resolveShadowCredentialOverride({ SIGVOOS_SHADOW_CREDENTIAL_JSON: '' })).toBeNull();
    expect(diagnoseShadowCredentialEnv({ SIGVOOS_SHADOW_CREDENTIAL_JSON: '' })).toEqual({
      diagnosis: 'ENV_SECRET_ABSENT',
    });
  });

  it('nenhum caminho de diagnóstico ou resolução aceita username vazio no modo password-only', () => {
    expect(
      resolveShadowCredentialOverride({
        ENVIRONMENT: 'staging',
        SIGVOOS_SHADOW_CREDENTIAL_JSON: 'bare-password-string',
        SIGVOOS_SHADOW_USERNAME: '',
      }),
    ).toBeNull();
  });
});
