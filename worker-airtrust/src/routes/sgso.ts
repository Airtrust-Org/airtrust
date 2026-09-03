/**
 * SGSO — Sistema de Gerenciamento de Segurança Operacional
 * Rotas API: /api/sgso/*
 *
 * Endpoints:
 *   Relatos:          POST/GET /relatos, GET/PATCH /relatos/:id
 *   Avaliação risco:  POST /relatos/:id/avaliacao-risco
 *   Fatores humanos:  POST /relatos/:id/fatores-humanos
 *   Ações CAPA:       POST /relatos/:id/acoes, PATCH /acoes/:id
 *   Comentários:      POST /relatos/:id/comentarios
 *   Histórico:        GET /relatos/:id/historico
 *   Auditorias:       GET/POST /auditorias, GET /auditorias/:id, PATCH item, POST concluir
 *   NCs:              GET/POST /nao-conformidades, PATCH /nao-conformidades/:id
 *   KPIs:             GET /kpi/spi, GET /kpi/tendencias
 *   Suporte:          GET /categorias-adrep, GET /fatores-humanos/categorias
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import sgsoNextGenRoutes from './sgso-next-gen';
import sgsoAuditoriasNcsRoutes from './sgso-auditorias-ncs';
import type { Context } from 'hono';
import { createLogger, toError } from '../utils/logger';

type AppCtx = Context<{ Bindings: Env; Variables: { userId?: string } }>;

const sgso = new Hono<{ Bindings: Env; Variables: { userId?: string } }>();
sgso.use('*', auth());
sgso.route('/', sgsoNextGenRoutes);
sgso.route('/', sgsoAuditoriasNcsRoutes);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getUid(c: AppCtx): number {
  return Number(c.get('userId') ?? 0);
}

function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function sgsoErrorResponse(
  c: AppCtx,
  error: unknown,
  message: string,
  code: string,
  status: number = 500,
) {
  const logger = createLogger(c as Record<string, any>, 'SgsoRoutes');
  logger.error(message, toError(error), { route: c.req.path, status });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ success: false, error: message, code }, status as any);
}

/** Calcula nível de risco baseado na matriz 5×5 ICAO */
function calcularNivelRisco(probabilidade: string, severidade: number): string {
  const probScore: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };
  const score = (probScore[probabilidade] ?? 1) * severidade;
  if (score >= 20) return 'CRITICO';
  if (score >= 12) return 'ALTO';
  if (score >= 5) return 'MEDIO';
  return 'BAIXO';
}

/** Gera número de protocolo sequencial: REL-AAAA-NNNN */
async function gerarProtocolo(db: D1Database, empresaId: number): Promise<string> {
  const ano = new Date().getFullYear();
  await db
    .prepare(
      'INSERT OR IGNORE INTO sgso_protocolo_sequencia (empresa_id, ano, ultimo_numero) VALUES (?, ?, 0)',
    )
    .bind(empresaId, ano)
    .run();
  await db
    .prepare(
      'UPDATE sgso_protocolo_sequencia SET ultimo_numero = ultimo_numero + 1 WHERE empresa_id = ? AND ano = ?',
    )
    .bind(empresaId, ano)
    .run();
  const row = await db
    .prepare('SELECT ultimo_numero FROM sgso_protocolo_sequencia WHERE empresa_id = ? AND ano = ?')
    .bind(empresaId, ano)
    .first<{ ultimo_numero: number }>();
  const num = String(row?.ultimo_numero ?? 1).padStart(4, '0');
  return `REL-${ano}-${num}`;
}

async function getTableColumns(db: D1Database, tableName: string): Promise<Set<string>> {
  const ALLOWED_TABLES = new Set([
    'sgso_relatos',
    'sgso_relatos_historico_status',
    'sgso_avaliacao_risco',
    'sgso_acoes_mitigacao',
    'sgso_relatos_fatores_humanos',
    'frms_jornada',
  ]);
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`Table not allowed: ${tableName}`);
  }
  const pragma = await db.prepare(`PRAGMA table_info(${tableName})`).all<{ name: string }>();
  return new Set((pragma.results || []).map((column) => String(column.name)));
}

// ─────────────────────────────────────────────────────────────
// RELATOS
// ─────────────────────────────────────────────────────────────

