import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { requireOperacoes } from './simuladores-modelos-rbac';
import { audit } from './simuladores-shared';

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

async function loadCurriculumDetail(db: D1Database, empresaId: number, qualificacaoTipoId: number) {
  const qualification = await loadVooQualification(db, empresaId, qualificacaoTipoId);
  if (!qualification) return null;

  const current = await db
    .prepare(
      `SELECT ms.id,
              ms.codigo,
              ms.nome,
              ms.modelo_aeronave,
              ms.duracao_estimada,
              ms.ordem_no_treinamento,
              ms.gera_qualificacao,
              ms.qualificacao_tipo_id
         FROM modelos_sessao ms
        WHERE ms.empresa_id = ?
          AND ms.deleted_at IS NULL
          AND COALESCE(ms.ativo, 1) = 1
          AND ms.qualificacao_tipo_id = ?
        ORDER BY COALESCE(ms.ordem_no_treinamento, 999999), ms.id`,
    )
    .bind(empresaId, qualificacaoTipoId)
    .all<CurriculumModelRow>();

  const available = await db
    .prepare(
      `SELECT ms.id,
              ms.codigo,
              ms.nome,
              ms.modelo_aeronave,
              ms.duracao_estimada,
              ms.ordem_no_treinamento,
              ms.gera_qualificacao,
              ms.qualificacao_tipo_id,
              qt.codigo AS qualificacao_tipo_codigo,
              qt.nome AS qualificacao_tipo_nome
         FROM modelos_sessao ms
         LEFT JOIN qualificacoes_tipos qt
           ON qt.id = ms.qualificacao_tipo_id
          AND qt.empresa_id = ms.empresa_id
          AND qt.deleted_at IS NULL
        WHERE ms.empresa_id = ?
          AND ms.deleted_at IS NULL
          AND COALESCE(ms.ativo, 1) = 1
        ORDER BY COALESCE(ms.modelo_aeronave, ''), ms.codigo, ms.id`,
    )
    .bind(empresaId)
    .all<CurriculumModelRow>();

  const sessions = current.results || [];
  const totalMinutes = sessions.reduce((sum, row) => sum + Math.max(0, Number(row.duracao_estimada || 0)), 0);

  return {
    qualification,
    sessions,
    available_models: available.results || [],
    total_sessions: sessions.length,
    total_minutes: totalMinutes,
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

  const body = (await c.req.raw.clone().json().catch(() => null)) as Record<string, unknown> | null;
  const disablesGeneratedQualification = body?.gera_qualificacao === 0 || body?.gera_qualificacao === false;
  const clearsQualification = body && Object.prototype.hasOwnProperty.call(body, 'qualificacao_tipo_id') && body.qualificacao_tipo_id == null;
  if (!disablesGeneratedQualification || !clearsQualification) return next();

  const previous = await c.env.DB
    .prepare(
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
    await c.env.DB
      .prepare(
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
app.get('/curriculos-voo', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getTenantContext(c).empresaId;
  const rows = await c.env.DB
    .prepare(
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
        WHERE qt.empresa_id = ?
          AND qt.deleted_at IS NULL
          AND COALESCE(qt.ativo, 1) = 1
          AND UPPER(TRIM(COALESCE(qc.codigo, ''))) = 'VOO'
        GROUP BY qt.id, qt.codigo, qt.nome
        ORDER BY COALESCE(qt.codigo, ''), qt.nome`,
    )
    .bind(empresaId)
    .all();

  return c.json({ success: true, data: rows.results || [] });
});

// GET /api/simuladores/curriculos-voo/:qualificacaoTipoId - ordered curriculum and model catalog.
app.get('/curriculos-voo/:qualificacaoTipoId', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getTenantContext(c).empresaId;
  const qualificacaoTipoId = Number(c.req.param('qualificacaoTipoId'));
  if (!Number.isInteger(qualificacaoTipoId) || qualificacaoTipoId <= 0) {
    return c.json({ success: false, error: 'Treinamento inválido' }, 400);
  }

  const detail = await loadCurriculumDetail(c.env.DB, empresaId, qualificacaoTipoId);
  if (!detail) return c.json({ success: false, error: 'Treinamento de voo não encontrado' }, 404);
  return c.json({ success: true, data: detail });
});

// PUT /api/simuladores/curriculos-voo/:qualificacaoTipoId - replace ordered curriculum atomically.
app.put(
  '/curriculos-voo/:qualificacaoTipoId',
  requireRole('admin', 'manager'),
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

    const body = (await c.req.json().catch(() => null)) as { modelo_ids?: unknown } | null;
    const normalized = normalizeCurriculumModelIds(body?.modelo_ids);
    if (!normalized.ok) return c.json({ success: false, error: normalized.error }, 422);
    const ids = normalized.ids;

    const currentRows = await c.env.DB
      .prepare(
        `SELECT id, codigo, nome, modelo_aeronave, duracao_estimada,
                ordem_no_treinamento, gera_qualificacao, qualificacao_tipo_id
           FROM modelos_sessao
          WHERE empresa_id = ?
            AND deleted_at IS NULL
            AND COALESCE(ativo, 1) = 1
            AND qualificacao_tipo_id = ?
          ORDER BY COALESCE(ordem_no_treinamento, 999999), id`,
      )
      .bind(empresaId, qualificacaoTipoId)
      .all<CurriculumModelRow>();
    const current = currentRows.results || [];

    let selected: CurriculumModelRow[] = [];
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(', ');
      const selectedRows = await c.env.DB
        .prepare(
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
        return c.json({ success: false, error: 'Há sessão inexistente, inativa ou de outro tenant' }, 422);
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
          { success: false, error: `A sessão ${row.codigo} precisa ter duração válida antes de entrar no currículo` },
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
        { success: false, error: 'Um currículo de voo não pode misturar modelos de aeronave diferentes' },
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
