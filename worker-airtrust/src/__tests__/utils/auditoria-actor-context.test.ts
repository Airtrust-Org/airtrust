import { describe, expect, it } from 'vitest';
import { extrairUsuarioAuditoria } from '../../utils/auditoria';

type Values = Record<string, unknown>;
function context(values: Values, headers: Record<string, string> = {}) {
  return {
    get: (key: string) => values[key],
    req: { header: (name: string) => headers[name] },
  };
}

describe('audit actor sourced from verified auth context', () => {
  it('binds authenticated userId and email when legacy user context is absent', () => {
    expect(extrairUsuarioAuditoria(context({ userId: '42', userEmail: 'auditor@example.test' }))).toEqual({
      usuario_id: '42', usuario_nome: 'auditor@example.test', ip_address: undefined, user_agent: undefined,
    });
  });
  it('preserves legacy user identity where explicitly supplied', () => {
    expect(extrairUsuarioAuditoria(context({ user: { id: 31, nome: 'Auditor A' }, userId: '42' })).usuario_id).toBe('31');
  });
  it('does not accept unverified actor supplied by request header', () => {
    const result = extrairUsuarioAuditoria(context({}, { 'x-user-id': '1234', 'user-agent': 'test' }));
    expect(result.usuario_id).toBeUndefined();
    expect(result.user_agent).toBe('test');
  });
  it('rejects malformed auth user IDs', () => {
    for (const id of [0, -1, '0', '-2', '12abc', '1.5', '9999999999999999999999', null]) {
      expect(extrairUsuarioAuditoria(context({ userId: id })).usuario_id).toBeUndefined();
    }
  });
});
