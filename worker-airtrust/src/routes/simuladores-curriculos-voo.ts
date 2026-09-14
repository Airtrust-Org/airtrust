import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { requireOperacoes } from './simuladores-modelos-rbac';
import { audit } from './simuladores-shared';
import {
  loadSimulatorCurriculumCycleConfig,
  resolveAnnualCurriculumCycle,
} from '../services/simulator-curriculum-cycles';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

type CurriculumModelRow = {
  id: number;
  codigo: string;
  nome: string;
  modelo_aeronave: string | null;
  duracao_estimada: number | null;
  ordem_no_treinamento: number | null;
  gera_qualificacao: number | null;
  qualificacao_tipo_id: number | null;
  qualificacao_tipo_codigo?: string | null;
  qualificacao_tipo_nome?: string | null;
  codigo_canonico?: string | null;
  ciclo?: number | null;
  ativo?: number | null;
};

type CurriculumQualificationRow = {
  id: number;
  codigo: string | null;
  nome: string;
};

export function normalizeCurriculumModelIds(
  value: unknown,
): { ok: true; ids: number[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: 'modelo_ids deve ser uma lista ordenada' };
  }
  if (value.length > 50) {
    return { ok: false, error: 'Um currículo pode conter no máximo 50 sessões' };
  }

  const ids = value.map((item) => Number(item));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { ok: false, error: 'modelo_ids contém identificador inválido' };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: 'A mesma sessão não pode aparecer duas vezes no currículo' };
  }
  return { ok: true, ids };
}

function normalizeEquipment(value: unknown): string {
  const compact = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!compact) return 'UNIVERSAL';
  if (compact.includes('AW139')) return 'AW139';
  if (compact.includes('SK76') || compact.includes('S76')) return 'SK76';
  return compact;
}

async function loadVooQualification(
  db: D1Database,
  empresaId: number,
  qualificacaoTipoId: number,
): Promise<CurriculumQualificationRow | null> {
  return (
    (await db
      .prepare(
        `SELECT qt.id, qt.codigo, qt.nome
           FROM qualificacoes_tipos qt
           INNER JOIN qualificacoes_categorias qc
             ON qc.id = qt.categoria_id
            AND qc.empresa_id = qt.empresa_id
            AND qc.deleted_at IS NULL
            AND COALESCE(qc.ativo, 1) = 1
          WHERE qt.id = ?
            AND qt.empresa_id = ?
            AND qt.deleted_at IS NULL
            AND COALESCE(qt.ativo, 1) = 1
            AND UPPER(TRIM(COALESCE(qc.codigo, ''))) = 'VOO'
          LIMIT 1`,
      )
      .bind(qualificacaoTipoId, empresaId)
      .first<CurriculumQualificationRow>()) || null
  );
}

async function optionalTableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .bind(tableName)
    .first<{ name: string }>();
  return row?.name === tableName;
}

async function loadCanonicalModelCatalog(
  db: D1Database,
  empresaId: number,
  includeInactive = true,
): Promise<CurriculumModelRow[]> {
  const hasVersioning = await optionalTableExists(db, 'modelos_sessao_versionamento');
  const versioningJoin = hasVersioning
    ? `INNER JOIN modelos_sessao_versionamento msv
         ON msv.modelo_id = ms.id
        AND msv.empresa_id = ms.empresa_id
        AND msv.is_current = 1`
    : '';
  const canonicalSelect = hasVersioning
    ? 'msv.codigo_canonico AS codigo_canonico, msv.codigo_canonico AS codigo'
    : 'ms.codigo AS codigo_canonico, ms.codigo AS codigo';
  const orderBy = hasVersioning ? 'msv.codigo_canonico, ms.id' : 'ms.codigo, ms.id';

  const rows = await db
    .prepare(
      `SELECT ms.id,
              ${canonicalSelect},
              ms.nome,
              ms.modelo_aeronave,
              ms.duracao_estimada,
              ms.ativo,
              ms.ordem_no_treinamento,
              ms.gera_qualificacao,
              ms.qualificacao_tipo_id,
              qt.codigo AS qualificacao_tipo_codigo,
              qt.nome AS qualificacao_tipo_nome
         FROM modelos_sessao ms
         ${versioningJoin}
         LEFT JOIN qualificacoes_tipos qt
           ON qt.id = ms.qualificacao_tipo_id
          AND qt.empresa_id = ms.empresa_id
          AND qt.deleted_at IS NULL
        WHERE ms.empresa_id = ?
          AND ms.deleted_at IS NULL
          ${includeInactive ? '' : 'AND COALESCE(ms.ativo, 1) = 1'}
        ORDER BY ${orderBy}`,
    )
    .bind(empresaId)
    .all<CurriculumModelRow>();
  return rows.results || [];
}

