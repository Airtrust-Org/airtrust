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
 *   GET    /api/evd/publicacoes?data=YYYY-MM-DD  — listar publicações diárias por revisão
 *   GET    /api/evd/publicacoes/:id              — detalhe da publicação diária
 *   POST   /api/evd                              — criar voo
 *   POST   /api/evd/publicacoes                  — publicar escala diária agregada por data
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
const MSG_REST_UNKNOWN = 'Repouso mínimo não pôde ser comprovado.';
const MSG_AIRCRAFT_UNAVAILABLE = 'Aeronave indisponível ou inativa no cadastro mestre.';
const MSG_MODEL_QUALIFICATION = 'Tripulante sem habilitação cadastrada para o modelo da aeronave.';
const MSG_MONTHLY_UNAVAILABLE = 'Tripulante indisponível na escala mensal para esta data/período.';
const MSG_FERIAS_UNAVAILABLE = 'Tripulante em afastamento/férias neste período.';
const MSG_SITUACAO_BLOCK = (situacao: string) =>
  `Tripulante indisponível: situação ${situacao} em outra escala.`;
const MSG_OTHER_ESCALA_BLOCK = 'Tripulante alocado operacionalmente em outra escala neste período.';
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

const evdUpdateSchema = z
  .object({
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    pic_id: z.number().int().nullable().optional(),
    sic_id: z.number().int().nullable().optional(),
    pic_funcao: z.string().nullable().optional(),
    sic_funcao: z.string().nullable().optional(),
    aeronave_prefixo: z.string().nullable().optional(),
    aeronave_modelo: z.string().nullable().optional(),
    hora_apresentacao: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    hora_decolagem_prevista: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    hora_pouso_previsto: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    hora_decolagem_real: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    hora_pouso_real: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    hora_corte_motor: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    origem: z.string().nullable().optional(),
    destino: z.string().nullable().optional(),
    tipo_missao: z.enum(['OFFSHORE', 'INSTRUCAO', 'CHECK', 'FERRY', 'OUTRO']).optional(),
    observacoes: z.string().nullable().optional(),
  })
  .strict();

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

