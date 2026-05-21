/**
 * FRMS — Relatórios, Configurações e Notificações
 * Routes:
 *   GET /relatorios/individual/:tripulante_id
 *   GET /relatorios/compliance
 *   GET /relatorios/mapa-fadiga
 *   GET /relatorios/alertas-historico
 *   GET /limites
 *   GET/PUT /configuracoes
 *   POST /configuracoes/restaurar
 *   GET/PUT /configuracoes/notificacoes
 *   GET/PUT /notificacoes
 *   PUT /notificacoes/:id/ler
 *   PUT /notificacoes/ler-todas
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { requireRole } from '../middleware/auth';
import {
  relatorioIndividual,
  relatorioCompliance,
  relatorioMapaFadiga,
  buscarAlertas,
  carregarLimites,
  buscarConfiguracoes,
  atualizarConfiguracao,
  restaurarConfiguracoesPadrao,
  reprocessarTodosTripulantes,
  buscarNotificacoes,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
} from '../lib/frms/db-service';
import {
  safe,
  getEmpresaIdSafe,
  auditFrms,
  assertTripulanteEmpresa,
  resolveFuncionarioId,
} from './frms-shared';

const frmsRelatoriosConfig = new Hono<{ Bindings: Env; Variables: { userId?: string } }>();

// ════════════════════════════════════════════════════════
// RELATÓRIOS
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/relatorios/individual/:tripulante_id
 * Query: ?mes=2026-02
 */
frmsRelatoriosConfig.get(
  '/relatorios/individual/:tripulante_id',
  safe(async (c) => {
    const tripulanteId = c.req.param('tripulante_id') ?? '';
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;

    const empresaId = getEmpresaIdSafe(c);
    const mes = c.req.query('mes') || new Date().toISOString().slice(0, 7);
    const result = await relatorioIndividual(c.env.DB, tripulanteId, mes, empresaId);
    return c.json({ success: true, data: result });
  }),
);

/**
 * GET /api/frms/relatorios/compliance
 * Query: ?mes=2026-02
 */
frmsRelatoriosConfig.get(
  '/relatorios/compliance',
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const mes = c.req.query('mes') || new Date().toISOString().slice(0, 7);
    const result = await relatorioCompliance(c.env.DB, mes, empresaId);
    return c.json({ success: true, data: result });
  }),
);

/**
 * GET /api/frms/relatorios/mapa-fadiga
 */
frmsRelatoriosConfig.get(
  '/relatorios/mapa-fadiga',
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    c.header('Cache-Control', 'private, max-age=3600');
    c.header('Vary', 'Authorization');
    const result = await relatorioMapaFadiga(c.env.DB, empresaId);
    return c.json({ success: true, data: result });
  }),
);

/**
 * GET /api/frms/relatorios/alertas-historico
 * Query: ?data_inicio= &data_fim=
 */
frmsRelatoriosConfig.get(
  '/relatorios/alertas-historico',
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const result = await buscarAlertas(
      c.env.DB,
      {
        data_inicio: c.req.query('data_inicio') ?? undefined,
        data_fim: c.req.query('data_fim') ?? undefined,
        limit: 500,
      },
      empresaId,
    );
    return c.json({ success: true, data: result.alertas, total: result.total });
  }),
);

// ════════════════════════════════════════════════════════
// CONFIGURAÇÃO DE LIMITES (admin)
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/limites
 * Retorna configuração atual de limites
 */
frmsRelatoriosConfig.get(
  '/limites',
  safe(async (c) => {
    const limites = await carregarLimites(c.env.DB);
    return c.json({ success: true, data: limites });
  }),
);

// ════════════════════════════════════════════════════════
// CONFIGURAÇÃO CIENTÍFICA (admin)
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/configuracoes
 * Retorna todas as configurações (rows do banco) para UI admin
 */
frmsRelatoriosConfig.get(
  '/configuracoes',
  safe(async (c) => {
    const configs = await buscarConfiguracoes(c.env.DB);
    const limites = await carregarLimites(c.env.DB);
    return c.json({ success: true, data: { configs, limites } });
  }),
);

/**
 * PUT /api/frms/configuracoes
 * Atualiza múltiplas configurações de uma vez
 * Body: { configs: [{ nome: string, valor_numerico: number }] }
 */
