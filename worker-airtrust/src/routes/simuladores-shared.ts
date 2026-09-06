/**
 * SIMULADORES — Shared utilities, helpers, and schemas
 * Imported by simuladores-core.ts and all sub-module files.
 */

import { z } from 'zod';
import type { Context } from 'hono';
import type { Env } from '../types';
import {
  CANCELLED_STATUS_VALUES,
  isCancelledStatus,
  PLANNED_QUALIFICATION_STATUS_VALUES,
  QUALIFICACAO_STATUS,
  sqlStatusEqualsAny,
  sqlStatusNotEqualsAny,
} from '../lib/status/status-codes';
import { replaceManagedEscalaEvents } from '../shared/syncEscalaEventosExternos';

// ── Zod schemas ──────────────────────────────────────────────────────────────

export const TipoSessaoSchema = z.object({
  codigo: z.string().min(1, 'Código obrigatório').max(20),
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).nullish(),
  cor: z.string().max(20).nullish(),
});

export const ModeloSessaoSchema = z.object({
  codigo: z.string().min(1, 'Código obrigatório').max(20),
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  tipo_sessao_id: z.coerce.number().int().positive().nullish(),
  tipo: z.enum(['SIMULADOR', 'AERONAVE']).optional().default('SIMULADOR'),
  modelo_aeronave: z.string().max(50).nullish(),
  descricao: z.string().max(500).nullish(),
  duracao_estimada: z.coerce.number().int().positive().optional().default(120),
  gera_qualificacao: z.coerce.number().int().min(0).max(1).optional().default(0),
  qualificacao_tipo_id: z.coerce.number().int().positive().nullish(),
  checks_ids: z.array(z.coerce.number().int().positive()).optional().default([]),
  manobras: z
    .array(
      z.object({
        manobra_id: z.coerce.number().int().positive(),
        ordem: z.coerce.number().int().optional(),
        obrigatoria: z.coerce.number().int().min(0).max(1).optional().default(1),
        observacoes: z.string().max(500).nullish(),
      }),
    )
    .optional()
    .default([]),
});

export const CategoriaSimuladoresSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).nullish(),
  cor: z.string().max(20).nullish(),
  codigo: z.string().max(30).nullish(),
});

export const ManobraSchema = z.object({
  codigo: z.string().min(1, 'Código obrigatório').max(20),
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).nullish(),
  categoria: z.string().max(50).optional(),
  tipo_sessao: z.string().max(50).optional(),
  tipo_aeronave: z.string().max(50).optional(),
  ordem: z.coerce.number().int().optional(),
  nivel_dificuldade: z.string().max(20).nullish(),
  tempo_estimado: z.coerce.number().int().nullish(),
  pontuacao_minima: z.coerce.number().nullish(),
});

export interface CheckTipoRecord {
  id: number;
  codigo: string;
  nome?: string | null;
  descricao?: string | null;
}

// ── Helper functions ─────────────────────────────────────────────────────────

export function requireAdminForDelete(c: Context<{ Bindings: Env }>): Response | null {
  const userRole = (c as any).get('userRole');
  const normalizedRole =
    typeof userRole === 'string' ? userRole.toLowerCase() : String(userRole || '').toLowerCase();

  const canDelete = ['admin', 'administrador', 'gestor', 'manager'].includes(normalizedRole);

  if (!canDelete) {
    return c.json(
      {
        success: false,
        error:
          'Acesso negado. Apenas gestores e administradores podem excluir registros de simuladores.',
      },
      403,
    );
  }

  return null;
}