const CriarRelatoSchema = z.object({
  tipo: z.enum(['OCORRENCIA', 'PERIGO', 'INCIDENTE', 'ACIDENTE']),
  anonimo: z.boolean().optional().default(false),
  relator_id: z.number().int().optional(),
  aeronave_id: z.number().int().optional(),
  aeronave_matricula: z.string().optional(),
  aeronave_modelo: z.string().optional(),
  data_ocorrencia: z.string(),
  local_icao: z.string().optional(),
  local_descricao: z.string().optional(),
  fase_voo: z
    .enum([
      'PREFLIGHT',
      'TAXI',
      'DECOLAGEM',
      'SUBIDA',
      'CRUZEIRO',
      'DESCIDA',
      'APROXIMACAO',
      'POUSO',
      'POS_VOO',
      'SOLO',
      'MANUTENCAO',
      'NAO_APLICAVEL',
    ])
    .optional(),
  condicao_meteorologica: z
    .enum(['VMC', 'IMC', 'NOITE_VMC', 'NOITE_IMC', 'DEGRADADA', 'NAO_APLICAVEL'])
    .optional(),
  descricao: z.string().min(10),
  consequencia: z.string().optional(),
  accao_imediata: z.string().optional(),
  categoria_adrep: z.string().optional(),
  subcategoria_adrep: z.string().optional(),
  arquivo_url: z.string().optional(),
  arquivo_nome: z.string().optional(),
});

