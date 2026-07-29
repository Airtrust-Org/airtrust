import { describe, expect, it } from 'vitest';
import { createFixtureDb, type Fixtures, type TestD1 } from '../helpers/fixture-d1';
import {
  resolveOperationalAccess,
  assertOperationalAccess,
  resolveResourceDomain,
  requireOperationalAccess,
} from '../../services/operational-domain-access';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

/**
 * Fixtures (see docs/rbac/gestor-operational-autonomy.md §Fixtures):
 *
 * empresa 1 — operational_domain_rbac_enabled = 0 (legacy tenant)
 * empresa 2 — operational_domain_rbac_enabled = 1 (rolled-out tenant)
 * empresa 3 — operational_domain_rbac_enabled = 1 (second rolled-out tenant, tenant isolation)
 *
 * Setores (empresa 2): 10=OPERACOES, 11=MANUTENCAO, 12=sem domínio, 13=MANUTENCAO mas inativo
 * Setores (empresa 3): 20=OPERACOES
 *
 * Usuários (empresa 2):
 *  100 — gestor de um domínio (setor 10, OPERACOES)
 *  101 — gestor de dois domínios (setores 10+11, OPERACOES+MANUTENCAO)
 *  102 — gestor sem setor (sem linha ativa em setores_gestores)
 *  103 — administrador sistêmico (role admin, sem setores_gestores)
 *  104 — administrador também gestor (role admin, com setores_gestores ativo no setor 10)
 *  105 — gestor de setor inativo (setor 13)
 * Usuários (empresa 3): 200 — gestor do setor 20 (OPERACOES)
 */
function buildFixtures(): Fixtures {
  return {
    empresas: [
      { id: 1, nome: 'Legado', operational_domain_rbac_enabled: 0 },
      { id: 2, nome: 'Rollout', operational_domain_rbac_enabled: 1 },
      { id: 3, nome: 'Rollout B', operational_domain_rbac_enabled: 1 },
    ],
    dominios: [
      { codigo: 'OPERACOES', nome: 'Operações', ativo: 1 },
      { codigo: 'MANUTENCAO', nome: 'Manutenção', ativo: 1 },
      { codigo: 'SGSO', nome: 'SGSO', ativo: 1 },
      { codigo: 'FRMS', nome: 'FRMS', ativo: 1 },
      { codigo: 'CORPORATIVO', nome: 'Corporativo', ativo: 1 },
    ],
    setores: [
      { id: 10, empresa_id: 2, nome: 'Operações', ativo: 1, dominio_codigo: 'OPERACOES' },
      { id: 11, empresa_id: 2, nome: 'Manutenção', ativo: 1, dominio_codigo: 'MANUTENCAO' },
      { id: 12, empresa_id: 2, nome: 'Sem domínio', ativo: 1, dominio_codigo: null },
      { id: 13, empresa_id: 2, nome: 'Manutenção inativo', ativo: 0, dominio_codigo: 'MANUTENCAO' },
      // Segundo setor OPERACOES no mesmo tenant (mesmo domínio de setor 10,
      // setor diferente) — usado para provar autorização por setor, não
      // apenas por domínio (Bloqueador 3).
      { id: 14, empresa_id: 2, nome: 'Operações B (mesmo domínio)', ativo: 1, dominio_codigo: 'OPERACOES' },
      { id: 20, empresa_id: 3, nome: 'Operações B', ativo: 1, dominio_codigo: 'OPERACOES' },
    ],
    setoresGestores: [
      { empresa_id: 2, setor_id: 10, usuario_id: 100, ativo: 1 },
      { empresa_id: 2, setor_id: 10, usuario_id: 101, ativo: 1 },
      { empresa_id: 2, setor_id: 11, usuario_id: 101, ativo: 1 },
      { empresa_id: 2, setor_id: 10, usuario_id: 104, ativo: 1 },
      { empresa_id: 2, setor_id: 13, usuario_id: 105, ativo: 1 },
      { empresa_id: 3, setor_id: 20, usuario_id: 200, ativo: 1 },
      // Vínculos indevidos (data anomaly): estes usuários têm uma linha
      // ativa em setores_gestores, mas seu papel de fato NÃO é
      // gestor/admin — usados para provar que o role gate central nega
      // acesso mesmo assim (Bloqueador 2).
      { empresa_id: 2, setor_id: 10, usuario_id: 106, ativo: 1 }, // instrutor
      { empresa_id: 2, setor_id: 10, usuario_id: 107, ativo: 1 }, // aluno
      { empresa_id: 2, setor_id: 10, usuario_id: 108, ativo: 1 }, // usuario
      { empresa_id: 2, setor_id: 10, usuario_id: 109, ativo: 1 }, // compliance (alias canônico de manager)
    ],
    qualificacoesCategorias: [
      { id: 1, empresa_id: 2, ativo: 1, dominio_codigo: 'OPERACOES' },
      { id: 2, empresa_id: 2, ativo: 1, dominio_codigo: 'MANUTENCAO' },
      { id: 3, empresa_id: 2, ativo: 1, dominio_codigo: null },
    ],
    qualificacoesTipos: [
      { id: 1, empresa_id: 2, categoria_id: 1 },
      { id: 2, empresa_id: 2, categoria_id: 2 },
      { id: 3, empresa_id: 2, categoria_id: 3 },
    ],
    qualificacoesHistorico: [
      { id: 1000, empresa_id: 2, categoria_id: 1, funcionario_id: 1 },
      { id: 1001, empresa_id: 2, categoria_id: 2, funcionario_id: 2 },
      { id: 1002, empresa_id: 2, categoria_id: null, funcionario_id: 3 },
      // Same domain (OPERACOES) as historico 1000, but a DIFFERENT setor
      // (14, not 10) — proves setor-level authorization, not just domain
      // (Bloqueador 3).
      { id: 1003, empresa_id: 2, categoria_id: 1, funcionario_id: 5 },
    ],
    lmsCursos: [
      { id: 500, empresa_id: 2, dominio_codigo: 'OPERACOES' },
      { id: 501, empresa_id: 2, dominio_codigo: 'MANUTENCAO' },
      { id: 502, empresa_id: 2, dominio_codigo: null },
    ],
    simuladorAgendamentos: [
      { id: 2000, empresa_id: 2, funcionario_id: 1 }, // setor 10
      { id: 2001, empresa_id: 2, funcionario_id: 5 }, // setor 14 — same domain, different setor
    ],
    fichasSessao: [
      { id: 3000, empresa_id: 2, colaborador_id_aluno: 1 }, // setor 10
      { id: 3001, empresa_id: 2, colaborador_id_aluno: 5 }, // setor 14 — same domain, different setor
    ],
    funcionarios: [
      { id: 1, empresa_id: 2, setor_id: 10 },
      { id: 2, empresa_id: 2, setor_id: 11 },
      { id: 3, empresa_id: 2, setor_id: 12 },
      { id: 4, empresa_id: 2, setor_id: null },
      { id: 5, empresa_id: 2, setor_id: 14 },
    ],
  };
}

