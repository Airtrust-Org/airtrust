/**
 * FRMS — Rotas API (Hono)
 *
 * Endpoints para o módulo FRMS (Flight and Rest Management System):
 *   - Jornadas (CRUD + pipeline de cálculo)
 *   - Acúmulo (rolling + mensal + frota)
 *   - Alertas (list + visualizar + resolver)
 *   - Escalas quinzenais
 *   - Importação (APUS + Simulador)
 *   - Relatórios (individual, compliance, mapa de fadiga, histórico alertas)
 *   - Validação de escala futura
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { rateLimiter } from '../middleware/rate-limit';
import { tenantMiddleware } from '../middleware/tenant';
import { localMaintenanceMutationNotFound } from '../middleware/local-maintenance';
import {
  assertNoImpersonation,
  MAINTENANCE_CAPABILITIES,
  recordMaintenanceAudit,
  requireMaintenanceCapability,
} from '../middleware/maintenance-access';
import { enviarEmailAlert } from '../cron/notificacoes';
import { publishDomainEvent } from '../shared/domainEvents';
import { getFrmsOperationalState } from '../shared/getTripulanteOperacional';
import { FRMS_STATUS, NIVEIS_ALERTA, LIMITES_DEFAULT, type FrmsJornada, type LimitesMap } from '../lib/frms/types';
import {
  validarEscalaFutura,
  calcDuracaoJornada,
  calcEffectiveness,
  calcFatorizacao,
  diasNoMes,
  hhmmToMinutes,
  minutesToHhmm,
} from '../lib/frms/calculos';
import {
  carregarLimites,
  salvarJornada,
  atualizarJornada,
  deletarJornada,
  buscarJornadas,
  buscarAcumuloTripulante,
  buscarAcumuloFrota,
  buscarAlertas,
  marcarAlertaVisualizado,
  marcarAlertaResolvido,
  salvarEscala,
  buscarEscalas,
  deletarEscala,
  atualizarEscala,
  importarApus,
  importarSimulador,
  relatorioIndividual,
  relatorioCompliance,
  relatorioMapaFadiga,
  buscarConfiguracoes,
  atualizarConfiguracao,
  restaurarConfiguracoesPadrao,
  buscarNotificacoes,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
  reprocessarTodosTripulantes,
  reprocessarTripulanteCompleto,
  listarTripulantesAtivos,
} from '../lib/frms/db-service';
import { resolveFrmsOperationalContext, asOperationalLimitesMap } from '../lib/frms/parameter-governance';
import { getFrmsFortnightCoverage, FRMS_FORTNIGHT_COVERAGE_MAX_WINDOW_DAYS } from '../lib/frms/fortnight-coverage';
import {
  applyFortnightBaseMaterialization,
  FRMS_FORTNIGHT_MATERIALIZATION_APPLY_MAX_WINDOW_DAYS,
  FRMS_FORTNIGHT_MATERIALIZATION_CONFIRM_TOKEN,
  normalizeFortnightMaterializationFilters,
  previewFortnightBaseMaterialization,
} from '../lib/frms/fortnight-materialization';
import { syncHorasVooFromFrmsJornada } from '../shared/handlers/horasVooFromFrms.handler';
import { recalcularPipeline } from '../lib/frms/db-service-jornadas';
import { buildCanonicalOperationalSourceSql } from '../lib/frms/frms-source-policy';
import { getSigvoosConfig } from '../services/sigvoos-frms';
import { getEmployeeSectorAccess, buildFuncionarioScopeWhere } from '../services/employee-sector-access';
import fadigaAcumulada from './frms-fadiga-acumulada';
import firaRoutes from './frms-fira';
import frmsRelatoriosConfig from './frms-relatorios-config';
import {
  type FrmsAppContext,
  safe,
  logDomainEventError,
  getEmpresaIdSafe,
  auditFrms,
  assertTripulanteEmpresa,
  assertJornadaEmpresa,
  assertAlertaEmpresa,
  resolveFuncionarioId,
} from './frms-shared';

const frmsRoutes = new Hono<{ Bindings: Env; Variables: Partial<Variables> }>();

// Must precede every maintenance handler: direct router tests and the full
// application enforce auth + tenant before parsing a request body or touching D1.
frmsRoutes.use('/maintenance/*', auth(), tenantMiddleware());

const FortnightCoverageMaintenanceQuerySchema = z.object({
  empresa_id: z.coerce.number().int().positive().optional(),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  origem: z.string().optional(),
  status: z.string().optional(),
});

const FortnightMaterializationApplySchema = z.object({
  empresa_id: z.coerce.number().int().positive().optional(),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  origem: z.union([z.string(), z.array(z.string())]).optional(),
  status: z.union([z.string(), z.array(z.string())]).optional(),
  confirm: z.string(),
});

const FRMS_JORNADA_SELECT_COLUMNS = `
  id,
  empresa_id,
  tripulante_id,
  data,
  status,
  hora_apresentacao,
  hora_termino,
  duracao_jornada_minutos,
  horas_voo_minutos,
  hora_primeiro_acionamento,
  hora_primeira_decolagem,
  hora_ultimo_pouso,
  hora_corte_motor,
  repouso_plataforma_inicio,
  repouso_plataforma_fim,
  repouso_plataforma_valido,
  observacao,
  registrado_por,
  origem,
  tipo_base,
  tripulacao_aumentada,
  classe_cabine,
  aclimatado,
  local_base,
  hora_dormiu,
  hora_acordou,
  sono_efetivo_min,
  fonte_sono,
  acordou_na_wocl,
  repouso_regulatorio_min,
  matricula_aeronave,
  tempo_noturno_str,
  tempo_ifr_str,
  fonte_resolucao_sigvoos,
  fator_basica_pct,
  fator_apresentacao_pct,
  fator_repouso_pct,
  horas_voo_noturno_min,
  horas_voo_ifr_min,
  fonte_resolucao,
  created_at,
  updated_at,
  deleted_at
`;

const FRMS_FATORIZACAO_SELECT_COLUMNS = `
  id,
  jornada_id,
  processado_com_bug,
  fator_basica_pct,
  fator_apresentacao_pct,
  fator_duracao_pct,
  fator_repouso_pct,
  fator_noturno_dep_pct,
  fator_noturno_arr_pct,
  fator_ciclo_embarcado_pct,
  total_fatorizado_jornada,
  fator_hv_basica_pct,
  fator_hv_quantidade_pct,
  fator_hv_noturno_dep_pct,
  fator_hv_noturno_arr_pct,
  total_fatorizado_hv,
  fator_base_away_pct,
  fator_aclimatacao_pct,
  effectiveness_pct,
  effectiveness_nivel,
  effectiveness_componentes_json,
  hora_despertar_estimada,
  hora_inicio_sono_estimado,
  duracao_sono_efetiva_min,
  tempo_abaixo_limiar_min,
  dia_periodo_embarcado,
  total_dias_periodo,
  created_at,
  updated_at,
  deleted_at
`;

type FrmsExplanationComponentKey =
  | 'basica'
  | 'processo_s'
  | 'processo_c'
  | 'repouso'
  | 'hv'
  | 'duracao';
type FrmsExplanationViewOrigin = 'dashboard' | 'ficha' | 'desconhecida';

interface FrmsExplanationFactor {
  codigo: FrmsExplanationComponentKey;
  titulo: string;
  impacto_pct: number;
  impacto_abs_pct: number;
  direcao: 'penaliza' | 'favorece' | 'neutro';
  resumo: string;
}

interface FrmsExplanationRecommendation {
  codigo: string;
  prioridade: 'alta' | 'media' | 'baixa';
  titulo: string;
  descricao: string;
}

interface FrmsDayExplanationPayload {
  tripulante: {
    id: string;
    nome: string;
    cargo: string | null;
  };
  jornada: {
    data: string;
    hora_apresentacao: string | null;
    hora_acordou: string | null;
    effectiveness_pct: number | null;
    effectiveness_nivel: string | null;
    tempo_abaixo_limiar_min: number | null;
    dias_criticos_consecutivos: number;
    duracao_sono_efetiva_min: number | null;
    hora_despertar_estimada: string | null;
    hora_inicio_sono_estimado: string | null;
    dia_periodo_embarcado: number | null;
    total_dias_periodo: number | null;
  };
  diagnostico: {
    faixa: string;
    resumo_executivo: string;
    explicacao_tecnica: string;
    explicacao_didatica: string;
    fator_principal: string;
    fatores: FrmsExplanationFactor[];
    recomendacoes: FrmsExplanationRecommendation[];
  };
  copiloto: {
    texto: string;
    provider: string;
    model: string;
  };
  explanation_trace?: FrmsDayExplanationTrace;
}

type FrmsExplanationTraceSourceSummary = 'informed' | 'estimated' | 'mixed' | 'legacy' | 'unknown';

interface FrmsDayExplanationTrace {
  version: 'frms-day-trace-v1';
  dataQuality: {
    data_source: 'crew_reported' | 'default_estimate' | 'not_applicable' | null;
    confidence: 'reported' | 'reduced' | null;
    sourceSummary: FrmsExplanationTraceSourceSummary;
    limitations: string[];
  };
  sleep: {
    durationMinutes: number | null;
    source: string | null;
    wakeTime: string | null;
    wakeTimeSource: string | null;
    sleepStartEstimated: string | null;
    wakeTimeEstimated: string | null;
  };
  duty: {
    date: string;
    reportTime: string | null;
    minutesAwakeBeforeReport: number | null;
    missingReportTime: boolean;
  };
  calculation: {
    effectivenessPct: number | null;
    readinessPct: number | null;
    level: string | null;
    timeBelowThresholdMinutes: number | null;
    mainFactor: string | null;
    mainFactorImpact: string | null;
    components: {
      basica: number | null;
      processo_s: number | null;
      processo_c: number | null;
      repouso: number | null;
      hv: number | null;
      duracao: number | null;
    };
  };
  sourceFlags: {
    informedData: boolean;
    estimatedData: boolean;
    legacyPreC2: boolean;
    c2Corrected: boolean;
    recalculationPending: boolean;
  };
  windows: {
    daily: {
      available: boolean;
      date: string;
      effectivenessPct: number | null;
      explanation: string;
    };
    sevenDays: {
      available: boolean;
      worstDay: string | null;
      worstEffectivenessPct: number | null;
      explanation: string;
    };
    twentyEightDays: {
      available: boolean;
      worstDay: string | null;
      worstEffectivenessPct: number | null;
      explanation: string;
    };
  };
}

interface FrmsTraceWindowWorst {
  available: boolean;
  worstDay: string | null;
  worstEffectivenessPct: number | null;
}

interface FrmsDayExplanationTraceContext {
  dataSource: 'crew_reported' | 'default_estimate' | 'not_applicable' | null;
  confidence: 'reported' | 'reduced' | null;
  wakeTimeSource: string | null;
  recalculationPending: boolean;
  windows: {
    sevenDays: FrmsTraceWindowWorst;
    twentyEightDays: FrmsTraceWindowWorst;
  };
  limitations: string[];
}

interface FrmsComparisonDay {
  data: string;
  effectiveness_pct: number | null;
  nivel: string;
  fatores: Array<{
    codigo: FrmsExplanationComponentKey;
    impacto_pts: number;
    motivo_simples: string;
  }>;
}

interface FrmsDayExplanationCacheRow {
  payload_json: string;
  provider: string | null;
  model: string | null;
  expires_at: string | null;
}

function normalizeFrmsExplanationOrigin(raw: string | null | undefined): FrmsExplanationViewOrigin {
  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'dashboard') return 'dashboard';
  if (normalized === 'ficha') return 'ficha';
  return 'desconhecida';
}

function roundOne(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function parseEffectivenessComponents(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => typeof value === 'number' && Number.isFinite(value),
      ),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function sanitizeCopilotoTexto(raw: string, fallback: string): string {
  const source = String(raw || '').trim();
  if (!source) return fallback;

  const withoutCodeFence = source.replace(/```[\s\S]*?```/g, ' ');
  const normalizedLines = withoutCodeFence
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.replace(/^[-*•\u2022\u25CF\u25AA\d.\)\s]+/u, '').replace(/^['"]+|['"]+$/g, ''),
    )
    .map((line) =>
      line.replace(
        /^(par[aá]grafo\s*\d*|bloco\s*\d*|resumo\s*executivo|recomenda[cç][aã]o\s*operacional)\s*:\s*/i,
        '',
      ),
    )
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const merged = normalizedLines.join('\n\n').trim();
  if (!merged) return fallback;

  const paragraphs = merged
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);
  const finalText = paragraphs
    .join('\n\n')
    .replace(/[\*`]/g, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();

  // If AI output ends without a terminal punctuation, it is often token-truncated.
  // In that case, fallback to deterministic text to avoid broken sentences in UI.
  if (!/[.!?…]$/.test(finalText)) return fallback;

  return finalText || fallback;
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftDate(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

function normalizeHora(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!/^\d{2}:\d{2}$/.test(normalized)) return null;
  return normalized;
}

async function hashSha256Hex(value: string): Promise<string> {
  const payload = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
}

async function runAiWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('AI_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function parseBooleanLike(value: string | null | undefined): boolean {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return ['1', 'true', 'yes', 'sim', 'on'].includes(normalized);
}

function isFrmsDayExplanationAiEnabled(env: Env): boolean {
  const aiFlagRaw = String(
    (env as unknown as Record<string, string | undefined>).FRMS_DAY_EXPLANATION_USE_AI ?? '',
  )
    .trim()
    .toLowerCase();
  const aiEnabledByEnv = aiFlagRaw === '' ? true : parseBooleanLike(aiFlagRaw);
  return Boolean(env.AI) && aiEnabledByEnv;
}

async function getCachedFrmsDayExplanation(
  env: Env,
  input: {
    empresaId: number | undefined;
    tripulanteId: string;
    dataRef: string;
    origemTela: FrmsExplanationViewOrigin;
  },
): Promise<FrmsDayExplanationPayload | null> {
  const row = await env.DB.prepare(
    `SELECT payload_json, provider, model, expires_at
       FROM frms_explicacao_dia_cache
      WHERE empresa_id = ?
        AND tripulante_id = ?
        AND data_ref = ?
        AND origem_tela = ?
        AND deleted_at IS NULL
        AND datetime(COALESCE(expires_at, datetime('now', '-1 second'))) > datetime('now')
      LIMIT 1`,
  )
    .bind(input.empresaId ?? null, input.tripulanteId, input.dataRef, input.origemTela)
    .first<FrmsDayExplanationCacheRow>();

  if (!row?.payload_json) return null;
  try {
    const parsed = JSON.parse(row.payload_json) as FrmsDayExplanationPayload;
    return parsed;
  } catch {
    return null;
  }
}

async function upsertFrmsDayExplanationCache(
  env: Env,
  input: {
    empresaId: number | undefined;
    tripulanteId: string;
    dataRef: string;
    origemTela: FrmsExplanationViewOrigin;
    payload: FrmsDayExplanationPayload;
    ttlSeconds: number;
  },
): Promise<void> {
  const ttl = String(Math.max(60, Math.round(input.ttlSeconds)));
  const payloadJson = JSON.stringify(input.payload);
  const updateResult = await env.DB.prepare(
    `UPDATE frms_explicacao_dia_cache
        SET payload_json = ?,
            provider = ?,
            model = ?,
            updated_at = datetime('now'),
            expires_at = datetime('now', '+' || ? || ' seconds'),
            deleted_at = NULL
      WHERE empresa_id = ?
        AND tripulante_id = ?
        AND data_ref = ?
        AND origem_tela = ?`,
  )
    .bind(
      payloadJson,
      input.payload.copiloto.provider,
      input.payload.copiloto.model,
      ttl,
      input.empresaId ?? null,
      input.tripulanteId,
      input.dataRef,
      input.origemTela,
    )
    .run();

  const changes = Number(
    (updateResult as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0,
  );
  if (changes > 0) return;

  await env.DB.prepare(
    `INSERT INTO frms_explicacao_dia_cache (
       id,
       empresa_id,
       tripulante_id,
       data_ref,
       origem_tela,
       payload_json,
       provider,
       model,
       created_at,
       updated_at,
       expires_at,
       deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now', '+' || ? || ' seconds'), NULL)`,
  )
    .bind(
      crypto.randomUUID(),
      input.empresaId ?? null,
      input.tripulanteId,
      input.dataRef,
      input.origemTela,
      payloadJson,
      input.payload.copiloto.provider,
      input.payload.copiloto.model,
      ttl,
    )
    .run();
}

function normalizeRole(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function canGenerateJustificativa(role: string): boolean {
  return ['ADMIN', 'GESTOR', 'OPERADOR', 'OPERATOR', 'MANAGER'].includes(role);
}

async function registrarAuditoriaFrmsAcao(
  c: FrmsAppContext,
  input: {
    acao: 'FRMS_COMPARACAO_DIAS' | 'FRMS_CENARIO_SIMULADO' | 'FRMS_JUSTIFICATIVA_GERADA';
    tripulante_id: string;
    data_jornada: string;
    origem_tela: 'dashboard' | 'ficha';
    extra?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const usuario_id = Number(c.get('userId') || 0);
    const empresa_id = getEmpresaIdSafe(c) ?? null;
    await c.env.DB.prepare(
      `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_novos, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
      .bind(
        'frms_operacoes',
        input.acao,
        `${input.tripulante_id}:${input.data_jornada}`,
        JSON.stringify({
          usuario_id,
          empresa_id,
          tripulante_id: Number(input.tripulante_id),
          data_jornada: input.data_jornada,
          origem_tela: input.origem_tela,
          ...input.extra,
        }),
      )
      .run();
  } catch {
    // Não bloquear fluxo principal por telemetria.
  }
}

function formatHoursAndMinutes(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null || !Number.isFinite(totalMinutes)) return 'sem dado confiável';
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return `${hours}h${String(minutes).padStart(2, '0')}`;
}

function formatEffectivenessBand(
  pct: number | null | undefined,
  limites: Record<string, number> | null | undefined,
): string {
  if (pct == null || !Number.isFinite(pct)) return 'sem classificação';
  const verdeMin = Number(limites?.EFFECTIV_VERDE_MIN ?? 90);
  const amareloMax = Number(limites?.EFFECTIV_AMARELO_MAX ?? 77);
  const vermelhoMax = Number(limites?.EFFECTIV_VERMELHO_MAX ?? 65);
  if (pct >= verdeMin) return 'verde';
  if (pct <= vermelhoMax) return 'vermelho';
  if (pct <= amareloMax) return 'amarelo';
  return 'transição';
}

function describeImpactMagnitude(absPct: number): string {
  if (absPct >= 10) return 'alto';
  if (absPct >= 5) return 'moderado';
  if (absPct > 0) return 'leve';
  return 'nulo';
}

function buildExplanationFactor(
  codigo: FrmsExplanationComponentKey,
  impactoRaw: number,
): FrmsExplanationFactor {
  if (codigo === 'basica') {
    const coeficienteBasal = Number.isFinite(impactoRaw) ? Math.max(0, impactoRaw) : 0;
    return {
      codigo,
      titulo: 'Condição circadiana basal estimada',
      impacto_pct: 0,
      impacto_abs_pct: 0,
      direcao: 'neutro',
      resumo: `Contexto basal observado em coeficiente ${coeficienteBasal.toFixed(2)} (escala 0 a 1). Este valor orienta leitura contextual e não entra como impacto direto em pontos percentuais do dia.`,
    };
  }

  const impactoPct = roundOne(impactoRaw * 100);
  const impactoAbsPct = Math.abs(impactoPct);
  const direcao = impactoPct < 0 ? 'penaliza' : impactoPct > 0 ? 'favorece' : 'neutro';
  const intensidade = describeImpactMagnitude(impactoAbsPct);

  const definitions: Record<
    FrmsExplanationComponentKey,
    { titulo: string; penaliza: string; favorece: string }
  > = {
    basica: {
      titulo: 'Reserva basal do estado de vigília',
      penaliza:
        'a condição basal do estado de vigília já começou reduzida para o início da jornada',
      favorece: 'a condição basal do estado de vigília sustentou o início da jornada com margem',
    },
    processo_s: {
      titulo: 'Ciclo embarcado',
      penaliza:
        'o acúmulo de dias embarcado reduziu a margem operacional estimada do tripulante',
      favorece: 'o ciclo embarcado ainda não pressionou o índice de forma relevante',
    },
    processo_c: {
      titulo: 'Janela circadiana',
      penaliza: 'o horário da apresentação caiu em uma faixa circadiana desfavorável',
      favorece: 'o horário da jornada coincidiu com uma faixa circadiana mais favorável',
    },
    repouso: {
      titulo: 'Repouso e sono',
      penaliza: 'o descanso anterior informado reduziu a margem estimada de recuperação',
      favorece: 'o descanso anterior informado ajudou a sustentar o índice estimado',
    },
    hv: {
      titulo: 'Acúmulo de horas de voo',
      penaliza: 'o histórico recente de horas de voo adicionou desgaste ao dia avaliado',
      favorece: 'o histórico recente de horas de voo não pressionou o dia avaliado',
    },
    duracao: {
      titulo: 'Duração da jornada',
      penaliza: 'a duração prevista da jornada puxa a efetividade para baixo ao longo do dia',
      favorece: 'a duração prevista da jornada não traz perda relevante de efetividade',
    },
  };

  const base = definitions[codigo];
  const resumo =
    direcao === 'penaliza'
      ? `Impacto ${intensidade}: ${base.penaliza}.`
      : direcao === 'favorece'
        ? `Impacto ${intensidade}: ${base.favorece}.`
        : `Impacto nulo: ${base.titulo.toLowerCase()} não alterou materialmente o resultado.`;

  return {
    codigo,
    titulo: base.titulo,
    impacto_pct: impactoPct,
    impacto_abs_pct: impactoAbsPct,
    direcao,
    resumo,
  };
}

function buildFrmsRecommendations(
  row: Record<string, unknown>,
  faixa: string,
): FrmsExplanationRecommendation[] {
  const recommendations: FrmsExplanationRecommendation[] = [];
  const tempoAbaixo = Number(row.tempo_abaixo_limiar_min ?? 0);
  const sono = Number(row.duracao_sono_efetiva_min ?? 0);
  const diaEmbarcado = Number(row.dia_periodo_embarcado ?? 0);
  const totalEmbarcado = Number(row.total_dias_periodo ?? 0);
  const hvImpact = roundOne(Number(row.hv_component ?? 0) * 100);
  const circImpact = roundOne(Number(row.processo_c_component ?? 0) * 100);
  const isCriticalBand = faixa === 'vermelho' || tempoAbaixo > 0;
  const isAttentionBand = faixa === 'amarelo' || faixa === 'transição';

  if (isCriticalBand) {
    recommendations.push({
      codigo: 'replanejar-dia-critico',
      prioridade: 'alta',
      titulo: 'Verificar o dia operacional',
      descricao:
        tempoAbaixo > 0
          ? `Há cerca de ${formatHoursAndMinutes(tempoAbaixo)} abaixo do limiar configurado. A coordenação deve conferir a jornada, os dados de origem e a composição operacional do dia.`
          : 'O índice estimado ficou em faixa vermelha. A coordenação deve conferir a composição da jornada e os dados disponíveis antes de qualquer ação.',
    });
  }

  if (sono > 0 && sono < 360) {
    recommendations.push({
      codigo: 'proteger-sono',
      prioridade: isCriticalBand ? 'alta' : isAttentionBand ? 'media' : 'baixa',
      titulo: 'Verificar janela de sono antes da apresentação',
      descricao:
        isCriticalBand || isAttentionBand
          ? `O sistema registrou ${formatHoursAndMinutes(sono)} de sono efetivo estimado. A coordenação deve conferir se a informação é real, estimada ou incompleta.`
          : `Mesmo com índice do dia preservado, o sono estimado foi de ${formatHoursAndMinutes(sono)}. Vale manter acompanhamento operacional dos próximos acionamentos.`,
    });
  }

  if ((isCriticalBand && circImpact <= -5) || (isAttentionBand && circImpact <= -8)) {
    recommendations.push({
      codigo: 'mitigar-circadiano',
      prioridade: 'media',
      titulo: 'Verificar janela operacional desfavorável',
      descricao:
        'O horário da apresentação entrou em faixa operacional desfavorável. Se houver flexibilidade, a coordenação pode analisar alternativas sem tratar este indicador como decisão automática.',
    });
  }

  if ((isCriticalBand && hvImpact <= -5) || (isAttentionBand && hvImpact <= -8)) {
    recommendations.push({
      codigo: 'descomprimir-acumulo-hv',
      prioridade: 'media',
      titulo: 'Verificar acúmulo de horas de voo',
      descricao:
        'O histórico recente de voo pressionou o índice estimado. Este dado deve orientar conferência operacional, não uma ação automática isolada.',
    });
  }

  if (
    diaEmbarcado >= 2 &&
    totalEmbarcado >= diaEmbarcado &&
    (isCriticalBand || isAttentionBand || diaEmbarcado >= 4)
  ) {
    recommendations.push({
      codigo: 'acompanhar-ciclo-embarcado',
      prioridade: 'baixa',
      titulo: 'Acompanhar desgaste do período embarcado',
      descricao: `O tripulante está no dia ${diaEmbarcado} de ${totalEmbarcado} do período embarcado. A leitura deve considerar a tendência operacional e não só o ponto do dia.`,
    });
  }

  return recommendations.slice(0, 4);
}

async function countDiasCriticosConsecutivos(
  env: Env,
  tripulanteId: string,
  empresaId: number | undefined,
  data: string,
  limites: Record<string, number> | null,
): Promise<number> {
  const vermelhoMax = Number(limites?.EFFECTIV_VERMELHO_MAX ?? 65);
  const rows = await env.DB.prepare(
    `SELECT
        j.data as data_apresentacao,
        fj.effectiveness_pct
     FROM frms_fatorizacao_jornada fj
     JOIN frms_jornada j ON j.id = fj.jornada_id AND j.deleted_at IS NULL
     JOIN funcionarios p ON p.id = CAST(j.tripulante_id AS INTEGER)
     WHERE j.tripulante_id = ?
       AND p.deleted_at IS NULL
       AND COALESCE(p.ativo, 1) = 1
       AND UPPER(COALESCE(NULLIF(TRIM(p.status), ''), 'ATIVO')) = 'ATIVO'
       AND (? IS NULL OR p.empresa_id = ?)
       AND fj.deleted_at IS NULL
       AND j.data <= ?
     ORDER BY j.data DESC
     LIMIT 45`,
  )
    .bind(tripulanteId, empresaId ?? null, empresaId ?? null, data)
    .all<Record<string, unknown>>();

  const list = rows.results ?? [];
  if (list.length === 0) return 0;

  let expectedDate = data;
  let count = 0;
  for (const item of list) {
    const itemDate = String(item.data_apresentacao ?? '');
    if (!itemDate || itemDate !== expectedDate) break;

    const pct = item.effectiveness_pct == null ? null : Number(item.effectiveness_pct);
    const isCritical = pct != null && Number.isFinite(pct) && pct <= vermelhoMax;
    if (!isCritical) break;

    count += 1;
    expectedDate = shiftDate(expectedDate, -1);
  }

  return count;
}

function toComparisonDay(explanation: FrmsDayExplanationPayload): FrmsComparisonDay {
  return {
    data: explanation.jornada.data,
    effectiveness_pct: explanation.jornada.effectiveness_pct,
    nivel: explanation.jornada.effectiveness_nivel || explanation.diagnostico.faixa,
    fatores: explanation.diagnostico.fatores.map((factor) => ({
      codigo: factor.codigo,
      impacto_pts: roundOne(factor.impacto_pct),
      motivo_simples: factor.resumo,
    })),
  };
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function computeMinutesAwakeBeforeReport(
  horaAcordou: string | null,
  horaApresentacao: string | null,
): number | null {
  const wake = hhmmToMinutes(horaAcordou);
  const report = hhmmToMinutes(horaApresentacao);
  if (wake == null || report == null) return null;
  return Math.max(0, report - wake);
}

function resolveTraceSourceSummary(flags: {
  informedData: boolean;
  estimatedData: boolean;
  legacyPreC2: boolean;
}): FrmsExplanationTraceSourceSummary {
  if (flags.legacyPreC2) return 'legacy';
  if (flags.informedData && flags.estimatedData) return 'mixed';
  if (flags.informedData) return 'informed';
  if (flags.estimatedData) return 'estimated';
  return 'unknown';
}

function buildFrmsDayExplanationTrace(
  row: Record<string, unknown>,
  deterministicPayload: Omit<FrmsDayExplanationPayload, 'copiloto'>,
  componentes: Record<string, number>,
  fatorPrincipal: FrmsExplanationFactor | undefined,
  context?: FrmsDayExplanationTraceContext,
): FrmsDayExplanationTrace {
  const horaAcordou = deterministicPayload.jornada.hora_acordou;
  const horaDespertarEstimada = deterministicPayload.jornada.hora_despertar_estimada;
  const horaApresentacao = deterministicPayload.jornada.hora_apresentacao;
  const wakeTime = normalizeHora(horaAcordou || horaDespertarEstimada);
  const duracaoFactorPct =
    componentes.duracao != null && Number.isFinite(componentes.duracao)
      ? roundOne(Number(componentes.duracao) * 100)
      : null;
  const readinessPct =
    deterministicPayload.jornada.effectiveness_pct != null && duracaoFactorPct != null
      ? Math.max(
          0,
          Math.min(100, roundOne(deterministicPayload.jornada.effectiveness_pct + duracaoFactorPct)),
        )
      : deterministicPayload.jornada.effectiveness_pct;

  const legacyPreC2 = Number(row.processado_com_bug ?? 0) === 1;
  const c2Corrected = Number(row.processado_com_bug ?? 0) === 0;
  const informedData = Boolean(horaAcordou) || String(row.fonte_sono || '') === 'INFORMADO';
  const estimatedData =
    !informedData &&
    (deterministicPayload.jornada.duracao_sono_efetiva_min != null || Boolean(horaDespertarEstimada));
  const sourceSummary = resolveTraceSourceSummary({
    informedData,
    estimatedData,
    legacyPreC2,
  });
  const limitations = Array.from(new Set(context?.limitations ?? []));
  const sevenDays = context?.windows.sevenDays ?? {
    available: false,
    worstDay: null,
    worstEffectivenessPct: null,
  };
  const twentyEightDays = context?.windows.twentyEightDays ?? {
    available: false,
    worstDay: null,
    worstEffectivenessPct: null,
  };

  return {
    version: 'frms-day-trace-v1',
    dataQuality: {
      data_source: context?.dataSource ?? null,
      confidence: context?.confidence ?? null,
      sourceSummary,
      limitations,
    },
    sleep: {
      durationMinutes: deterministicPayload.jornada.duracao_sono_efetiva_min,
      source: typeof row.fonte_sono === 'string' ? String(row.fonte_sono) : null,
      wakeTime,
      wakeTimeSource: context?.wakeTimeSource ?? null,
      sleepStartEstimated: deterministicPayload.jornada.hora_inicio_sono_estimado,
      wakeTimeEstimated: deterministicPayload.jornada.hora_despertar_estimada,
    },
    duty: {
      date: deterministicPayload.jornada.data,
      reportTime: deterministicPayload.jornada.hora_apresentacao,
      minutesAwakeBeforeReport: computeMinutesAwakeBeforeReport(wakeTime, horaApresentacao),
      missingReportTime: !Boolean(horaApresentacao),
    },
    calculation: {
      effectivenessPct: deterministicPayload.jornada.effectiveness_pct,
      readinessPct,
      level: deterministicPayload.jornada.effectiveness_nivel,
      timeBelowThresholdMinutes: deterministicPayload.jornada.tempo_abaixo_limiar_min,
      mainFactor: fatorPrincipal?.codigo ?? null,
      mainFactorImpact: fatorPrincipal ? `${fatorPrincipal.impacto_pct.toFixed(1)} pp` : null,
      components: {
        basica: toNumberOrNull(componentes.basica),
        processo_s: toNumberOrNull(componentes.processo_s),
        processo_c: toNumberOrNull(componentes.processo_c),
        repouso: toNumberOrNull(componentes.repouso),
        hv: toNumberOrNull(componentes.hv),
        duracao: toNumberOrNull(componentes.duracao),
      },
    },
    sourceFlags: {
      informedData,
      estimatedData,
      legacyPreC2,
      c2Corrected,
      recalculationPending: Boolean(context?.recalculationPending),
    },
    windows: {
      daily: {
        available: deterministicPayload.jornada.effectiveness_pct != null,
        date: deterministicPayload.jornada.data,
        effectivenessPct: deterministicPayload.jornada.effectiveness_pct,
        explanation:
          'Leitura diária baseada na jornada processada para a data selecionada, sem reprocessamento histórico.',
      },
      sevenDays: {
        available: sevenDays.available,
        worstDay: sevenDays.worstDay,
        worstEffectivenessPct: sevenDays.worstEffectivenessPct,
        explanation: sevenDays.available
          ? 'Pior dia observado na janela rolling de 7 dias até a data selecionada.'
          : 'Sem base suficiente para determinar pior dia na janela de 7 dias.',
      },
      twentyEightDays: {
        available: twentyEightDays.available,
        worstDay: twentyEightDays.worstDay,
        worstEffectivenessPct: twentyEightDays.worstEffectivenessPct,
        explanation: twentyEightDays.available
          ? 'Pior dia observado na janela rolling de 28 dias até a data selecionada.'
          : 'Sem base suficiente para determinar pior dia na janela de 28 dias.',
      },
    },
  };
}

async function findWorstEffectivenessInWindow(
  env: Env,
  input: { tripulanteId: string; empresaId: number | undefined; data: string; days: number },
): Promise<FrmsTraceWindowWorst> {
  const offset = String(Math.max(0, input.days - 1));
  try {
    const row = await env.DB.prepare(
      `SELECT
          j.data AS data_apresentacao,
          fj.effectiveness_pct
       FROM frms_fatorizacao_jornada fj
       JOIN frms_jornada j ON j.id = fj.jornada_id AND j.deleted_at IS NULL
       JOIN funcionarios p ON p.id = CAST(j.tripulante_id AS INTEGER)
       WHERE j.tripulante_id = ?
         AND p.deleted_at IS NULL
         AND COALESCE(p.ativo, 1) = 1
         AND UPPER(COALESCE(NULLIF(TRIM(p.status), ''), 'ATIVO')) = 'ATIVO'
         AND (? IS NULL OR p.empresa_id = ?)
         AND fj.deleted_at IS NULL
         AND fj.effectiveness_pct IS NOT NULL
         AND j.data >= date(?, '-' || ? || ' days')
         AND j.data <= ?
       ORDER BY fj.effectiveness_pct ASC, j.data DESC, fj.created_at DESC
       LIMIT 1`,
    )
      .bind(
        input.tripulanteId,
        input.empresaId ?? null,
        input.empresaId ?? null,
        input.data,
        offset,
        input.data,
      )
      .first<{ data_apresentacao: string | null; effectiveness_pct: number | null }>();

    if (!row?.data_apresentacao || row.effectiveness_pct == null) {
      return { available: false, worstDay: null, worstEffectivenessPct: null };
    }

    return {
      available: true,
      worstDay: String(row.data_apresentacao),
      worstEffectivenessPct: roundOne(Number(row.effectiveness_pct)),
    };
  } catch {
    return { available: false, worstDay: null, worstEffectivenessPct: null };
  }
}

async function buildFrmsDayExplanation(
  env: Env,
  row: Record<string, unknown>,
  limites: Record<string, number> | null,
  traceContext?: FrmsDayExplanationTraceContext,
): Promise<FrmsDayExplanationPayload> {
  const pct = row.effectiveness_pct == null ? null : Number(row.effectiveness_pct);
  const faixa = formatEffectivenessBand(pct, limites);
  const componentes = parseEffectivenessComponents(
    typeof row.effectiveness_componentes_json === 'string'
      ? row.effectiveness_componentes_json
      : null,
  );

  const fatores = (
    [
      buildExplanationFactor('basica', Number(row.fator_basica_pct ?? 0)),
      buildExplanationFactor('processo_s', Number(componentes.processo_s ?? 0)),
      buildExplanationFactor('processo_c', Number(componentes.processo_c ?? 0)),
      buildExplanationFactor('repouso', Number(componentes.repouso ?? 0)),
      buildExplanationFactor('hv', Number(componentes.hv ?? 0)),
      buildExplanationFactor('duracao', Number(componentes.duracao ?? 0)),
    ] as FrmsExplanationFactor[]
  ).sort((a, b) => b.impacto_abs_pct - a.impacto_abs_pct);

  const fatorPrincipal = fatores.find(
    (item) => item.direcao === 'penaliza' && item.impacto_abs_pct > 0,
  );
  const tempoAbaixo =
    row.tempo_abaixo_limiar_min == null ? null : Number(row.tempo_abaixo_limiar_min);
  const sono = row.duracao_sono_efetiva_min == null ? null : Number(row.duracao_sono_efetiva_min);
  const recommendations = buildFrmsRecommendations(
    {
      ...row,
      processo_c_component: componentes.processo_c ?? 0,
      hv_component: componentes.hv ?? 0,
    },
    faixa,
  );

  const resumoExecutivo =
    pct == null
      ? 'Sem índice estimado confiável de efetividade para este dia.'
      : faixa === 'vermelho'
        ? `O índice estimado de efetividade ficou em ${pct.toFixed(1)}%, em faixa vermelha para triagem. O principal componente observado foi ${fatorPrincipal?.titulo.toLowerCase() ?? 'a combinação dos fatores do dia'}.`
        : faixa === 'amarelo'
          ? `O índice estimado de efetividade ficou em ${pct.toFixed(1)}%, em faixa de atenção para triagem. A coordenação deve conferir os fatores que mais influenciaram a leitura.`
          : `O índice estimado de efetividade ficou em ${pct.toFixed(1)}%, fora das faixas de atenção configuradas. Ainda assim, os fatores do dia mostram onde a margem operacional foi consumida.`;

  const explicacaoTecnica = [
    pct == null
      ? 'O índice estimado não retornou base suficiente para interpretar o dia.'
      : `Índice estimado de efetividade na apresentação: ${pct.toFixed(1)}% (${faixa}).`,
    fatorPrincipal
      ? `${fatorPrincipal.titulo} foi o maior impacto individual, com ${fatorPrincipal.impacto_pct.toFixed(1)} pontos percentuais sobre a efetividade.`
      : 'Nenhum fator isolado dominou o resultado; o índice veio da combinação dos componentes.',
    tempoAbaixo && tempoAbaixo > 0
      ? `O backend calculou cerca de ${formatHoursAndMinutes(tempoAbaixo)} abaixo do limiar amarelo configurado.`
      : 'Não houve tempo material abaixo do limiar amarelo configurado.',
  ].join(' ');

  const explicacaoDidatica = [
    pct == null
      ? 'Sem índice confiável, então o sistema não consegue explicar este dia com segurança.'
      : `O sistema estimou que ${row.tripulante_nome} chegou ao dia com ${pct.toFixed(1)}% no índice de efetividade.`,
    fatorPrincipal
      ? `O que mais puxou o resultado para baixo foi ${fatorPrincipal.titulo.toLowerCase()}, porque ${fatorPrincipal.resumo.replace(/^Impacto [^:]+:\s*/i, '').replace(/\.$/, '')}.`
      : 'Não houve um único componente dominante; foi a soma de pequenas penalizações ao longo do índice.',
    sono != null
      ? `O cálculo também considerou ${formatHoursAndMinutes(sono)} de sono efetivo antes da jornada.`
      : 'O cálculo não recebeu uma estimativa confiável de sono efetivo.',
  ].join(' ');

  const deterministicPayload: Omit<FrmsDayExplanationPayload, 'copiloto'> = {
    tripulante: {
      id: String(row.tripulante_id ?? ''),
      nome: String(row.tripulante_nome ?? `Tripulante #${String(row.tripulante_id ?? '')}`),
      cargo: typeof row.tripulante_cargo === 'string' ? row.tripulante_cargo : null,
    },
    jornada: {
      data: String(row.data_apresentacao ?? ''),
      hora_apresentacao: normalizeHora(row.hora_apresentacao as string | null | undefined),
      hora_acordou: normalizeHora(row.hora_acordou as string | null | undefined),
      effectiveness_pct: pct,
      effectiveness_nivel:
        typeof row.effectiveness_nivel === 'string' ? row.effectiveness_nivel : null,
      tempo_abaixo_limiar_min: tempoAbaixo,
      dias_criticos_consecutivos:
        row.dias_criticos_consecutivos == null ? 0 : Number(row.dias_criticos_consecutivos),
      duracao_sono_efetiva_min: sono,
      hora_despertar_estimada:
        typeof row.hora_despertar_estimada === 'string' ? row.hora_despertar_estimada : null,
      hora_inicio_sono_estimado:
        typeof row.hora_inicio_sono_estimado === 'string' ? row.hora_inicio_sono_estimado : null,
      dia_periodo_embarcado:
        row.dia_periodo_embarcado == null ? null : Number(row.dia_periodo_embarcado),
      total_dias_periodo: row.total_dias_periodo == null ? null : Number(row.total_dias_periodo),
    },
    diagnostico: {
      faixa,
      resumo_executivo: resumoExecutivo,
      explicacao_tecnica: explicacaoTecnica,
      explicacao_didatica: explicacaoDidatica,
      fator_principal: fatorPrincipal?.titulo ?? 'Combinação de fatores',
      fatores,
      recomendacoes: recommendations,
    },
  };
  const explanationTrace = buildFrmsDayExplanationTrace(
    row,
    deterministicPayload,
    componentes,
    fatorPrincipal,
    traceContext,
  );

  if (!isFrmsDayExplanationAiEnabled(env)) {
    return {
      ...deterministicPayload,
      explanation_trace: explanationTrace,
      copiloto: {
        texto: deterministicPayload.diagnostico.explicacao_didatica,
        provider: 'rule-engine',
        model: 'frms-day-explainer-v1',
      },
    };
  }

  const systemPrompt =
    'Você é o copiloto FRMS da AirTrust. Responda em português do Brasil, usando SOMENTE os dados fornecidos. ' +
    'Explique o dia de forma didática para um operador, sem inventar causas, sem extrapolar para outras empresas e sem contradizer a leitura determinística. ' +
    'Use linguagem de indicador operacional e triagem; não chame o resultado de diagnóstico de fadiga fisiológica e não recomende retirada automática de escala. ' +
    'Seja objetivo: escreva exatamente 2 parágrafos curtos. ' +
    'Use no máximo 1 termo em **negrito** quando realmente ajudar, sem listas, sem títulos e sem markdown pesado.';

  // Primeiro tenta modelo rápido; em seguida, fallback mais robusto para evitar retorno determinístico.
  const aiModels = ['@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];

  for (const model of aiModels) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await runAiWithTimeout(
        (env.AI as any).run(model, {
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Explique este dia operacional com base apenas neste JSON:\n${JSON.stringify(deterministicPayload)}`,
            },
          ],
          max_tokens: 320,
        }),
        3200,
      )) as { response?: string };

      if (result?.response?.trim()) {
        return {
          ...deterministicPayload,
          explanation_trace: explanationTrace,
          copiloto: {
            texto: sanitizeCopilotoTexto(
              result.response,
              deterministicPayload.diagnostico.explicacao_didatica,
            ),
            provider: 'cloudflare-workers-ai',
            model,
          },
        };
      }
    } catch {
      // Tenta o próximo modelo disponível.
    }
  }

  return {
    ...deterministicPayload,
    explanation_trace: explanationTrace,
    copiloto: {
      texto: deterministicPayload.diagnostico.explicacao_didatica,
      provider: 'rule-engine',
      model: 'frms-day-explainer-v1',
    },
  };
}

function diffDaysInclusive(dataInicio: string, dataFim: string): number {
  const start = Date.parse(`${dataInicio}T00:00:00Z`);
  const end = Date.parse(`${dataFim}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function normalizeQueryFilters(
  input: string | string[] | undefined,
  fallback: string,
): string[] {
  if (Array.isArray(input)) {
    return [...new Set(input.map((item) => String(item).trim().toUpperCase()).filter(Boolean))];
  }
  return normalizeFortnightMaterializationFilters(input, fallback);
}

function assertMaintenanceWindow(
  dataInicio: string,
  dataFim: string,
  maxDays: number,
  errorMessage: string,
): Response | null {
  const totalDays = diffDaysInclusive(dataInicio, dataFim);
  if (totalDays <= 0 || totalDays > maxDays) {
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  return null;
}

function resolveAuthenticatedEmpresaId(c: FrmsAppContext): number | null {
  const empresaId = getEmpresaIdSafe(c);
  return Number.isInteger(empresaId) && Number(empresaId) > 0 ? Number(empresaId) : null;
}

function assertRequestedEmpresaMatchesTenant(
  c: FrmsAppContext,
  requestedEmpresaId: number | undefined,
): Response | null {
  const empresaId = resolveAuthenticatedEmpresaId(c);
  if (!empresaId) {
    return c.json(
      { success: false, error: 'Contexto de empresa ausente.', code: 'TENANT_CONTEXT_REQUIRED' },
      403,
    );
  }
  if (requestedEmpresaId && requestedEmpresaId !== empresaId) {
    return c.json(
      {
        success: false,
        error: 'empresa_id divergente do tenant autenticado.',
        code: 'TENANT_ACCESS_DENIED',
      },
      403,
    );
  }
  return null;
}

frmsRoutes.get(
  '/maintenance/fortnight-coverage',
  rateLimiter({ maxRequests: 20, windowSeconds: 60, keyPrefix: 'frms-maintenance-coverage' }),
  requireMaintenanceCapability(
    MAINTENANCE_CAPABILITIES.frmsVisualizar,
    'Acesso restrito a operadores autorizados do FRMS.',
  ),
  safe(async (c) => {
    const operationId = crypto.randomUUID();
    const startedAt = Date.now();
    const parsed = FortnightCoverageMaintenanceQuerySchema.safeParse({
      empresa_id: c.req.query('empresa_id'),
      data_inicio: c.req.query('data_inicio'),
      data_fim: c.req.query('data_fim'),
      origem: c.req.query('origem') ?? undefined,
      status: c.req.query('status') ?? undefined,
    });
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: 'Parâmetros inválidos.',
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const tenantMismatch = assertRequestedEmpresaMatchesTenant(c, parsed.data.empresa_id);
    if (tenantMismatch) return tenantMismatch;

    const empresaId = resolveAuthenticatedEmpresaId(c);
    const { data_inicio, data_fim } = parsed.data;
    if (!empresaId) {
      return c.json(
        { success: false, error: 'Contexto de empresa ausente.', code: 'TENANT_CONTEXT_REQUIRED' },
        403,
      );
    }
    const invalidWindow = assertMaintenanceWindow(
      data_inicio,
      data_fim,
      FRMS_FORTNIGHT_COVERAGE_MAX_WINDOW_DAYS,
      `Janela máxima de ${FRMS_FORTNIGHT_COVERAGE_MAX_WINDOW_DAYS} dias para coverage.`,
    );
    if (invalidWindow) return invalidWindow;

    const coverage = await getFrmsFortnightCoverage(c.env.DB, {
      empresaId,
      dataInicio: data_inicio,
      dataFim: data_fim,
      origem: parsed.data.origem ? normalizeQueryFilters(parsed.data.origem, 'SIGVOOS') : undefined,
      status: parsed.data.status ? normalizeQueryFilters(parsed.data.status, 'ES') : undefined,
    });

    await recordMaintenanceAudit(c, {
      action: 'FRMS_MAINTENANCE_FORTNIGHT_COVERAGE',
      module: 'frms',
      entityType: 'frms_maintenance',
      capability: MAINTENANCE_CAPABILITIES.frmsVisualizar,
      entityId: operationId,
      success: true,
      riskLevel: 'medium',
      result: 'success',
      approximateCount: Array.isArray((coverage as { items?: unknown[] }).items)
        ? Number((coverage as { items?: unknown[] }).items?.length || 0)
        : undefined,
      durationMs: Date.now() - startedAt,
      operationId,
    }).catch(() => {});

    return c.json({ success: true, operation_id: operationId, ...coverage });
  }),
);

frmsRoutes.get(
  '/maintenance/fortnight-materialization-preview',
  rateLimiter({ maxRequests: 20, windowSeconds: 60, keyPrefix: 'frms-maintenance-preview' }),
  requireMaintenanceCapability(
    MAINTENANCE_CAPABILITIES.frmsVisualizar,
    'Acesso restrito a operadores autorizados do FRMS.',
  ),
  safe(async (c) => {
    const operationId = crypto.randomUUID();
    const startedAt = Date.now();
    const parsed = FortnightCoverageMaintenanceQuerySchema.safeParse({
      empresa_id: c.req.query('empresa_id'),
      data_inicio: c.req.query('data_inicio'),
      data_fim: c.req.query('data_fim'),
      origem: c.req.query('origem') ?? undefined,
      status: c.req.query('status') ?? undefined,
    });
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: 'Parâmetros inválidos.',
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const tenantMismatch = assertRequestedEmpresaMatchesTenant(c, parsed.data.empresa_id);
    if (tenantMismatch) return tenantMismatch;

    const empresaId = resolveAuthenticatedEmpresaId(c);
    const { data_inicio, data_fim } = parsed.data;
    if (!empresaId) {
      return c.json(
        { success: false, error: 'Contexto de empresa ausente.', code: 'TENANT_CONTEXT_REQUIRED' },
        403,
      );
    }
    const invalidWindow = assertMaintenanceWindow(
      data_inicio,
      data_fim,
      31,
      'Janela máxima de 31 dias para preview.',
    );
    if (invalidWindow) return invalidWindow;

    const preview = await previewFortnightBaseMaterialization(c.env.DB, {
      empresaId,
      dataInicio: data_inicio,
      dataFim: data_fim,
      origem: normalizeQueryFilters(parsed.data.origem, 'SIGVOOS'),
      status: normalizeQueryFilters(parsed.data.status, 'ES'),
    });

    await recordMaintenanceAudit(c, {
      action: 'FRMS_MAINTENANCE_FORTNIGHT_MATERIALIZATION_PREVIEW',
      module: 'frms',
      entityType: 'frms_maintenance',
      capability: MAINTENANCE_CAPABILITIES.frmsVisualizar,
      entityId: operationId,
      success: true,
      riskLevel: 'medium',
      result: 'success',
      approximateCount: Number((preview as { atualizaveis?: number }).atualizaveis || 0),
      durationMs: Date.now() - startedAt,
      operationId,
    }).catch(() => {});

    return c.json({ success: true, operation_id: operationId, data: preview });
  }),
);

for (const path of [
  '/maintenance/fortnight-materialization-apply',
  '/maintenance/reprocessar-lote',
  '/maintenance/reprocessar-faixa',
]) {
  frmsRoutes.post(path, () => localMaintenanceMutationNotFound());
}

// FRMS: auth obrigatória (módulo flight-safety-critical RBAC 117)
frmsRoutes.use('*', auth());

frmsRoutes.get(
  '/score-atual/:funcionarioid',
  rateLimiter({ maxRequests: 180, windowSeconds: 60, keyPrefix: 'frms-score' }),
  safe(async (c) => {
    const funcionarioId = c.req.param('funcionarioid') ?? '';
    const empresaId = getEmpresaIdSafe(c);

    if (empresaId) {
      const func = await c.env.DB.prepare(
        'SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
      )
        .bind(Number(funcionarioId), empresaId)
        .first<{ id: number }>();

      if (!func) {
        return c.json(
          {
            success: false,
            error: 'Tripulante não pertence à sua empresa.',
            code: 'TENANT_ACCESS_DENIED',
          },
          403,
        );
      }
    }

    // Triagem operacional usa apenas fonte canônica (SIGVOOS); FIRA/MANUAL não inflam o score.
    const horas7 = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(COALESCE(horas_voo_minutos,0)),0) AS minutos
         FROM frms_jornada
        WHERE tripulante_id = ?
          AND date(data) >= date('now','-7 days')
          AND deleted_at IS NULL
          AND ${buildCanonicalOperationalSourceSql('origem')}`,
    )
      .bind(funcionarioId)
      .first<{ minutos: number }>();

    const horas28 = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(COALESCE(horas_voo_minutos,0)),0) AS minutos
         FROM frms_jornada
        WHERE tripulante_id = ?
          AND date(data) >= date('now','-28 days')
          AND deleted_at IS NULL
          AND ${buildCanonicalOperationalSourceSql('origem')}`,
    )
      .bind(funcionarioId)
      .first<{ minutos: number }>();

    const diasAtivos28 = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT date(data)) AS dias
         FROM frms_jornada
        WHERE tripulante_id = ?
          AND date(data) >= date('now','-28 days')
          AND deleted_at IS NULL
          AND ${buildCanonicalOperationalSourceSql('origem')}`,
    )
      .bind(funcionarioId)
      .first<{ dias: number }>();

    const minutos7 = Number(horas7?.minutos || 0);
    const minutos28 = Number(horas28?.minutos || 0);
    const dias = Number(diasAtivos28?.dias || 0);

    const horasUltimos7d = Math.round((minutos7 / 60) * 10) / 10;
    const horasUltimos28d = Math.round((minutos28 / 60) * 10) / 10;

    const scoreBase = Math.min(100, horasUltimos7d * 2.5 + horasUltimos28d * 0.8 + dias * 1.1);
    const scoreFadiga = Math.round(scoreBase);

    // Unificado com getFrmsOperationalState: critico = alertas CRITICO/VIOLACAO não resolvidos
    const frmsState = await getFrmsOperationalState(c.env.DB, funcionarioId);
    const nivel = frmsState.frms_status;
    const statusTriagemOperacional =
      nivel === 'critico' ? 'revisao_operacional' : nivel === 'atencao' ? 'acompanhar' : 'sem_achado';

    return c.json({
      success: true,
      data: {
        funcionarioid: funcionarioId,
        horasUltimos7d,
        horasUltimos28d,
        scoreFadiga,
        nivel,
        status_triagem_operacional: statusTriagemOperacional,
        fit_for_duty_indicator: null,
        interpretation_warning:
          'Endpoint legado de triagem FRMS. O campo apto_para_voo e mantido apenas por compatibilidade e nao deve ser usado como decisao automatica de aptidao.',
        legacy_fields: {
          apto_para_voo:
            'Campo legado derivado de alertas/estado FRMS. Use status_triagem_operacional para leitura informativa.',
        },
        apto_para_voo: nivel !== 'critico',
      },
    });
  }),
);

// ════════════════════════════════════════════════════════
// JORNADAS
// ════════════════════════════════════════════════════════

const jornadaCreateSchema = z.object({
  tripulante_id: z.union([z.string(), z.number()]).transform(String),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(FRMS_STATUS),
  hora_apresentacao: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  hora_termino: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  horas_voo_minutos: z.number().int().min(0).optional().nullable(),
  hora_primeiro_acionamento: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  hora_primeira_decolagem: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  hora_ultimo_pouso: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  hora_corte_motor: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  hora_dormiu: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  repouso_plataforma_inicio: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  repouso_plataforma_fim: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  observacao: z.string().optional().nullable(),
  tipo_base: z.enum(['HOME', 'AWAY']).optional().default('HOME'),
  tripulacao_aumentada: z.number().int().min(0).max(1).optional().default(0),
  classe_cabine: z.enum(['ECONOMY', 'BUSINESS']).optional().nullable(),
  aclimatado: z.number().int().min(0).max(1).optional().default(1),
});

const jornadaUpdateSchema = jornadaCreateSchema.partial();

const jornadaSonoPatchSchema = z.object({
  horaDormiu: z.string().regex(/^\d{2}:\d{2}$/),
});

const alertaTesteEmailSchema = z.object({
  destinatarios: z.array(z.string().trim().email()).min(1).max(20),
});

const alertaManualSchema = z.object({
  destinatarios: z.array(z.string().trim().email()).min(1).max(20).optional(),
  assunto: z.string().trim().min(1).max(200),
  mensagem: z.string().trim().min(1).max(5000),
  prioridade: z.enum(['ALTA', 'MEDIA', 'BAIXA']).optional().default('MEDIA'),
});

const frmsSimularCenarioSchema = z
  .object({
    hora_apresentacao_simulada: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    hora_acordou_simulada: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    sono_efetivo_simulado_min: z.number().int().min(0).max(1440).optional(),
    origem_tela: z.enum(['dashboard', 'ficha']).optional().default('dashboard'),
  })
  .refine(
    (payload) =>
      payload.hora_apresentacao_simulada !== undefined ||
      payload.hora_acordou_simulada !== undefined ||
      payload.sono_efetivo_simulado_min !== undefined,
    {
      message: 'Informe ao menos um campo para simulação.',
      path: ['hora_apresentacao_simulada'],
    },
  );

const frmsJustificativaSchema = z.object({
  decisao_tomada: z.string().trim().min(3).max(200),
  observacoes: z.string().trim().max(5000).optional().default(''),
  origem_tela: z.enum(['dashboard', 'ficha']).optional().default('dashboard'),
});

function formatarDataHoraBrasilia(date = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function prioridadeMeta(prioridade: 'ALTA' | 'MEDIA' | 'BAIXA'): {
  icone: string;
  label: string;
} {
  if (prioridade === 'ALTA') return { icone: '⚠️', label: 'ALTA' };
  if (prioridade === 'BAIXA') return { icone: 'ℹ️', label: 'BAIXA' };
  return { icone: '🔔', label: 'MÉDIA' };
}

async function registrarEventoSigvoosEmail(
  db: D1Database,
  empresaId: number | null,
  tipoEvento: 'EMAIL_TESTE' | 'ALERTA_MANUAL',
  status: 'SUCESSO' | 'FALHA',
  payload: Record<string, unknown>,
  erro?: string,
): Promise<void> {
  const agora = new Date().toISOString();
  const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  await db
    .prepare(
      `INSERT INTO integracoes_sigvoos_eventos (
         id, empresa_id, tipo_evento, status, payload_json, erro_ultima, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, empresaId, tipoEvento, status, JSON.stringify(payload), erro ?? null, agora, agora)
    .run();
}

/**
 * POST /api/frms/jornadas
 * Cria jornada → calcula fatorização → recalcula acúmulo → roda alertas
 */
frmsRoutes.post(
  '/jornadas',
  rateLimiter({ maxRequests: 60, windowSeconds: 60, keyPrefix: 'frms-jornadas' }),
  safe(async (c) => {
    const body = await c.req.json();
    const parsed = jornadaCreateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }

    const denied = await assertTripulanteEmpresa(c, String(parsed.data.tripulante_id));
    if (denied) return denied;

    const userId = await resolveFuncionarioId(c);
    const empresaId = getEmpresaIdSafe(c);

    // salvarJornada resolves empresaId (via the tripulante's own record when
    // absent from context) and the governed operational context internally.
    let result;
    try {
      result = await salvarJornada(
        c.env.DB,
        { ...parsed.data, registrado_por: userId },
        LIMITES_DEFAULT,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        return c.json(
          {
            success: false,
            error: 'Já existe uma jornada registrada para este tripulante nesta data.',
            code: 'DUPLICATE_JORNADA',
          },
          409,
        );
      }
      throw err;
    }

    const jornadaId = String(result.jornada?.id || '');

    if (result.bloqueado) {
      if (empresaId) {
        try {
          const estado = await getFrmsOperationalState(c.env.DB, String(parsed.data.tripulante_id));
          await publishDomainEvent(c.env.DB, 'frms', 'FRMS_AVALIACAO_CRIADA', {
            origem_modulo: 'frms',
            funcionario_id: String(parsed.data.tripulante_id),
            empresa_id: empresaId,
            frms_score: estado.frms_score,
            status: estado.frms_status,
            jornada_id: jornadaId,
          });
          if (estado.frms_status === 'critico') {
            await publishDomainEvent(c.env.DB, 'frms', 'FRMS_STATUS_CRITICO', {
              origem_modulo: 'frms',
              funcionario_id: String(parsed.data.tripulante_id),
              empresa_id: empresaId,
              frms_score: estado.frms_score,
              jornada_id: jornadaId,
            });
          }
        } catch (error) {
          logDomainEventError(c, 'FRMS_AVALIACAO_CRIADA', error, {
            funcionario_id: String(parsed.data.tripulante_id),
            jornada_id: jornadaId,
          });
        }
      } else {
        logDomainEventError(
          c,
          'FRMS_AVALIACAO_CRIADA',
          new Error('empresaId ausente no contexto — evento FRMS não publicado'),
          { funcionario_id: String(parsed.data.tripulante_id), jornada_id: jornadaId },
        );
      }

      await auditFrms(c, 'frms_jornada', 'INSERT', result.jornada?.id || 0, {
        depois: parsed.data,
      });
      return c.json({
        success: true,
        data: result,
        warning: 'Jornada salva mas nível CRÍTICO atingido — próximo lançamento será bloqueado.',
      });
    }

    if (empresaId) {
      try {
        const estado = await getFrmsOperationalState(c.env.DB, String(parsed.data.tripulante_id));
        await publishDomainEvent(c.env.DB, 'frms', 'FRMS_AVALIACAO_CRIADA', {
          origem_modulo: 'frms',
          funcionario_id: String(parsed.data.tripulante_id),
          empresa_id: empresaId,
          frms_score: estado.frms_score,
          status: estado.frms_status,
          jornada_id: jornadaId,
        });
        if (estado.frms_status === 'critico') {
          await publishDomainEvent(c.env.DB, 'frms', 'FRMS_STATUS_CRITICO', {
            origem_modulo: 'frms',
            funcionario_id: String(parsed.data.tripulante_id),
            empresa_id: empresaId,
            frms_score: estado.frms_score,
            jornada_id: jornadaId,
          });
        }
      } catch (error) {
        logDomainEventError(c, 'FRMS_STATUS_CRITICO', error, {
          funcionario_id: String(parsed.data.tripulante_id),
          jornada_id: jornadaId,
        });
      }
    } else {
      logDomainEventError(
        c,
        'FRMS_STATUS_CRITICO',
        new Error('empresaId ausente no contexto — evento FRMS não publicado'),
        { funcionario_id: String(parsed.data.tripulante_id), jornada_id: jornadaId },
      );
    }

    await auditFrms(c, 'frms_jornada', 'INSERT', result.jornada?.id || 0, { depois: parsed.data });
    if (result.jornada?.id && empresaId) {
      await syncHorasVooFromFrmsJornada(c.env.DB, Number(result.jornada.id), empresaId);
    }
    return c.json({ success: true, data: result }, 201);
  }),
);

/**
 * PUT /api/frms/jornadas/:id
 * Atualiza jornada → recalcula tudo
 */
frmsRoutes.put(
  '/jornadas/:id',
  rateLimiter({ maxRequests: 60, windowSeconds: 60, keyPrefix: 'frms-jornadas' }),
  safe(async (c) => {
    const id = c.req.param('id') ?? '';
    const empresaId = getEmpresaIdSafe(c);
    const denied = await assertJornadaEmpresa(c, id);
    if (denied) return denied;

    const body = await c.req.json();
    const parsed = jornadaUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }

    if (parsed.data.tripulante_id !== undefined) {
      const deniedTrip = await assertTripulanteEmpresa(c, String(parsed.data.tripulante_id));
      if (deniedTrip) return deniedTrip;
    }

    // atualizarJornada's limites parameter is inert (it self-resolves governed context internally).
    const result = await atualizarJornada(c.env.DB, id, parsed.data, LIMITES_DEFAULT);

    try {
      const jornada = await c.env.DB.prepare(
        'SELECT tripulante_id FROM frms_jornada WHERE id = ? AND deleted_at IS NULL',
      )
        .bind(id)
        .first<{ tripulante_id: string | number }>();
      const funcionarioId = String(parsed.data.tripulante_id ?? jornada?.tripulante_id ?? '');
      if (funcionarioId && empresaId) {
        const estado = await getFrmsOperationalState(c.env.DB, funcionarioId);
        await publishDomainEvent(c.env.DB, 'frms', 'FRMS_AVALIACAO_CRIADA', {
          origem_modulo: 'frms',
          funcionario_id: funcionarioId,
          empresa_id: empresaId,
          frms_score: estado.frms_score,
          status: estado.frms_status,
          jornada_id: id,
        });
        await publishDomainEvent(
          c.env.DB,
          'frms',
          estado.frms_status === 'critico' ? 'FRMS_STATUS_CRITICO' : 'FRMS_STATUS_NORMALIZADO',
          {
            origem_modulo: 'frms',
            funcionario_id: funcionarioId,
            empresa_id: empresaId,
            frms_score: estado.frms_score,
            jornada_id: id,
          },
        );
      } else if (funcionarioId && !empresaId) {
        logDomainEventError(
          c,
          'FRMS_STATUS_TRANSITION',
          new Error('empresaId ausente no contexto — evento FRMS não publicado'),
          { funcionario_id: funcionarioId, jornada_id: id },
        );
      }
    } catch (error) {
      logDomainEventError(c, 'FRMS_STATUS_TRANSITION', error, {
        jornada_id: id,
      });
    }

    await auditFrms(c, 'frms_jornada', 'UPDATE', id, { depois: parsed.data });
    if (empresaId) {
      await syncHorasVooFromFrmsJornada(c.env.DB, Number(id), empresaId);
    }
    return c.json({ success: true, data: result });
  }),
);

/**
 * PATCH /api/frms/jornada/:jornadaId/sono
 * Define hora de dormir informada pelo tripulante/admin e recalcula pipeline FRMS.
 */
frmsRoutes.patch(
  '/jornada/:jornadaId/sono',
  safe(async (c) => {
    const jornadaId = c.req.param('jornadaId') ?? '';
    const denied = await assertJornadaEmpresa(c, jornadaId);
    if (denied) return denied;

    const body = await c.req.json().catch(() => ({}));
    const parsed = jornadaSonoPatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.flatten(), code: 'VALIDATION_ERROR' },
        400,
      );
    }

    const jornada = await c.env.DB.prepare(
      `SELECT ${FRMS_JORNADA_SELECT_COLUMNS}
         FROM frms_jornada
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
      .bind(jornadaId)
      .first<Record<string, unknown>>();

    if (!jornada) {
      return c.json({ success: false, error: 'Jornada não encontrada', code: 'NOT_FOUND' }, 404);
    }

    const role = String(c.get('userRole') || '').toUpperCase();
    const isPrivileged = role === 'ADMIN' || role === 'MANAGER' || role === 'GESTOR';
    const funcionarioIdSessao = await resolveFuncionarioId(c);
    const tripulanteIdJornada = String(jornada.tripulante_id || '');
    if (!isPrivileged && funcionarioIdSessao !== tripulanteIdJornada) {
      return c.json(
        {
          success: false,
          error: 'Sem permissão para editar sono desta jornada.',
          code: 'FORBIDDEN',
        },
        403,
      );
    }

    await c.env.DB.prepare(
      `UPDATE frms_jornada
          SET hora_dormiu = ?,
              fonte_sono = 'INFORMADO',
              updated_at = datetime('now')
        WHERE id = ?
          AND deleted_at IS NULL`,
    )
      .bind(parsed.data.horaDormiu, jornadaId)
      .run();

    // recalcularPipeline's limites parameter is inert (self-resolves governed context).
    const jornadaAtualizada = {
      ...(jornada as Record<string, unknown>),
      hora_dormiu: parsed.data.horaDormiu,
    };

    const result = await recalcularPipeline(c.env.DB, jornadaAtualizada as never, LIMITES_DEFAULT);

    const fatorizacao = await c.env.DB.prepare(
      `SELECT ${FRMS_FATORIZACAO_SELECT_COLUMNS}
         FROM frms_fatorizacao_jornada
        WHERE jornada_id = ?
          AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1`,
    )
      .bind(jornadaId)
      .first<Record<string, unknown>>();

    const jornadaFinal = await c.env.DB.prepare(
      `SELECT ${FRMS_JORNADA_SELECT_COLUMNS}
         FROM frms_jornada
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
      .bind(jornadaId)
      .first<Record<string, unknown>>();

    await auditFrms(c, 'frms_jornada', 'UPDATE', jornadaId, {
      antes: { hora_dormiu: jornada.hora_dormiu ?? null },
      depois: { hora_dormiu: parsed.data.horaDormiu, fonte_sono: 'INFORMADO' },
    });

    return c.json({
      success: true,
      data: {
        jornada: jornadaFinal,
        fatorizacao,
        pipeline: result,
      },
    });
  }),
);

/**
 * DELETE /api/frms/jornadas/mes/:tripulanteId?mes=YYYY-MM
 * Exclui (soft delete) todas as jornadas do tripulante no mês informado.
 * Deve ser registrado ANTES de /jornadas/:id para evitar conflito de padrão.
 */
frmsRoutes.delete(
  '/jornadas/mes/:tripulanteId',
  requireRole('admin'),
  safe(async (c) => {
    const tripulanteId = c.req.param('tripulanteId') ?? '';
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;

    const mes = c.req.query('mes');
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return c.json({ success: false, error: 'Parâmetro mes obrigatório no formato YYYY-MM' }, 400);
    }

    const [ano, mesNum] = mes.split('-').map(Number);
    const dataInicio = `${mes}-01`;
    const ultimoDia = new Date(ano, mesNum, 0).getDate();
    const dataFim = `${mes}-${String(ultimoDia).padStart(2, '0')}`;

    const rows = await c.env.DB.prepare(
      `SELECT id FROM frms_jornada
       WHERE tripulante_id = ?
         AND date(data) >= date(?)
         AND date(data) <= date(?)
         AND deleted_at IS NULL`,
    )
      .bind(tripulanteId, dataInicio, dataFim)
      .all<{ id: string }>();

    if (!rows.results.length) {
      return c.json({ success: true, deleted: 0, message: 'Nenhuma jornada encontrada no mês' });
    }

    // deletarJornada's limites parameter is inert (recalcularPipeline self-resolves governed context per jornada).
    for (const row of rows.results) {
      await deletarJornada(c.env.DB, String(row.id), LIMITES_DEFAULT);
    }

    return c.json({ success: true, deleted: rows.results.length });
  }),
);

/**
 * DELETE /api/frms/jornadas/:id
 * Soft delete → recalcula acúmulo rolling
 */
frmsRoutes.delete(
  '/jornadas/:id',
  safe(async (c) => {
    const id = c.req.param('id') ?? '';
    const denied = await assertJornadaEmpresa(c, id);
    if (denied) return denied;

    // deletarJornada's limites parameter is inert (recalcularPipeline self-resolves governed context per jornada).
    const empresaId = getEmpresaIdSafe(c);
    await deletarJornada(c.env.DB, id, LIMITES_DEFAULT);
    if (empresaId) {
      await syncHorasVooFromFrmsJornada(c.env.DB, Number(id), empresaId);
    }
    await auditFrms(c, 'frms_jornada', 'DELETE', id);
    return c.json({ success: true });
  }),
);

/**
 * GET /api/frms/jornadas/:tripulante_id
 * Query: ?mes=2026-02 | ?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD
 */
frmsRoutes.get(
  '/jornadas/:tripulante_id',
  safe(async (c) => {
    const tripulanteId = c.req.param('tripulante_id') ?? '';
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;

    const mes = c.req.query('mes');
    const dataInicio = c.req.query('data_inicio');
    const dataFim = c.req.query('data_fim');
    const page = c.req.query('page') ? Number(c.req.query('page')) : undefined;
    const pageSize = c.req.query('pageSize') ? Number(c.req.query('pageSize')) : undefined;

    const result = await buscarJornadas(c.env.DB, tripulanteId, {
      mes: mes ?? undefined,
      data_inicio: dataInicio ?? undefined,
      data_fim: dataFim ?? undefined,
      page,
      pageSize,
    });

    return c.json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
    });
  }),
);