// POST /api/sgso/relatos
sgso.post('/relatos', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c);
    const body = await c.req.json();
    const parsed = CriarRelatoSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: 'Dados inválidos',
          details: parsed.error.flatten(),
          code: 'SGSO_VALIDATION_ERROR',
        },
        400,
      );
    }
    const d = parsed.data;
    const db = c.env.DB;

    // Gerar protocolo sequencial
    const protocolo = await gerarProtocolo(db, empresaId);
    const id = uuid();

    // Auto-vinculação FRMS: buscar jornada do relator na data_ocorrencia
    let frmsJornadaId: number | null = null;
    let efetividadeCognitiva: number | null = null;
    let horasAcumuladas7d: number | null = null;
    let horasAcumuladas28d: number | null = null;
    const relatorId = d.anonimo ? null : (d.relator_id ?? uid);

    if (relatorId) {
      const jornadaRow = await db
        .prepare(
          `SELECT fj.id, fj.effectiveness_pct, fj.horas_voo_acumuladas_7d, fj.horas_voo_acumuladas_28d
           FROM frms_jornada fj
           WHERE fj.funcionario_id = ? AND date(fj.data_inicio) = date(?)
             AND fj.empresa_id = ? AND fj.deleted_at IS NULL
           LIMIT 1`,
        )
        .bind(relatorId, d.data_ocorrencia, empresaId)
        .first<{
          id: number;
          effectiveness_pct: number;
          horas_voo_acumuladas_7d: number;
          horas_voo_acumuladas_28d: number;
        }>();

      if (jornadaRow) {
        frmsJornadaId = jornadaRow.id;
        efetividadeCognitiva = jornadaRow.effectiveness_pct;
        horasAcumuladas7d = jornadaRow.horas_voo_acumuladas_7d;
        horasAcumuladas28d = jornadaRow.horas_voo_acumuladas_28d;
      }
    }

    // Auto-vinculação Escala
    let escalaId: string | null = null;
    let escalaQuinzena: number | null = null;
    if (relatorId) {
      const escalaRow = await db
        .prepare(
          `SELECT ea.escala_id, ea.quinzena_id AS quinzena
           FROM escala_alocacoes ea
           WHERE ea.funcionario_id = ? AND ea.empresa_id = ?
             AND date(?) BETWEEN date(ea.data_inicio) AND date(ea.data_fim)
             AND ea.deleted_at IS NULL
           LIMIT 1`,
        )
        .bind(relatorId, empresaId, d.data_ocorrencia)
        .first<{ escala_id: string; quinzena: number }>();

      if (escalaRow) {
        escalaId = escalaRow.escala_id;
        escalaQuinzena = escalaRow.quinzena;
      }
    }

    // Aeronave: se apenas aeronave_id foi fornecida, buscar matrícula/modelo
    let aeronaveMatricula = d.aeronave_matricula ?? null;
    let aeronaveModelo = d.aeronave_modelo ?? null;
    if (d.aeronave_id && !aeronaveMatricula) {
      const aerRow = await db
        .prepare(
          'SELECT prefixo AS matricula, modelo FROM aeronaves WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
        )
        .bind(d.aeronave_id, empresaId)
        .first<{ matricula: string; modelo: string }>();
      if (aerRow) {
        aeronaveMatricula = aerRow.matricula;
        aeronaveModelo = aerRow.modelo;
      }
    }

    const ts = now();
    await db
      .prepare(
        `INSERT INTO sgso_relatos (
          id, empresa_id, numero_protocolo, tipo, anonimo, relator_id,
          aeronave_id, aeronave_matricula, aeronave_modelo,
          data_ocorrencia, local_icao, local_descricao,
          fase_voo, condicao_meteorologica,
          descricao, consequencia, accao_imediata,
          categoria_adrep, subcategoria_adrep,
          status,
          escala_id, escala_quinzena, frms_jornada_id,
          efetividade_cognitiva, horas_acumuladas_7d, horas_acumuladas_28d,
          arquivo_url, arquivo_nome,
          created_by, created_at, updated_at
        ) VALUES (
          ?,?,?,?,?,?,
          ?,?,?,
          ?,?,?,
          ?,?,
          ?,?,?,
          ?,?,
          'ABERTO',
          ?,?,?,
          ?,?,?,
          ?,?,
          ?,?,?
        )`,
      )
      .bind(
        id,
        empresaId,
        protocolo,
        d.tipo,
        d.anonimo ? 1 : 0,
        relatorId,
        d.aeronave_id ?? null,
        aeronaveMatricula,
        aeronaveModelo,
        d.data_ocorrencia,
        d.local_icao ?? null,
        d.local_descricao ?? null,
        d.fase_voo ?? null,
        d.condicao_meteorologica ?? null,
        d.descricao,
        d.consequencia ?? null,
        d.accao_imediata ?? null,
        d.categoria_adrep ?? null,
        d.subcategoria_adrep ?? null,
        escalaId,
        escalaQuinzena,
        frmsJornadaId,
        efetividadeCognitiva,
        horasAcumuladas7d,
        horasAcumuladas28d,
        d.arquivo_url ?? null,
        d.arquivo_nome ?? null,
        uid,
        ts,
        ts,
      )
      .run();

    // Registrar histórico de status inicial
    await db
      .prepare(
        `INSERT INTO sgso_relatos_historico_status
         (relato_id, empresa_id, status_anterior, status_novo, motivo, alterado_por, alterado_em)
         VALUES (?, ?, NULL, 'ABERTO', 'Relato criado', ?, ?)`,
      )
      .bind(id, empresaId, uid, ts)
      .run();

    return c.json(
      {
        success: true,
        data: {
          id,
          numero_protocolo: protocolo,
          status: 'ABERTO',
          vinculado_frms: frmsJornadaId !== null,
          vinculado_escala: escalaId !== null,
          efetividade_cognitiva: efetividadeCognitiva,
        },
      },
      201,
    );
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro interno ao criar relato', 'SGSO_RELATO_CREATE_ERROR');
  }
});

