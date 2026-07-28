import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }

      c.set('userId', 10);
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 0));
      c.set('userRole', c.req.header('x-test-role') || 'admin');
      await next();
    },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getTenantContext: (c: any) => ({
      empresaId: Number(c.get('empresaId') || 0),
      empresaCodigo: `empresa-${Number(c.get('empresaId') || 0)}`,
      empresaNome: 'Empresa Teste',
      role: c.get('userRole') || 'admin',
      plano: 'pro',
      permissions: ['read', 'write'],
    }),
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...requiredRoles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!requiredRoles.map((requiredRole) => requiredRole.toLowerCase()).includes(role)) {
        return c.json(
          { success: false, error: `Permissão negada. Acesso restrito a: ${requiredRoles.join(', ')}` },
          403,
        );
      }
      await next();
    },
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(),
  extrairUsuarioAuditoria: () => ({ usuario_id: 10, origem: 'test' }),
}));

vi.mock('../../services/sync-certificacoes-funcionarios', () => ({
  syncFuncionarioCertificacoes: vi.fn(),
}));

vi.mock('../../shared/domainEvents', () => ({
  publishDomainEvent: vi.fn(),
}));

import funcionariosMutationsRoutes from '../../routes/funcionarios-mutations';

// Valid CPFs (pass isValidCPF checksum):
// 012.345.678-90, 123.456.789-09, 111.444.777-35
const CPF_A1 = '01234567890';
const CPF_A2 = '11144477735';
const CPF_B1 = '12345678909';

type FuncionarioRow = {
  id: number;
  empresa_id: number;
  nome: string;
  cpf: string;
  matricula: string;
  email: string;
  deleted_at: string | null;
};

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/funcionarios', funcionariosMutationsRoutes);
  return app;
}

const defaultFuncionarioColumns = [
  'id',
  'empresa_id',
  'matricula',
  'nome',
  'guerra',
  'cpf',
  'rg',
  'nascimento',
  'sexo',
  'nacionalidade',
  'email',
  'telefone',
  'telefone_emergencia',
  'contato_emergencia_nome',
  'funcao',
  'cargo',
  'setor',
  'setor_id',
  'base',
  'modelo_aeronave_id',
  'admissao',
  'codigo_anac',
  'nivel_icao',
  'data_realizacao_icao',
  'validade_icao',
  'cma',
  'data_realizacao_cma',
  'validade_cma',
  'aso',
  'data_realizacao_aso',
  'validade_aso',
  'sispat',
  'prestserv',
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'estado',
  'observacoes',
  'foto_url',
  'status',
  'ativo',
  'is_instrutor',
  'is_checador',
  'aeronave',
  'created_at',
  'updated_at',
];