async function loadCycleSessions(
  db: D1Database,
  empresaId: number,
  qualificacaoTipoId: number,
): Promise<CurriculumModelRow[]> {
  const hasVersioning = await optionalTableExists(db, 'modelos_sessao_versionamento');
  if (!(await optionalTableExists(db, 'simuladores_curriculos_voo_itens'))) return [];
  const sql = hasVersioning
    ? `SELECT ms.id,
              msv.codigo_canonico AS codigo,
              msv.codigo_canonico AS codigo_canonico,
              ms.nome,
              ms.modelo_aeronave,
              ms.duracao_estimada,
              i.ordem AS ordem_no_treinamento,
              ms.gera_qualificacao,
              i.qualificacao_tipo_id,
              i.ciclo
         FROM simuladores_curriculos_voo_itens i
         INNER JOIN modelos_sessao_versionamento msv
           ON msv.empresa_id = i.empresa_id
          AND msv.codigo_canonico = i.codigo_canonico
          AND msv.is_current = 1
         INNER JOIN modelos_sessao ms
           ON ms.id = msv.modelo_id
          AND ms.empresa_id = i.empresa_id
          AND ms.deleted_at IS NULL
          AND COALESCE(ms.ativo, 1) = 1
        WHERE i.empresa_id = ?
          AND i.qualificacao_tipo_id = ?
          AND i.deleted_at IS NULL
        ORDER BY i.ciclo, i.ordem, ms.id`
    : `SELECT ms.id,
              COALESCE(NULLIF(TRIM(i.codigo_canonico), ''), ms.codigo) AS codigo,
              COALESCE(NULLIF(TRIM(i.codigo_canonico), ''), ms.codigo) AS codigo_canonico,
              ms.nome,
              ms.modelo_aeronave,
              ms.duracao_estimada,
              i.ordem AS ordem_no_treinamento,
              ms.gera_qualificacao,
              i.qualificacao_tipo_id,
              i.ciclo
         FROM simuladores_curriculos_voo_itens i
         INNER JOIN modelos_sessao ms
           ON ms.id = i.modelo_sessao_id
          AND ms.empresa_id = i.empresa_id
          AND ms.deleted_at IS NULL
          AND COALESCE(ms.ativo, 1) = 1
        WHERE i.empresa_id = ?
          AND i.qualificacao_tipo_id = ?
          AND i.deleted_at IS NULL
        ORDER BY i.ciclo, i.ordem, ms.id`;
  const rows = await db.prepare(sql).bind(empresaId, qualificacaoTipoId).all<CurriculumModelRow>();
  return rows.results || [];
}

async function loadLegacyCurriculumSessions(
  db: D1Database,
  empresaId: number,
  qualificacaoTipoId: number,
): Promise<CurriculumModelRow[]> {
  const hasVersioning = await optionalTableExists(db, 'modelos_sessao_versionamento');
  const versioningJoin = hasVersioning
    ? `INNER JOIN modelos_sessao_versionamento msv
         ON msv.modelo_id = ms.id
        AND msv.empresa_id = ms.empresa_id
        AND msv.is_current = 1`
    : '';
  const canonicalSelect = hasVersioning
    ? 'msv.codigo_canonico AS codigo_canonico, msv.codigo_canonico AS codigo'
    : 'ms.codigo AS codigo_canonico, ms.codigo AS codigo';
  const rows = await db
    .prepare(
      `SELECT ms.id,
              ${canonicalSelect},
              ms.nome,
              ms.modelo_aeronave,
              ms.duracao_estimada,
              ms.ordem_no_treinamento,
              ms.gera_qualificacao,
              ms.qualificacao_tipo_id
         FROM modelos_sessao ms
         ${versioningJoin}
        WHERE ms.empresa_id = ?
          AND ms.deleted_at IS NULL
          AND COALESCE(ms.ativo, 1) = 1
          AND ms.qualificacao_tipo_id = ?
          AND ms.ordem_no_treinamento IS NOT NULL
        ORDER BY ms.ordem_no_treinamento, ms.id`,
    )
    .bind(empresaId, qualificacaoTipoId)
    .all<CurriculumModelRow>();
  return rows.results || [];
}

