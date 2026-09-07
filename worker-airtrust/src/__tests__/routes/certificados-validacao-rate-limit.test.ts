import { describe, expect, it } from 'vitest';
import type { Env } from '../../types';
import validacaoCertificadosRoutes from '../../routes/certificados/validacao';

const testEnv = { ENVIRONMENT: 'test' } as Env;
const invalidHash = 'INVALID-HASH';

describe('public certificate validation rate limit', () => {
  it('limits repeated requests per client IP before the expensive certificate scan', async () => {
    const clientIp = '198.51.100.77';

    for (let attempt = 1; attempt <= 20; attempt++) {
      const response = await validacaoCertificadosRoutes.request(
        `/${invalidHash}`,
        { headers: { 'CF-Connecting-IP': clientIp } },
        testEnv,
      );

      expect(response.status).toBe(400);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('20');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe(String(20 - attempt));
    }

    const blocked = await validacaoCertificadosRoutes.request(
      `/${invalidHash}`,
      { headers: { 'CF-Connecting-IP': clientIp } },
      testEnv,
    );

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('60');
    await expect(blocked.json()).resolves.toMatchObject({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
    });

    const otherClient = await validacaoCertificadosRoutes.request(
      `/${invalidHash}`,
      { headers: { 'CF-Connecting-IP': '198.51.100.78' } },
      testEnv,
    );

    expect(otherClient.status).toBe(400);
  });
});