function makeDb(): TestD1 {
  return createFixtureDb(buildFixtures());
}

describe('resolveOperationalAccess', () => {
  it('tenant legado (flag desligada) retorna enabled=false e não restringe', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 1,
      userId: 999,
      userRole: 'gestor',
    });
    expect(access.enabled).toBe(false);
    expect(access.domains).toEqual([]);
  });

  it('gestor de um domínio recebe exatamente esse domínio', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 100,
      userRole: 'gestor',
    });
    expect(access.enabled).toBe(true);
    expect(access.domains).toEqual(['OPERACOES']);
    expect(access.setorIds).toEqual([10]);
    expect(access.actions.OPERACOES).toContain('delete');
  });

  it('gestor de dois domínios recebe ambos', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 101,
      userRole: 'gestor',
    });
    expect(access.enabled).toBe(true);
    expect([...access.domains].sort()).toEqual(['MANUTENCAO', 'OPERACOES']);
    expect([...access.setorIds].sort()).toEqual([10, 11]);
  });

  it('gestor sem setor não possui acesso operacional', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 102,
      userRole: 'gestor',
    });
    expect(access.enabled).toBe(true);
    expect(access.domains).toEqual([]);
  });

  it('administrador sistêmico sem atribuição não recebe acesso operacional', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 103,
      userRole: 'admin',
    });
    expect(access.enabled).toBe(true);
    expect(access.domains).toEqual([]);
  });

  it('administrador também gestor recebe apenas o domínio do seu setor atribuído', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 104,
      userRole: 'admin',
    });
    expect(access.enabled).toBe(true);
    expect(access.domains).toEqual(['OPERACOES']);
  });

  it('setor inativo não concede acesso', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 105,
      userRole: 'gestor',
    });
    expect(access.enabled).toBe(true);
    expect(access.domains).toEqual([]);
  });

  it('domínio inativo no catálogo não concede acesso mesmo com setor válido', async () => {
    const db = createFixtureDb({
      ...buildFixtures(),
      dominios: buildFixtures().dominios.map((d) =>
        d.codigo === 'OPERACOES' ? { ...d, ativo: 0 as const } : d,
      ),
    });
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 100,
      userRole: 'gestor',
    });
    expect(access.domains).toEqual([]);
  });

  it('gestor não acessa outro tenant', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 3,
      userId: 100,
      userRole: 'gestor',
    });
    expect(access.domains).toEqual([]);
    expect(access.setorIds).toEqual([]);
  });

  it('vínculo inativo não concede acesso', async () => {
    const fixtures = buildFixtures();
    fixtures.setoresGestores = fixtures.setoresGestores.map((sg) =>
      sg.usuario_id === 100 ? { ...sg, ativo: 0 as const } : sg,
    );
    const db = createFixtureDb(fixtures);
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 100,
      userRole: 'gestor',
    });
    expect(access.domains).toEqual([]);
  });
});