// ════════════════════════════════════════════════════════
// ACÚMULO
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/acumulo/:tripulante_id
 * Retorna acúmulo mensal + rolling atual
 * Query: ?mes=YYYY-MM (opcional — padrão: último mês com jornadas)
 */
frmsRoutes.get(
  '/acumulo/:tripulante_id',
  safe(async (c) => {
    const tripulanteId = c.req.param('tripulante_id') ?? '';
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      return c.json(
        { success: false, error: 'Tenant context ausente.', code: 'FRMS_CONTEXT_UNAVAILABLE' },
        403,
      );
    }

    const mes = c.req.query('mes') ?? undefined;
    const acumulo = await buscarAcumuloTripulante(c.env.DB, tripulanteId, empresaId, mes);
    return c.json({ success: true, data: acumulo });
  }),
);

/**
 * POST /api/frms/reprocessar
 * Dispara reprocessamento completo de todos os tripulantes (recalcula jornadas + alertas).
 * Retorna imediatamente — processamento ocorre em background via waitUntil.
 */
frmsRoutes.post(
  '/reprocessar',
  rateLimiter({ maxRequests: 10, windowSeconds: 60, keyPrefix: 'frms-reprocessar' }),
  requireRole('admin'),
  requireMaintenanceCapability(
    MAINTENANCE_CAPABILITIES.frmsExecutar,
    'Reprocessamento FRMS restrito a administradores autorizados.',
  ),
  safe(async (c) => {
    const impersonationDenied = await assertNoImpersonation(c, 'FRMS_REPROCESS_IMPERSONATION_BLOCKED');
    if (impersonationDenied) return impersonationDenied;

    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      return c.json(
        { success: false, error: 'Contexto de empresa inválido', code: 'INVALID_TENANT_CONTEXT' },
        403,
      );
    }

    const operationId = crypto.randomUUID();
    const startedAt = Date.now();
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const result = await reprocessarTodosTripulantes(c.env.DB, empresaId);
          await recordMaintenanceAudit(c, {
            action: 'FRMS_REPROCESS_ALL',
            module: 'frms',
            entityType: 'frms_reprocessamento',
            capability: MAINTENANCE_CAPABILITIES.frmsExecutar,
            entityId: operationId,
            success: true,
            riskLevel: 'high',
            result: 'success',
            count: Number(result.jornadas || 0),
            durationMs: Date.now() - startedAt,
            operationId,
          });
        } catch {
          await recordMaintenanceAudit(c, {
            action: 'FRMS_REPROCESS_ALL',
            module: 'frms',
            entityType: 'frms_reprocessamento',
            capability: MAINTENANCE_CAPABILITIES.frmsExecutar,
            entityId: operationId,
            success: false,
            riskLevel: 'critical',
            result: 'error',
            durationMs: Date.now() - startedAt,
            operationId,
            failureReasonCode: 'FRMS_REPROCESS_ALL_FAILED',
          });
        }
      })(),
    );
    return c.json({
      success: true,
      operation_id: operationId,
      message: 'Reprocessamento iniciado em background',
    });
  }),
);