export function timeToMinutes(h: unknown): number | null {
  if (typeof h !== 'string') return null;
  if (h.length < 5) return null;
  const hh = Number(h.slice(0, 2));
  const mm = Number(h.slice(3, 5));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function normalizeModeloAeronave(modeloAeronave: unknown): string {
  const normalized = String(modeloAeronave || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  const compact = normalized.replace(/[^A-Z0-9]/g, '');

  if (compact.includes('AW139')) return 'AW139';
  if (compact.includes('SK76') || compact.includes('S76')) return 'SK76';

  return compact;
}

export function isCheckCompativelComModeloAeronave(
  codigoCheck: unknown,
  modeloAeronave: unknown,
): boolean {
  const codigo = String(codigoCheck || '')
    .trim()
    .toUpperCase();
  const modelo = normalizeModeloAeronave(modeloAeronave);

  if (!codigo || !modelo) {
    return true;
  }

  if (codigo.endsWith('-139')) {
    return modelo.includes('139');
  }

  if (codigo.endsWith('-76')) {
    return modelo.includes('76');
  }

  return true;
}

export function filtrarChecksCompativeisComModelo<T extends { codigo?: string | null }>(
  checks: T[],
  modeloAeronave: unknown,
): T[] {
  return checks.filter((check) => isCheckCompativelComModeloAeronave(check.codigo, modeloAeronave));
}

export async function listarTiposCheckPorIds(
  db: D1Database,
  ids: number[],
  empresaId?: number,
): Promise<CheckTipoRecord[]> {
  const idsUnicos = Array.from(
    new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)),
  );

  if (idsUnicos.length === 0) {
    return [];
  }

  const placeholders = idsUnicos.map(() => '?').join(',');
  const scopedFilter = empresaId ? ' AND qt.empresa_id = ? AND qc.empresa_id = qt.empresa_id' : '';
  const result = await db
    .prepare(
      `SELECT qt.id, qt.codigo, qt.nome, qt.descricao
       FROM qualificacoes_tipos qt
       JOIN qualificacoes_categorias qc ON qt.categoria_id = qc.id
       WHERE qt.id IN (${placeholders})
         AND qt.deleted_at IS NULL
         AND qt.ativo = 1
         AND qc.deleted_at IS NULL
         AND qc.ativo = 1
         AND UPPER(COALESCE(qc.codigo, '')) = 'CHECK'${scopedFilter}`,
    )
    .bind(...idsUnicos, ...(empresaId ? [empresaId] : []))
    .all<CheckTipoRecord>();

  return result.results || [];
}

/**
 * Checks whether the simuladores table has an empresa_id column.
 * The table may be global (no empresa_id) or tenant-scoped (with empresa_id).
 * Caches the result per D1Database instance to avoid repeated PRAGMA calls.
 */
const simuladoresHasEmpresaIdCache = new WeakMap<D1Database, boolean>();

export async function simuladoresHasEmpresaId(db: D1Database): Promise<boolean> {
  const cached = simuladoresHasEmpresaIdCache.get(db);
  if (cached !== undefined) {
    return cached;
  }

  const result = await db.prepare('PRAGMA table_info(simuladores)').all<{ name: string }>();

  const has = (result.results || []).some((row) => String(row.name || '') === 'empresa_id');

  simuladoresHasEmpresaIdCache.set(db, has);
  return has;
}

/**
 * Checks whether the fichas_sessao_manobras table has an empresa_id column.
 * Caches the result per D1Database instance.
 */
const fichasSessaoManobrasHasEmpresaIdCache = new WeakMap<D1Database, boolean>();

export async function fichasSessaoManobrasHasEmpresaId(db: D1Database): Promise<boolean> {
  const cached = fichasSessaoManobrasHasEmpresaIdCache.get(db);
  if (cached !== undefined) {
    return cached;
  }

  const result = await db
    .prepare('PRAGMA table_info(fichas_sessao_manobras)')
    .all<{ name: string }>();

  const has = (result.results || []).some((row) => String(row.name || '') === 'empresa_id');

  fichasSessaoManobrasHasEmpresaIdCache.set(db, has);
  return has;
}