async function loadCurriculumDetail(db: D1Database, empresaId: number, qualificacaoTipoId: number) {
  const qualification = await loadVooQualification(db, empresaId, qualificacaoTipoId);
  if (!qualification) return null;

  const available = await loadCanonicalModelCatalog(db, empresaId);
  const cycleConfig = await loadSimulatorCurriculumCycleConfig({
    db,
    empresaId,
    qualificationTypeId: qualificacaoTipoId,
  });

  if (cycleConfig) {
    const allCycleSessions = await loadCycleSessions(db, empresaId, qualificacaoTipoId);
    const referenceYear = new Date().getUTCFullYear();
    const activeCycle = resolveAnnualCurriculumCycle({
      referenceYear,
      baseYear: cycleConfig.base_year,
      baseCycle: cycleConfig.base_cycle,
      totalCycles: cycleConfig.total_cycles,
    });
    const cycles = Array.from({ length: cycleConfig.total_cycles }, (_, index) => {
      const cycle = index + 1;
      const sessions = allCycleSessions.filter((row) => Number(row.ciclo) === cycle);
      return {
        cycle,
        sessions,
        total_sessions: sessions.length,
        total_minutes: sessions.reduce(
          (sum, row) => sum + Math.max(0, Number(row.duracao_estimada || 0)),
          0,
        ),
      };
    });
    const active = cycles.find((row) => row.cycle === activeCycle) || cycles[0];
    return {
      qualification,
      sessions: active?.sessions || [],
      available_models: available,
      total_sessions: active?.total_sessions || 0,
      total_minutes: active?.total_minutes || 0,
      cycle_config: {
        total_cycles: cycleConfig.total_cycles,
        base_year: cycleConfig.base_year,
        base_cycle: cycleConfig.base_cycle,
        reference_year: referenceYear,
        active_cycle: activeCycle,
      },
      cycles,
    };
  }

  const sessions = await loadLegacyCurriculumSessions(db, empresaId, qualificacaoTipoId);
  const totalMinutes = sessions.reduce(
    (sum, row) => sum + Math.max(0, Number(row.duracao_estimada || 0)),
    0,
  );
  return {
    qualification,
    sessions,
    available_models: available,
    total_sessions: sessions.length,
    total_minutes: totalMinutes,
    cycle_config: null,
    cycles: [],
  };
}

