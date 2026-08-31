/**
 * SIMULADORES — Fichas Extras
 * Routes extracted from simuladores-fichas.ts:
 *   POST /historico-notas
 *   GET  /historico-notas/ultima/:funcionarioId/:codigoManobra
 *   GET  /historico-notas/:funcionarioId
 *   GET  /dashboard/:funcionarioId
 *   PUT  /alertas/:alertaId/resolver
 *   POST /sessoes/:id/checks/resultados
 */

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { audit } from './simuladores-shared';
import { createLogger, toError } from '../utils/logger';
import { requireOperationalAccess } from '../services/operational-domain-access';

// Fichas de sessão de simulador são fixed-domain OPERACOES — see
// docs/rbac/gestor-operational-autonomy.md.
const requireOperacoesFicha = (action: 'create' | 'update') =>
  requireOperationalAccess({ domain: 'OPERACOES', action, resourceType: 'simulador_ficha' });

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use('*', auth());

function parseHistoricoLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100;
  }

  return Math.min(parsed, 200);
}

// ==========================================================================
// HISTÓRICO DE NOTAS
// ==========================================================================

// POST /historico-notas - Registrar nota no histórico
app.post('/historico-notas', requireOperacoesFicha('create'), async (c) => {
  try {
    const role = String(c.get('userRole') || '').toUpperCase();
    const allowedRoles = ['ADMIN', 'ADMINISTRADOR', 'GESTOR', 'MANAGER', 'INSTRUTOR', 'COMPLIANCE'];
    if (!allowedRoles.includes(role)) {
      return c.json({ success: false, error: 'Acesso negado' }, 403);
    }

    const { empresaId } = getTenantContext(c);
    const body = await c.req.json();
    const {
      funcionario_id,
      ficha_id,
      codigo_manobra,
      descricao_manobra,
      categoria_manobra,
      nota,
      observacoes,
      data_sessao,
      tipo_sessao,
      tipo_aeronave,
      instrutor_id,
    } = body;

    if (!funcionario_id || !ficha_id || !codigo_manobra || nota === undefined) {
      return c.json(
        {
          success: false,
          error: 'Campos obrigatórios: funcionario_id, ficha_id, codigo_manobra, nota',
        },
        400,
      );
    }

    if (nota !== 'NAO_REALIZADA' && typeof nota === 'number' && (nota < 0 || nota > 10)) {
      return c.json(
        { success: false, error: 'Nota deve estar entre 0 e 10 ou NAO_REALIZADA' },
        400,
      );
    }

    // Tenant guard: verify funcionario belongs to user's empresa
    const funcionarioCheck = await c.env.DB.prepare(
      `SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(funcionario_id, empresaId)
      .first();
    if (!funcionarioCheck) {
      return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);
    }

    // Tenant guard: verify ficha belongs to user's empresa
    const fichaCheck = await c.env.DB.prepare(
      `SELECT id FROM fichas_sessao WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(ficha_id, empresaId)
      .first();
    if (!fichaCheck) {
      return c.json({ success: false, error: 'Ficha não encontrada' }, 404);
    }

    const existente = await c.env.DB.prepare(
      `SELECT id FROM historico_notas_manobras
       WHERE ficha_id = ? AND codigo_manobra = ? AND deleted_at IS NULL`,
    )
      .bind(ficha_id, codigo_manobra)
      .first();

    if (existente) {
      await c.env.DB.prepare(
        `UPDATE historico_notas_manobras
         SET nota = ?, observacoes = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(nota, observacoes || '', existente.id)
        .run();

      return c.json({
        success: true,
        data: { id: existente.id, updated: true },
      });
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO historico_notas_manobras (
        funcionario_id, ficha_id, codigo_manobra, descricao_manobra, categoria_manobra,
        nota, observacoes, data_sessao, tipo_sessao, tipo_aeronave, instrutor_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        funcionario_id,
        ficha_id,
        codigo_manobra,
        descricao_manobra || '',
        categoria_manobra || '',
        nota,
        observacoes || '',
        data_sessao || new Date().toISOString().split('T')[0],
        tipo_sessao || '',
        tipo_aeronave || '',
        instrutor_id || null,
      )
      .run();

    const historico_id = result.meta.last_row_id;

    // Check if alert is needed: 2 consecutive sessions with nota < 7.0
    let alertaGerado = false;
    if (typeof nota === 'number' && nota < 7.0) {
      const ultimaNotaAnterior = await c.env.DB.prepare(
        `SELECT hnm.id, hnm.nota, hnm.data_sessao, hnm.ficha_id
         FROM historico_notas_manobras hnm
         INNER JOIN funcionarios f ON hnm.funcionario_id = f.id
         WHERE hnm.funcionario_id = ?
           AND hnm.codigo_manobra = ?
           AND hnm.id != ?
           AND f.empresa_id = ?
           AND hnm.deleted_at IS NULL
         ORDER BY hnm.data_sessao DESC, hnm.id DESC
         LIMIT 1`,
      )
        .bind(funcionario_id, codigo_manobra, historico_id, empresaId)
        .first();

      if (
        ultimaNotaAnterior &&
        typeof ultimaNotaAnterior.nota === 'number' &&
        ultimaNotaAnterior.nota < 7.0
      ) {
        const alertaExistente = await c.env.DB.prepare(
          `SELECT ar.id
             FROM alertas_reforco ar
             INNER JOIN funcionarios f
               ON f.id = ar.funcionario_id
              AND f.empresa_id = ?
              AND f.deleted_at IS NULL
            WHERE ar.funcionario_id = ?
              AND ar.codigo_manobra = ?
              AND ar.status = 'ATIVO'
              AND ar.deleted_at IS NULL
            LIMIT 1`,
        )
          .bind(empresaId, funcionario_id, codigo_manobra)
          .first();

        if (!alertaExistente) {
          await c.env.DB.prepare(
            `INSERT INTO alertas_reforco (
              funcionario_id, codigo_manobra, descricao_manobra,
              nota_sessao1, data_sessao1, ficha_id_sessao1,
              nota_sessao2, data_sessao2, ficha_id_sessao2,
              instrutor_id_notificado, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO')`,
          )
            .bind(
              funcionario_id,
              codigo_manobra,
              descricao_manobra || codigo_manobra,
              ultimaNotaAnterior.nota,
              ultimaNotaAnterior.data_sessao,
              ultimaNotaAnterior.ficha_id,
              nota,
              data_sessao || new Date().toISOString().split('T')[0],
              ficha_id,
              instrutor_id || null,
            )
            .run();

          alertaGerado = true;
          createLogger(c, 'SimuladoresFichas').info(
            `Alerta criado: ${codigo_manobra} - Funcionário ${funcionario_id}`,
          );
        }
      }
    }

    await audit(c.env.DB, {
      tabela: 'historico_notas_manobras',
      acao: 'INSERT',
      registro_id: historico_id,
      dados_novos: body,
    });

    return c.json(
      {
        success: true,
        data: { id: historico_id, alerta_gerado: alertaGerado },
      },
      201,
    );
  } catch (e: unknown) {
    createLogger(c, 'SimuladoresFichas').error('Erro ao registrar histórico de notas', toError(e));
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// GET /historico-notas/ultima/:funcionarioId/:codigoManobra — MUST be before /historico-notas/:funcionarioId
app.get('/historico-notas/ultima/:funcionarioId/:codigoManobra', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const funcionarioId = c.req.param('funcionarioId');
    const codigoManobra = c.req.param('codigoManobra');

    // Tenant guard: verify funcionario belongs to user's empresa
    const funcionarioCheck = await c.env.DB.prepare(
      `SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(parseInt(funcionarioId), empresaId)
      .first();
    if (!funcionarioCheck) {
      return c.json({ success: true, data: null, message: 'Nenhum histórico encontrado' });
    }

    const ultimaNota = await c.env.DB.prepare(
      `SELECT
        hnm.*,
        f.nome as aluno_nome,
        i.nome as instrutor_nome
       FROM historico_notas_manobras hnm
       INNER JOIN funcionarios f ON hnm.funcionario_id = f.id
       LEFT JOIN funcionarios i ON hnm.instrutor_id = i.id
       WHERE hnm.funcionario_id = ?
         AND hnm.codigo_manobra = ?
         AND f.empresa_id = ?
         AND hnm.deleted_at IS NULL
       ORDER BY hnm.data_sessao DESC, hnm.id DESC
       LIMIT 1`,
    )
      .bind(parseInt(funcionarioId), codigoManobra, empresaId)
      .first();

    if (!ultimaNota) {
      return c.json({ success: true, data: null, message: 'Nenhum histórico encontrado' });
    }

    return c.json({ success: true, data: ultimaNota });
  } catch (e: unknown) {
    createLogger(c, 'SimuladoresFichas').error('Erro ao buscar última nota', toError(e));
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// GET /historico-notas/:funcionarioId — must come AFTER /ultima/...
app.get('/historico-notas/:funcionarioId', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const funcionarioId = c.req.param('funcionarioId');
    const limit = parseHistoricoLimit(c.req.query('limit'));

    // Tenant guard: verify funcionario belongs to user's empresa
    const funcionarioCheck = await c.env.DB.prepare(
      `SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(parseInt(funcionarioId), empresaId)
      .first();
    if (!funcionarioCheck) {
      return c.json({ success: true, data: [] });
    }

    const historico = await c.env.DB.prepare(
      `SELECT
        hnm.*,
        i.nome as instrutor_nome
       FROM historico_notas_manobras hnm
       INNER JOIN funcionarios f ON hnm.funcionario_id = f.id
       LEFT JOIN funcionarios i ON hnm.instrutor_id = i.id
       WHERE hnm.funcionario_id = ?
         AND f.empresa_id = ?
         AND hnm.deleted_at IS NULL
       ORDER BY hnm.data_sessao DESC, hnm.id DESC
       LIMIT ?`,
    )
      .bind(parseInt(funcionarioId), empresaId, limit)
      .all();

    return c.json({ success: true, data: historico.results });
  } catch (e: unknown) {
    createLogger(c, 'SimuladoresFichas').error('Erro ao listar histórico de notas', toError(e));
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ==========================================================================
// DASHBOARD
// ==========================================================================

app.get('/dashboard/:funcionarioId', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const funcionarioId = c.req.param('funcionarioId');

    // Tenant guard: verify funcionario belongs to user's empresa
    const funcionarioCheck = await c.env.DB.prepare(
      `SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(parseInt(funcionarioId), empresaId)
      .first();
    if (!funcionarioCheck) {
      return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);
    }

    const top5Dificuldade = await c.env.DB.prepare(
      `SELECT
        fsm.codigo as codigo_manobra,
        fsm.descricao as descricao_manobra,
        AVG(CAST(fsm.resultado AS REAL)) as media_nota,
        COUNT(*) as total_tentativas,
        MIN(CAST(fsm.resultado AS REAL)) as pior_nota,
        MAX(CAST(fsm.resultado AS REAL)) as melhor_nota,
        MAX(fs.data_sessao) as ultima_sessao
       FROM fichas_sessao_manobras fsm
       INNER JOIN fichas_sessao fs ON fsm.ficha_id = fs.id
       WHERE fs.colaborador_id_aluno = ?
         AND fs.empresa_id = ?
         AND fsm.deleted_at IS NULL
         AND fs.deleted_at IS NULL
         AND fsm.resultado IS NOT NULL
         AND fsm.resultado != ''
       GROUP BY fsm.codigo, fsm.descricao
       HAVING COUNT(*) >= 2
       ORDER BY AVG(CAST(fsm.resultado AS REAL)) ASC
       LIMIT 5`,
    )
      .bind(parseInt(funcionarioId), empresaId)
      .all();

    const alertasAtivos = await c.env.DB.prepare(
      `SELECT
        ar.*,
        i.nome as instrutor_nome,
        i.email as instrutor_email,
        f.nome as funcionario_nome
       FROM alertas_reforco ar
       INNER JOIN funcionarios f
         ON ar.funcionario_id = f.id
        AND f.empresa_id = ?
        AND f.deleted_at IS NULL
       LEFT JOIN funcionarios i
         ON ar.instrutor_id_notificado = i.id
        AND i.empresa_id = ?
        AND i.deleted_at IS NULL
       WHERE ar.funcionario_id = ?
         AND ar.status = 'ATIVO'
         AND ar.deleted_at IS NULL
       ORDER BY ar.created_at DESC`,
    )
      .bind(empresaId, empresaId, parseInt(funcionarioId))
      .all();

    const estatisticas = await c.env.DB.prepare(
      `SELECT
        COUNT(DISTINCT fs.id) as total_fichas,
        COUNT(fsm.id) as total_manobras_avaliadas,
        COUNT(DISTINCT fsm.codigo) as total_manobras_unicas,
        ROUND(AVG(CAST(fsm.resultado AS REAL)), 1) as media_geral,
        MIN(CAST(fsm.resultado AS REAL)) as pior_nota_geral,
        MAX(CAST(fsm.resultado AS REAL)) as melhor_nota_geral
       FROM fichas_sessao fs
       LEFT JOIN fichas_sessao_manobras fsm ON fs.id = fsm.ficha_id AND fsm.deleted_at IS NULL
       WHERE fs.colaborador_id_aluno = ?
         AND fs.empresa_id = ?
         AND fs.deleted_at IS NULL
         AND fsm.resultado IS NOT NULL
         AND fsm.resultado != ''`,
    )
      .bind(parseInt(funcionarioId), empresaId)
      .first();

    const evolucao = await c.env.DB.prepare(
      `SELECT
        fs.data_sessao,
        MAX(fs.tipo_sessao) as tipo_sessao,
        MAX(fs.tipo_aeronave) as tipo_aeronave,
        ROUND(AVG(CAST(fsm.resultado AS REAL)), 1) as media_sessao,
        COUNT(fsm.id) as manobras_avaliadas
       FROM fichas_sessao fs
       INNER JOIN fichas_sessao_manobras fsm ON fs.id = fsm.ficha_id
       WHERE fs.colaborador_id_aluno = ?
         AND fs.empresa_id = ?
         AND fs.deleted_at IS NULL
         AND fsm.deleted_at IS NULL
         AND fsm.resultado IS NOT NULL
         AND fsm.resultado != ''
       GROUP BY fs.data_sessao, fs.id
       ORDER BY fs.data_sessao DESC
       LIMIT 10`,
    )
      .bind(parseInt(funcionarioId), empresaId)
      .all();

    const funcionario = await c.env.DB.prepare(
      `SELECT id, nome, matricula, codigo_anac FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(parseInt(funcionarioId), empresaId)
      .first();

    return c.json({
      success: true,
      data: {
        funcionario,
        top5_dificuldade: top5Dificuldade.results,
        alertas_ativos: alertasAtivos.results,
        estatisticas,
        evolucao_temporal: evolucao.results.reverse(),
      },
    });
  } catch (e: unknown) {
    createLogger(c, 'SimuladoresFichas').error('Erro ao buscar dashboard de manobras', toError(e));
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PUT /alertas/:alertaId/resolver - Resolve an active reinforcement alert in the current tenant.
app.put('/alertas/:alertaId/resolver', requireOperacoesFicha('update'), async (c) => {
  try {
    const role = String(c.get('userRole') || '').toUpperCase();
    const allowedRoles = ['ADMIN', 'ADMINISTRADOR', 'GESTOR', 'MANAGER', 'INSTRUTOR', 'COMPLIANCE'];
    if (!allowedRoles.includes(role)) {
      return c.json({ success: false, error: 'Acesso negado' }, 403);
    }

    const { empresaId } = getTenantContext(c);
    const alertaId = Number.parseInt(c.req.param('alertaId'), 10);
    if (!Number.isInteger(alertaId) || alertaId <= 0) {
      return c.json({ success: false, error: 'Alerta inválido' }, 400);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      observacoes_resolucao?: unknown;
    };
    const observacoesResolucao =
      typeof body.observacoes_resolucao === 'string'
        ? body.observacoes_resolucao.trim().slice(0, 2000)
        : '';

    const alerta = await c.env.DB.prepare(
      `SELECT ar.id
         FROM alertas_reforco ar
         INNER JOIN funcionarios f
           ON f.id = ar.funcionario_id
          AND f.empresa_id = ?
          AND f.deleted_at IS NULL
        WHERE ar.id = ?
          AND ar.status = 'ATIVO'
          AND ar.deleted_at IS NULL
        LIMIT 1`,
    )
      .bind(empresaId, alertaId)
      .first();

    if (!alerta) {
      return c.json({ success: false, error: 'Alerta não encontrado' }, 404);
    }

    await c.env.DB.prepare(
      `UPDATE alertas_reforco
          SET status = 'RESOLVIDO',
              data_resolucao = datetime('now'),
              observacoes_resolucao = ?,
              updated_at = datetime('now')
        WHERE id = ?
          AND status = 'ATIVO'
          AND deleted_at IS NULL`,
    )
      .bind(observacoesResolucao || null, alertaId)
      .run();

    await audit(c.env.DB, {
      tabela: 'alertas_reforco',
      acao: 'UPDATE',
      registro_id: alertaId,
      dados_novos: {
        status: 'RESOLVIDO',
        observacoes_resolucao: observacoesResolucao || null,
      },
    });

    return c.json({ success: true, data: { id: alertaId, status: 'RESOLVIDO' } });
  } catch (e: unknown) {
    createLogger(c, 'SimuladoresFichas').error('Erro ao resolver alerta de reforço', toError(e));
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ==========================================================================
// CHECKS — resultados (the large route at the bottom)
// ==========================================================================

// POST /sessoes/:id/checks/resultados - Save only explicit check results
app.post('/sessoes/:id/checks/resultados', requireOperacoesFicha('create'), async (c) => {
  try {
    const role = String(c.get('userRole') || '').toUpperCase();
    const allowedRoles = ['ADMIN', 'ADMINISTRADOR', 'GESTOR', 'MANAGER', 'INSTRUTOR', 'COMPLIANCE'];
    if (!allowedRoles.includes(role)) {
      return c.json({ success: false, error: 'Acesso negado' }, 403);
    }

    const { empresaId } = getTenantContext(c);
    const sessao_id = c.req.param('id');
    const body = await c.req.json();
    const { resultados } = body;

    if (!resultados || !Array.isArray(resultados)) {
      return c.json({ success: false, error: 'Formato inválido' }, 400);
    }

    const sessao = await c.env.DB.prepare(
      `SELECT sa.id, sa.funcionario_id, sa.instrutor_id, sa.data, sa.is_check
       FROM simulador_agendamentos sa
       WHERE sa.id = ? AND sa.empresa_id = ? AND sa.deleted_at IS NULL`,
    )
      .bind(sessao_id, empresaId)
      .first<{ is_check: number | null }>();

    if (!sessao) {
      return c.json({ success: false, error: 'Sessão não encontrada' }, 404);
    }

    if (sessao.is_check !== 1) {
      return c.json({ success: false, error: 'Sessão não é do tipo check' }, 400);
    }

    const resultadosSalvos = [];

    for (const res of resultados) {
      const { sessao_check_id, aprovado, observacoes } = res;

      if (typeof aprovado !== 'boolean') {
        continue;
      }

      const existente = await c.env.DB.prepare(
        'SELECT id FROM sessoes_checks_resultados WHERE sessao_check_id = ? AND deleted_at IS NULL',
      )
        .bind(sessao_check_id)
        .first();

      if (existente) {
        await c.env.DB.prepare(
          `UPDATE sessoes_checks_resultados
           SET aprovado = ?, observacoes = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
          .bind(aprovado ? 1 : 0, observacoes || null, existente.id)
          .run();
      } else {
        await c.env.DB.prepare(
          `INSERT INTO sessoes_checks_resultados (sessao_check_id, aprovado, observacoes, created_at, updated_at)
           VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
        )
          .bind(sessao_check_id, aprovado ? 1 : 0, observacoes || null)
          .run();
      }

      resultadosSalvos.push({ sessao_check_id, aprovado });
    }

    return c.json({
      success: true,
      message: 'Resultados salvos',
      resultados_salvos: resultadosSalvos,
    });
  } catch (e: unknown) {
    createLogger(c, 'SimuladoresFichas').error('Erro ao salvar resultados de checks', toError(e));
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