/**
 * GET /api/frms/tripulantes-ativos
 * Retorna lista leve { id, nome } dos tripulantes com jornadas FRMS.
 * Usado pelo frontend para reprocessamento sequencial com progresso real.
 */
frmsRoutes.get(
  '/tripulantes-ativos',
  requireRole('admin'),
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      return c.json(
        { success: false, error: 'Contexto de empresa inválido', code: 'INVALID_TENANT_CONTEXT' },
        403,
      );
    }
    const tripulantes = await listarTripulantesAtivos(c.env.DB, empresaId);
    return c.json({ success: true, data: tripulantes });
  }),
);

/**
 * POST /api/frms/reprocessar/:tripulante_id
 * Reprocessa um único tripulante de forma SÍNCRONA.
 * Usado pelo frontend para reprocessamento sequencial com progresso real,
 * evitando o timeout do waitUntil em lotes grandes.
 */
frmsRoutes.post(
  '/reprocessar/:tripulante_id',
  rateLimiter({ maxRequests: 10, windowSeconds: 60, keyPrefix: 'frms-reprocessar-tripulante' }),
  requireRole('admin'),
  requireMaintenanceCapability(
    MAINTENANCE_CAPABILITIES.frmsExecutar,
    'Reprocessamento FRMS restrito a administradores autorizados.',
  ),
  safe(async (c) => {
    const impersonationDenied = await assertNoImpersonation(c, 'FRMS_REPROCESS_IMPERSONATION_BLOCKED');
    if (impersonationDenied) return impersonationDenied;

    const tripulanteId = Number(c.req.param('tripulante_id'));
    if (!tripulanteId || isNaN(tripulanteId)) {
      return c.json({ success: false, error: 'tripulante_id inválido' }, 400);
    }
    const denied = await assertTripulanteEmpresa(c, String(tripulanteId));
    if (denied) return denied;

    const operationId = crypto.randomUUID();
    const startedAt = Date.now();
    // reprocessarTripulanteCompleto's limites parameter is inert (recalcularPipeline self-resolves).
    const count = await reprocessarTripulanteCompleto(c.env.DB, tripulanteId, LIMITES_DEFAULT);
    await recordMaintenanceAudit(c, {
      action: 'FRMS_REPROCESS_TRIPULANTE',
      module: 'frms',
      entityType: 'frms_reprocessamento',
      capability: MAINTENANCE_CAPABILITIES.frmsExecutar,
      entityId: String(tripulanteId),
      success: true,
      riskLevel: 'high',
      result: 'success',
      count,
      durationMs: Date.now() - startedAt,
      operationId,
    }).catch(() => {});

    return c.json({
      success: true,
      operation_id: operationId,
      data: { tripulante_id: tripulanteId, jornadas: count },
    });
  }),
);

