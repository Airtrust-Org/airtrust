import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import readinessRouter from '../../routes/frms-readiness';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { set: (key: string, value: number) => void }, next: () => Promise<void>) => {
    c.set('funcionarioId', 41);
    await next();
  },
}));
vi.mock('../../middleware/tenant', () => ({ getEmpresaId: () => 999013 }));
vi.mock('../../lib/frms/access', () => ({ canSeeFrmsTeamScopeForContext: async () => true }));
vi.mock('../../routes/frms-recovery', async () => {
  const { Hono } = await import('hono');
  return { default: new Hono(), refreshRecoveryAssessmentForActivityDate: vi.fn() };
});

type SqlCall = { sql: string; binds: unknown[] };

function createApp() {
  const calls: SqlCall[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          calls.push({ sql, binds });
          return {
            first: async () => (sql.includes('FROM funcionarios') ? { id: 41 } : null),
            all: async () => ({ results: [] }),
          };
        },
      };
    },
  };
  const app = new Hono();
  app.route('/api/frms/readiness', readinessRouter);
  const request = (suffix: string) =>
    app.fetch(new Request(`http://localhost/api/frms/readiness/${suffix}`), { DB: db } as unknown as Env);
  return { calls, request };
}

afterEach(() => vi.useRealTimers());

describe('FRMS readiness reference-date default', () => {
  it('uses the Brasília operational day for both personal and team reads after UTC midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T00:30:00Z')); // 21:30 on 29 Oct in Brasília.
    const { calls, request } = createApp();
    expect((await request('today')).status).toBe(200);
    expect((await request('team')).status).toBe(200);

    const personal = calls.find(({ sql }) => sql.includes('FROM frms_readiness_assessment'));
    const team = calls.find(({ sql }) => sql.includes('FROM frms_fadiga_checkin ch'));
    expect(personal?.binds).toContain('2026-10-29');
    expect(team?.binds).toContain('2026-10-29');
  });

  it('preserves an explicitly supplied historical date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T00:30:00Z'));
    const { calls, request } = createApp();
    expect((await request('today?date=2026-10-27')).status).toBe(200);
    expect((await request('team?date=2026-10-27')).status).toBe(200);
    const personal = calls.find(({ sql }) => sql.includes('FROM frms_readiness_assessment'));
    const team = calls.find(({ sql }) => sql.includes('FROM frms_fadiga_checkin ch'));
    expect(personal?.binds).toContain('2026-10-27');
    expect(team?.binds).toContain('2026-10-27');
  });
});