export async function getSimuladorModeloAeronave(
  db: D1Database,
  simuladorId: string | number | null | undefined,
  empresaId?: number,
): Promise<string> {
  if (simuladorId == null) {
    return '';
  }

  const hasEmpresaId = empresaId != null && (await simuladoresHasEmpresaId(db));
  const scopedFilter = hasEmpresaId ? ' AND empresa_id = ?' : '';
  const simulador = await db
    .prepare(
      `SELECT COALESCE(aeronave_codigo, codigo_aeronave, tipo, modelo, '') AS modelo_aeronave
       FROM simuladores
       WHERE id = ? AND deleted_at IS NULL${scopedFilter}
       LIMIT 1`,
    )
    .bind(simuladorId, ...(hasEmpresaId ? [empresaId] : []))
    .first<{ modelo_aeronave: string | null }>();

  return normalizeModeloAeronave(simulador?.modelo_aeronave);
}

function addDaysToIsoDate(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return date;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function buildAbsoluteInterval(date: string, inicioMin: number, fimMin: number) {
  const baseDay = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(baseDay.getTime())) return null;

  const startAbs = Math.floor(baseDay.getTime() / 60000) + inicioMin;
  let endAbs = Math.floor(baseDay.getTime() / 60000) + fimMin;

  if (fimMin <= inicioMin) {
    endAbs += 24 * 60;
  }

  return { startAbs, endAbs };
}

export function getStatusEventoEscala(status: unknown): 'confirmado' | 'pendente' | 'cancelado' {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();

  if (normalized.includes('CANCEL')) return 'cancelado';
  if (normalized.includes('PEND')) return 'pendente';
  return 'confirmado';
}

