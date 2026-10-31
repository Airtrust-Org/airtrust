import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '@/react-app/config/api';
import { useScormPackageVersions } from '@/react-app/hooks/useLms';
import { server } from '@/test/mocks/server';

const FAKE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjo5OTk5OTk5OTk5OTl9.fakesig';

function withClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

describe('useScormPackageVersions — Worker response envelope', () => {
  beforeEach(() => {
    localStorage.setItem('airtrust_token', FAKE_JWT);
  });

  it('renders the real D1-backed VALIDATED candidate from the API data array', async () => {
    const candidate = {
      packageId: 'pkg-candidate', packageSha256: 'a'.repeat(64),
      status: 'VALIDATED', certificationProfile: 'FORMATIVE_NO_EXAM_V1',
      assessmentPolicy: 'FORMATIVE',
    };
    server.use(
      http.get(`${API_BASE_URL}/lms/cursos/26/scorm-package-versions`, () =>
        HttpResponse.json({ success: true, data: [candidate] })),
    );

    const { result } = renderHook(() => useScormPackageVersions(26), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([candidate]);
    expect(Array.isArray(result.current.data)).toBe(true);
  });

  it('distinguishes a genuinely empty list from a failed request', async () => {
    server.use(
      http.get(`${API_BASE_URL}/lms/cursos/26/scorm-package-versions`, () =>
        HttpResponse.json({ success: true, data: [] })),
    );
    const { result } = renderHook(() => useScormPackageVersions(26), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('does not translate authorization or server failures into an empty list', async () => {
    server.use(
      http.get(`${API_BASE_URL}/lms/cursos/26/scorm-package-versions`, () =>
        HttpResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })),
    );
    const { result } = renderHook(() => useScormPackageVersions(26), {
      wrapper: withClient(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