// GET /api/sgso/relatos
sgso.get('/relatos', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const { status, tipo, page = '1', limit = '20' } = c.req.query();
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let where = 'r.empresa_id = ? AND r.deleted_at IS NULL';
    const params: (string | number)[] = [empresaId];
    if (status) {
      where += ' AND r.status = ?';
      params.push(status);
    }
    if (tipo) {
      where += ' AND r.tipo = ?';
      params.push(tipo);
    }

    const total = await db
      .prepare(`SELECT COUNT(*) as n FROM sgso_relatos r WHERE ${where}`)
      .bind(...params)
      .first<{ n: number }>();

    const rows = await db
      .prepare(
        `SELECT r.id, r.numero_protocolo, r.tipo, r.status, r.anonimo,
                r.data_ocorrencia, r.local_icao, r.categoria_adrep,
                r.aeronave_matricula, r.aeronave_modelo,
                r.efetividade_cognitiva,
                r.created_at,
                f.nome AS relator_nome
         FROM sgso_relatos r
         LEFT JOIN funcionarios f ON f.id = r.relator_id AND f.deleted_at IS NULL
         WHERE ${where}
         ORDER BY r.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...params, limitNum, offset)
      .all<Record<string, unknown>>();

    // Mascarar relator em relatos anônimos
    const data = rows.results.map((r) => ({
      ...r,
      relator_nome: r.anonimo ? 'Anônimo' : r.relator_nome,
    }));

    return c.json({
      success: true,
      data,
      pagination: { page: pageNum, limit: limitNum, total: total?.n ?? 0 },
    });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao listar relatos', 'SGSO_RELATOS_LIST_ERROR');
  }
});

// GET /api/sgso/relatos/:id
sgso.get('/relatos/:id', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const { id } = c.req.param();
    const relatoColumns = await getTableColumns(db, 'sgso_relatos');
    const hasGsoResponsavel = relatoColumns.has('gso_responsavel_id');
    const hasAeronaveId = relatoColumns.has('aeronave_id');

    const relato = await db
      .prepare(
        `SELECT r.*,
                f.nome AS relator_nome, f.cargo AS relator_cargo,
                ${hasGsoResponsavel ? 'g.nome AS gso_nome' : 'NULL AS gso_nome'},
                ${hasAeronaveId ? 'a.prefixo AS aeronave_matricula_atual' : 'NULL AS aeronave_matricula_atual'}
         FROM sgso_relatos r
         LEFT JOIN funcionarios f ON f.id = r.relator_id AND f.deleted_at IS NULL
         ${hasGsoResponsavel ? 'LEFT JOIN funcionarios g ON g.id = r.gso_responsavel_id AND g.deleted_at IS NULL' : ''}
         ${hasAeronaveId ? 'LEFT JOIN aeronaves a ON a.id = r.aeronave_id AND a.deleted_at IS NULL' : ''}
         WHERE r.id = ? AND r.empresa_id = ? AND r.deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first<Record<string, unknown>>();

    if (!relato) {
      return c.json(
        { success: false, error: 'Relato não encontrado', code: 'SGSO_RELATO_NOT_FOUND' },
        404,
      );
    }

    // Buscar avaliações de risco
    const avaliacoes = await db
      .prepare(
        `SELECT ar.*, f.nome AS avaliador_nome
         FROM sgso_avaliacao_risco ar
         LEFT JOIN funcionarios f ON f.id = ar.avaliador_id
         WHERE ar.relato_id = ? AND ar.empresa_id = ? AND ar.deleted_at IS NULL
         ORDER BY ar.created_at ASC`,
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();

    // Buscar ações de mitigação
    const acoes = await db
      .prepare(
        `SELECT ac.*, f.nome AS responsavel_nome
         FROM sgso_acoes_mitigacao ac
         LEFT JOIN funcionarios f ON f.id = ac.responsavel_id
         WHERE ac.relato_id = ? AND ac.empresa_id = ? AND ac.deleted_at IS NULL
         ORDER BY ac.created_at ASC`,
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();

    // Buscar fatores humanos
    const fatores = await db
      .prepare(
        'SELECT * FROM sgso_relatos_fatores_humanos WHERE relato_id = ? AND empresa_id = ? AND deleted_at IS NULL ORDER BY nivel_hfacs',
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();

    // Mascarar relator se anônimo
    if (relato.anonimo) {
      relato.relator_nome = 'Anônimo';
      relato.relator_cargo = null;
      relato.relator_id = null;
    }

    return c.json({
      success: true,
      data: {
        ...relato,
        avaliacoes_risco: avaliacoes.results,
        acoes_mitigacao: acoes.results,
        fatores_humanos: fatores.results,
      },
    });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao buscar relato', 'SGSO_RELATO_GET_ERROR');
  }
});

// PATCH /api/sgso/relatos/:id/status
sgso.patch('/relatos/:id/status', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c);
    const db = c.env.DB;
    const { id } = c.req.param();
    const { status, motivo } = await c.req.json();

    const statusValidos = ['ABERTO', 'EM_ANALISE', 'AGUARDANDO_ACAO', 'FECHADO'];
    if (!statusValidos.includes(status)) {
      return c.json({ success: false, error: 'Status inválido', code: 'SGSO_STATUS_INVALID' }, 400);
    }

    const TRANSITIONS: Record<string, string[]> = {
      ABERTO: ['EM_ANALISE', 'AGUARDANDO_ACAO'],
      EM_ANALISE: ['AGUARDANDO_ACAO', 'FECHADO'],
      AGUARDANDO_ACAO: ['EM_ANALISE', 'FECHADO'],
      FECHADO: [],
    };

    const relato = await db
      .prepare(
        'SELECT id, status FROM sgso_relatos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .first<{ id: string; status: string }>();

    if (!relato) {
      return c.json(
        { success: false, error: 'Relato não encontrado', code: 'SGSO_RELATO_NOT_FOUND' },
        404,
      );
    }

    if (relato.status !== status && !(TRANSITIONS[relato.status] ?? []).includes(status)) {
      return c.json(
        {
          success: false,
          error: `Transição inválida: ${relato.status} -> ${status}`,
          code: 'SGSO_STATUS_TRANSITION_INVALID',
        },
        400,
      );
    }

    const ts = now();
    const extra = status === 'FECHADO' ? ', fechado_por = ?, fechado_em = ?' : '';
    const extraParams = status === 'FECHADO' ? [uid, ts] : [];

    await db
      .prepare(
        `UPDATE sgso_relatos SET status = ?, updated_at = ? ${extra} WHERE id = ? AND empresa_id = ?`,
      )
      .bind(status, ts, ...extraParams, id, empresaId)
      .run();

    await db
      .prepare(
        `INSERT INTO sgso_relatos_historico_status
         (relato_id, empresa_id, status_anterior, status_novo, motivo, alterado_por, alterado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, empresaId, relato.status, status, motivo ?? null, uid, ts)
      .run();

    return c.json({ success: true, data: { id, status } });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao atualizar status', 'SGSO_STATUS_UPDATE_ERROR');
  }
});

// GET /api/sgso/relatos/:id/historico
sgso.get('/relatos/:id/historico', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;
    const { id } = c.req.param();

    const rows = await db
      .prepare(
        `SELECT h.*, f.nome AS alterado_por_nome
         FROM sgso_relatos_historico_status h
         LEFT JOIN funcionarios f ON f.id = h.alterado_por
         WHERE h.relato_id = ? AND h.empresa_id = ?
         ORDER BY h.alterado_em ASC`,
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();

    return c.json({ success: true, data: rows.results });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao buscar histórico', 'SGSO_HISTORICO_GET_ERROR');
  }
});

// ─────────────────────────────────────────────────────────────
// AVALIAÇÃO DE RISCO
// ─────────────────────────────────────────────────────────────

// POST /api/sgso/relatos/:id/avaliacao-risco
sgso.post('/relatos/:id/avaliacao-risco', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c);
    const db = c.env.DB;
    const { id } = c.req.param();
    const body = await c.req.json();

    const schema = z.object({
      tipo_avaliacao: z.enum(['INICIAL', 'RESIDUAL']),
      probabilidade: z.enum(['A', 'B', 'C', 'D', 'E']),
      severidade: z.number().int().min(1).max(5),
      perfil_id: z.number().int().optional(),
      justificativa: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }
    const d = parsed.data;

    // Verificar se relato existe
    const relato = await db
      .prepare(
        'SELECT id, efetividade_cognitiva FROM sgso_relatos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .first<{ id: string; efetividade_cognitiva: number | null }>();
    if (!relato) {
      return c.json(
        { success: false, error: 'Relato não encontrado', code: 'SGSO_RELATO_NOT_FOUND' },
        404,
      );
    }

    // D0: FRMS entra como contexto informativo. Nao altera probabilidade SGSO.
    const probFinal = d.probabilidade;
    const efetividade = relato.efetividade_cognitiva;
    const frmsContextIndicator =
      efetividade === null
        ? null
        : {
            effectiveness_pct: Number(efetividade.toFixed(1)),
            source: 'sgso_relatos.efetividade_cognitiva',
            interpretation:
              'Indicador FRMS estimado usado apenas como contexto informativo; nao altera probabilidade SGSO automaticamente.',
          };

    const nivelRisco = calcularNivelRisco(probFinal, d.severidade);
    const ts = now();

    const perfil = await db
      .prepare(
        `SELECT id, codigo
         FROM sgso_matriz_risco_perfis
         WHERE ativo = 1 AND (empresa_id = ? OR empresa_id = 0)
           ${d.perfil_id ? 'AND id = ?' : ''}
         ORDER BY CASE WHEN empresa_id = ? THEN 0 ELSE 1 END, padrao DESC, id ASC
         LIMIT 1`,
      )
      .bind(...(d.perfil_id ? [empresaId, d.perfil_id, empresaId] : [empresaId, empresaId]))
      .first<{ id: number; codigo: string }>();

    const celula = perfil
      ? await db
          .prepare(
            `SELECT score, nivel_risco, exige_aprovacao
             FROM sgso_matriz_risco_celulas
             WHERE perfil_id = ? AND codigo_probabilidade = ? AND severidade = ?`,
          )
          .bind(perfil.id, probFinal, d.severidade)
          .first<{ score: number; nivel_risco: string; exige_aprovacao: number }>()
      : null;

    const nivelRiscoFinal = celula?.nivel_risco ?? nivelRisco;

    const result = await db
      .prepare(
        `INSERT INTO sgso_avaliacao_risco
         (relato_id, empresa_id, tipo_avaliacao, probabilidade, severidade, nivel_risco,
          probabilidade_original, elevado_por_fadiga, justificativa_elevacao,
          justificativa, avaliador_id, data_avaliacao, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        empresaId,
        d.tipo_avaliacao,
        probFinal,
        d.severidade,
        nivelRiscoFinal,
        null,
        0,
        null,
        d.justificativa ?? null,
        uid,
        ts,
        ts,
        ts,
      )
      .run();

    if (perfil) {
      await db
        .prepare(
          `INSERT INTO sgso_avaliacao_risco_contexto
           (avaliacao_risco_id, empresa_id, perfil_id, score_calculado, apetite_violado,
            exige_aprovacao, aprovacao_status, snapshot_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          result.meta.last_row_id,
          empresaId,
          perfil.id,
          celula?.score ?? 0,
          nivelRiscoFinal === 'CRITICO' ? 1 : 0,
          celula?.exige_aprovacao ?? 0,
          (celula?.exige_aprovacao ?? 0) === 1 ? 'PENDENTE' : 'NAO_APLICAVEL',
          JSON.stringify({
            perfil_codigo: perfil.codigo,
            probabilidade_original: d.probabilidade,
            probabilidade_final: probFinal,
            severidade: d.severidade,
            nivel_risco: nivelRiscoFinal,
            frms_context_indicator: frmsContextIndicator,
          }),
          ts,
          ts,
        )
        .run();
    }

    return c.json(
      {
        success: true,
        data: {
          id: result.meta.last_row_id,
          nivel_risco: nivelRiscoFinal,
          probabilidade: probFinal,
          elevado_por_fadiga: false,
          justificativa_elevacao: null,
          frms_context_indicator: frmsContextIndicator,
          perfil_id: perfil?.id ?? null,
          exige_aprovacao: (celula?.exige_aprovacao ?? 0) === 1,
        },
      },
      201,
    );
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao salvar avaliação', 'SGSO_AVALIACAO_RISCO_SAVE_ERROR');
  }
});

// ─────────────────────────────────────────────────────────────
// FATORES HUMANOS (HFACS)
// ─────────────────────────────────────────────────────────────

// POST /api/sgso/relatos/:id/fatores-humanos
sgso.post('/relatos/:id/fatores-humanos', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c);
    const db = c.env.DB;
    const { id } = c.req.param();
    const body = await c.req.json();

    const schema = z.object({
      nivel_hfacs: z.enum([
        'ACOES_INSEGURAS',
        'PRECONDICOES',
        'SUPERVISAO',
        'INFLUENCIAS_ORGANIZACIONAIS',
      ]),
      categoria: z.string().min(1),
      subcategoria: z.string().optional(),
      descricao: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }
    const d = parsed.data;

    const relato = await db
      .prepare(
        'SELECT id, efetividade_cognitiva FROM sgso_relatos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .first<{ id: string; efetividade_cognitiva: number | null }>();
    if (!relato) {
      return c.json(
        { success: false, error: 'Relato não encontrado', code: 'SGSO_RELATO_NOT_FOUND' },
        404,
      );
    }

    // Preenchimento automático de efetividade para fator FADIGA
    let efetividadeCapturada: number | null = null;
    let fonteAutomatica = 0;
    if (
      d.nivel_hfacs === 'PRECONDICOES' &&
      d.categoria === 'FADIGA' &&
      relato.efetividade_cognitiva !== null
    ) {
      efetividadeCapturada = relato.efetividade_cognitiva;
      fonteAutomatica = 1;
    }

    const ts = now();
    const result = await db
      .prepare(
        `INSERT INTO sgso_relatos_fatores_humanos
         (relato_id, empresa_id, nivel_hfacs, categoria, subcategoria, descricao,
          efetividade_cognitiva_capturada, fonte_automatica, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        empresaId,
        d.nivel_hfacs,
        d.categoria,
        d.subcategoria ?? null,
        d.descricao ?? null,
        efetividadeCapturada,
        fonteAutomatica,
        uid,
        ts,
        ts,
      )
      .run();

    return c.json({ success: true, data: { id: result.meta.last_row_id } }, 201);
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao salvar fator humano', 'SGSO_FATOR_HUMANO_SAVE_ERROR');
  }
});

// GET /api/sgso/fatores-humanos/categorias
sgso.get('/fatores-humanos/categorias', (c) => {
  const taxonomia = {
    ACOES_INSEGURAS: [
      { codigo: 'ERRO_HABILIDADE', nome: 'Erro de Habilidade' },
      { codigo: 'ERRO_DECISAO', nome: 'Erro de Decisão' },
      { codigo: 'ERRO_PERCEPTIVO', nome: 'Erro Perceptivo' },
      { codigo: 'VIOLACAO_ROTINEIRA', nome: 'Violação Rotineira' },
      { codigo: 'VIOLACAO_EXCEPCIONAL', nome: 'Violação Excepcional' },
    ],
    PRECONDICOES: [
      { codigo: 'FATOR_AMBIENTAL_FISICO', nome: 'Fator Ambiental Físico' },
      { codigo: 'FATOR_AMBIENTAL_TECNOLOGICO', nome: 'Fator Ambiental Tecnológico' },
      { codigo: 'FADIGA', nome: 'Fadiga' },
      { codigo: 'DOENCA', nome: 'Doença / Condição Médica' },
      { codigo: 'ESTRESSE', nome: 'Estresse' },
      { codigo: 'REDUCAO_ATENCAO', nome: 'Redução de Atenção / Complacência' },
      { codigo: 'PRATICA_EQUIPE_CRM', nome: 'Prática de Equipe / CRM' },
      { codigo: 'PRATICA_BRIEFING', nome: 'Prática de Briefing/Planejamento' },
    ],
    SUPERVISAO: [
      { codigo: 'SUPERVISAO_INADEQUADA', nome: 'Supervisão Inadequada' },
      { codigo: 'FALHA_PLANEJAMENTO', nome: 'Falha no Planejamento de Operações' },
      { codigo: 'NAO_CORRECAO_PROBLEMA', nome: 'Falha na Correção de Problema Conhecido' },
      { codigo: 'VIOLACAO_SUPERVISORA', nome: 'Violação Supervisora' },
    ],
    INFLUENCIAS_ORGANIZACIONAIS: [
      { codigo: 'GESTAO_RECURSOS', nome: 'Gestão de Recursos' },
      { codigo: 'CLIMA_ORGANIZACIONAL', nome: 'Clima Organizacional' },
      { codigo: 'PROCESSO_ORGANIZACIONAL', nome: 'Processo Organizacional' },
    ],
  };
  return c.json({ success: true, data: taxonomia });
});

// ─────────────────────────────────────────────────────────────
// AÇÕES DE MITIGAÇÃO (CAPA)
// ─────────────────────────────────────────────────────────────

// POST /api/sgso/relatos/:id/acoes
sgso.post('/relatos/:id/acoes', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c);
    const db = c.env.DB;
    const { id } = c.req.param();
    const body = await c.req.json();

    const schema = z.object({
      tipo: z.enum(['CORRETIVA', 'PREVENTIVA']),
      descricao: z.string().min(5),
      categoria: z
        .enum(['TREINAMENTO', 'PROCEDIMENTO', 'EQUIPAMENTO', 'SUPERVISAO', 'COMUNICACAO', 'OUTRO'])
        .optional(),
      responsavel_id: z.number().int(),
      prazo: z.string(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }
    const d = parsed.data;

    const relato = await db
      .prepare('SELECT id FROM sgso_relatos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(id, empresaId)
      .first<{ id: string }>();
    if (!relato) {
      return c.json(
        { success: false, error: 'Relato não encontrado', code: 'SGSO_RELATO_NOT_FOUND' },
        404,
      );
    }

    const ts = now();
    const result = await db
      .prepare(
        `INSERT INTO sgso_acoes_mitigacao
         (empresa_id, relato_id, tipo, descricao, categoria, responsavel_id, prazo, status, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,'PENDENTE',?,?,?)`,
      )
      .bind(
        empresaId,
        id,
        d.tipo,
        d.descricao,
        d.categoria ?? null,
        d.responsavel_id,
        d.prazo,
        uid,
        ts,
        ts,
      )
      .run();

    // Atualizar status do relato para AGUARDANDO_ACAO se estava EM_ANALISE
    await db
      .prepare(
        `UPDATE sgso_relatos SET status = 'AGUARDANDO_ACAO', updated_at = ?
         WHERE id = ? AND empresa_id = ? AND status = 'EM_ANALISE'`,
      )
      .bind(ts, id, empresaId)
      .run();

    return c.json({ success: true, data: { id: result.meta.last_row_id } }, 201);
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao criar ação CAPA', 'SGSO_ACAO_CREATE_ERROR');
  }
});

// PATCH /api/sgso/acoes/:id
sgso.patch('/acoes/:id', requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c);
    const db = c.env.DB;
    const { id } = c.req.param();
    const body = await c.req.json();

    const schema = z.object({
      status: z.enum(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']).optional(),
      percentual_conclusao: z.number().int().min(0).max(100).optional(),
      evidencia_descricao: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: 'Dados inválidos' }, 400);
    }
    const d = parsed.data;

    const ts = now();
    const sets: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [ts];

    if (d.status) {
      sets.push('status = ?');
      params.push(d.status);
    }
    if (d.percentual_conclusao !== undefined) {
      sets.push('percentual_conclusao = ?');
      params.push(d.percentual_conclusao);
    }
    if (d.evidencia_descricao) {
      sets.push('evidencia_descricao = ?');
      params.push(d.evidencia_descricao);
    }
    if (d.status === 'CONCLUIDA') {
      sets.push('data_conclusao = ?', 'concluida_por = ?');
      params.push(ts, uid);
    }

    params.push(parseInt(id), empresaId);
    await db
      .prepare(`UPDATE sgso_acoes_mitigacao SET ${sets.join(', ')} WHERE id = ? AND empresa_id = ?`)
      .bind(...params)
      .run();

    return c.json({ success: true });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao atualizar ação', 'SGSO_ACAO_UPDATE_ERROR');
  }
});