const publicacaoDiariaSchema = z
  .object({
    data_ref: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    observacoes: z.string().trim().max(2000).optional(),
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
  /** Hard block: impede salvar (ferias RH real, habilitacao invalida). */
  blocked: boolean;
  /** Soft conflict: divergencia com escala mensal — permite salvar com aviso. */
  soft_conflict?: boolean;
  message?: string;
  conflict_code?: 'FERIAS_RH' | 'OTHER_ESCALA_OPERATIONAL' | 'OTHER_ESCALA_SITUACAO';
};

type RoleContext = {
  funcao: string | null;
  cargo: string | null;
};

type EvdPublicacaoItemRow = {
  id: string;
  escala_id: string | null;
  status: string | null;
  data: string;
  pic_id: number | null;
  sic_id: number | null;
  pic_nome: string | null;
  pic_guerra: string | null;
  sic_nome: string | null;
  sic_guerra: string | null;
  pic_funcao: string | null;
  sic_funcao: string | null;
  aeronave_prefixo: string | null;
  aeronave_modelo: string | null;
  hora_apresentacao: string | null;
  hora_decolagem_prevista: string | null;
  hora_pouso_previsto: string | null;
  hora_decolagem_real: string | null;
  hora_pouso_real: string | null;
  hora_corte_motor: string | null;
  repouso_minimo_ok: number | null;
  origem: string | null;
  destino: string | null;
  tipo_missao: string | null;
  observacoes: string | null;
  aprovado_em: string | null;
};

type EvdPublicacaoJustificativaRow = {
  id: string;
  escala_voo_diaria_id: string;
  funcionario_id: number | null;
  papel: string | null;
  origem_alerta: string;
  tipo_alerta: string | null;
  nivel_alerta: string | null;
  decisao: string;
  justificativa: string;
  alerta_ref_id: string | null;
  criado_por: string | null;
  created_at: string;
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
          AND empresa_id = ?
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
          AND escala_alocacao_id IS NULL
          AND NOT (data_fim < ? OR data_inicio > ?)
        LIMIT 1`,
    )
    .bind(params.funcionarioId, params.data, params.data)
    .first<{ tipo: string | null }>();

  if (ferias) {
    return {
      blocked: true,
      message: MSG_FERIAS_UNAVAILABLE,
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
      // Mesma escala mensal: alocação operacional já contemplada — não bloquear.
      if (params.escalaId && String(row.escala_id || '') === String(params.escalaId)) {
        continue;
      }
      // Sem escala_id vinculada no EVD não há como afirmar conflito operacional com segurança.
      if (!params.escalaId) continue;
      // Conflito com outra escala mensal: soft conflict (não bloqueia, gera aviso).
      return {
        blocked: false,
        soft_conflict: true,
        message: MSG_OTHER_ESCALA_BLOCK,
        conflict_code: 'OTHER_ESCALA_OPERATIONAL',
      };
    }

    const situacao = String(row.situacao_tipo || '').trim().toUpperCase();
    if (!situacao || situacao === 'FOLGA') continue;
    // Mesma escala mensal: situação já contemplada no contexto da escala — não bloquear.
    // (Consistente com lógica do GET /tripulantes-operacionais via mesmoEscalaAtual.)
    if (params.escalaId && String(row.escala_id || '') === String(params.escalaId)) {
      continue;
    }
    if (Number(row.bloqueia_alocacao ?? 1) === 1) {
      // Situacao de outra escala mensal: soft conflict (não bloqueia, gera aviso).
      return {
        blocked: false,
        soft_conflict: true,
        message: MSG_SITUACAO_BLOCK(situacao),
        conflict_code: 'OTHER_ESCALA_SITUACAO',
      };
    }
  }

  return { blocked: false };
}

type TrainingCommitment = {
  treinamentoId: number;
  titulo: string;
  codigoTurma: string | null;
  status: string;
  horaInicio: string | null;
  horaFim: string | null;
  confirmed: boolean;
};

/**
 * A1: a EVD precisa enxergar treinamentos como compromisso operacional. Política
 * centralizada no backend (não duplicada no frontend):
 *  - turma CONFIRMADO/EM_ANDAMENTO sobreposta -> conflito operacional (exige justificativa);
 *  - turma PLANEJADO (ainda não confirmada) -> aviso informativo (não exige justificativa);
 *  - turma CANCELADO/CONCLUIDO -> ignorada.
 * Considera dias efetivos (treinamentos_dias) e turmas legadas sem dias (data_prevista),
 * para participante, instrutor (tabela nova) e instrutor_id legado.
 */
async function findTrainingCommitment(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  data: string,
): Promise<TrainingCommitment | null> {
  const map = (row: Record<string, unknown> | null): TrainingCommitment | null => {
    if (!row) return null;
    const status = String(row.status || 'PLANEJADO').toUpperCase();
    return {
      treinamentoId: Number(row.id),
      titulo: String(row.titulo || row.codigo_turma || 'Treinamento'),
      codigoTurma: (row.codigo_turma as string | null) || null,
      status,
      horaInicio: (row.hora_inicio as string | null) || null,
      horaFim: (row.hora_fim as string | null) || null,
      confirmed: status === 'CONFIRMADO' || status === 'EM_ANDAMENTO',
    };
  };

  const personFilter = `AND (
        EXISTS (SELECT 1 FROM treinamentos_participantes tp WHERE tp.treinamento_id = t.id AND tp.funcionario_id = ?)
        OR EXISTS (SELECT 1 FROM treinamentos_instrutores ti WHERE ti.treinamento_id = t.id AND ti.funcionario_id = ?)
        OR t.instrutor_id = ?
      )`;

  try {
  // Dias efetivos (turmas com cronograma).
  const fromDays = await db
    .prepare(
      `SELECT t.id, t.titulo, t.codigo_turma,
              UPPER(COALESCE(t.status, 'PLANEJADO')) AS status,
              td.hora_inicio, td.hora_fim
         FROM treinamentos_dias td
         INNER JOIN treinamentos_planejados t
           ON t.id = td.treinamento_id AND t.empresa_id = ? AND t.deleted_at IS NULL
        WHERE td.empresa_id = ?
          AND td.deleted_at IS NULL
          AND td.status = 'ATIVO'
          AND date(td.data) = date(?)
          AND UPPER(COALESCE(t.status, 'PLANEJADO')) NOT IN ('CANCELADO', 'CONCLUIDO')
          ${personFilter}
        ORDER BY CASE WHEN UPPER(COALESCE(t.status, 'PLANEJADO')) IN ('CONFIRMADO', 'EM_ANDAMENTO') THEN 0 ELSE 1 END,
                 td.hora_inicio
        LIMIT 1`,
    )
    .bind(empresaId, empresaId, data, funcionarioId, funcionarioId, funcionarioId)
    .first<Record<string, unknown>>();
  if (fromDays) return map(fromDays);

  // Turmas legadas sem dias efetivos (usa data_prevista/data_inicio).
  const fromLegacy = await db
    .prepare(
      `SELECT t.id, t.titulo, t.codigo_turma,
              UPPER(COALESCE(t.status, 'PLANEJADO')) AS status,
              t.hora_inicio, t.hora_fim
         FROM treinamentos_planejados t
        WHERE t.empresa_id = ?
          AND t.deleted_at IS NULL
          AND UPPER(COALESCE(t.status, 'PLANEJADO')) NOT IN ('CANCELADO', 'CONCLUIDO')
          AND date(COALESCE(t.data_prevista, t.data_inicio)) = date(?)
          AND NOT EXISTS (
            SELECT 1 FROM treinamentos_dias d
             WHERE d.treinamento_id = t.id AND d.deleted_at IS NULL
          )
          ${personFilter}
        ORDER BY CASE WHEN UPPER(COALESCE(t.status, 'PLANEJADO')) IN ('CONFIRMADO', 'EM_ANDAMENTO') THEN 0 ELSE 1 END
        LIMIT 1`,
    )
    .bind(empresaId, data, funcionarioId, funcionarioId, funcionarioId)
    .first<Record<string, unknown>>();
  return map(fromLegacy);
  } catch (error) {
    // Resiliência (§18): falha ao consultar a fonte de treinamento NÃO pode quebrar o
    // fluxo crítico da EVD. Degrada para "sem compromisso detectado" e registra o erro.
    console.error('evd_training_commitment_check_failed', {
      funcionarioId,
      error: (error as Error)?.message,
    });
    return null;
  }
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
    if (availability.soft_conflict && availability.message) {
      // Divergencia com escala mensal: permitir salvar, mas exigir justificativa.
      warnings.push(`Conflito escala mensal: ${availability.message}`);
      requiresOperationalJustification = true;
    }

    // A1: treinamento como compromisso operacional (política centralizada).
    const training = await findTrainingCommitment(params.db, params.empresaId, crewId, params.data);
    if (training) {
      const turma = training.codigoTurma ? ` [${training.codigoTurma}]` : '';
      const horario =
        training.horaInicio && training.horaFim
          ? ` ${training.horaInicio}–${training.horaFim}`
          : '';
      if (training.confirmed) {
        warnings.push(
          `Conflito com treinamento ${training.status === 'EM_ANDAMENTO' ? 'em andamento' : 'confirmado'}: ${training.titulo}${turma}${horario}. Tripulante ${crewId}.`,
        );
        requiresOperationalJustification = true;
      } else {
        warnings.push(
          `Tripulante ${crewId} possui treinamento planejado: ${training.titulo}${turma}${horario}. Confirme a disponibilidade.`,
        );
      }
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
): Promise<{ minutos: number | null; ok: boolean | null }> {
  if (!horaApresentacao) return { minutos: null, ok: null };

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

  if (!ultimoCorte?.hora_corte_motor) return { minutos: null, ok: null };

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

async function hasStructuredJustificativa(params: {
  db: D1Database;
  empresaId: number;
  evdId: string;
}): Promise<boolean> {
  const justificativa = await params.db
    .prepare(
      `SELECT id
         FROM escala_voo_diaria_justificativas
        WHERE empresa_id = ? AND escala_voo_diaria_id = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(params.empresaId, params.evdId)
    .first<{ id: string }>();
  return Boolean(justificativa?.id);
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

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const child = source[key];
      if (child === undefined) continue;
      ordered[key] = canonicalizeJsonValue(child);
    }
    return ordered;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

async function sha256Hex(value: string): Promise<string> {
  const payload = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
}

async function listEvdItemsByDate(params: {
  db: D1Database;
  empresaId: number;
  dataRef: string;
}): Promise<EvdPublicacaoItemRow[]> {
  const rows = await params.db
    .prepare(
      `SELECT
          e.id,
          e.escala_id,
          e.status,
          e.data,
          e.pic_id,
          e.sic_id,
          fp.nome AS pic_nome,
          fp.guerra AS pic_guerra,
          fs.nome AS sic_nome,
          fs.guerra AS sic_guerra,
          e.pic_funcao,
          e.sic_funcao,
          e.aeronave_prefixo,
          e.aeronave_modelo,
          e.hora_apresentacao,
          e.hora_decolagem_prevista,
          e.hora_pouso_previsto,
          e.hora_decolagem_real,
          e.hora_pouso_real,
          e.hora_corte_motor,
          e.repouso_minimo_ok,
          e.origem,
          e.destino,
          e.tipo_missao,
          e.observacoes,
          e.aprovado_em
       FROM escala_voo_diaria e
       LEFT JOIN funcionarios fp ON fp.id = e.pic_id
       LEFT JOIN funcionarios fs ON fs.id = e.sic_id
       WHERE e.empresa_id = ?
         AND e.data = ?
         AND e.deleted_at IS NULL
       ORDER BY COALESCE(e.hora_apresentacao, '99:99'), COALESCE(e.hora_decolagem_prevista, '99:99'), e.id`,
    )
    .bind(params.empresaId, params.dataRef)
    .all<EvdPublicacaoItemRow>();

  return rows.results || [];
}

async function listEvdJustificativasByDateItems(params: {
  db: D1Database;
  empresaId: number;
  itemIds: string[];
}): Promise<Record<string, EvdPublicacaoJustificativaRow[]>> {
  if (params.itemIds.length === 0) return {};
  const placeholders = params.itemIds.map(() => '?').join(', ');
  const rows = await params.db
    .prepare(
      `SELECT
          id,
          escala_voo_diaria_id,
          funcionario_id,
          papel,
          origem_alerta,
          tipo_alerta,
          nivel_alerta,
          decisao,
          justificativa,
          alerta_ref_id,
          criado_por,
          created_at
       FROM escala_voo_diaria_justificativas
       WHERE empresa_id = ?
         AND deleted_at IS NULL
         AND escala_voo_diaria_id IN (${placeholders})
       ORDER BY created_at ASC`,
    )
    .bind(params.empresaId, ...params.itemIds)
    .all<EvdPublicacaoJustificativaRow>();

  const grouped: Record<string, EvdPublicacaoJustificativaRow[]> = {};
  for (const row of rows.results || []) {
    if (!grouped[row.escala_voo_diaria_id]) grouped[row.escala_voo_diaria_id] = [];
    grouped[row.escala_voo_diaria_id].push(row);
  }
  return grouped;
}

async function validateEvdItemForDailyPublication(params: {
  db: D1Database;
  empresaId: number;
  voo: EvdPublicacaoItemRow;
  hasStructuredJustificativa: boolean;
}): Promise<{ ok: true; warnings: string[] } | { ok: false; error: string; code: string }> {
  if (!params.voo.pic_id || !params.voo.sic_id) {
    return { ok: false, error: `${MSG_PUBLISH_CREW_REQUIRED} [voo:${params.voo.id}]`, code: 'CREW_REQUIRED' };
  }

  if (params.voo.pic_id === params.voo.sic_id) {
    return { ok: false, error: `${MSG_PIC_SIC_SAME} [voo:${params.voo.id}]`, code: 'PIC_SIC_SAME' };
  }

  const hasConflict = await hasCrewConflict({
    db: params.db,
    empresaId: params.empresaId,
    data: params.voo.data,
    picId: params.voo.pic_id,
    sicId: params.voo.sic_id,
    window: {
      hora_apresentacao: params.voo.hora_apresentacao,
      hora_decolagem_prevista: params.voo.hora_decolagem_prevista,
      hora_pouso_previsto: params.voo.hora_pouso_previsto,
    },
    excludeId: params.voo.id,
  });
  if (hasConflict) {
    return { ok: false, error: `${MSG_DUPLICATE_CREW} [voo:${params.voo.id}]`, code: 'DUPLICATE_CREW' };
  }

  if (params.voo.repouso_minimo_ok == null) return { ok: false, error: `${MSG_REST_UNKNOWN} [voo:${params.voo.id}]`, code: 'REST_UNKNOWN' };
  if (Number(params.voo.repouso_minimo_ok) !== 1) {
    return { ok: false, error: `${MSG_REST_INVALID} [voo:${params.voo.id}]`, code: 'REST_INVALID' };
  }

  const operationalChecks = await collectOperationalWarningsAndBlocks({
    db: params.db,
    empresaId: params.empresaId,
    data: params.voo.data,
    escalaId: params.voo.escala_id || null,
    picId: params.voo.pic_id,
    sicId: params.voo.sic_id,
    aeronavePrefixo: params.voo.aeronave_prefixo,
    aeronaveModelo: params.voo.aeronave_modelo,
  });
  if (operationalChecks.hardError) {
    return {
      ok: false,
      error: `${operationalChecks.hardError} [voo:${params.voo.id}]`,
      code: 'OPERATIONAL_HARD_BLOCK',
    };
  }

  if (operationalChecks.requiresOperationalJustification) {
    const hasLegacyObservacao = String(params.voo.observacoes || '').trim().length >= 10;
    if (!params.hasStructuredJustificativa && !hasLegacyObservacao) {
      return {
        ok: false,
        error: `${MSG_PIC_ROLE_REVIEW} [voo:${params.voo.id}]`,
        code: 'OPERATIONAL_ROLE_REVIEW_REQUIRED',
      };
    }
  }

  return { ok: true, warnings: operationalChecks.warnings };
}

async function buildDailyPublicationSnapshot(params: {
  db: D1Database;
  empresaId: number;
  dataRef: string;
  revisao: number;
  publicadoEm: string;
  publicadoPor: string | null;
  observacoes: string | null;
}) {
  const voos = await listEvdItemsByDate({
    db: params.db,
    empresaId: params.empresaId,
    dataRef: params.dataRef,
  });
  const justificativasPorVoo = await listEvdJustificativasByDateItems({
    db: params.db,
    empresaId: params.empresaId,
    itemIds: voos.map((item) => item.id),
  });

  const payload = {
    schema_version: 'evd_daily_publicacao_v1',
    empresa_id: String(params.empresaId),
    data_ref: params.dataRef,
    revisao: params.revisao,
    status: 'PUBLICADA',
    publicado_por: params.publicadoPor,
    publicado_em: params.publicadoEm,
    observacoes: params.observacoes,
    frms_resumo: {
      included: false,
      reason:
        'Resumo FRMS não incluído no snapshot nesta fase para evitar acoplamento/sensibilidade até B3-c.',
    },
    itens: voos.map((voo) => ({
      id: voo.id,
      escala_id: voo.escala_id,
      status: String(voo.status || 'RASCUNHO').toUpperCase(),
      data: voo.data,
      aeronave_prefixo: voo.aeronave_prefixo,
      aeronave_modelo: voo.aeronave_modelo,
      tripulacao: {
        pic: {
          id: voo.pic_id,
          nome: voo.pic_nome,
          nome_guerra: voo.pic_guerra,
          funcao: voo.pic_funcao,
        },
        sic: {
          id: voo.sic_id,
          nome: voo.sic_nome,
          nome_guerra: voo.sic_guerra,
          funcao: voo.sic_funcao,
        },
      },
      horarios: {
        hora_apresentacao: voo.hora_apresentacao,
        hora_decolagem_prevista: voo.hora_decolagem_prevista,
        hora_pouso_previsto: voo.hora_pouso_previsto,
        hora_decolagem_real: voo.hora_decolagem_real,
        hora_pouso_real: voo.hora_pouso_real,
        hora_corte_motor: voo.hora_corte_motor,
      },
      rota: {
        origem: voo.origem,
        destino: voo.destino,
        tipo_missao: voo.tipo_missao,
      },
      observacoes_gerais: voo.observacoes,
      flags_operacionais: {
        repouso_minimo_ok: voo.repouso_minimo_ok == null ? null : Number(voo.repouso_minimo_ok) === 1,
      },
      justificativas: (justificativasPorVoo[voo.id] || []).map((just) => ({
        id: just.id,
        funcionario_id: just.funcionario_id,
        papel: just.papel,
        origem_alerta: just.origem_alerta,
        tipo_alerta: just.tipo_alerta,
        nivel_alerta: just.nivel_alerta,
        decisao: just.decisao,
        justificativa: just.justificativa,
        alerta_ref_id: just.alerta_ref_id,
        criado_por: just.criado_por,
        created_at: just.created_at,
      })),
    })),
  };

  const payloadCanonical = stableStringify(payload);
  const checksum = await sha256Hex(payloadCanonical);
  return { payload, payloadCanonical, checksum };
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

// GET /api/evd/publicacoes?data=YYYY-MM-DD
evdRoutes.get('/publicacoes', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const dataRef = c.req.query('data');

  if (!dataRef || !/^\d{4}-\d{2}-\d{2}$/.test(dataRef)) {
    return c.json(
      { success: false, error: 'Parâmetro obrigatório: data=YYYY-MM-DD' },
      400,
    );
  }

  const rows = await db
    .prepare(
      `SELECT
          id,
          empresa_id,
          data_ref,
          revisao,
          status,
          checksum,
          observacoes,
          publicado_por,
          publicado_em,
          created_at
       FROM escala_voo_diaria_publicacoes
       WHERE empresa_id = ?
         AND data_ref = ?
         AND deleted_at IS NULL
       ORDER BY revisao DESC, publicado_em DESC`,
    )
    .bind(String(empresaId), dataRef)
    .all();

  return c.json({ success: true, data: rows.results || [] });
});

// GET /api/evd/publicacoes/:id
evdRoutes.get('/publicacoes/:id', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');

  const row = await db
    .prepare(
      `SELECT
          id,
          empresa_id,
          data_ref,
          revisao,
          status,
          payload_json,
          checksum,
          observacoes,
          publicado_por,
          publicado_em,
          created_at
       FROM escala_voo_diaria_publicacoes
       WHERE id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(id, String(empresaId))
    .first<{
      id: string;
      empresa_id: string;
      data_ref: string;
      revisao: number;
      status: string;
      payload_json: string;
      checksum: string;
      observacoes: string | null;
      publicado_por: string | null;
      publicado_em: string;
      created_at: string;
    }>();

  if (!row) return c.json({ success: false, error: 'Publicação não encontrada' }, 404);

  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    payload = null;
  }

  return c.json({
    success: true,
    data: {
      ...row,
      payload_json: payload,
    },
  });
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

// POST /api/evd/publicacoes
evdRoutes.post('/publicacoes', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const userIdRaw = c.get('userId');
  const userId = userIdRaw ? String(userIdRaw) : null;

  const body = await c.req.json();
  const parsed = publicacaoDiariaSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
      400,
    );
  }

  const dataRef = parsed.data.data_ref;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const voos = await listEvdItemsByDate({
    db,
    empresaId,
    dataRef,
  });

  if (voos.length === 0) {
    return c.json(
      { success: false, error: `Nenhum item de escala diária encontrado para ${dataRef}.` },
      400,
    );
  }

  const justificativasPorVoo = await listEvdJustificativasByDateItems({
    db,
    empresaId,
    itemIds: voos.map((item) => item.id),
  });

  const warnings: Array<{ voo_id: string; mensagem: string }> = [];
  for (const voo of voos) {
    const validation = await validateEvdItemForDailyPublication({
      db,
      empresaId,
      voo,
      hasStructuredJustificativa: Boolean((justificativasPorVoo[voo.id] || []).length > 0),
    });

    if (!validation.ok) {
      return c.json(
        {
          success: false,
          error: validation.error,
          code: validation.code,
          voo_id: voo.id,
        },
        400,
      );
    }

    for (const warning of validation.warnings) {
      warnings.push({ voo_id: voo.id, mensagem: warning });
    }
  }

  const nextRevisaoRow = await db
    .prepare(
      `SELECT COALESCE(MAX(revisao), -1) + 1 AS next_revisao
       FROM escala_voo_diaria_publicacoes
       WHERE empresa_id = ?
         AND data_ref = ?
         AND deleted_at IS NULL`,
    )
    .bind(String(empresaId), dataRef)
    .first<{ next_revisao: number | null }>();
  const revisao = Number(nextRevisaoRow?.next_revisao ?? 0);

  const snapshot = await buildDailyPublicationSnapshot({
    db,
    empresaId,
    dataRef,
    revisao,
    publicadoEm: now,
    publicadoPor: userId,
    observacoes: parsed.data.observacoes?.trim() || null,
  });

  const publicacaoId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO escala_voo_diaria_publicacoes
         (id, empresa_id, data_ref, revisao, status, payload_json, checksum, observacoes, publicado_por, publicado_em, created_at)
       VALUES (?, ?, ?, ?, 'PUBLICADA', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      publicacaoId,
      String(empresaId),
      dataRef,
      revisao,
      snapshot.payloadCanonical,
      snapshot.checksum,
      parsed.data.observacoes?.trim() || null,
      userId,
      now,
      now,
    )
    .run();

  await db
    .prepare(
      `UPDATE escala_voo_diaria
          SET status = 'PUBLICADA',
              aprovado_em = ?,
              updated_at = ?
        WHERE empresa_id = ?
          AND data = ?
          AND deleted_at IS NULL`,
    )
    .bind(now, now, empresaId, dataRef)
    .run();

  return c.json({
    success: true,
    data: {
      id: publicacaoId,
      empresa_id: String(empresaId),
      data_ref: dataRef,
      revisao,
      status: 'PUBLICADA',
      checksum: snapshot.checksum,
      observacoes: parsed.data.observacoes?.trim() || null,
      publicado_por: userId,
      publicado_em: now,
      warnings,
    },
  });
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
    if (repPic.minutos !== null && repPic.ok === false) {
      warnings.push(
        `PIC: repouso insuficiente (${Math.floor(repPic.minutos / 60)}h${repPic.minutos % 60}m < 12h30 mínimo)`,
      );
    }
  }

  // Validação de repouso para SIC
  if (d.sic_id) {
    const repSic = await calcRepouso(db, empresaId, d.sic_id, d.data, d.hora_apresentacao);
    if (repSic.minutos !== null && repSic.ok === false) {
      warnings.push(
        `SIC: repouso insuficiente (${Math.floor(repSic.minutos / 60)}h${repSic.minutos % 60}m < 12h30 mínimo)`,
      );
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Calc repouso for storage
  let repousoMinutos: number | null = null;
  let repousoOk: number | null = null;
  if (d.pic_id && d.hora_apresentacao) {
    const r = await calcRepouso(db, empresaId, d.pic_id, d.data, d.hora_apresentacao);
    repousoMinutos = r.minutos;
    repousoOk = r.ok == null ? null : r.ok ? 1 : 0;
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
  const parsed = evdUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
      400,
    );
  }

  const d = parsed.data;

  const existing = await db
    .prepare(
      `SELECT
         id,
         status,
         data,
         escala_id,
         pic_id,
         sic_id,
         pic_funcao,
         sic_funcao,
         aeronave_prefixo,
         aeronave_modelo,
         hora_apresentacao,
         hora_decolagem_prevista,
         hora_pouso_previsto,
         hora_decolagem_real,
         hora_pouso_real,
         hora_corte_motor,
         origem,
         destino,
         tipo_missao,
         observacoes
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
      pic_funcao: string | null;
      sic_funcao: string | null;
      aeronave_prefixo: string | null;
      aeronave_modelo: string | null;
      hora_apresentacao: string | null;
      hora_decolagem_prevista: string | null;
      hora_pouso_previsto: string | null;
      hora_decolagem_real: string | null;
      hora_pouso_real: string | null;
      hora_corte_motor: string | null;
      origem: string | null;
      destino: string | null;
      tipo_missao: string | null;
      observacoes: string | null;
    }>();

  if (!existing) return c.json({ success: false, error: 'Voo não encontrado' }, 404);

  const candidate = {
    data: d.data ?? existing.data,
    pic_id: d.pic_id !== undefined ? d.pic_id : existing.pic_id,
    sic_id: d.sic_id !== undefined ? d.sic_id : existing.sic_id,
    pic_funcao: d.pic_funcao !== undefined ? d.pic_funcao : existing.pic_funcao,
    sic_funcao: d.sic_funcao !== undefined ? d.sic_funcao : existing.sic_funcao,
    aeronave_prefixo:
      d.aeronave_prefixo !== undefined ? d.aeronave_prefixo : existing.aeronave_prefixo,
    aeronave_modelo: d.aeronave_modelo !== undefined ? d.aeronave_modelo : existing.aeronave_modelo,
    hora_apresentacao:
      d.hora_apresentacao !== undefined ? d.hora_apresentacao : existing.hora_apresentacao,
    hora_decolagem_prevista:
      d.hora_decolagem_prevista !== undefined
        ? d.hora_decolagem_prevista
        : existing.hora_decolagem_prevista,
    hora_pouso_previsto:
      d.hora_pouso_previsto !== undefined ? d.hora_pouso_previsto : existing.hora_pouso_previsto,
    hora_decolagem_real:
      d.hora_decolagem_real !== undefined ? d.hora_decolagem_real : existing.hora_decolagem_real,
    hora_pouso_real: d.hora_pouso_real !== undefined ? d.hora_pouso_real : existing.hora_pouso_real,
    hora_corte_motor:
      d.hora_corte_motor !== undefined ? d.hora_corte_motor : existing.hora_corte_motor,
    origem: d.origem !== undefined ? d.origem : existing.origem,
    destino: d.destino !== undefined ? d.destino : existing.destino,
    tipo_missao: d.tipo_missao !== undefined ? d.tipo_missao : existing.tipo_missao,
    observacoes: d.observacoes !== undefined ? d.observacoes : existing.observacoes,
  };

  if (
    typeof candidate.pic_id === 'number' &&
    typeof candidate.sic_id === 'number' &&
    candidate.pic_id === candidate.sic_id
  ) {
    return c.json({ success: false, error: MSG_PIC_SIC_SAME }, 400);
  }

  const criticalFields = [
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
  ] as const;
  const touchesCriticalField = criticalFields.some((field) =>
    Object.prototype.hasOwnProperty.call(d, field),
  );

  let requiresOperationalJustification = false;
  if (touchesCriticalField) {
    const hasConflict = await hasCrewConflict({
      db,
      empresaId,
      data: candidate.data,
      picId: candidate.pic_id,
      sicId: candidate.sic_id,
      window: {
        hora_apresentacao: candidate.hora_apresentacao,
        hora_decolagem_prevista: candidate.hora_decolagem_prevista,
        hora_pouso_previsto: candidate.hora_pouso_previsto,
      },
      excludeId: existing.id,
    });
    if (hasConflict) {
      return c.json({ success: false, error: MSG_DUPLICATE_CREW }, 409);
    }

    const operationalChecks = await collectOperationalWarningsAndBlocks({
      db,
      empresaId,
      data: candidate.data,
      escalaId: existing.escala_id || null,
      picId: candidate.pic_id,
      sicId: candidate.sic_id,
      aeronavePrefixo: candidate.aeronave_prefixo,
      aeronaveModelo: candidate.aeronave_modelo,
    });
    if (operationalChecks.hardError) {
      return c.json({ success: false, error: operationalChecks.hardError }, 400);
    }
    requiresOperationalJustification = operationalChecks.requiresOperationalJustification;
  }

  let repousoMinutos: number | null = null;
  let repousoOk: number | null = null;
  if (
    typeof candidate.pic_id === 'number' &&
    candidate.hora_apresentacao &&
    /^\d{2}:\d{2}$/.test(candidate.hora_apresentacao)
  ) {
    const repPic = await calcRepouso(
      db,
      empresaId,
      candidate.pic_id,
      candidate.data,
      candidate.hora_apresentacao,
    );
    repousoMinutos = repPic.minutos;
    repousoOk = repPic.ok == null ? null : repPic.ok ? 1 : 0;
  }

  if (String(existing.status || '').toUpperCase() === 'PUBLICADA') {
    if (touchesCriticalField && repousoOk === 0) {
      return c.json({ success: false, error: MSG_REST_INVALID }, 400);
    }
    if (touchesCriticalField && requiresOperationalJustification) {
      const hasJustificativa = await hasStructuredJustificativa({
        db,
        empresaId,
        evdId: existing.id,
      });
      const hasObservacao = String(candidate.observacoes || '').trim().length >= 10;
      if (!hasJustificativa && !hasObservacao) {
        return c.json(
          {
            success: false,
            code: 'OPERATIONAL_ROLE_REVIEW_REQUIRED',
            requires_justificativa: true,
            error: MSG_PIC_ROLE_REVIEW,
          },
          400,
        );
      }
    }
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
    if (Object.prototype.hasOwnProperty.call(d, key)) {
      fields.push(`${key} = ?`);
      values.push(d[key as keyof typeof d] ?? null);
    }
  }

  if (touchesCriticalField || Object.prototype.hasOwnProperty.call(d, 'pic_id')) {
    fields.push('repouso_anterior_minutos = ?');
    values.push(repousoMinutos);
    fields.push('repouso_minimo_ok = ?');
    values.push(repousoOk);
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

  if (voo.repouso_minimo_ok == null) return c.json({ success: false, error: MSG_REST_UNKNOWN, code: 'REST_UNKNOWN' }, 409);
  if (Number(voo.repouso_minimo_ok) !== 1) {
    return c.json({ success: false, error: MSG_REST_INVALID, code: 'REST_INVALID' }, 400);
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
