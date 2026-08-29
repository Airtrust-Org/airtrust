import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboard = readFileSync(
  'src/react-app/pages/simuladores/dashboard/SimuladoresDashboard.tsx',
  'utf8',
);
const service = readFileSync('src/react-app/services/relatoriosSimuladoresApi.ts', 'utf8');

describe('Simuladores dashboard auth/state contract', () => {
  it('uses the canonical session-aware token accessor instead of probing localStorage aliases', () => {
    expect(dashboard).toContain('ensureValidAccessToken');
    expect(service).toContain('ensureValidAccessToken');
    expect(dashboard).not.toContain('getAuthHeaders');
    expect(service).not.toContain("localStorage.getItem(k)");
  });

  it('does not expose backend error messages or render empty tables during initial loading', () => {
    expect(dashboard).toContain(
      'Não foi possível carregar os dados de simuladores. Tente novamente em instantes.',
    );
    expect(dashboard).toContain('const initialLoading = loading && !uso && !erro');
    expect(dashboard).toContain('Carregando indicadores de simuladores');
    expect(dashboard).not.toContain('setErro(e instanceof Error ? e.message');
  });

  it('uses responsive table containers for the dense report surfaces', () => {
    expect(dashboard).toContain('overflow-x-auto');
    expect(dashboard).toContain('min-w-[760px]');
    expect(dashboard).toContain('col-span-12 overflow-hidden rounded border bg-white xl:col-span-6');
  });
});
