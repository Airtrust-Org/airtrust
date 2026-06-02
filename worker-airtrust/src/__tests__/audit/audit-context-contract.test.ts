import { describe, expect, it } from 'vitest';
import {
  buildAuditMetadata,
  buildLegacyAuditoriaActor,
  buildLegacyAuditPayload,
} from '../../lib/audit/context';

function buildContext(overrides: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>([
    ['userId', 42],
    ['userRole', 'ADMIN'],
    ['empresaId', 7],
    ['requestId', 'req-123'],
    ...Object.entries(overrides),
  ]);

  return {
    get: (key: string) => store.get(key),
    req: {
      header: (name: string) => {
        const headers: Record<string, string> = {
          'cf-connecting-ip': '203.0.113.10',
          'user-agent': 'vitest',
          'X-Request-ID': 'req-header-fallback',
        };
        return headers[name];
      },
    },
  };
}

describe('audit context helpers', () => {
  it('builds metadata with request and tenant context while sanitizing sensitive fields', () => {
    const metadata = buildAuditMetadata(buildContext(), {
      module: 'admin',
      authorization: 'Bearer secret',
    });

    expect(metadata.module).toBe('admin');
    expect(metadata.request_id).toBe('req-123');
    expect(metadata.empresa_id).toBe(7);
    expect(metadata.actor_user_id).toBe(42);
    expect(metadata.actor_role).toBe('ADMIN');
    expect(metadata.authorization).toBe('[REDACTED]');
  });

  it('wraps legacy payloads with sanitized data and _audit_context', () => {
    const payload = buildLegacyAuditPayload(
      buildContext(),
      {
        nome: 'Tenant A',
        smtp_password: 'super-secret',
      },
      { empresa_id: 99 },
    );

    expect(payload.nome).toBe('Tenant A');
    expect(payload.smtp_password).toBe('[REDACTED]');
    expect((payload._audit_context as Record<string, unknown>).empresa_id).toBe(99);
    expect((payload._audit_context as Record<string, unknown>).request_id).toBe('req-123');
  });

  it('exports legacy actor fields without introducing email payloads', () => {
    const actor = buildLegacyAuditoriaActor(buildContext());

    expect(actor.usuario_id).toBe('42');
    expect(actor.ip_address).toBe('203.0.113.10');
    expect(actor.user_agent).toBe('vitest');
    expect(actor).not.toHaveProperty('usuario_nome');
  });
});