export async function getSimuladorLabel(
  db: D1Database,
  simuladorId: string | number | null | undefined,
) {
  if (simuladorId == null) return null;

  const simulador = await db
    .prepare(`SELECT nome, tipo FROM simuladores WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(simuladorId)
    .first<{ nome: string | null; tipo: string | null }>();

  return simulador?.nome || simulador?.tipo || null;
}

export async function syncSessaoEscalaEventos(
  db: D1Database,
  params: {
    empresaId?: string | number | null;
    sessaoId: string | number;
    simuladorId?: string | number | null;
    data: string;
    status?: unknown;
    temaSessao?: string | null;
    tipoSessao?: string | null;
    observacoes?: string | null;
    participantes: Array<{ funcionario_id: string | number }>;
    createdBy: string;
  },
) {
  const local = await getSimuladorLabel(db, params.simuladorId);
  const statusEvento = getStatusEventoEscala(params.status);
  const descricao = [params.temaSessao, params.tipoSessao].filter(Boolean).join(' · ') || null;

  await Promise.all(
    params.participantes.map((participante) =>
      replaceManagedEscalaEvents({
        db,
        empresaId: params.empresaId,
        funcionarioId: participante.funcionario_id,
        origem: 'simuladores',
        linkId: `sim_sessao:${params.sessaoId}`,
        tipoEvento: 'treinamento_simulador',
        dataInicio: params.data,
        dataFim: params.data,
        createdBy: params.createdBy,
        status: statusEvento,
        local,
        simuladorId: params.simuladorId,
        observacoes: descricao || params.observacoes || null,
        motivoAutomatico:
          'Gerado automaticamente a partir da sessão de simulador. Gerencie no módulo Simuladores.',
        replaceAutoTipos: ['voo', 'folga'],
      }),
    ),
  );
}

export async function findSessaoConflict(
  db: D1Database,
  p: {
    simuladorId: number;
    data: string;
    inicioMin: number;
    fimMin: number;
    excludeId?: string | number;
  },
) {
  const datasRelevantes = [addDaysToIsoDate(p.data, -1), p.data, addDaysToIsoDate(p.data, 1)];

  const query = `
    SELECT sa.id, sa.data, sa.hora_inicio, sa.hora_fim
    FROM simulador_agendamentos sa
    WHERE sa.deleted_at IS NULL
      AND sa.simulador_id = ?
      AND sa.data IN (?, ?, ?)
      AND sa.hora_inicio IS NOT NULL
      AND sa.hora_fim IS NOT NULL
      ${p.excludeId !== undefined && p.excludeId !== null ? 'AND sa.id != ?' : ''}
    ORDER BY sa.data, sa.hora_inicio
  `;

  const bindings: Array<string | number> = [p.simuladorId, ...datasRelevantes];
  if (p.excludeId !== undefined && p.excludeId !== null) {
    bindings.push(p.excludeId);
  }

  const candidatos = await db
    .prepare(query)
    .bind(...bindings)
    .all<{ id: number; data: string; hora_inicio: string; hora_fim: string }>();

  const novaJanela = buildAbsoluteInterval(p.data, p.inicioMin, p.fimMin);
  if (!novaJanela) return null;

  for (const sessao of candidatos.results || []) {
    const inicioExistenteMin = timeToMinutes(sessao.hora_inicio);
    const fimExistenteMin = timeToMinutes(sessao.hora_fim);

    if (inicioExistenteMin === null || fimExistenteMin === null) {
      continue;
    }

    const janelaExistente = buildAbsoluteInterval(sessao.data, inicioExistenteMin, fimExistenteMin);

    if (!janelaExistente) {
      continue;
    }

    if (
      novaJanela.startAbs < janelaExistente.endAbs &&
      novaJanela.endAbs > janelaExistente.startAbs
    ) {
      return sessao;
    }
  }

  return null;
}

export function isFullAccessRole(role: string): boolean {
  return ['ADMIN', 'ADMINISTRADOR', 'GESTOR', 'MANAGER', 'COMPLIANCE'].includes(role.toUpperCase());
}

/**
 * Bloqueio de autoavaliação na criação/edição de sessões e fichas: o
 * instrutor responsável pela sessão nunca pode também constar como
 * participante avaliado na mesma sessão. Não se aplica às fichas especiais
 * TRE-INST/CRED-EXA (fluxo próprio, inalterado, onde o avaliador é o campo
 * `examinador_id`, distinto do instrutor sendo avaliado).
 */
export function instrutorEstaEntreParticipantes(
  instrutorId: unknown,
  participantes: Array<{ funcionario_id?: unknown } | null | undefined>,
): boolean {
  const instrutorNum = Number(instrutorId);
  if (!Number.isFinite(instrutorNum) || instrutorNum <= 0) return false;
  return (participantes || []).some((p) => Number(p?.funcionario_id) === instrutorNum);
}

/**
 * Erros lançados por assertEntityOwnership (participante/instrutor/simulador/
 * modelo/treinamento "fora do tenant") não devem vazar para o cliente — nem
 * a existência do registro em outro tenant, nem qual entidade especificamente
 * falhou. Mapeia para 404 genérico, igual a "não encontrado".
 */
export function isCrossTenantOwnershipMessage(message: string): boolean {
  return /fora do tenant$/i.test(message.trim());
}

export function crossTenantSafeResponseStatusAndMessage(
  message: string,
  fallbackBusinessErrorStatus: 400 | 500,
): { status: 404 | 400 | 500; message: string } {
  if (isCrossTenantOwnershipMessage(message)) {
    return { status: 404, message: 'Registro não encontrado' };
  }
  return { status: fallbackBusinessErrorStatus, message };
}

export async function resolveTemplateIdSessao(
  db: D1Database,
  params: {
    empresaId: number;
    templateId?: unknown;
    modeloSessaoId?: unknown;
    temaSessao?: unknown;
    tipoSessaoCodigo?: unknown;
    modeloAeronave?: unknown;
  },
): Promise<number | null> {
  const explicit = Number(params.templateId || params.modeloSessaoId);
  if (Number.isInteger(explicit) && explicit > 0) {
    const explicitRow = await db
      .prepare(
        `SELECT id FROM modelos_sessao WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(explicit, params.empresaId)
      .first<{ id: number }>();
    // Fail-open by design: an explicit id that doesn't belong to this tenant
    // or is archived falls through to the by-name resolution below instead
    // of trusting client-supplied cross-tenant input.
    if (explicitRow?.id) {
      return explicit;
    }
  }

  const temaSessao = String(params.temaSessao || '').trim();
  if (!temaSessao) {
    return null;
  }

  const modeloAeronave = normalizeModeloAeronave(params.modeloAeronave);
  const tipoSessaoCodigo = String(params.tipoSessaoCodigo || '')
    .trim()
    .toUpperCase();

  const result = await db
    .prepare(
      `SELECT ms.id
       FROM modelos_sessao ms
       LEFT JOIN tipos_sessao ts
         ON ts.id = ms.tipo_sessao_id
        AND ts.deleted_at IS NULL
        AND ts.empresa_id = ?
       WHERE ms.deleted_at IS NULL
         AND ms.empresa_id = ?
         AND ms.nome = ?
         AND (? = '' OR UPPER(COALESCE(ts.codigo, '')) = ?)
         AND (? = '' OR UPPER(COALESCE(ms.modelo_aeronave, '')) = ?)
       ORDER BY ms.id DESC
       LIMIT 1`,
    )
    .bind(
      params.empresaId,
      params.empresaId,
      temaSessao,
      tipoSessaoCodigo,
      tipoSessaoCodigo,
      modeloAeronave,
      modeloAeronave,
    )
    .first<{ id: number }>();

  return result?.id ? Number(result.id) : null;
}

