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
  requirePermission:
    (_module: string, _action: string, ...defaultRoles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!defaultRoles.map((requiredRole) => requiredRole.toLowerCase()).includes(role)) {
        return c.json({ success: false, error: 'Permissão negada' }, 403);
      }
      await next();
    },
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

function createMockEnv(options?: {
  funcionarioColumns?: string[];
  failNaturalKeyRun?: 'cpf' | 'matricula' | 'email';
}) {
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
    {
      id: 103,
      empresa_id: 1,
      nome: 'Funcionario Tenant A Inativo',
      cpf: CPF_B1,
      matricula: 'A-103',
      email: 'inactive@example.com',
      deleted_at: '2026-09-01T00:00:00Z',
    },
  ];

  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' | 'run' }> = [];
  const runs: Array<{ query: string; args: unknown[] }> = [];

  const findFuncionario = (
    id: number,
    empresaId?: number,
    includeDeleted = false,
  ) =>
    funcionarios.find((funcionario) => {
      if (funcionario.id !== id) return false;
      if (!includeDeleted && funcionario.deleted_at) return false;
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
          const includeDeleted = query.includes('deleted_at IS NOT NULL');
          return findFuncionario(id, empresaId, includeDeleted);
        }

        // A-02 natural-key duplicate checks are always tenant-scoped.
        if (query.includes('FROM funcionarios') && query.includes('empresa_id = ?')) {
          const empresaId = Number(args[0]);
          const value = String(args[1] || '');
          const idToExclude = query.includes('id != ?') ? Number(args[2]) : undefined;

          if (query.includes('cpf = ?')) {
            return (
              funcionarios.find((f) => {
                if (f.deleted_at || f.empresa_id !== empresaId) return false;
                if (f.cpf !== value) return false;
                return idToExclude === undefined || f.id !== idToExclude;
              }) || null
            );
          }

          if (query.includes('TRIM(matricula) = ?')) {
            return (
              funcionarios.find((f) => {
                if (f.deleted_at || f.empresa_id !== empresaId) return false;
                if (f.matricula.trim() !== value) return false;
                return idToExclude === undefined || f.id !== idToExclude;
              }) || null
            );
          }

          if (query.includes('LOWER(TRIM(email)) = ?')) {
            return (
              funcionarios.find((f) => {
                if (f.deleted_at || f.empresa_id !== empresaId) return false;
                if (f.email.trim().toLowerCase() !== value.toLowerCase()) return false;
                return idToExclude === undefined || f.id !== idToExclude;
              }) || null
            );
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

        if (
          options?.failNaturalKeyRun &&
          (query.includes('INSERT INTO funcionarios') ||
            (query.includes('UPDATE funcionarios SET') &&
              !query.includes("deleted_at = datetime('now')")))
        ) {
          const indexByField = {
            cpf: 'ux_funcionarios_cpf_empresa_active',
            matricula: 'ux_funcionarios_matricula_empresa_active',
            email: 'ux_funcionarios_email_empresa_active',
          } as const;
          throw new Error(
            `D1_ERROR: UNIQUE constraint failed: index '${indexByField[options.failNaturalKeyRun]}'`,
          );
        }

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
        cpf: CPF_A1,
        email: 'novoB@example.com',
        matricula: 'A-102',
      }),
    });

    expect(response.status).toBe(201);
  });

  it('mesmo CPF em empresas diferentes e permitido', async () => {
    const { env } = createMockEnv();

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

    expect(response.status).toBe(201);
  });

  it('CPF duplicado dentro da mesma empresa bloqueia', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios', env, 1, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        nome: 'Duplicate CPF',
        cpf: CPF_A1,
        email: 'dup-cpf@example.com',
        matricula: 'A-999',
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('CPF');
    expect(runs.filter((run) => run.query.includes('INSERT INTO funcionarios'))).toHaveLength(0);
  });

  it('email duplicado no tenant bloqueia com LOWER(TRIM(email))', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios', env, 1, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        nome: 'Duplicate Email',
        cpf: CPF_B1,
        email: '  A@EXAMPLE.COM  ',
        matricula: 'A-777',
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('E-mail');
    expect(runs.filter((run) => run.query.includes('INSERT INTO funcionarios'))).toHaveLength(0);
  });

  it('mesmo email em empresas diferentes e permitido', async () => {
    const { env, runs } = createMockEnv();

    const response = await request('/api/funcionarios', env, 2, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        nome: 'Cross Email',
        cpf: CPF_A1,
        email: ' A@EXAMPLE.COM ',
        matricula: 'B-777',
      }),
    });

    expect(response.status).toBe(201);
    const insert = runs.find((run) => run.query.includes('INSERT INTO funcionarios'));
    expect(insert?.args).toContain('a@example.com');
  });

  it('matricula com whitespace duplicada no tenant bloqueia por TRIM', async () => {
    const { env } = createMockEnv();

    const response = await request('/api/funcionarios', env, 1, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        nome: 'Duplicate Matricula Trim',
        cpf: CPF_B1,
        email: 'trim@example.com',
        matricula: '  A-102  ',
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('Matrícula');
  });

  it('PUT com CPF novo no tenant permite atualizacao', async () => {
    const { env } = createMockEnv();

    const response = await request('/api/funcionarios/202', env, 2, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ nome: 'Atualizado', cpf: CPF_A2 }),
    });

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

  it('PUT permite CPF que existe apenas em outro tenant', async () => {
    const { env } = createMockEnv();

    const response = await request('/api/funcionarios/202', env, 2, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ cpf: CPF_A1 }),
    });

    expect(response.status).toBe(200);
  });

  it('PUT bloqueia CPF duplicado dentro do mesmo tenant', async () => {
    const { env } = createMockEnv();

    const response = await request('/api/funcionarios/101', env, 1, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ cpf: CPF_A2 }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('CPF');
  });

  it('PUT bloqueia email duplicado dentro do mesmo tenant', async () => {
    const { env } = createMockEnv();

    const response = await request('/api/funcionarios/101', env, 1, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ email: ' A2@EXAMPLE.COM ' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('E-mail');
  });

  it('corrida no UNIQUE de email retorna 409 controlado', async () => {
    const { env } = createMockEnv({ failNaturalKeyRun: 'email' });

    const response = await request('/api/funcionarios', env, 1, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        nome: 'Race Email',
        cpf: CPF_B1,
        email: 'race@example.com',
        matricula: 'R-001',
      }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.error).toContain('E-mail');
    expect(body.code).toBe('FUNCIONARIO_EMAIL_CONFLICT');
  });

  it('reativacao bloqueia conflito de email ativo no mesmo tenant', async () => {
    const { env, funcionarios } = createMockEnv();
    funcionarios[3].email = 'a@example.com';

    const response = await request('/api/funcionarios/103/reativar', env, 1, {
      method: 'POST',
      headers: jsonHeaders,
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('E-mail');
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
        cpf: CPF_B1,
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
