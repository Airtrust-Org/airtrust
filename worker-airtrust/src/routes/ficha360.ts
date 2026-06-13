// ============================================================
// AIRTRUST - FASE 4: FICHA 360° DO FUNCIONÁRIO
// ============================================================
// Endpoint que retorna visão única com TODAS as informações:
//  - Dados do funcionário (pessoas)
//  - Qualificações (com tipos_qualificacao)
//  - Licenças
//  - Requisitos de compliance para a função
// ============================================================

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { createLogger, toError } from '../utils/logger';
import {
  assertFuncionarioInScope,
  getEmployeeSectorAccess,
} from '../services/employee-sector-access';

const app = new Hono<{ Bindings: Env }>();

// Auth específico por rota (rotas montadas em /api não podem ter use('*') global)
app.use('/funcionarios/:id/ficha-360', auth());

const tableColumnsCache = new Map<string, Set<string>>();

export async function getTableColumns(db: D1Database, tableName: string): Promise<Set<string>> {
  const cached = tableColumnsCache.get(tableName);
  if (cached) return cached;
  const pragma = await db.prepare(`PRAGMA table_info('${tableName}')`).all<{ name: string }>();
  const cols = new Set((pragma.results || []).map((r) => r.name));
  tableColumnsCache.set(tableName, cols);
  return cols;
}

function normalizeFuncionarioRecord(funcionario: Record<string, unknown>) {
  const nomeCompleto =
    String(funcionario.nome_completo || funcionario.nome || funcionario.guerra || '').trim() ||
    `Funcionario ${String(funcionario.id || '').trim() || 'sem nome'}`;

  return {
    ...funcionario,
    nome: String(funcionario.nome || nomeCompleto),
    nome_completo: nomeCompleto,
  };
}

async function getFuncionarioAuditoria(db: D1Database, funcionarioId: number) {
  const eventos: Array<Record<string, unknown>> = [];
  const funcionarioIdTexto = String(funcionarioId);

  try {
    const auditV2Cols = await getTableColumns(db, 'auditoria_avancada_v2');
    if (auditV2Cols.size > 0) {
      const condicoes = [
        `(tabela = 'funcionarios' AND registro_id = ?)`,
        `(tabela = 'compliance_eventos' AND registro_id = ?)`,
      ];
      const binds: unknown[] = [funcionarioIdTexto, funcionarioIdTexto];

      const jsonFields = ['funcionario_id', 'funcionarioId', 'tripulante_id'];
      if (auditV2Cols.has('dados_novos')) {
        for (const field of jsonFields) {
          condicoes.push(`CAST(json_extract(dados_novos, '$.${field}') AS INTEGER) = ?`);
          binds.push(funcionarioId);
        }
      }
      if (auditV2Cols.has('dados_anteriores')) {
        for (const field of jsonFields) {
          condicoes.push(`CAST(json_extract(dados_anteriores, '$.${field}') AS INTEGER) = ?`);
          binds.push(funcionarioId);
        }
      }

      const auditV2 = await db
        .prepare(
          `SELECT 'auditoria_avancada_v2' AS fonte,
                  tabela,
                  acao,
                  registro_id,
                  ${auditV2Cols.has('origem') ? 'origem' : 'NULL AS origem'},
                  ${auditV2Cols.has('created_at') ? 'created_at' : 'NULL AS created_at'},
                  ${auditV2Cols.has('dados_anteriores') ? 'dados_anteriores' : 'NULL AS dados_anteriores'},
                  ${auditV2Cols.has('dados_novos') ? 'dados_novos' : 'NULL AS dados_novos'}
             FROM auditoria_avancada_v2
            WHERE ${condicoes.join(' OR ')}
            ORDER BY ${auditV2Cols.has('created_at') ? 'created_at' : 'rowid'} DESC
            LIMIT 30`,
        )
        .bind(...binds)
        .all<Record<string, unknown>>();

      eventos.push(...(auditV2.results || []));
    }
  } catch {
    // Tabela opcional em ambientes legados.
  }

  try {
    const auditCols = await getTableColumns(db, 'auditoria');
    if (auditCols.size > 0) {
      const condicoes = [`(tabela_afetada = 'funcionarios' AND registro_id = ?)`];
      const binds: unknown[] = [funcionarioIdTexto];

      const jsonFields = ['funcionario_id', 'funcionarioId'];
      if (auditCols.has('dados_depois')) {
        for (const field of jsonFields) {
          condicoes.push(`CAST(json_extract(dados_depois, '$.${field}') AS INTEGER) = ?`);
          binds.push(funcionarioId);
        }
      }
      if (auditCols.has('dados_antes')) {
        for (const field of jsonFields) {
          condicoes.push(`CAST(json_extract(dados_antes, '$.${field}') AS INTEGER) = ?`);
          binds.push(funcionarioId);
        }
      }

      const auditLegacy = await db
        .prepare(
          `SELECT 'auditoria' AS fonte,
                  tabela_afetada AS tabela,
                  acao,
                  registro_id,
                  COALESCE(usuario_nome, usuario_id, 'sistema') AS origem,
                  ${auditCols.has('created_at') ? 'created_at' : 'NULL AS created_at'},
                  ${auditCols.has('dados_antes') ? 'dados_antes AS dados_anteriores' : 'NULL AS dados_anteriores'},
                  ${auditCols.has('dados_depois') ? 'dados_depois AS dados_novos' : 'NULL AS dados_novos'}
             FROM auditoria
            WHERE ${condicoes.join(' OR ')}
            ORDER BY ${auditCols.has('created_at') ? 'created_at' : 'rowid'} DESC
            LIMIT 20`,
        )
        .bind(...binds)
        .all<Record<string, unknown>>();

      eventos.push(...(auditLegacy.results || []));
    }
  } catch {
    // Tabela opcional em ambientes novos.
  }

  return eventos
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 25);
}