export async function normalizeChecksSessao(
  db: D1Database,
  checkIds: unknown,
  modeloAeronave: unknown,
  empresaId?: number,
): Promise<number[]> {
  const idsUnicos = Array.isArray(checkIds)
    ? Array.from(
        new Set(checkIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)),
      )
    : [];

  if (idsUnicos.length === 0) {
    return [];
  }

  const checksEncontrados = await listarTiposCheckPorIds(db, idsUnicos, empresaId);
  if (checksEncontrados.length !== idsUnicos.length) {
    const idsValidos = new Set(checksEncontrados.map((check) => Number(check.id)));
    const idsInvalidos = idsUnicos.filter((id) => !idsValidos.has(id));
    throw new Error(`Tipos de check inválidos: ${idsInvalidos.join(', ')}`);
  }

  return filtrarChecksCompativeisComModelo(checksEncontrados, modeloAeronave).map((check) =>
    Number(check.id),
  );
}

export async function getFuncId(
  db: D1Database,
  userId: string | number,
  empresaId: string | number,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT f.id FROM usuarios u
       JOIN funcionarios f ON f.id = u.funcionario_id
       WHERE u.id = ? AND f.empresa_id = ?
         AND (u.deleted_at IS NULL OR u.deleted_at = 0)
         AND f.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(String(userId), String(empresaId))
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function audit(db: D1Database, p: any) {
  // Tabela garantida por migration — sem DDL em runtime (M-2: remove sqlite_master overhead)
  try {
    await db
      .prepare(
        'INSERT INTO auditoria_avancada_v2(tabela,acao,registro_id,dados_anteriores,dados_novos)VALUES(?,?,?,?,?)',
      )
      .bind(
        p.tabela,
        p.acao,
        String(p.registro_id),
        p.dados_anteriores ? JSON.stringify(p.dados_anteriores) : null,
        p.dados_novos ? JSON.stringify(p.dados_novos) : null,
      )
      .run();
  } catch (e) {
    console.error('audit:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Criar qualificações PLANEJADAS ao agendar uma sessão
// Vincula pelo campo sessao_id (migration 0098). Sem duplication: verifica
// existência prévia pelo par (sessao_id, funcionario_id).
// ─────────────────────────────────────────────────────────────────────────────
export async function listarParticipantesDaSessaoParaQualificacao(
  db: D1Database,
  sessaoId: string | number,
): Promise<Array<{ funcionario_id: number }>> {
  // Primary source: sessoes_participantes (canonical participant table)
  const partRows = await db
    .prepare(
      `SELECT DISTINCT funcionario_id
       FROM sessoes_participantes
       WHERE sessao_id = ? AND deleted_at IS NULL`,
    )
    .bind(sessaoId)
    .all<{ funcionario_id: number }>();

  if (partRows.results?.length) {
    return partRows.results;
  }

  // Fallback: fichas_sessao (via colaborador_id_aluno)
  const fichaRows = await db
    .prepare(
      `SELECT DISTINCT fs.colaborador_id_aluno AS funcionario_id
       FROM fichas_sessao fs
       WHERE fs.agendamento_slot_id = ? AND fs.deleted_at IS NULL`,
    )
    .bind(sessaoId)
    .all<{ funcionario_id: number }>();

  return fichaRows.results || [];
}

export async function criarQualificacoesPlanejadas(
  db: D1Database,
  params: {
    sessaoId: number;
    modeloId: number;
    tipoSessao: string;
    data: string;
    participantes: Array<{ funcionario_id: number }>;
    empresaId: number;
  },
): Promise<{
  criadas: number;
  puladas: number;
  conflitosUniques: number;
  bloqueadasDataPassada: number;
}> {
  const modelo = await db
    .prepare(
      `SELECT ms.gera_qualificacao, ms.qualificacao_tipo_id, ms.duracao_estimada,
              qt.codigo  AS qual_codigo,
              qt.categoria AS qual_categoria,
              qt.validade  AS qual_validade
       FROM modelos_sessao ms
       LEFT JOIN qualificacoes_tipos qt
         ON ms.qualificacao_tipo_id = qt.id
        AND qt.deleted_at IS NULL
        AND qt.empresa_id = ?
       WHERE ms.id = ?
         AND ms.empresa_id = ?
         AND ms.deleted_at IS NULL`,
    )
    .bind(params.empresaId, params.modeloId, params.empresaId)
    .first<{
      gera_qualificacao: number;
      qualificacao_tipo_id: number | null;
      duracao_estimada: number | null;
      qual_codigo: string | null;
      qual_categoria: string | null;
      qual_validade: number | null;
    }>();

  if (!modelo || !modelo.gera_qualificacao || !modelo.qualificacao_tipo_id || !modelo.qual_codigo) {
    return { criadas: 0, puladas: 0, conflitosUniques: 0, bloqueadasDataPassada: 0 };
  }

  const requisitos = await carregarRequisitosModeloSessao(db, params.modeloId, params.empresaId);

  // Structured session qualification typing only — never substring of code/title.
  const TIPO_TREINAMENTO_MAP: Record<string, string> = {
    INI: 'INICIAL',
    INICIAL: 'INICIAL',
    PER: 'RECORRENTE',
    PERIODICO: 'RECORRENTE',
    RECORRENTE: 'RECORRENTE',
    SEM: 'SEMESTRAL',
    SEMESTRAL: 'SEMESTRAL',
    CHECK: 'RECORRENTE',
    UPGRADE: 'UPGRADE',
    ESPECIFICO: 'ESPECIFICO',
  };
  const tipoRaw = String(params.tipoSessao || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  // Refuse code/title-like values (e.g. A139-P-01/04-C1) to prevent Semestral false positives.
  if (/[0-9]/.test(tipoRaw) || tipoRaw.includes('/') || tipoRaw.includes('-')) {
    return { criadas: 0, puladas: 0, conflitosUniques: 0, bloqueadasDataPassada: 0 };
  }
  const tipoTreinamento = TIPO_TREINAMENTO_MAP[tipoRaw];
  if (!tipoTreinamento) {
    return { criadas: 0, puladas: 0, conflitosUniques: 0, bloqueadasDataPassada: 0 };
  }

  const stmts: ReturnType<typeof db.prepare>[] = [];
  let criadas = 0;
  let puladas = 0;
  let conflitosUniques = 0;
  let bloqueadasDataPassada = 0;
  const hojeIso = new Date().toISOString().slice(0, 10);
  const dataSessao = String(params.data || '').slice(0, 10);

  for (const part of params.participantes) {
    // Regra de negócio: PLANEJADA é apenas para data futura/hoje.
    if (dataSessao && dataSessao < hojeIso) {
      bloqueadasDataPassada++;
      continue;
    }

    if (requisitos.length > 0) {
      const requisitosAtendidos = await funcionarioAtendeRequisitosModelo(db, {
        empresaId: params.empresaId,
        funcionarioId: part.funcionario_id,
        requisitos,
      });
      if (!requisitosAtendidos) {
        puladas++;
        continue;
      }
    }

    // Check 1: already has a planejada linked to this session
    const existing = await db
      .prepare(
        `SELECT id, status FROM qualificacoes_historico
         WHERE sessao_id = ?
           AND funcionario_id = ?
           AND deleted_at IS NULL
           AND ${sqlStatusNotEqualsAny('status', CANCELLED_STATUS_VALUES, '')}
         LIMIT 1`,
      )
      .bind(params.sessaoId, part.funcionario_id)
      .first<{ id: number; status: string | null }>();

    if (existing) {
      puladas++;
      continue;
    }

    // Check 2: UNIQUE constraint on (funcionario_id, qualificacao_codigo, data_conclusao)
    const uniqueConflict = await db
      .prepare(
        `SELECT id, status, sessao_id FROM qualificacoes_historico
         WHERE funcionario_id = ?
           AND qualificacao_codigo = ?
           AND data_conclusao = ?
           AND empresa_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(part.funcionario_id, modelo.qual_codigo, params.data, params.empresaId)
      .first<{ id: number; status: string; sessao_id: number | null }>();

    if (uniqueConflict) {
      // CANCELADA orphan records or same-session records can be archived and recreated.
      // This preserves history while unblocking a new active PLANEJADA record.
      if (
        isCancelledStatus(uniqueConflict.status) &&
        (!uniqueConflict.sessao_id || Number(uniqueConflict.sessao_id) === Number(params.sessaoId))
      ) {
        await db
          .prepare(
            `UPDATE qualificacoes_historico
             SET deleted_at = datetime('now'), updated_at = datetime('now')
             WHERE id = ? AND empresa_id = ?`,
          )
          .bind(uniqueConflict.id, params.empresaId)
          .run();
      } else {
        conflitosUniques++;
        continue;
      }
    }

    stmts.push(
      db
        .prepare(
          `INSERT INTO qualificacoes_historico
             (funcionario_id, qualificacao_id, qualificacao_codigo, categoria,
              data_conclusao, validade_meses, status, renovada,
              carga_horaria, tipo_treinamento, empresa_id, sessao_id,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, '${QUALIFICACAO_STATUS.PLANEJADA}', 0, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          part.funcionario_id,
          modelo.qualificacao_tipo_id,
          modelo.qual_codigo,
          modelo.qual_categoria || null,
          params.data,
          modelo.qual_validade || null,
          modelo.duracao_estimada || null,
          tipoTreinamento,
          params.empresaId,
          params.sessaoId,
        ),
    );
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
    criadas = stmts.length;
  }

  return { criadas, puladas, conflitosUniques, bloqueadasDataPassada };
}

async function carregarRequisitosModeloSessao(
  db: D1Database,
  modeloId: number,
  empresaId: number,
): Promise<
  Array<{ requisito_modelo_sessao_id: number; requisito_qualificacao_tipo_id: number | null }>
> {
  try {
    const statement = db
      .prepare(
        `SELECT
           msr.requisito_modelo_sessao_id,
           ms_req.qualificacao_tipo_id AS requisito_qualificacao_tipo_id
         FROM modelos_sessao_requisitos msr
         INNER JOIN modelos_sessao ms_req
           ON ms_req.id = msr.requisito_modelo_sessao_id
          AND ms_req.deleted_at IS NULL
          AND ms_req.empresa_id = ?
         WHERE msr.modelo_sessao_id = ?
           AND msr.empresa_id = ?
           AND msr.obrigatorio = 1
           AND msr.deleted_at IS NULL
         ORDER BY COALESCE(msr.ordem, msr.id), msr.id`,
      )
      .bind(empresaId, modeloId, empresaId);
    if (typeof (statement as any).all !== 'function') {
      throw new Error('modelos_sessao_requisitos query sem suporte a all()');
    }
    const rows = await statement.all<{
      requisito_modelo_sessao_id: number;
      requisito_qualificacao_tipo_id: number | null;
    }>();

    return rows.results || [];
  } catch (error: any) {
    if (String(error?.message || '').includes('no such table: modelos_sessao_requisitos')) {
      return [];
    }
    throw error;
  }
}

async function funcionarioAtendeRequisitosModelo(
  db: D1Database,
  params: {
    empresaId: number;
    funcionarioId: number;
    requisitos: Array<{
      requisito_modelo_sessao_id: number;
      requisito_qualificacao_tipo_id: number | null;
    }>;
  },
): Promise<boolean> {
  for (const requisito of params.requisitos) {
    if (!requisito.requisito_qualificacao_tipo_id) {
      return false;
    }
    const historico = await db
      .prepare(
        `SELECT id
         FROM qualificacoes_historico
         WHERE funcionario_id = ?
           AND empresa_id = ?
           AND qualificacao_id = ?
           AND deleted_at IS NULL
           AND ${sqlStatusEqualsAny('status', [
             QUALIFICACAO_STATUS.CONCLUIDA,
             QUALIFICACAO_STATUS.CONCLUIDO_LEGACY,
             QUALIFICACAO_STATUS.VALIDA,
             QUALIFICACAO_STATUS.RENOVADA,
           ])}
         LIMIT 1`,
      )
      .bind(params.funcionarioId, params.empresaId, requisito.requisito_qualificacao_tipo_id)
      .first<{ id: number }>();
    if (!historico) {
      return false;
    }
  }
  return true;
}

export async function sincronizarQualificacoesDaSessaoConcluida(
  db: D1Database,
  params: {
    sessaoId: number;
    empresaId?: number | null;
  },
): Promise<{ atualizadas: number }> {
  const empresaId =
    typeof params.empresaId === 'number' && Number.isFinite(params.empresaId)
      ? Number(params.empresaId)
      : null;

  if (!empresaId || empresaId <= 0) {
    return { atualizadas: 0 };
  }

  const result = await db
    .prepare(
      `
      UPDATE qualificacoes_historico
         SET status = '${QUALIFICACAO_STATUS.CONCLUIDA}',
             data_confirmacao = COALESCE(data_confirmacao, datetime('now')),
             updated_at = datetime('now')
       WHERE sessao_id = ?
         AND empresa_id = ?
         AND ${sqlStatusEqualsAny('status', PLANNED_QUALIFICATION_STATUS_VALUES, QUALIFICACAO_STATUS.PLANEJADA)}
         AND deleted_at IS NULL
         AND EXISTS (
           SELECT 1
             FROM fichas_sessao fs
            WHERE fs.agendamento_slot_id = qualificacoes_historico.sessao_id
              AND fs.colaborador_id_aluno = qualificacoes_historico.funcionario_id
              AND fs.empresa_id = qualificacoes_historico.empresa_id
              AND fs.deleted_at IS NULL
              AND COALESCE(fs.aprovado, 0) = 1
              AND UPPER(COALESCE(fs.status, '')) IN ('APROVADO', 'CONCLUIDA')
         )
    `,
    )
    .bind(params.sessaoId, empresaId)
    .run();

  return { atualizadas: Number(result.meta?.changes || 0) };
}
