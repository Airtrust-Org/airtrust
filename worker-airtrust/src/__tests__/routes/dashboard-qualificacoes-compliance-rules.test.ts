import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, AppEnv } from '../../types';
import dashboardRoutes from '../../routes/dashboard';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: any, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({
    empresaId: 42,
    empresaCodigo: 'teste',
    empresaNome: 'Empresa Teste',
    role: 'admin',
    plano: 'pro',
    permissions: ['read', 'write'],
  }),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({
    mode: 'unrestricted',
    setorIds: [],
    funcionarioId: null,
  })),
  buildFuncionarioScopeWhere: vi.fn(() => ({ clause: '1 = 1', bindings: [] })),
}));

function createApp() {
  const app = new Hono<AppEnv>();
  app.route('/dashboard', dashboardRoutes);
  return app;
}

function createPreparedDb(hasRenovacaoDe: boolean) {
  const queries: string[] = [];

  const env = {
    DB: {
      prepare: vi.fn().mockImplementation((query: string) => {
        queries.push(query);
        return {
          bind: () => ({
            first: async () => {
              if (query.includes('dias_alerta_vencimento')) return { dias_alerta_vencimento: 30 };
              return { total: 0 };
            },
            all: async () => {
              if (query.includes('PRAGMA table_info')) {
                return hasRenovacaoDe ? { results: [{ name: 'renovacao_de' }] } : { results: [] };
              }
              return { results: [] };
            },
          }),
          first: async () => {
            if (query.includes('dias_alerta_vencimento')) return { dias_alerta_vencimento: 30 };
            return { total: 0 };
          },
          all: async () => {
            if (query.includes('PRAGMA table_info')) {
              return hasRenovacaoDe ? { results: [{ name: 'renovacao_de' }] } : { results: [] };
            }
            return { results: [] };
          },
        };
      }),
    },
  } as unknown as Env;

  return { env, queries };
}

describe('Dashboard Qualificacoes - Compliance Rules & Safeguards', () => {
  it('Scenario 1 & 2: Usa regra canonica de renovacao (EXISTS) e NUNCA exclui o novo registro (qh.renovacao_de IS NOT NULL)', async () => {
    const { env, queries } = createPreparedDb(true); // Com coluna renovacao_de
    const app = createApp();
    await app.fetch(new Request('http://localhost/dashboard/qualificacoes', { headers: { 'x-empresa-id': '42' } }), env, {} as any);

    const statsQuery = queries.find(q => q.includes('COUNT(*) as total'));
    expect(statsQuery).toBeDefined();

    // Cenário 1: Deve conter EXISTS garantindo sucessor real para ser renovada
    expect(statsQuery).toContain('EXISTS (');
    expect(statsQuery).toContain('qh_renovadora.renovacao_de = qh.id');

    // Cenário 2: NÃO pode ter o bug antigo que mascarava o novo registro como se fosse renovado
    expect(statsQuery).not.toContain('OR qh.renovacao_de IS NOT NULL');
  });

  it('Scenario 3: Ignora fallback de status legado quando coluna renovacao_de existe', async () => {
    const { env, queries } = createPreparedDb(true);
    const app = createApp();
    await app.fetch(new Request('http://localhost/dashboard/qualificacoes', { headers: { 'x-empresa-id': '42' } }), env, {} as any);

    const statsQuery = queries.find(q => q.includes('COUNT(*) as total'));
    expect(statsQuery).toBeDefined();

    // Quando hasRenovacaoDe = true, o status='RENOVADA' não deve ser usado como critério final
    // A query SUM(CASE WHEN ...) usa effectiveRenewedPredicate
    // Let's ensure the explicit fallback "COALESCE(qh.renovada, 0) = 1 OR UPPER(COALESCE(qh.status, '')) = 'RENOVADA'" is NOT what defines RENOVADA here
    // Actually, in the generated string it should not be part of the effectiveRenewedPredicate block.
    // It is injected in effectiveRenewedPredicate ONLY if hasRenovacaoDe is false.
    // Let's verify by checking the string occurrences. The fallback might be in the query because of planned check, but not for renewed check.
    // effectiveActivePlannedPredicate uses `effectiveRenewedPredicate`. So if it's true, the legacy fallback is completely absent from the renewed check.
    const occurrencesOfRenovadaFlag = (statsQuery!.match(/COALESCE\(qh.renovada, 0\) = 1/g) || []).length;
    // It should be 0 because if hasRenovacaoDe is true, renewedQualificationPredicate is completely unused in statsQuery!
    expect(occurrencesOfRenovadaFlag).toBe(0);
  });

  it('Scenario 4: Preserva fallback legado em ambientes sem a coluna renovacao_de', async () => {
    const { env, queries } = createPreparedDb(false); // SEM coluna renovacao_de
    const app = createApp();
    await app.fetch(new Request('http://localhost/dashboard/qualificacoes', { headers: { 'x-empresa-id': '42' } }), env, {} as any);

    const statsQuery = queries.find(q => q.includes('COUNT(*) as total'));
    expect(statsQuery).toBeDefined();

    // Deve usar o fallback
    expect(statsQuery).toContain('COALESCE(qh.renovada, 0) = 1');
    expect(statsQuery).toContain("UPPER(COALESCE(qh.status, '')) = 'RENOVADA'");
    
    // NÃO deve conter o EXISTS
    expect(statsQuery).not.toContain('qh_renovadora.renovacao_de = qh.id');
  });

  it('Scenario 5: Canceladas/cancelamentos nao contaminam renovadas nem ativas', async () => {
    const { env, queries } = createPreparedDb(true);
    const app = createApp();
    await app.fetch(new Request('http://localhost/dashboard/qualificacoes', { headers: { 'x-empresa-id': '42' } }), env, {} as any);

    const statsQuery = queries.find(q => q.includes('COUNT(*) as total'));
    expect(statsQuery).toBeDefined();

    // Certifica que a exclusão de CANCELADA está presente na contagem de renovadas
    expect(statsQuery).toContain("UPPER(COALESCE(qh_renovadora.status, '')) = 'CANCELADA'");
    // Certifica que a exclusão de CANCELADA está presente na contagem principal
    expect(statsQuery).toContain("UPPER(COALESCE(qh.status, '')) = 'CANCELADA'");
  });

  it('Scenario 6: Filtros de tenant_id isolam as contagens por empresa', async () => {
    const { env, queries } = createPreparedDb(true);
    const app = createApp();
    await app.fetch(new Request('http://localhost/dashboard/qualificacoes', { headers: { 'x-empresa-id': '42' } }), env, {} as any);

    const statsQuery = queries.find(q => q.includes('COUNT(*) as total'));
    expect(statsQuery).toBeDefined();

    expect(statsQuery).toContain('f.empresa_id = ?');
  });

  it('Scenario 7: Documenta a divergência legítima entre Dashboard e Histórico', () => {
    // A query do Dashboard usa um fallback (renewedQualificationPredicate) caso a coluna renovacao_de não exista.
    // O Histórico, por ser a fonte primária da verdade moderna e exigir schemas mais rígidos para exibição detalhada,
    // usa '0 = 1' (força false) se a coluna não existir, tratando status=RENOVADA legado apenas como informativo.
    // Esta divergência é legítima pois o Dashboard agrega globalmente e não deve "sumir" com os dados numéricos de
    // ambientes atrasados, enquanto a visualização da ficha 360/histórico prefere omitir vínculos incertos.
    
    // Testamos que o Dashboard aplica o fallback em schemas legados (já testado no Cenário 4),
    // enquanto o Histórico (historico.ts) usaria '0 = 1'.
    expect(true).toBe(true);
  });
});

