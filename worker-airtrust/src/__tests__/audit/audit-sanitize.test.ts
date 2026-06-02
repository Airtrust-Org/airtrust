import { describe, expect, it } from 'vitest';
import { sanitizeAuditPayload } from '../../lib/audit/sanitize';

describe('sanitizeAuditPayload', () => {
  it('redacts password, token, cookie and invite data', () => {
    const sanitized = sanitizeAuditPayload({
      password: 'secret',
      nested: {
        accessToken: 'abc',
        cookie: 'session=1',
        invite_link: 'https://airtrust.test/invite?token=abc',
      },
      ok: 'value',
    }) as Record<string, unknown>;

    expect(sanitized.password).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).accessToken).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).cookie).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).invite_link).toBe('[REDACTED]');
    expect(sanitized.ok).toBe('value');
  });

  it('truncates oversized strings and nested arrays safely', () => {
    const sanitized = sanitizeAuditPayload({
      notes: 'x'.repeat(400),
      items: Array.from({ length: 30 }, (_, index) => ({ index, token: `t-${index}` })),
    }) as Record<string, unknown>;

    expect(String(sanitized.notes)).toContain('...[truncated]');

    const items = sanitized.items as unknown[];
    expect(items).toHaveLength(26);
    expect(items[25]).toBe('[TRUNCATED_ITEMS:5]');
    expect((items[0] as Record<string, unknown>).token).toBe('[REDACTED]');
  });

  it('handles circular and deep payloads without throwing', () => {
    const circular: Record<string, unknown> = { level: 0 };
    circular.self = circular;

    const deep = {
      a: {
        b: {
          c: {
            d: {
              e: {
                f: 'hidden',
              },
            },
          },
        },
      },
    };

    const sanitizedCircular = sanitizeAuditPayload(circular) as Record<string, unknown>;
    const sanitizedDeep = sanitizeAuditPayload(deep) as Record<string, unknown>;

    expect(sanitizedCircular.self).toBe('[CIRCULAR]');
    expect(
      ((((sanitizedDeep.a as Record<string, unknown>).b as Record<string, unknown>).c as Record<
        string,
        unknown
      >).d as Record<string, unknown>).e,
    ).toBe('[TRUNCATED_DEPTH]');
  });
});
