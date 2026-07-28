/**
 * ADMIN OPERATIONAL DOMAIN RBAC — readiness check + per-tenant activation.
 *
 * ADMINISTRADOR-only. Lets an admin inspect whether a tenant is ready for
 * the new gestor operational-autonomy RBAC (see
 * worker-airtrust/src/services/operational-domain-access.ts) and flip the
 * empresas.operational_domain_rbac_enabled switch. Activation is refused
 * (409) while critical blockers remain, so a tenant can never be flipped
 * into fail-closed mode with gestores/setores/categorias/cursos still
 * unclassified.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { ApiError, badRequest, notFound } from '../middleware/error-handler';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import type { Env } from '../types';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import {
  OPERATIONAL_DOMAINS,
  activeDomainCodes,
  type OperationalDomain,
} from '../services/operational-domain-access';

const router = new Hono<{ Bindings: Env }>();

router.use('/*', auth());
router.use('/*', requireRole('admin'));
router.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
});

interface ReadinessReport {
  ready: boolean;
  setores_sem_dominio: number;
  categorias_sem_dominio: number;
  gestores_sem_setor: number;
  cursos_sem_classificacao: number;
  dominios_desconhecidos_em_uso: number;
  dominios_inativos_em_uso: number;
  bloqueios: string[];
}

// Fix 2: a setor/categoria/curso's dominio_codigo can drift out of sync
// with dominios_operacionais in two distinct ways — pointing at a code
// that was never seeded (desconhecido) or at one that existed but was
// later deactivated (inativo em uso). Both must block readiness the same
// way an unclassified (NULL) row does, since the mutation guard
// (resolveOperationalAccess/resolveResourceDomain) would fail closed on
// either just the same.
const DOMAIN_CLASSIFIED_TABLES = [
  { table: 'setores', extraWhere: 'ativo = 1 AND' },
  { table: 'qualificacoes_categorias', extraWhere: 'ativo = 1 AND' },
  { table: 'lms_cursos', extraWhere: '' },
] as const;

async function countInvalidDominioCodigo(
  db: D1Database,
  empresaId: number,
  mode: 'desconhecido' | 'inativo',
): Promise<number> {
  const domainCondition =
    mode === 'desconhecido'
      ? 'NOT EXISTS (SELECT 1 FROM dominios_operacionais do_c WHERE do_c.codigo = t.dominio_codigo)'
      : 'EXISTS (SELECT 1 FROM dominios_operacionais do_c WHERE do_c.codigo = t.dominio_codigo AND do_c.ativo = 0)';

  const counts = await Promise.all(
    DOMAIN_CLASSIFIED_TABLES.map(({ table, extraWhere }) =>
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM ${table} t
            WHERE t.empresa_id = ? AND ${extraWhere} t.deleted_at IS NULL
              AND t.dominio_codigo IS NOT NULL AND ${domainCondition}`,
        )
        .bind(empresaId)
        .first<{ n: number }>(),
    ),
  );

  return counts.reduce((sum, row) => sum + Number(row?.n ?? 0), 0);
}

async function computeReadiness(db: D1Database, empresaId: number): Promise<ReadinessReport> {
  const [
    setoresSemDominio,
    categoriasSemDominio,
    cursosSemClassificacao,
    gestoresSemSetor,
    dominiosDesconhecidosEmUso,
    dominiosInativosEmUso,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM setores
          WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL AND dominio_codigo IS NULL`,
      )
      .bind(empresaId)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM qualificacoes_categorias
          WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL AND dominio_codigo IS NULL`,
      )
      .bind(empresaId)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM lms_cursos
          WHERE empresa_id = ? AND deleted_at IS NULL AND dominio_codigo IS NULL`,
      )
      .bind(empresaId)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT ue.usuario_id
             FROM usuarios_empresas ue
             INNER JOIN usuarios u ON u.id = ue.usuario_id AND u.deleted_at IS NULL
            WHERE ue.empresa_id = ?
              AND LOWER(ue.role) IN ('manager', 'gestor', 'compliance')
              AND NOT EXISTS (
                SELECT 1 FROM setores_gestores sg
                 WHERE sg.empresa_id = ue.empresa_id
                   AND sg.usuario_id = ue.usuario_id
                   AND sg.ativo = 1
                   AND sg.deleted_at IS NULL
              )
         )`,
      )
      .bind(empresaId)
      .first<{ n: number }>(),
    countInvalidDominioCodigo(db, empresaId, 'desconhecido'),
    countInvalidDominioCodigo(db, empresaId, 'inativo'),
  ]);

  const setoresSemDominioN = Number(setoresSemDominio?.n ?? 0);
  const categoriasSemDominioN = Number(categoriasSemDominio?.n ?? 0);
  const cursosSemClassificacaoN = Number(cursosSemClassificacao?.n ?? 0);
  const gestoresSemSetorN = Number(gestoresSemSetor?.n ?? 0);
  const dominiosDesconhecidosEmUsoN = Number(dominiosDesconhecidosEmUso ?? 0);
  const dominiosInativosEmUsoN = Number(dominiosInativosEmUso ?? 0);

  const bloqueios: string[] = [];
  if (setoresSemDominioN > 0) {
    bloqueios.push(`${setoresSemDominioN} setor(es) ativo(s) sem domínio classificado`);
  }
  if (categoriasSemDominioN > 0) {
    bloqueios.push(`${categoriasSemDominioN} categoria(s) de qualificação ativa(s) sem domínio classificado`);
  }
  if (cursosSemClassificacaoN > 0) {
    bloqueios.push(`${cursosSemClassificacaoN} curso(s) LMS sem domínio classificado`);
  }
  if (gestoresSemSetorN > 0) {
    bloqueios.push(`${gestoresSemSetorN} usuário(s) com papel de gestor sem nenhum setor atribuído ativo`);
  }
  if (dominiosDesconhecidosEmUsoN > 0) {
    bloqueios.push(
      `${dominiosDesconhecidosEmUsoN} setor(es)/categoria(s)/curso(s) apontando para um código de domínio desconhecido`,
    );
  }
  if (dominiosInativosEmUsoN > 0) {
    bloqueios.push(
      `${dominiosInativosEmUsoN} setor(es)/categoria(s)/curso(s) apontando para um domínio inativo`,
    );
  }

  return {
    ready: bloqueios.length === 0,
    setores_sem_dominio: setoresSemDominioN,
    categorias_sem_dominio: categoriasSemDominioN,
    gestores_sem_setor: gestoresSemSetorN,
    cursos_sem_classificacao: cursosSemClassificacaoN,
    dominios_desconhecidos_em_uso: dominiosDesconhecidosEmUsoN,
    dominios_inativos_em_uso: dominiosInativosEmUsoN,
    bloqueios,
  };
}

// ===== GET /api/admin/operational-domain-rbac/readiness =====
router.get('/readiness', async (c) => {
  const empresaId = getEmpresaId(c);
  const report = await computeReadiness(c.env.DB, empresaId);
  return c.json({ success: true, data: report });
});

// ===== GET /api/admin/operational-domain-rbac/unclassified =====
// Lists every setor/categoria/curso still missing a domain classification,
// for the minimal admin UI (Item 2) — the counterpart to the readiness
// counters above, giving an admin what to actually click on to fix them.
router.get('/unclassified', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  const [setores, categorias, cursos] = await Promise.all([
    db
      .prepare(
        `SELECT id, nome FROM setores
          WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL AND dominio_codigo IS NULL
          ORDER BY nome`,
      )
      .bind(empresaId)
      .all<{ id: number; nome: string | null }>(),
    db
      .prepare(
        `SELECT id, nome FROM qualificacoes_categorias
          WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL AND dominio_codigo IS NULL
          ORDER BY nome`,
      )
      .bind(empresaId)
      .all<{ id: number; nome: string | null }>(),
    db
      .prepare(
        `SELECT id, titulo FROM lms_cursos
          WHERE empresa_id = ? AND deleted_at IS NULL AND dominio_codigo IS NULL
          ORDER BY titulo`,
      )
      .bind(empresaId)
      .all<{ id: number; titulo: string | null }>(),
  ]);

  return c.json({
    success: true,
    data: {
      dominios_validos: OPERATIONAL_DOMAINS,
      setores: setores.results || [],
      categorias: categorias.results || [],
      cursos: cursos.results || [],
    },
  });
});

const classifySchema = z.object({
  resource_type: z.enum(['setor', 'categoria', 'curso']),
  resource_id: z.number().int().positive(),
  dominio_codigo: z.string().trim().min(1),
});

const CLASSIFIABLE_TABLES: Record<'setor' | 'categoria' | 'curso', { table: string; label: string }> = {
  setor: { table: 'setores', label: 'nome' },
  categoria: { table: 'qualificacoes_categorias', label: 'nome' },
  curso: { table: 'lms_cursos', label: 'titulo' },
};

// ===== POST /api/admin/operational-domain-rbac/classify =====
// Admin-only, tenant-scoped, audited way to assign one of the five
// canonical domains to a setor/categoria/curso — the functional
// counterpart to Item 2, so classification never requires direct DB
// editing. Never accepts free text: dominio_codigo must be one of the
// catalog's canonical codes.
router.post('/classify', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const body = await c.req.json();
  const parsed = classifySchema.safeParse(body);
  if (!parsed.success) {
    badRequest(parsed.error.issues[0]?.message ?? 'Dados inválidos');
  }
  const { resource_type: resourceType, resource_id: resourceId, dominio_codigo: dominioCodigo } =
    parsed.data;

  // Fix 1: validate against dominios_operacionais itself (existing AND
  // ativo=1), not just the static 5-code list — a domain that exists in
  // the catalog but was deactivated must be just as unusable for new
  // classifications as one that never existed.
  const activeCodes = await activeDomainCodes(db);
  if (!activeCodes.has(dominioCodigo as OperationalDomain)) {
    badRequest(
      `Domínio operacional desconhecido ou inativo: ${dominioCodigo}`,
      'UNKNOWN_OR_INACTIVE_OPERATIONAL_DOMAIN',
    );
  }

  const { table } = CLASSIFIABLE_TABLES[resourceType];
  const existing = await db
    .prepare(`SELECT id, dominio_codigo FROM ${table} WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`)
    .bind(resourceId, empresaId)
    .first<{ id: number; dominio_codigo: string | null }>();

  if (!existing) {
    notFound(`${resourceType} não encontrado(a) nesta empresa`);
  }

  await db
    .prepare(`UPDATE ${table} SET dominio_codigo = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ?`)
    .bind(dominioCodigo, resourceId, empresaId)
    .run();

  const ua = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: table,
    acao: 'UPDATE',
    registro_id: resourceId,
    dados_anteriores: { dominio_codigo: existing.dominio_codigo },
    dados_novos: { dominio_codigo: dominioCodigo },
    ...ua,
  });

  return c.json({
    success: true,
    data: { resource_type: resourceType, resource_id: resourceId, dominio_codigo: dominioCodigo },
  });
});

// ===== POST /api/admin/operational-domain-rbac/activate =====
router.post('/activate', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  const report = await computeReadiness(db, empresaId);
  if (!report.ready) {
    throw new ApiError(
      'Tenant não está pronto para ativar o RBAC operacional por domínio',
      409,
      'OPERATIONAL_DOMAIN_RBAC_NOT_READY',
    );
  }

  await db
    .prepare('UPDATE empresas SET operational_domain_rbac_enabled = 1 WHERE id = ?')
    .bind(empresaId)
    .run();

  const ua = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'empresas',
    acao: 'UPDATE',
    registro_id: empresaId,
    dados_novos: { operational_domain_rbac_enabled: 1 },
    ...ua,
  });

  return c.json({ success: true, data: { empresa_id: empresaId, operational_domain_rbac_enabled: true } });
});

// ===== POST /api/admin/operational-domain-rbac/deactivate =====
router.post('/deactivate', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  await db
    .prepare('UPDATE empresas SET operational_domain_rbac_enabled = 0 WHERE id = ?')
    .bind(empresaId)
    .run();

  const ua = extrairUsuarioAuditoria(c);
  await registrarAuditoria({
    db,
    tabela: 'empresas',
    acao: 'UPDATE',
    registro_id: empresaId,
    dados_novos: { operational_domain_rbac_enabled: 0 },
    ...ua,
  });

  return c.json({ success: true, data: { empresa_id: empresaId, operational_domain_rbac_enabled: false } });
});

export default router;
