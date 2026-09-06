/*
 * Legacy containment: this pre-existing route still carries explicit-any and unused
 * compatibility helpers. The reliability hotfix changes only atomic compensation;
 * remove this scoped suppression when the route is decomposed.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * SIMULADORES — Sessões e Agendamentos
 * Routes: GET /agendamentos, GET /instrutores,
 *         GET /sessoes, POST /sessoes, GET /sessoes/:id, PUT /sessoes/:id, DELETE /sessoes/:id,
 *         GET /sessoes/:id/fichas, GET /sessoes/:id/participantes, POST /sessoes/:id/participantes,
 *         PUT /participantes/:id, DELETE /participantes/:id,
 *         GET /sessoes/:id/checks
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { getEmployeeSectorAccess } from '../services/employee-sector-access';
import { publishDomainEvent } from '../shared/domainEvents';
import { removeManagedEscalaEvents } from '../shared/syncEscalaEventosExternos';
import { cleanupFailedSharedCreate } from './simuladores-shared-session-cancellation';
import {
  requireAdminForDelete,
  timeToMinutes,
  syncSessaoEscalaEventos,
  findSessaoConflict,
  audit,
  filtrarChecksCompativeisComModelo,
  getSimuladorModeloAeronave,
  listarTiposCheckPorIds,
  normalizeModeloAeronave,
  isFullAccessRole,
  resolveTemplateIdSessao,
  normalizeChecksSessao,
  getFuncId,
  criarQualificacoesPlanejadas,
  instrutorEstaEntreParticipantes,
} from './simuladores-shared';
import participantesRoutes from './simuladores-sessoes-participantes';
import sessoesUpdateRoutes from './simuladores-sessoes-update';
import { sendWhatsAppMessage } from '../utils/whatsapp-send';
import { normalizeWhatsAppPhone } from '../utils/whatsapp';
import { sendSimulatorSessionEmailNotifications } from '../services/simuladores-session-notifications';
import { buildOperationalFichaManobras, type FichaManobraBase } from '../constants/notechs';
import {
  assertFuncionarioIdsWithinOperationalScope,
  normalizeTenantRole,
} from '../services/operational-domain-access';
import {
  requireOperacoesSessao,
  buildOperationalSessaoReadFilter,
  narrowSetorIdsForOperationalDomain,
} from './simuladores-sessoes-rbac';

const app = new Hono<{ Bindings: Env }>();
// Todos os endpoints de sessões requerem autenticação
app.use('*', auth());

function parseLimit(raw: string | undefined, defaultValue: number, maxValue: number): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}

function parseOffset(raw: string | undefined): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function uniquePositiveIds(values: unknown[]): number[] {
  return Array.from(
    new Set(
      values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
}

async function getAllowedFuncionariosBySetorScope(
  db: D1Database,
  empresaId: number,
  funcionarioIds: number[],
  setorIds: number[],
): Promise<Set<number>> {
  const ids = uniquePositiveIds(funcionarioIds);
  if (ids.length === 0 || setorIds.length === 0) {
    return new Set<number>();
  }

  try {
    const rows = await db
      .prepare(
        `SELECT id, setor_id
           FROM funcionarios
          WHERE id IN (${ids.map(() => '?').join(',')})
            AND empresa_id = ?
            AND deleted_at IS NULL`,
      )
      .bind(...ids, empresaId)
      .all<{ id: number; setor_id?: number | null }>();

    const allowedSetores = new Set(
      setorIds.filter((setorId) => Number.isInteger(setorId) && setorId > 0),
    );

    return new Set(
      (rows.results || [])
        .filter((row) => allowedSetores.has(Number(row.setor_id || 0)))
        .map((row) => Number(row.id))
        .filter((id) => Number.isInteger(id) && id > 0),
    );
  } catch (error) {
    if (String(error).toLowerCase().includes('setor_id')) {
      return new Set<number>();
    }
    throw error;
  }
}

async function areFuncionariosInsideSetorScope(
  db: D1Database,
  empresaId: number,
  funcionarioIds: number[],
  setorIds: number[],
): Promise<boolean> {
  const ids = uniquePositiveIds(funcionarioIds);
  if (ids.length === 0) {
    return false;
  }

  const allowed = await getAllowedFuncionariosBySetorScope(db, empresaId, ids, setorIds);
  return ids.every((id) => allowed.has(id));
}

async function resolveSessaoReadAccess(
  c: any,
  empresaId: number,
  sessao: { instrutor_id?: unknown; examinador_id?: unknown },
  linkedFuncionarioIds: number[],
): Promise<{ actorFuncionarioId: number | null; canViewAllRelatedData: boolean } | null> {
  const access = await getEmployeeSectorAccess(c, empresaId);
  if (access.mode === 'all') {
    return { actorFuncionarioId: null, canViewAllRelatedData: true };
  }

  if (access.mode === 'restricted') {
    const ctxForRole = c as { get: (k: string) => unknown };
    const role = String(ctxForRole.get('userRole') || '');
    const effectiveSetorIds = await narrowSetorIdsForOperationalDomain({
      db: c.env.DB,
      empresaId,
      userId: Number(ctxForRole.get('userId') || 0),
      role,
      legacySetorIds: access.setorIds,
    });
    const inScope = await areFuncionariosInsideSetorScope(
      c.env.DB,
      empresaId,
      linkedFuncionarioIds,
      effectiveSetorIds,
    );
    return inScope ? { actorFuncionarioId: null, canViewAllRelatedData: true } : null;
  }

  const ctx = c as unknown as { get: (k: string) => unknown };
  const userId = String(ctx.get('userId') || '');
  const funcId = Number(await getFuncId(c.env.DB, userId, empresaId));
  if (!Number.isInteger(funcId) || funcId <= 0) {
    return null;
  }

  const linkedIds = new Set(uniquePositiveIds(linkedFuncionarioIds));
  if (!linkedIds.has(funcId)) {
    return null;
  }

  const canViewAllRelatedData =
    Number(sessao.instrutor_id || 0) === funcId || Number(sessao.examinador_id || 0) === funcId;

  return {
    actorFuncionarioId: funcId,
    canViewAllRelatedData,
  };
}

function buildWhatsAppManualLink(telefone: string, mensagem?: string): string {
  const normalized = normalizeWhatsAppPhone(telefone);
  const baseUrl = `https://wa.me/${normalized.e164.replace(/\D/g, '')}`;

  if (!mensagem?.trim()) {
    return baseUrl;
  }

  return `${baseUrl}?text=${encodeURIComponent(mensagem)}`;
}

async function getSimuladorAgendamentosSchema(
  db: D1Database,
): Promise<{ hasTipoDispositivo: boolean; hasAeronaveId: boolean; hasModoCompartilhado: boolean }> {
  const colInfo = await db.prepare('PRAGMA table_info(simulador_agendamentos)').bind().all();
  const colNames = new Set((colInfo.results || []).map((row: any) => row.name));

  return {
    hasTipoDispositivo: colNames.has('tipo_dispositivo'),
    hasAeronaveId: colNames.has('aeronave_id'),
    hasModoCompartilhado: colNames.has('modo_compartilhado'),
  };
}

async function enviarEmailSessao(
  env: Env,
  destinatarios: string[],
  assunto: string,
  corpoTexto: string,
  corpoHtml: string,
): Promise<{ messageId: string | null; provider: 'brevo' }> {
  if (!env.BREVO_API_KEY) {
    throw new Error('EMAIL_NOT_CONFIGURED');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: env.BREVO_FROM_EMAIL || 'treinamento@airtrust.online',
        name: env.BREVO_FROM_NAME || 'Treinamento AirTrust',
      },
      to: destinatarios.map((email) => ({ email })),
      subject: assunto,
      textContent: corpoTexto,
      htmlContent: corpoHtml,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BREVO_ERROR: ${response.status} - ${errorText}`);
  }

  const payload = (await response.json().catch(() => null)) as { messageId?: string } | null;
  return { messageId: payload?.messageId || null, provider: 'brevo' };
}

// ==========================================================================
// AGENDAMENTOS E INSTRUTORES (para Calendário)
// ==========================================================================

// GET /api/simuladores/agendamentos - Listar agendamentos
app.get('/agendamentos', async (c) => {
  try {
    const dataInicio = c.req.query('data_inicio');
    const dataFim = c.req.query('data_fim');
    const limit = parseLimit(c.req.query('limit'), 100, 200);
    const offset = parseOffset(c.req.query('offset'));
    const ctx = c as unknown as { get: (k: string) => unknown };
    const userId = String(ctx.get('userId') || '');
    const role = String(ctx.get('userRole') || '');
    const empresaId = ctx.get('empresaId') as number | undefined;

    let query = `
      SELECT 
        sa.id,
        sa.template_id,
        sa.data,
        sa.hora_inicio,
        sa.hora_fim,
        sa.tipo_sessao,
        sa.nome as tema_sessao,
        sa.observacoes,
        sa.status,
        s.id as simulador_id,
        s.nome as simulador_nome,
        s.modelo as simulador_modelo,
        f.id as instrutor_id,
        f.nome as instrutor_nome,
        f.codigo_anac as instrutor_codigo_anac,
        sa.examinador_id,
        exam.nome as examinador_nome,
        COALESCE(
          json_group_array(
            json_object(
              'id', sp.funcionario_id,
              'nome', pf.nome,
              'funcao', sp.funcao
            )
          ) FILTER (WHERE sp.funcionario_id IS NOT NULL),
          '[]'
        ) as participantes
      FROM simulador_agendamentos sa
      LEFT JOIN simuladores s ON sa.simulador_id = s.id
      LEFT JOIN funcionarios f ON sa.instrutor_id = f.id AND f.empresa_id = sa.empresa_id AND f.deleted_at IS NULL
      LEFT JOIN funcionarios exam ON sa.examinador_id = exam.id AND exam.empresa_id = sa.empresa_id AND exam.deleted_at IS NULL
      LEFT JOIN sessoes_participantes sp ON sa.id = sp.sessao_id AND sp.deleted_at IS NULL
      LEFT JOIN funcionarios pf ON sp.funcionario_id = pf.id AND pf.empresa_id = sa.empresa_id AND pf.deleted_at IS NULL
      WHERE sa.deleted_at IS NULL
    `;

    const params: any[] = [];
    if (dataInicio) {
      query += ' AND sa.data >= ?';
      params.push(dataInicio);
    }
    if (dataFim) {
      query += ' AND sa.data <= ?';
      params.push(dataFim);
    }
    // H-1: filtrar por empresa
    if (empresaId) {
      query += ' AND sa.empresa_id = ?';
      params.push(empresaId);
    }

    // Item 1: narrows a gestor's list to sessões with a participant in scope.
    if (empresaId) {
      const opFilter = await buildOperationalSessaoReadFilter({
        db: c.env.DB,
        empresaId: Number(empresaId),
        userId: Number(userId),
        role,
      });
      if (opFilter.blocked) return c.json({ success: true, data: [] });
      query += opFilter.clause;
      params.push(...opFilter.bindings);
    }

    // ── Filtro por perfil ─────────────────────────────────────────────────────
    if (!isFullAccessRole(role)) {
      const funcId = await getFuncId(c.env.DB, userId, String(empresaId ?? ''));
      if (!funcId) {
        // Sem vínculo funcional → retorna vazio
        return c.json({ success: true, data: [] });
      }
      const roleUpper = role.toUpperCase();
      if (roleUpper === 'INSTRUTOR' || roleUpper === 'INSTRUCTOR') {
        // Instrutor pode ser também aluno — vê sessões onde é instrutor OU participante
        query +=
          ' AND (sa.instrutor_id = ? OR EXISTS (SELECT 1 FROM sessoes_participantes sp2 WHERE sp2.sessao_id = sa.id AND sp2.funcionario_id = ? AND sp2.deleted_at IS NULL))';
        params.push(funcId, funcId);
      } else if (roleUpper === 'ALUNO' || roleUpper === 'USUARIO' || roleUpper === 'STUDENT') {
        // Aluno vê apenas sessões onde é participante
        query +=
          ' AND EXISTS (SELECT 1 FROM sessoes_participantes sp2 WHERE sp2.sessao_id = sa.id AND sp2.funcionario_id = ? AND sp2.deleted_at IS NULL)';
        params.push(funcId);
      } else {
        return c.json({ success: true, data: [] });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    query += ' GROUP BY sa.id ORDER BY sa.data, sa.hora_inicio LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await c.env.DB.prepare(query)
      .bind(...params)
      .all();

    // Processar resultados para converter participantes JSON em array
    const processedResults = (result.results || []).map((row: any) => ({
      ...row,
      participantes:
        typeof row.participantes === 'string' ? JSON.parse(row.participantes) : row.participantes,
    }));

    return c.json({
      success: true,
      data: processedResults,
      pagination: {
        limit,
        offset,
        count: processedResults.length,
        hasMore: processedResults.length === limit,
      },
    });
  } catch (e: any) {
    console.error('[AGENDAMENTOS] Erro:', e);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// GET /api/simuladores/instrutores - Listar instrutores
app.get('/instrutores', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const limit = parseLimit(c.req.query('limit'), 100, 200);
    const offset = parseOffset(c.req.query('offset'));

    const result = await c.env.DB.prepare(
      `SELECT 
        id, 
        nome,
        codigo_anac,
        matricula
      FROM funcionarios 
      WHERE deleted_at IS NULL 
        AND ativo = 1
        AND is_instrutor = 1
        AND empresa_id = ?
      ORDER BY nome
      LIMIT ?
      OFFSET ?`,
    )
      .bind(empresaId, limit, offset)
      .all();

    const rows = result.results || [];
    return c.json({
      success: true,
      data: rows,
      pagination: {
        limit,
        offset,
        count: rows.length,
        hasMore: rows.length === limit,
      },
    });
  } catch (e: any) {
    console.error('[INSTRUTORES] Erro:', e);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ==========================================================================
// SESSÕES - Listar e criar
// ==========================================================================

app.get('/sessoes', async (c) => {
  try {
    const dataInicio = c.req.query('data_inicio');
    const dataFim = c.req.query('data_fim');
    const statusParam = c.req.query('status');
    const orderParam = String(c.req.query('order') || '').toLowerCase();
    const orderDirection = orderParam === 'asc' ? 'ASC' : 'DESC';
    const viewMode = c.req.query('view');
    const isSummaryView = viewMode === 'summary';
    const ctx = c as unknown as { get: (k: string) => unknown };
    const userId = String(ctx.get('userId') || '');
    const role = String(ctx.get('userRole') || '');
    const empresaId = ctx.get('empresaId') as number | undefined;
    const defaultLimit = !isFullAccessRole(role) ? 500 : 100;
    const maxLimit = !isFullAccessRole(role) ? 500 : 200;
    const limit = parseLimit(c.req.query('limit'), defaultLimit, maxLimit);
    const offset = parseOffset(c.req.query('offset'));
    const { hasTipoDispositivo, hasAeronaveId, hasModoCompartilhado } =
      await getSimuladorAgendamentosSchema(c.env.DB);

    const tipoDispo = c.req.query('tipo_dispositivo'); // SIMULADOR | AERONAVE
    const tipoDispositivoSelect = hasTipoDispositivo
      ? "COALESCE(sa.tipo_dispositivo, 'SIMULADOR') as tipo_dispositivo,"
      : 'NULL as tipo_dispositivo,';
    const aeronaveSelect = hasAeronaveId
      ? `sa.aeronave_id,
        ae.prefixo as aeronave_prefixo,
        ae.modelo as aeronave_modelo,`
      : `NULL as aeronave_id,
        NULL as aeronave_prefixo,
        NULL as aeronave_modelo,`;
    const modoCompartilhadoSelect = hasModoCompartilhado
      ? 'sa.modo_compartilhado,'
      : 'NULL as modo_compartilhado,';
    const aeronaveJoin = hasAeronaveId
      ? 'LEFT JOIN aeronaves ae ON sa.aeronave_id = ae.id AND ae.deleted_at IS NULL'
      : '';

    // Modo default mantém payload completo (participantes + fichas) para compatibilidade.
    // Modo summary evita agregações JSON pesadas para leitura mais leve.
    let query = isSummaryView
      ? `
      SELECT
        sa.id,
        sa.uuid,
        sa.simulador_id,
        sa.template_id,
        s.nome as simulador_nome,
        s.modelo as simulador_modelo,
        s.tipo as simulador_tipo,
        ${tipoDispositivoSelect}
        ${aeronaveSelect}
        sa.data,
        sa.hora_inicio as horario_inicio,
        sa.hora_fim as horario_fim,
        sa.duracao_minutos,
        sa.instrutor_id,
        fi.nome as instrutor_nome,
        sa.examinador_id,
        fe.nome as examinador_nome,
        sa.tipo_sessao,
        sa.nome as tema_sessao,
        sa.status,
        ${modoCompartilhadoSelect}
        sa.observacoes,
        sa.created_at,
        sa.updated_at,
        ms.tipo_sessao_id as tipo_sessao_id,
        ts_ref.codigo as tipo_sessao_codigo
      FROM simulador_agendamentos sa
      LEFT JOIN simuladores s ON sa.simulador_id = s.id AND s.deleted_at IS NULL
      ${aeronaveJoin}
      LEFT JOIN modelos_sessao ms
        ON sa.template_id = ms.id
       AND ms.deleted_at IS NULL
       AND ms.empresa_id = sa.empresa_id
      LEFT JOIN tipos_sessao ts_ref
        ON ms.tipo_sessao_id = ts_ref.id
       AND ts_ref.deleted_at IS NULL
       AND ts_ref.empresa_id = sa.empresa_id
      INNER JOIN funcionarios fi ON sa.instrutor_id = fi.id AND fi.empresa_id = sa.empresa_id AND fi.deleted_at IS NULL
      LEFT JOIN funcionarios fe ON sa.examinador_id = fe.id AND fe.empresa_id = sa.empresa_id AND fe.deleted_at IS NULL
      WHERE sa.deleted_at IS NULL
    `
      : `
      SELECT
        sa.id,
        sa.uuid,
        sa.simulador_id,
        sa.template_id,
        s.nome as simulador_nome,
        s.modelo as simulador_modelo,
        s.tipo as simulador_tipo,
        ${tipoDispositivoSelect}
        ${aeronaveSelect}
        sa.data,
        sa.hora_inicio as horario_inicio,
        sa.hora_fim as horario_fim,
        sa.duracao_minutos,
        sa.instrutor_id,
        fi.nome as instrutor_nome,
        sa.examinador_id,
        fe.nome as examinador_nome,
        sa.tipo_sessao,
        sa.nome as tema_sessao,
        sa.status,
        ${modoCompartilhadoSelect}
        sa.observacoes,
        sa.created_at,
        sa.updated_at,
        ms.tipo_sessao_id as tipo_sessao_id,
        ts_ref.codigo as tipo_sessao_codigo,
        -- PARTICIPANTES em JSON (evita N+1)
        COALESCE(
          json_group_array(
            DISTINCT json_object(
              'id', sp.id,
              'funcionario_id', sp.funcionario_id,
              'funcionario_nome', f_part.nome,
              'funcionario_matricula', f_part.matricula,
              'funcionario_codigo_anac', f_part.codigo_anac,
              'funcao', sp.funcao
            )
          ) FILTER (WHERE sp.id IS NOT NULL),
          '[]'
        ) as participantes_json,
        -- FICHAS em JSON (evita N+1)
        COALESCE(
          json_group_array(
            DISTINCT json_object(
              'id', fs.id,
              'status', fs.status,
              'funcionario_nome', f_ficha.nome,
              'funcionario_matricula', f_ficha.matricula
            )
          ) FILTER (WHERE fs.id IS NOT NULL),
          '[]'
        ) as fichas_json
      FROM simulador_agendamentos sa
      LEFT JOIN simuladores s ON sa.simulador_id = s.id AND s.deleted_at IS NULL
      ${aeronaveJoin}
      LEFT JOIN modelos_sessao ms
        ON sa.template_id = ms.id
       AND ms.deleted_at IS NULL
       AND ms.empresa_id = sa.empresa_id
      LEFT JOIN tipos_sessao ts_ref
        ON ms.tipo_sessao_id = ts_ref.id
       AND ts_ref.deleted_at IS NULL
       AND ts_ref.empresa_id = sa.empresa_id
      INNER JOIN funcionarios fi ON sa.instrutor_id = fi.id AND fi.empresa_id = sa.empresa_id AND fi.deleted_at IS NULL
      LEFT JOIN funcionarios fe ON sa.examinador_id = fe.id AND fe.empresa_id = sa.empresa_id AND fe.deleted_at IS NULL
      -- LEFT JOIN participantes
      LEFT JOIN sessoes_participantes sp ON sa.id = sp.sessao_id AND sp.deleted_at IS NULL
      LEFT JOIN funcionarios f_part ON sp.funcionario_id = f_part.id AND f_part.empresa_id = sa.empresa_id AND f_part.deleted_at IS NULL
      -- LEFT JOIN fichas
      LEFT JOIN fichas_sessao fs ON sa.id = fs.agendamento_slot_id AND fs.empresa_id = sa.empresa_id AND fs.deleted_at IS NULL
      LEFT JOIN funcionarios f_ficha ON fs.colaborador_id_aluno = f_ficha.id AND f_ficha.empresa_id = sa.empresa_id AND f_ficha.deleted_at IS NULL
      WHERE sa.deleted_at IS NULL
    `;

    const params: any[] = [];
    if (dataInicio) {
      query += ' AND sa.data >= ?';
      params.push(dataInicio);
    }
    if (dataFim) {
      query += ' AND sa.data <= ?';
      params.push(dataFim);
    }
    const normalizedStatusList = String(statusParam || '')
      .split(',')
      .map((status) => status.trim().toUpperCase())
      .filter((status) => /^[A-Z_]+$/.test(status));
    if (normalizedStatusList.length > 0) {
      query += ` AND UPPER(COALESCE(sa.status, '')) IN (${normalizedStatusList.map(() => '?').join(',')})`;
      params.push(...normalizedStatusList);
    }
    if (
      hasTipoDispositivo &&
      tipoDispo &&
      (tipoDispo === 'SIMULADOR' || tipoDispo === 'AERONAVE')
    ) {
      query += " AND COALESCE(sa.tipo_dispositivo, 'SIMULADOR') = ?";
      params.push(tipoDispo);
    }
    if (empresaId) {
      query += ' AND sa.empresa_id = ?';
      params.push(empresaId);
    }

    // Item 1: same restriction as the full mode, for summary mode.
    if (empresaId) {
      const opFilter = await buildOperationalSessaoReadFilter({
        db: c.env.DB,
        empresaId: Number(empresaId),
        userId: Number(userId),
        role,
      });
      if (opFilter.blocked) return c.json({ success: true, data: [] });
      query += opFilter.clause;
      params.push(...opFilter.bindings);
    }

    // ── Filtro por perfil ─────────────────────────────────────────────────────
    if (!isFullAccessRole(role)) {
      const funcId = await getFuncId(c.env.DB, userId, String(empresaId ?? ''));
      if (!funcId) return c.json({ success: true, data: [] });

      const roleUpper = role.toUpperCase();
      if (roleUpper === 'INSTRUTOR' || roleUpper === 'INSTRUCTOR') {
        query +=
          ' AND (sa.instrutor_id = ? OR EXISTS (SELECT 1 FROM sessoes_participantes sp3 WHERE sp3.sessao_id = sa.id AND sp3.funcionario_id = ? AND sp3.deleted_at IS NULL))';
        params.push(funcId, funcId);
      } else if (roleUpper === 'ALUNO' || roleUpper === 'USUARIO' || roleUpper === 'STUDENT') {
        query +=
          ' AND EXISTS (SELECT 1 FROM sessoes_participantes sp3 WHERE sp3.sessao_id = sa.id AND sp3.funcionario_id = ? AND sp3.deleted_at IS NULL)';
        params.push(funcId);
      } else {
        return c.json({ success: true, data: [] });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    query += isSummaryView
      ? ` ORDER BY sa.data ${orderDirection}, sa.hora_inicio ${orderDirection} LIMIT ? OFFSET ?`
      : ` GROUP BY sa.id ORDER BY sa.data ${orderDirection}, sa.hora_inicio ${orderDirection} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const sessoes = await c.env.DB.prepare(query)
      .bind(...params)
      .all();

    const sessoesCompletas = isSummaryView
      ? (sessoes.results || []).map((sessao: any) => ({
          ...sessao,
          participantes: [],
          fichas: [],
        }))
      : (sessoes.results || []).map((sessao: any) => {
          const participantes = sessao.participantes_json
            ? typeof sessao.participantes_json === 'string'
              ? JSON.parse(sessao.participantes_json)
              : sessao.participantes_json
            : [];

          const fichas = sessao.fichas_json
            ? typeof sessao.fichas_json === 'string'
              ? JSON.parse(sessao.fichas_json)
              : sessao.fichas_json
            : [];

          // Remover campos JSON temporários
          const { participantes_json, fichas_json, ...sessaoLimpa } = sessao;

          return {
            ...sessaoLimpa,
            participantes,
            fichas,
          };
        });

    return c.json({
      success: true,
      data: sessoesCompletas,
      pagination: {
        limit,
        offset,
        count: sessoesCompletas.length,
        hasMore: sessoesCompletas.length === limit,
      },
    });
  } catch (e: any) {
    console.error('[SESSOES] Erro:', e);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

/**
 * POST /api/simuladores/sessoes
 * Criar nova sessão com participantes e fichas automáticas
 * Versão 2.0 - Com auto-população de manobras
 */