/**
 * GET /api/frms/ultimo-mes
 * Retorna o mês mais recente com jornadas registradas para a empresa.
 * Usado pelo dashboard para definir o mês padrão.
 */
frmsRoutes.get(
  '/ultimo-mes',
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const row = await c.env.DB.prepare(
      `SELECT strftime('%Y-%m', j.data) as mes
       FROM frms_jornada j
       LEFT JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
       WHERE j.deleted_at IS NULL
         AND f.deleted_at IS NULL
         AND COALESCE(f.ativo, 1) = 1
         AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
         AND (? IS NULL OR f.empresa_id = ?)
       ORDER BY j.data DESC
       LIMIT 1`,
    )
      .bind(empresaId ?? null, empresaId ?? null)
      .first<{ mes: string }>();

    const mesAtual = new Date().toISOString().slice(0, 7);
    return c.json({ success: true, data: { mes: row?.mes ?? mesAtual } });
  }),
);

/**
 * GET /api/frms/tripulante/:id/jornadas
 * Retorna jornadas com effectiveness_pct para a curva temporal do proxy local
 * Query: ?dias=30 (default 30, max 365)
 */
frmsRoutes.get(
  '/tripulante/:id/jornadas',
  safe(async (c) => {
    const tripulanteId = c.req.param('id') ?? '';
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;

    const empresaId = getEmpresaIdSafe(c);
    const dias = Math.min(Math.max(parseInt(c.req.query('dias') ?? '30'), 7), 365);
    const inicio = c.req.query('inicio') ?? null;
    const fim = c.req.query('fim') ?? null;
    const hasRange = Boolean(inicio && fim);

    if ((inicio && !fim) || (!inicio && fim)) {
      return c.json(
        {
          success: false,
          error: 'Parâmetros inicio e fim devem ser enviados juntos.',
          code: 'VALIDATION_ERROR',
        },
        400,
      );
    }

    if (hasRange) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(inicio!) || !dateRegex.test(fim!)) {
        return c.json(
          {
            success: false,
            error: 'Parâmetros inicio/fim inválidos. Use o formato YYYY-MM-DD.',
            code: 'VALIDATION_ERROR',
          },
          400,
        );
      }
      if (inicio! > fim!) {
        return c.json(
          {
            success: false,
            error: 'Parâmetro inicio não pode ser maior que fim.',
            code: 'VALIDATION_ERROR',
          },
          400,
        );
      }
    }

    const rows = await c.env.DB.prepare(
      `SELECT
          fj.id,
          fj.jornada_id,
          fj.processado_com_bug,
          j.data as data_apresentacao,
          j.data as data_liberacao,
          fj.effectiveness_pct,
          fj.effectiveness_nivel,
          fj.effectiveness_componentes_json,
          fj.tempo_abaixo_limiar_min,
          fj.total_fatorizado_jornada,
          fj.fator_basica_pct,
          fj.fator_repouso_pct,
          fj.fator_noturno_dep_pct,
          fj.fator_noturno_arr_pct,
          fj.fator_hv_quantidade_pct,
          fj.fator_apresentacao_pct,
          fj.fator_ciclo_embarcado_pct,
          fj.hora_despertar_estimada,
          fj.hora_inicio_sono_estimado,
          fj.duracao_sono_efetiva_min,
          fj.dia_periodo_embarcado,
          fj.total_dias_periodo
       FROM frms_fatorizacao_jornada fj
       JOIN frms_jornada j ON j.id = fj.jornada_id AND j.deleted_at IS NULL
       JOIN funcionarios p ON p.id = CAST(j.tripulante_id AS INTEGER)
       WHERE j.tripulante_id = ?
         AND p.empresa_id = ?
         AND p.deleted_at IS NULL
         AND COALESCE(p.ativo, 1) = 1
         AND UPPER(COALESCE(NULLIF(TRIM(p.status), ''), 'ATIVO')) = 'ATIVO'
         AND fj.deleted_at IS NULL
         AND (
           (? = 1 AND j.data >= ? AND j.data <= ?)
           OR
           (? = 0 AND j.data >= date('now', '-' || ? || ' days'))
         )
       ORDER BY j.data ASC
       LIMIT 365`,
    )
      .bind(tripulanteId, empresaId, hasRange ? 1 : 0, inicio, fim, hasRange ? 1 : 0, dias)
      .all();

    return c.json({ success: true, data: rows.results ?? [] });
  }),
);

