import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { rateLimiter, rateLimitPresets } from '../../middleware/rate-limit';

describe('rate limit D1 expiry cleanup (P01-01)', () => {
  it('keeps the active login window and rejects the sixth request during cleanup', async () => {
    const db = new SqliteD1Database();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      db.database.exec(
        "CREATE TABLE IF NOT EXISTS rate_limit_store (" +
        "key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at TEXT NOT NULL);" +
        "DELETE FROM rate_limit_store;" +
        "INSERT INTO rate_limit_store (key, count, reset_at) VALUES " +
        "('login:203.0.113.12', 5, datetime('now', '+60 seconds'))," +
        "('expired-test', 1, datetime('now', '-120 seconds'));",
      );
      const app = new Hono<any>();
      app.use('/login', rateLimiter(rateLimitPresets.login));
      app.get('/login', (c) => c.json({ ok: true }));
      const env = { DB: db.asD1(), ENVIRONMENT: 'production' } as any;
      const response = await app.request('/login', {
        headers: { 'CF-Connecting-IP': '203.0.113.12' },
      }, env);
      expect(response.status).toBe(429);
      const live = await db.prepare('SELECT count FROM rate_limit_store WHERE key = ?')
        .bind('login:203.0.113.12').first<{ count: number }>();
      expect(live?.count).toBe(6);
      const expired = await db.prepare('SELECT key FROM rate_limit_store WHERE key = ?')
        .bind('expired-test').first();
      expect(expired).toBeNull();
    } finally {
      random.mockRestore();
      db.close();
    }
  });
});