describe('resolveOperationalAccess role gate (Bloqueador 2)', () => {
  it('instrutor com vínculo indevido em setores_gestores é negado', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 106,
      userRole: 'instrutor',
    });
    expect(access.domains).toEqual([]);
    expect(access.setorIds).toEqual([]);
  });

  it('aluno com vínculo indevido em setores_gestores é negado', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 107,
      userRole: 'aluno',
    });
    expect(access.domains).toEqual([]);
  });

  it('usuario (papel padrão) com vínculo indevido é negado', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 108,
      userRole: 'usuario',
    });
    expect(access.domains).toEqual([]);
  });

  it('papel desconhecido é negado (normaliza para viewer, fora da allowlist)', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 108,
      userRole: 'papel-inexistente-xyz',
    });
    expect(access.domains).toEqual([]);
  });

  it('compliance (alias canônico existente de manager) é autorizado normalmente', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 109,
      userRole: 'compliance',
    });
    expect(access.domains).toEqual(['OPERACOES']);
  });

  it('gestor com setor autorizado continua funcionando (regressão)', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 100,
      userRole: 'gestor',
    });
    expect(access.domains).toEqual(['OPERACOES']);
  });

  it('administrador com setor autorizado continua funcionando (regressão)', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 104,
      userRole: 'admin',
    });
    expect(access.domains).toEqual(['OPERACOES']);
  });
});

describe('isTenantRbacEnabled fail-closed behavior (Bloqueador 1)', () => {
  it('flag 0 preserva comportamento legado', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 1,
      userId: 999,
      userRole: 'gestor',
    });
    expect(access.enabled).toBe(false);
  });

  it('flag 1 aplica o novo RBAC', async () => {
    const db = makeDb();
    const access = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 100,
      userRole: 'gestor',
    });
    expect(access.enabled).toBe(true);
  });

  it('falha de query (D1 indisponível) não libera acesso — propaga erro 503, nunca vira legado', async () => {
    const fixtures = buildFixtures();
    fixtures.empresasQueryFailsFor = [2];
    const db = createFixtureDb(fixtures);
    await expect(
      resolveOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
      }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'OPERATIONAL_DOMAIN_RBAC_STATE_UNAVAILABLE' });
  });

  it('assertOperationalAccess também propaga a falha de query como erro, nunca autoriza', async () => {
    const fixtures = buildFixtures();
    fixtures.empresasQueryFailsFor = [2];
    const db = createFixtureDb(fixtures);
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        domain: 'OPERACOES',
        action: 'delete',
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('valor inválido da flag (nem 0 nem 1) não libera acesso — erro 500, nunca modo legado', async () => {
    const fixtures = buildFixtures();
    fixtures.empresas = fixtures.empresas.map((e) =>
      e.id === 2 ? { ...e, operational_domain_rbac_enabled: 'garbage' } : e,
    );
    const db = createFixtureDb(fixtures);
    await expect(
      resolveOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
      }),
    ).rejects.toMatchObject({ statusCode: 500, code: 'OPERATIONAL_DOMAIN_RBAC_INVALID_FLAG' });
  });

  it('tenant A com flag 1 não é afetado por falha de query do tenant B', async () => {
    const fixtures = buildFixtures();
    fixtures.empresasQueryFailsFor = [3];
    const db = createFixtureDb(fixtures);
    const accessTenantA = await resolveOperationalAccess({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 100,
      userRole: 'gestor',
    });
    expect(accessTenantA.enabled).toBe(true);
    expect(accessTenantA.domains).toEqual(['OPERACOES']);

    await expect(
      resolveOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 3,
        userId: 200,
        userRole: 'gestor',
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('empresa não encontrada na consulta da flag nunca vira modo legado — erro controlado', async () => {
    const db = makeDb();
    await expect(
      resolveOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 999999, // não existe em fixtures.empresas
        userId: 100,
        userRole: 'gestor',
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'OPERATIONAL_DOMAIN_RBAC_EMPRESA_NOT_FOUND',
    });
  });

  it('flag NULL nunca vira modo legado — erro controlado (só 0 explícito é legado)', async () => {
    const fixtures = buildFixtures();
    fixtures.empresas = fixtures.empresas.map((e) =>
      e.id === 2 ? { ...e, operational_domain_rbac_enabled: null } : e,
    );
    const db = createFixtureDb(fixtures);
    await expect(
      resolveOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: 'OPERATIONAL_DOMAIN_RBAC_INVALID_FLAG',
    });
  });
});

