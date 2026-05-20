/**
 * ESCALAS — Alocações operacionais individuais (v2)
 *
 * Substitui o modelo par PIC+SIC de escala_tripulacoes por alocações
 * individuais: 1 registro por (funcionário × função × aeronave × período).
 *
 * Rotas:
 *   POST   /:id/alocacoes           → criar alocação individual
 *   GET    /:id/alocacoes           → listar alocações da escala
 *   PUT    /:id/alocacoes/:aid      → editar alocação
 *   DELETE /:id/alocacoes/:aid      → soft-delete + remover eventos auto
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  getEmpresaIdSafe,
  getEscalaVerificada,
  getEscalaVerificadaParaMutacao,
} from './escalas-shared';
import { publishDomainEvent } from '../shared/domainEvents';
import { verificarCMAAutomatico } from '../utils/escala-engine';
import { getFrmsOperationalState } from '../shared/getTripulanteOperacional';
import { createLogger, toError } from '../utils/logger';
import {
  type AlocacaoDetalhadaRow,
  type AlocacaoLoteItemInput,
  type FuncaoAlocacao,
  type SituacaoTipoCodigo,
  type SituacaoTipoRow,
  FUNCOES_ALOCACAO,
  SITUACOES_TIPO,
  AlocacaoCreateSchema,
  AlocacoesLoteSaveSchema,
  AlocacaoUpdateSchema,
  SituacaoCreateSchema,
  SituacaoUpdateSchema,
} from './escalas-alocacoes-schemas';
import {
  removerFolgaAutomaticaOrfa,
  regenerarEventosAutomaticosFuncionarioEscala,
  recalcularCoberturaAeronave,
  desalocarAeronaveInativa,
} from './escalas-alocacoes-engine';
import {
  getUserId,
  escalasClientError,
  formatarDescricaoSobreposicao,
  cancelarFolgasSobrepostas,
  removerFolgaAutomaticaSeExiste,
  removerFuncionarioFeriasPorAlocacao,
  resolverQuinzenaPadraoPorPeriodo,
  checarSobreposicaoFuncionario,
  checarSobreposicaoSlot,
  verificarHabilitacaoModelo,
  auditarAlocacao,
  buscarAlocacoesDetalhadas,
  mapAlocacaoDetalhada,
  type SobreposicaoFuncionarioDetalhe,
} from './escalas-alocacoes-helpers-internal';
import situacoesRoutes from './escalas-situacoes';
export { desalocarAeronaveInativa, recalcularCoberturaAeronave };

const alocacoes = new Hono<{ Bindings: Env }>();

// Situacoes routes extracted to escalas-situacoes.ts
alocacoes.route('/', situacoesRoutes);

type AlocacaoAtualLote = {
  id: string;
  funcionario_id: string;
  aeronave_id: number | null;
  funcao: FuncaoAlocacao;
  quinzena_id: number | null;
  data_inicio: string;
  data_fim: string;
  padrao_escala_id: string | null;
  base: string | null;
  observacoes: string | null;
  status: string;
};

type AlocacaoLoteContexto = {
  index: number;
  slotKey: string | null;
  operacao: 'create' | 'update';
  alocacaoId: string;
  funcionarioId: string;
  funcionarioNome: string;
  aeronaveId: number | null;
  aeronavePrefixo: string | null;
  modeloAeronave: string | null;
  funcao: FuncaoAlocacao;
  quinzenaId: number | null;
  dataInicio: string;
  dataFim: string;
  padraoEscalaId: string | null;
  base: string | null;
  observacoes: string | null;
  cmaOverride: 0 | 1;
  conflitoOverride: 0 | 1;
  atual: AlocacaoAtualLote | null;
  alertas: Array<{ tipo: string; detalhe: string }>;
};

async function substituirAlocacaoSobreposta(
  db: D1Database,
  params: {
    conflitoId: string;
    empresaId: number | undefined;
    userId: string;
    logger: ReturnType<typeof createLogger>;
  },
): Promise<{
  id: string;
  escala_id: string;
  aeronave_id: number | null;
  funcionario_id: string;
  quinzena_id: number | null;
  mes: number;
  ano: number;
  situacao_tipo: string | null;
} | null> {
  const conflito = await db
    .prepare(
      `SELECT
         ea.id,
         CAST(ea.escala_id AS TEXT) AS escala_id,
         ea.aeronave_id,
         CAST(ea.funcionario_id AS TEXT) AS funcionario_id,
         ea.quinzena_id,
         ea.situacao_tipo,
         em.mes,
         em.ano
       FROM escala_alocacoes ea
       JOIN escalas_mensais em ON em.id = ea.escala_id AND em.deleted_at IS NULL
       WHERE ea.id = ?
         AND ea.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(params.conflitoId)
    .first<{
      id: string;
      escala_id: string;
      aeronave_id: number | null;
      funcionario_id: string;
      quinzena_id: number | null;
      situacao_tipo: string | null;
      mes: number;
      ano: number;
    }>();

  if (!conflito) return null;

  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE escala_alocacoes
          SET deleted_at = ?, updated_at = ?
        WHERE id = ?
          AND deleted_at IS NULL`,
    )
    .bind(now, now, conflito.id)
    .run();

  await db
    .prepare(
      `UPDATE escala_eventos
          SET deleted_at = ?, updated_at = ?
        WHERE alocacao_id = ?
          AND gerado_automaticamente = 1
          AND deleted_at IS NULL`,
    )
    .bind(now, now, conflito.id)
    .run();

  if (conflito.situacao_tipo) {
    await removerFuncionarioFeriasPorAlocacao(db, conflito.id);
  }

  if (conflito.quinzena_id) {
    try {
      await removerFolgaAutomaticaOrfa(db, {
        escalaId: conflito.escala_id,
        funcionarioId: conflito.funcionario_id,
        quinzenaId: conflito.quinzena_id,
      });
    } catch (error) {
      params.logger.error('[alocacoes] conflito_override folga_orfa error', toError(error), {
        conflitoId: conflito.id,
      });
    }
  }

  try {
    await regenerarEventosAutomaticosFuncionarioEscala({
      db,
      empresa_id: params.empresaId,
      escala_id: conflito.escala_id,
      funcionario_id: conflito.funcionario_id,
      created_by: params.userId || 'system',
    });
  } catch (error) {
    params.logger.error('[alocacoes] conflito_override regenerar_eventos error', toError(error), {
      conflitoId: conflito.id,
    });
  }

  if (conflito.aeronave_id) {
    try {
      await recalcularCoberturaAeronave(
        db,
        conflito.escala_id,
        conflito.aeronave_id,
        Number(conflito.mes),
        Number(conflito.ano),
      );
    } catch (error) {
      params.logger.error('[alocacoes] conflito_override cobertura error', toError(error), {
        conflitoId: conflito.id,
      });
    }
  }

  return conflito;
}

function buildNotInClause(ids: string[], column = 'ea.id'): { sql: string; bindings: string[] } {
  if (ids.length === 0) return { sql: '', bindings: [] };
  return {
    sql: ` AND CAST(${column} AS TEXT) NOT IN (${ids.map(() => '?').join(', ')})`,
    bindings: ids,
  };
}

async function checarSobreposicaoFuncionarioLote(
  db: D1Database,
  params: {
    funcionarioId: string;
    dataInicio: string;
    dataFim: string;
    ignorarIds: string[];
    aeronaveIdPrioritaria?: number | null;
  },
): Promise<SobreposicaoFuncionarioDetalhe | null> {
  const { sql: ignoreSql, bindings: ignoreBindings } = buildNotInClause(params.ignorarIds);
  const filtroBloqueio = `
      AND (
        ea.aeronave_id IS NOT NULL
        OR (
          ea.situacao_tipo IS NOT NULL
          AND UPPER(ea.situacao_tipo) != 'FOLGA'
          AND COALESCE(est.bloqueia_alocacao, 1) = 1
        )
        OR (? IS NULL AND ea.aeronave_id IS NULL AND ea.situacao_tipo IS NULL)
      )`;

  return db
    .prepare(
      `SELECT ea.id,
              CAST(ea.escala_id AS TEXT) AS escala_id,
              ea.aeronave_id,
              a.prefixo AS aeronave_prefixo,
              a.modelo AS aeronave_modelo,
              ea.data_inicio,
              ea.data_fim,
              ea.funcao,
              eq.numero AS quinzena_numero,
              ea.situacao_tipo,
              est.nome AS situacao_nome
         FROM escala_alocacoes ea
         JOIN escalas_mensais em ON em.id = ea.escala_id AND em.deleted_at IS NULL
         LEFT JOIN aeronaves a ON a.id = ea.aeronave_id
         LEFT JOIN escalas_quinzenas eq ON eq.id = ea.quinzena_id AND eq.deleted_at IS NULL
         LEFT JOIN escala_situacao_tipos est
           ON UPPER(est.codigo) = UPPER(COALESCE(ea.situacao_tipo, ''))
          AND est.deleted_at IS NULL
        WHERE CAST(ea.funcionario_id AS TEXT) = ?
          AND ea.deleted_at IS NULL
          AND ea.status != 'cancelado'
          ${ignoreSql}
          ${filtroBloqueio}
          AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)
        LIMIT 1`,
    )
    .bind(
      params.funcionarioId,
      ...ignoreBindings,
      params.aeronaveIdPrioritaria ?? null,
      params.dataInicio,
      params.dataFim,
    )
    .first();
}

async function checarSobreposicaoSlotLote(
  db: D1Database,
  params: {
    escalaId: string;
    aeronaveId: number;
    funcao: FuncaoAlocacao;
    dataInicio: string;
    dataFim: string;
    ignorarIds: string[];
  },
): Promise<{ id: string; funcionario_nome: string; data_inicio: string; data_fim: string } | null> {
  const { sql: ignoreSql, bindings: ignoreBindings } = buildNotInClause(params.ignorarIds);

  return db
    .prepare(
      `SELECT ea.id, f.nome AS funcionario_nome, ea.data_inicio, ea.data_fim
         FROM escala_alocacoes ea
         LEFT JOIN funcionarios f ON f.id = ea.funcionario_id
        WHERE ea.escala_id = ?
          AND ea.aeronave_id = ?
          AND ea.funcao = ?
          AND ea.deleted_at IS NULL
          AND ea.status != 'cancelado'
          ${ignoreSql}
          AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)
        LIMIT 1`,
    )
    .bind(
      params.escalaId,
      params.aeronaveId,
      params.funcao,
      ...ignoreBindings,
      params.dataInicio,
      params.dataFim,
    )
    .first();
}

async function buscarParceiroSlotLote(
  db: D1Database,
  params: {
    escalaId: string;
    aeronaveId: number;
    funcao: FuncaoAlocacao;
    dataInicio: string;
    dataFim: string;
    ignorarIds: string[];
  },
): Promise<{ funcionario_id: string } | null> {
  const { sql: ignoreSql, bindings: ignoreBindings } = buildNotInClause(params.ignorarIds);

  return db
    .prepare(
      `SELECT CAST(ea.funcionario_id AS TEXT) AS funcionario_id
         FROM escala_alocacoes ea
        WHERE ea.escala_id = ?
          AND ea.aeronave_id = ?
          AND ea.funcao = ?
          AND ea.deleted_at IS NULL
          AND ea.status != 'cancelado'
          ${ignoreSql}
          AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)
        LIMIT 1`,
    )
    .bind(
      params.escalaId,
      params.aeronaveId,
      params.funcao,
      ...ignoreBindings,
      params.dataInicio,
      params.dataFim,
    )
    .first<{ funcionario_id: string }>();
}

async function existeRestricaoTripulacao(
  db: D1Database,
  funcionarioAId: string,
  funcionarioBId: string,
  dataInicio: string,
): Promise<boolean> {
  const restricao = await db
    .prepare(
      `SELECT id FROM restricoes_tripulacao
        WHERE ((funcionario_a_id = ? AND funcionario_b_id = ?)
            OR (funcionario_a_id = ? AND funcionario_b_id = ?))
          AND tipo_restricao = 'nao_pode_voar_junto'
          AND ativo = 1
          AND deleted_at IS NULL
          AND (data_fim IS NULL OR data_fim >= ?)
        LIMIT 1`,
    )
    .bind(funcionarioAId, funcionarioBId, funcionarioBId, funcionarioAId, dataInicio)
    .first();

  return Boolean(restricao);
}

function formatarErroLote(params: {
  mensagem: string;
  codigo: string;
  index: number;
  slotKey: string | null;
  extra?: Record<string, unknown>;
}) {
  return {
    success: false,
    error: params.mensagem,
    code: params.codigo,
    lote: {
      index: params.index,
      slot_key: params.slotKey,
      ...(params.extra ?? {}),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/alocacoes/lote — salvar lote atômico de alocações operacionais
// ─────────────────────────────────────────────────────────────────────────────

alocacoes.post('/:id/alocacoes/lote', auth(), requireRole('admin', 'manager'), async (c) => {
  const escalaId = c.req.param('id');
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c as unknown as { get: (k: string) => unknown }) || 'system';
  const logger = createLogger(c, 'EscalasAlocacoesLoteRoutes');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(escalasClientError('Body inválido', 'ESCALAS_ALOCACAO_BODY_INVALID', 400), 400);
  }

  const parsed = AlocacoesLoteSaveSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      escalasClientError(
        parsed.error.issues.map((item) => item.message).join(', '),
        'ESCALAS_ALOCACAO_LOTE_VALIDATION_ERROR',
        400,
      ),
      400,
    );
  }

  try {
    const escalaResult = await getEscalaVerificadaParaMutacao(db, escalaId, empresaId);
    if ('error' in escalaResult) {
      return c.json(
        escalasClientError(escalaResult.error, 'ESCALAS_ESCALA_NOT_FOUND', escalaResult.status),
        escalaResult.status as 400 | 404 | 409,
      );
    }
    const escala = escalaResult.escala;

    const idsAtualizacao = parsed.data.itens
      .map((item) => item.alocacao_id)
      .filter((value): value is string => Boolean(value));

    if (new Set(idsAtualizacao).size !== idsAtualizacao.length) {
      return c.json(
        escalasClientError(
          'O lote contém a mesma alocação mais de uma vez',
          'ESCALAS_ALOCACAO_LOTE_DUPLICATE_ID',
          400,
        ),
        400,
      );
    }

    const contextos: AlocacaoLoteContexto[] = [];

    for (const [index, item] of parsed.data.itens.entries()) {
      const slotKey = item.slot_key || null;
      const atual = item.alocacao_id
        ? await db
            .prepare(
              `SELECT id, CAST(funcionario_id AS TEXT) AS funcionario_id, aeronave_id, funcao,
                      quinzena_id, data_inicio, data_fim, padrao_escala_id, base, observacoes, status
                 FROM escala_alocacoes
                WHERE id = ?
                  AND escala_id = ?
                  AND deleted_at IS NULL
                LIMIT 1`,
            )
            .bind(item.alocacao_id, escalaId)
            .first<AlocacaoAtualLote>()
        : null;

      if (item.alocacao_id && !atual) {
        return c.json(
          formatarErroLote({
            mensagem: 'Alocação não encontrada no lote',
            codigo: 'ESCALAS_ALOCACAO_LOTE_NOT_FOUND',
            index,
            slotKey,
          }),
          404,
        );
      }

      if (atual && atual.status === 'cancelado') {
        return c.json(
          formatarErroLote({
            mensagem: 'Não é possível editar uma alocação cancelada',
            codigo: 'ESCALAS_ALOCACAO_LOTE_CANCELADA',
            index,
            slotKey,
          }),
          409,
        );
      }

      const funcionario = await db
        .prepare(
          `SELECT id, nome
             FROM funcionarios
            WHERE id = ?
              AND deleted_at IS NULL
              AND COALESCE(ativo, 1) = 1
              AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
              AND (empresa_id IS NULL OR empresa_id = ?)
            LIMIT 1`,
        )
        .bind(item.funcionario_id, empresaId)
        .first<{ id: string; nome: string }>();

      if (!funcionario) {
        return c.json(
          formatarErroLote({
            mensagem: 'Funcionário não encontrado',
            codigo: 'ESCALAS_FUNCIONARIO_NOT_FOUND',
            index,
            slotKey,
          }),
          404,
        );
      }

      const aeronaveIdEfetiva = item.aeronave_id ?? atual?.aeronave_id ?? null;
      const aeronave = aeronaveIdEfetiva
        ? await db
            .prepare(
              `SELECT id, prefixo, modelo
                 FROM aeronaves
                WHERE id = ?
                  AND deleted_at IS NULL
                  AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
                LIMIT 1`,
            )
            .bind(aeronaveIdEfetiva)
            .first<{ id: number; prefixo: string | null; modelo: string | null }>()
        : null;

      if (aeronaveIdEfetiva && !aeronave) {
        return c.json(
          formatarErroLote({
            mensagem: 'Aeronave não encontrada',
            codigo: 'ESCALAS_AERONAVE_NOT_FOUND',
            index,
            slotKey,
          }),
          404,
        );
      }

      if (aeronaveIdEfetiva) {
        const habilitacao = await verificarHabilitacaoModelo(
          db,
          item.funcionario_id,
          aeronaveIdEfetiva,
          empresaId,
        );
        if (!habilitacao.habilitado) {
          return c.json(
            formatarErroLote({
              mensagem: habilitacao.motivo || 'Modelo não habilitado',
              codigo: 'MODELO_NAO_HABILITADO',
              index,
              slotKey,
            }),
            400,
          );
        }
      }

      const quinzenaEfetiva =
        item.quinzena_id ??
        (await resolverQuinzenaPadraoPorPeriodo(db, {
          empresaId,
          ano: Number(escala.ano),
          mes: Number(escala.mes),
          dataInicio: item.data_inicio,
          dataFim: item.data_fim,
        }));

      const alertas: Array<{ tipo: string; detalhe: string }> = [];

      try {
        const cmaRow = await db
          .prepare(
            `SELECT validade_fim FROM certificacoes
             WHERE funcionario_id = ?
               AND tipo = 'CMA'
               AND deleted_at IS NULL
             ORDER BY validade_fim DESC
             LIMIT 1`,
          )
          .bind(item.funcionario_id)
          .first<{ validade_fim: string | null }>();

        if (cmaRow?.validade_fim && cmaRow.validade_fim < item.data_inicio) {
          if ((item.cma_override ?? 0) !== 1) {
            return c.json(
              formatarErroLote({
                mensagem: `CMA expirado em ${cmaRow.validade_fim}. Não é possível salvar o lote sem override.`,
                codigo: 'CMA_EXPIRADO',
                index,
                slotKey,
              }),
              409,
            );
          }

          alertas.push({
            tipo: 'CMA_OVERRIDE',
            detalhe: `${funcionario.nome}: CMA expirado em ${cmaRow.validade_fim}. Alocação confirmada por override do operador.`,
          });
        }
      } catch (error) {
        logger.error('[alocacoes-lote] CMA hard-block check error', toError(error), {
          escalaId,
          index,
        });
      }

      try {
        const frmsState = await getFrmsOperationalState(db, item.funcionario_id);
        if (frmsState.frms_status === 'critico') {
          return c.json(
            formatarErroLote({
              mensagem: `${funcionario.nome}: alertas FRMS críticos/violação não resolvidos (score ${frmsState.frms_score}). Resolva os alertas antes de alocar.`,
              codigo: 'FRMS_CRITICO',
              index,
              slotKey,
            }),
            409,
          );
        }
        if (frmsState.frms_status === 'atencao') {
          alertas.push({
            tipo: 'FRMS_ATENCAO',
            detalhe: `${funcionario.nome}: score FRMS em atenção (${frmsState.frms_score}). Considere a carga de trabalho.`,
          });
        }
      } catch (error) {
        logger.error('[alocacoes-lote] FRMS warning check error', toError(error), {
          escalaId,
          index,
        });
      }

      contextos.push({
        index,
        slotKey,
        operacao: atual ? 'update' : 'create',
        alocacaoId: atual?.id || crypto.randomUUID(),
        funcionarioId: item.funcionario_id,
        funcionarioNome: funcionario.nome,
        aeronaveId: aeronaveIdEfetiva,
        aeronavePrefixo: aeronave?.prefixo || null,
        modeloAeronave: aeronave?.modelo || item.modelo_aeronave || null,
        funcao: item.funcao,
        quinzenaId: quinzenaEfetiva,
        dataInicio: item.data_inicio,
        dataFim: item.data_fim,
        padraoEscalaId: item.padrao_escala_id || null,
        base: item.base || null,
        observacoes: item.observacoes || null,
        cmaOverride: item.cma_override === 1 ? 1 : 0,
        conflitoOverride: item.conflito_override === 1 ? 1 : 0,
        atual,
        alertas,
      });
    }

    for (let index = 0; index < contextos.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < contextos.length; compareIndex += 1) {
        const atual = contextos[index];
        const comparado = contextos[compareIndex];
        const sobrepoe = !(
          atual.dataFim < comparado.dataInicio || atual.dataInicio > comparado.dataFim
        );

        if (!sobrepoe) continue;

        if (atual.alocacaoId === comparado.alocacaoId) {
          return c.json(
            escalasClientError(
              'O lote contém a mesma alocação mais de uma vez',
              'ESCALAS_ALOCACAO_LOTE_DUPLICATE_ID',
              400,
            ),
            400,
          );
        }

        if (atual.funcionarioId === comparado.funcionarioId) {
          return c.json(
            formatarErroLote({
              mensagem: `${atual.funcionarioNome} aparece em slots sobrepostos no mesmo lote`,
              codigo: 'ESCALAS_ALOCACAO_LOTE_FUNCIONARIO_CONFLITO',
              index: comparado.index,
              slotKey: comparado.slotKey,
            }),
            409,
          );
        }

        if (
          atual.aeronaveId != null &&
          atual.aeronaveId === comparado.aeronaveId &&
          atual.funcao === comparado.funcao
        ) {
          return c.json(
            formatarErroLote({
              mensagem: `O slot ${atual.funcao} possui registros sobrepostos no mesmo lote`,
              codigo: 'ESCALAS_ALOCACAO_LOTE_SLOT_CONFLITO',
              index: comparado.index,
              slotKey: comparado.slotKey,
            }),
            409,
          );
        }

        const funcoesPareadas =
          atual.aeronaveId != null &&
          atual.aeronaveId === comparado.aeronaveId &&
          ((atual.funcao === 'PIC' && comparado.funcao === 'SIC') ||
            (atual.funcao === 'SIC' && comparado.funcao === 'PIC'));

        if (funcoesPareadas) {
          const restricao = await existeRestricaoTripulacao(
            db,
            atual.funcionarioId,
            comparado.funcionarioId,
            atual.dataInicio,
          );

          if (restricao) {
            return c.json(
              formatarErroLote({
                mensagem: 'Restrição de tripulação: estes pilotos não podem voar juntos',
                codigo: 'RESTRICAO_PAR',
                index: comparado.index,
                slotKey: comparado.slotKey,
              }),
              409,
            );
          }
        }
      }
    }

    const idsIgnorarVerificacao = new Set(idsAtualizacao);

    for (const contexto of contextos) {
      const sobreposicaoFunc = await checarSobreposicaoFuncionarioLote(db, {
        funcionarioId: contexto.funcionarioId,
        dataInicio: contexto.dataInicio,
        dataFim: contexto.dataFim,
        ignorarIds: Array.from(idsIgnorarVerificacao),
        aeronaveIdPrioritaria: contexto.aeronaveId,
      });

      if (sobreposicaoFunc) {
        if (contexto.conflitoOverride === 1) {
          const removida = await substituirAlocacaoSobreposta(db, {
            conflitoId: sobreposicaoFunc.id,
            empresaId,
            userId: userId || 'system',
            logger,
          });

          if (!removida) {
            return c.json(
              formatarErroLote({
                mensagem: `${contexto.funcionarioNome} já está alocado em ${formatarDescricaoSobreposicao(sobreposicaoFunc)}`,
                codigo: 'SOBREPOSICAO_FUNCIONARIO',
                index: contexto.index,
                slotKey: contexto.slotKey,
                extra: { conflito: sobreposicaoFunc, requer_confirmacao: true },
              }),
              409,
            );
          }

          contexto.alertas.push({
            tipo: 'CONFLITO_OVERRIDE',
            detalhe: `${contexto.funcionarioNome}: alocação anterior em ${formatarDescricaoSobreposicao(sobreposicaoFunc)} foi substituída por confirmação do operador.`,
          });
        } else {
          return c.json(
            formatarErroLote({
              mensagem: `${contexto.funcionarioNome} já está alocado em ${formatarDescricaoSobreposicao(sobreposicaoFunc)}`,
              codigo: 'SOBREPOSICAO_FUNCIONARIO',
              index: contexto.index,
              slotKey: contexto.slotKey,
              extra: { conflito: sobreposicaoFunc, requer_confirmacao: true },
            }),
            409,
          );
        }
      }

      if (contexto.aeronaveId != null) {
        const sobreposicaoSlot = await checarSobreposicaoSlotLote(db, {
          escalaId,
          aeronaveId: contexto.aeronaveId,
          funcao: contexto.funcao,
          dataInicio: contexto.dataInicio,
          dataFim: contexto.dataFim,
          ignorarIds: Array.from(idsIgnorarVerificacao),
        });

        if (sobreposicaoSlot) {
          return c.json(
            formatarErroLote({
              mensagem: `Slot ${contexto.funcao} em ${contexto.aeronavePrefixo || 'aeronave'} já está ocupado por ${sobreposicaoSlot.funcionario_nome} de ${sobreposicaoSlot.data_inicio} a ${sobreposicaoSlot.data_fim}`,
              codigo: 'SLOT_OCUPADO',
              index: contexto.index,
              slotKey: contexto.slotKey,
              extra: { conflito: sobreposicaoSlot },
            }),
            409,
          );
        }

        if (contexto.funcao === 'PIC' || contexto.funcao === 'SIC') {
          const parceiro = await buscarParceiroSlotLote(db, {
            escalaId,
            aeronaveId: contexto.aeronaveId,
            funcao: contexto.funcao === 'PIC' ? 'SIC' : 'PIC',
            dataInicio: contexto.dataInicio,
            dataFim: contexto.dataFim,
            ignorarIds: idsAtualizacao,
          });

          if (
            parceiro &&
            parceiro.funcionario_id !== contexto.funcionarioId &&
            (await existeRestricaoTripulacao(
              db,
              contexto.funcionarioId,
              parceiro.funcionario_id,
              contexto.dataInicio,
            ))
          ) {
            return c.json(
              formatarErroLote({
                mensagem: 'Restrição de tripulação: estes pilotos não podem voar juntos',
                codigo: 'RESTRICAO_PAR',
                index: contexto.index,
                slotKey: contexto.slotKey,
              }),
              409,
            );
          }
        }
      }
    }

    const session = db.withSession('first-primary');
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    const funcionariosParaRegenerar = new Set<string>();
    const aeronavesParaRecalcular = new Set<number>();
    const quinzenasOrfas = new Map<string, { funcionarioId: string; quinzenaId: number }>();

    for (const contexto of contextos) {
      const bindingsFolgaBase: Array<string | number | null> = [escalaId, contexto.funcionarioId];
      const filtroIgnorar = contexto.operacao === 'update' ? 'AND id != ?' : '';
      if (contexto.operacao === 'update') {
        bindingsFolgaBase.push(contexto.alocacaoId);
      }
      bindingsFolgaBase.push(contexto.dataInicio, contexto.dataFim);

      statements.push(
        session
          .prepare(
            `UPDATE funcionario_ferias
                SET deleted_at = ?, updated_at = ?
              WHERE deleted_at IS NULL
                AND escala_alocacao_id IN (
                  SELECT id
                    FROM escala_alocacoes
                   WHERE escala_id = ?
                     AND CAST(funcionario_id AS TEXT) = ?
                     AND deleted_at IS NULL
                     AND status != 'cancelado'
                     AND situacao_tipo IS NOT NULL
                     AND UPPER(situacao_tipo) = 'FOLGA'
                     ${filtroIgnorar}
                     AND NOT (data_fim < ? OR data_inicio > ?)
                )`,
          )
          .bind(now, now, ...bindingsFolgaBase),
      );

      statements.push(
        session
          .prepare(
            `UPDATE escala_alocacoes
                SET status = 'cancelado', updated_at = ?
              WHERE escala_id = ?
                AND CAST(funcionario_id AS TEXT) = ?
                AND deleted_at IS NULL
                AND status != 'cancelado'
                AND situacao_tipo IS NOT NULL
                AND UPPER(situacao_tipo) = 'FOLGA'
                ${filtroIgnorar}
                AND NOT (data_fim < ? OR data_inicio > ?)`,
          )
          .bind(now, ...bindingsFolgaBase),
      );

      if (contexto.quinzenaId) {
        statements.push(
          session
            .prepare(
              `UPDATE escala_alocacoes
                  SET deleted_at = ?, updated_at = ?
                WHERE CAST(funcionario_id AS TEXT) = ?
                  AND escala_id = ?
                  AND quinzena_id = ?
                  AND deleted_at IS NULL
                  AND status != 'cancelado'
                  AND auto_gerado = 1
                  AND situacao_tipo = 'FOLGA'`,
            )
            .bind(now, now, contexto.funcionarioId, escalaId, contexto.quinzenaId),
        );
      }

      if (contexto.operacao === 'update') {
        statements.push(
          session
            .prepare(
              `UPDATE escala_alocacoes
                  SET funcionario_id = ?,
                      aeronave_id = ?,
                      funcao = ?,
                      quinzena_id = ?,
                      data_inicio = ?,
                      data_fim = ?,
                      padrao_escala_id = ?,
                      base = ?,
                      observacoes = ?,
                      cma_override = ?,
                      cma_override_by = ?,
                      modelo_aeronave = ?,
                      updated_at = ?
                WHERE id = ?`,
            )
            .bind(
              contexto.funcionarioId,
              contexto.aeronaveId,
              contexto.funcao,
              contexto.quinzenaId,
              contexto.dataInicio,
              contexto.dataFim,
              contexto.padraoEscalaId,
              contexto.base,
              contexto.observacoes,
              contexto.cmaOverride,
              contexto.cmaOverride === 1 ? userId : null,
              contexto.modeloAeronave,
              now,
              contexto.alocacaoId,
            ),
        );

        if (contexto.atual?.quinzena_id && contexto.atual.quinzena_id !== contexto.quinzenaId) {
          quinzenasOrfas.set(`${contexto.atual.funcionario_id}:${contexto.atual.quinzena_id}`, {
            funcionarioId: contexto.atual.funcionario_id,
            quinzenaId: contexto.atual.quinzena_id,
          });
        }

        funcionariosParaRegenerar.add(contexto.atual?.funcionario_id || contexto.funcionarioId);
        if (contexto.atual?.aeronave_id) aeronavesParaRecalcular.add(contexto.atual.aeronave_id);
      } else {
        statements.push(
          session
            .prepare(
              `INSERT INTO escala_alocacoes
               (id, escala_id, funcionario_id, aeronave_id, funcao, quinzena_id,
                data_inicio, data_fim, padrao_escala_id, base, observacoes, status,
                cma_override, cma_override_by, modelo_aeronave, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planejado', ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              contexto.alocacaoId,
              escalaId,
              contexto.funcionarioId,
              contexto.aeronaveId,
              contexto.funcao,
              contexto.quinzenaId,
              contexto.dataInicio,
              contexto.dataFim,
              contexto.padraoEscalaId,
              contexto.base,
              contexto.observacoes,
              contexto.cmaOverride,
              contexto.cmaOverride === 1 ? userId : null,
              contexto.modeloAeronave,
              userId,
              now,
              now,
            ),
        );
      }

      funcionariosParaRegenerar.add(contexto.funcionarioId);
      if (contexto.aeronaveId) aeronavesParaRecalcular.add(contexto.aeronaveId);
    }

    await session.batch(statements);

    let eventosGerados = 0;
    for (const item of quinzenasOrfas.values()) {
      try {
        await removerFolgaAutomaticaOrfa(db, {
          escalaId,
          funcionarioId: item.funcionarioId,
          quinzenaId: item.quinzenaId,
        });
      } catch (error) {
        logger.error('[alocacoes-lote] removerFolgaAutomaticaOrfa error', toError(error), {
          escalaId,
          funcionarioId: item.funcionarioId,
          quinzenaId: item.quinzenaId,
        });
      }
    }

    for (const funcionarioId of funcionariosParaRegenerar) {
      try {
        eventosGerados += await regenerarEventosAutomaticosFuncionarioEscala({
          db,
          empresa_id: empresaId,
          escala_id: escalaId,
          funcionario_id: funcionarioId,
          created_by: userId,
        });
      } catch (error) {
        logger.error('[alocacoes-lote] gerarEventos error', toError(error), {
          escalaId,
          funcionarioId,
        });
      }
    }

    for (const contexto of contextos) {
      try {
        const cmaAlerta = await verificarCMAAutomatico(db, {
          escala_id: escalaId,
          tripulacao_id: contexto.alocacaoId,
          funcionario_id: contexto.funcionarioId,
          data_inicio: contexto.dataInicio,
          data_fim: contexto.dataFim,
          created_by: userId,
        });

        if (cmaAlerta?.alerta) {
          contexto.alertas.push({
            tipo: 'CMA_VENCENDO',
            detalhe: `${contexto.funcionarioNome}: ${cmaAlerta.motivo || 'CMA próxima do vencimento'}`,
          });
        }
      } catch (error) {
        logger.error('[alocacoes-lote] verificarCMA error', toError(error), {
          escalaId,
          alocacaoId: contexto.alocacaoId,
        });
      }

      try {
        await auditarAlocacao(db, {
          escala_id: escalaId,
          acao: contexto.operacao === 'create' ? 'CRIAR_ALOCACAO' : 'EDITAR_ALOCACAO',
          alocacao_id: contexto.alocacaoId,
          realizado_por: userId,
          valor_anterior: contexto.atual ? JSON.stringify(contexto.atual) : undefined,
          valor_novo: JSON.stringify({
            funcionario_id: contexto.funcionarioId,
            funcao: contexto.funcao,
            aeronave_id: contexto.aeronaveId,
            data_inicio: contexto.dataInicio,
            data_fim: contexto.dataFim,
          }),
        });
      } catch (error) {
        logger.error('[alocacoes-lote] auditoria error', toError(error), {
          escalaId,
          alocacaoId: contexto.alocacaoId,
        });
      }

      try {
        await publishDomainEvent(
          db,
          'escalas',
          contexto.operacao === 'create' ? 'TRIPULANTE_ALOCADO' : 'TRIPULANTE_ALTERADO',
          {
            empresa_id: empresaId,
            origem_modulo: 'escalas',
            origem_usuario_id: userId,
            funcionario_id: contexto.funcionarioId,
            escala_id: escalaId,
            alocacao_id: contexto.alocacaoId,
            papel: contexto.funcao,
            data_inicio: contexto.dataInicio,
            data_fim: contexto.dataFim,
            base_destino: contexto.base || null,
          },
        );
      } catch (error) {
        logger.error('[alocacoes-lote] domain_event error', toError(error), {
          escalaId,
          alocacaoId: contexto.alocacaoId,
        });
      }
    }

    for (const aeronaveId of aeronavesParaRecalcular) {
      try {
        await recalcularCoberturaAeronave(
          db,
          escalaId,
          aeronaveId,
          Number(escala.mes),
          Number(escala.ano),
        );
      } catch (error) {
        logger.error('[alocacoes-lote] cobertura error', toError(error), {
          escalaId,
          aeronaveId,
        });
      }
    }

    const alocacoesSalvas = (
      await Promise.all(
        contextos.map(async (contexto) => {
          const [row] = await buscarAlocacoesDetalhadas(db, {
            escalaId,
            alocacaoId: contexto.alocacaoId,
          });
          return row ? mapAlocacaoDetalhada(row) : null;
        }),
      )
    ).filter((item): item is ReturnType<typeof mapAlocacaoDetalhada> => Boolean(item));

    return c.json(
      {
        success: true,
        data: {
          alocacoes: alocacoesSalvas,
          eventos_gerados: eventosGerados,
          alertas: contextos.flatMap((contexto) => contexto.alertas),
          total: alocacoesSalvas.length,
        },
      },
      200,
    );
  } catch (error) {
    logger.error('[alocacoes-lote] POST error', toError(error), {
      escalaId,
      route: c.req.path,
    });
    return c.json(
      escalasClientError(
        'Erro ao salvar lote de alocações operacionais',
        'ESCALAS_ALOCACAO_LOTE_SAVE_ERROR',
        500,
      ),
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/alocacoes — criar alocação individual
// ─────────────────────────────────────────────────────────────────────────────

alocacoes.post('/:id/alocacoes', auth(), requireRole('admin', 'manager'), async (c) => {
  const escalaId = c.req.param('id');
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c as unknown as { get: (k: string) => unknown });
  const logger = createLogger(c, 'EscalasAlocacoesRoutes');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(escalasClientError('Body inválido', 'ESCALAS_ALOCACAO_BODY_INVALID', 400), 400);
  }

  const parsed = AlocacaoCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      escalasClientError(
        parsed.error.issues.map((i) => i.message).join(', '),
        'ESCALAS_ALOCACAO_VALIDATION_ERROR',
        400,
      ),
      400,
    );
  }

  const d = parsed.data;

  try {
    // 1. Escala existe, pertence ao tenant e não está publicada
    const escalaResult = await getEscalaVerificadaParaMutacao(db, escalaId, empresaId);
    if ('error' in escalaResult) {
      return c.json(
        escalasClientError(escalaResult.error, 'ESCALAS_ESCALA_NOT_FOUND', escalaResult.status),
        escalaResult.status as 400 | 404 | 409,
      );
    }
    const escala = escalaResult.escala;
    const quinzenaEfetiva =
      d.quinzena_id ??
      (await resolverQuinzenaPadraoPorPeriodo(db, {
        empresaId,
        ano: Number(escala.ano),
        mes: Number(escala.mes),
        dataInicio: d.data_inicio,
        dataFim: d.data_fim,
      }));

    // 2. Aeronave existe e pertence à empresa
    const aeronave = d.aeronave_id
      ? await db
          .prepare(
            `SELECT id, prefixo, modelo FROM aeronaves
              WHERE id = ?
                AND deleted_at IS NULL
                AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
              LIMIT 1`,
          )
          .bind(d.aeronave_id)
          .first<{
            id: number;
            prefixo: string;
            modelo: string | null;
          }>()
      : null;

    if (d.aeronave_id && !aeronave) {
      return c.json(
        escalasClientError('Aeronave não encontrada', 'ESCALAS_AERONAVE_NOT_FOUND', 404),
        404,
      );
    }

    // 3. Funcionário existe e pertence à empresa
    const funcionario = await db
      .prepare(
        `SELECT id, nome FROM funcionarios
          WHERE id = ?
            AND deleted_at IS NULL
            AND COALESCE(ativo, 1) = 1
            AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
            AND (empresa_id IS NULL OR empresa_id = ?)
          LIMIT 1`,
      )
      .bind(d.funcionario_id, empresaId)
      .first<{ id: string; nome: string }>();

    if (!funcionario) {
      return c.json(
        escalasClientError('Funcionário não encontrado', 'ESCALAS_FUNCIONARIO_NOT_FOUND', 404),
        404,
      );
    }

    // 4. Modelo de aeronave habilitado
    if (d.aeronave_id) {
      const habilitacao = await verificarHabilitacaoModelo(
        db,
        d.funcionario_id,
        d.aeronave_id,
        empresaId,
      );
      if (!habilitacao.habilitado) {
        return c.json(
          {
            success: false,
            error: habilitacao.motivo || 'Modelo não habilitado',
            code: 'MODELO_NAO_HABILITADO',
          },
          400,
        );
      }
    }

    const alertas: Array<{ tipo: string; detalhe: string }> = [];
    // 5. Sobreposição de período do funcionário (outras aeronaves)
    const sobreposicaoFunc = await checarSobreposicaoFuncionario(
      db,
      d.funcionario_id,
      d.data_inicio,
      d.data_fim,
      undefined,
      d.aeronave_id ?? null,
    );
    if (sobreposicaoFunc) {
      if (d.conflito_override === 1) {
        const removida = await substituirAlocacaoSobreposta(db, {
          conflitoId: sobreposicaoFunc.id,
          empresaId,
          userId: userId || 'system',
          logger,
        });

        if (!removida) {
          return c.json(
            {
              success: false,
              code: 'SOBREPOSICAO_FUNCIONARIO',
              error: `${funcionario.nome} já está alocado em ${formatarDescricaoSobreposicao(sobreposicaoFunc)}`,
              conflito: sobreposicaoFunc,
              requer_confirmacao: true,
            },
            409,
          );
        }

        alertas.push({
          tipo: 'CONFLITO_OVERRIDE',
          detalhe: `Alocação anterior em ${formatarDescricaoSobreposicao(sobreposicaoFunc)} foi substituída por confirmação do operador.`,
        });
      } else {
        return c.json(
          {
            success: false,
            code: 'SOBREPOSICAO_FUNCIONARIO',
            error: `${funcionario.nome} já está alocado em ${formatarDescricaoSobreposicao(sobreposicaoFunc)}`,
            conflito: sobreposicaoFunc,
            requer_confirmacao: true,
          },
          409,
        );
      }
    }

    // 6. Sobreposição de slot (aeronave + funcao)
    if (d.aeronave_id) {
      const sobreposicaoSlot = await checarSobreposicaoSlot(
        db,
        escalaId,
        d.aeronave_id,
        d.funcao,
        d.data_inicio,
        d.data_fim,
        undefined,
      );
      if (sobreposicaoSlot) {
        return c.json(
          {
            success: false,
            code: 'SLOT_OCUPADO',
            error: `Slot ${d.funcao} em ${aeronave!.prefixo} já está ocupado por ${sobreposicaoSlot.funcionario_nome} de ${sobreposicaoSlot.data_inicio} a ${sobreposicaoSlot.data_fim}`,
            conflito: sobreposicaoSlot,
          },
          409,
        );
      }
    }

    // 7. Restrição de par: se existe outra alocação na mesma aeronave no mesmo período
    //    com função oposta (PIC↔SIC), verificar se são incompatíveis
    if (d.aeronave_id && (d.funcao === 'PIC' || d.funcao === 'SIC')) {
      const funcaoOposta = d.funcao === 'PIC' ? 'SIC' : 'PIC';
      const parceiro = await db
        .prepare(
          `SELECT ea.funcionario_id FROM escala_alocacoes ea
            WHERE ea.escala_id = ? AND ea.aeronave_id = ? AND ea.funcao = ?
              AND ea.deleted_at IS NULL AND ea.status != 'cancelado'
              AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)
            LIMIT 1`,
        )
        .bind(escalaId, d.aeronave_id, funcaoOposta, d.data_inicio, d.data_fim)
        .first<{ funcionario_id: string }>();

      if (parceiro) {
        const restricao = await db
          .prepare(
            `SELECT id FROM restricoes_tripulacao
              WHERE ((funcionario_a_id = ? AND funcionario_b_id = ?)
                  OR (funcionario_a_id = ? AND funcionario_b_id = ?))
                AND tipo_restricao = 'nao_pode_voar_junto'
                AND ativo = 1 AND deleted_at IS NULL
                AND (data_fim IS NULL OR data_fim >= ?)
              LIMIT 1`,
          )
          .bind(
            d.funcionario_id,
            parceiro.funcionario_id,
            parceiro.funcionario_id,
            d.funcionario_id,
            d.data_inicio,
          )
          .first();

        if (restricao) {
          return c.json(
            {
              success: false,
              code: 'RESTRICAO_PAR',
              error: 'Restrição de tripulação: estes pilotos não podem voar juntos',
            },
            409,
          );
        }
      }
    }

    // 8. CMA check — hard block unless operator explicitly overrides
    try {
      const cmaRow = await db
        .prepare(
          `SELECT validade_fim FROM certificacoes
           WHERE funcionario_id = ? AND tipo = 'CMA' AND deleted_at IS NULL
           ORDER BY validade_fim DESC LIMIT 1`,
        )
        .bind(d.funcionario_id)
        .first<{ validade_fim: string | null }>();

      if (cmaRow?.validade_fim && cmaRow.validade_fim < d.data_inicio) {
        if (d.cma_override !== 1) {
          return c.json(
            {
              success: false,
              code: 'CMA_EXPIRADO',
              error: `CMA expirado em ${cmaRow.validade_fim}. Não é possível alocar tripulante com CMA vencido.`,
            },
            409,
          );
        }
        // cma_override === 1: log as alerta and proceed
        alertas.push({
          tipo: 'CMA_OVERRIDE',
          detalhe: `CMA expirado em ${cmaRow.validade_fim}. Alocação confirmada por override do operador.`,
        });
      }
    } catch (e) {
      logger.error('[alocacoes] CMA hard-block check error', toError(e));
    }

    // 9. FRMS hard-block — tripulante com status crítico não pode ser alocado.
    try {
      const frmsState = await getFrmsOperationalState(db, d.funcionario_id);
      if (frmsState.frms_status === 'critico') {
        return c.json(
          {
            success: false,
            code: 'FRMS_CRITICO',
            error: `Tripulante com alertas FRMS críticos/violação não resolvidos (score: ${frmsState.frms_score}). Resolva os alertas antes de alocar.`,
          },
          409,
        );
      }
      if (frmsState.frms_status === 'atencao') {
        alertas.push({
          tipo: 'FRMS_ATENCAO',
          detalhe: `Score FRMS em atenção (${frmsState.frms_score}). Considere a carga de trabalho.`,
        });
      }
    } catch (e) {
      logger.error('[alocacoes] FRMS warning check error', toError(e));
    }

    // ── Inserir alocação ────────────────────────────────────────────────────
    const alocacaoId = crypto.randomUUID();
    const now = new Date().toISOString();
    // Resolve modelo_aeronave: da aeronave ou do body (modelo_aeronave)
    const modeloAeronave =
      aeronave?.modelo || ((d as Record<string, unknown>).modelo_aeronave as string | null) || null;

    await db
      .prepare(
        `INSERT INTO escala_alocacoes
         (id, escala_id, funcionario_id, aeronave_id, funcao, quinzena_id,
          data_inicio, data_fim, padrao_escala_id, base, observacoes, status,
          cma_override, cma_override_by, modelo_aeronave, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planejado', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        alocacaoId,
        escalaId,
        d.funcionario_id,
        d.aeronave_id || null,
        d.funcao,
        quinzenaEfetiva,
        d.data_inicio,
        d.data_fim,
        d.padrao_escala_id || null,
        d.base || null,
        d.observacoes || null,
        d.cma_override ?? 0,
        d.cma_override === 1 ? userId || 'system' : null,
        modeloAeronave,
        userId || 'system',
        now,
        now,
      )
      .run();

    // ── Folga automática na quinzena oposta ────────────────────────────────
    try {
      await cancelarFolgasSobrepostas(db, {
        escalaId,
        funcionarioId: d.funcionario_id,
        dataInicio: d.data_inicio,
        dataFim: d.data_fim,
      });
    } catch (e) {
      logger.error('[alocacoes] limpar_folga_conflitante error', toError(e));
    }

    if (quinzenaEfetiva) {
      try {
        // Remove folga automática se existir nesta quinzena (sendo substituída pela real)
        await removerFolgaAutomaticaSeExiste(db, {
          escalaId,
          funcionarioId: d.funcionario_id,
          quinzenaId: quinzenaEfetiva,
        });
      } catch (e) {
        logger.error('[alocacoes] remover_folga_automatica error', toError(e));
      }
    }

    // ── Verificação CMA (alerta automático) ────────────────────────────────
    let cmaAlerta: { alerta?: boolean; data_exame?: string; motivo?: string } | null = null;
    try {
      cmaAlerta = await verificarCMAAutomatico(db, {
        escala_id: escalaId,
        tripulacao_id: alocacaoId,
        funcionario_id: d.funcionario_id,
        data_inicio: d.data_inicio,
        data_fim: d.data_fim,
        created_by: userId || 'system',
      });
      if (cmaAlerta?.alerta) {
        alertas.push({
          tipo: 'CMA_VENCENDO',
          detalhe: cmaAlerta.motivo || 'CMA próxima do vencimento',
        });
      }
    } catch (e) {
      logger.error('[alocacoes] verificarCMA error', toError(e));
    }

    // ── Gerar eventos VOO/FOL automáticos ──────────────────────────────────
    let eventosGerados = 0;
    try {
      eventosGerados = await regenerarEventosAutomaticosFuncionarioEscala({
        db,
        empresa_id: empresaId,
        escala_id: escalaId,
        funcionario_id: d.funcionario_id,
        created_by: userId || 'system',
      });
    } catch (e) {
      logger.error('[alocacoes] gerarEventos error', toError(e));
    }

    // ── Auditoria ──────────────────────────────────────────────────────────
    try {
      await auditarAlocacao(db, {
        escala_id: escalaId,
        acao: 'CRIAR_ALOCACAO',
        alocacao_id: alocacaoId,
        realizado_por: userId || 'system',
        valor_novo: JSON.stringify({
          funcionario_id: d.funcionario_id,
          funcao: d.funcao,
          aeronave_id: d.aeronave_id || null,
          data_inicio: d.data_inicio,
          data_fim: d.data_fim,
        }),
      });
    } catch (e) {
      logger.error('[alocacoes] auditoria error', toError(e));
    }

    // ── Domain event ───────────────────────────────────────────────────────
    try {
      await publishDomainEvent(db, 'escalas', 'TRIPULANTE_ALOCADO', {
        empresa_id: empresaId,
        origem_modulo: 'escalas',
        origem_usuario_id: userId,
        funcionario_id: d.funcionario_id,
        escala_id: escalaId,
        alocacao_id: alocacaoId,
        papel: d.funcao,
        data_inicio: d.data_inicio,
        data_fim: d.data_fim,
        base_destino: d.base || null,
      });
    } catch (e) {
      logger.error('[alocacoes] domain_event error', toError(e));
    }

    // ── Recalcular cobertura (best-effort) ─────────────────────────────────
    try {
      if (d.aeronave_id) {
        await recalcularCoberturaAeronave(
          db,
          escalaId,
          d.aeronave_id,
          Number(escala.mes),
          Number(escala.ano),
        );
      }
    } catch (e) {
      logger.error('[alocacoes] cobertura error', toError(e));
    }

    const [alocacaoCriada] = await buscarAlocacoesDetalhadas(db, {
      escalaId,
      alocacaoId,
    });

    return c.json(
      {
        success: true,
        data: {
          alocacao: alocacaoCriada ? mapAlocacaoDetalhada(alocacaoCriada) : null,
          eventos_gerados: eventosGerados,
          folga_auto_id: null,
          alertas,
        },
      },
      201,
    );
  } catch (e) {
    logger.error('[alocacoes] POST error', toError(e), { escalaId, route: c.req.path });
    return c.json(
      escalasClientError(
        'Erro ao criar alocação operacional',
        'ESCALAS_ALOCACAO_CREATE_ERROR',
        500,
      ),
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id/alocacoes — listar alocações
// ─────────────────────────────────────────────────────────────────────────────

alocacoes.get('/:id/alocacoes', auth(), async (c) => {
  const escalaId = c.req.param('id');
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  const escala = await getEscalaVerificada(db, escalaId, empresaId);
  if (!escala) {
    return c.json(escalasClientError('Escala não encontrada', 'ESCALAS_NOT_FOUND', 404), 404);
  }

  const aeronaveId = c.req.query('aeronave_id');
  const funcaoFilter = c.req.query('funcao');
  const dataFilter = c.req.query('data');

  const rows = await buscarAlocacoesDetalhadas(db, {
    escalaId,
    aeronaveId: aeronaveId ? Number(aeronaveId) : undefined,
    funcao: funcaoFilter,
    data: dataFilter,
  });

  return c.json({
    success: true,
    data: {
      alocacoes: rows.map(mapAlocacaoDetalhada),
      total: rows.length,
      contract_version: 'v1',
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id/alocacoes/:aid — editar alocação
// ─────────────────────────────────────────────────────────────────────────────

alocacoes.put('/:id/alocacoes/:aid', auth(), requireRole('admin', 'manager'), async (c) => {
  const escalaId = c.req.param('id');
  const alocacaoId = c.req.param('aid');
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c as unknown as { get: (k: string) => unknown });
  const logger = createLogger(c, 'EscalasAlocacoesRoutes');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(escalasClientError('Body inválido', 'ESCALAS_INVALID_BODY', 400), 400);
  }

  const parsed = AlocacaoUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') },
      400,
    );
  }

  try {
    const escala = await getEscalaVerificada(db, escalaId, empresaId);
    if (!escala) {
      return c.json(escalasClientError('Escala não encontrada', 'ESCALAS_NOT_FOUND', 404), 404);
    }
    const alocacaoAtual = await db
      .prepare(
        `SELECT * FROM escala_alocacoes WHERE id = ? AND escala_id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(alocacaoId, escalaId)
      .first<{
        id: string;
        funcionario_id: string;
        aeronave_id: number | null;
        funcao: FuncaoAlocacao;
        quinzena_id: number | null;
        data_inicio: string;
        data_fim: string;
        status: string;
      }>();

    if (!alocacaoAtual) {
      return c.json(
        escalasClientError('Alocação não encontrada', 'ESCALAS_ALOCACAO_NOT_FOUND', 404),
        404,
      );
    }

    if (alocacaoAtual.status === 'cancelado') {
      return c.json(
        escalasClientError(
          'Não é possível editar uma alocação cancelada',
          'ESCALAS_ALOCACAO_CANCELADA',
          409,
        ),
        409,
      );
    }

    const d = parsed.data;
    const novoFuncionarioId = d.funcionario_id ?? alocacaoAtual.funcionario_id;
    const novaFuncao = d.funcao ?? alocacaoAtual.funcao;
    const novaInicio = d.data_inicio ?? alocacaoAtual.data_inicio;
    const novaFim = d.data_fim ?? alocacaoAtual.data_fim;
    let novaQuinzenaId = d.quinzena_id ?? alocacaoAtual.quinzena_id;

    if ((d.data_inicio !== undefined || d.data_fim !== undefined) && d.quinzena_id === undefined) {
      novaQuinzenaId = await resolverQuinzenaPadraoPorPeriodo(db, {
        empresaId,
        ano: Number(escala.mes ? escala.ano : 0),
        mes: Number(escala.mes),
        dataInicio: novaInicio,
        dataFim: novaFim,
      });
    }

    if (d.funcionario_id) {
      const funcionario = await db
        .prepare(
          `SELECT id FROM funcionarios
            WHERE id = ?
              AND deleted_at IS NULL
              AND COALESCE(ativo, 1) = 1
              AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
              AND (empresa_id IS NULL OR empresa_id = ?)
            LIMIT 1`,
        )
        .bind(d.funcionario_id, empresaId)
        .first<{ id: string }>();

      if (!funcionario) {
        return c.json(
          escalasClientError('Funcionário não encontrado', 'ESCALAS_FUNCIONARIO_NOT_FOUND', 404),
          404,
        );
      }

      if (alocacaoAtual.aeronave_id) {
        const habilitacao = await verificarHabilitacaoModelo(
          db,
          d.funcionario_id,
          alocacaoAtual.aeronave_id,
          empresaId,
        );
        if (!habilitacao.habilitado) {
          return c.json(
            {
              success: false,
              error: habilitacao.motivo || 'Modelo não habilitado',
              code: 'MODELO_NAO_HABILITADO',
            },
            400,
          );
        }
      }
    }

    // Re-validar sobreposição se datas ou função mudaram
    if (d.data_inicio || d.data_fim || d.funcao || d.funcionario_id) {
      const sobreposicaoFunc = await checarSobreposicaoFuncionario(
        db,
        novoFuncionarioId,
        novaInicio,
        novaFim,
        alocacaoId,
        alocacaoAtual.aeronave_id ?? null,
      );
      if (sobreposicaoFunc) {
        if (d.conflito_override === 1) {
          const removida = await substituirAlocacaoSobreposta(db, {
            conflitoId: sobreposicaoFunc.id,
            empresaId,
            userId: userId || 'system',
            logger,
          });

          if (!removida) {
            return c.json(
              {
                success: false,
                code: 'SOBREPOSICAO_FUNCIONARIO',
                error: `Funcionário já está alocado em ${formatarDescricaoSobreposicao(sobreposicaoFunc)}`,
                conflito: sobreposicaoFunc,
                requer_confirmacao: true,
              },
              409,
            );
          }
        } else {
          return c.json(
            {
              success: false,
              code: 'SOBREPOSICAO_FUNCIONARIO',
              error: `Funcionário já está alocado em ${formatarDescricaoSobreposicao(sobreposicaoFunc)}`,
              conflito: sobreposicaoFunc,
              requer_confirmacao: true,
            },
            409,
          );
        }
      }

      if (alocacaoAtual.aeronave_id) {
        const sobreposicaoSlot = await checarSobreposicaoSlot(
          db,
          escalaId,
          alocacaoAtual.aeronave_id,
          novaFuncao,
          novaInicio,
          novaFim,
          alocacaoId,
        );
        if (sobreposicaoSlot) {
          return c.json(
            {
              success: false,
              code: 'SLOT_OCUPADO',
              error: `Slot ${novaFuncao} já está ocupado por ${sobreposicaoSlot.funcionario_nome} de ${sobreposicaoSlot.data_inicio} a ${sobreposicaoSlot.data_fim}`,
            },
            409,
          );
        }

        if (novaFuncao === 'PIC' || novaFuncao === 'SIC') {
          const funcaoOposta = novaFuncao === 'PIC' ? 'SIC' : 'PIC';
          const parceiro = await db
            .prepare(
              `SELECT ea.funcionario_id FROM escala_alocacoes ea
                WHERE ea.escala_id = ? AND ea.aeronave_id = ? AND ea.funcao = ?
                  AND ea.deleted_at IS NULL AND ea.status != 'cancelado'
                  AND ea.id != ?
                  AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)
                LIMIT 1`,
            )
            .bind(
              escalaId,
              alocacaoAtual.aeronave_id,
              funcaoOposta,
              alocacaoId,
              novaInicio,
              novaFim,
            )
            .first<{ funcionario_id: string }>();

          if (parceiro) {
            const restricao = await db
              .prepare(
                `SELECT id FROM restricoes_tripulacao
                  WHERE ((funcionario_a_id = ? AND funcionario_b_id = ?)
                      OR (funcionario_a_id = ? AND funcionario_b_id = ?))
                    AND tipo_restricao = 'nao_pode_voar_junto'
                    AND ativo = 1 AND deleted_at IS NULL
                    AND (data_fim IS NULL OR data_fim >= ?)
                  LIMIT 1`,
              )
              .bind(
                novoFuncionarioId,
                parceiro.funcionario_id,
                parceiro.funcionario_id,
                novoFuncionarioId,
                novaInicio,
              )
              .first();

            if (restricao) {
              return c.json(
                {
                  success: false,
                  code: 'RESTRICAO_PAR',
                  error: 'Restrição de tripulação: estes pilotos não podem voar juntos',
                },
                409,
              );
            }
          }
        }
      }
    }

    const camposUpdate: string[] = ["updated_at = datetime('now')"];
    const valoresUpdate: unknown[] = [];

    if (d.funcionario_id !== undefined) {
      camposUpdate.push('funcionario_id = ?');
      valoresUpdate.push(d.funcionario_id);
    }
    if (d.funcao !== undefined) {
      camposUpdate.push('funcao = ?');
      valoresUpdate.push(d.funcao);
    }
    if (d.data_inicio !== undefined) {
      camposUpdate.push('data_inicio = ?');
      valoresUpdate.push(d.data_inicio);
    }
    if (d.data_fim !== undefined) {
      camposUpdate.push('data_fim = ?');
      valoresUpdate.push(d.data_fim);
    }
    if (d.status !== undefined) {
      camposUpdate.push('status = ?');
      valoresUpdate.push(d.status);
    }
    if (d.base !== undefined) {
      camposUpdate.push('base = ?');
      valoresUpdate.push(d.base);
    }
    if (d.observacoes !== undefined) {
      camposUpdate.push('observacoes = ?');
      valoresUpdate.push(d.observacoes);
    }
    if (d.quinzena_id !== undefined || d.data_inicio !== undefined || d.data_fim !== undefined) {
      camposUpdate.push('quinzena_id = ?');
      valoresUpdate.push(novaQuinzenaId);
    }
    if (d.padrao_escala_id !== undefined) {
      camposUpdate.push('padrao_escala_id = ?');
      valoresUpdate.push(d.padrao_escala_id);
    }

    if (camposUpdate.length === 1) {
      return c.json(
        escalasClientError('Nenhum campo para atualizar', 'ESCALAS_EMPTY_UPDATE', 400),
        400,
      );
    }

    await db
      .prepare(`UPDATE escala_alocacoes SET ${camposUpdate.join(', ')} WHERE id = ?`)
      .bind(...valoresUpdate, alocacaoId)
      .run();

    if (alocacaoAtual.quinzena_id && alocacaoAtual.quinzena_id !== novaQuinzenaId) {
      await removerFolgaAutomaticaOrfa(db, {
        escalaId,
        funcionarioId: alocacaoAtual.funcionario_id,
        quinzenaId: alocacaoAtual.quinzena_id,
      });
    }

    try {
      await cancelarFolgasSobrepostas(db, {
        escalaId,
        funcionarioId: novoFuncionarioId,
        dataInicio: novaInicio,
        dataFim: novaFim,
        ignorarAlocacaoId: alocacaoId,
      });
    } catch (e) {
      logger.error('[alocacoes] PUT limpar_folga_conflitante error', toError(e), {
        escalaId,
        alocacaoId,
      });
    }

    if (novaQuinzenaId) {
      await removerFolgaAutomaticaSeExiste(db, {
        escalaId,
        funcionarioId: novoFuncionarioId,
        quinzenaId: novaQuinzenaId,
      });
    }

    try {
      await auditarAlocacao(db, {
        escala_id: escalaId,
        acao: 'EDITAR_ALOCACAO',
        alocacao_id: alocacaoId,
        realizado_por: userId || 'system',
        valor_anterior: JSON.stringify({
          funcao: alocacaoAtual.funcao,
          data_inicio: alocacaoAtual.data_inicio,
          data_fim: alocacaoAtual.data_fim,
        }),
        valor_novo: JSON.stringify(d),
      });
    } catch (e) {
      logger.error('[alocacoes] PUT auditoria error', toError(e), { escalaId, alocacaoId });
    }

    try {
      const funcionariosParaRegenerar = [
        ...new Set([alocacaoAtual.funcionario_id, novoFuncionarioId]),
      ];
      for (const funcionarioId of funcionariosParaRegenerar) {
        await regenerarEventosAutomaticosFuncionarioEscala({
          db,
          empresa_id: empresaId,
          escala_id: escalaId,
          funcionario_id: funcionarioId,
          created_by: userId || 'system',
        });
      }
    } catch (e) {
      logger.error('[alocacoes] PUT gerarEventos error', toError(e), { escalaId, alocacaoId });
    }

    // Recalcular cobertura
    try {
      if (alocacaoAtual.aeronave_id) {
        await recalcularCoberturaAeronave(
          db,
          escalaId,
          alocacaoAtual.aeronave_id,
          Number(escala.mes),
          Number(escala.ano),
        );
      }
    } catch (e) {
      logger.error('[alocacoes] PUT cobertura error', toError(e), { escalaId, alocacaoId });
    }

    const [alocacaoAtualizada] = await buscarAlocacoesDetalhadas(db, {
      escalaId,
      alocacaoId,
    });

    return c.json({
      success: true,
      data: alocacaoAtualizada ? mapAlocacaoDetalhada(alocacaoAtualizada) : null,
    });
  } catch (e) {
    logger.error('[alocacoes] PUT error', toError(e), { escalaId, alocacaoId, route: c.req.path });
    return c.json(
      escalasClientError(
        'Erro ao atualizar alocação operacional',
        'ESCALAS_ALOCACAO_UPDATE_ERROR',
        500,
      ),
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id/alocacoes/:aid — soft-delete + remover eventos auto-gerados
// ─────────────────────────────────────────────────────────────────────────────

alocacoes.delete('/:id/alocacoes/:aid', auth(), requireRole('admin', 'manager'), async (c) => {
  const escalaId = c.req.param('id');
  const alocacaoId = c.req.param('aid');
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = getUserId(c as unknown as { get: (k: string) => unknown });
  const logger = createLogger(c, 'EscalasAlocacoesRoutes');

  try {
    const escala = await getEscalaVerificada(db, escalaId, empresaId);
    if (!escala) {
      return c.json(escalasClientError('Escala não encontrada', 'ESCALAS_NOT_FOUND', 404), 404);
    }
    const alocacao = await db
      .prepare(
        `SELECT id, aeronave_id, funcionario_id, funcao, quinzena_id, auto_gerado FROM escala_alocacoes
          WHERE id = ? AND escala_id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(alocacaoId, escalaId)
      .first<{
        id: string;
        aeronave_id: number | null;
        funcionario_id: string;
        funcao: string;
        quinzena_id: number | null;
        auto_gerado: number | null;
      }>();

    if (!alocacao) {
      return c.json(
        escalasClientError('Alocação não encontrada', 'ESCALAS_ALOCACAO_NOT_FOUND', 404),
        404,
      );
    }

    // Soft-delete da alocação
    await db
      .prepare(
        `UPDATE escala_alocacoes SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(alocacaoId)
      .run();

    // ── Limpar folga automática órfã ────────────────────────────────────────
    if (alocacao.quinzena_id) {
      try {
        await removerFolgaAutomaticaOrfa(db, {
          escalaId,
          funcionarioId: alocacao.funcionario_id,
          quinzenaId: alocacao.quinzena_id,
        });
      } catch (e) {
        logger.error('[alocacoes] DELETE folga_orf error', toError(e), { escalaId, alocacaoId });
      }
    }

    // Soft-delete dos eventos auto-gerados vinculados a esta alocação
    const eventosRemovidos = await db
      .prepare(
        `UPDATE escala_eventos
            SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE alocacao_id = ?
            AND gerado_automaticamente = 1
            AND deleted_at IS NULL`,
      )
      .bind(alocacaoId)
      .run();

    try {
      await regenerarEventosAutomaticosFuncionarioEscala({
        db,
        empresa_id: empresaId,
        escala_id: escalaId,
        funcionario_id: alocacao.funcionario_id,
        created_by: userId || 'system',
      });
    } catch (e) {
      logger.error('[alocacoes] DELETE gerarEventos error', toError(e), { escalaId, alocacaoId });
    }

    try {
      await auditarAlocacao(db, {
        escala_id: escalaId,
        acao: 'REMOVER_ALOCACAO',
        alocacao_id: alocacaoId,
        realizado_por: userId || 'system',
        valor_anterior: JSON.stringify({
          funcionario_id: alocacao.funcionario_id,
          funcao: alocacao.funcao,
        }),
      });
    } catch (e) {
      logger.error('[alocacoes] DELETE auditoria error', toError(e), { escalaId, alocacaoId });
    }

    try {
      await publishDomainEvent(db, 'escalas', 'TRIPULANTE_REMOVIDO', {
        empresa_id: empresaId,
        origem_modulo: 'escalas',
        origem_usuario_id: userId,
        funcionario_id: alocacao.funcionario_id,
        escala_id: escalaId,
        alocacao_id: alocacaoId,
        papel: alocacao.funcao,
      });
    } catch (e) {
      logger.error('[alocacoes] DELETE domain_event error', toError(e), { escalaId, alocacaoId });
    }

    try {
      if (alocacao.aeronave_id) {
        await recalcularCoberturaAeronave(
          db,
          escalaId,
          alocacao.aeronave_id,
          Number(escala.mes),
          Number(escala.ano),
        );
      }
    } catch (e) {
      logger.error('[alocacoes] DELETE cobertura error', toError(e), { escalaId, alocacaoId });
    }

    return c.json({
      success: true,
      data: { eventos_removidos: eventosRemovidos.meta?.changes ?? 0 },
    });
  } catch (e) {
    logger.error('[alocacoes] DELETE error', toError(e), {
      escalaId,
      alocacaoId,
      route: c.req.path,
    });
    return c.json(
      escalasClientError(
        'Erro ao remover alocação operacional',
        'ESCALAS_ALOCACAO_DELETE_ERROR',
        500,
      ),
      500,
    );
  }
});
export default alocacoes;
