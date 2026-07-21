import { describe, expect, it } from 'vitest';
import {
  GUIAS_INSTRUTOR_CAPABILITIES,
  hasGuiaInstrutorCapability,
} from '../../middleware/guias-instrutor-permissions';

// Cobre a lógica real de `hasGuiaInstrutorCapability` (o teste de rota
// `simuladores-guias-instrutor.test.ts` faz `vi.mock` deste módulo
// inteiro, então não exercita esta lógica — este arquivo é a única
// cobertura real de DENY > GRANT > default de role > platform admin).
//
// Achado corrigido aqui: a versão anterior comparava a role crua de
// `usuarios_empresas.role` contra um Set de strings em português maiúsculo
// ('INSTRUTOR', 'GESTOR', 'SUPER_ADMIN') que nunca existem no vocabulário
// canônico do sistema (`normalizeTenantRole` em middleware/tenant.ts usa
// 'instructor'/'manager'/'admin' minúsculo) — instrutores reais (role
// 'instructor') nunca teriam passado no gate de leitura.

type Vinculo = { usuario_id: number; empresa_id: number; role: string; ativo: number };
type Permissao = { usuario_id: number; permissao: string; tipo: 'GRANT' | 'DENY' };

function buildFakeDb(vinculos: Vinculo[], permissoes: Permissao[]) {
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind: (...args: unknown[]) => {
          binds = args;
          return stmt;
        },
        first: async <T = unknown>() => {
          if (sql.includes('FROM usuarios_empresas')) {
            const [usuarioId, empresaId] = binds as [number, number];
            const row = vinculos.find(
              (v) => v.usuario_id === usuarioId && v.empresa_id === empresaId && v.ativo === 1,
            );
            return (row ? { role: row.role } : null) as T | null;
          }
          return null;
        },
        all: async <T = unknown>() => {
          if (sql.includes('FROM usuario_permissoes')) {
            const [usuarioId, permissao] = binds as [number, string];
            const results = permissoes.filter(
              (p) => p.usuario_id === usuarioId && p.permissao === permissao,
            );
            return { results: results as unknown as T[] };
          }
          return { results: [] as T[] };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

function buildFakeContext(params: {
  db: D1Database;
  userId: number | null;
  empresaId: number;
  isPlatformAdmin?: boolean;
  devBypass?: boolean;
}) {
  const store = new Map<string, unknown>();
  store.set('userId', params.userId);
  if (params.isPlatformAdmin) store.set('platformAccessState', 'GRANTED');
  return {
    env: {
      DB: params.db,
      ENVIRONMENT: params.devBypass ? 'development' : 'production',
      ENABLE_DEV_AUTH_BYPASS: params.devBypass ? 'true' : 'false',
    },
    get: (key: string) => store.get(key),
    // getTenantContext (real, não mockado) lê de c.get('tenantContext') ou
    // monta a partir de empresaId/userRole — simplificamos fixando aqui.
  } as any;
}

describe('hasGuiaInstrutorCapability — visualizar', () => {
  it('instructor tem default de leitura', async () => {
    const db = buildFakeDb([{ usuario_id: 10, empresa_id: 1, role: 'instructor', ativo: 1 }], []);
    const c = buildFakeContext({ db, userId: 10, empresaId: 1 });
    c.get = (key: string) =>
      key === 'userId' ? 10 : key === 'tenantContext' ? { empresaId: 1 } : undefined;
    const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.visualizar);
    expect(allowed).toBe(true);
  });

  it('manager e admin também têm default de leitura (hierarquia acima de instructor)', async () => {
    for (const role of ['manager', 'admin']) {
      const db = buildFakeDb([{ usuario_id: 10, empresa_id: 1, role, ativo: 1 }], []);
      const c = buildFakeContext({ db, userId: 10, empresaId: 1 });
      c.get = (key: string) =>
        key === 'userId' ? 10 : key === 'tenantContext' ? { empresaId: 1 } : undefined;
      const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.visualizar);
      expect(allowed).toBe(true);
    }
  });

  it('editor/student/viewer NÃO têm default de leitura', async () => {
    for (const role of ['editor', 'student', 'viewer']) {
      const db = buildFakeDb([{ usuario_id: 10, empresa_id: 1, role, ativo: 1 }], []);
      const c = buildFakeContext({ db, userId: 10, empresaId: 1 });
      c.get = (key: string) =>
        key === 'userId' ? 10 : key === 'tenantContext' ? { empresaId: 1 } : undefined;
      const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.visualizar);
      expect(allowed).toBe(false);
    }
  });

  it('student com GRANT explícito de visualizar consegue ler', async () => {
    const db = buildFakeDb(
      [{ usuario_id: 10, empresa_id: 1, role: 'student', ativo: 1 }],
      [{ usuario_id: 10, permissao: GUIAS_INSTRUTOR_CAPABILITIES.visualizar, tipo: 'GRANT' }],
    );
    const c = buildFakeContext({ db, userId: 10, empresaId: 1 });
    c.get = (key: string) =>
      key === 'userId' ? 10 : key === 'tenantContext' ? { empresaId: 1 } : undefined;
    const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.visualizar);
    expect(allowed).toBe(true);
  });

  it('DENY explícito bloqueia instructor mesmo com default de leitura', async () => {
    const db = buildFakeDb(
      [{ usuario_id: 10, empresa_id: 1, role: 'instructor', ativo: 1 }],
      [{ usuario_id: 10, permissao: GUIAS_INSTRUTOR_CAPABILITIES.visualizar, tipo: 'DENY' }],
    );
    const c = buildFakeContext({ db, userId: 10, empresaId: 1 });
    c.get = (key: string) =>
      key === 'userId' ? 10 : key === 'tenantContext' ? { empresaId: 1 } : undefined;
    const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.visualizar);
    expect(allowed).toBe(false);
  });

  it('DENY prevalece mesmo com GRANT simultâneo (defesa em profundidade)', async () => {
    const db = buildFakeDb(
      [{ usuario_id: 10, empresa_id: 1, role: 'instructor', ativo: 1 }],
      [
        { usuario_id: 10, permissao: GUIAS_INSTRUTOR_CAPABILITIES.visualizar, tipo: 'DENY' },
        { usuario_id: 10, permissao: GUIAS_INSTRUTOR_CAPABILITIES.visualizar, tipo: 'GRANT' },
      ],
    );
    const c = buildFakeContext({ db, userId: 10, empresaId: 1 });
    c.get = (key: string) =>
      key === 'userId' ? 10 : key === 'tenantContext' ? { empresaId: 1 } : undefined;
    const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.visualizar);
    expect(allowed).toBe(false);
  });

  it('platform admin lê mesmo sem vínculo na empresa', async () => {
    const db = buildFakeDb([], []);
    const c = buildFakeContext({ db, userId: 99, empresaId: 1, isPlatformAdmin: true });
    c.get = (key: string) => {
      if (key === 'userId') return 99;
      if (key === 'tenantContext') return { empresaId: 1 };
      if (key === 'platformAccessState') return { userId: 99, isLegacyPlatformAdmin: false, hasPersistedPlatformAdmin: true, hasSupportReadOnlyRole: false, hasSupportElevatedRole: false, supportGrants: [], source: 'persisted' };
      return undefined;
    };
    const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.visualizar);
    expect(allowed).toBe(true);
  });
});