describe('resolveResourceDomain', () => {
  it('simulador (fixed-domain) resolve para OPERACOES sem consultar o banco', async () => {
    const db = makeDb();
    const result = await resolveResourceDomain(
      db as unknown as D1Database,
      2,
      'simulador_modelo_sessao',
      999999,
    );
    expect(result.domain).toBe('OPERACOES');
  });

  it('mro_prototipo (fixed-domain) resolve para MANUTENCAO', async () => {
    const db = makeDb();
    const result = await resolveResourceDomain(db as unknown as D1Database, 2, 'mro_prototipo', null);
    expect(result.domain).toBe('MANUTENCAO');
  });

  it('qualificacao_tipo herda domínio da categoria', async () => {
    const db = makeDb();
    const opDomain = await resolveResourceDomain(db as unknown as D1Database, 2, 'qualificacao_tipo', 1);
    expect(opDomain.domain).toBe('OPERACOES');
    const mntDomain = await resolveResourceDomain(db as unknown as D1Database, 2, 'qualificacao_tipo', 2);
    expect(mntDomain.domain).toBe('MANUTENCAO');
    const noDomain = await resolveResourceDomain(db as unknown as D1Database, 2, 'qualificacao_tipo', 3);
    expect(noDomain.domain).toBeNull();
  });

  it('qualificacao_historico usa seu próprio categoria_id', async () => {
    const db = makeDb();
    const opDomain = await resolveResourceDomain(
      db as unknown as D1Database,
      2,
      'qualificacao_historico',
      1000,
    );
    expect(opDomain.domain).toBe('OPERACOES');
  });

  it('lms_curso usa a coluna explícita, não herda de qualificação', async () => {
    const db = makeDb();
    const independente = await resolveResourceDomain(db as unknown as D1Database, 2, 'lms_curso', 502);
    expect(independente.domain).toBeNull();
    const manutencao = await resolveResourceDomain(db as unknown as D1Database, 2, 'lms_curso', 501);
    expect(manutencao.domain).toBe('MANUTENCAO');
  });

  it('funcionario resolve domínio e setor a partir do seu próprio setor_id', async () => {
    const db = makeDb();
    const result = await resolveResourceDomain(db as unknown as D1Database, 2, 'funcionario', 2);
    expect(result.domain).toBe('MANUTENCAO');
    expect(result.setorId).toBe(11);
  });

  it('funcionario sem setor fica sem domínio (fail-closed)', async () => {
    const db = makeDb();
    const result = await resolveResourceDomain(db as unknown as D1Database, 2, 'funcionario', 4);
    expect(result.domain).toBeNull();
  });
});