/**
 * GET /api/frms/tripulante/:id/explicacao-dia?data=YYYY-MM-DD
 * Explicação determinística + copiloto didático opcional para um dia específico.
 */
frmsRoutes.get(
  '/tripulante/:id/explicacao-dia',
  safe(async (c) => {
    const tripulanteId = c.req.param('id') ?? '';
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;

    const data = c.req.query('data') ?? '';
    const origemTela = normalizeFrmsExplanationOrigin(c.req.query('origem'));
    const forceRefreshCache = parseBooleanLike(c.req.query('force') ?? c.req.query('refresh'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return c.json(
        {
          success: false,
          error: 'Parâmetro data inválido. Use o formato YYYY-MM-DD.',
          code: 'VALIDATION_ERROR',
        },
        400,
      );
    }

    const empresaId = getEmpresaIdSafe(c);
    const aiEnabled = isFrmsDayExplanationAiEnabled(c.env);
    if (!forceRefreshCache) {
      const cached = await getCachedFrmsDayExplanation(c.env, {
        empresaId,
        tripulanteId,
        dataRef: data,
        origemTela,
      });
      if (cached && (!aiEnabled || cached.copiloto.provider === 'cloudflare-workers-ai')) {
        return c.json({ success: true, data: cached });
      }
    }

    const row = await c.env.DB.prepare(
      `SELECT
          j.tripulante_id,
          p.nome as tripulante_nome,
          p.cargo as tripulante_cargo,
          j.data as data_apresentacao,
          j.hora_apresentacao,
          j.hora_acordou,
          j.fonte_sono,
          fj.processado_com_bug,
          fj.effectiveness_pct,
          fj.effectiveness_nivel,
          fj.effectiveness_componentes_json,
          fj.fator_basica_pct,
          fj.tempo_abaixo_limiar_min,
          fj.hora_despertar_estimada,
          fj.hora_inicio_sono_estimado,
          fj.duracao_sono_efetiva_min,
          fj.dia_periodo_embarcado,
          fj.total_dias_periodo
       FROM frms_fatorizacao_jornada fj
       JOIN frms_jornada j ON j.id = fj.jornada_id AND j.deleted_at IS NULL
       JOIN funcionarios p ON p.id = CAST(j.tripulante_id AS INTEGER)
       WHERE j.tripulante_id = ?
         AND p.empresa_id = ?
         AND p.deleted_at IS NULL
         AND COALESCE(p.ativo, 1) = 1
         AND UPPER(COALESCE(NULLIF(TRIM(p.status), ''), 'ATIVO')) = 'ATIVO'
         AND fj.deleted_at IS NULL
         AND j.data = ?
       ORDER BY j.data DESC
       LIMIT 1`,
    )
      .bind(tripulanteId, empresaId, data)
      .first<Record<string, unknown>>();

    if (!row) {
      return c.json(
        {
          success: false,
          error: 'Nenhuma jornada encontrada para o dia solicitado.',
          code: 'FRMS_DAY_NOT_FOUND',
        },
        404,
      );
    }

    const [checkinRow, recalcEvent, worst7d, worst28d] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id, wake_time, report_source
         FROM frms_fadiga_checkin
         WHERE empresa_id = ?
           AND funcionario_id = ?
           AND data_checkin = ?
           AND deleted_at IS NULL
         LIMIT 1`,
      )
        .bind(empresaId, Number(tripulanteId), data)
        .first<{ id: string; wake_time: string | null; report_source: string | null }>()
        .catch(() => null),
      c.env.DB.prepare(
        `SELECT 1 AS has_pending
         FROM frms_fadiga_evento e
         JOIN frms_fadiga_checkin c ON c.id = e.checkin_id
         WHERE c.empresa_id = ?
           AND c.funcionario_id = ?
           AND c.data_checkin = ?
           AND c.deleted_at IS NULL
           AND e.empresa_id = ?
           AND e.tipo = 'FRMS_RECALCULO_NECESSARIO'
         LIMIT 1`,
      )
        .bind(empresaId, Number(tripulanteId), data, empresaId)
        .first<{ has_pending: number }>()
        .catch(() => null),
      findWorstEffectivenessInWindow(c.env, {
        tripulanteId,
        empresaId,
        data,
        days: 7,
      }),
      findWorstEffectivenessInWindow(c.env, {
        tripulanteId,
        empresaId,
        data,
        days: 28,
      }),
    ]);

    const wakeTimeSource = normalizeHora(row.hora_acordou as string | null | undefined)
      ? 'crew_reported'
      : normalizeHora(row.hora_despertar_estimada as string | null | undefined)
        ? 'fallback_apresentacao_minus_config'
        : normalizeHora(checkinRow?.wake_time)
          ? 'crew_reported'
          : null;
    const sourceByCheckin =
      checkinRow != null
        ? ({
            dataSource: 'crew_reported',
            confidence: 'reported',
          } as const)
        : ({
            dataSource: 'default_estimate',
            confidence: 'reduced',
          } as const);
    const traceLimitations: string[] = [];
    if (!checkinRow) {
      traceLimitations.push('Sem check-in diário para a data selecionada; usando estimativa operacional.');
    }
    if (!row.hora_apresentacao) {
      traceLimitations.push('Sem hora de apresentação na jornada; minutos acordado antes da apresentação não disponíveis.');
    }
    if (!worst7d.available) {
      traceLimitations.push('Janela de 7 dias indisponível para determinar pior dia.');
    }
    if (!worst28d.available) {
      traceLimitations.push('Janela de 28 dias indisponível para determinar pior dia.');
    }
    if (Number(row.processado_com_bug ?? 0) === 1) {
      traceLimitations.push('Registro marcado como legado pré-C2; considerar reprocessamento histórico em fase separada.');
    }

    if (!empresaId) {
      return c.json(
        { success: false, error: 'Tenant context ausente.', code: 'FRMS_CONTEXT_UNAVAILABLE' },
        403,
      );
    }
    const operationalContext = await resolveFrmsOperationalContext(c.env.DB, {
      empresaId,
      referenceAt: data,
      funcionarioId: Number(tripulanteId),
    });
    const limites = operationalContext.parameters;
    const diasCriticosConsecutivos = await countDiasCriticosConsecutivos(
      c.env,
      tripulanteId,
      empresaId,
      data,
      limites,
    );
    const explanation = await buildFrmsDayExplanation(
      c.env,
      {
        ...row,
        dias_criticos_consecutivos: diasCriticosConsecutivos,
      },
      limites,
      {
        dataSource: sourceByCheckin.dataSource,
        confidence: sourceByCheckin.confidence,
        wakeTimeSource,
        recalculationPending: Boolean(recalcEvent?.has_pending) || !Boolean(row.hora_apresentacao),
        windows: {
          sevenDays: worst7d,
          twentyEightDays: worst28d,
        },
        limitations: traceLimitations,
      },
    );

    try {
      await upsertFrmsDayExplanationCache(c.env, {
        empresaId,
        tripulanteId,
        dataRef: data,
        origemTela,
        payload: explanation,
        ttlSeconds: explanation.copiloto.provider === 'cloudflare-workers-ai' ? 6 * 3600 : 2 * 60,
      });
    } catch {
      // Falha de cache não deve bloquear resposta.
    }

    try {
      const userId = Number(c.get('userId') || 0);
      const userAgent = c.req.header('user-agent') ?? null;
      const ipAddress = c.req.header('CF-Connecting-IP') ?? c.req.header('x-forwarded-for') ?? null;

      await c.env.DB.prepare(
        `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_novos, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      )
        .bind(
          'frms_explicacao_dia',
          'VIEW_EXPLICACAO_DIA',
          `${tripulanteId}:${data}`,
          JSON.stringify({
            tripulante_id: Number(tripulanteId),
            data,
            origem_tela: origemTela,
            user_id: userId || null,
            user_agent: userAgent,
            ip_address: ipAddress,
            faixa: explanation.diagnostico.faixa,
            effectiveness_pct: explanation.jornada.effectiveness_pct,
            provider: explanation.copiloto.provider,
            model: explanation.copiloto.model,
          }),
        )
        .run();
    } catch {
      // Não bloquear explicação por falha de telemetria.
    }

    return c.json({ success: true, data: explanation });
  }),
);

