import { describe, expect, it, vi } from 'vitest';
import { classifyD1Failure, withD1Retry } from '../../utils/d1-resilience';

describe('D1 diagnostics #2078', () => {
  it('classifies errors without returning arbitrary secrets', () => {
    const secret = 'cpf=12345678900 token=secret-bearer@example.test';
    for (const message of [
      `D1_EXEC_ERROR: 503 database resource limit ${secret}`,
      `RPC connection closed ${secret}`,
      `SQLITE_ERROR: no such column: ${secret}`,
      `unexpected ${secret}`,
    ]) {
      const category = classifyD1Failure(new Error(message));
      expect(category).toMatch(/^[a-z_]+$/);
      expect(category).not.toContain(secret);
    }
    expect(classifyD1Failure(new Error('D1_EXEC_ERROR: 503 database resource limit'))).toBe('database_capacity');
  });

  it('reports actual attempts for transient recovery without exposing errors to telemetry', async () => {
    const seen: number[] = [];
    let count = 0;
    const result = await withD1Retry(async () => {
      count++;
      if (count < 3) throw new Error('database is locked');
      return 'ok';
    }, 3, 1, (attempt, error) => { if (!error) seen.push(attempt); });
    expect(result).toBe('ok');
    expect(seen).toEqual([1, 2, 3]);
  });

  it('does not retry permanent SQL errors', async () => {
    const operation = vi.fn(async () => { throw new Error('no such table: token_blocklist'); });
    const seen: number[] = [];
    await expect(withD1Retry(operation, 7, 1, (attempt, error) => { if (!error) seen.push(attempt); })).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([1]);
  });
});
