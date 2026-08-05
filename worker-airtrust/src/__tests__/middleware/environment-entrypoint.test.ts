import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const fetchMock = vi.fn(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': request.headers.get('Origin') ?? '',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  }
  return new Response('ok', { status: 200 });
});
const scheduledMock = vi.fn(async () => undefined);

vi.mock('../../index', () => ({
  default: {
    fetch: fetchMock,
    scheduled: scheduledMock,
  },
}));

import environmentEntrypoint from '../../environment-entrypoint';

const PROD_ORIGINS =
  'https://airtrust.online,https://www.airtrust.online,https://airtrust.pages.dev,https://production.airtrust.pages.dev';
const STAGING_ORIGINS =
  'https://staging.airtrust.pages.dev,https://feature-123.airtrust.pages.dev';

function env(corsOrigins: string, environment: Env['ENVIRONMENT']): Env {
  return {
    CORS_ORIGINS: corsOrigins,
    ENVIRONMENT: environment,
  } as Env;
}

function request(origin?: string, method = 'GET'): Request {
  return new Request('https://api.example.test/api/health', {
    method,
    headers: origin ? { Origin: origin } : undefined,
  });
}

describe('environment entrypoint origin isolation', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    scheduledMock.mockClear();
  });

  it.each([
    'https://airtrust.online',
    'https://www.airtrust.online',
    'https://airtrust.pages.dev',
    'https://production.airtrust.pages.dev',
  ])('delegates an approved production origin: %s', async (origin) => {
    const response = await environmentEntrypoint.fetch(
      request(origin),
      env(PROD_ORIGINS, 'production'),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects staging, main, arbitrary preview, lookalike and null origins in production', async () => {
    for (const origin of [
      'https://staging.airtrust.pages.dev',
      'https://main.airtrust.pages.dev',
      'https://feature-123.airtrust.pages.dev',
      'https://airtrust.pages.dev.evil.example',
      'null',
    ]) {
      const response = await environmentEntrypoint.fetch(
        request(origin),
        env(PROD_ORIGINS, 'production'),
        {} as ExecutionContext,
      );

      expect(response.status).toBe(403);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows a configured staging preview but rejects main and an arbitrary preview', async () => {
    const allowed = await environmentEntrypoint.fetch(
      request('https://feature-123.airtrust.pages.dev'),
      env(STAGING_ORIGINS, 'staging'),
      {} as ExecutionContext,
    );
    expect(allowed.status).toBe(200);

    for (const origin of [
      'https://main.airtrust.pages.dev',
      'https://other-preview.airtrust.pages.dev',
    ]) {
      const denied = await environmentEntrypoint.fetch(
        request(origin),
        env(STAGING_ORIGINS, 'staging'),
        {} as ExecutionContext,
      );
      expect(denied.status).toBe(403);
    }
  });

  it('rejects a disallowed preflight before Hono and preserves allowed credentialed preflight', async () => {
    const denied = await environmentEntrypoint.fetch(
      request('https://unreviewed.airtrust.pages.dev', 'OPTIONS'),
      env(PROD_ORIGINS, 'production'),
      {} as ExecutionContext,
    );
    expect(denied.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();

    const allowed = await environmentEntrypoint.fetch(
      request('https://airtrust.online', 'OPTIONS'),
      env(PROD_ORIGINS, 'production'),
      {} as ExecutionContext,
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://airtrust.online');
    expect(allowed.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('allows requests without Origin for same-origin and server-to-server clients', async () => {
    const response = await environmentEntrypoint.fetch(
      request(),
      env(PROD_ORIGINS, 'production'),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('delegates scheduled execution unchanged', async () => {
    await environmentEntrypoint.scheduled(
      {} as ScheduledEvent,
      env(PROD_ORIGINS, 'production'),
      {} as ExecutionContext,
    );

    expect(scheduledMock).toHaveBeenCalledOnce();
  });
});
