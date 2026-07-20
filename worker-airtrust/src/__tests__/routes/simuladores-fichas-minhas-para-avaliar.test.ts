import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const getEmployeeSectorAccessMock = vi.hoisted(() => vi.fn());

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const empresaId = Number(c.env?.__mockEmpresaId ?? 6);
    c.set('userId', Number(c.env?.__mockUserId ?? 101));
    c.set('userRole', String(c.env?.__mockRole || 'instrutor'));
    c.set('empresaId', empresaId);
    await next();
  },
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: (...args: unknown[]) => getEmployeeSectorAccessMock(...args),
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
}));

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual('../../routes/simuladores-shared');
  return {
    ...actual,
    audit: vi.fn(async () => undefined),
  };
});

vi.mock('../../shared/handlers/horasVooFromSimulador.handler', () => ({
  syncHorasVooFromSimulador: vi.fn(async () => undefined),
}));

vi.mock('../../lib/fichaEmails', () => ({
  enviarEmailFichaSessao: vi.fn(async () => undefined),
}));

vi.mock('../../routes/simuladores-fichas-helpers', () => ({
  gerarQualificacaoDaFicha: vi.fn(),
  getQualificacaoGeracaoErrorStatus: vi.fn(),
  marcarNotificacoesFichaComoResolvidas: vi.fn(),
  listarManobrasPendentes: vi.fn(async () => []),
}));

import simuladoresFichasRoutes from '../../routes/simuladores-fichas';

type FichaRow = {
  id: number;
  empresa_id: number;
  colaborador_id_aluno: number;
  instrutor_id: number;
};

/**
 * Cenário sintético do teste de identidade (mission spec):
 * - funcionario_id=20 é INSTRUTOR global, mas também participa como ALUNO
 *   na ficha A.
 * - Ficha A: 20=aluno, instrutor=30
 * - Ficha B: 20=instrutor, aluno=10
 * - Ficha C: 20 não está envolvido
 * - Ficha D: outro tenant (empresa 7)
 */
const FICHAS: FichaRow[] = [
  { id: 1, empresa_id: 6, colaborador_id_aluno: 20, instrutor_id: 30 }, // A
  { id: 2, empresa_id: 6, colaborador_id_aluno: 10, instrutor_id: 20 }, // B
  { id: 3, empresa_id: 6, colaborador_id_aluno: 99, instrutor_id: 98 }, // C
  { id: 4, empresa_id: 7, colaborador_id_aluno: 20, instrutor_id: 30 }, // D — outro tenant
];

/** userId -> funcionario_id (vínculo funcional). null = sem vínculo. */
const USER_TO_FUNCIONARIO = new Map<number, number | null>([
  [101, 20], // instrutor-que-também-é-aluno
  [102, 10], // aluno puro
  [103, 30], // outro instrutor
  [104, null], // usuário sem vínculo (admin/gestor incluso)
  [105, 10], // aluno com GRANT individual de simuladores.evaluate
  [106, 20], // instrutor com DENY individual de simuladores.evaluate
]);

/**
 * userId -> override individual de 'simuladores.evaluate' na tabela
 * usuario_permissoes (mesmo mecanismo usado no login, ver auth.ts).
 * Ausente = sem override (cai no default de role).
 */
const PERMISSION_OVERRIDES = new Map<number, 'GRANT' | 'DENY'>([
  [105, 'GRANT'], // aluno explicitamente autorizado a avaliar
  [106, 'DENY'], // instrutor explicitamente proibido de avaliar
]);

function createDb() {
  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('SELECT f.id FROM usuarios u') && query.includes('JOIN funcionarios f')) {
            const userId = Number(args[0]);
            const funcId = USER_TO_FUNCIONARIO.get(userId);
            return funcId != null ? { id: funcId } : null;
          }
          return null;
        },
        all: async () => {
          if (query.includes('FROM usuario_permissoes')) {
            const userId = Number(args[0]);
            const permissao = String(args[1]);
            if (permissao !== 'simuladores.evaluate') return { results: [] };
            const tipo = PERMISSION_OVERRIDES.get(userId);
            return { results: tipo ? [{ tipo }] : [] };
          }
          if (query.includes('FROM fichas_sessao f') && query.includes('ORDER BY f.created_at DESC')) {
            const tenantEmpresaId = Number(args[0]);
            const isMinhas = query.includes('AND f.colaborador_id_aluno = ?');
            const isParaAvaliar = query.includes('AND f.instrutor_id = ?');
            const funcId = Number(args[args.length - 1]);

            const results = FICHAS.filter((ficha) => {
              if (ficha.empresa_id !== tenantEmpresaId) return false;
              if (isMinhas) return ficha.colaborador_id_aluno === funcId;
              if (isParaAvaliar) return ficha.instrutor_id === funcId;
              return true;
            }).map((ficha) => ({
              ...ficha,
              participante_nome: `Aluno ${ficha.colaborador_id_aluno}`,
              instrutor_nome: `Instrutor ${ficha.instrutor_id}`,
            }));

            return { results };
          }
          return { results: [] };
        },
        run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
      });

      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    }),
  } as unknown as D1Database;

  return db;
}