// ============================================================
// Função auxiliar: buscar dados 360° completos
// ============================================================

export async function getFicha360(db: D1Database, funcionarioId: number, empresaId?: number) {
  try {
    // 1. Dados do funcionário
    const funcionario = empresaId
      ? await db
          .prepare(
            `SELECT * FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
          )
          .bind(funcionarioId, empresaId)
          .first()
      : await db
          .prepare(`SELECT * FROM funcionarios WHERE id = ? AND deleted_at IS NULL`)
          .bind(funcionarioId)
          .first();
    if (!funcionario) return null;
    const funcionarioNormalizado = normalizeFuncionarioRecord(
      funcionario as Record<string, unknown>,
    );

    // Detectar esquema divergente de qualificações
    const histCols = await getTableColumns(db, 'qualificacoes_historico');
    const colInicio = histCols.has('data_realizacao')
      ? 'data_realizacao'
      : histCols.has('data_conclusao')
        ? 'data_conclusao'
        : 'data_conclusao';
    const colFim = histCols.has('data_vencimento')
      ? 'data_vencimento'
      : histCols.has('data_validade')
        ? 'data_validade'
        : 'data_vencimento';
    const colTipo = histCols.has('tipo_qualificacao_id')
      ? 'tipo_qualificacao_id'
      : histCols.has('qualificacao_id')
        ? 'qualificacao_id'
        : 'qualificacao_id';

    // 2. Qualificações (somente vigentes, uma por código)
    const statusExpr = histCols.has('status') ? 'UPPER(COALESCE(q.status, \"\"))' : "''";
    const renovadaExpr = histCols.has('renovada') ? 'COALESCE(q.renovada, 0)' : '0';
    const qualificacoesRaw = await db
      .prepare(
        `WITH qualificacoes_ativas AS (
           SELECT
             q.id,
             q.funcionario_id,
             q.${colTipo} as tipo_id,
             q.${colInicio} as data_realizacao,
             q.${colFim} as data_vencimento,
             q.observacoes,
             q.created_at,
             q.updated_at,
             q.origem_tipo,
             q.lms_matricula_id,
             tq.categoria,
             tq.nome,
             tq.codigo,
             ROW_NUMBER() OVER (
               PARTITION BY tq.codigo
               ORDER BY datetime(COALESCE(q.${colFim}, q.${colInicio}, q.updated_at, q.created_at)) DESC,
                        q.id DESC
             ) AS rn
           FROM qualificacoes_historico q
           JOIN qualificacoes_tipos tq ON q.${colTipo} = tq.id
           WHERE q.funcionario_id = ?
             AND q.deleted_at IS NULL
             AND ${statusExpr} NOT IN ('CANCELADA', 'RENOVADA')
             AND ${renovadaExpr} = 0
         )
         SELECT id, funcionario_id, tipo_id, data_realizacao, data_vencimento, observacoes,
                created_at, updated_at, categoria, nome, codigo, origem_tipo, lms_matricula_id
           FROM qualificacoes_ativas
          WHERE rn = 1
          ORDER BY datetime(COALESCE(data_vencimento, data_realizacao, updated_at, created_at)) DESC,
                   id DESC`,
      )
      .bind(funcionarioId)
      .all();

    const qualificacoesHistoricoRaw = await db
      .prepare(
        `SELECT
           q.id,
           q.funcionario_id,
           q.${colTipo} as tipo_id,
           q.${colInicio} as data_realizacao,
           q.${colFim} as data_vencimento,
           q.observacoes,
           q.created_at,
           q.updated_at,
           q.origem_tipo,
           q.lms_matricula_id,
           ${histCols.has('status') ? 'q.status' : 'NULL AS status'},
           ${histCols.has('renovada') ? 'q.renovada' : '0 AS renovada'},
           tq.categoria,
           tq.nome,
           tq.codigo
         FROM qualificacoes_historico q
         JOIN qualificacoes_tipos tq ON q.${colTipo} = tq.id
         WHERE q.funcionario_id = ?
           AND q.deleted_at IS NULL
           AND ${statusExpr} != 'CANCELADA'
         ORDER BY datetime(COALESCE(q.${colFim}, q.${colInicio}, q.updated_at, q.created_at)) DESC,
                  q.id DESC`,
      )
      .bind(funcionarioId)
      .all();
    interface QualRaw {
      [key: string]: unknown;
    }
    const qualificacoes = (qualificacoesRaw.results || []).map((q) => {
      const qr = q as QualRaw;
      return {
        ...qr,
        data_realizacao: qr['data_realizacao'] as string,
        data_vencimento: qr['data_vencimento'] as string,
      };
    });
    const qualificacoesHistorico = (qualificacoesHistoricoRaw.results || []).map((q) => {
      const qr = q as QualRaw;
      return {
        ...qr,
        data_realizacao: qr['data_realizacao'] as string,
        data_vencimento: qr['data_vencimento'] as string,
      };
    });

    // 3. Licenças (tolerar ausência da tabela)
    let licencas: unknown[] = [];
    try {
      const licCols = await getTableColumns(db, 'licencas');
      if (licCols.size > 0) {
        const lic = await db
          .prepare(
            `SELECT * FROM licencas WHERE funcionario_id = ? AND deleted_at IS NULL ORDER BY data_vencimento DESC`,
          )
          .bind(funcionarioId)
          .all();
        licencas = lic.results || [];
      }
    } catch {
      licencas = [];
    }

    // 3.1 Treinamentos LMS vinculados ao funcionário
    const treinamentos =
      empresaId === undefined
        ? []
        : ((
            await db
              .prepare(
                `SELECT *
                 FROM (
                   SELECT
                     m.id,
                     'matricula' AS registro_tipo,
                     'LMS' AS origem,
                     'LMS nativo' AS origem_label,
                     m.curso_id,
                     m.id AS player_matricula_id,
                     m.status,
                     m.progresso_pct,
                     m.data_matricula,
                     m.data_inicio,
                     m.data_conclusao,
                     m.data_expiracao AS prazo_conclusao,
                     m.qualificacao_historico_id,
                     c.titulo,
                     c.tipo_conteudo,
                     c.categoria,
                     qt.codigo AS qualificacao_codigo,
                     m.created_at AS ordem_data
                   FROM lms_matriculas m
                   JOIN lms_cursos c
                     ON c.id = m.curso_id
                    AND c.empresa_id = m.empresa_id
                    AND c.deleted_at IS NULL
                   LEFT JOIN qualificacoes_tipos qt
                     ON qt.id = c.qualificacao_tipo_id
                    AND qt.deleted_at IS NULL
                  WHERE m.funcionario_id = ?
                    AND m.empresa_id = ?
                    AND m.deleted_at IS NULL

                   UNION ALL

                   SELECT
                     h.id,
                     'historico_importado' AS registro_tipo,
                     h.fonte AS origem,
                     CASE WHEN h.fonte = 'EDAPP' THEN 'EdApp importado' ELSE h.fonte END AS origem_label,
                     h.curso_id,
                     NULL AS player_matricula_id,
                     h.status,
                     COALESCE(h.progresso_pct, 100) AS progresso_pct,
                     NULL AS data_matricula,
                     NULL AS data_inicio,
                     h.data_conclusao,
                     NULL AS prazo_conclusao,
                     h.qualificacao_historico_id,
                     h.curso_titulo AS titulo,
                     h.tipo_conteudo,
                     COALESCE(h.curso_categoria, 'Treinamento legado') AS categoria,
                     h.qualificacao_codigo,
                     COALESCE(h.completed_at, h.updated_at, h.created_at) AS ordem_data
                   FROM lms_historico_importado h
                  WHERE h.funcionario_id = ?
                    AND h.empresa_id = ?
                    AND h.deleted_at IS NULL
                 ) treinamentos
                 ORDER BY datetime(ordem_data) DESC, id DESC`,
              )
              .bind(funcionarioId, empresaId, funcionarioId, empresaId)
              .all<Record<string, unknown>>()
          ).results ?? []);

    const treinamentosPlanejados =
      empresaId === undefined
        ? []
        : (
            await db
              .prepare(
                `SELECT
                 t.id,
                 t.qualificacao_tipo_id,
                 qt.nome AS qualificacao_nome,
                 qt.codigo AS qualificacao_codigo,
                 t.titulo,
                 t.data_prevista,
                 t.hora_inicio,
                 t.hora_fim,
                 t.status,
                 t.local,
                 t.instrutor_id,
                 i.nome AS instrutor_nome,
                 tp.confirmado,
                 tp.presente,
                 tp.aprovado,
                 tp.nota,
                 tp.qualificacao_historico_id,
                 t.created_at,
                 t.updated_at
               FROM treinamentos_participantes tp
               INNER JOIN treinamentos_planejados t
                       ON t.id = tp.treinamento_id
                      AND t.deleted_at IS NULL
               LEFT JOIN qualificacoes_tipos qt
                      ON qt.id = t.qualificacao_tipo_id
                     AND qt.deleted_at IS NULL
               LEFT JOIN funcionarios i
                      ON i.id = t.instrutor_id
                     AND i.deleted_at IS NULL
               WHERE tp.funcionario_id = ?
                 AND t.empresa_id = ?
               ORDER BY datetime(COALESCE(t.data_prevista, t.created_at)) DESC, t.id DESC`,
              )
              .bind(funcionarioId, empresaId)
              .all<Record<string, unknown>>()
          ).results || [];

    // 4. Requisitos de compliance para a função do funcionário
    const funcao = (funcionarioNormalizado as Record<string, unknown>).funcao as string | undefined || 'Piloto';
    let requisitos: unknown[] = [];
    try {
      const reqCols = await getTableColumns(db, 'requisitos_compliance');
      if (reqCols.size > 0) {
        const reqEmpresaFilter =
          empresaId !== undefined && reqCols.has('empresa_id') ? 'AND empresa_id = ?' : '';
        const req = await db
          .prepare(
            `SELECT * FROM requisitos_compliance WHERE funcao = ? AND deleted_at IS NULL ${reqEmpresaFilter} ORDER BY tipo_recurso, referencia`,
          )
          .bind(...(reqEmpresaFilter ? [funcao, empresaId] : [funcao]))
          .all();
        requisitos = req.results || [];
      }
    } catch {
      requisitos = [];
    }

    // 5. Sessões de simulador (participações) - detectar tabelas legadas e atuais
    const participantesTables = ['sessoes_participantes', 'participantes_sessao'];
    const sessoesTables = ['simulador_agendamentos', 'sessoes'];
    let participantesTable: string | null = null;
    let sessoesTable: string | null = null;
    for (const t of participantesTables) {
      const partCols = await getTableColumns(db, t);
      if (partCols.size > 0) {
        participantesTable = t;
        break;
      }
    }
    for (const t of sessoesTables) {
      const cols = await getTableColumns(db, t);
      if (cols.size > 0) {
        sessoesTable = t;
        break;
      }
    }

    const fichasCols = await getTableColumns(db, 'fichas_sessao');
    const fichaFuncionarioCol = fichasCols.has('funcionario_id')
      ? 'funcionario_id'
      : fichasCols.has('colaborador_id_aluno')
        ? 'colaborador_id_aluno'
        : null;
    const fichaSessaoFk = fichasCols.has('agendamento_slot_id')
      ? 'agendamento_slot_id'
      : fichasCols.has('sessao_id')
        ? 'sessao_id'
        : null;

    let sessoes: unknown[] = [];
    if (participantesTable && sessoesTable) {
      // Verificar colunas para deleted_at / papel vs funcao
      const partCols = await getTableColumns(db, participantesTable);
      const sessoesCols = await getTableColumns(db, sessoesTable);
      const participanteSessaoFk = partCols.has('sessao_id')
        ? 'sessao_id'
        : partCols.has('agendamento_slot_id')
          ? 'agendamento_slot_id'
          : null;
      const participanteFuncionarioCol = partCols.has('funcionario_id')
        ? 'funcionario_id'
        : partCols.has('colaborador_id_aluno')
          ? 'colaborador_id_aluno'
          : null;
      const papelCol = partCols.has('papel')
        ? 'papel'
        : partCols.has('funcao')
          ? 'funcao'
          : "'PARTICIPANTE'";
      const deletedFilter = partCols.has('deleted_at') ? 'AND p.deleted_at IS NULL' : '';
      const sessoesDeletedFilter = sessoesCols.has('deleted_at') ? 'AND s.deleted_at IS NULL' : '';
      const dataSessaoSelect = sessoesCols.has('data_sessao')
        ? 's.data_sessao'
        : sessoesCols.has('data')
          ? 's.data AS data_sessao'
          : sessoesCols.has('created_at')
            ? 's.created_at AS data_sessao'
            : 'NULL AS data_sessao';
      const simuladorIdSelect = sessoesCols.has('simulador_id')
        ? 's.simulador_id'
        : 'NULL AS simulador_id';
      const tipoSessaoSelect = sessoesCols.has('tipo_sessao')
        ? 's.tipo_sessao'
        : 'NULL AS tipo_sessao';
      const duracaoSelect = sessoesCols.has('duracao_minutos')
        ? 's.duracao_minutos'
        : 'NULL AS duracao_minutos';
      const statusBaseExpr = sessoesCols.has('status') ? 's.status' : 'NULL';
      const statusSelect = `${statusBaseExpr} AS status`;

      const fichaDeletedFilter = fichasCols.has('deleted_at') ? 'AND fs.deleted_at IS NULL' : '';
      const fichaStatusExpr = fichasCols.has('status')
        ? 'fs.status'
        : fichasCols.has('resultado_final')
          ? "CASE WHEN fs.resultado_final = 'REPROVADO' THEN 'NAO_APROVADO' WHEN fs.resultado_final = 'APROVADO' THEN 'APROVADO' WHEN fs.resultado_final = 'FALTA' THEN 'FALTA' ELSE 'PENDENTE' END"
          : fichasCols.has('aprovado')
            ? "CASE WHEN fs.aprovado = 1 THEN 'APROVADO' WHEN fs.aprovado = 0 THEN 'NAO_APROVADO' ELSE 'PENDENTE' END"
            : 'NULL';
      const fichaNotaExpr = fichasCols.has('nota_geral')
        ? 'fs.nota_geral'
        : fichasCols.has('nota_final')
          ? 'fs.nota_final'
          : fichasCols.has('nota')
            ? 'fs.nota'
            : 'NULL';

      const fsJoin =
        fichaFuncionarioCol && fichaSessaoFk && participanteFuncionarioCol && participanteSessaoFk
          ? `LEFT JOIN fichas_sessao fs
               ON fs.${fichaSessaoFk} = p.${participanteSessaoFk}
              AND fs.${fichaFuncionarioCol} = p.${participanteFuncionarioCol}
              ${fichaDeletedFilter}`
          : '';

      const orderByColumn = sessoesCols.has('data_sessao')
        ? 's.data_sessao'
        : sessoesCols.has('data')
          ? 's.data'
          : sessoesCols.has('created_at')
            ? 's.created_at'
            : 's.id';
      if (participanteSessaoFk && participanteFuncionarioCol) {
        sessoes =
          (
            await db
              .prepare(
                `SELECT s.id,
                        ${simuladorIdSelect},
                        ${dataSessaoSelect},
                        ${tipoSessaoSelect},
                        ${duracaoSelect},
                        COALESCE(${fichaStatusExpr}, ${statusBaseExpr}) AS status,
                        ${fichaNotaExpr} AS nota_geral,
                        p.${papelCol} as papel
               FROM ${participantesTable} p
               JOIN ${sessoesTable} s ON p.${participanteSessaoFk} = s.id
               ${fsJoin}
               WHERE p.${participanteFuncionarioCol} = ? ${deletedFilter} ${sessoesDeletedFilter}
               ORDER BY ${orderByColumn} DESC
               LIMIT 20`,
              )
              .bind(funcionarioId)
              .all()
          ).results || [];
      }
    }

    // 6. Fichas de simulador do funcionário
    const fichas = fichaFuncionarioCol
      ? (
          await db
            .prepare(
              `SELECT id,
                      ${fichasCols.has('sessao_id') ? 'sessao_id' : fichasCols.has('agendamento_slot_id') ? 'agendamento_slot_id AS sessao_id' : 'NULL AS sessao_id'},
                      ${fichasCols.has('data_sessao') ? 'data_sessao' : fichasCols.has('created_at') ? 'created_at AS data_sessao' : 'NULL AS data_sessao'},
                      ${fichasCols.has('tipo_sessao') ? 'tipo_sessao' : 'NULL AS tipo_sessao'},
                      ${fichasCols.has('nota_geral') ? 'nota_geral' : fichasCols.has('nota_final') ? 'nota_final AS nota_geral' : fichasCols.has('nota') ? 'nota AS nota_geral' : 'NULL AS nota_geral'},
                      ${fichasCols.has('status') ? 'status' : fichasCols.has('resultado_final') ? "CASE WHEN resultado_final = 'REPROVADO' THEN 'NAO_APROVADO' WHEN resultado_final = 'APROVADO' THEN 'APROVADO' WHEN resultado_final = 'FALTA' THEN 'FALTA' ELSE 'PENDENTE' END AS status" : fichasCols.has('aprovado') ? "CASE WHEN aprovado = 1 THEN 'APROVADO' WHEN aprovado = 0 THEN 'NAO_APROVADO' ELSE 'PENDENTE' END AS status" : 'NULL AS status'},
                      ${fichasCols.has('updated_at') ? 'updated_at' : fichasCols.has('created_at') ? 'created_at AS updated_at' : 'NULL AS updated_at'}
                 FROM fichas_sessao
                WHERE ${fichaFuncionarioCol} = ? ${fichasCols.has('deleted_at') ? 'AND deleted_at IS NULL' : ''}
                ORDER BY ${fichasCols.has('data_sessao') ? 'data_sessao' : fichasCols.has('created_at') ? 'created_at' : 'id'} DESC
                LIMIT 20`,
            )
            .bind(funcionarioId)
            .all()
        ).results || []
      : [];

    const auditoria = await getFuncionarioAuditoria(db, funcionarioId);

    return {
      funcionario: funcionarioNormalizado,
      qualificacoes,
      qualificacoes_historico: qualificacoesHistorico,
      licencas,
      treinamentos,
      treinamentos_planejados: treinamentosPlanejados,
      requisitos,
      simulador: {
        sessoes,
        fichas,
      },
      auditoria,
    };
  } catch (error) {
    throw error;
  }
}

// ============================================================
// GET /api/funcionarios/:id/ficha-360
// ============================================================

app.get('/funcionarios/:id/ficha-360', async (c: Context<{ Bindings: Env }>) => {
  try {
    const id = Number(c.req.param('id'));
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);

    if (Number.isNaN(id)) {
      return c.json({ error: 'ID inválido' }, 400);
    }

    await assertFuncionarioInScope(c.env.DB, empresaId, id, access);

    const data = await getFicha360(c.env.DB, id, empresaId);

    if (!data) {
      return c.json({ error: 'Funcionário não encontrado' }, 404);
    }

    return c.json({
      success: true,
      data,
    });
  } catch (error) {
    createLogger(c, 'Ficha360').error('Erro ao buscar ficha 360°', toError(error));
    return c.json(
      {
        success: false,
        error: 'Erro ao buscar ficha 360°',
      },
      500,
    );
  }
});

export default app;
