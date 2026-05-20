// worker-airtrust/src/routes/sgso.ts
// ============================================================
// Módulo SGSO — Rotas Hono
// Montagem: app.route('/api/sgso', sgsoRouter) no index.ts
//
// IMPORTANTE: Adicionar ao index.ts:
//   import sgsoRouter from './routes/sgso';
//   app.route('/api/sgso', sgsoRouter);
// ============================================================

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { AppError } from '../utils/errors';
import { registrarAuditoria } from '../utils/auditoria';
import {
  criarRelato,
  buscarRelatoPorId,
  listarRelatos,
  atualizarStatusRelato,
  criarAvaliacaoRisco,
  criarAcaoMitigacao,
  listarAcoesPorRelato,
  calcularSpis,
} from '../lib/sgso/db-service';
import type {
  SgsoRelatoStatus,
  SgsoRelatoTipo,
  SgsoFaseVoo,
  SgsoCondicaoMet,
  SgsoTipoAvaliacao,
  SgsoProbabilidade,
  SgsoAcaoTipo,
  SgsoAcaoCategoria,
} from '../lib/sgso/types';
import type { Env } from '../types';

// Helper padrão AirTrust para extrair empresa_id do contexto
function getEmpresaId(c: any): number {
  return c.var.tenant?.empresaId ?? c.var.empresaId;
}
function getUserId(c: any): number {
  return c.var.userId ?? c.var.user?.id;
}

const sgsoRouter = new Hono<{ Bindings: Env }>();

// ─────────────────────────────────────────────────────────────
// Schemas Zod de validação
// ─────────────────────────────────────────────────────────────

const RelatoTiposValidos = ['OCORRENCIA', 'PERIGO', 'INCIDENTE', 'ACIDENTE'] as const;
const FaseVooValidos = [
  'PREFLIGHT','TAXI','DECOLAGEM','SUBIDA','CRUZEIRO',
  'DESCIDA','APROXIMACAO','POUSO','POS_VOO','SOLO','MANUTENCAO','NAO_APLICAVEL'
] as const;
const CondicaoMetValidos = ['VMC','IMC','NOITE_VMC','NOITE_IMC','DEGRADADA','NAO_APLICAVEL'] as const;
const ProbabilidadeValidos = ['A','B','C','D','E'] as const;
const TipoAvaliacaoValidos = ['INICIAL','RESIDUAL'] as const;
const StatusRelatoValidos = ['ABERTO','EM_ANALISE','AGUARDANDO_ACAO','FECHADO'] as const;
const AcaoTipoValidos = ['CORRETIVA','PREVENTIVA'] as const;
const AcaoCategoriaValidos = [
  'TREINAMENTO','PROCEDIMENTO','EQUIPAMENTO','SUPERVISAO','COMUNICACAO','OUTRO'
] as const;

const criarRelatoSchema = z.object({
  tipo: z.enum(RelatoTiposValidos),
  anonimo: z.boolean().optional().default(false),
  aeronave_id: z.number().int().positive().optional(),
  data_ocorrencia: z.string().datetime({ message: 'data_ocorrencia deve ser ISO 8601' }),
  local_icao: z.string().max(10).optional(),
  local_descricao: z.string().max(500).optional(),
  fase_voo: z.enum(FaseVooValidos).optional(),
  condicao_meteorologica: z.enum(CondicaoMetValidos).optional(),
  descricao: z.string().min(50, 'A descrição deve ter no mínimo 50 caracteres'),
  consequencia: z.string().max(2000).optional(),
  accao_imediata: z.string().max(1000).optional(),
  categoria_adrep: z.string().max(100).optional(),
  subcategoria_adrep: z.string().max(100).optional(),
});

const listarRelatosSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(StatusRelatoValidos).optional(),
  tipo: z.enum(RelatoTiposValidos).optional(),
  data_inicio: z.string().optional(),
  data_fim: z.string().optional(),
  aeronave_id: z.coerce.number().int().positive().optional(),
  com_fadiga: z.coerce.boolean().optional(),
});

const atualizarStatusSchema = z.object({
  status: z.enum(StatusRelatoValidos),
  motivo: z.string().max(1000).optional(),
});

const avaliacaoRiscoSchema = z.object({
  tipo_avaliacao: z.enum(TipoAvaliacaoValidos),
  probabilidade: z.enum(ProbabilidadeValidos),
  severidade: z.number().int().min(1).max(5),
  justificativa: z.string().max(2000).optional(),
});