function callMinhas(env: Partial<Env> & Record<string, unknown>) {
  return simuladoresFichasRoutes.fetch(
    new Request('http://localhost/fichas/minhas'),
    { DB: createDb(), ...env } as unknown as Env,
    {} as ExecutionContext,
  );
}

function callParaAvaliar(env: Partial<Env> & Record<string, unknown>) {
  return simuladoresFichasRoutes.fetch(
    new Request('http://localhost/fichas/para-avaliar'),
    { DB: createDb(), ...env } as unknown as Env,
    {} as ExecutionContext,
  );
}

function callLegacyFichas(env: Partial<Env> & Record<string, unknown>) {
  return simuladoresFichasRoutes.fetch(
    new Request('http://localhost/fichas'),
    { DB: createDb(), ...env } as unknown as Env,
    {} as ExecutionContext,
  );
}

describe('GET /fichas/minhas — identidade de participante', () => {
  it('instrutor que também é aluno vê apenas a ficha onde é o aluno (ficha A)', async () => {
    const resp = await callMinhas({ __mockEmpresaId: 6, __mockUserId: 101, __mockRole: 'instrutor' });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { success: boolean; data: Array<{ id: number }> };
    expect(body.success).toBe(true);
    expect(body.data.map((f) => f.id)).toEqual([1]);
  });

  it('aluno puro vê apenas sua própria ficha (ficha B)', async () => {
    const resp = await callMinhas({ __mockEmpresaId: 6, __mockUserId: 102, __mockRole: 'aluno' });
    const body = (await resp.json()) as { success: boolean; data: Array<{ id: number }> };
    expect(body.data.map((f) => f.id)).toEqual([2]);
  });

  it('outro instrutor não vê fichas alheias (nenhuma ficha como aluno)', async () => {
    const resp = await callMinhas({ __mockEmpresaId: 6, __mockUserId: 103, __mockRole: 'instrutor' });
    const body = (await resp.json()) as { success: boolean; data: Array<{ id: number }> };
    expect(body.data).toEqual([]);
  });

  it('usuário sem funcionario_id recebe lista vazia (fail-closed), sem erro 500', async () => {
    const resp = await callMinhas({ __mockEmpresaId: 6, __mockUserId: 104, __mockRole: 'admin' });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('não vaza fichas de outro tenant mesmo com mesmo funcionario_id', async () => {
    // userId 101 -> funcionario 20, mas empresa ativa é 7 (ficha D também tem colaborador 20)
    const resp = await callMinhas({ __mockEmpresaId: 7, __mockUserId: 101, __mockRole: 'instrutor' });
    const body = (await resp.json()) as { success: boolean; data: Array<{ id: number }> };
    expect(body.data.map((f) => f.id)).toEqual([4]);
    expect(body.data.every((f) => f.id !== 1)).toBe(true);
  });
});

describe('GET /fichas/para-avaliar — capability precondition (simuladores.evaluate)', () => {
  it('aluno (sem capability) recebe 403 INSTRUCTOR_EVALUATION_FORBIDDEN — nunca 200 com lista vazia', async () => {
    const resp = await callParaAvaliar({ __mockEmpresaId: 6, __mockUserId: 102, __mockRole: 'aluno' });
    expect(resp.status).toBe(403);
    const body = (await resp.json()) as { success: boolean; code: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe('INSTRUCTOR_EVALUATION_FORBIDDEN');
  });

  it('admin/gestor sem override de capability recebe 403 (sem fallback global de role)', async () => {
    const resp = await callParaAvaliar({ __mockEmpresaId: 6, __mockUserId: 104, __mockRole: 'admin' });
    expect(resp.status).toBe(403);
    const body = (await resp.json()) as { success: boolean; code: string };
    expect(body.code).toBe('INSTRUCTOR_EVALUATION_FORBIDDEN');
  });

  it('instrutor com DENY individual explícito recebe 403, mesmo tendo instrutor_id em uma ficha real', async () => {
    // userId 106 -> funcionario 20 (instrutor da ficha B), mas tem DENY explícito
    const resp = await callParaAvaliar({ __mockEmpresaId: 6, __mockUserId: 106, __mockRole: 'instrutor' });
    expect(resp.status).toBe(403);
    const body = (await resp.json()) as { success: boolean; code: string };
    expect(body.code).toBe('INSTRUCTOR_EVALUATION_FORBIDDEN');
  });

  it('aluno com GRANT individual de simuladores.evaluate passa a capability, mas ainda filtra por instrutor_id (sem fichas atribuídas → lista vazia, não 403)', async () => {
    // userId 105 -> funcionario 10 (aluno da ficha B, nunca instrutor de nada)
    const resp = await callParaAvaliar({ __mockEmpresaId: 6, __mockUserId: 105, __mockRole: 'aluno' });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

describe('GET /fichas/para-avaliar — identidade de instrutor atribuído (com capability)', () => {
  it('instrutor que também é aluno vê apenas a ficha onde é o instrutor (ficha B), nunca a A', async () => {
    const resp = await callParaAvaliar({ __mockEmpresaId: 6, __mockUserId: 101, __mockRole: 'instrutor' });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { success: boolean; data: Array<{ id: number }> };
    expect(body.data.map((f) => f.id)).toEqual([2]);
  });

  it('instrutor vê apenas as fichas onde ele é o instrutor atribuído (ficha A), nunca as de outro instrutor', async () => {
    const resp = await callParaAvaliar({ __mockEmpresaId: 6, __mockUserId: 103, __mockRole: 'instrutor' });
    const body = (await resp.json()) as { success: boolean; data: Array<{ id: number }> };
    expect(body.data.map((f) => f.id)).toEqual([1]);
  });

  it('instrutor sem nenhuma ficha atribuída (mas com capability) recebe lista vazia, não 403', async () => {
    // userId 103 -> funcionario 30, sem fichas no tenant 7 (só tem a D lá, mas tenant ativo é 6)
    const resp = await callParaAvaliar({ __mockEmpresaId: 7, __mockUserId: 999, __mockRole: 'instrutor' });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('não vaza fichas de outro tenant', async () => {
    const resp = await callParaAvaliar({ __mockEmpresaId: 6, __mockUserId: 103, __mockRole: 'instrutor' });
    const body = (await resp.json()) as { success: boolean; data: Array<{ id: number }> };
    // Instrutor 30 (userId 103) atua na ficha D, mas essa é do tenant 7 — não deve aparecer no tenant 6
    expect(body.data.every((f) => f.id !== 4)).toBe(true);
  });
});

describe('GET /fichas — endpoint legado (fechamento para não-administrativos)', () => {
  it('instrutor não-admin recebe 403 LEGACY_FICHAS_LIST_FORBIDDEN, nunca a lista mesclada instrutor_id OR colaborador_id_aluno', async () => {
    const resp = await callLegacyFichas({ __mockEmpresaId: 6, __mockUserId: 101, __mockRole: 'instrutor' });
    expect(resp.status).toBe(403);
    const body = (await resp.json()) as { success: boolean; code: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe('LEGACY_FICHAS_LIST_FORBIDDEN');
  });

  it('aluno não-admin recebe 403 no endpoint legado', async () => {
    const resp = await callLegacyFichas({ __mockEmpresaId: 6, __mockUserId: 102, __mockRole: 'aluno' });
    expect(resp.status).toBe(403);
    const body = (await resp.json()) as { success: boolean; code: string };
    expect(body.code).toBe('LEGACY_FICHAS_LIST_FORBIDDEN');
  });

  it('admin/gestor (escopo administrativo formal) continua funcionando — único consumidor legítimo restante', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'all', setorIds: [], funcionarioId: null });
    const resp = await callLegacyFichas({ __mockEmpresaId: 6, __mockUserId: 104, __mockRole: 'admin' });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('gestor (escopo administrativo formal) continua funcionando', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'all', setorIds: [], funcionarioId: null });
    const resp = await callLegacyFichas({ __mockEmpresaId: 6, __mockUserId: 104, __mockRole: 'gestor' });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });
});