describe('assertOperationalAccess', () => {
  it('modo legado (flag off) nunca bloqueia', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 1,
        userId: 999,
        userRole: 'gestor',
        domain: 'OPERACOES',
        action: 'delete',
      }),
    ).resolves.toBeDefined();
  });

  it('ação desconhecida retorna 422', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        domain: 'OPERACOES',
        action: 'teleport',
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('domínio desconhecido retorna 422', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        domain: 'MARTE',
        action: 'update',
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('gestor de OPERACOES pode excluir modelo de sessão (domínio fixo)', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        domain: 'OPERACOES',
        action: 'delete',
        resourceType: 'simulador_modelo_sessao',
      }),
    ).resolves.toBeDefined();
  });

  it('gestor de Manutenção não acessa simuladores (domínio errado)', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 101, // has both OPERACOES and MANUTENCAO
        userRole: 'gestor',
        domain: 'MANUTENCAO',
        action: 'delete',
        resourceType: 'simulador_modelo_sessao', // fixed OPERACOES
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('gestor de Operações não acessa MRO (domínio fixo MANUTENCAO)', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        domain: 'MANUTENCAO',
        action: 'view',
        resourceType: 'mro_prototipo',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('gestor edita qualificação concluída de domínio correto (resolução dinâmica)', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 101,
        userRole: 'gestor',
        action: 'update',
        resourceType: 'qualificacao_historico',
        resourceId: 1001, // MANUTENCAO
      }),
    ).resolves.toBeDefined();
  });

  it('gestor não edita qualificação de domínio fora do seu escopo', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100, // only OPERACOES
        userRole: 'gestor',
        action: 'update',
        resourceType: 'qualificacao_historico',
        resourceId: 1001, // MANUTENCAO
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('recurso sem domínio classificado falha fechado', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 101,
        userRole: 'gestor',
        action: 'update',
        resourceType: 'qualificacao_historico',
        resourceId: 1002, // categoria_id NULL
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('gestor não acessa funcionário de outro setor', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100, // only setor 10
        userRole: 'gestor',
        action: 'delete',
        resourceType: 'funcionario',
        resourceId: 2, // setor 11
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('gestor gerencia funcionário do seu próprio setor', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        action: 'update',
        resourceType: 'funcionario',
        resourceId: 1, // setor 10
      }),
    ).resolves.toBeDefined();
  });

  it('gestor não acessa recurso de outro tenant mesmo com mesmo id', async () => {
    const db = makeDb();
    // funcionario id=2 exists in empresa 2 (MANUTENCAO); querying it under
    // empresa 3 must resolve to no row -> unclassified -> fail closed.
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 3,
        userId: 200,
        userRole: 'gestor',
        action: 'update',
        resourceType: 'funcionario',
        resourceId: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('setor-level authorization within the same domain (Bloqueador 3)', () => {
  // Setores 10 e 14 são AMBOS OPERACOES no tenant 2 — user 100 gerencia
  // apenas o setor 10. Cada teste abaixo prova que o domínio sozinho não
  // basta: o setor do funcionário/participante precisa também estar no
  // escopo do gestor.

  it('qualificacao_historico: mesmo domínio, setor diferente é negado', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100, // setor 10 apenas
        userRole: 'gestor',
        action: 'update',
        resourceType: 'qualificacao_historico',
        resourceId: 1003, // OPERACOES, mas funcionario do setor 14
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_SETOR_OUT_OF_SCOPE' });
  });

  it('qualificacao_historico: mesmo domínio, mesmo setor é permitido', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        action: 'update',
        resourceType: 'qualificacao_historico',
        resourceId: 1000, // OPERACOES, funcionario do setor 10
      }),
    ).resolves.toBeDefined();
  });

  it('simulador_sessao: participante de setor OPERACOES diferente é negado', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        domain: 'OPERACOES',
        action: 'update',
        resourceType: 'simulador_sessao',
        resourceId: 2001, // funcionario do setor 14
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_SETOR_OUT_OF_SCOPE' });
  });

  it('simulador_sessao: participante do próprio setor é permitido', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        domain: 'OPERACOES',
        action: 'update',
        resourceType: 'simulador_sessao',
        resourceId: 2000, // funcionario do setor 10
      }),
    ).resolves.toBeDefined();
  });

  it('simulador_ficha: aluno de setor OPERACOES diferente é negado', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        domain: 'OPERACOES',
        action: 'update',
        resourceType: 'simulador_ficha',
        resourceId: 3001, // aluno do setor 14
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_SETOR_OUT_OF_SCOPE' });
  });

  it('simulador_ficha: aluno do próprio setor é permitido', async () => {
    const db = makeDb();
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        domain: 'OPERACOES',
        action: 'update',
        resourceType: 'simulador_ficha',
        resourceId: 3000, // aluno do setor 10
      }),
    ).resolves.toBeDefined();
  });

  it('gestor com ambos os setores OPERACOES (10+14) atribuídos acessa ambos', async () => {
    // user 100 normalmente só gerencia o setor 10; adicionamos aqui uma
    // atribuição extra ao setor 14 para provar que ampliar o ESCOPO DO
    // GESTOR (setores_gestores), não o domínio, é o que resolve o acesso.
    const fixtures = buildFixtures();
    fixtures.setoresGestores.push({ empresa_id: 2, setor_id: 14, usuario_id: 100, ativo: 1 });
    const db = createFixtureDb(fixtures);
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        domain: 'OPERACOES',
        action: 'update',
        resourceType: 'simulador_ficha',
        resourceId: 3001,
      }),
    ).resolves.toBeDefined();
  });
});