app.post('/sessoes', requireOperacoesSessao('create'), async (c) => {
  let createdSessaoId: number | null = null;
  try {
    const { empresaId } = getTenantContext(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const b = await c.req.json();
    const {
      simulador_id,
      aeronave_id,
      tipo_dispositivo: tipoDispositivoBody,
      template_id,
      modelo_sessao_id,
      data,
      horario_inicio,
      horario_fim,
      duracao_minutos,
      instrutor_id,
      tipo_sessao,
      tipo_aeronave,
      tema_sessao,
      observacoes,
      participantes, // [{ funcionario_id, funcao }]
      examinador_id, // NOVO: ID do examinador (opcional)
      checks, // NOVO: [qualificacao_tipo_id] (qualificacoes_tipos.id) array de checks (só se examinador_id estiver presente)
    } = b;

    // Normalizar tipo_dispositivo: SIMULADOR (default) | AERONAVE
    const tipoDispositivo: 'SIMULADOR' | 'AERONAVE' =
      tipoDispositivoBody === 'AERONAVE' ? 'AERONAVE' : 'SIMULADOR';

    const modeloAeronaveSessao =
      normalizeModeloAeronave(tipo_aeronave) ||
      (await getSimuladorModeloAeronave(c.env.DB, simulador_id));
    const templateIdFinal = await resolveTemplateIdSessao(c.env.DB, {
      empresaId,
      templateId: template_id,
      modeloSessaoId: modelo_sessao_id,
      temaSessao: tema_sessao,
      tipoSessaoCodigo: tipo_sessao,
      modeloAeronave: modeloAeronaveSessao,
    });
    let checksNormalizados: number[] = [];
    try {
      checksNormalizados = await normalizeChecksSessao(
        c.env.DB,
        checks,
        modeloAeronaveSessao,
        empresaId,
      );
    } catch (error: any) {
      return c.json({ success: false, error: 'Checks inválidos' }, 400);
    }

    // Validações por tipo_dispositivo
    if (tipoDispositivo === 'SIMULADOR' && !simulador_id) {
      return c.json(
        { success: false, error: 'simulador_id é obrigatório para sessões de Simulador' },
        400,
      );
    }
    if (tipoDispositivo === 'AERONAVE' && !aeronave_id) {
      return c.json(
        { success: false, error: 'aeronave_id é obrigatório para sessões de Aeronave' },
        400,
      );
    }

    if (!data || !instrutor_id || !tipo_sessao) {
      return c.json({ success: false, error: 'Campos obrigatórios faltando' }, 400);
    }

    if (!participantes || participantes.length === 0) {
      return c.json({ success: false, error: 'Adicione pelo menos 1 participante' }, 400);
    }

    // ── Bloqueio de autoavaliação: instrutor não pode ser participante ──────
    if (instrutorEstaEntreParticipantes(instrutor_id, participantes)) {
      return c.json(
        {
          success: false,
          error: 'O instrutor da sessão não pode constar como participante avaliado',
        },
        400,
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const funcionarioIdsSessao = Array.from(
      new Set(
        [
          instrutor_id,
          examinador_id,
          ...participantes.map((part: { funcionario_id?: unknown }) => part?.funcionario_id),
        ]
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0),
      ),
    );
    if (funcionarioIdsSessao.length === 0) {
      return c.json({ success: false, error: 'Funcionários inválidos' }, 400);
    }

    const funcionariosValidos = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT id) AS total
         FROM funcionarios
        WHERE id IN (${funcionarioIdsSessao.map(() => '?').join(',')})
          AND empresa_id = ?
          AND deleted_at IS NULL`,
    )
      .bind(...funcionarioIdsSessao, empresaId)
      .first<{ total: number }>();

    if (Number(funcionariosValidos?.total || 0) !== funcionarioIdsSessao.length) {
      return c.json(
        { success: false, error: 'Instrutor, examinador ou participante fora do tenant' },
        400,
      );
    }

    // Item 5: validate every new participante's setor (not instrutor_id/examinador_id).
    await assertFuncionarioIdsWithinOperationalScope({
      db: c.env.DB,
      empresaId,
      userId: Number((c.get as (k: string) => unknown)('userId') || 0),
      userRole: (c.get as (k: string) => unknown)('userRole'),
      funcionarioIds: (participantes as Array<{ funcionario_id?: unknown }>)
        .map((part) => Number(part?.funcionario_id))
        .filter((value) => Number.isFinite(value) && value > 0),
    });

    // ── Guardrail: validar papéis de instrutor e examinador ──────────────────
    // O instrutor deve ter flag is_instrutor. O examinador deve ter flag
    // is_examinador ou is_checador. Isso previne que um examinador seja
    // acidentalmente designado como instrutor da ficha pedagógica.
    const fCols = await c.env.DB.prepare("PRAGMA table_info('funcionarios')").all();
    const fColSet = new Set((fCols.results || []).map((r: any) => r.name));
    const hasIsInstrutor = fColSet.has('is_instrutor');

    if (hasIsInstrutor) {
      const instrutorRow = await c.env.DB.prepare(
        `SELECT COALESCE(is_instrutor, 0) as is_instrutor
         FROM funcionarios
         WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
        .bind(instrutor_id, empresaId)
        .first<{ is_instrutor: number }>();

      if (!instrutorRow || Number(instrutorRow.is_instrutor) !== 1) {
        return c.json(
          {
            success: false,
            error:
              'O funcionário selecionado como instrutor não possui o flag is_instrutor. Selecione um instrutor válido.',
          },
          400,
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (tipoDispositivo === 'SIMULADOR' && simulador_id) {
      // simuladores não possui empresa_id em produção (drift de schema já
      // tratado dinamicamente em simuladores-equipamentos.ts); detectar
      // a coluna em vez de assumir sua existência.
      const simuladoresTableInfo = await c.env.DB.prepare('PRAGMA table_info(simuladores)').all();
      const simuladoresHasEmpresaId = (simuladoresTableInfo.results || []).some(
        (row: any) => String(row.name || '') === 'empresa_id',
      );
      const simulador = await c.env.DB.prepare(
        simuladoresHasEmpresaId
          ? 'SELECT id FROM simuladores WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1'
          : 'SELECT id FROM simuladores WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      )
        .bind(...(simuladoresHasEmpresaId ? [simulador_id, empresaId] : [simulador_id]))
        .first<{ id: number }>();

      if (!simulador?.id) {
        return c.json({ success: false, error: 'Simulador não encontrado' }, 404);
      }
    }

    if (tipoDispositivo === 'AERONAVE' && aeronave_id) {
      const aeronave = await c.env.DB.prepare(
        `SELECT id
           FROM aeronaves
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL
          LIMIT 1`,
      )
        .bind(aeronave_id, empresaId)
        .first<{ id: number }>();

      if (!aeronave?.id) {
        return c.json({ success: false, error: 'Aeronave não encontrada' }, 404);
      }
    }

    if (access.mode === 'restricted') {
      const inScope = await areFuncionariosInsideSetorScope(
        c.env.DB,
        empresaId,
        funcionarioIdsSessao,
        access.setorIds,
      );
      if (!inScope) {
        return c.json(
          {
            success: false,
            error: 'Instrutor, examinador ou participante fora do escopo setorial',
            code: 'FUNCIONARIO_OUT_OF_SCOPE',
          },
          403,
        );
      }
    } else if (access.mode !== 'all') {
      return c.json({ success: false, error: 'Acesso negado', code: 'FORBIDDEN' }, 403);
    }

    // Validação de horário
    if (!horario_inicio || !horario_fim) {
      return c.json({ success: false, error: 'Horário de início e fim são obrigatórios' }, 400);
    }
    const inicioMin = timeToMinutes(horario_inicio);
    const fimMin = timeToMinutes(horario_fim);
    if (inicioMin === null || fimMin === null) {
      return c.json({ success: false, error: 'Horários inválidos (use HH:MM)' }, 400);
    }
    if (fimMin === inicioMin) {
      return c.json(
        { success: false, error: 'Horário final deve ser diferente do horário inicial' },
        400,
      );
    }

    // Verificar conflito de agendamento (apenas para simuladores — aeronaves não têm slot fixo)
    if (tipoDispositivo === 'SIMULADOR' && simulador_id) {
      const conflito = await findSessaoConflict(c.env.DB, {
        simuladorId: Number(simulador_id),
        data,
        inicioMin,
        fimMin,
      });
      if (conflito) {
        const hi =
          typeof conflito.hora_inicio === 'string' ? conflito.hora_inicio.substring(0, 5) : '';
        const hf = typeof conflito.hora_fim === 'string' ? conflito.hora_fim.substring(0, 5) : '';
        return c.json(
          {
            success: false,
            code: 'SCHEDULE_CONFLICT',
            error: `Conflito de agendamento: já existe uma sessão neste simulador de ${hi} a ${hf}. Escolha outro horário.`,
          },
          409,
        );
      }
    }

    // 1. CRIAR SESSÃO
    const uuid = crypto.randomUUID();
    // Usar primeiro participante como funcionario_id (campo legacy obrigatório)
    const funcionario_id_principal = participantes[0].funcionario_id;

    // Determinar se é sessão de check
    const is_check = examinador_id ? 1 : 0;

    // Se for sessão de check, exige ao menos 1 check
    if (is_check && checksNormalizados.length === 0) {
      return c.json(
        { success: false, error: 'Selecione pelo menos 1 check ao informar examinador' },
        400,
      );
    }

    // Validar examinador (se informado)
    if (examinador_id) {
      const fCols = await c.env.DB.prepare("PRAGMA table_info('funcionarios')").all();
      const fColSet = new Set((fCols.results || []).map((r: any) => r.name));
      const hasIsExaminador = fColSet.has('is_examinador');
      const hasIsChecador = fColSet.has('is_checador');
      const examinadorFlagExpr =
        hasIsExaminador && hasIsChecador
          ? '(COALESCE(is_examinador, 0) = 1 OR COALESCE(is_checador, 0) = 1)'
          : hasIsExaminador
            ? 'COALESCE(is_examinador, 0) = 1'
            : hasIsChecador
              ? 'COALESCE(is_checador, 0) = 1'
              : '0 = 1';
      const examinador = await c.env.DB.prepare(
        `SELECT id
         FROM funcionarios
         WHERE id = ?
           AND ${examinadorFlagExpr}
           AND empresa_id = ?
           AND deleted_at IS NULL`,
      )
        .bind(examinador_id, empresaId)
        .first();
      if (!examinador) {
        return c.json({ success: false, error: 'Examinador inválido' }, 400);
      }
    }

    // Verificar se as colunas tipo_dispositivo e aeronave_id já existem (migration 0364)
    const { hasTipoDispositivo, hasAeronaveId } = await getSimuladorAgendamentosSchema(c.env.DB);

    let insertSql: string;
    let insertBinds: any[];

    if (hasTipoDispositivo && hasAeronaveId) {
      insertSql = `INSERT INTO simulador_agendamentos (
        uuid, simulador_id, aeronave_id, funcionario_id, data, hora_inicio, hora_fim, duracao_minutos,
        instrutor_id, examinador_id, is_check, tipo_sessao, tipo_dispositivo, template_id, status, observacoes, nome, empresa_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGENDADO', ?, ?, ?)`;
      insertBinds = [
        uuid,
        simulador_id || null,
        aeronave_id || null,
        funcionario_id_principal,
        data,
        horario_inicio || null,
        horario_fim || null,
        duracao_minutos || 60,
        instrutor_id,
        examinador_id || null,
        is_check,
        tipo_sessao,
        tipoDispositivo,
        templateIdFinal,
        observacoes || null,
        tema_sessao || null,
        empresaId,
      ];
    } else {
      insertSql = `INSERT INTO simulador_agendamentos (
        uuid, simulador_id, funcionario_id, data, hora_inicio, hora_fim, duracao_minutos,
        instrutor_id, examinador_id, is_check, tipo_sessao, template_id, status, observacoes, nome, empresa_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGENDADO', ?, ?, ?)`;
      insertBinds = [
        uuid,
        simulador_id,
        funcionario_id_principal,
        data,
        horario_inicio || null,
        horario_fim || null,
        duracao_minutos || 60,
        instrutor_id,
        examinador_id || null,
        is_check,
        tipo_sessao,
        templateIdFinal,
        observacoes || null,
        tema_sessao || null,
        empresaId,
      ];
    }

    const resultSessao = await c.env.DB.prepare(insertSql)
      .bind(...insertBinds)
      .run();

    const sessao_id = Number(resultSessao.meta.last_row_id);
    createdSessaoId = sessao_id;

    // Se for sessão de check, adicionar os checks selecionados
    if (is_check && checksNormalizados.length > 0) {
      const sessaoCheckStmts = checksNormalizados.map((qualificacao_tipo_id: number) =>
        c.env.DB.prepare(
          `INSERT INTO sessoes_checks (sessao_id, qualificacao_tipo_id, created_at, updated_at)
           VALUES (?, ?, datetime('now'), datetime('now'))`,
        ).bind(sessao_id, qualificacao_tipo_id),
      );
      if (sessaoCheckStmts.length > 0) {
        await c.env.DB.batch(sessaoCheckStmts);
      }

      // FAP13 → ficha especial "CREDENCIAMENTO DE EXAMINADOR"    (avaliado = instrutor da sessão)
      if (instrutor_id) {
        const checkCodResults = await c.env.DB.prepare(
          `SELECT qt.codigo FROM sessoes_checks sc
           JOIN qualificacoes_tipos qt ON sc.qualificacao_tipo_id = qt.id
           WHERE sc.sessao_id = ? AND sc.deleted_at IS NULL`,
        )
          .bind(sessao_id)
          .all();
        const codigos = (checkCodResults.results || []).map((r: any) =>
          String(r.codigo || '').toUpperCase(),
        );
        const fichasEspeciais = [
          {
            modelo: 'CRED-EXA',
            ativo: codigos.some((cod) => cod.startsWith('FAP13')),
          },
        ];

        const tplRes = await c.env.DB.prepare(
          `SELECT id, codigo FROM modelos_sessao
           WHERE codigo IN ('CRED-EXA') AND empresa_id = ? AND deleted_at IS NULL`,
        )
          .bind(empresaId)
          .all();
        const tplMap = new Map(
          (tplRes.results || []).map((r: any) => [String(r.codigo), r.id as number]),
        );

        for (const especial of fichasEspeciais) {
          if (!especial.ativo) continue;
          // Ficha especial CRED-EXA: o instrutor da sessão é o
          // aluno (sendo treinado/credenciado) e o examinador atua como
          // instrutor-avaliador. Esta é a ÚNICA exceção onde examinador_id
          // pode ser usado como instrutor_id em uma ficha.
          await c.env.DB.prepare(
            `INSERT INTO fichas_sessao
               (uuid, agendamento_slot_id, colaborador_id_aluno, instrutor_id,
                tipo_sessao, tipo_aeronave, data_sessao, status, template_id, empresa_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?, ?)`,
          )
            .bind(
              crypto.randomUUID(),
              sessao_id,
              instrutor_id,
              examinador_id || instrutor_id,
              especial.modelo,
              tipo_aeronave || null,
              data,
              tplMap.get(especial.modelo) ?? null,
              empresaId,
            )
            .run();
        }
      }
    }

    // 2. ADICIONAR PARTICIPANTES — H-2: batch INSERT
    const partStmts = participantes.map((part: any, index: number) =>
      c.env.DB.prepare(
        `INSERT INTO sessoes_participantes (uuid, sessao_id, funcionario_id, funcao, status)
         VALUES (?, ?, ?, ?, 'CONFIRMADO')`,
      ).bind(
        crypto.randomUUID(),
        sessao_id,
        part.funcionario_id,
        part.funcao || (index === 0 ? 'PIC' : 'SIC'),
      ),
    );
    if (partStmts.length > 0) {
      await c.env.DB.batch(partStmts);
    }

    await syncSessaoEscalaEventos(c.env.DB, {
      empresaId,
      sessaoId: sessao_id,
      simuladorId: simulador_id,
      data,
      status: 'AGENDADO',
      temaSessao: tema_sessao || null,
      tipoSessao: tipo_sessao,
      observacoes: observacoes || null,
      participantes: participantes.map((part: any) => ({ funcionario_id: part.funcionario_id })),
      createdBy: String((c as any).get('userId') || 'system'),
    });

    // 3. CRIAR FICHAS PARA CADA PARTICIPANTE
    //
    // REGRA: A ficha pedagógica do tripulante deve SEMPRE ter como instrutor
    // o instrutor responsável da sessão (instrutor_id), NUNCA o examinador.
    // O examinador/checador preenche documentação ANAC separada (checks) e
    // NÃO assina a ficha pedagógica de avaliação do tripulante.
    //
    // Apenas fichas especiais TRE-INST/CRED-EXA (criadas separadamente acima)
    // usam o examinador como instrutor, pois nelas o instrutor da sessão é o
    // aluno sendo avaliado para credenciamento.
    let fichas_criadas = 0;
    // H-3: acumular todos os INSERTs de manobras para batch ao final
    const manobraStmts: ReturnType<typeof c.env.DB.prepare>[] = [];

    for (const part of participantes) {
      // Criar ficha
      const fichaUuid = crypto.randomUUID();
      const resultFicha = await c.env.DB.prepare(
        `INSERT INTO fichas_sessao (
          uuid,
          agendamento_slot_id,
          colaborador_id_aluno,
          instrutor_id,
          tipo_sessao,
          tipo_aeronave,
          data_sessao,
          status,
          empresa_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AVALIACAO_PENDENTE', ?)`,
      )
        .bind(
          fichaUuid,
          sessao_id,
          part.funcionario_id,
          instrutor_id,
          tipo_sessao,
          tipo_aeronave || null,
          data,
          empresaId,
        )
        .run();

      const ficha_id = resultFicha.meta.last_row_id;
      fichas_criadas++;

      // Popular manobras automaticamente dos modelos de sessão
      let modeloId = null;

      // 1. Tentar usar o modelo_sessao_id enviado explicitamente
      if (b.modelo_sessao_id) {
        modeloId = b.modelo_sessao_id;
      } else if (b.template_id) {
        modeloId = b.template_id;
      } else {
        // 2. Fallback: Buscar modelo baseado no tipo_sessao e modelo_aeronave
        const modeloEncontrado = await c.env.DB.prepare(
          `SELECT ms.id 
           FROM modelos_sessao ms
           INNER JOIN tipos_sessao ts
             ON ms.tipo_sessao_id = ts.id
            AND ts.empresa_id = ?
            AND ts.deleted_at IS NULL
           WHERE ts.codigo = ?
             AND ms.modelo_aeronave = ?
             AND ms.deleted_at IS NULL
             AND ms.empresa_id = ?
           LIMIT 1`,
        )
          .bind(empresaId, tipo_sessao, tipo_aeronave || null, empresaId)
          .first();

        if (modeloEncontrado) {
          modeloId = modeloEncontrado.id;
        }
      }

      if (modeloId) {
        const manobrasModelo = await c.env.DB.prepare(
          `SELECT
            m.codigo,
            m.nome,
            COALESCE(m.nome, m.descricao) AS nome_curto,
            m.descricao,
            m.categoria,
            msm.ordem,
            msm.observacoes,
            COALESCE(msm.tripulante, 'AB') as tripulante
           FROM modelos_sessao_manobras msm
           INNER JOIN manobras m ON m.id = msm.manobra_id
           WHERE msm.modelo_id = ?
             AND msm.deleted_at IS NULL
             AND m.deleted_at IS NULL
           ORDER BY msm.ordem ASC`,
        )
          .bind(modeloId)
          .all<FichaManobraBase>();

        const manobras = buildOperationalFichaManobras(manobrasModelo.results || []);
        for (const man of manobras) {
          const m = man as {
            codigo: string;
            nome: string;
            nome_curto: string;
            descricao: string;
            categoria: string;
            ordem: number;
            tripulante: string;
          };
          // H-3: acumular para batch posterior
          manobraStmts.push(
            c.env.DB.prepare(
              `INSERT INTO fichas_sessao_manobras (
                ficha_id, codigo, nome, descricao, categoria, ordem, tripulante
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ).bind(
              ficha_id,
              m.codigo,
              m.nome || m.descricao,
              m.descricao,
              m.categoria,
              m.ordem,
              m.tripulante || 'AB',
            ),
          );
        }
      }
    }

    // H-3: executar todos os INSERTs de manobras em batch único
    if (manobraStmts.length > 0) {
      await c.env.DB.batch(manobraStmts);
    }

    // 4. AUDITORIA
    await audit(c.env.DB, {
      tabela: 'simulador_agendamentos',
      acao: 'INSERT',
      registro_id: sessao_id,
      dados_novos: b,
    });

    // 5. QUALIFICAÇÕES PLANEJADAS — criar entrada planejada para cada participante
    //    se o modelo de sessão configurar "gera_qualificacao = 1".
    let modeloIdParaQual = Number(templateIdFinal || modelo_sessao_id || 0) || null;
    if (!modeloIdParaQual && tipo_sessao) {
      const upperNome = String(tema_sessao || '')
        .trim()
        .toUpperCase();

      // Priority 1: model with gera_qualificacao=1, prefer name match
      let fallbackModelo = await c.env.DB.prepare(
        `SELECT ms.id
         FROM modelos_sessao ms
         INNER JOIN tipos_sessao ts
           ON ms.tipo_sessao_id = ts.id
          AND ts.empresa_id = ?
          AND ts.deleted_at IS NULL
         WHERE ts.codigo = ?
           AND ms.modelo_aeronave = ?
           AND ms.deleted_at IS NULL
           AND ms.empresa_id = ?
           AND ms.gera_qualificacao = 1
         ORDER BY CASE WHEN UPPER(ms.nome) = ? THEN 0 ELSE 1 END, ms.id DESC
         LIMIT 1`,
      )
        .bind(empresaId, tipo_sessao, modeloAeronaveSessao, empresaId, upperNome)
        .first<{ id: number }>();

      // Priority 2: any matching model, prefer name match
      if (!fallbackModelo) {
        fallbackModelo = await c.env.DB.prepare(
          `SELECT ms.id
           FROM modelos_sessao ms
           INNER JOIN tipos_sessao ts
             ON ms.tipo_sessao_id = ts.id
            AND ts.empresa_id = ?
            AND ts.deleted_at IS NULL
           WHERE ts.codigo = ?
             AND ms.modelo_aeronave = ?
             AND ms.deleted_at IS NULL
             AND ms.empresa_id = ?
           ORDER BY CASE WHEN UPPER(ms.nome) = ? THEN 0 ELSE 1 END, ms.id DESC
           LIMIT 1`,
        )
          .bind(empresaId, tipo_sessao, modeloAeronaveSessao, empresaId, upperNome)
          .first<{ id: number }>();
      }

      if (fallbackModelo) modeloIdParaQual = fallbackModelo.id;
    }
    let plannedQualificationIntegrationError: string | null = null;
    if (modeloIdParaQual) {
      try {
        await criarQualificacoesPlanejadas(c.env.DB, {
          sessaoId: sessao_id,
          modeloId: modeloIdParaQual,
          tipoSessao: tipo_sessao,
          data,
          participantes,
          empresaId,
        });
      } catch (err) {
        // Não bloquear o rollback do fluxo principal — a sessão já foi criada e deve
        // ser preservada. Reportar a integração pendente via 409 explícito abaixo,
        // em vez de mascarar a falha como sucesso (201) ou derrubar a sessão criada.
        plannedQualificationIntegrationError = 'PLANNED_QUALIFICATION_SYNC_FAILED';
        console.error('[QUAL_PLANEJADA] Sessão criada com integração de qualificações pendente:', {
          sessaoId: sessao_id,
          empresaId,
          errorName: err instanceof Error ? err.name : 'UnknownError',
        });
      }
    }

    try {
      await Promise.allSettled(
        participantes.map((participante: any) =>
          publishDomainEvent(c.env.DB, 'simuladores', 'SIMULADOR_AGENDADO', {
            funcionario_id: String(participante.funcionario_id),
            empresa_id: empresaId,
            origem_modulo: 'simuladores',
            sessao_id: String(sessao_id),
            data_sessao: data,
            tipo_sessao,
            tipo_aeronave: tipo_aeronave || null,
          }),
        ),
      );
    } catch (error) {
      console.error('domain_event_error', error);
    }

    c.executionCtx?.waitUntil(
      sendSimulatorSessionEmailNotifications(c.env, c.env.DB, Number(sessao_id), {
        reason: 'created',
        empresaId,
      })
        .then((results) => {
          const sent = results.filter((item) => item.status === 'sent').length;
          const skipped = results.filter((item) => item.status === 'skipped').length;
          const failed = results.filter((item) => item.status === 'failed').length;
          console.log('[simuladores] session email notification queued', {
            sessao_id,
            sent,
            skipped,
            failed,
          });
        })
        .catch((error) => {
          console.error('[simuladores] session email notification failed', error);
        }),
    );

    createdSessaoId = null;

    if (plannedQualificationIntegrationError) {
      return c.json(
        {
          success: false,
          partial: true,
          code: 'SIMULATOR_QUALIFICATION_INTEGRATION_PENDING',
          error:
            'Sessão criada, mas a sincronização de qualificações ficou pendente. O estado principal foi preservado.',
          data: {
            sessao_id,
            participantes: participantes.length,
            fichas_criadas,
            tema: tema_sessao,
          },
          primary_saved: true,
          qualification_synced: false,
        },
        409,
      );
    }

    return c.json(
      {
        success: true,
        data: {
          sessao_id,
          participantes: participantes.length,
          fichas_criadas,
          tema: tema_sessao,
        },
      },
      201,
    );
  } catch (e) {
    if (createdSessaoId !== null) {
      try {
        await cleanupFailedSharedCreate(c.env.DB, createdSessaoId);
      } catch (rollbackError) {
        console.error('[SESSOES] Falha crítica ao reverter criação parcial:', {
          sessaoId: createdSessaoId,
          rollbackError,
          originalError: e,
        });
        return c.json(
          { success: false, error: 'Falha ao criar sessão e ao reverter gravações parciais' },
          500,
        );
      }
    }

    console.error('Erro ao criar sessão:', e);
    return c.json({ success: false, error: 'Erro ao criar sessão' }, 500);
  }
});

// ==========================================================================
// SESSÕES - Rotas parametrizadas
// ==========================================================================

app.get('/sessoes/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { empresaId } = getTenantContext(c);
    const { hasTipoDispositivo, hasAeronaveId } = await getSimuladorAgendamentosSchema(c.env.DB);
    const tipoDispositivoSelect = hasTipoDispositivo
      ? "COALESCE(sa.tipo_dispositivo, 'SIMULADOR') as tipo_dispositivo,"
      : 'NULL as tipo_dispositivo,';
    const aeronaveSelect = hasAeronaveId
      ? `sa.aeronave_id,
        ae.prefixo as aeronave_prefixo,
        ae.modelo as aeronave_modelo,`
      : `NULL as aeronave_id,
        NULL as aeronave_prefixo,
        NULL as aeronave_modelo,`;
    const aeronaveJoin = hasAeronaveId
      ? 'LEFT JOIN aeronaves ae ON sa.aeronave_id = ae.id AND ae.deleted_at IS NULL'
      : '';

    // 1. Buscar sessão com dados completos: simulador, modelo, tipo, aeronave, examinador
    const s = await c.env.DB.prepare(
      `SELECT
        sa.*,
        s.nome as simulador_nome,
        s.modelo as simulador_modelo,
        s.tipo as simulador_tipo,
        s.aeronave_codigo as simulador_aeronave_codigo,
        ${tipoDispositivoSelect}
        ${aeronaveSelect}
        ms.tipo_sessao_id as tipo_sessao_id,
        ts_ref.codigo as tipo_sessao_codigo,
        ts_ref.nome as tipo_sessao_nome,
        fe.nome as examinador_nome
      FROM simulador_agendamentos sa
      LEFT JOIN simuladores s ON sa.simulador_id = s.id AND s.deleted_at IS NULL
      ${aeronaveJoin}
      LEFT JOIN modelos_sessao ms
        ON sa.template_id = ms.id
       AND ms.deleted_at IS NULL
       AND ms.empresa_id = sa.empresa_id
      LEFT JOIN tipos_sessao ts_ref
        ON ms.tipo_sessao_id = ts_ref.id
       AND ts_ref.deleted_at IS NULL
       AND ts_ref.empresa_id = sa.empresa_id
      LEFT JOIN funcionarios fe ON sa.examinador_id = fe.id AND fe.empresa_id = sa.empresa_id AND fe.deleted_at IS NULL
      WHERE sa.id = ?
        AND sa.deleted_at IS NULL
        ${empresaId ? 'AND sa.empresa_id = ?' : ''}`,
    )
      .bind(id, ...(empresaId ? [empresaId] : []))
      .first();
    if (!s) return c.json({ success: false, error: 'Não encontrada' }, 404);

    // 2. Buscar participantes
    const p = await c.env.DB.prepare(
      `SELECT sp.*, f.nome as funcionario_nome, f.matricula as funcionario_matricula
         FROM sessoes_participantes sp
         LEFT JOIN funcionarios f
           ON sp.funcionario_id = f.id
          AND f.deleted_at IS NULL
          AND f.empresa_id = ?
        WHERE sp.sessao_id = ?
          AND sp.deleted_at IS NULL`,
    )
      .bind(s.empresa_id, id)
      .all();

    // 3. Buscar instrutor
    const instrutor = await c.env.DB.prepare(
      'SELECT id, nome, matricula FROM funcionarios WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
    )
      .bind(s.instrutor_id, s.empresa_id)
      .first();

    // 4. Buscar fichas desta sessão
    const fichas = await c.env.DB.prepare(
      `SELECT f.*, aluno.nome as aluno_nome, aluno.matricula as aluno_matricula
         FROM fichas_sessao f
         LEFT JOIN funcionarios aluno
           ON f.colaborador_id_aluno = aluno.id
          AND aluno.deleted_at IS NULL
          AND aluno.empresa_id = f.empresa_id
        WHERE f.agendamento_slot_id = ?
          AND f.empresa_id = ?
          AND f.deleted_at IS NULL`,
    )
      .bind(id, s.empresa_id)
      .all();

    const linkedFuncionarioIds = uniquePositiveIds([
      s.instrutor_id,
      s.examinador_id,
      ...(p.results || []).map((part: any) => part?.funcionario_id),
      ...(fichas.results || []).flatMap((ficha: any) => [
        ficha?.colaborador_id_aluno,
        ficha?.instrutor_id,
      ]),
    ]);
    const sessaoAccess = await resolveSessaoReadAccess(
      c,
      Number(s.empresa_id || empresaId || 0),
      s as { instrutor_id?: unknown; examinador_id?: unknown },
      linkedFuncionarioIds,
    );
    if (!sessaoAccess) {
      return c.json({ success: false, error: 'Não encontrada' }, 404);
    }

    const participantesFiltrados = sessaoAccess.canViewAllRelatedData
      ? p.results
      : (p.results || []).filter(
          (part: any) => Number(part?.funcionario_id || 0) === sessaoAccess.actorFuncionarioId,
        );
    const fichasFiltradas = sessaoAccess.canViewAllRelatedData
      ? fichas.results
      : (fichas.results || []).filter((ficha: any) => {
          const actorId = Number(sessaoAccess.actorFuncionarioId || 0);
          return (
            Number(ficha?.colaborador_id_aluno || 0) === actorId ||
            Number(ficha?.instrutor_id || 0) === actorId
          );
        });

    // 5. Montar estrutura esperada pelo frontend
    const sessao = {
      ...s,
      instrutor: instrutor || { nome: 'N/A', matricula: 'N/A' },
      participantes: participantesFiltrados,
      alunos: participantesFiltrados.map((part: any) => ({
        id: part.funcionario_id,
        nome: part.funcionario_nome,
        matricula: part.funcionario_matricula,
        funcao: part.funcao,
        status: part.status,
      })),
      fichas: fichasFiltradas,
    };

    return c.json({ success: true, sessao });
  } catch (e: any) {
    console.error('[GET /sessoes/:id] Erro:', e);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// GET /api/simuladores/sessoes/:id/fichas - Buscar fichas de uma sessão
app.get('/sessoes/:id/fichas', async (c) => {
  try {
    const sessao_id = c.req.param('id');
    const { empresaId } = getTenantContext(c);

    const sessao = await c.env.DB.prepare(
      `SELECT id, empresa_id, instrutor_id, examinador_id
         FROM simulador_agendamentos
        WHERE id = ?
          ${empresaId ? 'AND empresa_id = ?' : ''}
          AND deleted_at IS NULL
        LIMIT 1`,
    )
      .bind(sessao_id, ...(empresaId ? [empresaId] : []))
      .first<{
        id: number;
        empresa_id: number;
        instrutor_id?: number | null;
        examinador_id?: number | null;
      }>();

    if (!sessao) {
      return c.json({ success: false, error: 'Não encontrada' }, 404);
    }

    // Buscar fichas vinculadas à sessão com JOINs completos (mesma query do GET /fichas)
    const fichas = await c.env.DB.prepare(
      `SELECT 
        f.*,
        CASE
          WHEN f.assinatura_instrutor_timestamp IS NOT NULL THEN
            CASE
              WHEN f.resultado_final = 'REPROVADO' THEN 'NAO_APROVADO'
              WHEN f.resultado_final = 'APROVADO' THEN 'APROVADO'
              WHEN f.aprovado = 0 AND f.resultado_final != 'PENDENTE' THEN 'NAO_APROVADO'
              WHEN f.aprovado = 1 THEN 'APROVADO'
              ELSE 'APROVADO'
            END
          WHEN f.assinatura_aluno_timestamp IS NOT NULL THEN 'AGUARDANDO_ASSINATURA_INSTRUTOR'
          WHEN f.status IN ('AGUARDANDO_ASSINATURA_ALUNO', 'AGUARDANDO_ASSINATURA_INSTRUTOR', 'AVALIACAO_PENDENTE', 'APROVADO', 'NAO_APROVADO') THEN f.status
          WHEN f.status IN ('AGUARDANDO_ASSINATURAS', 'AVALIADA') THEN 'AGUARDANDO_ASSINATURA_ALUNO'
          WHEN f.status IN ('ASSINADA_ALUNO') THEN 'AGUARDANDO_ASSINATURA_INSTRUTOR'
          WHEN f.status IN ('ASSINADA_TOTAL', 'APROVADA', 'CONCLUIDA') THEN
            CASE
              WHEN f.resultado_final = 'REPROVADO' THEN 'NAO_APROVADO'
              WHEN f.resultado_final = 'APROVADO' THEN 'APROVADO'
              WHEN f.aprovado = 0 AND f.resultado_final != 'PENDENTE' THEN 'NAO_APROVADO'
              WHEN f.aprovado = 1 THEN 'APROVADO'
              ELSE 'APROVADO'
            END
          ELSE 'AVALIACAO_PENDENTE'
        END as status,
        COALESCE(sa.data, f.data_sessao) || ' ' || COALESCE(sa.hora_inicio, '') as data_hora,
        sa.data as data_sessao,
        sa.hora_inicio,
        sa.hora_fim,
        COALESCE(mf.nome, sa.nome, m.nome, t.tema, f.tipo_sessao, 'Sessão') as sessao_titulo,
        COALESCE(mf.nome, sa.nome, m.nome, t.tema) as sessao_modelo,
        COALESCE(sa.tipo_sessao, f.tipo_sessao, 'N/A') as simulador_codigo,
        COALESCE(sim.nome, sim.tipo, 'N/A') as simulador_nome,
        COALESCE(aluno.nome, 'N/A') as participante_nome,
        COALESCE(aluno.codigo_anac, '') as aluno_codigo_anac,
        COALESCE(instrutor.nome, 'N/A') as instrutor_nome
      FROM fichas_sessao f
      LEFT JOIN simulador_agendamentos sa ON f.agendamento_slot_id = sa.id
      LEFT JOIN modelos_sessao m ON sa.tipo_sessao = m.codigo
      LEFT JOIN modelos_sessao mf ON f.tipo_sessao = mf.codigo AND mf.deleted_at IS NULL
      LEFT JOIN sessoes_template t ON f.template_id = t.id
      LEFT JOIN simuladores sim ON sa.simulador_id = sim.id
      LEFT JOIN funcionarios aluno ON f.colaborador_id_aluno = aluno.id
      LEFT JOIN funcionarios instrutor ON f.instrutor_id = instrutor.id
      WHERE f.agendamento_slot_id = ?
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?
        AND sa.empresa_id = f.empresa_id
      ORDER BY aluno.nome`,
    )
      .bind(sessao_id, sessao.empresa_id)
      .all();

    const linkedFuncionarioIds = uniquePositiveIds([
      sessao.instrutor_id,
      sessao.examinador_id,
      ...(fichas.results || []).flatMap((ficha: any) => [
        ficha?.colaborador_id_aluno,
        ficha?.instrutor_id,
      ]),
    ]);
    const sessaoAccess = await resolveSessaoReadAccess(
      c,
      Number(sessao.empresa_id || empresaId || 0),
      sessao,
      linkedFuncionarioIds,
    );
    if (!sessaoAccess) {
      return c.json({ success: false, error: 'Não encontrada' }, 404);
    }

    const data = sessaoAccess.canViewAllRelatedData
      ? fichas.results
      : (fichas.results || []).filter((ficha: any) => {
          const actorId = Number(sessaoAccess.actorFuncionarioId || 0);
          return (
            Number(ficha?.colaborador_id_aluno || 0) === actorId ||
            Number(ficha?.instrutor_id || 0) === actorId
          );
        });

    return c.json({ success: true, data });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.post('/sessoes/:id/notificacoes', requireOperacoesSessao('create'), async (c) => {
  try {
    const sessaoId = c.req.param('id');
    const body = (await c.req.json().catch(() => ({}))) as {
      mensagem?: string;
      enviarEmail?: boolean;
      enviarWhatsApp?: boolean;
    };

    const enviarEmail = body.enviarEmail !== false;
    const enviarWhatsApp = body.enviarWhatsApp === true;

    if (!enviarEmail && !enviarWhatsApp) {
      return c.json(
        {
          success: false,
          error: 'Selecione pelo menos um canal para envio.',
          code: 'NO_CHANNEL_SELECTED',
        },
        400,
      );
    }

    const { empresaId } = getTenantContext(c);
    const sessao = await c.env.DB.prepare(
      `SELECT
         sa.id,
         sa.data,
         sa.hora_inicio,
         sa.hora_fim,
         sa.tipo_sessao,
         sa.nome AS tema_sessao,
         sa.observacoes,
         sa.empresa_id,
         s.nome AS simulador_nome,
         fi.id AS instrutor_id,
         fi.nome AS instrutor_nome,
         fi.email AS instrutor_email,
         fi.telefone AS instrutor_telefone,
         fe.id AS examinador_id,
         fe.nome AS examinador_nome,
         fe.email AS examinador_email,
         fe.telefone AS examinador_telefone
       FROM simulador_agendamentos sa
       LEFT JOIN simuladores s ON s.id = sa.simulador_id
       LEFT JOIN funcionarios fi ON fi.id = sa.instrutor_id
       LEFT JOIN funcionarios fe ON fe.id = sa.examinador_id
       WHERE sa.id = ?
         AND sa.deleted_at IS NULL
         AND sa.empresa_id = ?`,
    )
      .bind(sessaoId, empresaId)
      .first<{
        id: number;
        data: string;
        hora_inicio: string | null;
        hora_fim: string | null;
        tipo_sessao: string | null;
        tema_sessao: string | null;
        observacoes: string | null;
        empresa_id: number | null;
        simulador_nome: string | null;
        instrutor_id: number | null;
        instrutor_nome: string | null;
        instrutor_email: string | null;
        instrutor_telefone: string | null;
        examinador_id: number | null;
        examinador_nome: string | null;
        examinador_email: string | null;
        examinador_telefone: string | null;
      }>();

    if (!sessao) {
      return c.json({ success: false, error: 'Sessão não encontrada.' }, 404);
    }

    const participantesResult = await c.env.DB.prepare(
      `SELECT
         sp.funcionario_id,
         sp.funcao,
         f.nome AS funcionario_nome,
         f.email AS funcionario_email,
         f.telefone AS funcionario_telefone
       FROM sessoes_participantes sp
       INNER JOIN funcionarios f ON f.id = sp.funcionario_id
       WHERE sp.sessao_id = ?
         AND sp.deleted_at IS NULL
         AND f.deleted_at IS NULL`,
    )
      .bind(sessaoId)
      .all<{
        funcionario_id: number;
        funcao: string | null;
        funcionario_nome: string | null;
        funcionario_email: string | null;
        funcionario_telefone: string | null;
      }>();

    const destinatarios = new Map<
      number,
      {
        funcionario_id: number;
        nome: string;
        email: string | null;
        telefone: string | null;
        papel: string;
      }
    >();

    if (sessao.instrutor_id) {
      destinatarios.set(sessao.instrutor_id, {
        funcionario_id: sessao.instrutor_id,
        nome: sessao.instrutor_nome || 'Instrutor',
        email: sessao.instrutor_email || null,
        telefone: sessao.instrutor_telefone || null,
        papel: 'instrutor',
      });
    }

    if (sessao.examinador_id) {
      destinatarios.set(sessao.examinador_id, {
        funcionario_id: sessao.examinador_id,
        nome: sessao.examinador_nome || 'Examinador',
        email: sessao.examinador_email || null,
        telefone: sessao.examinador_telefone || null,
        papel: 'examinador',
      });
    }

    for (const participante of participantesResult.results || []) {
      destinatarios.set(Number(participante.funcionario_id), {
        funcionario_id: Number(participante.funcionario_id),
        nome: participante.funcionario_nome || 'Participante',
        email: participante.funcionario_email || null,
        telefone: participante.funcionario_telefone || null,
        papel: `participante${participante.funcao ? `_${String(participante.funcao).toLowerCase()}` : ''}`,
      });
    }

    const listaDestinatarios = [...destinatarios.values()];

    if (listaDestinatarios.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Sessão sem destinatários ativos para notificação.',
          code: 'NO_RECIPIENTS',
        },
        400,
      );
    }

    const dataFormatada = sessao.data
      ? new Date(`${sessao.data}T00:00:00`).toLocaleDateString('pt-BR')
      : 'N/A';
    const horario = `${(sessao.hora_inicio || '').substring(0, 5)}${sessao.hora_fim ? ` às ${sessao.hora_fim.substring(0, 5)}` : ''}`;
    const mensagemPadrao =
      `🎯 Agendamento de Sessão de Treinamento\n\n` +
      `Data: ${dataFormatada}\n` +
      `Horário: ${horario || 'N/A'}\n` +
      `Simulador: ${sessao.simulador_nome || 'N/A'}\n` +
      `Tipo: ${sessao.tipo_sessao || 'N/A'}\n` +
      `Tema: ${sessao.tema_sessao || sessao.tipo_sessao || 'Sessão de Treinamento'}\n` +
      `${sessao.observacoes ? `\nObservações:\n${sessao.observacoes}\n` : ''}\n` +
      `Por favor, confirme sua presença.`;

    const mensagemFinal = String(body.mensagem || '').trim() || mensagemPadrao;
    const assunto = `🎯 Sessão de Treinamento - ${dataFormatada}`;
    const corpoHtml = `<div style="font-family:Arial,sans-serif;line-height:1.5;white-space:pre-line">${mensagemFinal.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char] || char)}</div>`;

    const alertas: Array<{
      tipo: 'email' | 'whatsapp';
      destino: string;
      funcionarioId: number;
      funcionarioNome: string;
      papel: string;
      status: 'enviado' | 'erro';
      mensagem?: string;
      erro?: string;
      provider?: string;
      providerStatus?: string;
      providerMessageId?: string;
      manualFallbackUrl?: string;
    }> = [];

    if (enviarEmail) {
      for (const destinatario of listaDestinatarios) {
        const email = String(destinatario.email || '').trim();
        if (!email) {
          alertas.push({
            tipo: 'email',
            destino: '',
            funcionarioId: destinatario.funcionario_id,
            funcionarioNome: destinatario.nome,
            papel: destinatario.papel,
            status: 'erro',
            erro: 'E-mail não cadastrado para o destinatário.',
          });
          continue;
        }

        try {
          const emailResult = await enviarEmailSessao(
            c.env,
            [email],
            assunto,
            mensagemFinal,
            corpoHtml,
          );
          alertas.push({
            tipo: 'email',
            destino: email,
            funcionarioId: destinatario.funcionario_id,
            funcionarioNome: destinatario.nome,
            papel: destinatario.papel,
            status: 'enviado',
            mensagem: `E-mail enviado para ${destinatario.nome}`,
            provider: emailResult.provider,
            providerStatus: 'accepted',
            providerMessageId: emailResult.messageId || undefined,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          alertas.push({
            tipo: 'email',
            destino: email,
            funcionarioId: destinatario.funcionario_id,
            funcionarioNome: destinatario.nome,
            papel: destinatario.papel,
            status: 'erro',
            erro:
              msg === 'EMAIL_NOT_CONFIGURED'
                ? 'Envio de e-mail não configurado (BREVO_API_KEY ausente).'
                : msg,
          });
        }
      }
    }

    if (enviarWhatsApp) {
      for (const destinatario of listaDestinatarios) {
        const telefone = String(destinatario.telefone || '').trim();
        if (!telefone) {
          alertas.push({
            tipo: 'whatsapp',
            destino: '',
            funcionarioId: destinatario.funcionario_id,
            funcionarioNome: destinatario.nome,
            papel: destinatario.papel,
            status: 'erro',
            erro: 'Telefone não cadastrado para o destinatário.',
          });
          continue;
        }

        try {
          const whatsappResult = await sendWhatsAppMessage(c.env, telefone, mensagemFinal);
          alertas.push({
            tipo: 'whatsapp',
            destino: whatsappResult.destination,
            funcionarioId: destinatario.funcionario_id,
            funcionarioNome: destinatario.nome,
            papel: destinatario.papel,
            status: 'enviado',
            mensagem: `WhatsApp aceito pelo provedor para ${destinatario.nome}`,
            provider: whatsappResult.provider,
            providerStatus: whatsappResult.providerStatus,
            providerMessageId: whatsappResult.providerMessageId,
            manualFallbackUrl: buildWhatsAppManualLink(telefone, mensagemFinal),
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          alertas.push({
            tipo: 'whatsapp',
            destino: telefone,
            funcionarioId: destinatario.funcionario_id,
            funcionarioNome: destinatario.nome,
            papel: destinatario.papel,
            status: 'erro',
            erro:
              msg === 'WHATSAPP_NOT_CONFIGURED'
                ? 'Envio de WhatsApp não configurado (TWILIO/WHATSAPP API ausente).'
                : msg,
            manualFallbackUrl: buildWhatsAppManualLink(telefone, mensagemFinal),
          });
        }
      }
    }

    const sucesso = alertas.filter((alerta) => alerta.status === 'enviado').length;
    if (sucesso === 0) {
      return c.json(
        {
          success: false,
          error: 'Nenhum envio foi concluído.',
          code: 'NO_CHANNEL_SENT',
          detalhes: alertas
            .filter((alerta) => alerta.status === 'erro')
            .map(
              (alerta) =>
                `${alerta.tipo.toUpperCase()} - ${alerta.funcionarioNome}: ${alerta.erro || 'Erro desconhecido'}`,
            ),
          data: {
            alertas,
          },
        },
        400,
      );
    }

    return c.json({
      success: true,
      data: {
        sessaoId: sessao.id,
        enviados: sucesso,
        totalDestinatarios: listaDestinatarios.length,
        alertas,
      },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Erro ao enviar notificações da sessão.',
        code: 'SESSION_NOTIFICATION_ERROR',
      },
      500,
    );
  }
});

// PUT /sessoes/:id e DELETE /sessoes/:id montados via sub-router
app.route('/', sessoesUpdateRoutes);

// Participantes e checks montados via sub-router
app.route('/', participantesRoutes);

export default app;
