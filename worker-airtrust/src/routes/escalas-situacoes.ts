/**
 * ESCALAS — Situações operacionais sem aeronave (férias, folga, licença, etc.)
 *   GET    /situacao-tipos
 *   POST   /:id/situacoes
 *   PUT    /:id/situacoes/:sid
 *   DELETE /:id/situacoes/:sid
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe, getEscalaVerificada } from './escalas-shared';
import { publishDomainEvent } from '../shared/domainEvents';
import { createLogger, toError } from '../utils/logger';
import {
  type SituacaoTipoCodigo,
  type SituacaoTipoRow,
  SituacaoCreateSchema,
  SituacaoUpdateSchema,
} from './escalas-alocacoes-schemas';
import { removerFolgaAutomaticaOrfa } from './escalas-alocacoes-engine';
import {
  getUserId,
  escalasClientError,
  getSituacaoTipo,
  sincronizarFuncionarioFerias,
  removerFuncionarioFeriasPorAlocacao,
  removerFolgaAutomaticaSeExiste,
  resolverQuinzenaPadraoPorPeriodo,
  checarSobreposicaoFuncionario,
  auditarAlocacao,
  buscarAlocacoesDetalhadas,
  mapAlocacaoDetalhada,
} from './escalas-alocacoes-helpers-internal';

const situacoes = new Hono<{ Bindings: Env }>();

// ─────────────────────────────────────────────────────────────────────────────
// GET /situacao-tipos — listar tipos ativos de situação
// ─────────────────────────────────────────────────────────────────────────────

situacoes.get('/situacao-tipos', auth(), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, codigo, nome, cor, icone, bloqueia_alocacao, ativo, ordem
         FROM escala_situacao_tipos
        WHERE deleted_at IS NULL
          AND ativo = 1
        ORDER BY ordem, nome`,
  ).all<SituacaoTipoRow>();

  return c.json({ success: true, data: rows.results || [] });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/situacoes — criar situação sem aeronave
// ─────────────────────────────────────────────────────────────────────────────

situacoes.post('/:id/situacoes', auth(), requireRole('admin', 'manager'), async (c) => {
  const escalaId = c.req.param('id');
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c as unknown as { get: (k: string) => unknown }) || 'system';
  const logger = createLogger(c, 'EscalasSituacoesRoutes');

  const body = await c.req.json().catch(() => null);
  const parsed = SituacaoCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      escalasClientError(
        parsed.error.issues.map((item) => item.message).join(', '),
        'ESCALAS_SITUACAO_VALIDATION_ERROR',
        400,
      ),
      400,
    );
  }

  const d = parsed.data;

  try {
    const escala = await getEscalaVerificada(db, escalaId, empresaId);
    if (!escala) {
      return c.json(
        escalasClientError('Escala não encontrada', 'ESCALAS_ESCALA_NOT_FOUND', 404),
        404,
      );
    }

    const quinzenaEfetiva =
      d.quinzena_id ??
      (await resolverQuinzenaPadraoPorPeriodo(db, {
        empresaId,
        ano: Number(escala.ano),
        mes: Number(escala.mes),
        dataInicio: d.data_inicio,
        dataFim: d.data_fim,
      }));
    const funcionario = await db
      .prepare(
        `SELECT id, nome, guerra
           FROM funcionarios
          WHERE id = ?
            AND deleted_at IS NULL
            AND (empresa_id IS NULL OR empresa_id = ?)
          LIMIT 1`,
      )
      .bind(d.funcionario_id, empresaId)
      .first<{ id: string; nome: string; guerra: string | null }>();

    if (!funcionario) {
      return c.json(
        escalasClientError('Funcionário não encontrado', 'ESCALAS_FUNCIONARIO_NOT_FOUND', 404),
        404,
      );
    }

    const situacaoTipo = await getSituacaoTipo(db, d.situacao_tipo);
    if (!situacaoTipo) {
      return c.json(
        escalasClientError('Tipo de situação inválido', 'ESCALAS_SITUACAO_TIPO_INVALID', 400),
        400,
      );
    }

    // Situação tem prioridade: cancelar alocações de aeronave e folga sobrepostas
    await db
      .prepare(
        `UPDATE escala_alocacoes
            SET status = 'cancelado', updated_at = datetime('now')
          WHERE CAST(funcionario_id AS TEXT) = ?
            AND deleted_at IS NULL
            AND status != 'cancelado'
            AND (
              aeronave_id IS NOT NULL
              OR (situacao_tipo IS NOT NULL AND UPPER(situacao_tipo) = 'FOLGA')
            )
            AND NOT (data_fim < ? OR data_inicio > ?)`,
      )
      .bind(d.funcionario_id, d.data_inicio, d.data_fim)
      .run();

    const sobreposicao = await checarSobreposicaoFuncionario(
      db,
      d.funcionario_id,
      d.data_inicio,
      d.data_fim,
      undefined,
      null,
    );

    if (sobreposicao) {
      return c.json(
        {
          success: false,
          code: 'SOBREPOSICAO_PERIODO',
          error: `${funcionario.nome} já possui alocação ou situação sobreposta de ${sobreposicao.data_inicio} a ${sobreposicao.data_fim}`,
          conflito: sobreposicao,
        },
        409,
      );
    }

    const situacaoId = crypto.randomUUID();

    await db
      .prepare(
        `INSERT INTO escala_alocacoes
         (id, escala_id, funcionario_id, aeronave_id, funcao, situacao_tipo, situacao_cor,
          quinzena_id, data_inicio, data_fim, status, observacoes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, 'planejado', ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        situacaoId,
        escalaId,
        d.funcionario_id,
        situacaoTipo.codigo,
        situacaoTipo.cor,
        quinzenaEfetiva,
        d.data_inicio,
        d.data_fim,
        d.observacoes || null,
        userId,
      )
      .run();

    // ── Limpar legado de folga automática na mesma quinzena ────────────────
    if (quinzenaEfetiva) {
      try {
        await removerFolgaAutomaticaSeExiste(db, {
          escalaId,
          funcionarioId: d.funcionario_id,
          quinzenaId: quinzenaEfetiva,
        });
      } catch (e) {
        logger.error('[situacoes] remover_folga_automatica error', toError(e));
      }
    }

    await sincronizarFuncionarioFerias(db, {
      funcionarioId: d.funcionario_id,
      dataInicio: d.data_inicio,
      dataFim: d.data_fim,
      tipo: situacaoTipo.codigo,
      observacoes: d.observacoes || null,
      escalaAlocacaoId: situacaoId,
      criadoPor: userId,
    });

    await auditarAlocacao(db, {
      escala_id: escalaId,
      acao: 'CRIAR_SITUACAO',
      alocacao_id: situacaoId,
      realizado_por: userId,
      valor_novo: JSON.stringify(d),
    });

    try {
      await publishDomainEvent(db, 'escalas', 'TRIPULANTE_ALTERADO', {
        empresa_id: empresaId,
        origem_modulo: 'escalas',
        origem_usuario_id: userId,
        funcionario_id: d.funcionario_id,
        escala_id: escalaId,
        alocacao_id: situacaoId,
        situacao_tipo: situacaoTipo.codigo,
        data_inicio: d.data_inicio,
        data_fim: d.data_fim,
      });
    } catch (error) {
      logger.error('[situacoes] domain_event error', toError(error));
    }

    const [situacaoCriada] = await buscarAlocacoesDetalhadas(db, {
      escalaId,
      alocacaoId: situacaoId,
    });

    return c.json(
      {
        success: true,
        data: situacaoCriada ? mapAlocacaoDetalhada(situacaoCriada) : null,
      },
      201,
    );
  } catch (error) {
    logger.error('[situacoes] POST error', toError(error), { escalaId, route: c.req.path });
    return c.json(
      escalasClientError(
        'Erro ao criar situação operacional',
        'ESCALAS_SITUACAO_CREATE_ERROR',
        500,
      ),
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id/situacoes/:sid — editar situação sem aeronave
// ─────────────────────────────────────────────────────────────────────────────

situacoes.put('/:id/situacoes/:sid', auth(), requireRole('admin', 'manager'), async (c) => {
  const escalaId = c.req.param('id');
  const situacaoId = c.req.param('sid');
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c as unknown as { get: (k: string) => unknown }) || 'system';
  const logger = createLogger(c, 'EscalasSituacoesRoutes');

  const body = await c.req.json().catch(() => null);
  const parsed = SituacaoUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      escalasClientError(
        parsed.error.issues.map((item) => item.message).join(', '),
        'ESCALAS_SITUACAO_VALIDATION_ERROR',
        400,
      ),
      400,
    );
  }

  try {
    const escala = await getEscalaVerificada(db, escalaId, empresaId);
    if (!escala) {
      return c.json(
        escalasClientError('Escala não encontrada', 'ESCALAS_ESCALA_NOT_FOUND', 404),
        404,
      );
    }
    const atual = await db
      .prepare(
        `SELECT id, funcionario_id, situacao_tipo, quinzena_id, data_inicio, data_fim, observacoes, status
           FROM escala_alocacoes
          WHERE id = ?
            AND escala_id = ?
            AND deleted_at IS NULL
            AND situacao_tipo IS NOT NULL
          LIMIT 1`,
      )
      .bind(situacaoId, escalaId)
      .first<{
        id: string;
        funcionario_id: string;
        situacao_tipo: SituacaoTipoCodigo;
        quinzena_id: number | null;
        data_inicio: string;
        data_fim: string;
        observacoes: string | null;
        status: 'planejado' | 'confirmado' | 'cancelado';
      }>();

    if (!atual) {
      return c.json(
        escalasClientError('Situação não encontrada', 'ESCALAS_SITUACAO_NOT_FOUND', 404),
        404,
      );
    }

    const funcionarioId = parsed.data.funcionario_id ?? atual.funcionario_id;
    const dataInicio = parsed.data.data_inicio ?? atual.data_inicio;
    const dataFim = parsed.data.data_fim ?? atual.data_fim;
    const situacaoCodigo = parsed.data.situacao_tipo ?? atual.situacao_tipo;
    const quinzenaEfetiva =
      parsed.data.quinzena_id !== undefined
        ? parsed.data.quinzena_id
        : parsed.data.data_inicio !== undefined || parsed.data.data_fim !== undefined
          ? await resolverQuinzenaPadraoPorPeriodo(db, {
              empresaId,
              ano: Number(escala.ano),
              mes: Number(escala.mes),
              dataInicio,
              dataFim,
            })
          : atual.quinzena_id;

    const funcionario = await db
      .prepare(
        `SELECT id, nome FROM funcionarios
          WHERE id = ? AND deleted_at IS NULL AND (empresa_id IS NULL OR empresa_id = ?)
          LIMIT 1`,
      )
      .bind(funcionarioId, empresaId)
      .first<{ id: string; nome: string }>();

    if (!funcionario) {
      return c.json(
        escalasClientError('Funcionário não encontrado', 'ESCALAS_FUNCIONARIO_NOT_FOUND', 404),
        404,
      );
    }

    const situacaoTipo = await getSituacaoTipo(db, situacaoCodigo);
    if (!situacaoTipo) {
      return c.json(
        escalasClientError('Tipo de situação inválido', 'ESCALAS_SITUACAO_TIPO_INVALID', 400),
        400,
      );
    }

    // Situação tem prioridade: cancelar alocações de aeronave e folga sobrepostas
    await db
      .prepare(
        `UPDATE escala_alocacoes
            SET status = 'cancelado', updated_at = datetime('now')
          WHERE CAST(funcionario_id AS TEXT) = ?
            AND id != ?
            AND deleted_at IS NULL
            AND status != 'cancelado'
            AND (
              aeronave_id IS NOT NULL
              OR (situacao_tipo IS NOT NULL AND UPPER(situacao_tipo) = 'FOLGA')
            )
            AND NOT (data_fim < ? OR data_inicio > ?)`,
      )
      .bind(funcionarioId, situacaoId, dataInicio, dataFim)
      .run();

    const sobreposicao = await checarSobreposicaoFuncionario(
      db,
      funcionarioId,
      dataInicio,
      dataFim,
      situacaoId,
      null,
    );

    if (sobreposicao) {
      return c.json(
        {
          success: false,
          code: 'SOBREPOSICAO_PERIODO',
          error: `${funcionario.nome} já possui alocação ou situação sobreposta de ${sobreposicao.data_inicio} a ${sobreposicao.data_fim}`,
          conflito: sobreposicao,
        },
        409,
      );
    }

    const campos: string[] = ["updated_at = datetime('now')"];
    const valores: unknown[] = [];

    if (parsed.data.funcionario_id !== undefined) {
      campos.push('funcionario_id = ?');
      valores.push(parsed.data.funcionario_id);
    }
    if (parsed.data.situacao_tipo !== undefined) {
      campos.push('situacao_tipo = ?');
      valores.push(parsed.data.situacao_tipo);
      campos.push('situacao_cor = ?');
      valores.push(situacaoTipo.cor);
    }
    if (
      parsed.data.quinzena_id !== undefined ||
      parsed.data.data_inicio !== undefined ||
      parsed.data.data_fim !== undefined
    ) {
      campos.push('quinzena_id = ?');
      valores.push(quinzenaEfetiva ?? null);
    }
    if (parsed.data.data_inicio !== undefined) {
      campos.push('data_inicio = ?');
      valores.push(parsed.data.data_inicio);
    }
    if (parsed.data.data_fim !== undefined) {
      campos.push('data_fim = ?');
      valores.push(parsed.data.data_fim);
    }
    if (parsed.data.observacoes !== undefined) {
      campos.push('observacoes = ?');
      valores.push(parsed.data.observacoes);
    }
    if (parsed.data.status !== undefined) {
      campos.push('status = ?');
      valores.push(parsed.data.status);
    }

    await db
      .prepare(`UPDATE escala_alocacoes SET ${campos.join(', ')} WHERE id = ?`)
      .bind(...valores, situacaoId)
      .run();

    if (atual.quinzena_id && atual.quinzena_id !== quinzenaEfetiva) {
      await removerFolgaAutomaticaOrfa(db, {
        escalaId,
        funcionarioId: atual.funcionario_id,
        quinzenaId: atual.quinzena_id,
      });
    }

    if (quinzenaEfetiva) {
      await removerFolgaAutomaticaSeExiste(db, {
        escalaId,
        funcionarioId,
        quinzenaId: quinzenaEfetiva,
      });
    }

    await sincronizarFuncionarioFerias(db, {
      funcionarioId,
      dataInicio,
      dataFim,
      tipo: situacaoTipo.codigo,
      observacoes: parsed.data.observacoes ?? atual.observacoes,
      escalaAlocacaoId: situacaoId,
      criadoPor: userId,
    });

    await auditarAlocacao(db, {
      escala_id: escalaId,
      acao: 'EDITAR_SITUACAO',
      alocacao_id: situacaoId,
      realizado_por: userId,
      valor_anterior: JSON.stringify(atual),
      valor_novo: JSON.stringify(parsed.data),
    });

    const [situacaoAtualizada] = await buscarAlocacoesDetalhadas(db, {
      escalaId,
      alocacaoId: situacaoId,
    });

    return c.json({
      success: true,
      data: situacaoAtualizada ? mapAlocacaoDetalhada(situacaoAtualizada) : null,
    });
  } catch (error) {
    logger.error('[situacoes] PUT error', toError(error), {
      escalaId,
      situacaoId,
      route: c.req.path,
    });
    return c.json(
      escalasClientError(
        'Erro ao atualizar situação operacional',
        'ESCALAS_SITUACAO_UPDATE_ERROR',
        500,
      ),
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id/situacoes/:sid — remover situação sem aeronave
// ─────────────────────────────────────────────────────────────────────────────

situacoes.delete('/:id/situacoes/:sid', auth(), requireRole('admin', 'manager'), async (c) => {
  const escalaId = c.req.param('id');
  const situacaoId = c.req.param('sid');
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c as unknown as { get: (k: string) => unknown }) || 'system';
  const logger = createLogger(c, 'EscalasSituacoesRoutes');

  try {
    const escala = await getEscalaVerificada(db, escalaId, empresaId);
    if (!escala) {
      return c.json(
        escalasClientError('Escala não encontrada', 'ESCALAS_ESCALA_NOT_FOUND', 404),
        404,
      );
    }
    const situacao = await db
      .prepare(
        `SELECT id, funcionario_id, situacao_tipo, quinzena_id
           FROM escala_alocacoes
          WHERE id = ?
            AND escala_id = ?
            AND deleted_at IS NULL
            AND situacao_tipo IS NOT NULL
          LIMIT 1`,
      )
      .bind(situacaoId, escalaId)
      .first<{
        id: string;
        funcionario_id: string;
        situacao_tipo: string;
        quinzena_id: number | null;
      }>();

    if (!situacao) {
      return c.json(
        escalasClientError('Situação não encontrada', 'ESCALAS_SITUACAO_NOT_FOUND', 404),
        404,
      );
    }

    await db
      .prepare(
        `UPDATE escala_alocacoes
            SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?`,
      )
      .bind(situacaoId)
      .run();

    await removerFuncionarioFeriasPorAlocacao(db, situacaoId);

    // Remover folga automática órfã na quinzena oposta (se existir)
    if (situacao.quinzena_id) {
      try {
        await removerFolgaAutomaticaOrfa(db, {
          escalaId,
          funcionarioId: situacao.funcionario_id,
          quinzenaId: situacao.quinzena_id,
        });
      } catch (e) {
        logger.error('[situacoes] removerFolgaAutomaticaOrfa error', toError(e));
      }
    }

    await auditarAlocacao(db, {
      escala_id: escalaId,
      acao: 'REMOVER_SITUACAO',
      alocacao_id: situacaoId,
      realizado_por: userId,
      valor_anterior: JSON.stringify(situacao),
    });

    return c.json({ success: true, data: { id: situacaoId } });
  } catch (error) {
    logger.error('[situacoes] DELETE error', toError(error), {
      escalaId,
      situacaoId,
      route: c.req.path,
    });
    return c.json(
      escalasClientError(
        'Erro ao remover situação operacional',
        'ESCALAS_SITUACAO_DELETE_ERROR',
        500,
      ),
      500,
    );
  }
});

export default situacoes;