frmsRelatoriosConfig.put(
  '/configuracoes',
  requireRole('admin'),
  safe(async (c) => {
    const body = await c.req.json();
    const schema = z.object({
      configs: z.array(
        z.object({
          nome: z.string(),
          valor_numerico: z.number(),
        }),
      ),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }

    await atualizarConfiguracao(c.env.DB, parsed.data.configs);
    const limites = await carregarLimites(c.env.DB);

    // Reprocessar todos os tripulantes em background com os novos limites
    c.executionCtx.waitUntil(reprocessarTodosTripulantes(c.env.DB));

    return c.json({ success: true, data: limites });
  }),
);

/**
 * POST /api/frms/configuracoes/restaurar
 * Restaura todos os limites para valores padrão científicos
 */
frmsRelatoriosConfig.post(
  '/configuracoes/restaurar',
  requireRole('admin'),
  safe(async (c) => {
    await restaurarConfiguracoesPadrao(c.env.DB);
    const limites = await carregarLimites(c.env.DB);

    // Reprocessar todos os tripulantes em background com os limites restaurados
    c.executionCtx.waitUntil(reprocessarTodosTripulantes(c.env.DB));

    return c.json({ success: true, data: limites });
  }),
);

// ════════════════════════════════════════════════════════
// CONFIGURAÇÃO DE NOTIFICAÇÕES POR CARGO
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/configuracoes/notificacoes
 * Retorna a configuração de notificações por cargo (quem recebe qual nível mínimo de alerta).
 */
frmsRelatoriosConfig.get(
  '/configuracoes/notificacoes',
  safe(async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT id, cargo, nivel_minimo, ativo FROM frms_notificacao_config WHERE deleted_at IS NULL ORDER BY cargo`,
    ).all<{ id: string; cargo: string; nivel_minimo: string; ativo: number }>();
    return c.json({ success: true, data: rows.results ?? [] });
  }),
);

/**
 * PUT /api/frms/configuracoes/notificacoes
 * Upsert de configuração de notificação por cargo.
 * Body: { cargo: string, nivel_minimo: string, ativo: boolean }
 * Requer role admin.
 */
frmsRelatoriosConfig.put(
  '/configuracoes/notificacoes',
  requireRole('admin'),
  safe(async (c) => {
    const schema = z.object({
      cargo: z.string().min(1),
      nivel_minimo: z.enum(['AVISO', 'ATENCAO', 'CRITICO', 'VIOLACAO']),
      ativo: z.boolean(),
    });
    const body = await c.req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }

    const { cargo, nivel_minimo, ativo } = parsed.data;

    // Upsert
    await c.env.DB.prepare(
      `INSERT INTO frms_notificacao_config (id, cargo, nivel_minimo, ativo, created_at, updated_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(cargo) DO UPDATE SET
         nivel_minimo = excluded.nivel_minimo,
         ativo = excluded.ativo,
         updated_at = datetime('now'),
         deleted_at = NULL`,
    )
      .bind(cargo, nivel_minimo, ativo ? 1 : 0)
      .run();

    await auditFrms(c, 'frms_notificacao_config', 'UPDATE', cargo, {
      depois: { cargo, nivel_minimo, ativo },
    });

    return c.json({ success: true });
  }),
);

// ════════════════════════════════════════════════════════
// NOTIFICAÇÕES POR CARGO
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/notificacoes
 * Retorna notificações do usuário logado
 * Query: ?lido=false &page=1 &limit=50
 */
frmsRelatoriosConfig.get(
  '/notificacoes',
  safe(async (c) => {
    const userId = await resolveFuncionarioId(c);
    const lido = c.req.query('lido') !== undefined ? c.req.query('lido') === 'true' : undefined;
    const page = c.req.query('page') ? parseInt(c.req.query('page')!) : undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    const result = await buscarNotificacoes(c.env.DB, userId, { lido, page, limit });
    return c.json({ success: true, data: result.notificacoes, total: result.total });
  }),
);

/**
 * GET /api/frms/notificacoes/count
 * Conta notificações não lidas (para badge)
 */
frmsRelatoriosConfig.get(
  '/notificacoes/count',
  safe(async (c) => {
    const userId = await resolveFuncionarioId(c);
    const row = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM frms_notificacao_destinatario WHERE funcionario_id = ? AND lido = 0 AND deleted_at IS NULL',
    )
      .bind(userId)
      .first<{ count: number }>();
    return c.json({ success: true, data: { count: row?.count ?? 0 } });
  }),
);

/**
 * PUT /api/frms/notificacoes/:id/ler
 * Marca uma notificação como lida
 */
frmsRelatoriosConfig.put(
  '/notificacoes/:id/ler',
  safe(async (c) => {
    const id = c.req.param('id') ?? '';
    const userId = await resolveFuncionarioId(c);
    await marcarNotificacaoLida(c.env.DB, id, userId);
    return c.json({ success: true });
  }),
);

/**
 * PUT /api/frms/notificacoes/ler-todas
 * Marca todas as notificações do usuário como lidas
 */
frmsRelatoriosConfig.put(
  '/notificacoes/ler-todas',
  safe(async (c) => {
    const userId = await resolveFuncionarioId(c);
    await marcarTodasNotificacoesLidas(c.env.DB, userId);
    return c.json({ success: true });
  }),
);

export default frmsRelatoriosConfig;