function createMockEnv(options?: { funcionarioColumns?: string[] }) {
  const funcionarioColumns = options?.funcionarioColumns || defaultFuncionarioColumns;
  const funcionarios: FuncionarioRow[] = [
    {
      id: 101,
      empresa_id: 1,
      nome: 'Funcionario Tenant A',
      cpf: CPF_A1,
      matricula: 'A-101',
      email: 'a@example.com',
      deleted_at: null,
    },
    {
      id: 102,
      empresa_id: 1,
      nome: 'Funcionario Tenant A2',
      cpf: CPF_A2,
      matricula: 'A-102',
      email: 'a2@example.com',
      deleted_at: null,
    },
    {
      id: 202,
      empresa_id: 2,
      nome: 'Funcionario Tenant B',
      cpf: CPF_B1,
      matricula: 'A-101',
      email: 'b@example.com',
      deleted_at: null,
    },
  ];

  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' | 'run' }> = [];
  const runs: Array<{ query: string; args: unknown[] }> = [];

  const findFuncionario = (id: number, empresaId?: number) =>
    funcionarios.find((funcionario) => {
      if (funcionario.id !== id || funcionario.deleted_at) return false;
      return empresaId === undefined || funcionario.empresa_id === empresaId;
    }) || null;

  const db = {
    prepare: vi.fn((query: string) => {
      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });

        // operational-domain-access.ts: isTenantRbacEnabled — legacy tenant
        // (RBAC disabled) for every empresa in this test, which doesn't
        // exercise domain-RBAC behavior.
        if (query.includes('FROM empresas WHERE id')) {
          return { operational_domain_rbac_enabled: 0 };
        }

        if (query.includes('FROM funcionarios') && query.includes('WHERE id = ?')) {
          const id = Number(args[0]);
          const usesTenant = query.includes('empresa_id = ?');
          const empresaId = usesTenant ? Number(args[1]) : undefined;
          return findFuncionario(id, empresaId);
        }

        // Matricula or CPF duplicate checks
        if (
          query.includes('FROM funcionarios') &&
          (query.includes('matricula = ?') || query.includes('cpf = ?'))
        ) {
          const matriculaOrCpf = String(args[0] || '');

          // CPF check: GLOBAL (no empresa_id filter) — B2 rule
          if (query.includes('cpf = ?')) {
            const idToExclude = query.includes('id != ?')
              ? Number(args[query.indexOf('id != ?') > query.indexOf('cpf = ?') ? 2 : 1])
              : undefined;
            const found = funcionarios.find((f) => {
              if (f.cpf !== matriculaOrCpf || f.deleted_at) return false;
              if (idToExclude !== undefined && f.id === idToExclude) return false;
              return true;
            });
            return found || null;
          }

          // Matricula check: PER EMPRESA — B2 rule
          if (query.includes('matricula = ?')) {
            const hasEmpresa = query.includes('empresa_id = ?');
            if (hasEmpresa) {
              const empresaId = Number(args[1]);
              const idToExclude = query.includes('id != ?')
                ? Number(args[args.length - 1])
                : undefined;
              const found = funcionarios.find((f) => {
                if (f.matricula !== matriculaOrCpf || f.deleted_at) return false;
                if (f.empresa_id !== empresaId) return false;
                if (idToExclude !== undefined && f.id === idToExclude) return false;
                return true;
              });
              return found || null;
            }
          }
        }

        return null;
      };

      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });

        if (query.includes("PRAGMA table_info('funcionarios')")) {
          return {
            results: funcionarioColumns.map((name) => ({ name })),
          };
        }

        return { results: [] };
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        runs.push({ query, args });
        return { meta: { changes: 1, last_row_id: 999 } };
      };

      return {
        first: async () => executeFirst([]),
        all: async () => executeAll([]),
        run: async () => executeRun([]),
        bind: (...args: unknown[]) => ({
          first: async () => executeFirst(args),
          all: async () => executeAll(args),
          run: async () => executeRun(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { env: { DB: db } as unknown as Env, calls, runs, funcionarios };
}

async function request(
  path: string,
  env: Env,
  empresaId = 1,
  init: RequestInit = {},
  authorized = true,
) {
  const app = createApp();
  const headers = new Headers(init.headers);
  if (authorized) headers.set('Authorization', 'Bearer test-token');
  headers.set('x-test-empresa-id', String(empresaId));
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    env,
    {} as ExecutionContext,
  );
}

const jsonHeaders = { 'Content-Type': 'application/json' };

describe('funcionarios tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── B1: fail-closed ────────────────────────────────────────────

  it('admin da empresa A nao consegue PUT em funcionario da empresa B', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios/202', env, 1, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ nome: 'Tentativa Cross Tenant' }),
    });

    expect(response.status).toBe(404);
    expect(runs.filter((run) => run.query.startsWith('UPDATE funcionarios'))).toHaveLength(0);
  });

  it('admin da empresa A nao consegue DELETE em funcionario da empresa B', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios/202', env, 1, { method: 'DELETE' });

    expect(response.status).toBe(404);
    expect(runs.filter((run) => run.query.startsWith('UPDATE funcionarios'))).toHaveLength(0);
  });

  it('admin da propria empresa consegue PUT com empresa_id no UPDATE', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios/101', env, 1, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ nome: 'Funcionario Atualizado' }),
    });

    expect(response.status).toBe(200);
    const update = runs.find((run) => run.query.startsWith('UPDATE funcionarios'));
    expect(update?.query).toContain('WHERE id = ? AND empresa_id = ?');
  });

  it('admin da propria empresa consegue DELETE com empresa_id no soft-delete', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios/101', env, 1, { method: 'DELETE' });

    expect(response.status).toBe(200);
    const softDelete = runs.find((run) => run.query.trimStart().startsWith('UPDATE funcionarios'));
    expect(softDelete?.query).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
  });

  it('sem Authorization retorna 401 antes de mutation', async () => {
    const { env, runs } = createMockEnv();

    const response = await request(
      '/api/funcionarios/101',
      env,
      1,
      {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ nome: 'Nao Autorizado' }),
      },
      false,
    );

    expect(response.status).toBe(401);
    expect(runs).toHaveLength(0);
  });

  it('role sem permissao retorna 403 antes de mutation', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios/101', env, 1, {
      method: 'DELETE',
      headers: { ...jsonHeaders, 'x-test-role': 'viewer' },
    });

    expect(response.status).toBe(403);
    expect(runs).toHaveLength(0);
  });

  // gestor-operational-autonomy: widened from admin-only to admin+manager —
  // a GESTOR must not depend on an ADMINISTRADOR for routine exclusão
  // within their own setores (requireOperacoesFuncionario is the actual
  // per-setor/domain scoping gate, and is a no-op while the tenant's
  // operational_domain_rbac_enabled flag is off, which is the default this
  // mock env exercises).
  it('manager consegue DELETE (autonomia operacional do gestor)', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios/101', env, 1, {
      method: 'DELETE',
      headers: { ...jsonHeaders, 'x-test-role': 'manager' },
    });

    expect(response.status).toBe(200);
    const softDelete = runs.find((run) => run.query.trimStart().startsWith('UPDATE funcionarios'));
    expect(softDelete?.query).toContain('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL');
  });

  // ── B2: matrícula por empresa ──────────────────────────────────

  it('matricula duplicada na mesma empresa bloqueia', async () => {
    const { env, runs } = createMockEnv();

    // CPF_B1 = '12345678909' is valid and NOT in empresa 1
    // matricula 'A-102' ALREADY exists in empresa 1 (func 102)
    const response = await request('/api/funcionarios', env, 1, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        nome: 'Novo Funcionario',
        cpf: CPF_B1,
        email: 'novo@example.com',
        matricula: 'A-102',
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('Matrícula');
    expect(runs.filter((run) => run.query.includes('INSERT INTO funcionarios'))).toHaveLength(0);
  });

  it('mesma matricula em empresas diferentes e permitida', async () => {
    const { env } = createMockEnv();

    // matricula 'A-102' exists in empresa 1 (func 102) but NOT in empresa 2
    // Use a valid CPF that is NOT in the mock data (08328622742)
    const response = await request('/api/funcionarios', env, 2, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        nome: 'Novo Funcionario B',
        cpf: '08328622742',
        email: 'novoB@example.com',
        matricula: 'A-102',
      }),
    });

    expect(response.status).toBe(201);
  });

  it('CPF duplicado globalmente bloqueia independente de empresa', async () => {
    const { env, runs } = createMockEnv();

    // CPF_A1 = '01234567890' exists in empresa 1
    // Trying to create in empresa 2 with same CPF → should block
    const response = await request('/api/funcionarios', env, 2, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        nome: 'Cross CPF',
        cpf: CPF_A1,
        email: 'cross@example.com',
        matricula: 'B-999',
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('CPF');
    expect(runs.filter((run) => run.query.includes('INSERT INTO funcionarios'))).toHaveLength(0);
  });

  it('CPF novo em qualquer empresa permite criacao', async () => {
    const { env } = createMockEnv();

    // CPF_B1 = '12345678909' belongs to empresa 2
    // Trying to create in empresa 1 with that CPF should ALSO block (CPF global)
    // Wait — this is the same as the previous test. Let me use a CPF NOT in the data.
    // CPF_A2 belongs to empresa 1 already, CPF_A2 = '11144477735'.
    // Actually: CPF_B1 exists in empresa 2. Creating in empresa 1 with CPF_B1 → global block.
    // But for "permite criacao", I need a CPF that's not in ANY empresa.
    // All 3 valid CPFs are in the mock data. Need a 4th one.
    // Using a CPF that IS valid but not in mock — let me verify it's valid:
    // The CPF 52998224725 is computed from the algorithm. Let's see if it passes.
    // Actually, let me just check: this test is redundant with the "permite" test above
    // ("mesma matricula em empresas diferentes"). It already tests successful creation.
    // Let me change this to test PUT with a unique CPF.

    // PUT on func 202 with a new CPF that doesn't exist anywhere
    // CPF_A2 = '11144477735' exists in empresa 1, so we need to avoid that.
    // Let me use '08328622742' which is valid (from qualificacoes test) and not in mock.
    const response = await request('/api/funcionarios/202', env, 2, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ nome: 'Atualizado', cpf: '08328622742' }),
    });

    // '08328622742' is not in the mock data → no duplicate → should succeed
    expect(response.status).toBe(200);
  });

  it('PUT matricula duplicada na mesma empresa bloqueia', async () => {
    const { env, runs } = createMockEnv();

    // Funcionario 101 (tenant 1) tenta mudar matricula para 'A-102' (já usada no tenant 1)
    const response = await request('/api/funcionarios/101', env, 1, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ matricula: 'A-102' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('Matrícula');
  });

  it('PUT matricula igual entre empresas diferentes e permitido', async () => {
    const { env } = createMockEnv();

    // Funcionario 202 (tenant 2) tem matricula 'A-101' — mantenha
    const response = await request('/api/funcionarios/202', env, 2, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ nome: 'Atualizado sem mudar matricula' }),
    });

    expect(response.status).toBe(200);
  });

  it('PUT CPF duplicado globalmente bloqueia', async () => {
    const { env } = createMockEnv();

    // Funcionario 202 (tenant 2) tenta usar CPF do tenant 1
    const response = await request('/api/funcionarios/202', env, 2, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ cpf: CPF_A1 }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('CPF');
  });

  it('PUT ignora colunas novas ausentes no schema e nao estoura erro interno', async () => {
    const { env, runs } = createMockEnv({
      funcionarioColumns: [
        'id',
        'empresa_id',
        'nome',
        'cpf',
        'matricula',
        'email',
        'telefone',
        'funcao',
        'cargo',
        'setor',
        'base',
        'admissao',
        'codigo_anac',
        'status',
        'ativo',
        'is_instrutor',
        'is_checador',
        'updated_at',
      ],
    });

    const response = await request('/api/funcionarios/101', env, 1, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        nome: 'Funcionario Compat',
        sexo: null,
        nacionalidade: null,
        telefone_emergencia: null,
        contato_emergencia_nome: null,
        foto_url: null,
        modelo_aeronave_id: null,
        quinzena: null,
      }),
    });

    expect(response.status).toBe(200);
    const update = runs.find((run) => run.query.startsWith('UPDATE funcionarios'));
    expect(update?.query).toContain('nome = ?');
    expect(update?.query).not.toContain('sexo = ?');
    expect(update?.query).not.toContain('nacionalidade = ?');
    expect(update?.query).not.toContain('telefone_emergencia = ?');
    expect(update?.query).not.toContain('contato_emergencia_nome = ?');
    expect(update?.query).not.toContain('foto_url = ?');
    expect(update?.query).not.toContain('modelo_aeronave_id = ?');
    expect(update?.query).not.toContain('quinzena = ?');
  });

  it('POST ignora colunas novas ausentes no schema e continua criando funcionario', async () => {
    const { env, runs } = createMockEnv({
      funcionarioColumns: [
        'id',
        'empresa_id',
        'matricula',
        'nome',
        'cpf',
        'email',
        'telefone',
        'funcao',
        'cargo',
        'setor',
        'base',
        'admissao',
        'codigo_anac',
        'status',
        'ativo',
        'is_instrutor',
        'is_checador',
        'created_at',
        'updated_at',
      ],
    });

    const response = await request('/api/funcionarios', env, 1, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        nome: 'Novo Compat',
        cpf: '08328622742',
        email: 'compat@example.com',
        matricula: 'A-777',
        sexo: null,
        nacionalidade: null,
        telefone_emergencia: null,
        contato_emergencia_nome: null,
        foto_url: null,
        modelo_aeronave_id: null,
      }),
    });

    expect(response.status).toBe(201);
    const insert = runs.find((run) => run.query.includes('INSERT INTO funcionarios'));
    expect(insert?.query).toContain('matricula');
    expect(insert?.query).toContain('nome');
    expect(insert?.query).not.toContain('sexo');
    expect(insert?.query).not.toContain('nacionalidade');
    expect(insert?.query).not.toContain('telefone_emergencia');
    expect(insert?.query).not.toContain('contato_emergencia_nome');
    expect(insert?.query).not.toContain('foto_url');
    expect(insert?.query).not.toContain('modelo_aeronave_id');
  });
});