const criarAcaoSchema = z.object({
  tipo: z.enum(AcaoTipoValidos),
  descricao: z.string().min(10, 'Descreva a ação com ao menos 10 caracteres'),
  categoria: z.enum(AcaoCategoriaValidos).optional(),
  responsavel_id: z.number().int().positive(),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'prazo deve ser YYYY-MM-DD'),
});

// ─────────────────────────────────────────────────────────────
// GET /api/sgso/relatos — Listar relatos
// ─────────────────────────────────────────────────────────────
sgsoRouter.get(
  '/relatos',
  zValidator('query', listarRelatosSchema),
  async (c) => {
    const empresaId = getEmpresaId(c);
    const params = c.req.valid('query');

    const { rows, total } = await listarRelatos(c.env.DB, empresaId, params);

    const { page = 1, limit = 20 } = params;
    return c.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
);

// ─────────────────────────────────────────────────────────────
// POST /api/sgso/relatos — Criar relato
// ─────────────────────────────────────────────────────────────
sgsoRouter.post(
  '/relatos',
  zValidator('json', criarRelatoSchema),
  async (c) => {
    const empresaId = getEmpresaId(c);
    const userId = getUserId(c);
    const dto = c.req.valid('json');

    const relato = await criarRelato(c.env.DB, empresaId, userId, dto);

    // Auditoria (relatos anônimos: created_by = null, não registrar dados do usuário)
    await registrarAuditoria(c.env.DB, {
      acao: 'CREATE',
      entidade: 'SgsoRelato',
      entidade_id: String(relato.id),
      usuario_id: dto.anonimo ? null : userId,
      empresa_id: empresaId,
      dados_novos: { tipo: relato.tipo, status: relato.status, numero_protocolo: relato.numero_protocolo },
    });

    return c.json({ success: true, data: relato }, 201);
  }
);

// ─────────────────────────────────────────────────────────────
// GET /api/sgso/relatos/:id — Detalhe do relato
// ─────────────────────────────────────────────────────────────
sgsoRouter.get('/relatos/:id', async (c) => {
  const empresaId = getEmpresaId(c);
  const { id } = c.req.param();

  const relato = await buscarRelatoPorId(c.env.DB, empresaId, id);
  if (!relato) throw new AppError('Relato não encontrado', 404, 'NOT_FOUND');

  // Busca dados relacionados em paralelo
  const [avaliacoes, acoes, fatoresHumanos, historico, comentarios] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ar.*, f.nome as avaliador_nome
       FROM sgso_avaliacao_risco ar
       LEFT JOIN funcionarios f ON f.id = ar.avaliador_id
       WHERE ar.relato_id = ? AND ar.deleted_at IS NULL
       ORDER BY ar.created_at ASC`
    ).bind(id).all(),
    listarAcoesPorRelato(c.env.DB, empresaId, id),
    c.env.DB.prepare(
      `SELECT * FROM sgso_relatos_fatores_humanos
       WHERE relato_id = ? AND deleted_at IS NULL
       ORDER BY nivel_hfacs, categoria`
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT h.*, f.nome as alterado_por_nome
       FROM sgso_relatos_historico_status h
       LEFT JOIN funcionarios f ON f.id = h.alterado_por
       WHERE h.relato_id = ?
       ORDER BY h.alterado_em ASC`
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT c.*, f.nome as autor_nome
       FROM sgso_relatos_comentarios c
       LEFT JOIN funcionarios f ON f.id = c.autor_id
       WHERE c.relato_id = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC`
    ).bind(id).all(),
  ]);

  return c.json({
    success: true,
    data: {
      ...relato,
      avaliacoes_risco: avaliacoes.results,
      acoes_mitigacao: acoes,
      fatores_humanos: fatoresHumanos.results,
      historico_status: historico.results,
      comentarios: comentarios.results,
    },
  });
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/sgso/relatos/:id/status — Atualizar status
// ─────────────────────────────────────────────────────────────
sgsoRouter.patch(
  '/relatos/:id/status',
  zValidator('json', atualizarStatusSchema),
  async (c) => {
    const empresaId = getEmpresaId(c);
    const userId = getUserId(c);
    const { id } = c.req.param();
    const { status, motivo } = c.req.valid('json');

    const relato = await atualizarStatusRelato(
      c.env.DB, empresaId, id, status as SgsoRelatoStatus, userId, motivo
    );

    await registrarAuditoria(c.env.DB, {
      acao: 'UPDATE',
      entidade: 'SgsoRelato',
      entidade_id: id,
      usuario_id: userId,
      empresa_id: empresaId,
      dados_novos: { status },
    });

    return c.json({ success: true, data: relato });
  }
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/sgso/relatos/:id — Soft delete (admin/GSO only)
// ─────────────────────────────────────────────────────────────
sgsoRouter.delete('/relatos/:id', async (c) => {
  const empresaId = getEmpresaId(c);
  const userId = getUserId(c);
  const { id } = c.req.param();

  const relato = await buscarRelatoPorId(c.env.DB, empresaId, id);
  if (!relato) throw new AppError('Relato não encontrado', 404, 'NOT_FOUND');
  if (relato.status === 'FECHADO') {
    throw new AppError('Não é possível apagar um relato fechado', 400, 'INVALID_OPERATION');
  }

  await c.env.DB
    .prepare(
      `UPDATE sgso_relatos
       SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`
    )
    .bind(new Date().toISOString(), new Date().toISOString(), id, empresaId)
    .run();

  await registrarAuditoria(c.env.DB, {
    acao: 'DELETE',
    entidade: 'SgsoRelato',
    entidade_id: id,
    usuario_id: userId,
    empresa_id: empresaId,
    dados_anteriores: { numero_protocolo: relato.numero_protocolo },
  });

  return c.json({ success: true, message: 'Relato removido com sucesso' });
});

// ─────────────────────────────────────────────────────────────
// POST /api/sgso/relatos/:id/avaliacao-risco — Criar avaliação
// ─────────────────────────────────────────────────────────────
sgsoRouter.post(
  '/relatos/:id/avaliacao-risco',
  zValidator('json', avaliacaoRiscoSchema),
  async (c) => {
    const empresaId = getEmpresaId(c);
    const userId = getUserId(c);
    const { id } = c.req.param();
    const dto = c.req.valid('json');

    const avaliacao = await criarAvaliacaoRisco(
      c.env.DB, empresaId, userId, id, dto
    );

    await registrarAuditoria(c.env.DB, {
      acao: 'CREATE',
      entidade: 'SgsoAvaliacaoRisco',
      entidade_id: String(avaliacao.id),
      usuario_id: userId,
      empresa_id: empresaId,
      dados_novos: {
        relato_id: id,
        nivel_risco: avaliacao.nivel_risco,
        probabilidade: avaliacao.probabilidade,
        severidade: avaliacao.severidade,
        elevado_por_fadiga: avaliacao.elevado_por_fadiga,
      },
    });

    return c.json({ success: true, data: avaliacao }, 201);
  }
);

// ─────────────────────────────────────────────────────────────
// POST /api/sgso/relatos/:id/plano-acao — Criar ação CAPA
// ─────────────────────────────────────────────────────────────
sgsoRouter.post(
  '/relatos/:id/plano-acao',
  zValidator('json', criarAcaoSchema),
  async (c) => {
    const empresaId = getEmpresaId(c);
    const userId = getUserId(c);
    const { id } = c.req.param();
    const dto = c.req.valid('json');

    const acao = await criarAcaoMitigacao(c.env.DB, empresaId, userId, id, dto);

    await registrarAuditoria(c.env.DB, {
      acao: 'CREATE',
      entidade: 'SgsoAcaoMitigacao',
      entidade_id: String(acao.id),
      usuario_id: userId,
      empresa_id: empresaId,
      dados_novos: { relato_id: id, tipo: acao.tipo, responsavel_id: acao.responsavel_id, prazo: acao.prazo },
    });

    return c.json({ success: true, data: acao }, 201);
  }
);

// PATCH /api/sgso/relatos/:id/plano-acao/:acaoId — Atualizar progresso
sgsoRouter.patch('/relatos/:id/plano-acao/:acaoId', async (c) => {
  const empresaId = getEmpresaId(c);
  const userId = getUserId(c);
  const { id, acaoId } = c.req.param();
  const body = await c.req.json();

  // Campos permitidos para atualização
  const camposPermitidos = ['status', 'percentual_conclusao', 'evidencia_url', 'evidencia_descricao'];
  const updates: string[] = [];
  const binds: unknown[] = [];

  for (const campo of camposPermitidos) {
    if (body[campo] !== undefined) {
      updates.push(`${campo} = ?`);
      binds.push(body[campo]);
    }
  }

  if (updates.length === 0) {
    throw new AppError('Nenhum campo válido para atualizar', 400, 'NO_FIELDS');
  }

  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  binds.push(now);

  // Se concluindo, registrar data e quem concluiu
  if (body.status === 'CONCLUIDA') {
    updates.push('data_conclusao = ?', 'concluida_por = ?');
    binds.push(now, userId);
  }

  binds.push(acaoId, empresaId, id);

  await c.env.DB
    .prepare(
      `UPDATE sgso_acoes_mitigacao
       SET ${updates.join(', ')}
       WHERE id = ? AND empresa_id = ? AND relato_id = ? AND deleted_at IS NULL`
    )
    .bind(...binds)
    .run();

  const acoes = await listarAcoesPorRelato(c.env.DB, empresaId, id);
  return c.json({ success: true, data: acoes });
});

// ─────────────────────────────────────────────────────────────
// POST /api/sgso/relatos/:id/comentario — Adicionar comentário interno
// ─────────────────────────────────────────────────────────────
sgsoRouter.post('/relatos/:id/comentario', async (c) => {
  const empresaId = getEmpresaId(c);
  const userId = getUserId(c);
  const { id } = c.req.param();
  const { texto } = await c.req.json();

  if (!texto || typeof texto !== 'string' || texto.trim().length < 3) {
    throw new AppError('Comentário inválido', 400, 'INVALID_COMMENT');
  }

  const relato = await buscarRelatoPorId(c.env.DB, empresaId, id);
  if (!relato) throw new AppError('Relato não encontrado', 404, 'NOT_FOUND');

  await c.env.DB
    .prepare(
      `INSERT INTO sgso_relatos_comentarios (relato_id, empresa_id, texto, autor_id)
       VALUES (?, ?, ?, ?)`
    )
    .bind(id, empresaId, texto.trim(), userId)
    .run();

  return c.json({ success: true, message: 'Comentário adicionado' }, 201);
});

// ─────────────────────────────────────────────────────────────
// GET /api/sgso/kpi/spi — Safety Performance Indicators
// ─────────────────────────────────────────────────────────────
sgsoRouter.get('/kpi/spi', async (c) => {
  const empresaId = getEmpresaId(c);
  const spis = await calcularSpis(c.env.DB, empresaId);

  return c.json({
    success: true,
    data: spis,
    meta: {
      periodo: 'últimos 90 dias',
      gerado_em: new Date().toISOString(),
    },
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/sgso/kpi/tendencias — Tendências históricas mensais
// ─────────────────────────────────────────────────────────────
sgsoRouter.get('/kpi/tendencias', async (c) => {
  const empresaId = getEmpresaId(c);

  const [porMes, porTipo, porNivelRisco, porCategoria] = await Promise.all([
    // Relatos por mês (últimos 12 meses)
    c.env.DB.prepare(
      `SELECT strftime('%Y-%m', data_ocorrencia) as mes,
              COUNT(*) as total,
              SUM(CASE WHEN anonimo=1 THEN 1 ELSE 0 END) as anonimos,
              SUM(CASE WHEN tipo='ACIDENTE' THEN 1 ELSE 0 END) as acidentes,
              SUM(CASE WHEN tipo='INCIDENTE' THEN 1 ELSE 0 END) as incidentes,
              AVG(efetividade_cognitiva) as media_efetividade
       FROM sgso_relatos
       WHERE empresa_id = ?
         AND deleted_at IS NULL
         AND data_ocorrencia >= date('now', '-12 months')
       GROUP BY mes
       ORDER BY mes ASC`
    ).bind(empresaId).all(),

    // Distribuição por tipo
    c.env.DB.prepare(
      `SELECT tipo, COUNT(*) as total
       FROM sgso_relatos
       WHERE empresa_id = ? AND deleted_at IS NULL
       GROUP BY tipo`
    ).bind(empresaId).all(),

    // Distribuição de avaliações por nível de risco
    c.env.DB.prepare(
      `SELECT ar.nivel_risco, COUNT(*) as total
       FROM sgso_avaliacao_risco ar
       JOIN sgso_relatos r ON r.id = ar.relato_id
       WHERE r.empresa_id = ? AND ar.deleted_at IS NULL
         AND ar.tipo_avaliacao = 'INICIAL'
       GROUP BY ar.nivel_risco`
    ).bind(empresaId).all(),

    // Top 10 categorias ADREP
    c.env.DB.prepare(
      `SELECT categoria_adrep, COUNT(*) as total
       FROM sgso_relatos
       WHERE empresa_id = ? AND deleted_at IS NULL AND categoria_adrep IS NOT NULL
       GROUP BY categoria_adrep
       ORDER BY total DESC
       LIMIT 10`
    ).bind(empresaId).all(),
  ]);

  return c.json({
    success: true,
    data: {
      relatos_por_mes: porMes.results,
      distribuicao_tipo: porTipo.results,
      distribuicao_nivel_risco: porNivelRisco.results,
      top_categorias_adrep: porCategoria.results,
    },
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/sgso/categorias-adrep — Lista de categorias ADREP
// ─────────────────────────────────────────────────────────────
sgsoRouter.get('/categorias-adrep', async (c) => {
  const categorias = await c.env.DB
    .prepare(
      `SELECT id, codigo, nome_pt, nome_en, categoria_pai_id
       FROM sgso_categorias_adrep
       WHERE ativo = 1
       ORDER BY nome_pt ASC`
    )
    .all();

  return c.json({ success: true, data: categorias.results });
});

// ─────────────────────────────────────────────────────────────
// GET /api/sgso/resumo — Dashboard summary para o GSO
// ─────────────────────────────────────────────────────────────
sgsoRouter.get('/resumo', async (c) => {
  const empresaId = getEmpresaId(c);

  const [abertos, criticos, acoesPendentes, ncsAbertas] = await Promise.all([
    c.env.DB.prepare(
      `SELECT status, COUNT(*) as total
       FROM sgso_relatos
       WHERE empresa_id = ? AND deleted_at IS NULL
       GROUP BY status`
    ).bind(empresaId).all(),

    c.env.DB.prepare(
      `SELECT COUNT(*) as total
       FROM sgso_avaliacao_risco ar
       JOIN sgso_relatos r ON r.id = ar.relato_id
       WHERE r.empresa_id = ? AND ar.deleted_at IS NULL
         AND ar.nivel_risco = 'CRITICO'
         AND r.status NOT IN ('FECHADO')
         AND ar.tipo_avaliacao = 'INICIAL'`
    ).bind(empresaId).first<{ total: number }>(),

    c.env.DB.prepare(
      `SELECT COUNT(*) as total
       FROM sgso_acoes_mitigacao
       WHERE empresa_id = ? AND deleted_at IS NULL
         AND status NOT IN ('CONCLUIDA', 'CANCELADA')
         AND prazo < date('now')`
    ).bind(empresaId).first<{ total: number }>(),

    c.env.DB.prepare(
      `SELECT COUNT(*) as total
       FROM sgso_nao_conformidades
       WHERE empresa_id = ? AND deleted_at IS NULL
         AND status NOT IN ('FECHADA', 'CANCELADA')`
    ).bind(empresaId).first<{ total: number }>(),
  ]);

  return c.json({
    success: true,
    data: {
      relatos_por_status: abertos.results,
      relatos_criticos_abertos: criticos?.total ?? 0,
      acoes_vencidas: acoesPendentes?.total ?? 0,
      ncs_abertas: ncsAbertas?.total ?? 0,
    },
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/sgso/exportar/csv — Export simples para ANAC/auditoria
// ─────────────────────────────────────────────────────────────
sgsoRouter.get('/exportar/csv', async (c) => {
  const empresaId = getEmpresaId(c);
  const { data_inicio, data_fim } = c.req.query();

  let where = 'WHERE r.empresa_id = ? AND r.deleted_at IS NULL';
  const binds: unknown[] = [empresaId];

  if (data_inicio) { where += ' AND r.data_ocorrencia >= ?'; binds.push(data_inicio); }
  if (data_fim) { where += ' AND r.data_ocorrencia <= ?'; binds.push(data_fim + 'T23:59:59'); }

  const rows = await c.env.DB
    .prepare(
      `SELECT r.numero_protocolo, r.tipo, r.data_ocorrencia, r.status,
              r.aeronave_matricula, r.aeronave_modelo,
              r.fase_voo, r.condicao_meteorologica,
              r.categoria_adrep, r.local_icao,
              ar.probabilidade, ar.severidade, ar.nivel_risco,
              r.efetividade_cognitiva
       FROM sgso_relatos r
       LEFT JOIN sgso_avaliacao_risco ar
         ON ar.relato_id = r.id AND ar.tipo_avaliacao = 'INICIAL' AND ar.deleted_at IS NULL
       ${where}
       ORDER BY r.data_ocorrencia DESC`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  // Gerar CSV simples
  const headers = Object.keys(rows.results[0] ?? {});
  const csvLines = [
    headers.join(';'),
    ...rows.results.map(row =>
      headers.map(h => {
        const val = row[h] ?? '';
        const str = String(val).replace(/;/g, ',').replace(/\n/g, ' ');
        return str;
      }).join(';')
    ),
  ];

  return new Response(csvLines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="relatos-sgso-${new Date().toISOString().substring(0,10)}.csv"`,
    },
  });
});

export default sgsoRouter;