// ─────────────────────────────────────────────────────────────
// COMENTÁRIOS GSO
// ─────────────────────────────────────────────────────────────

// POST /api/sgso/relatos/:id/comentarios
sgso.post('/relatos/:id/comentarios', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const uid = getUid(c);
    const db = c.env.DB;
    const { id } = c.req.param();
    const { texto } = await c.req.json();

    if (!texto || texto.trim().length < 2) {
      return c.json(
        { success: false, error: 'Comentário muito curto', code: 'SGSO_COMMENT_TOO_SHORT' },
        400,
      );
    }

    const relato = await db
      .prepare('SELECT id FROM sgso_relatos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(id, empresaId)
      .first<{ id: string }>();
    if (!relato) {
      return c.json(
        { success: false, error: 'Relato não encontrado', code: 'SGSO_RELATO_NOT_FOUND' },
        404,
      );
    }

    const ts = now();
    const result = await db
      .prepare(
        `INSERT INTO sgso_relatos_comentarios (relato_id, empresa_id, texto, interno, autor_id, created_at)
         VALUES (?,?,?,1,?,?)`,
      )
      .bind(id, empresaId, texto.trim(), uid, ts)
      .run();

    return c.json({ success: true, data: { id: result.meta.last_row_id } }, 201);
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao salvar comentário', 'SGSO_COMMENT_SAVE_ERROR');
  }
});

export default sgso;