describe('requireOperationalAccess middleware', () => {
  function buildApp() {
    const app = new Hono<{ Bindings: Env }>();
    app.onError(errorHandler);
    app.use('*', async (c, next) => {
      c.set('empresaId' as never, Number(c.req.header('x-empresa-id')) as never);
      c.set('userId' as never, Number(c.req.header('x-user-id')) as never);
      c.set('userRole' as never, (c.req.header('x-user-role') || 'gestor') as never);
      await next();
    });
    app.delete(
      '/modelos/:id',
      requireOperationalAccess({
        domain: 'OPERACOES',
        action: 'delete',
        resourceType: 'simulador_modelo_sessao',
      }),
      (c) => c.json({ success: true }),
    );
    return app;
  }

  it('bloqueia gestor sem o domínio via HTTP 403', async () => {
    const db = makeDb();
    const app = buildApp();
    const res = await app.request('/modelos/1', {
      method: 'DELETE',
      headers: { 'x-empresa-id': '2', 'x-user-id': '102', 'x-user-role': 'gestor' },
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(403);
  });

  it('permite gestor com o domínio via HTTP 200', async () => {
    const db = makeDb();
    const app = buildApp();
    const res = await app.request('/modelos/1', {
      method: 'DELETE',
      headers: { 'x-empresa-id': '2', 'x-user-id': '100', 'x-user-role': 'gestor' },
    }, { DB: db } as unknown as Env);
    expect(res.status).toBe(200);
  });
});

describe('multi-participant session authorization (Item 5)', () => {
  // Sessão 2000 (setor 10, funcionario 1) ganha aqui um segundo participante
  // do setor 14 — mesmo domínio (OPERACOES) do setor 10, setor diferente.
  // Prova que uma operação de SESSÃO INTEIRA precisa que TODOS os
  // participantes ativos estejam no escopo do gestor, enquanto uma operação
  // sobre UM participante específico só valida aquele participante.
  function buildFixturesWithTwoSetorParticipants(): Fixtures {
    const fixtures = buildFixtures();
    fixtures.sessoesParticipantes = [
      { id: 9000, sessao_id: 2000, funcionario_id: 1 }, // setor 10
      { id: 9001, sessao_id: 2000, funcionario_id: 5 }, // setor 14 — mesmo domínio, setor diferente
    ];
    return fixtures;
  }

  it('resolveResourceDomain: simulador_sessao inclui setorIds de todos os participantes ativos', async () => {
    const db = createFixtureDb(buildFixturesWithTwoSetorParticipants());
    const resolved = await resolveResourceDomain(
      db as unknown as D1Database,
      2,
      'simulador_sessao',
      2000,
    );
    expect(resolved.domain).toBe('OPERACOES');
    expect(resolved.setorIds).toEqual(expect.arrayContaining([10, 14]));
  });

  it('operação de sessão inteira é NEGADA quando gestor só controla o setor do participante principal', async () => {
    const db = createFixtureDb(buildFixturesWithTwoSetorParticipants());
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100, // apenas setor 10
        userRole: 'gestor',
        domain: 'OPERACOES',
        action: 'update',
        resourceType: 'simulador_sessao',
        resourceId: 2000,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_SETOR_OUT_OF_SCOPE' });
  });

  it('operação de sessão inteira é PERMITIDA quando gestor controla os setores de TODOS os participantes', async () => {
    const fixtures = buildFixturesWithTwoSetorParticipants();
    fixtures.setoresGestores.push({ empresa_id: 2, setor_id: 14, usuario_id: 100, ativo: 1 });
    const db = createFixtureDb(fixtures);
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100, // agora setores 10+14
        userRole: 'gestor',
        domain: 'OPERACOES',
        action: 'update',
        resourceType: 'simulador_sessao',
        resourceId: 2000,
      }),
    ).resolves.toBeDefined();
  });

  it('operação sobre um participante específico só valida o setor daquele participante (não da sessão inteira)', async () => {
    const db = createFixtureDb(buildFixturesWithTwoSetorParticipants());
    // user 100 (setor 10 apenas) pode editar o participante 9000 (setor 10)...
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        action: 'update',
        resourceType: 'simulador_sessao_participante',
        resourceId: 9000,
      }),
    ).resolves.toBeDefined();

    // ...mas NÃO o participante 9001 (setor 14, fora do seu escopo), mesmo
    // que ambos pertençam à mesma sessão 2000.
    await expect(
      assertOperationalAccess({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        action: 'update',
        resourceType: 'simulador_sessao_participante',
        resourceId: 9001,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_SETOR_OUT_OF_SCOPE' });
  });

  it('assertFuncionarioIdsWithinOperationalScope: adicionar participante do próprio setor é permitido, de setor externo é negado', async () => {
    const db = createFixtureDb(buildFixturesWithTwoSetorParticipants());
    const { assertFuncionarioIdsWithinOperationalScope } = await import(
      '../../services/operational-domain-access'
    );

    await expect(
      assertFuncionarioIdsWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        funcionarioIds: [1], // setor 10 — próprio escopo do user 100
      }),
    ).resolves.toBeUndefined();

    await expect(
      assertFuncionarioIdsWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        funcionarioIds: [5], // setor 14 — fora do escopo do user 100
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_SETOR_OUT_OF_SCOPE' });
  });
});

