/**
 * EVD — Escala de Voo Diária (PRC-OPS-009 §4.3)
 *
 * CRUD + validações operacionais:
 *   - Repouso mínimo 12h30 (§6.1.6)
 *   - Composição de tripulação (delegada a escalas-tripulacoes)
 *   - Vinculação com EST mensal (escala_id)
 *
 * Endpoints:
 *   GET    /api/evd?data=YYYY-MM-DD             — listar voos do dia
 *   GET    /api/evd/:id                          — detalhe
 *   GET    /api/evd/:id/justificativas           — listar justificativas estruturadas
 *   POST   /api/evd                              — criar voo
 *   POST   /api/evd/:id/justificativas           — criar justificativa estruturada
 *   PUT    /api/evd/:id                          — atualizar voo
 *   DELETE /api/evd/:id                          — soft delete
 *   POST   /api/evd/:id/publicar                 — mudar status para PUBLICADA
 *   GET    /api/evd/semana?inicio=YYYY-MM-DD     — visão semanal
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import type { D1Database } from '@cloudflare/workers-types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { verificarHabilitacaoModelo } from './escalas-alocacoes-helpers-internal';

const evdRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

evdRoutes.use('*', auth());

const REPOUSO_MINIMO_MIN = 12 * 60 + 30; // 12h30 em minutos (PRC-OPS-009 §6.1.6)

const MSG_PUBLISH_CREW_REQUIRED = 'PIC e SIC são obrigatórios para publicar.';
const MSG_PIC_SIC_SAME = 'PIC e SIC não podem ser o mesmo tripulante.';
const MSG_DUPLICATE_CREW =
  'Tripulante já alocado em outra escala diária na mesma data/intervalo.';
const MSG_REST_INVALID = 'Repouso mínimo não atendido.';
const MSG_AIRCRAFT_UNAVAILABLE = 'Aeronave indisponível ou inativa no cadastro mestre.';
const MSG_MODEL_QUALIFICATION = 'Tripulante sem habilitação cadastrada para o modelo da aeronave.';
const MSG_MONTHLY_UNAVAILABLE = 'Tripulante indisponível na escala mensal para esta data/período.';
const MSG_PIC_ROLE_REVIEW =
  'Função PIC requer validação operacional: cadastro de função não é canônico.';
const MSG_AIRCRAFT_UNRESOLVED =
  'Aeronave não resolvida no cadastro mestre; validações de modelo não aplicadas.';

const evdCreateSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  escala_id: z.string().optional(),
  pic_id: z.number().int().optional(),
  sic_id: z.number().int().optional(),
  pic_funcao: z.string().optional(),
  sic_funcao: z.string().optional(),
  aeronave_prefixo: z.string().optional(),
  aeronave_modelo: z.string().optional(),
  hora_apresentacao: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  hora_decolagem_prevista: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  hora_pouso_previsto: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  hora_decolagem_real: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  hora_pouso_real: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  hora_corte_motor: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  origem: z.string().optional(),
  destino: z.string().optional(),
  tipo_missao: z.enum(['OFFSHORE', 'INSTRUCAO', 'CHECK', 'FERRY', 'OUTRO']).default('OFFSHORE'),
  observacoes: z.string().optional(),
});

const justificativaCreateSchema = z
  .object({
    funcionario_id: z.number().int().positive().nullable().optional(),
    papel: z.string().trim().min(1).max(32).nullable().optional(),
    origem_alerta: z
      .enum(['FRMS', 'REPOUSO', 'DUPLICIDADE', 'OPERACIONAL', 'OUTRO'])
      .default('OPERACIONAL'),
    tipo_alerta: z.string().trim().min(1).max(64).nullable().optional(),
    nivel_alerta: z.string().trim().min(1).max(64).nullable().optional(),
    decisao: z
      .enum(['MANTER_ESCALA', 'SUBSTITUIR', 'ACIONAR_STANDBY', 'ADICIONAR_OBSERVACAO', 'OUTRO'])
      .default('MANTER_ESCALA'),
    justificativa: z.string().trim().min(10).max(2000),
    alerta_ref_id: z.string().trim().max(128).nullable().optional(),
  })
  .strict();

const publicarSchema = z
  .object({
    require_justificativa: z.boolean().optional(),
    justificativa: justificativaCreateSchema.optional(),
  })
  .strict();

type EvdTripulacaoConflitoRow = {
  id: string;
  pic_id: number | null;
  sic_id: number | null;
  hora_apresentacao: string | null;
  hora_decolagem_prevista: string | null;
  hora_pouso_previsto: string | null;
};

type EvdTimeWindowSource = {
  hora_apresentacao?: string | null;
  hora_decolagem_prevista?: string | null;
  hora_pouso_previsto?: string | null;
};

type EvdJustificativaInsert = {
  funcionario_id: number | null;
  papel: string | null;
  origem_alerta: 'FRMS' | 'REPOUSO' | 'DUPLICIDADE' | 'OPERACIONAL' | 'OUTRO';
  tipo_alerta: string | null;
  nivel_alerta: string | null;
  decisao: 'MANTER_ESCALA' | 'SUBSTITUIR' | 'ACIONAR_STANDBY' | 'ADICIONAR_OBSERVACAO' | 'OUTRO';
  justificativa: string;
  alerta_ref_id: string | null;
};

type MasterAeronaveResolution = {
  resolved: boolean;
  aeronaveId: number | null;
  prefixo: string | null;
  modeloNormalizado: string | null;
  active: boolean;
  warnings: string[];
};

type MonthlyAvailabilityResult = {
  blocked: boolean;
  message?: string;
};

type RoleContext = {
  funcao: string | null;
  cargo: string | null;
};

function normalizeModeloOperacional(value: string | null | undefined): string | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
  if (!normalized) return null;
  if (normalized.includes('SK76') || normalized.includes('S76')) return 'SK76';
  if (normalized.includes('AW139')) return 'AW139';
  return normalized;
}

function isStatusAeronaveAtivo(value: string | null | undefined): boolean {
  return String(value || 'ATIVO')
    .trim()
    .toUpperCase() === 'ATIVO';
}

function normalizeRoleText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isCopilotRoleText(value: string | null | undefined): boolean {
  const role = normalizeRoleText(value);
  if (!role) return false;
  return (
    role.includes('COPILOTO') ||
    role === 'COP' ||
    role === 'SIC' ||
    role.includes('COPILOT')
  );
}

function hasCanonicalCommanderHint(value: string | null | undefined): boolean {
  const role = normalizeRoleText(value);
  if (!role) return false;
  return role.includes('COMANDANTE') || role.includes('PIC') || role.includes('CMT');
}

async function resolveMasterAeronave(params: {
  db: D1Database;
  empresaId: number;
  aeronavePrefixo?: string | null;
  aeronaveModeloLivre?: string | null;
}): Promise<MasterAeronaveResolution> {
  const prefixoInput = String(params.aeronavePrefixo || '').trim().toUpperCase();
  if (!prefixoInput) {
    return {
      resolved: false,
      aeronaveId: null,
      prefixo: null,
      modeloNormalizado: normalizeModeloOperacional(params.aeronaveModeloLivre),
      active: true,
      warnings: [],
    };
  }

  const aeronave = await params.db
    .prepare(
      `SELECT id, prefixo, modelo, status, empresa_id
         FROM aeronaves
        WHERE deleted_at IS NULL
          AND UPPER(TRIM(COALESCE(prefixo, ''))) = ?
        ORDER BY
          CASE
            WHEN empresa_id = ? THEN 0
            WHEN empresa_id IS NULL THEN 1
            ELSE 2
          END,
          id
        LIMIT 1`,
    )
    .bind(prefixoInput, params.empresaId)
    .first<{
      id: number;
      prefixo: string | null;
      modelo: string | null;
      status: string | null;
      empresa_id: number | null;
    }>();

  if (!aeronave) {
    return {
      resolved: false,
      aeronaveId: null,
      prefixo: prefixoInput,
      modeloNormalizado: normalizeModeloOperacional(params.aeronaveModeloLivre),
      active: true,
      warnings: [MSG_AIRCRAFT_UNRESOLVED],
    };
  }

  return {
    resolved: true,
    aeronaveId: Number(aeronave.id),
    prefixo: String(aeronave.prefixo || prefixoInput).toUpperCase(),
    modeloNormalizado: normalizeModeloOperacional(aeronave.modelo || params.aeronaveModeloLivre),
    active: isStatusAeronaveAtivo(aeronave.status),
    warnings: [],
  };
}

async function getRoleContext(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
): Promise<RoleContext | null> {
  const row = await db
    .prepare(
      `SELECT funcao, cargo
         FROM funcionarios
        WHERE id = ?
          AND deleted_at IS NULL
          AND COALESCE(ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
          AND (empresa_id IS NULL OR empresa_id = ?)
        LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<RoleContext>();
  return row || null;
}

async function hasReliableQualificationSource(
  db: D1Database,
  funcionarioId: number,
): Promise<boolean> {
  const funcionario = await db
    .prepare(
      `SELECT modelo_aeronave_id, aeronave
         FROM funcionarios
        WHERE id = ?
          AND deleted_at IS NULL
          AND COALESCE(ativo, 1) = 1
        LIMIT 1`,
    )
    .bind(funcionarioId)
    .first<{ modelo_aeronave_id: string | null; aeronave: string | null }>();

  if (!funcionario) return false;

  const hasActiveAssociacao = await db
    .prepare(
      `SELECT 1
         FROM funcionarios_aeronaves fa
        WHERE CAST(fa.funcionario_id AS INTEGER) = ?
          AND fa.deleted_at IS NULL
          AND COALESCE(fa.ativo, 1) = 1
          AND (fa.data_fim IS NULL OR date(fa.data_fim) >= date('now'))
        LIMIT 1`,
    )
    .bind(funcionarioId)
    .first<{ 1: number }>();

  if (hasActiveAssociacao) return true;

  return (
    String(funcionario.modelo_aeronave_id || '').trim().length > 0 ||
    String(funcionario.aeronave || '').trim().length > 0
  );
}

async function validateCrewAvailabilityOnMonthlyScale(params: {
  db: D1Database;
  funcionarioId: number;
  data: string;
  escalaId?: string | null;
}): Promise<MonthlyAvailabilityResult> {
  const ferias = await params.db
    .prepare(
      `SELECT tipo
         FROM funcionario_ferias
        WHERE CAST(funcionario_id AS INTEGER) = ?
          AND deleted_at IS NULL
          AND NOT (data_fim < ? OR data_inicio > ?)
        LIMIT 1`,
    )
    .bind(params.funcionarioId, params.data, params.data)
    .first<{ tipo: string | null }>();

  if (ferias) {
    return {
      blocked: true,
      message: MSG_MONTHLY_UNAVAILABLE,
    };
  }

  const conflitos = await params.db
    .prepare(
      `SELECT
         CAST(ea.escala_id AS TEXT) AS escala_id,
         ea.aeronave_id,
         ea.situacao_tipo,
         COALESCE(est.bloqueia_alocacao, 1) AS bloqueia_alocacao
       FROM escala_alocacoes ea
       LEFT JOIN escala_situacao_tipos est
         ON UPPER(est.codigo) = UPPER(COALESCE(ea.situacao_tipo, ''))
        AND est.deleted_at IS NULL
      WHERE CAST(ea.funcionario_id AS INTEGER) = ?
        AND ea.deleted_at IS NULL
        AND ea.status != 'cancelado'
        AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)`,
    )
    .bind(params.funcionarioId, params.data, params.data)
    .all<{
      escala_id: string | null;
      aeronave_id: number | null;
      situacao_tipo: string | null;
      bloqueia_alocacao: number | null;
    }>();

  for (const row of conflitos.results || []) {
    if (row.aeronave_id != null) {
      if (params.escalaId && String(row.escala_id || '') === String(params.escalaId)) {
        continue;
      }
      // Sem escala_id vinculada no EVD não há como afirmar conflito operacional com segurança.
      if (!params.escalaId) continue;
      return { blocked: true, message: MSG_MONTHLY_UNAVAILABLE };
    }

    const situacao = String(row.situacao_tipo || '').trim().toUpperCase();
    if (!situacao || situacao === 'FOLGA') continue;
    if (Number(row.bloqueia_alocacao ?? 1) === 1) {
      return { blocked: true, message: MSG_MONTHLY_UNAVAILABLE };
    }
  }

  return { blocked: false };
}

async function collectOperationalWarningsAndBlocks(params: {
  db: D1Database;
  empresaId: number;
  data: string;
  escalaId?: string | null;
  picId: number | null;
  sicId: number | null;
  aeronavePrefixo?: string | null;
  aeronaveModelo?: string | null;
}): Promise<{ hardError: string | null; warnings: string[]; requiresOperationalJustification: boolean }> {
  const warnings: string[] = [];
  let requiresOperationalJustification = false;
  const crewIds = [params.picId, params.sicId].filter((id): id is number => Boolean(id));

  const aeronave = await resolveMasterAeronave({
    db: params.db,
    empresaId: params.empresaId,
    aeronavePrefixo: params.aeronavePrefixo,
    aeronaveModeloLivre: params.aeronaveModelo,
  });

  warnings.push(...aeronave.warnings);

  if (aeronave.resolved && !aeronave.active) {
    return { hardError: MSG_AIRCRAFT_UNAVAILABLE, warnings, requiresOperationalJustification };
  }

  if (aeronave.resolved && aeronave.aeronaveId && crewIds.length > 0) {
    const knownModel = ['AW139', 'SK76'].includes(String(aeronave.modeloNormalizado || ''));
    if (knownModel) {
      for (const crewId of crewIds) {
        const reliableSource = await hasReliableQualificationSource(params.db, crewId);
        if (!reliableSource) {
          warnings.push(
            `Habilitação de modelo não pôde ser confirmada no cadastro para tripulante ${crewId}; revisão operacional recomendada.`,
          );
          continue;
        }
        const hab = await verificarHabilitacaoModelo(
          params.db,
          String(crewId),
          aeronave.aeronaveId,
          params.empresaId,
        );
        if (!hab.habilitado) {
          return { hardError: MSG_MODEL_QUALIFICATION, warnings, requiresOperationalJustification };
        }
      }
    } else if (aeronave.modeloNormalizado) {
      warnings.push(
        `Modelo ${aeronave.modeloNormalizado} fora do escopo AW139/SK76 para bloqueio automático nesta fase.`,
      );
    }
  }

  for (const crewId of crewIds) {
    const availability = await validateCrewAvailabilityOnMonthlyScale({
      db: params.db,
      funcionarioId: crewId,
      data: params.data,
      escalaId: params.escalaId || null,
    });
    if (availability.blocked) {
      return { hardError: availability.message || MSG_MONTHLY_UNAVAILABLE, warnings, requiresOperationalJustification };
    }
  }

  if (params.picId) {
    const picRole = await getRoleContext(params.db, params.empresaId, params.picId);
    if (
      picRole &&
      (isCopilotRoleText(picRole.funcao) || isCopilotRoleText(picRole.cargo)) &&
      !hasCanonicalCommanderHint(picRole.funcao) &&
      !hasCanonicalCommanderHint(picRole.cargo)
    ) {
      warnings.push(MSG_PIC_ROLE_REVIEW);
      requiresOperationalJustification = true;
    }
  }

  return { hardError: null, warnings, requiresOperationalJustification };
}

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hh, mm] = value.split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return hh * 60 + mm;
}

function buildTimeWindow(source: EvdTimeWindowSource): { start: number; end: number } | null {
  const start =
    parseTimeToMinutes(source.hora_apresentacao) ??
    parseTimeToMinutes(source.hora_decolagem_prevista);
  const endRaw =
    parseTimeToMinutes(source.hora_pouso_previsto) ??
    parseTimeToMinutes(source.hora_decolagem_prevista) ??
    parseTimeToMinutes(source.hora_apresentacao);

  if (start == null || endRaw == null) return null;
  let end = endRaw;
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function timeWindowsOverlap(
  a: EvdTimeWindowSource,
  b: EvdTimeWindowSource,
): boolean {
  const wa = buildTimeWindow(a);
  const wb = buildTimeWindow(b);
  // Regra conservadora: se faltarem horários suficientes, considera sobreposição.
  if (!wa || !wb) return true;
  return wa.start < wb.end && wb.start < wa.end;
}

async function hasCrewConflict(params: {
  db: D1Database;
  empresaId: number;
  data: string;
  picId: number | null;
  sicId: number | null;
  window: EvdTimeWindowSource;
  excludeId?: string;
}): Promise<boolean> {
  const crewIds = [params.picId, params.sicId].filter(
    (id): id is number => typeof id === 'number' && Number.isFinite(id),
  );
  if (crewIds.length === 0) return false;

  const placeholders = crewIds.map(() => '?').join(', ');
  const bindings: unknown[] = [params.empresaId, params.data, ...crewIds, ...crewIds];
  let excludeSql = '';
  if (params.excludeId) {
    excludeSql = 'AND id != ?';
    bindings.push(params.excludeId);
  }

  const rows = await params.db
    .prepare(
      `SELECT id, pic_id, sic_id, hora_apresentacao, hora_decolagem_prevista, hora_pouso_previsto
         FROM escala_voo_diaria
        WHERE empresa_id = ?
          AND data = ?
          AND deleted_at IS NULL
          AND UPPER(COALESCE(status, 'RASCUNHO')) != 'CANCELADA'
          AND (
            pic_id IN (${placeholders})
            OR sic_id IN (${placeholders})
          )
          ${excludeSql}`,
    )
    .bind(...bindings)
    .all<EvdTripulacaoConflitoRow>();

  for (const row of rows.results || []) {
    const overlap = timeWindowsOverlap(params.window, row);
    if (!overlap) continue;
    const sameCrew =
      crewIds.includes(Number(row.pic_id)) || crewIds.includes(Number(row.sic_id));
    if (sameCrew) return true;
  }
  return false;
}

// Helper: calcular repouso desde último corte motor
async function calcRepouso(
  db: D1Database,
  empresaId: number,
  pilotoId: number,
  dataVoo: string,
  horaApresentacao: string | undefined,
): Promise<{ minutos: number | null; ok: boolean }> {
  if (!horaApresentacao) return { minutos: null, ok: true };

  // Buscar último corte motor deste piloto (EVD ou FRMS jornada)
  const ultimoCorte = await db
    .prepare(
      `SELECT hora_corte_motor, data FROM (
         SELECT hora_corte_motor, data FROM escala_voo_diaria
         WHERE (pic_id = ? OR sic_id = ?) AND deleted_at IS NULL
           AND empresa_id = ? AND data < ?
         UNION ALL
         SELECT hora_corte_motor, data FROM frms_jornada
         WHERE CAST(tripulante_id AS INTEGER) = ? AND deleted_at IS NULL AND data < ?
       ) ORDER BY data DESC, hora_corte_motor DESC LIMIT 1`,
    )
    .bind(pilotoId, pilotoId, empresaId, dataVoo, pilotoId, dataVoo)
    .first<{ hora_corte_motor: string | null; data: string }>();

  if (!ultimoCorte?.hora_corte_motor) return { minutos: null, ok: true };

  const [ch, cm] = ultimoCorte.hora_corte_motor.split(':').map(Number);
  const [ah, am] = horaApresentacao.split(':').map(Number);

  // Se datas diferentes, calcular diferença em minutos
  const corteDate = new Date(`${ultimoCorte.data}T${ultimoCorte.hora_corte_motor}:00`);
  const apresDate = new Date(`${dataVoo}T${horaApresentacao}:00`);
  const diffMinutos = Math.floor((apresDate.getTime() - corteDate.getTime()) / 60000);

  return {
    minutos: diffMinutos > 0 ? diffMinutos : null,
    ok: diffMinutos >= REPOUSO_MINIMO_MIN,
  };
}

async function evdExistsForEmpresa(
  db: D1Database,
  empresaId: number,
  evdId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT id FROM escala_voo_diaria WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
    )
    .bind(evdId, empresaId)
    .first<{ id: string }>();
  return Boolean(row?.id);
}

async function insertEvdJustificativa(params: {
  db: D1Database;
  empresaId: number;
  evdId: string;
  userId: string | null;
  payload: EvdJustificativaInsert;
}) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const id = crypto.randomUUID();
  await params.db
    .prepare(
      `INSERT INTO escala_voo_diaria_justificativas (
         id, empresa_id, escala_voo_diaria_id, funcionario_id, papel,
         origem_alerta, tipo_alerta, nivel_alerta, decisao, justificativa,
         alerta_ref_id, criado_por, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      params.empresaId,
      params.evdId,
      params.payload.funcionario_id,
      params.payload.papel,
      params.payload.origem_alerta,
      params.payload.tipo_alerta,
      params.payload.nivel_alerta,
      params.payload.decisao,
      params.payload.justificativa,
      params.payload.alerta_ref_id,
      params.userId,
      now,
    )
    .run();

  return params.db
    .prepare(
      `SELECT id, empresa_id, escala_voo_diaria_id, funcionario_id, papel, origem_alerta,
              tipo_alerta, nivel_alerta, decisao, justificativa, alerta_ref_id, criado_por, created_at
         FROM escala_voo_diaria_justificativas
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, params.empresaId)
    .first();
}

// GET /api/evd?data=YYYY-MM-DD
evdRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const data = c.req.query('data');

  if (!data) {
    return c.json({ success: false, error: 'Parâmetro obrigatório: data (YYYY-MM-DD)' }, 400);
  }

  const voos = await db
    .prepare(
      `SELECT
         e.*,
         fp.nome AS pic_nome, fp.guerra AS pic_guerra,
         fs.nome AS sic_nome, fs.guerra AS sic_guerra
       FROM escala_voo_diaria e
       LEFT JOIN funcionarios fp ON fp.id = e.pic_id
       LEFT JOIN funcionarios fs ON fs.id = e.sic_id
       WHERE e.empresa_id = ? AND e.data = ? AND e.deleted_at IS NULL
       ORDER BY e.hora_apresentacao ASC, e.hora_decolagem_prevista ASC`,
    )
    .bind(empresaId, data)
    .all();

  return c.json({ success: true, data: voos.results || [] });
});

// GET /api/evd/semana?inicio=YYYY-MM-DD
evdRoutes.get('/semana', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const inicio = c.req.query('inicio');

  if (!inicio) {
    return c.json({ success: false, error: 'Parâmetro obrigatório: inicio (YYYY-MM-DD)' }, 400);
  }

  // 7 dias a partir de inicio
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);
  const fimStr = fim.toISOString().slice(0, 10);

  const voos = await db
    .prepare(
      `SELECT
         e.*,
         fp.nome AS pic_nome, fp.guerra AS pic_guerra,
         fs.nome AS sic_nome, fs.guerra AS sic_guerra
       FROM escala_voo_diaria e
       LEFT JOIN funcionarios fp ON fp.id = e.pic_id
       LEFT JOIN funcionarios fs ON fs.id = e.sic_id
       WHERE e.empresa_id = ? AND e.data BETWEEN ? AND ? AND e.deleted_at IS NULL
       ORDER BY e.data ASC, e.hora_apresentacao ASC`,
    )
    .bind(empresaId, inicio, fimStr)
    .all();

  return c.json({ success: true, data: voos.results || [] });
});

// GET /api/evd/:id
evdRoutes.get('/:id', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');

  const voo = await db
    .prepare(
      `SELECT
         e.*,
         fp.nome AS pic_nome, fp.guerra AS pic_guerra,
         fs.nome AS sic_nome, fs.guerra AS sic_guerra
       FROM escala_voo_diaria e
       LEFT JOIN funcionarios fp ON fp.id = e.pic_id
       LEFT JOIN funcionarios fs ON fs.id = e.sic_id
       WHERE e.id = ? AND e.empresa_id = ? AND e.deleted_at IS NULL`,
    )
    .bind(id, empresaId)
    .first();

  if (!voo) return c.json({ success: false, error: 'Voo não encontrado' }, 404);
  return c.json({ success: true, data: voo });
});

// GET /api/evd/:id/justificativas
evdRoutes.get('/:id/justificativas', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const evdId = c.req.param('id');

  const exists = await evdExistsForEmpresa(db, empresaId, evdId);
  if (!exists) return c.json({ success: false, error: 'Voo não encontrado' }, 404);

  const rows = await db
    .prepare(
      `SELECT id, empresa_id, escala_voo_diaria_id, funcionario_id, papel, origem_alerta,
              tipo_alerta, nivel_alerta, decisao, justificativa, alerta_ref_id, criado_por, created_at
         FROM escala_voo_diaria_justificativas
        WHERE empresa_id = ? AND escala_voo_diaria_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC`,
    )
    .bind(empresaId, evdId)
    .all();

  return c.json({ success: true, data: rows.results || [] });
});

// POST /api/evd/:id/justificativas
evdRoutes.post('/:id/justificativas', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const evdId = c.req.param('id');
  const userId = c.get('userId');

  const exists = await evdExistsForEmpresa(db, empresaId, evdId);
  if (!exists) return c.json({ success: false, error: 'Voo não encontrado' }, 404);

  const body = await c.req.json();
  const parsed = justificativaCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
      400,
    );
  }

  const created = await insertEvdJustificativa({
    db,
    empresaId,
    evdId,
    userId: userId ? String(userId) : null,
    payload: {
      funcionario_id: parsed.data.funcionario_id ?? null,
      papel: parsed.data.papel ?? null,
      origem_alerta: parsed.data.origem_alerta,
      tipo_alerta: parsed.data.tipo_alerta ?? null,
      nivel_alerta: parsed.data.nivel_alerta ?? null,
      decisao: parsed.data.decisao,
      justificativa: parsed.data.justificativa,
      alerta_ref_id: parsed.data.alerta_ref_id ?? null,
    },
  });

  return c.json({ success: true, data: created }, 201);
});

// POST /api/evd
evdRoutes.post('/', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const body = await c.req.json();
  const parsed = evdCreateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
      400,
    );
  }

  const d = parsed.data;
  if (d.pic_id && d.sic_id && d.pic_id === d.sic_id) {
    return c.json({ success: false, error: MSG_PIC_SIC_SAME }, 400);
  }

  const hasConflict = await hasCrewConflict({
    db,
    empresaId,
    data: d.data,
    picId: d.pic_id ?? null,
    sicId: d.sic_id ?? null,
    window: {
      hora_apresentacao: d.hora_apresentacao,
      hora_decolagem_prevista: d.hora_decolagem_prevista,
      hora_pouso_previsto: d.hora_pouso_previsto,
    },
  });
  if (hasConflict) {
    return c.json({ success: false, error: MSG_DUPLICATE_CREW }, 409);
  }

  const warnings: string[] = [];
  const operationalChecks = await collectOperationalWarningsAndBlocks({
    db,
    empresaId,
    data: d.data,
    escalaId: d.escala_id || null,
    picId: d.pic_id ?? null,
    sicId: d.sic_id ?? null,
    aeronavePrefixo: d.aeronave_prefixo || null,
    aeronaveModelo: d.aeronave_modelo || null,
  });
  if (operationalChecks.hardError) {
    return c.json({ success: false, error: operationalChecks.hardError }, 400);
  }
  warnings.push(...operationalChecks.warnings);

  // Validação de repouso para PIC
  if (d.pic_id) {
    const repPic = await calcRepouso(db, empresaId, d.pic_id, d.data, d.hora_apresentacao);
    if (repPic.minutos !== null && !repPic.ok) {
      warnings.push(
        `PIC: repouso insuficiente (${Math.floor(repPic.minutos / 60)}h${repPic.minutos % 60}m < 12h30 mínimo)`,
      );
    }
  }

  // Validação de repouso para SIC
  if (d.sic_id) {
    const repSic = await calcRepouso(db, empresaId, d.sic_id, d.data, d.hora_apresentacao);
    if (repSic.minutos !== null && !repSic.ok) {
      warnings.push(
        `SIC: repouso insuficiente (${Math.floor(repSic.minutos / 60)}h${repSic.minutos % 60}m < 12h30 mínimo)`,
      );
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Calc repouso for storage
  let repousoMinutos: number | null = null;
  let repousoOk = 1;
  if (d.pic_id && d.hora_apresentacao) {
    const r = await calcRepouso(db, empresaId, d.pic_id, d.data, d.hora_apresentacao);
    repousoMinutos = r.minutos;
    repousoOk = r.ok ? 1 : 0;
  }

  await db
    .prepare(
      `INSERT INTO escala_voo_diaria (
         id, empresa_id, escala_id, data, status,
         pic_id, sic_id, pic_funcao, sic_funcao,
         aeronave_prefixo, aeronave_modelo,
         hora_apresentacao, hora_decolagem_prevista, hora_pouso_previsto,
         hora_decolagem_real, hora_pouso_real, hora_corte_motor,
         repouso_anterior_minutos, repouso_minimo_ok,
         origem, destino, tipo_missao, observacoes,
         criado_por, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'RASCUNHO',
         ?, ?, ?, ?,
         ?, ?,
         ?, ?, ?,
         ?, ?, ?,
         ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?)`,
    )
    .bind(
      id,
      empresaId,
      d.escala_id || null,
      d.data,
      d.pic_id || null,
      d.sic_id || null,
      d.pic_funcao || null,
      d.sic_funcao || null,
      d.aeronave_prefixo || null,
      d.aeronave_modelo || null,
      d.hora_apresentacao || null,
      d.hora_decolagem_prevista || null,
      d.hora_pouso_previsto || null,
      d.hora_decolagem_real || null,
      d.hora_pouso_real || null,
      d.hora_corte_motor || null,
      repousoMinutos,
      repousoOk,
      d.origem || null,
      d.destino || null,
      d.tipo_missao,
      d.observacoes || null,
      null,
      now,
      now,
    )
    .run();

  return c.json(
    {
      success: true,
      data: {
        id,
        warnings,
        require_justificativa_operacional: operationalChecks.requiresOperationalJustification,
      },
    },
    201,
  );
});

// PUT /api/evd/:id
evdRoutes.put('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await db
    .prepare(
      'SELECT id, status FROM escala_voo_diaria WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(id, empresaId)
    .first<{ id: string; status: string }>();

  if (!existing) return c.json({ success: false, error: 'Voo não encontrado' }, 404);

  const nextPicId =
    'pic_id' in body ? (body.pic_id == null ? null : Number(body.pic_id)) : null;
  const nextSicId =
    'sic_id' in body ? (body.sic_id == null ? null : Number(body.sic_id)) : null;
  if (
    typeof nextPicId === 'number' &&
    typeof nextSicId === 'number' &&
    Number.isFinite(nextPicId) &&
    Number.isFinite(nextSicId) &&
    nextPicId === nextSicId
  ) {
    return c.json({ success: false, error: MSG_PIC_SIC_SAME }, 400);
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  const allowed = [
    'data',
    'pic_id',
    'sic_id',
    'pic_funcao',
    'sic_funcao',
    'aeronave_prefixo',
    'aeronave_modelo',
    'hora_apresentacao',
    'hora_decolagem_prevista',
    'hora_pouso_previsto',
    'hora_decolagem_real',
    'hora_pouso_real',
    'hora_corte_motor',
    'origem',
    'destino',
    'tipo_missao',
    'observacoes',
  ];

  for (const key of allowed) {
    if (key in body) {
      fields.push(`${key} = ?`);
      values.push(body[key] ?? null);
    }
  }

  if (fields.length === 0) {
    return c.json({ success: false, error: 'Nenhum campo para atualizar' }, 400);
  }

  fields.push('updated_at = ?');
  values.push(new Date().toISOString().replace('T', ' ').slice(0, 19));
  values.push(id);
  values.push(empresaId);

  await db
    .prepare(
      `UPDATE escala_voo_diaria SET ${fields.join(', ')} WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(...values)
    .run();

  return c.json({ success: true });
});

// DELETE /api/evd/:id
evdRoutes.delete('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const res = await db
    .prepare(
      'UPDATE escala_voo_diaria SET deleted_at = ?, updated_at = ? WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(now, now, id, empresaId)
    .run();

  if (!res.meta?.changes) return c.json({ success: false, error: 'Voo não encontrado' }, 404);
  return c.json({ success: true });
});

// POST /api/evd/:id/publicar
evdRoutes.post('/:id/publicar', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');
  const userId = c.get('userId');
  let publishInput: z.infer<typeof publicarSchema> = {};

  try {
    const rawBody = await c.req.json();
    const parsedBody = publicarSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsedBody.error.flatten() },
        400,
      );
    }
    publishInput = parsedBody.data;
  } catch {
    publishInput = {};
  }

  const voo = await db
    .prepare(
      `SELECT id, status, data, escala_id, pic_id, sic_id, aeronave_prefixo, aeronave_modelo, repouso_minimo_ok, observacoes,
              hora_apresentacao, hora_decolagem_prevista, hora_pouso_previsto
         FROM escala_voo_diaria
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, empresaId)
    .first<{
      id: string;
      status: string;
      data: string;
      escala_id: string | null;
      pic_id: number | null;
      sic_id: number | null;
      aeronave_prefixo: string | null;
      aeronave_modelo: string | null;
      repouso_minimo_ok: number;
      observacoes: string | null;
      hora_apresentacao: string | null;
      hora_decolagem_prevista: string | null;
      hora_pouso_previsto: string | null;
    }>();

  if (!voo) return c.json({ success: false, error: 'Voo não encontrado' }, 404);
  if (voo.status === 'PUBLICADA') return c.json({ success: false, error: 'Voo já publicado' }, 400);

  if (!voo.pic_id || !voo.sic_id) {
    return c.json({ success: false, error: MSG_PUBLISH_CREW_REQUIRED }, 400);
  }

  if (voo.pic_id === voo.sic_id) {
    return c.json({ success: false, error: MSG_PIC_SIC_SAME }, 400);
  }

  const conflictOnPublish = await hasCrewConflict({
    db,
    empresaId,
    data: voo.data,
    picId: voo.pic_id,
    sicId: voo.sic_id,
    window: {
      hora_apresentacao: voo.hora_apresentacao,
      hora_decolagem_prevista: voo.hora_decolagem_prevista,
      hora_pouso_previsto: voo.hora_pouso_previsto,
    },
    excludeId: voo.id,
  });
  if (conflictOnPublish) {
    return c.json({ success: false, error: MSG_DUPLICATE_CREW }, 409);
  }

  // Block publication if rest violation
  if (voo.repouso_minimo_ok === 0) {
    return c.json({ success: false, error: MSG_REST_INVALID }, 400);
  }

  const operationalChecks = await collectOperationalWarningsAndBlocks({
    db,
    empresaId,
    data: voo.data,
    escalaId: voo.escala_id || null,
    picId: voo.pic_id,
    sicId: voo.sic_id,
    aeronavePrefixo: voo.aeronave_prefixo,
    aeronaveModelo: voo.aeronave_modelo,
  });
  if (operationalChecks.hardError) {
    return c.json({ success: false, error: operationalChecks.hardError }, 400);
  }

  if (publishInput.justificativa) {
    await insertEvdJustificativa({
      db,
      empresaId,
      evdId: voo.id,
      userId: userId ? String(userId) : null,
      payload: {
        funcionario_id: publishInput.justificativa.funcionario_id ?? null,
        papel: publishInput.justificativa.papel ?? null,
        origem_alerta: publishInput.justificativa.origem_alerta,
        tipo_alerta: publishInput.justificativa.tipo_alerta ?? null,
        nivel_alerta: publishInput.justificativa.nivel_alerta ?? null,
        decisao: publishInput.justificativa.decisao,
        justificativa: publishInput.justificativa.justificativa,
        alerta_ref_id: publishInput.justificativa.alerta_ref_id ?? null,
      },
    });
  }

  if (publishInput.require_justificativa || operationalChecks.requiresOperationalJustification) {
    const existingJustificativa = await db
      .prepare(
        `SELECT id
           FROM escala_voo_diaria_justificativas
          WHERE empresa_id = ? AND escala_voo_diaria_id = ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(empresaId, voo.id)
      .first<{ id: string }>();

    const hasStructuredJustificativa = Boolean(existingJustificativa?.id);
    const hasLegacyObservacao = (voo.observacoes || '').trim().length >= 10;
    if (!hasStructuredJustificativa && !hasLegacyObservacao) {
      const code = operationalChecks.requiresOperationalJustification
        ? 'OPERATIONAL_ROLE_REVIEW_REQUIRED'
        : 'JUSTIFICATIVA_OPERACIONAL_OBRIGATORIA';
      return c.json(
        {
          success: false,
          code,
          requires_justificativa: true,
          warnings: operationalChecks.warnings,
          error: operationalChecks.requiresOperationalJustification
            ? MSG_PIC_ROLE_REVIEW
            : 'Justificativa operacional obrigatória para publicação com revisão FRMS/operacional.',
        },
        400,
      );
    }
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  await db
    .prepare(
      "UPDATE escala_voo_diaria SET status = 'PUBLICADA', aprovado_em = ?, updated_at = ? WHERE id = ? AND empresa_id = ?",
    )
    .bind(now, now, id, empresaId)
    .run();

  return c.json({ success: true });
});

export default evdRoutes;
