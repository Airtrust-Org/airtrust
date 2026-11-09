/**
 * Testes adversariais (SQLite real + rota real) da excecao da PR #2080:
 * o ADMINISTRADOR do tenant pode corrigir historico legado de qualificacao
 * cujo dominio operacional nao esta classificado (categoria "EAD" mista).
 *
 * Usa a cadeia REAL: requirePermission -> requireOperationalAccess ->
 * handler de PUT /historico/:id, contra um SQLite sintetico. Apenas `auth`
 * (identidade vinda de headers) e a gravacao de auditoria sao simuladas.
 * Todos os identificadores sao ficticios.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type Context } from 'hono';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { errorHandler } from '../../middleware/error-handler';

const auditMock = vi.hoisted(() => vi.fn());

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: Context, next: () => Promise<void>) => {
      c.set('userId', Number(c.req.header('x-test-user-id') || 0));
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 0));
      c.set('userRole', c.req.header('x-test-role') || 'viewer');
      c.set('tenantContext', {
        empresaId: Number(c.req.header('x-test-empresa-id') || 0),
        empresaCodigo: 'T',
        empresaNome: 'Tenant ficticio',
        role: 'viewer',
        plano: 'test',
        permissions: [],
      });
      await next();
    },
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: auditMock,
  extrairUsuarioAuditoria: () => ({ userId: 10, origem: 'test' }),
}));

import { SAO_PAULO_TODAY_SQL } from '../../services/qualificacoes/historico-helpers';
import writeRouter from '../../routes/qualificacoes/historico-write';
import { requireOperationalAccess } from '../../middleware/operational-domain-access';

let sqlite: SqliteD1Database;

// ids
const EMP = 1; // RBAC operacional ligado
const EMP_OTHER = 2; // RBAC ligado, outro tenant
const EMP_LEGACY = 3; // RBAC desligado (0)
const EMP_BAD_FLAG = 4; // flag corrompida
const EMP_MISSING = 99; // sem linha em empresas

const TIPO_UNCLASSIFIED_12 = 300; // validade 12, sem dominio/categoria
const TIPO_UNCLASSIFIED_24 = 301;
const TIPO_UNCLASSIFIED_6 = 302;
const TIPO_OTHER_TENANT = 400;

const FUNC = 1010; // empresa 1, setor 10 (MANUTENCAO)
const FUNC_OTHER_TENANT = 2001; // empresa 2
const FUNC_LEGACY = 3001; // empresa 3
const FUNC_DELETED = 1011; // empresa 1, soft-deleted

const ADMIN = { 'x-test-user-id': '500', 'x-test-role': 'admin' };

function app() {
  const hono = new Hono<{ Bindings: Env }>();
  hono.use('*', async (c, next) => {
    (c.env as unknown) = { DB: sqlite.asD1() };
    await next();
  });
  hono.route('/historico', writeRouter);
  hono.onError(errorHandler);
  return hono;
}

function insertRow(opts: {
  funcionarioId?: number;
  empresaId?: number;
  tipoId?: number;
  codigo?: string;
  conclusao?: string;
  vencimento?: string | null;
  status?: string;
  deletedAt?: string | null;
}): number {
  const result = sqlite.database
    .prepare(
      `INSERT INTO qualificacoes_historico (
         funcionario_id, qualificacao_id, qualificacao_codigo, categoria,
         data_conclusao, data_vencimento, validade_meses, status, renovada,
         carga_horaria, tipo_treinamento, empresa_id, created_at, updated_at, deleted_at
       ) VALUES (?, ?, ?, 'EAD', ?, ?, 12, ?, 0, 4, 'RECORRENTE', ?, datetime('now'), datetime('now'), ?)`,
    )
    .run(
      opts.funcionarioId ?? FUNC,
      opts.tipoId ?? TIPO_UNCLASSIFIED_12,
      opts.codigo ?? 'EAD-LEGADO',
      opts.conclusao ?? '2024-01-10',
      opts.vencimento === undefined ? '2025-01-10' : opts.vencimento,
      opts.status ?? 'CONCLUIDA',
      opts.empresaId ?? EMP,
      opts.deletedAt ?? null,
    );
  return Number(result.lastInsertRowid);
}

function readRow(id: number) {
  return sqlite.database
    .prepare(
      `SELECT data_conclusao, data_vencimento, observacoes, tipo_treinamento, status, deleted_at
         FROM qualificacoes_historico WHERE id = ?`,
    )
    .get(id) as {
    data_conclusao: string | null;
    data_vencimento: string | null;
    observacoes: string | null;
    tipo_treinamento: string | null;
    status: string | null;
    deleted_at: string | null;
  };
}

async function put(
  id: number | string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  empresa = EMP,
) {
  return app().request(`/historico/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-test-empresa-id': String(empresa), ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  auditMock.mockReset();
  sqlite = new SqliteD1Database();
  const db = sqlite.database;
  db.exec(`
    ALTER TABLE qualificacoes_historico ADD COLUMN categoria_id INTEGER;
    ALTER TABLE qualificacoes_tipos ADD COLUMN vencimento_fim_mes INTEGER DEFAULT 0;
    CREATE TABLE qualificacoes_historico_stats_daily (day TEXT PRIMARY KEY, payload TEXT);
    INSERT INTO qualificacoes_historico_stats_daily (day, payload)
      VALUES (${SAO_PAULO_TODAY_SQL}, 'stale');
    CREATE TABLE usuarios_empresas (usuario_id INTEGER, empresa_id INTEGER);
    CREATE TABLE usuario_permissoes (usuario_id INTEGER, permissao TEXT, tipo TEXT);
    CREATE TABLE perfis_permissoes (
      empresa_id INTEGER, perfil TEXT, modulo TEXT, acao TEXT, permitido INTEGER
    );

    INSERT INTO empresas (id, operational_domain_rbac_enabled) VALUES (3, 0), (4, 7);
    INSERT INTO setores (id, empresa_id, dominio_codigo, ativo) VALUES (30, 3, 'OPERACOES', 1);

    -- tipos SEM categoria e SEM dominio: o caso "EAD misto" (fail-closed no guard)
    INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, categoria, categoria_id, dominio_codigo, validade,
                                     carga_horaria, carga_horaria_inicial, carga_horaria_recorrente)
    VALUES
      (300, 1, 'EAD-LEGADO', 'EAD', NULL, NULL, 12, 4, 4, 4),
      (301, 1, 'EAD-LEGADO-24', 'EAD', NULL, NULL, 24, 4, 4, 4),
      (302, 1, 'EAD-LEGADO-6', 'EAD', NULL, NULL, 6, 4, 4, 4),
      (400, 2, 'EAD-OUTRO', 'EAD', NULL, NULL, 12, 4, 4, 4),
      (500, 3, 'EAD-LEG', 'EAD', NULL, NULL, 12, 4, 4, 4);

    INSERT INTO funcionarios (id, empresa_id, setor_id, nome) VALUES
      (1010, 1, 10, 'Func Ficticio A'),
      (2001, 2, 20, 'Func Ficticio B'),
      (3001, 3, 30, 'Func Ficticio C');
    INSERT INTO funcionarios (id, empresa_id, setor_id, nome, deleted_at) VALUES
      (1011, 1, 10, 'Func Ficticio D', '2025-01-01');

    -- usuario 900 (gestor de MANUTENCAO no setor 10) e demais
    INSERT INTO usuarios_empresas (usuario_id, empresa_id) VALUES (900, 1), (500, 1), (501, 2);
  `);
});

afterEach(() => sqlite.close());

describe('admin do tenant edita historico legado sem dominio classificado (#2080)', () => {
  it('persiste a edicao, recalcula vencimento pela validade do modelo e a leitura posterior mostra o novo valor', async () => {
    const id = insertRow({ conclusao: '2024-01-10', vencimento: '2025-01-10' });

    const res = await put(id, { data_conclusao: '2025-03-10', observacoes: 'correcao admin' }, ADMIN);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: Record<string, unknown> };
    expect(json.success).toBe(true);
    // validade 12 meses do modelo (nao do snapshot) => +12m
    expect(json.data.data_vencimento).toBe('2026-03-10');

    const stored = readRow(id);
    expect(stored.data_conclusao).toBe('2025-03-10');
    expect(stored.data_vencimento).toBe('2026-03-10');
    expect(stored.observacoes).toBe('correcao admin');
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ tabela: 'qualificacoes_historico', acao: 'UPDATE', registro_id: id }),
    );
    // Reflexo entre telas: a estatistica diaria materializada (Lista/Compliance) e invalidada.
    const stale = sqlite.database
      .prepare('SELECT COUNT(*) AS n FROM qualificacoes_historico_stats_daily')
      .get() as { n: number };
    expect(stale.n).toBe(0);
  });

  it('recalcula periodicidade e vencimento conforme o modelo (24 meses; 6 meses => SEMESTRAL)', async () => {
    const id24 = insertRow({ tipoId: TIPO_UNCLASSIFIED_24, codigo: 'EAD-LEGADO-24', conclusao: '2023-05-01', vencimento: '2024-05-01' });
    const id6 = insertRow({ tipoId: TIPO_UNCLASSIFIED_6, codigo: 'EAD-LEGADO-6', conclusao: '2023-05-02', vencimento: '2024-05-02' });

    expect((await put(id24, { data_conclusao: '2025-06-15' }, ADMIN)).status).toBe(200);
    expect((await put(id6, { data_conclusao: '2025-06-15' }, ADMIN)).status).toBe(200);

    expect(readRow(id24).data_vencimento).toBe('2027-06-15');
    const six = readRow(id6);
    expect(six.data_vencimento).toBe('2025-12-15');
    expect(six.tipo_treinamento).toBe('SEMESTRAL');
  });

  it('aceita o papel em PT-BR (ADMINISTRADOR) e tenant com RBAC operacional desligado', async () => {
    const id = insertRow({});
    const res = await put(id, { data_conclusao: '2025-03-10' }, { ...ADMIN, 'x-test-role': 'ADMINISTRADOR' });
    expect(res.status).toBe(200);

    const idLegacy = insertRow({ empresaId: EMP_LEGACY, funcionarioId: FUNC_LEGACY, tipoId: 500 });
    const legacy = await put(idLegacy, { data_conclusao: '2025-03-10' }, ADMIN, EMP_LEGACY);
    expect(legacy.status).toBe(200);
  });
});

describe('quem NAO e admin do tenant continua negado (a excecao nao amplia permissao)', () => {
  it.each([
    ['gestor', '900'],
    ['manager', '900'],
    ['compliance', '900'],
    ['instrutor', '901'],
    ['aluno', '902'],
    ['usuario', '902'],
    ['viewer', '903'],
    ['editor', '904'],
  ])('papel %s e negado e o registro nao muda', async (role, userId) => {
    const id = insertRow({ conclusao: '2024-01-10', vencimento: '2025-01-10' });
    const res = await put(id, { data_conclusao: '2025-03-10' }, { 'x-test-user-id': userId, 'x-test-role': role });
    expect(res.status).toBe(403);
    const stored = readRow(id);
    expect(stored.data_conclusao).toBe('2024-01-10');
    expect(stored.data_vencimento).toBe('2025-01-10');
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('gestor do setor do funcionario continua fail-closed (RESOURCE_DOMAIN_UNCLASSIFIED) em registro nao classificado', async () => {
    const id = insertRow({});
    const res = await put(id, { data_conclusao: '2025-03-10' }, { 'x-test-user-id': '900', 'x-test-role': 'gestor' });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe('RESOURCE_DOMAIN_UNCLASSIFIED');
  });

  it('instrutor/aluno com GRANT dinamico em perfis_permissoes passam em requirePermission mas o guard operacional os nega', async () => {
    sqlite.database.exec(`
      INSERT INTO perfis_permissoes (empresa_id, perfil, modulo, acao, permitido) VALUES
        (1, 'INSTRUTOR', 'qualificacoes', 'editar', 1),
        (1, 'ALUNO', 'qualificacoes', 'editar', 1);
    `);
    const id = insertRow({});
    for (const role of ['instrutor', 'aluno']) {
      const res = await put(id, { data_conclusao: '2025-03-10' }, { 'x-test-user-id': '901', 'x-test-role': role });
      expect(res.status).toBe(403);
    }
    expect(readRow(id).data_conclusao).toBe('2024-01-10');
  });

  it('admin com DENY individual em qualificacoes.edit continua negado (a excecao nao contorna requirePermission)', async () => {
    sqlite.database.exec(`INSERT INTO usuario_permissoes (usuario_id, permissao, tipo) VALUES (500, 'qualificacoes.edit', 'DENY')`);
    const id = insertRow({});
    const res = await put(id, { data_conclusao: '2025-03-10' }, ADMIN);
    expect(res.status).toBe(403);
    expect(readRow(id).data_conclusao).toBe('2024-01-10');
  });

  it('admin NAO obtem as demais acoes em registro nao classificado: delete/complete/cancel/reissue seguem fail-closed', async () => {
    const id = insertRow({});
    const attempts: Array<[string, string]> = [
      ['DELETE', `/historico/${id}`],
      ['POST', `/historico/${id}/confirmar`],
      ['PATCH', `/historico/${id}/cancelar`],
      ['POST', `/historico/${id}/renovar`],
    ];
    for (const [method, path] of attempts) {
      const res = await app().request(path, {
        method,
        headers: { 'content-type': 'application/json', 'x-test-empresa-id': String(EMP), ...ADMIN },
        body: method === 'DELETE' ? undefined : JSON.stringify({ nova_data_conclusao: '2025-03-10' }),
      });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(((await res.json()) as { code?: string }).code, `${method} ${path}`).toBe('RESOURCE_DOMAIN_UNCLASSIFIED');
    }
    const stored = readRow(id);
    expect(stored.deleted_at).toBeNull();
    expect(stored.status).toBe('CONCLUIDA');
  });
});

describe('isolamento de tenant e integridade do recurso', () => {
  it('ID de outro tenant devolve 404 sem vazar dados e nada e gravado', async () => {
    const otherId = insertRow({ empresaId: EMP_OTHER, funcionarioId: FUNC_OTHER_TENANT, tipoId: TIPO_OTHER_TENANT });
    const res = await put(otherId, { data_conclusao: '2025-03-10', observacoes: 'invasao' }, ADMIN, EMP);
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toContain('2024-01-10');
    expect(text).not.toContain('EAD-OUTRO');
    expect(readRow(otherId).observacoes).toBeNull();
    expect(readRow(otherId).data_conclusao).toBe('2024-01-10');
  });

  it('registro inexistente, soft-deleted ou ID invalido nao passam', async () => {
    expect((await put(987654, { data_conclusao: '2025-03-10' }, ADMIN)).status).toBe(404);
    const deleted = insertRow({ deletedAt: '2025-01-01' });
    expect((await put(deleted, { data_conclusao: '2025-03-10' }, ADMIN)).status).toBe(404);
    for (const bad of ['oops', '-3', '0', '1.5']) {
      expect((await put(bad, { data_conclusao: '2025-03-10' }, ADMIN)).status, bad).toBe(400);
    }
  });

  it('historico do tenant cujo funcionario pertence a OUTRA empresa e tratado como inexistente (404)', async () => {
    const id = insertRow({ empresaId: EMP, funcionarioId: FUNC_OTHER_TENANT });
    const res = await put(id, { data_conclusao: '2025-03-10' }, ADMIN);
    expect(res.status).toBe(404);
    expect(readRow(id).data_conclusao).toBe('2024-01-10');
  });

  it('funcionario soft-deleted do proprio tenant: nao ha escrita (guard libera, handler retorna 404)', async () => {
    const id = insertRow({ funcionarioId: FUNC_DELETED });
    const res = await put(id, { data_conclusao: '2025-03-10' }, ADMIN);
    expect(res.status).toBe(404);
    expect(readRow(id).data_conclusao).toBe('2024-01-10');
  });

  it('flag RBAC corrompida ou empresa sem linha falham fechado (nada e gravado)', async () => {
    const badFlagId = insertRow({ empresaId: EMP_BAD_FLAG, funcionarioId: FUNC, codigo: 'BADFLAG' });
    const bad = await put(badFlagId, { data_conclusao: '2025-03-10' }, ADMIN, EMP_BAD_FLAG);
    expect(bad.status).toBe(500);
    expect(((await bad.json()) as { code?: string }).code).toBe('OPERATIONAL_DOMAIN_RBAC_INVALID_FLAG');

    const missingId = insertRow({ empresaId: EMP_MISSING, funcionarioId: FUNC, codigo: 'MISSING' });
    const missing = await put(missingId, { data_conclusao: '2025-03-10' }, ADMIN, EMP_MISSING);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { code?: string }).code).toBe('OPERATIONAL_DOMAIN_RBAC_EMPRESA_NOT_FOUND');

    expect(readRow(badFlagId).data_conclusao).toBe('2024-01-10');
    expect(readRow(missingId).data_conclusao).toBe('2024-01-10');
  });

  it('admin de outro tenant sem empresa no contexto (empresaId 0) e barrado antes de qualquer escrita', async () => {
    const id = insertRow({});
    const res = await put(id, { data_conclusao: '2025-03-10' }, ADMIN, 0);
    expect([401, 403, 404]).toContain(res.status);
    expect(readRow(id).data_conclusao).toBe('2024-01-10');
  });
});

describe('escopo exato da excecao (middleware)', () => {
  function makeCtx(role: string, empresaId: number, id: string, extra?: Partial<{ param: string }>) {
    return {
      env: { DB: sqlite.asD1() },
      get: (key: string) => ({ empresaId, userId: 500, userRole: role })[key as 'empresaId'],
      req: { param: (name: string) => (name === (extra?.param ?? 'id') ? id : undefined) },
    } as never;
  }

  it('so resourceType=qualificacao_historico + action=update ganha a excecao; certificado/outras acoes seguem o guard core', async () => {
    const id = String(insertRow({}));
    const nextCalls: string[] = [];
    const run = async (opts: Parameters<typeof requireOperationalAccess>[0]) => {
      nextCalls.length = 0;
      await requireOperationalAccess(opts)(makeCtx('admin', EMP, id), async () => {
        nextCalls.push('next');
      });
      return nextCalls.length;
    };

    expect(await run({ action: 'update', resourceType: 'qualificacao_historico' })).toBe(1);
    for (const action of ['delete', 'create', 'reissue', 'complete', 'cancel'] as const) {
      if (action === 'create') continue; // create exige domain explicito (nao e o caso de recurso existente)
      await expect(run({ action, resourceType: 'qualificacao_historico' }), action).rejects.toMatchObject({
        statusCode: 403,
      });
    }
    await expect(run({ action: 'update', resourceType: 'qualificacao_certificado' })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('papel gestor com a mesma chamada de update continua indo ao guard core (403 em recurso nao classificado)', async () => {
    const id = String(insertRow({}));
    await expect(
      requireOperationalAccess({ action: 'update', resourceType: 'qualificacao_historico' })(
        makeCtx('gestor', EMP, id),
        async () => {},
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('as unicas rotas que usam a excecao sao PUT /:id, PATCH /:id/reagendar e PATCH de reclassificacao (todas admin|manager + tenant-scoped)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = join(__dirname, '..', '..', 'routes');
    const write = readFileSync(join(src, 'qualificacoes', 'historico-write.ts'), 'utf8');
    const updateUsers = write.match(/requireOperacoesHistorico\('update'\)/g) ?? [];
    expect(updateUsers.length).toBe(2); // PUT /:id e PATCH /:id/reagendar
    const reclass = readFileSync(join(src, 'qualificacoes-reclass.ts'), 'utf8');
    expect(reclass.match(/requireOperacoesReclass\('update'\)/g)?.length).toBe(1);
  });
});

describe('PATCH /:id/reagendar (mesma excecao de update)', () => {
  it('admin reagenda planejada nao classificada no proprio tenant; gestor segue negado; outro tenant 404', async () => {
    const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    const id = insertRow({ status: 'PLANEJADA', conclusao: '2030-01-01', vencimento: null });
    const call = (rid: number, headers: Record<string, string>, empresa = EMP) =>
      app().request(`/historico/${rid}/reagendar`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-empresa-id': String(empresa), ...headers },
        body: JSON.stringify({ nova_data_planejada: future }),
      });

    expect((await call(id, { 'x-test-user-id': '900', 'x-test-role': 'gestor' })).status).toBe(403);
    expect(readRow(id).data_conclusao).toBe('2030-01-01');

    const other = insertRow({ empresaId: EMP_OTHER, funcionarioId: FUNC_OTHER_TENANT, tipoId: TIPO_OTHER_TENANT, status: 'PLANEJADA' });
    expect((await call(other, ADMIN)).status).toBe(404);

    expect((await call(id, ADMIN)).status).toBe(200);
    expect(readRow(id).data_conclusao).toBe(future);
  });
});

describe('datas do PUT /historico/:id (integridade)', () => {
  it.each([
    ['banana', undefined],
    ['2025-02-30', undefined],
    ['2025-13-01', undefined],
    ['10/03/2025', undefined],
    ['2025-03-10T00:00:00Z', undefined],
    ['2025-03-10', 'nao-e-data'],
    ['2025-03-10', '2025-03-09'], // vencimento antes da realização
  ])('rejeita data_conclusao=%s data_vencimento=%s com 400 e não grava', async (conclusao, vencimento) => {
    const id = insertRow({ conclusao: '2024-01-10', vencimento: '2025-01-10' });
    const body: Record<string, unknown> = { data_conclusao: conclusao };
    if (vencimento !== undefined) body.data_vencimento = vencimento;
    const res = await put(id, body, ADMIN);
    expect(res.status).toBe(400);
    const stored = readRow(id);
    expect(stored.data_conclusao).toBe('2024-01-10');
    expect(stored.data_vencimento).toBe('2025-01-10');
  });

  it('aceita vencimento explícito válido (override) e vencimento igual à realização', async () => {
    const id = insertRow({});
    expect((await put(id, { data_conclusao: '2025-03-10', data_vencimento: '2025-09-10' }, ADMIN)).status).toBe(200);
    expect(readRow(id).data_vencimento).toBe('2025-09-10');
    expect((await put(id, { data_conclusao: '2025-03-10', data_vencimento: '2025-03-10' }, ADMIN)).status).toBe(200);
    expect(readRow(id).data_vencimento).toBe('2025-03-10');
  });
});
