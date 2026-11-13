import { describe, expect, it } from 'vitest';
import { readJsonOrThrow, shouldRetryDashboardQuery } from '../queries';

describe('dashboard API overload backpressure', () => {
  it('propagates HTTP status so retry logic can identify throttling', async () => {
    const response = {
      ok: false,
      status: 429,
      json: async () => ({ error: 'Muitas requisições' }),
    } as unknown as Response;

    await expect(readJsonOrThrow(response, 'Falha de consulta')).rejects.toMatchObject({
      message: 'Muitas requisições',
      status: 429,
    });
  });

  it.each([400, 401, 403, 404, 409, 429])(
    'never retries non-transient client HTTP %s',
    (status) => {
      expect(shouldRetryDashboardQuery(0, Object.assign(new Error('API'), { status }))).toBe(false);
    },
  );

  it('retries network and 503 once, rather than amplifying D1 overload', () => {
    expect(shouldRetryDashboardQuery(0, new TypeError('fetch failed'))).toBe(true);
    expect(shouldRetryDashboardQuery(1, new TypeError('fetch failed'))).toBe(false);
    expect(shouldRetryDashboardQuery(0, Object.assign(new Error('D1 overloaded'), { status: 503 }))).toBe(true);
    expect(shouldRetryDashboardQuery(1, Object.assign(new Error('D1 overloaded'), { status: 503 }))).toBe(false);
  });

  it('rejects HTTP 200 with unsuccessful API envelope instead of reporting zero data', async () => {
    const response = {
      ok: true,
      status: 200,
      json: async () => ({ success: false, error: 'Dados indisponíveis' }),
    } as unknown as Response;
    await expect(readJsonOrThrow(response, 'Falha')).rejects.toThrow('Dados indisponíveis');
  });
});