/**
 * GET /api/frms/comparar-dias/:tripulanteId?data_a=YYYY-MM-DD&data_b=YYYY-MM-DD
 * Compara dois dias de um mesmo tripulante com base no payload de explicação diária.
 */
frmsRoutes.get(
  '/comparar-dias/:tripulanteId',
  safe(async (c) => {
    const tripulanteId = c.req.param('tripulanteId') ?? '';
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;

    const dataA = c.req.query('data_a') ?? '';
    const dataB = c.req.query('data_b') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataA) || !/^\d{4}-\d{2}-\d{2}$/.test(dataB)) {
      return c.json(
        {
          success: false,
          error: 'Parâmetros data_a e data_b são obrigatórios no formato YYYY-MM-DD.',
          code: 'VALIDATION_ERROR',
        },
        400,
      );
    }

    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      return c.json(
        { success: false, error: 'Tenant context ausente.', code: 'FRMS_CONTEXT_UNAVAILABLE' },
        403,
      );
    }
    const operationalContext = await resolveFrmsOperationalContext(c.env.DB, {
      empresaId,
      referenceAt: dataB > dataA ? dataB : dataA,
      funcionarioId: Number(tripulanteId),
    });
    const limites = operationalContext.parameters;

    const fetchDay = async (data: string) => {
      const row = await c.env.DB.prepare(
        `SELECT
            j.tripulante_id,
            p.nome as tripulante_nome,
            p.cargo as tripulante_cargo,
            j.data as data_apresentacao,
            j.hora_apresentacao,
            j.hora_acordou,
            j.fonte_sono,
            fj.processado_com_bug,
            fj.effectiveness_pct,
            fj.effectiveness_nivel,
            fj.effectiveness_componentes_json,
            fj.tempo_abaixo_limiar_min,
            fj.hora_despertar_estimada,
            fj.hora_inicio_sono_estimado,
            fj.duracao_sono_efetiva_min,
            fj.dia_periodo_embarcado,
            fj.total_dias_periodo
         FROM frms_fatorizacao_jornada fj
         JOIN frms_jornada j ON j.id = fj.jornada_id AND j.deleted_at IS NULL
         JOIN funcionarios p ON p.id = CAST(j.tripulante_id AS INTEGER)
         WHERE j.tripulante_id = ?
           AND p.empresa_id = ?
           AND p.deleted_at IS NULL
           AND COALESCE(p.ativo, 1) = 1
           AND UPPER(COALESCE(NULLIF(TRIM(p.status), ''), 'ATIVO')) = 'ATIVO'
           AND fj.deleted_at IS NULL
           AND j.data = ?
         LIMIT 1`,
      )
        .bind(tripulanteId, empresaId, data)
        .first<Record<string, unknown>>();

      if (!row) return null;

      const diasCriticosConsecutivos = await countDiasCriticosConsecutivos(
        c.env,
        tripulanteId,
        empresaId,
        data,
        limites,
      );

      return buildFrmsDayExplanation(
        c.env,
        { ...row, dias_criticos_consecutivos: diasCriticosConsecutivos },
        limites,
      );
    };

    const [expA, expB] = await Promise.all([fetchDay(dataA), fetchDay(dataB)]);
    if (!expA || !expB) {
      const erros: Record<string, string> = {};
      if (!expA) erros.dia_a = `Sem jornada para ${dataA}`;
      if (!expB) erros.dia_b = `Sem jornada para ${dataB}`;
      return c.json(
        {
          success: false,
          error: 'Não foi possível comparar: um ou mais dias não possuem jornada processada.',
          code: 'FRMS_COMPARE_DAY_NOT_FOUND',
          data: { erros },
        },
        404,
      );
    }

    const diaA = toComparisonDay(expA);
    const diaB = toComparisonDay(expB);
    const pctA = diaA.effectiveness_pct ?? 0;
    const pctB = diaB.effectiveness_pct ?? 0;
    const diferencaPts = roundOne(pctB - pctA);

    const fatoresPioraram: string[] = [];
    const fatoresMelhoraram: string[] = [];

    for (const fatorA of diaA.fatores) {
      const fatorB = diaB.fatores.find((item) => item.codigo === fatorA.codigo);
      if (!fatorB) continue;
      const delta = roundOne(fatorB.impacto_pts - fatorA.impacto_pts);
      if (delta < -0.1) fatoresPioraram.push(fatorA.codigo);
      if (delta > 0.1) fatoresMelhoraram.push(fatorA.codigo);
    }

    const analiseDelta =
      diferencaPts < 0
        ? `O dia B foi ${Math.abs(diferencaPts).toFixed(1)} pts pior que o dia A.`
        : diferencaPts > 0
          ? `O dia B foi ${Math.abs(diferencaPts).toFixed(1)} pts melhor que o dia A.`
          : 'Os dois dias ficaram com efetividade equivalente.';

    await registrarAuditoriaFrmsAcao(c, {
      acao: 'FRMS_COMPARACAO_DIAS',
      tripulante_id: tripulanteId,
      data_jornada: dataB,
      origem_tela:
        normalizeFrmsExplanationOrigin(c.req.query('origem')) === 'ficha' ? 'ficha' : 'dashboard',
      extra: { data_a: dataA, data_b: dataB, diferenca_pts: diferencaPts },
    });

    return c.json({
      success: true,
      data: {
        dia_a: diaA,
        dia_b: diaB,
        diferenca_pts: diferencaPts,
        fatores_pioraram: fatoresPioraram,
        fatores_melhoraram: fatoresMelhoraram,
        analise_delta: analiseDelta,
      },
    });
  }),
);

/**
 * POST /api/frms/simular-cenario/:tripulanteId/:data
 * Simula impacto de ajustes de horário/sono sem persistir no banco.
 */
