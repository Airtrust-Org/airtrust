/**
 * SIMULADORES — Fichas (fichas-simulador routes)
 * Routes for manobras and qualificacao generation (must be mounted BEFORE /fichas/:id).
 *   GET  /fichas-simulador/:id/manobras
 *   PUT  /fichas-simulador/:fichaId/manobras/:ordem
 *   POST /fichas-simulador/:id/popular-manobras
 *   POST /fichas-simulador/:id/gerar-qualificacao
 *   GET  /fichas-simulador/:id/gerar-pdf
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { getEmpresaId } from '../middleware/tenant';
import { resolveModeloSessaoObservacoesOverride } from '../../../src/shared/simuladores/modelos-sessao-observacoes';
import {
  gerarQualificacaoDaFicha,
  getQualificacaoGeracaoErrorStatus,
} from './simuladores-fichas-helpers';
import { getFichaAvailabilityFromDb } from '../utils/ficha-availability';
import { buildOperationalFichaManobras, FICHA_TECNICAS_PADRAO_LIMITE } from '../constants/notechs';
import {
  requireOperationalAccess,
  } from '../services/operational-domain-access';

// Fichas de sessão de simulador são fixed-domain OPERACOES — see
// docs/rbac/gestor-operational-autonomy.md.
const requireOperacoesFicha = (action: 'update' | 'create' | 'issue') =>
  requireOperationalAccess({ domain: 'OPERACOES', action, resourceType: 'simulador_ficha' });

const app = new Hono<{ Bindings: Env }>();

app.get('/fichas-simulador/:id/manobras', async (c) => {
  try {
    const id = c.req.param('id');
    const empresaId = getEmpresaId(c);
    const m = await c.env.DB.prepare(
      `SELECT fsm.*
       FROM fichas_sessao_manobras fsm
       JOIN fichas_sessao fs ON fs.id = fsm.ficha_id AND fs.deleted_at IS NULL
       WHERE fsm.ficha_id = ? AND fs.empresa_id = ? AND fsm.deleted_at IS NULL
       ORDER BY fsm.ordem`,
    )
      .bind(id, empresaId)
      .all();
    return c.json({ success: true, data: m.results });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PUT /fichas-simulador/:fichaId/manobras/:ordem - Atualizar manobra individual
// ✅ Uses ordem (1-22) instead of individual ID
app.put(
  '/fichas-simulador/:fichaId/manobras/:ordem',
  requireOperacoesFicha('update'),
  async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const { fichaId, ordem } = c.req.param();
    const b = await c.req.json();

    // Record-level tenant boundary must be proven before availability/model
    // lookups or any read/write by ficha_id.
    const fichaTenant = await c.env.DB.prepare(
      'SELECT id FROM fichas_sessao WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
      .bind(fichaId, empresaId)
      .first<{ id: number }>();
    if (!fichaTenant) {
      return c.json({ success: false, error: 'Ficha não encontrada' }, 404);
    }

    const availability = await getFichaAvailabilityFromDb(c.env.DB, fichaId);
    if (!availability.available) {
      return c.json(
        {
          success: false,
          code: availability.code,
          error: availability.message,
          details: {
            ficha_id: Number(fichaId),
            session_starts_at: availability.sessionStartsAt,
            timezone: availability.timezone,
          },
        },
        409,
      );
    }

    // 1) Try to find existing manobra by ficha_id + ordem
    let manobra = await c.env.DB.prepare(
      'SELECT * FROM fichas_sessao_manobras WHERE ficha_id=? AND ordem=? AND deleted_at IS NULL',
    )
      .bind(fichaId, ordem)
      .first<any>();

    // 2) If not found, try to create from model
    if (!manobra) {
      const ficha = await c.env.DB.prepare(
        `SELECT
           fs.*,
           COALESCE(sa.tipo_sessao, fs.tipo_sessao) as tipo_sessao_real,
           COALESCE(aer.modelo, s.modelo, fs.tipo_aeronave) as tipo_aeronave_real
         FROM fichas_sessao fs
         LEFT JOIN simulador_agendamentos sa ON fs.agendamento_slot_id = sa.id
         LEFT JOIN simuladores s ON sa.simulador_id = s.id
         LEFT JOIN aeronaves aer ON fs.tipo_aeronave = aer.id
         WHERE fs.id = ? AND fs.empresa_id = ? AND fs.deleted_at IS NULL`,
      )
        .bind(fichaId, empresaId)
        .first();

      if (!ficha) {
        return c.json({ success: false, error: 'Ficha não encontrada' }, 404);
      }

      const tipoSessao = (ficha as any).tipo_sessao_real || ficha.tipo_sessao;
      const tipoAeronave = (ficha as any).tipo_aeronave_real || ficha.tipo_aeronave;
      const modelo = await c.env.DB.prepare(
        `SELECT ms.id
         FROM modelos_sessao ms
         INNER JOIN tipos_sessao ts ON ms.tipo_sessao_id = ts.id
         WHERE ts.codigo = ?
           AND ms.modelo_aeronave = ?
           AND ms.empresa_id = ?
           AND ms.deleted_at IS NULL
         LIMIT 1`,
      )
        .bind(tipoSessao, tipoAeronave, empresaId)
        .first();

      if (modelo) {
        const m = await c.env.DB.prepare(
          `SELECT m.codigo, COALESCE(m.nome, m.descricao) AS descricao, m.categoria, msm.observacoes
           FROM modelos_sessao_manobras msm
           INNER JOIN manobras m ON m.id = msm.manobra_id
           WHERE msm.modelo_id = ?
             AND msm.ordem = ?
             AND msm.deleted_at IS NULL
             AND m.deleted_at IS NULL
             AND m.empresa_id = ?
           LIMIT 1`,
        )
          .bind(modelo.id, ordem, empresaId)
          .first<{ codigo: string; descricao: string; categoria: string; observacoes: string | null }>();

        const codigo = m?.codigo || `ORD-${ordem}`;
        const descricaoOverride = resolveModeloSessaoObservacoesOverride(m?.observacoes);
        const descricao = descricaoOverride || m?.descricao || `Manobra ordem ${ordem}`;
        const categoria = m?.categoria || 'GERAL';

        await c.env.DB.prepare(
          `INSERT INTO fichas_sessao_manobras(
             ficha_id, codigo, descricao, categoria, ordem, resultado, observacoes
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            fichaId,
            codigo,
            descricao,
            categoria,
            Number(ordem),
            b.resultado ?? null,
            b.observacoes ?? '',
          )
          .run();

        manobra = await c.env.DB.prepare(
          'SELECT * FROM fichas_sessao_manobras WHERE ficha_id=? AND ordem=?',
        )
          .bind(fichaId, ordem)
          .first<any>();
      } else {
        await c.env.DB.prepare(
          `INSERT INTO fichas_sessao_manobras(
             ficha_id, codigo, descricao, categoria, ordem, resultado, observacoes
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            fichaId,
            `ORD-${ordem}`,
            `Manobra ordem ${ordem}`,
            'GERAL',
            Number(ordem),
            b.resultado ?? null,
            b.observacoes ?? '',
          )
          .run();

        manobra = await c.env.DB.prepare(
          'SELECT * FROM fichas_sessao_manobras WHERE ficha_id=? AND ordem=?',
        )
          .bind(fichaId, ordem)
          .first<any>();
      }
    }

    // 3) Update (idempotent)
    await c.env.DB.prepare(
      'UPDATE fichas_sessao_manobras SET resultado=?, observacoes=?, updated_at=datetime("now") WHERE ficha_id=? AND ordem=?',
    )
      .bind(
        b.resultado !== undefined ? b.resultado : manobra.resultado,
        b.observacoes !== undefined ? b.observacoes : manobra.observacoes,
        fichaId,
        ordem,
      )
      .run();

    const atual = await c.env.DB.prepare(
      'SELECT * FROM fichas_sessao_manobras WHERE ficha_id=? AND ordem=? AND deleted_at IS NULL',
    )
      .bind(fichaId, ordem)
      .first();

    return c.json({ success: true, data: atual });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /fichas-simulador/:id/popular-manobras
// Novo padrão operacional: 18 técnicas + 15 NOTECHS fixos.
app.post('/fichas-simulador/:id/popular-manobras', requireOperacoesFicha('create'), async (c) => {
  try {
    const role = String((c as unknown as { get: (k: string) => unknown }).get('userRole') || '').toUpperCase();
    const allowedRoles = ['ADMIN', 'ADMINISTRADOR', 'GESTOR', 'MANAGER', 'INSTRUTOR', 'COMPLIANCE'];
    if (!allowedRoles.includes(role)) {
      return c.json({ success: false, error: 'Acesso negado' }, 403);
    }

    const empresaId = getEmpresaId(c);
    const fid = c.req.param('id');
    const availability = await getFichaAvailabilityFromDb(c.env.DB, fid);
    if (!availability.available) {
      return c.json(
        {
          success: false,
          code: availability.code,
          error: availability.message,
          details: {
            ficha_id: Number(fid),
            session_starts_at: availability.sessionStartsAt,
            timezone: availability.timezone,
          },
        },
        409,
      );
    }

    const f = await c.env.DB.prepare(
      'SELECT * FROM fichas_sessao WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
    )
      .bind(fid, empresaId)
      .first();
    if (!f) return c.json({ success: false, error: 'Não encontrada' }, 404);

    const m = await c.env.DB.prepare(
      'SELECT codigo, COALESCE(nome, descricao) AS descricao, categoria, ordem FROM manobras WHERE empresa_id = ? AND tipo_sessao=? AND tipo_aeronave=? AND deleted_at IS NULL ORDER BY ordem',
    )
      .bind(empresaId, f.tipo_sessao, f.tipo_aeronave || '')
      .all();

    if (m.results.length < FICHA_TECNICAS_PADRAO_LIMITE) {
      return c.json(
        {
          success: false,
          error: `Apenas ${m.results.length} manobras disponíveis no catálogo. Necessário ${FICHA_TECNICAS_PADRAO_LIMITE}.`,
        },
        400,
      );
    }

    const manobras = buildOperationalFichaManobras(m.results as any[]);
    const insertStmts = manobras.map((ma: any) =>
      c.env.DB.prepare(
        'INSERT INTO fichas_sessao_manobras(ficha_id,codigo,nome,descricao,categoria,ordem,tripulante)VALUES(?,?,?,?,?,?,?)',
      ).bind(fid, ma.codigo, ma.nome, ma.descricao, ma.categoria, ma.ordem, ma.tripulante || 'AB'),
    );
    await c.env.DB.batch(insertStmts);
    return c.json({
      success: true,
      message: `${FICHA_TECNICAS_PADRAO_LIMITE} técnicas + 15 NOTECHS populados`,
      total: manobras.length,
      layout: '18 tecnicas + 15 NOTECHS',
    });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.post(
  '/fichas-simulador/:id/gerar-qualificacao',
  requireOperacoesFicha('issue'),
  async (c) => {
  try {
    const role = String((c as unknown as { get: (k: string) => unknown }).get('userRole') || '').toUpperCase();
    const allowedRoles = ['ADMIN', 'ADMINISTRADOR', 'GESTOR', 'MANAGER', 'INSTRUTOR', 'COMPLIANCE'];
    if (!allowedRoles.includes(role)) {
      return c.json({ success: false, error: 'Acesso negado' }, 403);
    }

    const empresaId = getEmpresaId(c);
    const fid = c.req.param('id');

    // ── Tenant guard: ficha deve pertencer à empresa do usuário ───────────
    const fichaCheck = await c.env.DB.prepare(
      'SELECT id FROM fichas_sessao WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
      .bind(fid, empresaId)
      .first();
    if (!fichaCheck) {
      return c.json({ success: false, error: 'Ficha não encontrada' }, 404);
    }
    // ─────────────────────────────────────────────────────────────────────

    const data = await gerarQualificacaoDaFicha(c.env.DB, fid);

    return c.json(
      {
        success: true,
        message: `${data.qualificacoes_geradas.length} qualificação(ões) gerada(s)`,
        data,
      },
      201,
    );
  } catch (e: any) {
    const status = getQualificacaoGeracaoErrorStatus(String(e?.message || ''));
    const publicError =
      status === 400 || status === 404
        ? String(e?.message || 'Erro ao gerar qualificação')
        : 'Erro ao gerar qualificação';
    return c.json({ success: false, error: publicError }, (status || 500) as 400 | 404 | 500);
  }
});

app.get('/fichas-simulador/:id/gerar-pdf', async (c) => {
  return c.json(
    { success: false, error: 'PDF não implementado', nota: 'Use Puppeteer/jsPDF futuramente' },
    501,
  );
});

export default app;
