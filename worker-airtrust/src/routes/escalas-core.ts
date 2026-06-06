/**
 * ESCALAS — Rotas API (Hono) — Core Orchestrator
 *
 * Módulo de Planejamento de Escala Mensal.
 * Thin orchestrator that mounts all sub-modules.
 *
 * Sub-módulos (prefixados):
 *   - escalas-padroes.ts      → /padroes
 *   - escalas-restricoes.ts   → /restricoes
 *   - escalas-quinzenas.ts    → /quinzenas
 *   - escalas-cma-status.ts   → /funcionarios/cma-status
 *   - escalas-tipos-evento.ts → /tipos-evento-config
 *   - escalas-templates.ts    → /templates
 *   - escalas-notificacoes.ts → /notificacoes
 *   - escalas-disponibilidade.ts → /disponibilidade
 *   - escalas-pilotos.ts      → /funcionarios/pilotos
 *
 * Sub-módulos (raiz — rotas com /:id):
 *   - escalas-crud.ts         → GET /, GET /:id, POST /, POST /gerar-ano, PUT /:id, DELETE /:id
 *   - escalas-status.ts       → PATCH /:id/status, GET /:id/snapshot-publicado
 *   - escalas-tripulacoes.ts  → POST/GET/PUT/DELETE /:id/tripulacoes
 *   - escalas-eventos.ts      → POST/GET/PUT/DELETE /:id/eventos
 *   - escalas-calendario.ts   → GET /:id/calendario
 *   - escalas-conflitos.ts    → GET /:id/conflitos
 *   - escalas-exportacao.ts   → GET /:id/export
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe, getEscalaVerificada } from './escalas-shared';

// ── Prefixed sub-modules ────────────────────────────────────────────────────
import padroes from './escalas-padroes';
import restricoes from './escalas-restricoes';
import quinzenas from './escalas-quinzenas';
import cmaStatus from './escalas-cma-status';
import tiposEvento from './escalas-tipos-evento';
import templates from './escalas-templates';
import notificacoes from './escalas-notificacoes';
import disponibilidade from './escalas-disponibilidade';
import tripulantesOperacionais from './escalas-tripulantes-operacionais';
import pilotos from './escalas-pilotos';
import preferencias from './escalas-preferencias';

// ── Root-mounted sub-modules ────────────────────────────────────────────────
import crud from './escalas-crud';
import status from './escalas-status';
import tripulacoes from './escalas-tripulacoes';
import eventos from './escalas-eventos';
import calendario from './escalas-calendario';
import conflitos from './escalas-conflitos';
import exportacao from './escalas-exportacao';
import alocacoes from './escalas-alocacoes';
import coberturaRoutes from './escalas-cobertura';
import confirmacoes from './escalas-confirmacoes';
import visaoMensalIntegrada from './escala-mensal-integrada';

const escalas = new Hono<{ Bindings: Env }>();

// ================================================================
// PREFIXED SUB-MODULES
// ================================================================
escalas.route('/padroes', padroes);
escalas.route('/restricoes', restricoes);
escalas.route('/quinzenas', quinzenas);
escalas.route('/funcionarios/cma-status', cmaStatus);
escalas.route('/tipos-evento-config', tiposEvento);
escalas.route('/templates', templates);
escalas.route('/notificacoes', notificacoes);
escalas.route('/disponibilidade', disponibilidade);
escalas.route('/tripulantes-operacionais', tripulantesOperacionais);
escalas.route('/funcionarios/pilotos', pilotos);
escalas.route('/preferencias', preferencias);
escalas.route('/', visaoMensalIntegrada);

// ================================================================
// DIRECT ROUTES — must precede root-mounted modules to avoid /:id capture
// ================================================================
// GET /situacao-tipos is defined in alocacoes but /:id from crud captures it first
// when both are root-mounted via escalas.route('/', ...). Add it here explicitly.
escalas.get('/situacao-tipos', auth(), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, codigo, nome, cor, icone, bloqueia_alocacao, ativo, ordem
       FROM escala_situacao_tipos
      WHERE deleted_at IS NULL
        AND ativo = 1
      ORDER BY ordem, nome`,
  ).all<{
    id: number;
    codigo: string;
    nome: string;
    cor: string;
    icone: string;
    bloqueia_alocacao: number;
    ativo: number;
    ordem: number;
  }>();
  return c.json({ success: true, data: rows.results || [] });
});

// ================================================================
// ROOT-MOUNTED SUB-MODULES (routes with /:id)
// ================================================================
escalas.route('/', crud);
escalas.route('/', status);
escalas.route('/', tripulacoes);
escalas.route('/', eventos);
escalas.route('/', calendario);
escalas.route('/', conflitos);
escalas.route('/', exportacao);
escalas.route('/', alocacoes);
escalas.route('/', coberturaRoutes);
escalas.route('/', confirmacoes);

// Alias legado para consumidores antigos de listagem operacional.
escalas.route('/pilotos-disponiveis', tripulantesOperacionais);

escalas.get('/:id/alertas', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const escalaId = c.req.param('id');

  const escala = await getEscalaVerificada(db, escalaId, empresaId);
  if (!escala) {
    return c.json({ success: false, error: 'Escala não encontrada' }, 404);
  }

  const alertasPersistidos = await db
    .prepare(
      `SELECT ea.*, f.nome AS funcionario_nome, f.guerra AS nome_guerra
       FROM escala_alertas ea
       LEFT JOIN funcionarios f ON f.id = ea.funcionario_id AND f.deleted_at IS NULL
       WHERE ea.escala_id = ?
         AND ea.deleted_at IS NULL
         AND COALESCE(ea.resolvido, 0) = 0
       ORDER BY ea.created_at DESC`,
    )
    .bind(escalaId)
    .all();

  const alertasTempoReal = await db
    .prepare(
      `SELECT
         CAST(f.id AS TEXT) AS funcionario_id,
         f.nome,
        f.guerra AS nome_guerra,
         'CMA_VENCENDO' AS tipo,
         CAST((
           JULIANDAY(MAX(COALESCE(
             qh.data_vencimento,
             date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')
           ))) - JULIANDAY('now')
         ) AS INTEGER) AS dias_restantes,
         MAX(COALESCE(
           qh.data_vencimento,
           date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')
         )) AS cma_validade_fim
       FROM escala_tripulacoes et
       JOIN funcionarios f ON (f.id = et.pic_id OR f.id = et.sic_id)
       JOIN qualificacoes_historico qh ON qh.funcionario_id = f.id AND qh.deleted_at IS NULL
       LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
       WHERE et.escala_id = ?
         AND et.deleted_at IS NULL
         AND UPPER(COALESCE(qh.qualificacao_codigo, qt.codigo, '')) = 'CMA'
       GROUP BY f.id
       HAVING dias_restantes BETWEEN 0 AND 60
       ORDER BY dias_restantes ASC`,
    )
    .bind(escalaId)
    .all();

  return c.json({
    success: true,
    data: {
      alertas_persistidos: alertasPersistidos.results || [],
      alertas_tempo_real: alertasTempoReal.results || [],
      total: (alertasPersistidos.results || []).length + (alertasTempoReal.results || []).length,
    },
  });
});

// ================================================================
// POST /:id/notificar — envia para todos os tripulantes da escala
// ================================================================
escalas.post('/:id/notificar', auth(), requireRole('admin', 'manager'), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  try {
    const escala = (await getEscalaVerificada(db, id, empresaId)) as Record<string, unknown> | null;
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const mensagem = String(
      body.mensagem || `Sua escala de ${escala.mes}/${escala.ano} foi publicada.`,
    );
    const excluidos: string[] = Array.isArray(body.excluidos) ? (body.excluidos as string[]) : [];

    // Coletar todos os funcionários alocados
    const tripRows = await db
      .prepare(
        `SELECT DISTINCT et.pic_id AS funcionario_id
           FROM escala_tripulacoes et
           JOIN escalas_mensais em ON em.id = et.escala_id
          WHERE et.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL
       UNION
       SELECT DISTINCT et.sic_id
         FROM escala_tripulacoes et
         JOIN escalas_mensais em ON em.id = et.escala_id
        WHERE et.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL
          AND et.sic_id IS NOT NULL AND et.deleted_at IS NULL`,
      )
      .bind(id, empresaId, id, empresaId)
      .all<{ funcionario_id: string }>();

    const funcionarios = (tripRows.results || [])
      .map((r) => r.funcionario_id)
      .filter((fid) => !excluidos.includes(fid));

    if (funcionarios.length === 0) {
      return c.json({ success: true, notificados: 0 });
    }

    const now = new Date().toISOString();
    const titulo = `Escala ${escala.mes}/${escala.ano} publicada`;

    const stmts = funcionarios.map((fid) =>
      db
        .prepare(
          `INSERT INTO notificacoes_inapp (id, funcionario_id, empresa_id, tipo, titulo, mensagem, referencia_id, referencia_tipo, created_at)
         VALUES (?, ?, ?, 'escala_publicada', ?, ?, ?, 'escala', ?)`,
        )
        .bind(crypto.randomUUID(), fid, empresaId, titulo, mensagem, id, now),
    );

    await db.batch(stmts);

    return c.json({ success: true, notificados: funcionarios.length });
  } catch {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ================================================================
// INT-03: GET /api/escalas/frms-score/:funcionarioId
// FRMS fatigue score for display in the allocation modal (VistaTripulante, PainelDisponibilidade)
// ================================================================
escalas.get('/frms-score/:funcionarioId', auth(), async (c) => {
  const funcId = c.req.param('funcionarioId');
  const db = c.env.DB;

  try {
    const [horasRow, diasRows] = await Promise.all([
      db
        .prepare(
          `SELECT
             COALESCE(SUM(horas_voo_minutos), 0) AS total_minutos
           FROM frms_jornada
           WHERE tripulante_id = ?
             AND data >= date('now', '-30 days')
             AND deleted_at IS NULL`,
        )
        .bind(funcId)
        .first<{ total_minutos: number }>(),
      db
        .prepare(
          `SELECT DISTINCT data FROM frms_jornada
           WHERE tripulante_id = ?
             AND data >= date('now', '-14 days')
             AND deleted_at IS NULL
           ORDER BY data`,
        )
        .bind(funcId)
        .all<{ data: string }>(),
    ]);

    const totalMinutos = horasRow?.total_minutos ?? 0;
    const totalHoras = Math.round(totalMinutos / 60);
    const limiteHorasMensal = 80;
    const percentual =
      limiteHorasMensal > 0 ? Math.round((totalHoras / limiteHorasMensal) * 100) : 0;

    const dias = (diasRows.results || []).map((r) => r.data);
    let maxConsec = 0;
    let consec = 1;
    for (let i = 1; i < dias.length; i++) {
      const prev = new Date(dias[i - 1]).getTime();
      const curr = new Date(dias[i]).getTime();
      if (curr - prev === 86400000) {
        consec++;
        maxConsec = Math.max(maxConsec, consec);
      } else {
        consec = 1;
      }
    }
    if (dias.length === 1) maxConsec = 1;

    const horasScore = Math.min(percentual, 100);
    const consecScore = Math.min(Math.round((maxConsec / 7) * 100), 100);
    const score = Math.round(horasScore * 0.6 + consecScore * 0.4);

    return c.json({
      success: true,
      data: {
        funcionario_id: funcId,
        score,
        total_horas_30d: totalHoras,
        limite_mensal: limiteHorasMensal,
        percentual_limite: percentual,
        dias_consecutivos_14d: maxConsec,
        nivel: score >= 95 ? 'critico' : score >= 80 ? 'alto' : score >= 50 ? 'medio' : 'baixo',
      },
    });
  } catch {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default escalas;