frmsRoutes.post(
  '/simular-cenario/:tripulanteId/:data',
  safe(async (c) => {
    const tripulanteId = c.req.param('tripulanteId') ?? '';
    const data = c.req.param('data') ?? '';
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return c.json(
        { success: false, error: 'Parâmetro data inválido.', code: 'VALIDATION_ERROR' },
        400,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = frmsSimularCenarioSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.flatten(), code: 'VALIDATION_ERROR' },
        400,
      );
    }

    const empresaId = getEmpresaIdSafe(c);
    const row = await c.env.DB.prepare(
      `SELECT
          j.*,
          f.effectiveness_pct,
          f.effectiveness_nivel,
          f.effectiveness_componentes_json,
          f.tempo_abaixo_limiar_min,
          f.dia_periodo_embarcado,
          f.total_dias_periodo
       FROM frms_jornada j
       JOIN funcionarios p ON p.id = CAST(j.tripulante_id AS INTEGER)
       LEFT JOIN frms_fatorizacao_jornada f ON f.jornada_id = j.id AND f.deleted_at IS NULL
       WHERE j.tripulante_id = ?
         AND j.data = ?
         AND j.deleted_at IS NULL
         AND p.empresa_id = ?
         AND p.deleted_at IS NULL
       LIMIT 1`,
    )
      .bind(tripulanteId, data, empresaId)
      .first<Record<string, unknown>>();

    if (!row) {
      return c.json(
        { success: false, error: 'Jornada não encontrada para simulação.', code: 'NOT_FOUND' },
        404,
      );
    }

    const limites = (await carregarLimites(c.env.DB)) as LimitesMap;
    const horaApresentacaoReal = normalizeHora(row.hora_apresentacao as string | null | undefined);
    const horaAcordouReal = normalizeHora(row.hora_acordou as string | null | undefined);
    const sonoEfetivoReal =
      row.sono_efetivo_min == null ? null : Number(row.sono_efetivo_min as number);

    const horaApresentacaoSimulada =
      parsed.data.hora_apresentacao_simulada ?? horaApresentacaoReal ?? null;
    const horaAcordouSimulada = parsed.data.hora_acordou_simulada ?? horaAcordouReal ?? null;
    const sonoEfetivoSimuladoMin = parsed.data.sono_efetivo_simulado_min ?? sonoEfetivoReal ?? 480;

    let horaDormiuSimulada: string | null = normalizeHora(
      row.hora_dormiu as string | null | undefined,
    );
    if (horaAcordouSimulada) {
      horaDormiuSimulada = minutesToHhmm(
        hhmmToMinutes(horaAcordouSimulada) - Math.max(0, Math.round(sonoEfetivoSimuladoMin)),
      );
    }

    const jornadaSimulada: FrmsJornada = {
      ...(row as unknown as FrmsJornada),
      tripulante_id: Number(row.tripulante_id),
      hora_apresentacao: horaApresentacaoSimulada,
      hora_dormiu: horaDormiuSimulada,
      duracao_jornada_minutos: calcDuracaoJornada({
        ...(row as unknown as FrmsJornada),
        tripulante_id: Number(row.tripulante_id),
        hora_apresentacao: horaApresentacaoSimulada,
      }),
    };

    const [ano, mes] = data.split('-').map(Number);
    const fatorizacaoSimulada = calcFatorizacao({
      jornada: jornadaSimulada,
      repousoAnteriorMin:
        row.repouso_regulatorio_min == null ? null : Number(row.repouso_regulatorio_min),
      limites,
      diasDoMes: diasNoMes(ano, mes),
      diaDoCiclo:
        row.dia_periodo_embarcado == null ? null : Number(row.dia_periodo_embarcado as number),
    });

    const effectSimulado = calcEffectiveness(fatorizacaoSimulada, limites, {
      hora_apresentacao: jornadaSimulada.hora_apresentacao,
      hora_primeira_decolagem: jornadaSimulada.hora_primeira_decolagem,
      hora_ultimo_pouso: jornadaSimulada.hora_ultimo_pouso,
      hora_corte_motor: jornadaSimulada.hora_corte_motor,
      hora_termino: jornadaSimulada.hora_termino,
      hora_dormiu: jornadaSimulada.hora_dormiu ?? null,
      dia_periodo_embarcado:
        row.dia_periodo_embarcado == null ? null : Number(row.dia_periodo_embarcado as number),
      total_dias_periodo:
        row.total_dias_periodo == null ? null : Number(row.total_dias_periodo as number),
    });

    const componentesReais = parseEffectivenessComponents(
      typeof row.effectiveness_componentes_json === 'string'
        ? row.effectiveness_componentes_json
        : null,
    );
    const realPct = row.effectiveness_pct == null ? null : Number(row.effectiveness_pct);
    const diferencaPts = roundOne((effectSimulado.effectiveness_pct ?? 0) - (realPct ?? 0));
    const conclusao =
      diferencaPts >= 0
        ? `Com apresentação às ${horaApresentacaoSimulada || '--:--'}, a efetividade subiria ${Math.abs(diferencaPts).toFixed(1)} pts.`
        : `Com apresentação às ${horaApresentacaoSimulada || '--:--'}, a efetividade cairia ${Math.abs(diferencaPts).toFixed(1)} pts.`;

    await registrarAuditoriaFrmsAcao(c, {
      acao: 'FRMS_CENARIO_SIMULADO',
      tripulante_id: tripulanteId,
      data_jornada: data,
      origem_tela: parsed.data.origem_tela,
      extra: {
        hora_apresentacao_simulada: parsed.data.hora_apresentacao_simulada,
        hora_acordou_simulada: parsed.data.hora_acordou_simulada,
        sono_efetivo_simulado_min: parsed.data.sono_efetivo_simulado_min,
        diferenca_pts: diferencaPts,
      },
    });

    return c.json({
      success: true,
      data: {
        is_simulacao: true,
        parametros_simulados: {
          hora_apresentacao_simulada: horaApresentacaoSimulada,
          hora_acordou_simulada: horaAcordouSimulada,
          sono_efetivo_simulado_min: Math.round(sonoEfetivoSimuladoMin),
        },
        resultado_real: {
          effectiveness_pct: realPct,
          nivel: typeof row.effectiveness_nivel === 'string' ? row.effectiveness_nivel : null,
          fatores: {
            processo_s: Number(componentesReais.processo_s ?? 0),
            processo_c: Number(componentesReais.processo_c ?? 0),
            repouso: Number(componentesReais.repouso ?? 0),
            hv: Number(componentesReais.hv ?? 0),
            duracao: Number(componentesReais.duracao ?? 0),
          },
        },
        resultado_simulado: {
          effectiveness_pct: effectSimulado.effectiveness_pct,
          nivel: effectSimulado.nivel,
          fatores: effectSimulado.componentes,
        },
        diferenca_pts: diferencaPts,
        conclusao,
      },
    });
  }),
);

/**
 * POST /api/frms/justificativas/:tripulanteId/:data
 * Gera documento operacional auditável (com assinatura hash) para decisão FRMS.
 */
frmsRoutes.post(
  '/justificativas/:tripulanteId/:data',
  safe(async (c) => {
    const tripulanteId = c.req.param('tripulanteId') ?? '';
    const data = c.req.param('data') ?? '';
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;

    const role = normalizeRole(c.get('userRole'));
    if (!canGenerateJustificativa(role)) {
      return c.json(
        { success: false, error: 'Sem permissão para gerar justificativa.', code: 'FORBIDDEN' },
        403,
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return c.json(
        { success: false, error: 'Parâmetro data inválido.', code: 'VALIDATION_ERROR' },
        400,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = frmsJustificativaSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.flatten(), code: 'VALIDATION_ERROR' },
        400,
      );
    }

    const empresaId = getEmpresaIdSafe(c);
    const tripulante = await c.env.DB.prepare(
      `SELECT id, nome, matricula
         FROM funcionarios
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
      .bind(Number(tripulanteId), empresaId)
      .first<{ id: number; nome: string; matricula: string | null }>();

    if (!tripulante) {
      return c.json(
        { success: false, error: 'Tripulante não encontrado.', code: 'NOT_FOUND' },
        404,
      );
    }

    const row = await c.env.DB.prepare(
      `SELECT
          j.tripulante_id,
          p.nome as tripulante_nome,
          p.cargo as tripulante_cargo,
          j.data as data_apresentacao,
          j.hora_apresentacao,
          j.hora_acordou,
          j.fonte_sono,
          fj.processado_com_bug,
          fj.effectiveness_pct,
          fj.effectiveness_nivel,
          fj.effectiveness_componentes_json,
          fj.tempo_abaixo_limiar_min,
          fj.hora_despertar_estimada,
          fj.hora_inicio_sono_estimado,
          fj.duracao_sono_efetiva_min,
          fj.dia_periodo_embarcado,
          fj.total_dias_periodo
       FROM frms_fatorizacao_jornada fj
       JOIN frms_jornada j ON j.id = fj.jornada_id AND j.deleted_at IS NULL
       JOIN funcionarios p ON p.id = CAST(j.tripulante_id AS INTEGER)
       WHERE j.tripulante_id = ?
         AND p.empresa_id = ?
         AND fj.deleted_at IS NULL
         AND j.data = ?
       LIMIT 1`,
    )
      .bind(tripulanteId, empresaId, data)
      .first<Record<string, unknown>>();

    if (!row) {
      return c.json(
        { success: false, error: 'Não há jornada processada para este dia.', code: 'NOT_FOUND' },
        404,
      );
    }

    if (!empresaId) {
      return c.json(
        { success: false, error: 'Tenant context ausente.', code: 'FRMS_CONTEXT_UNAVAILABLE' },
        403,
      );
    }
    const operationalContext = await resolveFrmsOperationalContext(c.env.DB, {
      empresaId,
      referenceAt: data,
      funcionarioId: Number(tripulanteId),
    });
    const limites = operationalContext.parameters;
    const diasCriticosConsecutivos = await countDiasCriticosConsecutivos(
      c.env,
      tripulanteId,
      empresaId,
      data,
      limites,
    );
    const explanation = await buildFrmsDayExplanation(
      c.env,
      { ...row, dias_criticos_consecutivos: diasCriticosConsecutivos },
      limites,
    );

    const geradoPorId = String(c.get('userId') || '0');
    const geradoPorNome = String(c.get('userEmail') || `Usuário ${geradoPorId}`);
    const recomendacaoSistema =
      explanation.diagnostico.recomendacoes[0]?.descricao ||
      explanation.diagnostico.resumo_executivo;

    const documentoBase = {
      tripulante: {
        id: String(tripulante.id),
        nome: tripulante.nome,
        matricula: tripulante.matricula,
      },
      data_voo: data,
      effectiveness_real: explanation.jornada.effectiveness_pct,
      nivel_fadiga: explanation.jornada.effectiveness_nivel || explanation.diagnostico.faixa,
      fatores_determinantes: explanation.diagnostico.fatores
        .filter((f) => f.direcao === 'penaliza')
        .slice(0, 3)
        .map((f) => f.titulo),
      decisao_tomada: parsed.data.decisao_tomada,
      fundamentacao: 'RBAC 135 Art. X — Gerenciamento de Fadiga',
      recomendacao_sistema: recomendacaoSistema,
      observacoes: parsed.data.observacoes || '',
      gerado_por: { id: geradoPorId, nome: geradoPorNome, role },
      gerado_em: new Date().toISOString(),
    };

    let textoFormal =
      `JUSTIFICATIVA OPERACIONAL FRMS\n` +
      `Tripulante: ${documentoBase.tripulante.nome} (${documentoBase.tripulante.matricula || 'sem matrícula'})\n` +
      `Data: ${documentoBase.data_voo}\n` +
      `Efetividade: ${documentoBase.effectiveness_real ?? 'sem dado'}%\n` +
      `Nível de fadiga: ${documentoBase.nivel_fadiga}\n` +
      `Decisão tomada: ${documentoBase.decisao_tomada}\n` +
      `Fundamentação: ${documentoBase.fundamentacao}\n` +
      `Recomendação do sistema: ${documentoBase.recomendacao_sistema}\n` +
      `Observações: ${documentoBase.observacoes || 'Nenhuma.'}`;

    if (c.env.AI) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aiResult = (await (c.env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            {
              role: 'system',
              content:
                'Reescreva em português formal, objetivo e auditável, sem inventar dados. Não use markdown.',
            },
            {
              role: 'user',
              content: `Documento base:\n${JSON.stringify(documentoBase)}`,
            },
          ],
          max_tokens: 420,
        })) as { response?: string };

        if (aiResult?.response?.trim()) {
          textoFormal = sanitizeCopilotoTexto(aiResult.response, textoFormal);
        }
      } catch {
        // fallback determinístico já montado.
      }
    }

    const documento = {
      ...documentoBase,
      texto_formal: textoFormal,
    };
    const assinaturaHash = await hashSha256Hex(JSON.stringify(documento));
    const justificativaId = crypto.randomUUID();

    await c.env.DB.prepare(
      `INSERT INTO frms_justificativas (
         id,
         tripulante_id,
         data_voo,
         empresa_id,
         gerado_por_id,
         gerado_por_nome,
         decisao_tomada,
         observacoes,
         documento_json,
         assinatura_hash,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
      .bind(
        justificativaId,
        String(tripulante.id),
        data,
        empresaId,
        geradoPorId,
        geradoPorNome,
        parsed.data.decisao_tomada,
        parsed.data.observacoes || null,
        JSON.stringify(documento),
        assinaturaHash,
      )
      .run();

    await registrarAuditoriaFrmsAcao(c, {
      acao: 'FRMS_JUSTIFICATIVA_GERADA',
      tripulante_id: tripulanteId,
      data_jornada: data,
      origem_tela: parsed.data.origem_tela,
      extra: { justificativa_id: justificativaId },
    });

    return c.json({
      success: true,
      data: {
        documento,
        assinatura_hash: assinaturaHash,
        justificativa_id: justificativaId,
      },
    });
  }),
);

/**
 * GET /api/frms/justificativas/:tripulanteId
 * Lista justificativas do tripulante dentro da empresa do usuário.
 */
frmsRoutes.get(
  '/justificativas/:tripulanteId',
  safe(async (c) => {
    const tripulanteId = c.req.param('tripulanteId') ?? '';
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;

    const empresaId = getEmpresaIdSafe(c);
    const rows = await c.env.DB.prepare(
      `SELECT
          id,
          data_voo,
          decisao_tomada,
          gerado_por_nome,
          created_at
       FROM frms_justificativas
       WHERE tripulante_id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL
       ORDER BY data_voo DESC, created_at DESC
       LIMIT 200`,
    )
      .bind(tripulanteId, empresaId)
      .all();

    return c.json({ success: true, data: rows.results ?? [] });
  }),
);

/**
 * GET /api/frms/acumulo-frota
 * Snapshot de todos os tripulantes
 */
frmsRoutes.get(
  '/acumulo-frota',
  safe(async (c) => {
    const mes = c.req.query('mes') ?? undefined;
    const periodo = Math.min(Math.max(Number(c.req.query('periodo') ?? '30'), 7), 365);
    const quinzenaParam = c.req.query('quinzena') ?? undefined;
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      return c.json(
        { success: false, error: 'Tenant context ausente.', code: 'FRMS_CONTEXT_UNAVAILABLE' },
        403,
      );
    }
    if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
      return c.json(
        {
          success: false,
          error: 'Parâmetro mes inválido. Use o formato YYYY-MM.',
          code: 'VALIDATION_ERROR',
        },
        400,
      );
    }
    if (quinzenaParam && quinzenaParam !== 'Q1' && quinzenaParam !== 'Q2') {
      return c.json(
        {
          success: false,
          error: 'Parametro quinzena invalido. Use Q1 ou Q2.',
          code: 'VALIDATION_ERROR',
        },
        400,
      );
    }
    const quinzena: 'Q1' | 'Q2' | undefined =
      quinzenaParam === 'Q1' || quinzenaParam === 'Q2' ? quinzenaParam : undefined;
    const sectorAccess = await getEmployeeSectorAccess(c, empresaId ?? 0);
    const sectorScope = buildFuncionarioScopeWhere(sectorAccess, 'p');
    const frota = await buscarAcumuloFrota(
      c.env.DB,
      mes,
      empresaId,
      periodo,
      quinzena,
      sectorScope,
    );
    return c.json({ success: true, data: frota });
  }),
);

// ════════════════════════════════════════════════════════
// ALERTAS
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/alertas
 * Query: ?tripulante_id= &nivel= &resolvido=false &data_inicio= &data_fim= &page= &limit=
 */
frmsRoutes.get(
  '/alertas',
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const filtro = {
      tripulante_id: c.req.query('tripulante_id') ?? undefined,
      nivel: (c.req.query('nivel') as (typeof NIVEIS_ALERTA)[number]) ?? undefined,
      resolvido:
        c.req.query('resolvido') !== undefined ? c.req.query('resolvido') === 'true' : undefined,
      data_inicio: c.req.query('data_inicio') ?? undefined,
      data_fim: c.req.query('data_fim') ?? undefined,
      page: c.req.query('page') ? parseInt(c.req.query('page')!) : undefined,
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined,
    };

    if (filtro.tripulante_id) {
      const denied = await assertTripulanteEmpresa(c, filtro.tripulante_id);
      if (denied) return denied;
    }

    const result = await buscarAlertas(c.env.DB, filtro, empresaId);
    return c.json({ success: true, data: result.alertas, total: result.total });
  }),
);

/**
 * GET /api/frms/alertas/count
 * Conta alertas não visualizados (para badge no menu)
 */
frmsRoutes.get(
  '/alertas/count',
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const row = await c.env.DB.prepare(
      `SELECT COUNT(*) as count
         FROM frms_alerta a
         JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
        WHERE a.visualizado = 0
          AND a.resolvido = 0
          AND a.deleted_at IS NULL
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
          AND (? IS NULL OR f.empresa_id = ?)`,
    )
      .bind(empresaId ?? null, empresaId ?? null)
      .first<{ count: number }>();
    return c.json({ success: true, data: { count: row?.count ?? 0 } });
  }),
);

/**
 * POST /api/frms/alertas/teste-email
 * Envio manual de teste do canal de alertas (apenas admin).
 */