async function replaceCycleCurriculum(params: {
  db: D1Database;
  empresaId: number;
  qualificacaoTipoId: number;
  cycle: number;
  totalCycles: number;
  ids: number[];
}) {
  if (!Number.isInteger(params.cycle) || params.cycle < 1 || params.cycle > params.totalCycles) {
    return { ok: false as const, status: 422 as const, error: 'Ciclo curricular inválido' };
  }

  const catalog = await loadCanonicalModelCatalog(params.db, params.empresaId, false);
  const catalogById = new Map(catalog.map((row) => [Number(row.id), row]));
  const selected = params.ids
    .map((id) => catalogById.get(id))
    .filter(Boolean) as CurriculumModelRow[];
  if (selected.length !== params.ids.length) {
    return {
      ok: false as const,
      status: 422 as const,
      error: 'Há sessão inexistente, inativa, histórica ou de outro tenant',
    };
  }

  for (const row of selected) {
    if (!Number.isFinite(Number(row.duracao_estimada)) || Number(row.duracao_estimada) <= 0) {
      return {
        ok: false as const,
        status: 422 as const,
        error: `A sessão ${row.codigo_canonico || row.codigo} precisa ter duração válida antes de entrar no currículo`,
      };
    }
  }

  const equipmentSet = new Set(
    selected
      .map((row) => normalizeEquipment(row.modelo_aeronave))
      .filter((equipment) => equipment !== 'UNIVERSAL'),
  );
  if (equipmentSet.size > 1) {
    return {
      ok: false as const,
      status: 422 as const,
      error: 'Um currículo de voo não pode misturar modelos de aeronave diferentes',
    };
  }

  const canonicalCodes = selected.map((row) => String(row.codigo_canonico || row.codigo).trim());
  if (canonicalCodes.length > 0) {
    const placeholders = canonicalCodes.map(() => '?').join(', ');
    const conflicting = await params.db
      .prepare(
        `SELECT i.codigo_canonico, qt.codigo AS qualificacao_codigo, qt.nome AS qualificacao_nome
           FROM simuladores_curriculos_voo_itens i
           LEFT JOIN qualificacoes_tipos qt
             ON qt.id = i.qualificacao_tipo_id
            AND qt.empresa_id = i.empresa_id
          WHERE i.empresa_id = ?
            AND i.qualificacao_tipo_id <> ?
            AND i.deleted_at IS NULL
            AND i.codigo_canonico IN (${placeholders})
          LIMIT 1`,
      )
      .bind(params.empresaId, params.qualificacaoTipoId, ...canonicalCodes)
      .first<{
        codigo_canonico: string;
        qualificacao_codigo: string | null;
        qualificacao_nome: string | null;
      }>();
    if (conflicting) {
      return {
        ok: false as const,
        status: 409 as const,
        error: `A sessão ${conflicting.codigo_canonico} já pertence ao currículo ${conflicting.qualificacao_codigo || conflicting.qualificacao_nome || 'de outro treinamento'}`,
      };
    }
  }

  const previousRows = await params.db
    .prepare(
      `SELECT id, modelo_sessao_id, codigo_canonico, ordem
         FROM simuladores_curriculos_voo_itens
        WHERE empresa_id = ?
          AND qualificacao_tipo_id = ?
          AND ciclo = ?
          AND deleted_at IS NULL
        ORDER BY ordem, id`,
    )
    .bind(params.empresaId, params.qualificacaoTipoId, params.cycle)
    .all<{ id: number; modelo_sessao_id: number; codigo_canonico: string; ordem: number }>();
  const previous = previousRows.results || [];

  const statements: ReturnType<D1Database['prepare']>[] = [];
  if (previous.length > 0) {
    statements.push(
      params.db
        .prepare(
          `UPDATE simuladores_curriculos_voo_itens
              SET deleted_at = datetime('now'), updated_at = datetime('now')
            WHERE empresa_id = ?
              AND qualificacao_tipo_id = ?
              AND ciclo = ?
              AND deleted_at IS NULL`,
        )
        .bind(params.empresaId, params.qualificacaoTipoId, params.cycle),
    );
  }
  selected.forEach((row, index) => {
    statements.push(
      params.db
        .prepare(
          `INSERT INTO simuladores_curriculos_voo_itens
             (empresa_id, qualificacao_tipo_id, ciclo, modelo_sessao_id, codigo_canonico, ordem,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          params.empresaId,
          params.qualificacaoTipoId,
          params.cycle,
          Number(row.id),
          String(row.codigo_canonico || row.codigo).trim(),
          index + 1,
        ),
    );
  });
  if (statements.length > 0) await params.db.batch(statements);

  return {
    ok: true as const,
    previous,
    selected,
  };
}

// Protect an explicit curriculum assignment from the legacy model editor, which
// historically sent qualificacao_tipo_id=null whenever gera_qualificacao=0.
// The curriculum editor is the canonical place to remove an assignment.
app.use('/modelos-sessao/:id', async (c, next) => {
  if (c.req.method !== 'PUT') return next();

  const empresaId = getTenantContext(c).empresaId;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return next();

  const body = (await c.req.raw
    .clone()
    .json()
    .catch(() => null)) as Record<string, unknown> | null;
  const disablesGeneratedQualification =
    body?.gera_qualificacao === 0 || body?.gera_qualificacao === false;
  const clearsQualification =
    body &&
    Object.prototype.hasOwnProperty.call(body, 'qualificacao_tipo_id') &&
    body.qualificacao_tipo_id == null;
  if (!disablesGeneratedQualification || !clearsQualification) return next();

  const previous = await c.env.DB.prepare(
    `SELECT qualificacao_tipo_id, ordem_no_treinamento
         FROM modelos_sessao
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
  )
    .bind(id, empresaId)
    .first<{ qualificacao_tipo_id: number | null; ordem_no_treinamento: number | null }>();

  await next();

  if (
    c.res.status < 400 &&
    previous?.qualificacao_tipo_id &&
    previous.ordem_no_treinamento != null
  ) {
    await c.env.DB.prepare(
      `UPDATE modelos_sessao
            SET qualificacao_tipo_id = ?, updated_at = datetime('now')
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL
            AND qualificacao_tipo_id IS NULL`,
    )
      .bind(previous.qualificacao_tipo_id, id, empresaId)
      .run();
  }
});

// GET /api/simuladores/curriculos-voo - list flight trainings and curriculum coverage.
app.get(
  '/curriculos-voo',
  requirePermission('simuladores', 'visualizar', 'admin', 'manager'),
  async (c) => {
    const empresaId = getTenantContext(c).empresaId;
    const rows = await c.env.DB.prepare(
      `SELECT qt.id,
              qt.codigo,
              qt.nome,
              COUNT(ms.id) AS total_sessoes,
              COALESCE(SUM(CASE WHEN ms.id IS NOT NULL THEN COALESCE(ms.duracao_estimada, 0) ELSE 0 END), 0) AS total_minutos,
              COALESCE(SUM(CASE WHEN ms.ordem_no_treinamento IS NOT NULL THEN 1 ELSE 0 END), 0) AS sessoes_ordenadas
         FROM qualificacoes_tipos qt
         INNER JOIN qualificacoes_categorias qc
           ON qc.id = qt.categoria_id
          AND qc.empresa_id = qt.empresa_id
          AND qc.deleted_at IS NULL
          AND COALESCE(qc.ativo, 1) = 1
         LEFT JOIN modelos_sessao ms
           ON ms.qualificacao_tipo_id = qt.id
          AND ms.empresa_id = qt.empresa_id
          AND ms.deleted_at IS NULL
          AND COALESCE(ms.ativo, 1) = 1
          AND ms.ordem_no_treinamento IS NOT NULL
        WHERE qt.empresa_id = ?
          AND qt.deleted_at IS NULL
          AND COALESCE(qt.ativo, 1) = 1
          AND UPPER(TRIM(COALESCE(qc.codigo, ''))) = 'VOO'
        GROUP BY qt.id, qt.codigo, qt.nome
        ORDER BY COALESCE(qt.codigo, ''), qt.nome`,
    )
      .bind(empresaId)
      .all();

    const data = (rows.results || []) as Array<Record<string, unknown>>;
    if (
      (await optionalTableExists(c.env.DB, 'simuladores_curriculos_voo_config')) &&
      (await optionalTableExists(c.env.DB, 'simuladores_curriculos_voo_itens'))
    ) {
      const configs = await c.env.DB.prepare(
        `SELECT qualificacao_tipo_id, total_ciclos, ano_base, ciclo_ano_base
             FROM simuladores_curriculos_voo_config
            WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL`,
      )
        .bind(empresaId)
        .all<{
          qualificacao_tipo_id: number;
          total_ciclos: number;
          ano_base: number;
          ciclo_ano_base: number;
        }>();
      const metrics = await c.env.DB.prepare(
        `SELECT i.qualificacao_tipo_id, i.ciclo, COUNT(i.id) AS total_sessoes,
                  COALESCE(SUM(COALESCE(ms.duracao_estimada, 0)), 0) AS total_minutos
             FROM simuladores_curriculos_voo_itens i
             LEFT JOIN modelos_sessao ms
               ON ms.id = i.modelo_sessao_id
              AND ms.empresa_id = i.empresa_id
            WHERE i.empresa_id = ? AND i.deleted_at IS NULL
            GROUP BY i.qualificacao_tipo_id, i.ciclo`,
      )
        .bind(empresaId)
        .all<{
          qualificacao_tipo_id: number;
          ciclo: number;
          total_sessoes: number;
          total_minutos: number;
        }>();
      const metricByKey = new Map(
        (metrics.results || []).map((metric) => [
          `${Number(metric.qualificacao_tipo_id)}:${Number(metric.ciclo)}`,
          metric,
        ]),
      );
      const configByQualification = new Map(
        (configs.results || []).map((config) => [Number(config.qualificacao_tipo_id), config]),
      );
      const referenceYear = new Date().getUTCFullYear();
      for (const row of data) {
        const config = configByQualification.get(Number(row.id));
        if (!config) continue;
        const activeCycle = resolveAnnualCurriculumCycle({
          referenceYear,
          baseYear: Number(config.ano_base),
          baseCycle: Number(config.ciclo_ano_base),
          totalCycles: Number(config.total_ciclos),
        });
        const metric = metricByKey.get(`${Number(row.id)}:${activeCycle}`);
        row.total_sessoes = Number(metric?.total_sessoes || 0);
        row.sessoes_ordenadas = Number(metric?.total_sessoes || 0);
        row.total_minutos = Number(metric?.total_minutos || 0);
        row.total_ciclos = Number(config.total_ciclos);
        row.ciclo_ativo = activeCycle;
        row.ano_referencia = referenceYear;
      }
    }

    return c.json({ success: true, data });
  },
);

// GET /api/simuladores/curriculos-voo/:qualificacaoTipoId - ordered curriculum and model catalog.
app.get(
  '/curriculos-voo/:qualificacaoTipoId',
  requirePermission('simuladores', 'visualizar', 'admin', 'manager'),
  async (c) => {
    const empresaId = getTenantContext(c).empresaId;
    const qualificacaoTipoId = Number(c.req.param('qualificacaoTipoId'));
    if (!Number.isInteger(qualificacaoTipoId) || qualificacaoTipoId <= 0) {
      return c.json({ success: false, error: 'Treinamento inválido' }, 400);
    }

    const detail = await loadCurriculumDetail(c.env.DB, empresaId, qualificacaoTipoId);
    if (!detail) return c.json({ success: false, error: 'Treinamento de voo não encontrado' }, 404);
    return c.json({ success: true, data: detail });
  },
);

// PUT /api/simuladores/curriculos-voo/:qualificacaoTipoId - replace ordered curriculum atomically.
app.put(
  '/curriculos-voo/:qualificacaoTipoId',
  requirePermission('simuladores', 'editar', 'admin', 'manager'),
  requireOperacoes('update'),
  async (c) => {
    const empresaId = getTenantContext(c).empresaId;
    const qualificacaoTipoId = Number(c.req.param('qualificacaoTipoId'));
    if (!Number.isInteger(qualificacaoTipoId) || qualificacaoTipoId <= 0) {
      return c.json({ success: false, error: 'Treinamento inválido' }, 400);
    }

    const qualification = await loadVooQualification(c.env.DB, empresaId, qualificacaoTipoId);
    if (!qualification) {
      return c.json({ success: false, error: 'Treinamento de voo não encontrado' }, 404);
    }

    const body = (await c.req.json().catch(() => null)) as {
      modelo_ids?: unknown;
      ciclo?: unknown;
    } | null;
    const normalized = normalizeCurriculumModelIds(body?.modelo_ids);
    if (!normalized.ok) return c.json({ success: false, error: normalized.error }, 422);
    const ids = normalized.ids;

    const cycleConfig = await loadSimulatorCurriculumCycleConfig({
      db: c.env.DB,
      empresaId,
      qualificationTypeId: qualificacaoTipoId,
    });
    if (cycleConfig) {
      const cycle = Number(body?.ciclo);
      const replaced = await replaceCycleCurriculum({
        db: c.env.DB,
        empresaId,
        qualificacaoTipoId,
        cycle,
        totalCycles: cycleConfig.total_cycles,
        ids,
      });
      if (!replaced.ok) {
        return c.json({ success: false, error: replaced.error }, replaced.status);
      }

      await audit(c.env.DB, {
        tabela: 'simuladores_curriculos_voo_itens',
        acao: 'CURRICULUM_CYCLE_REPLACE',
        registro_id: qualificacaoTipoId,
        dados_anteriores: {
          ciclo: cycle,
          modelo_ids: replaced.previous.map((row) => Number(row.modelo_sessao_id)),
          codigos_canonicos: replaced.previous.map((row) => row.codigo_canonico),
        },
        dados_novos: {
          ciclo: cycle,
          modelo_ids: ids,
          codigos_canonicos: replaced.selected.map((row) => row.codigo_canonico || row.codigo),
          total_sessoes: ids.length,
        },
      });

      const detail = await loadCurriculumDetail(c.env.DB, empresaId, qualificacaoTipoId);
      return c.json({ success: true, data: detail });
    }

    const currentRows = await c.env.DB.prepare(
      `SELECT id, codigo, nome, modelo_aeronave, duracao_estimada,
                ordem_no_treinamento, gera_qualificacao, qualificacao_tipo_id
           FROM modelos_sessao
          WHERE empresa_id = ?
            AND deleted_at IS NULL
            AND COALESCE(ativo, 1) = 1
            AND qualificacao_tipo_id = ?
            AND ordem_no_treinamento IS NOT NULL
          ORDER BY ordem_no_treinamento, id`,
    )
      .bind(empresaId, qualificacaoTipoId)
      .all<CurriculumModelRow>();
    const current = currentRows.results || [];

    let selected: CurriculumModelRow[] = [];
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(', ');
      const selectedRows = await c.env.DB.prepare(
        `SELECT id, codigo, nome, modelo_aeronave, duracao_estimada,
                  ordem_no_treinamento, gera_qualificacao, qualificacao_tipo_id
             FROM modelos_sessao
            WHERE empresa_id = ?
              AND deleted_at IS NULL
              AND COALESCE(ativo, 1) = 1
              AND id IN (${placeholders})`,
      )
        .bind(empresaId, ...ids)
        .all<CurriculumModelRow>();
      selected = selectedRows.results || [];
      if (selected.length !== ids.length) {
        return c.json(
          { success: false, error: 'Há sessão inexistente, inativa ou de outro tenant' },
          422,
        );
      }
    }

    const selectedById = new Map(selected.map((row) => [Number(row.id), row]));
    const selectedIds = new Set(ids);

    for (const id of ids) {
      const row = selectedById.get(id)!;
      if (row.qualificacao_tipo_id && Number(row.qualificacao_tipo_id) !== qualificacaoTipoId) {
        return c.json(
          {
            success: false,
            error: `A sessão ${row.codigo} já está vinculada a outro treinamento. Remova o vínculo anterior antes de reutilizá-la.`,
          },
          409,
        );
      }
      if (!Number.isFinite(Number(row.duracao_estimada)) || Number(row.duracao_estimada) <= 0) {
        return c.json(
          {
            success: false,
            error: `A sessão ${row.codigo} precisa ter duração válida antes de entrar no currículo`,
          },
          422,
        );
      }
    }

    for (const row of current) {
      if (Number(row.gera_qualificacao || 0) === 1 && !selectedIds.has(Number(row.id))) {
        return c.json(
          {
            success: false,
            error: `A sessão ${row.codigo} gera a qualificação deste treinamento e não pode ser removida do currículo enquanto essa geração estiver ativa.`,
          },
          409,
        );
      }
    }

    const equipmentSet = new Set(
      selected
        .map((row) => normalizeEquipment(row.modelo_aeronave))
        .filter((equipment) => equipment !== 'UNIVERSAL'),
    );
    if (equipmentSet.size > 1) {
      return c.json(
        {
          success: false,
          error: 'Um currículo de voo não pode misturar modelos de aeronave diferentes',
        },
        422,
      );
    }

    const statements: ReturnType<D1Database['prepare']>[] = [];
    for (const row of current) {
      if (!selectedIds.has(Number(row.id))) {
        statements.push(
          c.env.DB.prepare(
            `UPDATE modelos_sessao
                SET qualificacao_tipo_id = NULL,
                    ordem_no_treinamento = NULL,
                    updated_at = datetime('now')
              WHERE id = ?
                AND empresa_id = ?
                AND deleted_at IS NULL
                AND COALESCE(gera_qualificacao, 0) = 0`,
          ).bind(row.id, empresaId),
        );
      }
    }
    ids.forEach((modeloId, index) => {
      statements.push(
        c.env.DB.prepare(
          `UPDATE modelos_sessao
              SET qualificacao_tipo_id = ?,
                  ordem_no_treinamento = ?,
                  updated_at = datetime('now')
            WHERE id = ?
              AND empresa_id = ?
              AND deleted_at IS NULL`,
        ).bind(qualificacaoTipoId, index + 1, modeloId, empresaId),
      );
    });

    if (statements.length > 0) await c.env.DB.batch(statements);

    await audit(c.env.DB, {
      tabela: 'modelos_sessao',
      acao: 'CURRICULUM_REPLACE',
      registro_id: qualificacaoTipoId,
      dados_anteriores: {
        modelo_ids: current.map((row) => Number(row.id)),
      },
      dados_novos: {
        modelo_ids: ids,
        total_sessoes: ids.length,
      },
    });

    const detail = await loadCurriculumDetail(c.env.DB, empresaId, qualificacaoTipoId);
    return c.json({ success: true, data: detail });
  },
);

export default app;
