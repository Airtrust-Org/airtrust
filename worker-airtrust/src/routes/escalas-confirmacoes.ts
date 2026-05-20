/**
 * ESCALAS — Confirmação de Ciência (PRC-OPS-009 §6.3.3)
 * POST /minha-escala/confirmar — tripulante confirma ciência da escala
 * GET  /:id/confirmacoes       — admin/manager visualiza quem confirmou
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe, getEscalaVerificada } from './escalas-shared';

const confirmacoes = new Hono<{ Bindings: Env }>();

// POST /minha-escala/confirmar
// Tripulante confirma ciência da escala publicada para ele
confirmacoes.post('/minha-escala/confirmar', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = String((c as unknown as { get: (key: string) => unknown }).get('userId') || '');
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';

  try {
    const body = await c.req.json();
    const escalaId = String(body.escala_id || '').trim();
    if (!escalaId) {
      return c.json({ success: false, error: 'escala_id obrigatório' }, 400);
    }

    // Buscar funcionario_id do user logado
    const usuario = await db
      .prepare(
        `SELECT u.funcionario_id FROM usuarios u WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
      )
      .bind(userId)
      .first<{ funcionario_id: number | null }>();

    const funcionarioId = usuario?.funcionario_id;
    if (!funcionarioId) {
      return c.json({ success: false, error: 'Funcionário não vinculado ao usuário' }, 400);
    }

    // Verificar escala existe e está publicada
    const escala = await getEscalaVerificada(db, escalaId, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);
    if (escala.status !== 'publicada') {
      return c.json(
        { success: false, error: 'Apenas escalas publicadas podem ser confirmadas' },
        400,
      );
    }

    // Upsert confirmação
    await db
      .prepare(
        `INSERT INTO escala_confirmacoes (escala_id, funcionario_id, confirmado_em, ip, created_at, updated_at)
         VALUES (?, ?, datetime('now'), ?, datetime('now'), datetime('now'))
         ON CONFLICT (escala_id, funcionario_id) WHERE deleted_at IS NULL
         DO UPDATE SET confirmado_em = datetime('now'), ip = excluded.ip, updated_at = datetime('now')`,
      )
      .bind(escalaId, funcionarioId, ip)
      .run();

    return c.json({
      success: true,
      data: { escala_id: escalaId, funcionario_id: funcionarioId, confirmado: true },
    });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// GET /minha-escala/confirmacao-status?escala_id=...
// Retorna se o tripulante logado já confirmou ciência
confirmacoes.get('/minha-escala/confirmacao-status', auth(), async (c) => {
  const db = c.env.DB;
  const userId = String((c as unknown as { get: (key: string) => unknown }).get('userId') || '');
  const escalaId = c.req.query('escala_id') || '';

  if (!escalaId) return c.json({ success: true, data: { confirmado: false } });

  try {
    const usuario = await db
      .prepare(`SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
      .bind(userId)
      .first<{ funcionario_id: number | null }>();

    if (!usuario?.funcionario_id) {
      return c.json({ success: true, data: { confirmado: false } });
    }

    const confirmacao = await db
      .prepare(
        `SELECT confirmado_em FROM escala_confirmacoes
         WHERE escala_id = ? AND funcionario_id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(escalaId, usuario.funcionario_id)
      .first<{ confirmado_em: string }>();

    return c.json({
      success: true,
      data: {
        confirmado: !!confirmacao,
        confirmado_em: confirmacao?.confirmado_em || null,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// GET /:id/confirmacoes — lista de confirmações para admin
confirmacoes.get('/:id/confirmacoes', auth(), requireRole('admin', 'manager'), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    // Buscar todos os funcionários escalados
    const escalados = await db
      .prepare(
        `SELECT DISTINCT f.id, f.nome, f.funcao
         FROM escala_eventos ee
         JOIN escalas_mensais em ON em.id = ee.escala_id
         JOIN funcionarios f ON f.id = ee.funcionario_id AND f.deleted_at IS NULL
         WHERE ee.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND ee.deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .all<{ id: number; nome: string; funcao: string | null }>();

    // Buscar confirmações existentes
    const confirmacoesList = await db
      .prepare(
        `SELECT ec.funcionario_id, ec.confirmado_em
         FROM escala_confirmacoes ec
         WHERE ec.escala_id = ? AND ec.deleted_at IS NULL`,
      )
      .bind(id)
      .all<{ funcionario_id: number; confirmado_em: string }>();

    const confirmadosMap = new Map(
      (confirmacoesList.results || []).map((r) => [r.funcionario_id, r.confirmado_em]),
    );

    const resultado = (escalados.results || []).map((f) => ({
      funcionario_id: f.id,
      nome: f.nome,
      funcao: f.funcao,
      confirmado: confirmadosMap.has(f.id),
      confirmado_em: confirmadosMap.get(f.id) || null,
    }));

    const totalEscalados = resultado.length;
    const totalConfirmados = resultado.filter((r) => r.confirmado).length;

    return c.json({
      success: true,
      data: resultado,
      meta: {
        total_escalados: totalEscalados,
        total_confirmados: totalConfirmados,
        percentual: totalEscalados > 0 ? Math.round((totalConfirmados / totalEscalados) * 100) : 0,
      },
    });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

export default confirmacoes;