describe('hasGuiaInstrutorCapability — gerenciar', () => {
  it('manager NÃO tem default de gerenciamento (decisão de produto explícita)', async () => {
    const db = buildFakeDb([{ usuario_id: 10, empresa_id: 1, role: 'manager', ativo: 1 }], []);
    const c = buildFakeContext({ db, userId: 10, empresaId: 1 });
    c.get = (key: string) =>
      key === 'userId' ? 10 : key === 'tenantContext' ? { empresaId: 1 } : undefined;
    const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.gerenciar);
    expect(allowed).toBe(false);
  });

  it('admin (tenant, não platform) também NÃO tem default de gerenciamento', async () => {
    const db = buildFakeDb([{ usuario_id: 10, empresa_id: 1, role: 'admin', ativo: 1 }], []);
    const c = buildFakeContext({ db, userId: 10, empresaId: 1 });
    c.get = (key: string) =>
      key === 'userId' ? 10 : key === 'tenantContext' ? { empresaId: 1 } : undefined;
    const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.gerenciar);
    expect(allowed).toBe(false);
  });

  it('manager com GRANT explícito de gerenciar consegue gerenciar', async () => {
    const db = buildFakeDb(
      [{ usuario_id: 10, empresa_id: 1, role: 'manager', ativo: 1 }],
      [{ usuario_id: 10, permissao: GUIAS_INSTRUTOR_CAPABILITIES.gerenciar, tipo: 'GRANT' }],
    );
    const c = buildFakeContext({ db, userId: 10, empresaId: 1 });
    c.get = (key: string) =>
      key === 'userId' ? 10 : key === 'tenantContext' ? { empresaId: 1 } : undefined;
    const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.gerenciar);
    expect(allowed).toBe(true);
  });

  it('platform admin gerencia sem GRANT explícito', async () => {
    const db = buildFakeDb([], []);
    const c = buildFakeContext({ db, userId: 99, empresaId: 1, isPlatformAdmin: true });
    c.get = (key: string) => {
      if (key === 'userId') return 99;
      if (key === 'tenantContext') return { empresaId: 1 };
      if (key === 'platformAccessState') return { userId: 99, isLegacyPlatformAdmin: false, hasPersistedPlatformAdmin: true, hasSupportReadOnlyRole: false, hasSupportElevatedRole: false, supportGrants: [], source: 'persisted' };
      return undefined;
    };
    const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.gerenciar);
    expect(allowed).toBe(true);
  });

  it('DENY explícito bloqueia até platform admin', async () => {
    const db = buildFakeDb(
      [],
      [{ usuario_id: 99, permissao: GUIAS_INSTRUTOR_CAPABILITIES.gerenciar, tipo: 'DENY' }],
    );
    const c = buildFakeContext({ db, userId: 99, empresaId: 1, isPlatformAdmin: true });
    c.get = (key: string) => {
      if (key === 'userId') return 99;
      if (key === 'tenantContext') return { empresaId: 1 };
      if (key === 'platformAccessState') return { userId: 99, isLegacyPlatformAdmin: false, hasPersistedPlatformAdmin: true, hasSupportReadOnlyRole: false, hasSupportElevatedRole: false, supportGrants: [], source: 'persisted' };
      return undefined;
    };
    const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.gerenciar);
    expect(allowed).toBe(false);
  });
});

describe('hasGuiaInstrutorCapability — multi-tenant', () => {
  it('vínculo ativo em outra empresa não concede acesso na empresa atual', async () => {
    const db = buildFakeDb([{ usuario_id: 10, empresa_id: 2, role: 'admin', ativo: 1 }], []);
    const c = buildFakeContext({ db, userId: 10, empresaId: 1 });
    c.get = (key: string) =>
      key === 'userId' ? 10 : key === 'tenantContext' ? { empresaId: 1 } : undefined;
    const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.visualizar);
    expect(allowed).toBe(false);
  });

  it('vínculo inativo (ativo=0) não concede acesso', async () => {
    const db = buildFakeDb([{ usuario_id: 10, empresa_id: 1, role: 'instructor', ativo: 0 }], []);
    const c = buildFakeContext({ db, userId: 10, empresaId: 1 });
    c.get = (key: string) =>
      key === 'userId' ? 10 : key === 'tenantContext' ? { empresaId: 1 } : undefined;
    const allowed = await hasGuiaInstrutorCapability(c, GUIAS_INSTRUTOR_CAPABILITIES.visualizar);
    expect(allowed).toBe(false);
  });
});