frmsRoutes.post(
  '/alertas/teste-email',
  requireRole('admin'),
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const body = await c.req.json().catch(() => ({}));
    const parsed = alertaTesteEmailSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.flatten(), code: 'VALIDATION_ERROR' },
        400,
      );
    }

    const userId = Number(c.get('userId') || 0);
    const userEmail = String(c.get('userEmail') || 'admin@airtrust.com');
    const admin = await c.env.DB.prepare(
      `SELECT nome, email
         FROM usuarios
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
      .bind(userId)
      .first<{ nome: string | null; email: string | null }>();

    const empresa = await c.env.DB.prepare(
      `SELECT nome
         FROM empresas
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
      .bind(empresaId ?? null)
      .first<{ nome: string | null }>();

    const nomeAdmin = admin?.nome || userEmail;
    const emailAdmin = admin?.email || userEmail;
    const nomeEmpresa = empresa?.nome || `Empresa ${empresaId ?? 'N/A'}`;
    const timestampIso = new Date().toISOString();
    const corpo =
      'Este é um e-mail de teste do sistema de alertas AirTrust.\n' +
      'Se você está recebendo esta mensagem, o sistema de notificações está funcionando corretamente.\n\n' +
      `Enviado por: ${nomeAdmin} (${emailAdmin})\n` +
      `Data/hora: ${formatarDataHoraBrasilia()}\n` +
      `Empresa: ${nomeEmpresa}`;

    try {
      await enviarEmailAlert(
        c.env,
        parsed.data.destinatarios.map((item) => item.toLowerCase()),
        '[AirTrust] ✅ Teste de e-mail — sistema funcionando',
        corpo,
      );

      await registrarEventoSigvoosEmail(c.env.DB, empresaId ?? null, 'EMAIL_TESTE', 'SUCESSO', {
        destinatarios: parsed.data.destinatarios,
        executado_por: { user_id: userId, email: userEmail },
        timestamp: timestampIso,
      });

      return c.json({
        success: true,
        data: {
          destinatarios: parsed.data.destinatarios,
          timestamp: timestampIso,
        },
      });
    } catch (error) {
      const mensagemErro = error instanceof Error ? error.message : String(error ?? 'EMAIL_ERROR');
      await registrarEventoSigvoosEmail(
        c.env.DB,
        empresaId ?? null,
        'EMAIL_TESTE',
        'FALHA',
        {
          destinatarios: parsed.data.destinatarios,
          executado_por: { user_id: userId, email: userEmail },
          timestamp: timestampIso,
        },
        mensagemErro,
      );

      return c.json({ success: false, error: mensagemErro, code: 'EMAIL_TESTE_FAILED' }, 500);
    }
  }),
);

/**
 * POST /api/frms/alertas/enviar
 * Envio manual de alerta (admin/manager/gestor/operador).
 */
frmsRoutes.post(
  '/alertas/enviar',
  safe(async (c) => {
    const role = String(c.get('userRole') || '')
      .trim()
      .toUpperCase();
    const allowedRoles = new Set(['ADMIN', 'MANAGER', 'GESTOR', 'OPERADOR', 'OPERATOR']);
    if (!allowedRoles.has(role)) {
      return c.json(
        { success: false, error: 'Sem permissão para enviar alertas manuais.', code: 'FORBIDDEN' },
        403,
      );
    }

    const empresaId = getEmpresaIdSafe(c);
    const body = await c.req.json().catch(() => ({}));
    const parsed = alertaManualSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.flatten(), code: 'VALIDATION_ERROR' },
        400,
      );
    }

    let destinatarios = (parsed.data.destinatarios || []).map((item) => item.toLowerCase());
    if (destinatarios.length === 0) {
      const config = await getSigvoosConfig(c.env.DB, empresaId);
      if (config.notificar_falha_email) {
        destinatarios = [config.notificar_falha_email.trim().toLowerCase()];
      }
    }

    if (destinatarios.length === 0) {
      return c.json(
        {
          success: false,
          error:
            'Nenhum destinatário informado e notificar_falha_email não está configurado para a empresa.',
          code: 'NO_RECIPIENTS',
        },
        400,
      );
    }

    const meta = prioridadeMeta(parsed.data.prioridade);
    const assunto = `${meta.icone} [AirTrust] [${meta.label}] ${parsed.data.assunto}`;
    const timestampIso = new Date().toISOString();
    const corpo =
      `${meta.icone} Alerta manual AirTrust\n` +
      `Prioridade: ${meta.label}\n` +
      `Data/hora: ${formatarDataHoraBrasilia()}\n\n` +
      `${parsed.data.mensagem}`;

    try {
      await enviarEmailAlert(c.env, destinatarios, assunto, corpo);
      await registrarEventoSigvoosEmail(c.env.DB, empresaId ?? null, 'ALERTA_MANUAL', 'SUCESSO', {
        destinatarios,
        assunto: parsed.data.assunto,
        prioridade: parsed.data.prioridade,
        mensagem: parsed.data.mensagem,
        executado_por: {
          user_id: Number(c.get('userId') || 0),
          email: String(c.get('userEmail') || ''),
          role,
        },
        timestamp: timestampIso,
      });

      return c.json({
        success: true,
        data: {
          destinatarios,
          assunto,
          prioridade: parsed.data.prioridade,
          timestamp: timestampIso,
        },
      });
    } catch (error) {
      const mensagemErro = error instanceof Error ? error.message : String(error ?? 'EMAIL_ERROR');
      await registrarEventoSigvoosEmail(
        c.env.DB,
        empresaId ?? null,
        'ALERTA_MANUAL',
        'FALHA',
        {
          destinatarios,
          assunto: parsed.data.assunto,
          prioridade: parsed.data.prioridade,
          mensagem: parsed.data.mensagem,
          executado_por: {
            user_id: Number(c.get('userId') || 0),
            email: String(c.get('userEmail') || ''),
            role,
          },
          timestamp: timestampIso,
        },
        mensagemErro,
      );

      return c.json({ success: false, error: mensagemErro, code: 'ALERTA_MANUAL_FAILED' }, 500);
    }
  }),
);

/**
 * PUT /api/frms/alertas/:id/visualizar
 */
frmsRoutes.put(
  '/alertas/:id/visualizar',
  safe(async (c) => {
    const id = c.req.param('id') ?? '';
    const denied = await assertAlertaEmpresa(c, id);
    if (denied) return denied;

    const userId = String(c.get('userId') || 'system');
    await marcarAlertaVisualizado(c.env.DB, id, userId);
    return c.json({ success: true });
  }),
);

/**
 * PUT /api/frms/alertas/:id/resolver
 */
frmsRoutes.put(
  '/alertas/:id/resolver',
  safe(async (c) => {
    const id = c.req.param('id') ?? '';
    const denied = await assertAlertaEmpresa(c, id);
    if (denied) return denied;

    const userId = String(c.get('userId') || 'system');
    // Aceita corpo opcional com notas de resolução
    let notasResolucao: string | null = null;
    try {
      const body = await c.req.json();
      if (typeof body?.notas_resolucao === 'string') {
        notasResolucao = body.notas_resolucao || null;
      }
    } catch {
      // Corpo vazio é permitido — retrocompatível
    }
    await marcarAlertaResolvido(c.env.DB, id, userId, notasResolucao);
    return c.json({ success: true });
  }),
);

// ════════════════════════════════════════════════════════
// ESCALAS QUINZENAIS
// ════════════════════════════════════════════════════════

const escalaCreateSchema = z.object({
  tripulante_id: z.union([z.string(), z.number()]).transform(String),
  ano: z.number().int().min(2020),
  ciclo: z.number().int().min(1),
  data_inicio_embarque: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_fim_embarque: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_inicio_folga: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_fim_folga: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observacao: z.string().optional().nullable(),
});

const escalaUpdateSchema = escalaCreateSchema.partial().extend({
  status_ciclo: z.enum(['ATIVO', 'ENCERRADO', 'CANCELADO']).optional(),
});

/**
 * POST /api/frms/escalas
 */
frmsRoutes.post(
  '/escalas',
  safe(async (c) => {
    const body = await c.req.json();
    const parsed = escalaCreateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }
    const denied = await assertTripulanteEmpresa(c, String(parsed.data.tripulante_id));
    if (denied) return denied;

    let escala;
    try {
      escala = await salvarEscala(c.env.DB, parsed.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        return c.json(
          {
            success: false,
            error: 'Já existe uma escala para este tripulante neste ciclo.',
            code: 'DUPLICATE_ESCALA',
          },
          409,
        );
      }
      throw err;
    }
    await auditFrms(c, 'frms_escala', 'INSERT', escala?.id || 0, { depois: parsed.data });
    const tripId = String(parsed.data.tripulante_id);
    // reprocessarTripulanteCompleto's limites parameter is inert (recalcularPipeline self-resolves).
    c.executionCtx.waitUntil(
      reprocessarTripulanteCompleto(c.env.DB, Number(tripId), LIMITES_DEFAULT),
    );
    return c.json({ success: true, data: escala }, 201);
  }),
);

/**
 * GET /api/frms/escalas/:tripulante_id
 */
frmsRoutes.get(
  '/escalas/:tripulante_id',
  safe(async (c) => {
    const tripulanteId = c.req.param('tripulante_id') ?? '';
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;

    const escalas = await buscarEscalas(c.env.DB, tripulanteId);
    return c.json({ success: true, data: escalas });
  }),
);

/**
 * PUT /api/frms/escalas/:id
 */
frmsRoutes.put(
  '/escalas/:id',
  safe(async (c) => {
    const id = c.req.param('id') ?? '';
    const body = await c.req.json();
    const parsed = escalaUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }

    // SECURITY: Validar tenant via tripulante antes de permitir mutação
    const escalaExiste = await c.env.DB.prepare(
      'SELECT tripulante_id FROM frms_escala_quinzenal WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(id)
      .first<{ tripulante_id: string }>();
    if (!escalaExiste) {
      return c.json({ success: false, error: 'Escala não encontrada' }, 404);
    }
    const denied = await assertTripulanteEmpresa(c, escalaExiste.tripulante_id);
    if (denied) return denied;

    const escala = await atualizarEscala(c.env.DB, id, parsed.data);
    await auditFrms(c, 'frms_escala', 'UPDATE', id, { depois: parsed.data });
    // reprocessarTripulanteCompleto's limites parameter is inert (recalcularPipeline self-resolves).
    c.executionCtx.waitUntil(
      reprocessarTripulanteCompleto(c.env.DB, Number(escala.tripulante_id), LIMITES_DEFAULT),
    );
    return c.json({ success: true, data: escala });
  }),
);

/**
 * DELETE /api/frms/escalas/:id
 */
frmsRoutes.delete(
  '/escalas/:id',
  safe(async (c) => {
    const id = c.req.param('id') ?? '';
    // Look up tripulante_id before soft-deleting
    const escalaDel = await c.env.DB.prepare(
      'SELECT tripulante_id FROM frms_escala_quinzenal WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(id)
      .first<{ tripulante_id: string }>();

    if (!escalaDel) {
      return c.json({ success: false, error: 'Escala não encontrada' }, 404);
    }

    // SECURITY: Validar tenant via tripulante antes de permitir deleção
    const denied = await assertTripulanteEmpresa(c, escalaDel.tripulante_id);
    if (denied) return denied;

    await deletarEscala(c.env.DB, id);
    await auditFrms(c, 'frms_escala', 'DELETE', id);
    // reprocessarTripulanteCompleto's limites parameter is inert (recalcularPipeline self-resolves).
    c.executionCtx.waitUntil(
      reprocessarTripulanteCompleto(c.env.DB, Number(escalaDel.tripulante_id), LIMITES_DEFAULT),
    );
    return c.json({ success: true });
  }),
);

// ════════════════════════════════════════════════════════
// IMPORTAÇÃO
// ════════════════════════════════════════════════════════

/**
 * POST /api/frms/importacao/apus
 * Body: array de jornadas no formato APUS
 */
frmsRoutes.post(
  '/importacao/apus',
  rateLimiter({ maxRequests: 5, windowSeconds: 60, keyPrefix: 'frms-import-apus' }),
  safe(async (c) => {
    const body = await c.req.json();
    const arraySchema = z
      .array(jornadaCreateSchema)
      .max(500, 'Máximo 500 registros por importação');
    const parsed = arraySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }

    for (const item of parsed.data) {
      const denied = await assertTripulanteEmpresa(c, String(item.tripulante_id));
      if (denied) return denied;
    }

    // importarApus resolves governed context per row internally; this param is inert.
    const userId = await resolveFuncionarioId(c);
    const items = parsed.data.map((j) => ({
      ...j,
      registrado_por: userId,
      origem: 'APUS' as const,
    }));
    const result = await importarApus(c.env.DB, items, LIMITES_DEFAULT);
    return c.json({ success: true, data: result });
  }),
);

/**
 * POST /api/frms/importacao/simulador
 * Body: { sessao_simulador_id, tripulante_id, data, duracao_minutos }
 */
frmsRoutes.post(
  '/importacao/simulador',
  rateLimiter({ maxRequests: 30, windowSeconds: 60, keyPrefix: 'frms-import-sim' }),
  safe(async (c) => {
    const body = await c.req.json();
    const schema = z.object({
      sessao_simulador_id: z.string(),
      tripulante_id: z.union([z.string(), z.number()]).transform(String),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      duracao_minutos: z.number().int().min(0),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }

    const denied = await assertTripulanteEmpresa(c, String(parsed.data.tripulante_id));
    if (denied) return denied;

    // importarSimulador -> salvarJornada self-resolves governed context; this param is inert.
    const userId = await resolveFuncionarioId(c);
    const result = await importarSimulador(c.env.DB, parsed.data, LIMITES_DEFAULT, userId);
    return c.json({ success: true, data: result }, 201);
  }),
);

// ════════════════════════════════════════════════════════
// VALIDAÇÃO DE ESCALA FUTURA
// ════════════════════════════════════════════════════════

/**
 * POST /api/frms/validar-escala
 * Simula jornadas futuras e verifica violações projetadas
 */
frmsRoutes.post(
  '/validar-escala',
  safe(async (c) => {
    const body = await c.req.json();
    const schema = z.object({
      tripulante_id: z.union([z.string(), z.number()]).transform(String),
      periodos: z.array(
        z.object({
          data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          status: z.enum(['ES', 'TS', 'TV', 'EX', 'RE', 'SA', 'FE', 'FR', 'FS', 'AM', 'DM', 'OT']),
          duracao_estimada_min: z.number().int().min(0),
          hv_estimada_min: z.number().int().min(0),
          hora_apresentacao_estimada: z
            .string()
            .regex(/^\d{2}:\d{2}$/)
            .optional()
            .nullable(),
          hora_termino_estimada: z
            .string()
            .regex(/^\d{2}:\d{2}$/)
            .optional()
            .nullable(),
        }),
      ),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }

    const denied = await assertTripulanteEmpresa(c, String(parsed.data.tripulante_id));
    if (denied) return denied;

    const empresaIdEscala = getEmpresaIdSafe(c);
    if (!empresaIdEscala) {
      return c.json(
        { success: false, error: 'Tenant context ausente.', code: 'FRMS_CONTEXT_UNAVAILABLE' },
        403,
      );
    }
    const operationalContextEscala = await resolveFrmsOperationalContext(c.env.DB, {
      empresaId: empresaIdEscala,
      referenceAt: new Date().toISOString().slice(0, 10),
      funcionarioId: Number(parsed.data.tripulante_id),
    });
    const limites = asOperationalLimitesMap(operationalContextEscala.parameters);

    // Buscar histórico existente do tripulante (365 dias)
    const dataInicio = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const historico = await c.env.DB.prepare(
      `SELECT ${FRMS_JORNADA_SELECT_COLUMNS}
         FROM frms_jornada
        WHERE tripulante_id = ?
          AND data >= ?
          AND deleted_at IS NULL
        ORDER BY data ASC`,
    )
      .bind(parsed.data.tripulante_id, dataInicio)
      .all();

    const result = validarEscalaFutura(
      parsed.data.periodos,
      (historico.results || []) as Parameters<typeof validarEscalaFutura>[1],
      limites,
    );

    return c.json({ success: true, data: result });
  }),
);

// --- Relatórios, Configurações e Notificações ---
frmsRoutes.route('/', frmsRelatoriosConfig);

// --- FIRA importação + Heatmap/Timeline ---
frmsRoutes.route('/', firaRoutes);

// --- Fadiga Acumulada Legal (PRC-OPS-012) ---
frmsRoutes.route('/', fadigaAcumulada);

export default frmsRoutes;