describe('assertSetorWithinOperationalScope (Item 3 — funcionário creation/transfer)', () => {
  it('permite quando o setor de destino está no domínio+escopo do gestor', async () => {
    const db = makeDb();
    const { assertSetorWithinOperationalScope } = await import('../../services/operational-domain-access');
    await expect(
      assertSetorWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100, // gerencia setor 10 (OPERACOES)
        userRole: 'gestor',
        setorId: 10,
      }),
    ).resolves.toBeUndefined();
  });

  it('permite gestor de Manutenção mover funcionário para setor de Manutenção (não default OPERACOES)', async () => {
    const db = makeDb();
    const { assertSetorWithinOperationalScope } = await import('../../services/operational-domain-access');
    await expect(
      assertSetorWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 101, // gerencia setores 10 (OPERACOES) + 11 (MANUTENCAO)
        userRole: 'gestor',
        setorId: 11,
      }),
    ).resolves.toBeUndefined();
  });

  it('nega quando o domínio do setor de destino está fora do escopo do gestor', async () => {
    const db = makeDb();
    const { assertSetorWithinOperationalScope } = await import('../../services/operational-domain-access');
    await expect(
      assertSetorWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100, // só gerencia OPERACOES (setor 10), não MANUTENCAO
        userRole: 'gestor',
        setorId: 11, // MANUTENCAO
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'OPERATIONAL_DOMAIN_ACCESS_DENIED' });
  });

  it('nega (fail-closed) quando o setor de destino não tem domínio classificado', async () => {
    const db = makeDb();
    const { assertSetorWithinOperationalScope } = await import('../../services/operational-domain-access');
    await expect(
      assertSetorWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        setorId: 12, // sem domínio
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_DOMAIN_UNCLASSIFIED' });
  });

  it('nega quando o setor é do mesmo domínio mas fora do setor gerenciado (Bloqueador 3 aplicado ao Item 3)', async () => {
    const db = makeDb();
    const { assertSetorWithinOperationalScope } = await import('../../services/operational-domain-access');
    await expect(
      assertSetorWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100, // gerencia setor 10, NÃO o 14 (ambos OPERACOES)
        userRole: 'gestor',
        setorId: 14,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_SETOR_OUT_OF_SCOPE' });
  });

  it('é no-op em tenant legado (RBAC desativado)', async () => {
    const db = makeDb();
    const { assertSetorWithinOperationalScope } = await import('../../services/operational-domain-access');
    await expect(
      assertSetorWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 1, // legado
        userId: 999,
        userRole: 'gestor',
        setorId: 11,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('assertQualificacaoAtribuicaoWithinOperationalScope (Item 3 — atribuição/renovação)', () => {
  it('permite atribuir qualificação OPERACOES a funcionário do próprio setor', async () => {
    const db = makeDb();
    const { assertQualificacaoAtribuicaoWithinOperationalScope } = await import(
      '../../services/operational-domain-access'
    );
    await expect(
      assertQualificacaoAtribuicaoWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        qualificacaoTipoId: 1, // categoria_id 1 → OPERACOES
        funcionarioId: 1, // setor 10
      }),
    ).resolves.toBeUndefined();
  });

  it('permite gestor de Manutenção atribuir qualificação de Manutenção (não default OPERACOES)', async () => {
    const db = makeDb();
    const { assertQualificacaoAtribuicaoWithinOperationalScope } = await import(
      '../../services/operational-domain-access'
    );
    await expect(
      assertQualificacaoAtribuicaoWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 101, // gerencia 10 (OPERACOES) + 11 (MANUTENCAO)
        userRole: 'gestor',
        qualificacaoTipoId: 2, // categoria_id 2 → MANUTENCAO
        funcionarioId: 2, // setor 11
      }),
    ).resolves.toBeUndefined();
  });

  it('nega quando o funcionário está em outro setor do mesmo domínio', async () => {
    const db = makeDb();
    const { assertQualificacaoAtribuicaoWithinOperationalScope } = await import(
      '../../services/operational-domain-access'
    );
    await expect(
      assertQualificacaoAtribuicaoWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100, // só setor 10
        userRole: 'gestor',
        qualificacaoTipoId: 1, // OPERACOES
        funcionarioId: 5, // setor 14 — OPERACOES, mas fora do escopo
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_SETOR_OUT_OF_SCOPE' });
  });

  it('nega (fail-closed) quando a categoria da qualificação não tem domínio classificado', async () => {
    const db = makeDb();
    const { assertQualificacaoAtribuicaoWithinOperationalScope } = await import(
      '../../services/operational-domain-access'
    );
    await expect(
      assertQualificacaoAtribuicaoWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 2,
        userId: 100,
        userRole: 'gestor',
        qualificacaoTipoId: 3, // categoria_id 3 → sem domínio
        funcionarioId: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'RESOURCE_DOMAIN_UNCLASSIFIED' });
  });

  it('é no-op em tenant legado (RBAC desativado)', async () => {
    const db = makeDb();
    const { assertQualificacaoAtribuicaoWithinOperationalScope } = await import(
      '../../services/operational-domain-access'
    );
    await expect(
      assertQualificacaoAtribuicaoWithinOperationalScope({
        db: db as unknown as D1Database,
        empresaId: 1, // legado
        userId: 999,
        userRole: 'gestor',
        qualificacaoTipoId: 2,
        funcionarioId: 2,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('resolveOperationalReadScope (Item 1 — read-side filtering)', () => {
  it('administrador nunca é restrito, mesmo com RBAC ativo', async () => {
    const db = makeDb();
    const { resolveOperationalReadScope } = await import('../../services/operational-domain-access');
    const scope = await resolveOperationalReadScope({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 103,
      userRole: 'admin',
    });
    expect(scope).toEqual({ restricted: false, domains: [], setorIds: [] });
  });

  it('instrutor/aluno nunca são restritos por este helper (modelo de acesso próprio)', async () => {
    const db = makeDb();
    const { resolveOperationalReadScope } = await import('../../services/operational-domain-access');
    const instrutorScope = await resolveOperationalReadScope({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 106,
      userRole: 'instructor',
    });
    const alunoScope = await resolveOperationalReadScope({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 107,
      userRole: 'student',
    });
    expect(instrutorScope.restricted).toBe(false);
    expect(alunoScope.restricted).toBe(false);
  });

  it('gestor em tenant legado (RBAC desativado) não é restrito', async () => {
    const db = makeDb();
    const { resolveOperationalReadScope } = await import('../../services/operational-domain-access');
    const scope = await resolveOperationalReadScope({
      db: db as unknown as D1Database,
      empresaId: 1, // legado
      userId: 999,
      userRole: 'gestor',
    });
    expect(scope.restricted).toBe(false);
  });

  it('gestor com RBAC ativo é restrito aos seus domínios+setores', async () => {
    const db = makeDb();
    const { resolveOperationalReadScope } = await import('../../services/operational-domain-access');
    const scope = await resolveOperationalReadScope({
      db: db as unknown as D1Database,
      empresaId: 2,
      userId: 101, // setores 10 (OPERACOES) + 11 (MANUTENCAO)
      userRole: 'gestor',
    });
    expect(scope.restricted).toBe(true);
    expect(scope.domains.sort()).toEqual(['MANUTENCAO', 'OPERACOES']);
    expect(scope.setorIds.sort()).toEqual([10, 11]);
  });
});

describe('appendOperationalReadFilter (Item 1 — SQL filter builder)', () => {
  it('é no-op quando o escopo não é restrito', async () => {
    const { appendOperationalReadFilter } = await import('../../services/operational-domain-access');
    const conditions: string[] = ['x = 1'];
    const bindings: unknown[] = [];
    appendOperationalReadFilter(conditions, bindings, { restricted: false, domains: [], setorIds: [] }, {
      domainColumn: 's.dominio_codigo',
      setorColumn: 'f.setor_id',
    });
    expect(conditions).toEqual(['x = 1']);
    expect(bindings).toEqual([]);
  });

  it('adiciona filtro IN por domínio e por setor quando restrito', async () => {
    const { appendOperationalReadFilter } = await import('../../services/operational-domain-access');
    const conditions: string[] = [];
    const bindings: unknown[] = [];
    appendOperationalReadFilter(
      conditions,
      bindings,
      { restricted: true, domains: ['OPERACOES', 'MANUTENCAO'], setorIds: [10, 11] },
      { domainColumn: 's.dominio_codigo', setorColumn: 'f.setor_id' },
    );
    expect(conditions).toEqual([
      's.dominio_codigo IN (?, ?)',
      'f.setor_id IN (?, ?)',
    ]);
    expect(bindings).toEqual(['OPERACOES', 'MANUTENCAO', 10, 11]);
  });

  it('fail-closed: restrito com domínios/setores vazios nunca retorna tudo', async () => {
    const { appendOperationalReadFilter } = await import('../../services/operational-domain-access');
    const conditions: string[] = [];
    const bindings: unknown[] = [];
    appendOperationalReadFilter(conditions, bindings, { restricted: true, domains: [], setorIds: [] }, {
      domainColumn: 's.dominio_codigo',
    });
    expect(conditions).toEqual(['1 = 0']);
  });
});
